import { eq } from "drizzle-orm";

import { db } from "@/db";
import { indentItems, indents, products } from "@/db/schema";
import { fail, makeCodeSafe, ok, readJson, requireRole, requireSession } from "@/lib/http";
import { logAudit } from "@/lib/inventory";
import { listIndents } from "@/lib/orders";

export async function GET() {
  const auth = await requireSession();
  if ("response" in auth) return auth.response;
  const rows = await listIndents(auth.user);
  return ok({ rows });
}

export async function POST(request: Request) {
  const auth = await requireRole(["branch_manager", "pharmacist"]);
  if ("response" in auth) return auth.response;
  const { user } = auth;
  if (!user.locationId) return fail("No branch assigned to this user", 403);

  const body = await readJson<{
    priority?: string;
    note?: string;
    items?: { productId?: number; requestedQty?: number }[];
  }>(request);

  const items = (body?.items ?? []).filter((i) => Number(i.productId) > 0 && Number(i.requestedQty) > 0);
  if (items.length === 0) return fail("Add at least one product with a requested quantity", 422);

  const priority = user.role === "pharmacist" ? "emergency" : body?.priority === "emergency" ? "emergency" : "normal";
  const codes = await db.select({ id: indents.id }).from(indents);
  const code = `IND-${1000 + codes.length + 1}-${makeCodeSafe("R").split("-")[1]?.slice(-3) ?? "01"}`;

  const [created] = await db
    .insert(indents)
    .values({
      code,
      branchId: user.locationId,
      requestedBy: user.id,
      requestedByName: user.name,
      priority,
      note: body?.note?.trim() || (priority === "emergency" ? "Emergency indent raised by pharmacist" : null),
      status: "pending",
    })
    .returning({ id: indents.id, code: indents.code });

  const productRows = await db.select({ id: products.id, name: products.name }).from(products);
  await db.insert(indentItems).values(
    items.map((i) => ({
      indentId: created.id,
      productId: Number(i.productId),
      requestedQty: Math.floor(Number(i.requestedQty)),
      approvedQty: 0,
      fulfilledQty: 0,
    })),
  );

  await logAudit({
    user,
    action: "indent.create",
    entityType: "indent",
    entityId: created.id,
    details: `${priority === "emergency" ? "Emergency" : "Normal"} indent ${created.code} with ${items.length} line(s)`,
  });

  return ok({
    indent: { ...created, requestedByName: user.name, branchName: user.locationName, status: "pending", priority },
    items: items.map((i) => ({ productName: productRows.find((p) => p.id === Number(i.productId))?.name, requestedQty: i.requestedQty })),
  });
}

export async function PATCH() {
  const auth = await requireSession();
  if ("response" in auth) return auth.response;
  const [pending] = await db.select({ id: indents.id }).from(indents).where(eq(indents.status, "pending")).limit(1);
  return ok({ note: pending ? "Use /api/indents/[id] to review" : "No pending indents" });
}
