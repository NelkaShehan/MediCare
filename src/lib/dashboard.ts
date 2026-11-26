import "server-only";

import { and, eq, gte, inArray, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { indents, stockOuts, stvs, transferRequests } from "@/db/schema";
import { getStockRows, getVelocity, recentActivity, scopedLocationIds } from "@/lib/inventory";
import { listStvs } from "@/lib/orders";
import { expirySummary } from "@/lib/alerts";
import type { SessionUser } from "@/lib/shared";

async function countRows(table: "indents" | "transfers", user: SessionUser, status: string) {
  if (table === "indents") {
    const scope =
      user.role === "central_admin" || user.role === "warehouse_staff"
        ? eq(indents.status, status)
        : and(eq(indents.status, status), eq(indents.branchId, user.locationId ?? -1));
    const [row] = await db.select({ count: sql<number>`count(*)`.mapWith(Number) }).from(indents).where(scope);
    return Number(row?.count ?? 0);
  }
  const scope =
    user.role === "central_admin"
      ? eq(transferRequests.status, status)
      : and(
          eq(transferRequests.status, status),
          or(eq(transferRequests.fromLocationId, user.locationId ?? -1), eq(transferRequests.toLocationId, user.locationId ?? -1)),
        );
  const [row] = await db.select({ count: sql<number>`count(*)`.mapWith(Number) }).from(transferRequests).where(scope);
  return Number(row?.count ?? 0);
}

export async function loadDashboard(user: SessionUser) {
  const scope = scopedLocationIds(user);

  const [stock, velocity, expiry] = await Promise.all([
    getStockRows({ locationIds: scope }),
    getVelocity(scope),
    expirySummary(scope),
  ]);

  const since = new Date(Date.now() - 13 * 86_400_000);
  since.setHours(0, 0, 0, 0);
  const trendWhere = scope
    ? and(gte(stockOuts.createdAt, since), inArray(stockOuts.locationId, scope))
    : gte(stockOuts.createdAt, since);

  const trendRows = await db
    .select({
      day: sql<string>`to_char(${stockOuts.createdAt}, 'YYYY-MM-DD')`,
      units: sql<number>`sum(${stockOuts.quantity})`.mapWith(Number),
    })
    .from(stockOuts)
    .where(trendWhere)
    .groupBy(sql`1`)
    .orderBy(sql`1`);

  const trendMap = new Map(trendRows.map((r) => [r.day, Number(r.units)]));
  const dispensingTrend = Array.from({ length: 14 }).map((_, index) => {
    const d = new Date(Date.now() - (13 - index) * 86_400_000);
    const key = d.toISOString().slice(0, 10);
    return { date: key, label: d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }), units: trendMap.get(key) ?? 0 };
  });

  const stvWhere = scope
    ? or(inArray(stvs.sourceLocationId, scope), inArray(stvs.destinationLocationId, scope))
    : undefined;
  const pipelineRows = await db
    .select({ status: stvs.status, count: sql<number>`count(*)`.mapWith(Number) })
    .from(stvs)
    .where(stvWhere)
    .groupBy(stvs.status);
  const pipelineOrder = ["Created", "Picking", "Packed & Verified", "In-Transit", "Delivered", "GRN Posted"];
  const stvPipeline = pipelineOrder.map((status) => ({
    status,
    count: Number(pipelineRows.find((p) => p.status === status)?.count ?? 0),
  }));

  const stockByLocationMap = new Map<string, { name: string; units: number; value: number; batches: number }>();
  for (const row of stock) {
    const existing = stockByLocationMap.get(row.locationName) ?? { name: row.locationName, units: 0, value: 0, batches: 0 };
    existing.units += row.quantity;
    existing.value += row.quantity * row.unitPrice;
    existing.batches += 1;
    stockByLocationMap.set(row.locationName, existing);
  }

  const lowStockMap = new Map<string, { productId: number; name: string; locationName: string; onHand: number; reorderLevel: number; uom: string }>();
  for (const row of stock) {
    const key = `${row.locationId}-${row.productId}`;
    const existing = lowStockMap.get(key);
    if (existing) existing.onHand += row.quantity;
    else
      lowStockMap.set(key, {
        productId: row.productId,
        name: row.name,
        locationName: row.locationName,
        onHand: row.quantity,
        reorderLevel: row.reorderLevel,
        uom: row.uom,
      });
  }
  const lowStock = [...lowStockMap.values()]
    .filter((l) => l.onHand <= l.reorderLevel)
    .sort((a, b) => a.onHand / Math.max(1, a.reorderLevel) - b.onHand / Math.max(1, b.reorderLevel))
    .slice(0, 6);

  const today = new Date().toISOString().slice(0, 10);
  const dispensedTodayWhere = scope
    ? and(inArray(stockOuts.locationId, scope), sql`to_char(${stockOuts.createdAt}, 'YYYY-MM-DD') = ${today}`)
    : sql`to_char(${stockOuts.createdAt}, 'YYYY-MM-DD') = ${today}`;
  const [todayRow] = await db
    .select({ units: sql<number>`coalesce(sum(${stockOuts.quantity}),0)`.mapWith(Number) })
    .from(stockOuts)
    .where(dispensedTodayWhere);

  const [pendingIndents, pendingTransfers, pendingStvs, activity, recentStvs] = await Promise.all([
    countRows("indents", user, "pending"),
    countRows("transfers", user, "pending"),
    db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(stvs)
      .where(stvWhere ? and(stvWhere, inArray(stvs.status, ["Created", "Picking", "Packed & Verified"])) : inArray(stvs.status, ["Created", "Picking", "Packed & Verified"]))
      .then((r) => Number(r[0]?.count ?? 0)),
    recentActivity(scope, 7),
    listStvs(user),
  ]);

  const fastMovers = velocity.filter((v) => v.classification === "fast").slice(0, 6);
  const slowMovers = velocity
    .filter((v) => v.onHand > 0 && (v.classification === "slow" || v.classification === "no-movement"))
    .slice(0, 6);

  const suggestions = slowMovers
    .map((slow) => {
      const target = velocity.find(
        (v) =>
          v.productId === slow.productId &&
          v.locationId !== slow.locationId &&
          v.locationType === "branch" &&
          (v.classification === "fast" || v.classification === "moving"),
      );
      if (!target) return null;
      return {
        productName: slow.productName,
        from: slow.locationName,
        to: target.locationName,
        onHand: slow.onHand,
        suggestedQty: Math.max(5, Math.round(slow.onHand * 0.4)),
        dispensed30: slow.dispensed30,
      };
    })
    .filter((s): s is NonNullable<typeof s> => s !== null)
    .slice(0, 4);

  const expiryBatches = stock
    .filter((r) => r.tier === "red" || r.tier === "orange" || r.tier === "yellow" || r.tier === "expired")
    .sort((a, b) => a.daysToExpiry - b.daysToExpiry)
    .slice(0, 8)
    .map((r) => ({
      batchId: r.batchId,
      name: r.name,
      batchNumber: r.batchNumber,
      expiryDate: r.expiryDate,
      daysToExpiry: r.daysToExpiry,
      quantity: r.quantity,
      uom: r.uom,
      locationName: r.locationName,
      tier: r.tier,
      lockLabel: r.lockLabel,
    }));

  const totals = {
    units: stock.reduce((s, r) => s + r.quantity, 0),
    value: stock.reduce((s, r) => s + r.quantity * r.unitPrice, 0),
    batches: stock.length,
    skus: new Set(stock.map((r) => r.productId)).size,
    locations: stockByLocationMap.size,
    dispensedToday: Number(todayRow?.units ?? 0),
    pendingIndents,
    pendingTransfers,
    pendingStvs,
    fastMovers: fastMovers.length,
    slowMovers: velocity.filter((v) => v.onHand > 0 && (v.classification === "slow" || v.classification === "no-movement")).length,
  };

  return {
    user,
    totals,
    expiry,
    stockByLocation: [...stockByLocationMap.values()],
    stockByCategory: [...stock.reduce((map, row) => {
      const cur = map.get(row.category) ?? 0;
      map.set(row.category, cur + row.quantity);
      return map;
    }, new Map<string, number>())].map(([name, units]) => ({ name, units })),
    velocity: velocity.map((v) => ({
      name: v.productName,
      location: v.locationName,
      dispensed: v.dispensed30,
      onHand: v.onHand,
      classification: v.classification,
    })),
    fastMovers,
    slowMovers,
    suggestions,
    dispensingTrend,
    stvPipeline,
    lowStock,
    expiryBatches,
    recentStvs: recentStvs.slice(0, 5).map((s) => ({
      id: s.id,
      code: s.code,
      type: s.type,
      status: s.status,
      sourceName: s.sourceName,
      destinationName: s.destinationName,
      totalUnits: s.totalUnits,
      createdAt: new Date(s.createdAt).toISOString(),
    })),
    activity: activity.map((a) => ({
      id: a.id,
      userName: a.userName,
      action: a.action,
      details: a.details,
      createdAt: new Date(a.createdAt).toISOString(),
    })),
  };
}
