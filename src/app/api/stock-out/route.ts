import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { batches, products, stockOuts } from "@/db/schema";
import { fail, makeCodeSafe, ok, readJson, requireRole, requireSession } from "@/lib/http";
import { logAudit, scopedLocationIds } from "@/lib/inventory";
import { daysToExpiry, expiryTier } from "@/lib/shared";

export async function GET(request: Request) {
  const auth = await requireSession();
  if ("response" in auth) return auth.response;
  const { user } = auth;
  const scope = scopedLocationIds(user);
  const url = new URL(request.url);
  const date = url.searchParams.get("date");

  const conditions = [];
  if (scope) conditions.push(inArray(stockOuts.locationId, scope));
  if (date) conditions.push(sql`to_char(${stockOuts.createdAt}, 'YYYY-MM-DD') = ${date}`);

  const rows = await db
    .select({
      id: stockOuts.id,
      code: stockOuts.code,
      productName: products.name,
      sku: products.sku,
      batchNumber: stockOuts.batchNumber,
      quantity: stockOuts.quantity,
      uom: stockOuts.uom,
      pharmacistName: stockOuts.pharmacistName,
      reference: stockOuts.reference,
      note: stockOuts.note,
      createdAt: stockOuts.createdAt,
    })
    .from(stockOuts)
    .innerJoin(products, eq(stockOuts.productId, products.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(stockOuts.id))
    .limit(200);

  return ok({ rows });
}

export async function POST(request: Request) {
  const auth = await requireRole(["pharmacist", "branch_manager"]);
  if ("response" in auth) return auth.response;
  const { user } = auth;
  if (!user.locationId) return fail("No branch assigned to this user", 403);

  const body = await readJson<{
    batchId?: number;
    quantity?: number;
    reference?: string;
    note?: string;
    confirmNearExpiry?: boolean;
  }>(request);

  const quantity = Number(body?.quantity ?? 0);
  if (!body?.batchId || !Number.isFinite(quantity) || quantity <= 0) {
    return fail("Select a batch and enter a quantity greater than zero", 422);
  }

  const [batch] = await db
    .select({
      id: batches.id,
      productId: batches.productId,
      locationId: batches.locationId,
      batchNumber: batches.batchNumber,
      expiryDate: batches.expiryDate,
      quantity: batches.quantity,
      status: batches.status,
      unitPrice: products.unitPrice,
      uom: products.uom,
      productName: products.name,
    })
    .from(batches)
    .innerJoin(products, eq(batches.productId, products.id))
    .where(eq(batches.id, body.batchId))
    .limit(1);

  if (!batch) return fail("Batch not found", 404);
  if (batch.locationId !== user.locationId) return fail("This batch belongs to another location", 403);

  const days = daysToExpiry(batch.expiryDate);
  const tier = expiryTier(days);

  // Smart locking: expired / quarantined batches can never be dispensed.
  if (tier === "expired" || batch.status !== "available") {
    return fail(
      `Batch ${batch.batchNumber} is expired or quarantined. It is hard-locked and can only be processed through an expired-stock return.`,
      423,
    );
  }
  if (quantity > batch.quantity) return fail(`Only ${batch.quantity} ${batch.uom} available in this batch`, 409);

  if (tier === "red" && !body.confirmNearExpiry) {
    return fail("Near-expiry confirmation required", 409, {
      requiresConfirmation: true,
      batch: {
        batchNumber: batch.batchNumber,
        productName: batch.productName,
        expiryDate: batch.expiryDate,
        daysToExpiry: days,
        available: batch.quantity,
      },
    });
  }

  const code = makeCodeSafe("SO");
  await db.transaction(async (tx) => {
    const updated = await tx
      .update(batches)
      .set({ quantity: sql`${batches.quantity} - ${quantity}` })
      .where(and(eq(batches.id, batch.id), sql`${batches.quantity} >= ${quantity}`))
      .returning({ id: batches.id });
    if (updated.length === 0) throw new Error("Insufficient stock — refresh and retry");

    await tx.insert(stockOuts).values({
      code,
      locationId: user.locationId!,
      productId: batch.productId,
      batchId: batch.id,
      batchNumber: batch.batchNumber,
      quantity,
      uom: batch.uom,
      pharmacistId: user.id,
      pharmacistName: user.name,
      reference: body.reference?.trim() || null,
      note: body.note?.trim() || (tier === "red" ? `Near-expiry dispensed with red-tier confirmation (${days}d)` : null),
    });
  });

  await logAudit({
    user,
    action: "stock-out.create",
    entityType: "stock_out",
    details: `Dispensed ${quantity} ${batch.uom} of ${batch.productName} from batch ${batch.batchNumber} (FEFO)`,
  });

  return ok({ success: true, code, remaining: batch.quantity - quantity, nearExpiry: tier === "red" });
}
