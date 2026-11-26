import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { batches, locations } from "@/db/schema";
import { fail, ok, readJson, requireRole } from "@/lib/http";
import { logAudit } from "@/lib/inventory";
import { daysToExpiry } from "@/lib/shared";

/**
 * Initial stock receipt (warehouse intake) with batch number & expiry date.
 * Existing batch numbers are incremented; near-expiry receipts are accepted but
 * are automatically transfer-locked by the expiry rules.
 */
export async function POST(request: Request) {
  const auth = await requireRole(["warehouse_staff", "central_admin"]);
  if ("response" in auth) return auth.response;
  const { user } = auth;

  const body = await readJson<{
    productId?: number;
    batchNumber?: string;
    expiryDate?: string;
    quantity?: number;
    unitCost?: number;
    supplier?: string;
    locationId?: number;
  }>(request);

  const quantity = Number(body?.quantity ?? 0);
  if (!body?.productId || !body?.batchNumber?.trim() || !body?.expiryDate) {
    return fail("Product, batch number and expiry date are required", 422);
  }
  if (!Number.isFinite(quantity) || quantity <= 0) return fail("Quantity must be greater than zero", 422);
  if (daysToExpiry(body.expiryDate) <= 0) return fail("Cannot receive stock with an expiry date that has already passed", 422);

  let locationId = user.locationId;
  if (user.role === "central_admin") {
    const warehouse = await db.select({ id: locations.id }).from(locations).where(eq(locations.type, "warehouse")).limit(1);
    locationId = Number(body.locationId ?? warehouse[0]?.id ?? user.locationId ?? 0);
  }
  if (!locationId) return fail("No receiving location assigned", 403);

  const batchNumber = body.batchNumber.trim().toUpperCase();
  const [existing] = await db
    .select()
    .from(batches)
    .where(and(eq(batches.productId, Number(body.productId)), eq(batches.locationId, locationId), eq(batches.batchNumber, batchNumber)))
    .limit(1);

  let batchId: number;
  if (existing) {
    const [updated] = await db
      .update(batches)
      .set({
        quantity: sql`${batches.quantity} + ${quantity}`,
        expiryDate: body.expiryDate,
        unitCost: Number(body.unitCost ?? existing.unitCost),
        supplier: body.supplier?.trim() || existing.supplier,
        status: "available",
      })
      .where(eq(batches.id, existing.id))
      .returning({ id: batches.id });
    batchId = updated.id;
  } else {
    const [created] = await db
      .insert(batches)
      .values({
        productId: Number(body.productId),
        locationId,
        batchNumber,
        expiryDate: body.expiryDate,
        quantity,
        unitCost: Math.max(0, Number(body.unitCost ?? 0)),
        supplier: body.supplier?.trim() || "Central procurement",
        status: "available",
      })
      .returning({ id: batches.id });
    batchId = created.id;
  }

  await logAudit({
    user,
    action: existing ? "batch.receive.additional" : "batch.receive",
    entityType: "batch",
    entityId: batchId,
    details: `Received ${quantity} units of batch ${batchNumber} expiring ${body.expiryDate}${existing ? " (added to existing batch)" : ""}`,
  });

  return ok({ success: true, batchId, batchNumber, quantity, expiryDate: body.expiryDate });
}
