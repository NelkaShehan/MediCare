import "server-only";

import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { auditLogs, batches, locations, products, stockOuts } from "@/db/schema";
import type { SessionUser, StockRow } from "@/lib/shared";
import { daysToExpiry, expiryTier, type ExpiryTier } from "@/lib/shared";

export function scopedLocationIds(user: SessionUser): number[] | null {
  if (user.role === "central_admin") return null;
  if (user.locationId == null) return [];
  return [user.locationId];
}

export function canSeeAllLocations(user: SessionUser) {
  return user.role === "central_admin";
}

export type StockQuery = {
  locationIds?: number[] | null;
  productId?: number;
  search?: string;
  tier?: ExpiryTier | "all";
  includeZero?: boolean;
  onlyTransferable?: boolean;
};

export async function getStockRows(query: StockQuery = {}): Promise<StockRow[]> {
  const conditions = [];
  if (query.locationIds && query.locationIds.length > 0) {
    conditions.push(inArray(batches.locationId, query.locationIds));
  }
  if (query.productId) conditions.push(eq(batches.productId, query.productId));
  if (!query.includeZero) conditions.push(sql`${batches.quantity} > 0`);
  conditions.push(inArray(batches.status, query.onlyTransferable ? ["available"] : ["available", "quarantined", "disposed"]));

  const rows = await db
    .select({
      batchId: batches.id,
      productId: products.id,
      sku: products.sku,
      name: products.name,
      genericName: products.genericName,
      category: products.category,
      uom: products.uom,
      unitPrice: products.unitPrice,
      reorderLevel: products.reorderLevel,
      locationId: locations.id,
      locationName: locations.name,
      locationType: locations.type,
      batchNumber: batches.batchNumber,
      expiryDate: batches.expiryDate,
      quantity: batches.quantity,
      status: batches.status,
      supplier: batches.supplier,
    })
    .from(batches)
    .innerJoin(products, eq(batches.productId, products.id))
    .innerJoin(locations, eq(batches.locationId, locations.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(batches.expiryDate), asc(products.name));

  const now = new Date();
  let mapped: StockRow[] = rows.map((r) => {
    const days = daysToExpiry(r.expiryDate, now);
    const tier = expiryTier(days);
    const expired = tier === "expired" || r.status === "disposed";
    const dispenseLocked = expired || r.status !== "available";
    const transferLocked = dispenseLocked || tier === "red";
    return {
      ...r,
      daysToExpiry: days,
      tier,
      dispenseLocked,
      transferLocked,
      lockLabel: expired ? "Expired - Locked" : transferLocked ? "Transfer Locked" : null,
    };
  });

  const search = query.search?.trim().toLowerCase();
  if (search) {
    mapped = mapped.filter(
      (r) =>
        r.name.toLowerCase().includes(search) ||
        r.sku.toLowerCase().includes(search) ||
        (r.genericName ?? "").toLowerCase().includes(search) ||
        r.batchNumber.toLowerCase().includes(search),
    );
  }
  if (query.tier && query.tier !== "all") {
    mapped = mapped.filter((r) => r.tier === query.tier);
  }
  return mapped;
}

export type FefoAllocation = {
  productId: number;
  batchId: number;
  batchNumber: string;
  expiryDate: string;
  uom: string;
  quantity: number;
  unitCost: number;
  requested: number;
};

/**
 * FEFO allocation: earliest expiry first. Near-expiry (red) and expired batches
 * are excluded from transfers because of the smart locking rules.
 */
export async function allocateFefo(
  locationId: number,
  productId: number,
  requestedQty: number,
): Promise<{ allocations: FefoAllocation[]; allocated: number; shortfall: number }> {
  const rows = await db
    .select({
      batchId: batches.id,
      batchNumber: batches.batchNumber,
      expiryDate: batches.expiryDate,
      quantity: batches.quantity,
      unitCost: batches.unitCost,
      uom: products.uom,
      status: batches.status,
    })
    .from(batches)
    .innerJoin(products, eq(batches.productId, products.id))
    .where(
      and(
        eq(batches.locationId, locationId),
        eq(batches.productId, productId),
        eq(batches.status, "available"),
        sql`${batches.quantity} > 0`,
      ),
    )
    .orderBy(asc(batches.expiryDate), asc(batches.id));

  const allocations: FefoAllocation[] = [];
  let remaining = requestedQty;
  for (const b of rows) {
    if (remaining <= 0) break;
    const days = daysToExpiry(b.expiryDate);
    const tier = expiryTier(days);
    if (tier === "red" || tier === "expired") continue; // transfer locked
    const take = Math.min(remaining, b.quantity);
    allocations.push({
      productId,
      batchId: b.batchId,
      batchNumber: b.batchNumber,
      expiryDate: b.expiryDate,
      uom: b.uom,
      quantity: take,
      unitCost: b.unitCost,
      requested: requestedQty,
    });
    remaining -= take;
  }
  return { allocations, allocated: requestedQty - remaining, shortfall: remaining };
}

export type VelocityRow = {
  productId: number;
  productName: string;
  sku: string;
  category: string;
  locationId: number;
  locationName: string;
  locationType: string;
  dispensed30: number;
  ratePerDay: number;
  onHand: number;
  classification: "fast" | "moving" | "slow" | "no-movement";
  threshold: number;
};

export async function getVelocity(scopeIds: number[] | null): Promise<VelocityRow[]> {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const consumption = await db
    .select({
      productId: stockOuts.productId,
      locationId: stockOuts.locationId,
      dispensed: sql<number>`sum(${stockOuts.quantity})`.mapWith(Number),
    })
    .from(stockOuts)
    .where(gte(stockOuts.createdAt, since))
    .groupBy(stockOuts.productId, stockOuts.locationId);

  const stock = await getStockRows({ locationIds: scopeIds, includeZero: true });
  const thresholds = new Map<number, number>(
    (await db.select({ id: products.id, threshold: products.fastMovingThreshold }).from(products)).map((row) => [
      row.id,
      row.threshold > 0 ? row.threshold : 60,
    ]),
  );
  const map = new Map<string, VelocityRow>();

  for (const row of stock) {
    const key = `${row.productId}-${row.locationId}`;
    const existing = map.get(key);
    if (existing) {
      existing.onHand += row.quantity;
      continue;
    }
    const used = consumption.find((c) => c.productId === row.productId && c.locationId === row.locationId);
    const dispensed = Number(used?.dispensed ?? 0);
    // Per-medicine threshold from the product master (defaults to 60 units / 30 days).
    const threshold = thresholds.get(row.productId) ?? 60;
    const classification: VelocityRow["classification"] =
      dispensed >= threshold
        ? "fast"
        : dispensed >= threshold * 0.25
          ? "moving"
          : dispensed > 0
            ? "slow"
            : row.quantity > 0
              ? "no-movement"
              : "slow";
    map.set(key, {
      productId: row.productId,
      productName: row.name,
      sku: row.sku,
      category: row.category,
      locationId: row.locationId,
      locationName: row.locationName,
      locationType: row.locationType,
      dispensed30: dispensed,
      ratePerDay: Math.round((dispensed / 30) * 10) / 10,
      onHand: row.quantity,
      classification,
      threshold,
    });
  }
  return [...map.values()].sort((a, b) => b.dispensed30 - a.dispensed30);
}

export async function logAudit(input: {
  user?: SessionUser | null;
  userName?: string;
  action: string;
  entityType: string;
  entityId?: number | null;
  details?: string;
}) {
  await db.insert(auditLogs).values({
    userId: input.user?.id ?? null,
    userName: input.userName ?? input.user?.name ?? "System",
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    details: input.details ?? null,
  });
}

export async function recentActivity(scopeIds: number[] | null, limit = 8) {
  const rows = await db
    .select({
      id: auditLogs.id,
      userName: auditLogs.userName,
      action: auditLogs.action,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      details: auditLogs.details,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .orderBy(desc(auditLogs.id))
    .limit(limit * 3);

  if (!scopeIds) return rows.slice(0, limit);
  return rows
    .filter((r) => {
      if (!r.details) return true;
      return true;
    })
    .slice(0, limit);
}
