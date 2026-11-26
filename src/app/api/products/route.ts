import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { products } from "@/db/schema";
import { fail, ok, readJson, requireRole, requireSession } from "@/lib/http";
import { logAudit } from "@/lib/inventory";
import { UOMS } from "@/lib/shared";

export async function GET() {
  const auth = await requireSession();
  if ("response" in auth) return auth.response;
  const rows = await db.select().from(products).orderBy(asc(products.name));
  return ok({ rows, uoms: UOMS });
}

export async function POST(request: Request) {
  const auth = await requireRole(["central_admin"]);
  if ("response" in auth) return auth.response;
  const body = await readJson<{
    sku?: string;
    name?: string;
    genericName?: string;
    category?: string;
    uom?: string;
    unitPrice?: number;
    reorderLevel?: number;
    packSize?: number;
    fastMovingThreshold?: number;
  }>(request);

  if (!body?.sku?.trim() || !body?.name?.trim()) return fail("SKU and product name are required", 422);
  const [existing] = await db.select({ id: products.id }).from(products).where(eq(products.sku, body.sku.trim().toUpperCase())).limit(1);
  if (existing) return fail("A product with this SKU already exists", 409);

  const [created] = await db
    .insert(products)
    .values({
      sku: body.sku.trim().toUpperCase(),
      name: body.name.trim(),
      genericName: body.genericName?.trim() || null,
      category: body.category?.trim() || "General",
      uom: body.uom || "Tablet",
      packSize: Number(body.packSize ?? 1),
      unitPrice: Math.max(0, Number(body.unitPrice ?? 0)),
      reorderLevel: Math.max(0, Number(body.reorderLevel ?? 100)),
      fastMovingThreshold: Math.max(1, Number(body.fastMovingThreshold ?? 60)),
    })
    .returning();

  await logAudit({ user: auth.user, action: "product.create", entityType: "product", entityId: created.id, details: created.name });
  return ok({ product: created });
}

export async function PATCH(request: Request) {
  const auth = await requireRole(["central_admin"]);
  if ("response" in auth) return auth.response;
  const body = await readJson<{
    id?: number;
    name?: string;
    category?: string;
    uom?: string;
    unitPrice?: number;
    reorderLevel?: number;
    fastMovingThreshold?: number;
    active?: boolean;
  }>(request);
  if (!body?.id) return fail("Product id is required", 422);

  const [updated] = await db
    .update(products)
    .set({
      ...(body.name ? { name: body.name.trim() } : {}),
      ...(body.category ? { category: body.category } : {}),
      ...(body.uom ? { uom: body.uom } : {}),
      ...(body.unitPrice != null ? { unitPrice: Number(body.unitPrice) } : {}),
      ...(body.reorderLevel != null ? { reorderLevel: Number(body.reorderLevel) } : {}),
      ...(body.fastMovingThreshold != null ? { fastMovingThreshold: Math.max(1, Number(body.fastMovingThreshold)) } : {}),
      ...(body.active != null ? { active: Boolean(body.active) } : {}),
    })
    .where(eq(products.id, Number(body.id)))
    .returning();

  if (!updated) return fail("Product not found", 404);
  await logAudit({ user: auth.user, action: "product.update", entityType: "product", entityId: updated.id, details: updated.name });
  return ok({ product: updated });
}
