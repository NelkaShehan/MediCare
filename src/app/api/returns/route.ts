import { desc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { batches, locations, products, stockReturnItems, stockReturns } from "@/db/schema";
import { fail, makeCodeSafe, ok, readJson, requireRole, requireSession } from "@/lib/http";
import { logAudit } from "@/lib/inventory";
import { daysToExpiry, expiryTier } from "@/lib/shared";

export async function GET() {
  const auth = await requireSession();
  if ("response" in auth) return auth.response;
  const { user } = auth;

  const scope = user.role === "central_admin" || user.role === "warehouse_staff" ? undefined : eq(stockReturns.locationId, user.locationId ?? -1);
  const rows = await db
    .select({
      id: stockReturns.id,
      code: stockReturns.code,
      locationId: stockReturns.locationId,
      locationName: locations.name,
      createdByName: stockReturns.createdByName,
      status: stockReturns.status,
      note: stockReturns.note,
      createdAt: stockReturns.createdAt,
      processedAt: stockReturns.processedAt,
    })
    .from(stockReturns)
    .innerJoin(locations, eq(stockReturns.locationId, locations.id))
    .where(scope)
    .orderBy(desc(stockReturns.id));

  const ids = rows.map((r) => r.id);
  const items = ids.length
    ? await db
        .select({
          returnId: stockReturnItems.returnId,
          batchNumber: stockReturnItems.batchNumber,
          expiryDate: stockReturnItems.expiryDate,
          quantity: stockReturnItems.quantity,
          reason: stockReturnItems.reason,
          productName: products.name,
          uom: products.uom,
        })
        .from(stockReturnItems)
        .innerJoin(products, eq(stockReturnItems.productId, products.id))
        .where(inArray(stockReturnItems.returnId, ids))
    : [];

  return ok({ rows: rows.map((r) => ({ ...r, items: items.filter((i) => i.returnId === r.id) })) });
}

export async function POST(request: Request) {
  const auth = await requireRole(["branch_manager"]);
  if ("response" in auth) return auth.response;
  const { user } = auth;
  if (!user.locationId) return fail("No branch assigned to this user", 403);

  const body = await readJson<{ note?: string; items?: { batchId?: number; quantity?: number; reason?: string }[] }>(request);
  const requested = (body?.items ?? []).filter((i) => Number(i.batchId) > 0 && Number(i.quantity) > 0);
  if (requested.length === 0) return fail("Select at least one expired batch to return", 422);

  const rows = await db.select().from(batches).where(eq(batches.locationId, user.locationId));
  const valid: { batch: typeof batches.$inferSelect; quantity: number; reason: string }[] = [];
  for (const item of requested) {
    const batch = rows.find((b) => b.id === Number(item.batchId));
    if (!batch) return fail("Batch does not belong to your branch", 403);
    const tier = expiryTier(daysToExpiry(batch.expiryDate));
    if (tier !== "expired" && batch.status !== "quarantined") {
      return fail(`Batch ${batch.batchNumber} is not expired or quarantined — only locked stock can be returned`, 409);
    }
    const quantity = Math.floor(Number(item.quantity));
    if (quantity > batch.quantity) return fail(`Batch ${batch.batchNumber} only has ${batch.quantity} units`, 409);
    valid.push({ batch, quantity, reason: item.reason?.trim() || "Expired — disposal" });
  }

  const [created] = await db
    .insert(stockReturns)
    .values({
      code: makeCodeSafe("RTN"),
      locationId: user.locationId,
      createdBy: user.id,
      createdByName: user.name,
      status: "pending",
      note: body?.note?.trim() || null,
    })
    .returning({ id: stockReturns.id, code: stockReturns.code });

  await db.insert(stockReturnItems).values(
    valid.map((v) => ({
      returnId: created.id,
      batchId: v.batch.id,
      productId: v.batch.productId,
      batchNumber: v.batch.batchNumber,
      expiryDate: v.batch.expiryDate,
      quantity: v.quantity,
      reason: v.reason,
    })),
  );

  // Lock the stock while the return is in flight.
  for (const v of valid) {
    await db.update(batches).set({ status: "quarantined" }).where(eq(batches.id, v.batch.id));
  }

  await logAudit({
    user,
    action: "return.create",
    entityType: "return",
    entityId: created.id,
    details: `${created.code}: ${valid.length} expired batch(es) returned to warehouse`,
  });

  return ok({ request: created });
}

export async function PATCH(request: Request) {
  const auth = await requireRole(["warehouse_staff", "central_admin"]);
  if ("response" in auth) return auth.response;
  const { user } = auth;
  const body = await readJson<{ id?: number; action?: "receive" | "dispose" }>(request);
  if (!body?.id || !body.action) return fail("Return id and action are required", 422);

  const [record] = await db.select().from(stockReturns).where(eq(stockReturns.id, Number(body.id))).limit(1);
  if (!record) return fail("Return not found", 404);

  if (body.action === "receive") {
    if (record.status !== "pending") return fail(`Return already ${record.status}`, 409);
    await db
      .update(stockReturns)
      .set({ status: "received", processedBy: user.id, processedAt: new Date() })
      .where(eq(stockReturns.id, record.id));
  } else {
    if (record.status === "disposed") return fail("Return already disposed", 409);
    const items = await db.select().from(stockReturnItems).where(eq(stockReturnItems.returnId, record.id));
    for (const item of items) {
      await db.update(batches).set({ quantity: 0, status: "disposed" }).where(eq(batches.id, item.batchId));
    }
    await db
      .update(stockReturns)
      .set({ status: "disposed", processedBy: user.id, processedAt: new Date() })
      .where(eq(stockReturns.id, record.id));
  }

  await logAudit({
    user,
    action: `return.${body.action}`,
    entityType: "return",
    entityId: record.id,
    details: `${record.code} marked ${body.action === "receive" ? "received" : "disposed"}`,
  });

  return ok({ success: true });
}

export async function DELETE() {
  return fail("Returns are audit records and cannot be deleted", 405);
}

export const dynamic = "force-dynamic";
