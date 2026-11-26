import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { eodSheets, products, stockOuts } from "@/db/schema";
import { fail, ok, readJson, requireRole, requireSession } from "@/lib/http";
import { logAudit } from "@/lib/inventory";

export async function GET(request: Request) {
  const auth = await requireSession();
  if ("response" in auth) return auth.response;
  const { user } = auth;
  const url = new URL(request.url);
  const date = url.searchParams.get("date") || new Date().toISOString().slice(0, 10);
  const locationId = user.locationId ?? Number(url.searchParams.get("locationId") ?? 0);
  if (!locationId) return fail("No branch assigned", 403);

  const rows = await db
    .select({
      productId: stockOuts.productId,
      productName: products.name,
      sku: products.sku,
      uom: stockOuts.uom,
      quantity: sql<number>`sum(${stockOuts.quantity})`.mapWith(Number),
      lines: sql<number>`count(*)`.mapWith(Number),
      batches: sql<string>`string_agg(distinct ${stockOuts.batchNumber}, ', ')`,
      lastDispensedAt: sql<string>`max(${stockOuts.createdAt})`,
    })
    .from(stockOuts)
    .innerJoin(products, eq(stockOuts.productId, products.id))
    .where(and(eq(stockOuts.locationId, locationId), sql`to_char(${stockOuts.createdAt}, 'YYYY-MM-DD') = ${date}`))
    .groupBy(stockOuts.productId, products.name, products.sku, stockOuts.uom)
    .orderBy(sql`sum(${stockOuts.quantity}) desc`);

  const byPharmacist = await db
    .select({
      pharmacistId: stockOuts.pharmacistId,
      pharmacistName: stockOuts.pharmacistName,
      quantity: sql<number>`sum(${stockOuts.quantity})`.mapWith(Number),
      lines: sql<number>`count(*)`.mapWith(Number),
      products: sql<number>`count(distinct ${stockOuts.productId})`.mapWith(Number),
      lastAt: sql<string>`max(${stockOuts.createdAt})`,
    })
    .from(stockOuts)
    .where(and(eq(stockOuts.locationId, locationId), sql`to_char(${stockOuts.createdAt}, 'YYYY-MM-DD') = ${date}`))
    .groupBy(stockOuts.pharmacistId, stockOuts.pharmacistName)
    .orderBy(sql`sum(${stockOuts.quantity}) desc`);

  const [sheet] = await db
    .select()
    .from(eodSheets)
    .where(and(eq(eodSheets.locationId, locationId), eq(eodSheets.sheetDate, date)))
    .limit(1);

  return ok({
    date,
    locationId,
    rows: rows.map((r) => ({ ...r, quantity: Number(r.quantity), lines: Number(r.lines) })),
    totals: {
      units: rows.reduce((s, r) => s + Number(r.quantity), 0),
      lines: rows.reduce((s, r) => s + Number(r.lines), 0),
      products: rows.length,
    },
    byPharmacist: byPharmacist.map((r) => ({
      ...r,
      quantity: Number(r.quantity),
      lines: Number(r.lines),
      products: Number(r.products),
      isMe: r.pharmacistId === user.id,
    })),
    sheet: sheet ?? null,
    canReconcile: user.role === "branch_manager" || user.role === "central_admin",
    viewer: { id: user.id, name: user.name, role: user.role },
  });
}

export async function POST(request: Request) {
  const auth = await requireRole(["pharmacist", "branch_manager", "central_admin"]);
  if ("response" in auth) return auth.response;
  const { user } = auth;
  const body = await readJson<{ date?: string; notes?: string; action?: "save" | "reconcile" }>(request);
  const date = body?.date || new Date().toISOString().slice(0, 10);
  if (!user.locationId) return fail("No branch assigned", 403);

  const [agg] = await db
    .select({
      units: sql<number>`coalesce(sum(${stockOuts.quantity}),0)`.mapWith(Number),
      lines: sql<number>`count(*)`.mapWith(Number),
    })
    .from(stockOuts)
    .where(and(eq(stockOuts.locationId, user.locationId), sql`to_char(${stockOuts.createdAt}, 'YYYY-MM-DD') = ${date}`));

  const reconciled = body?.action === "reconcile";
  if (reconciled && user.role === "pharmacist") {
    return fail("Only a Branch Manager or Central Admin can reconcile and lock the EOD sheet", 403);
  }

  const [sheet] = await db
    .insert(eodSheets)
    .values({
      locationId: user.locationId,
      sheetDate: date,
      status: reconciled ? "reconciled" : "draft",
      totalDispensed: Number(agg?.units ?? 0),
      totalLines: Number(agg?.lines ?? 0),
      notes: body?.notes?.trim() || null,
      reconciledBy: reconciled ? user.id : null,
      reconciledByName: reconciled ? user.name : "",
      reconciledAt: reconciled ? new Date() : null,
    })
    .onConflictDoUpdate({
      target: [eodSheets.locationId, eodSheets.sheetDate],
      set: {
        status: reconciled ? "reconciled" : "draft",
        totalDispensed: Number(agg?.units ?? 0),
        totalLines: Number(agg?.lines ?? 0),
        notes: body?.notes?.trim() || null,
        reconciledBy: reconciled ? user.id : null,
        reconciledByName: reconciled ? user.name : "",
        reconciledAt: reconciled ? new Date() : null,
      },
    })
    .returning();

  await logAudit({
    user,
    action: reconciled ? "eod.reconcile" : "eod.save",
    entityType: "eod",
    entityId: sheet.id,
    details: `${date}: ${Number(agg?.units ?? 0)} units across ${Number(agg?.lines ?? 0)} dispensing records`,
  });

  return ok({ sheet });
}
