import { eq } from "drizzle-orm";

import { db } from "@/db";
import { indentItems, indents } from "@/db/schema";
import { fail, ok, readJson, requireRole } from "@/lib/http";
import { logAudit } from "@/lib/inventory";

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(["central_admin"]);
  if ("response" in auth) return auth.response;
  const { user } = auth;
  const { id } = await ctx.params;
  const indentId = Number(id);
  if (!Number.isFinite(indentId)) return fail("Invalid indent id", 422);

  const body = await readJson<{
    action?: "approve" | "reject";
    reviewNote?: string;
    items?: { itemId: number; approvedQty: number }[];
  }>(request);

  if (!body?.action || !["approve", "reject"].includes(body.action)) return fail("Action must be approve or reject", 422);
  if (body.action === "reject" && !body.reviewNote?.trim()) return fail("A rejection reason is required", 422);

  const [indent] = await db.select().from(indents).where(eq(indents.id, indentId)).limit(1);
  if (!indent) return fail("Indent not found", 404);
  if (indent.status !== "pending") return fail(`Indent is already ${indent.status}`, 409);

  const lines = await db.select().from(indentItems).where(eq(indentItems.indentId, indentId));

  if (body.action === "approve") {
    for (const line of lines) {
      const requested = body.items?.find((i) => Number(i.itemId) === line.id);
      const approved = requested ? Math.max(0, Math.min(line.requestedQty, Math.floor(Number(requested.approvedQty)))) : line.requestedQty;
      await db.update(indentItems).set({ approvedQty: approved }).where(eq(indentItems.id, line.id));
    }
  } else {
    for (const line of lines) {
      await db.update(indentItems).set({ approvedQty: 0 }).where(eq(indentItems.id, line.id));
    }
  }

  await db
    .update(indents)
    .set({
      status: body.action === "approve" ? "approved" : "rejected",
      reviewNote: body.reviewNote?.trim() || "Approved after warehouse availability review.",
      reviewedBy: user.id,
      reviewedAt: new Date(),
    })
    .where(eq(indents.id, indentId));

  await logAudit({
    user,
    action: `indent.${body.action}`,
    entityType: "indent",
    entityId: indentId,
    details: `${indent.code}: ${body.action === "approve" ? "approved" : "rejected"}${body.reviewNote ? ` — ${body.reviewNote}` : ""}`,
  });

  return ok({ success: true, status: body.action === "approve" ? "approved" : "rejected" });
}
