import { asc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { batches, locations, products, users } from "@/db/schema";
import { fail, ok, readJson, requireRole, requireSession } from "@/lib/http";
import { getStockRows, logAudit } from "@/lib/inventory";

/** Everyone can read the network; only Central Admin can change it. */
export async function GET(request: Request) {
  const auth = await requireSession();
  if ("response" in auth) return auth.response;
  const url = new URL(request.url);
  const withStats = url.searchParams.get("stats") === "1";

  const rows = await db.select().from(locations).orderBy(asc(locations.type), asc(locations.id));
  if (!withStats) return ok({ rows });

  if (auth.user.role !== "central_admin") return ok({ rows });

  const stock = await getStockRows({ includeZero: true });
  const staff = await db
    .select({ locationId: users.locationId, count: sql<number>`count(*)`.mapWith(Number) })
    .from(users)
    .groupBy(users.locationId);
  const productLines = await db
    .select({ locationId: batches.locationId, count: sql<number>`count(distinct ${batches.productId})`.mapWith(Number) })
    .from(batches)
    .where(sql`${batches.quantity} > 0`)
    .groupBy(batches.locationId);

  const enriched = rows.map((location) => {
    const locationStock = stock.filter((row) => row.locationId === location.id);
    return {
      ...location,
      units: locationStock.reduce((sum, row) => sum + row.quantity, 0),
      value: locationStock.reduce((sum, row) => sum + row.quantity * row.unitPrice, 0),
      batches: locationStock.length,
      skus: productLines.find((p) => p.locationId === location.id)?.count ?? 0,
      alertBatches: locationStock.filter((row) => row.tier !== "ok").length,
      staff: staff.find((s) => s.locationId === location.id)?.count ?? 0,
    };
  });

  return ok({ rows: enriched, totalSkus: (await db.select({ id: products.id }).from(products)).length });
}

export async function POST(request: Request) {
  const auth = await requireRole(["central_admin"]);
  if ("response" in auth) return auth.response;
  const body = await readJson<{
    code?: string;
    name?: string;
    type?: string;
    address?: string;
    phone?: string;
  }>(request);

  const name = body?.name?.trim();
  const code = body?.code?.trim().toUpperCase();
  if (!name || !code) return fail("Branch name and code are required", 422);
  if (!/^[A-Z0-9-]{2,20}$/.test(code)) return fail("Code must be 2–20 characters (letters, numbers, hyphens)", 422);

  const type = body?.type === "warehouse" ? "warehouse" : "branch";
  if (type === "warehouse") {
    const [existingWarehouse] = await db.select({ id: locations.id }).from(locations).where(eq(locations.type, "warehouse")).limit(1);
    if (existingWarehouse) return fail("A central warehouse already exists — only one is allowed", 409);
  }

  const [duplicate] = await db.select({ id: locations.id }).from(locations).where(eq(locations.code, code)).limit(1);
  if (duplicate) return fail("A location with this code already exists", 409);

  const [created] = await db
    .insert(locations)
    .values({
      code,
      name,
      type,
      address: body?.address?.trim() || null,
      phone: body?.phone?.trim() || null,
    })
    .returning();

  await logAudit({
    user: auth.user,
    action: "branch.create",
    entityType: "location",
    entityId: created.id,
    details: `${type === "warehouse" ? "Warehouse" : "Branch"} "${created.name}" (${created.code}) added to the network`,
  });

  return ok({ location: created });
}

export async function PATCH(request: Request) {
  const auth = await requireRole(["central_admin"]);
  if ("response" in auth) return auth.response;
  const body = await readJson<{ id?: number; name?: string; address?: string; phone?: string }>(request);
  if (!body?.id) return fail("Location id is required", 422);

  const [existing] = await db.select().from(locations).where(eq(locations.id, Number(body.id))).limit(1);
  if (!existing) return fail("Location not found", 404);

  const [updated] = await db
    .update(locations)
    .set({
      ...(body.name?.trim() ? { name: body.name.trim() } : {}),
      ...(body.address !== undefined ? { address: body.address.trim() || null } : {}),
      ...(body.phone !== undefined ? { phone: body.phone.trim() || null } : {}),
    })
    .where(eq(locations.id, Number(body.id)))
    .returning();

  await logAudit({
    user: auth.user,
    action: "branch.update",
    entityType: "location",
    entityId: updated.id,
    details: `Updated ${updated.name} (${updated.code})`,
  });

  return ok({ location: updated });
}

/** Deleting a branch is only allowed when it holds no stock, users or history. */
export async function DELETE(request: Request) {
  const auth = await requireRole(["central_admin"]);
  if ("response" in auth) return auth.response;
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isFinite(id) || id <= 0) return fail("Location id is required", 422);

  const [existing] = await db.select().from(locations).where(eq(locations.id, id)).limit(1);
  if (!existing) return fail("Location not found", 404);
  if (existing.type === "warehouse") return fail("The central warehouse cannot be deleted", 409);

  const [stockRow] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(batches)
    .where(eq(batches.locationId, id));
  if (Number(stockRow?.count ?? 0) > 0) return fail("This branch still holds stock records and cannot be deleted", 409);

  const [userRow] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(users)
    .where(eq(users.locationId, id));
  if (Number(userRow?.count ?? 0) > 0) return fail("Reassign or remove this branch's users first", 409);

  await db.delete(locations).where(eq(locations.id, id));
  await logAudit({
    user: auth.user,
    action: "branch.delete",
    entityType: "location",
    entityId: id,
    details: `Removed ${existing.name} (${existing.code}) from the network`,
  });

  return ok({ success: true });
}
