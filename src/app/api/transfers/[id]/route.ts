import { eq } from "drizzle-orm";

import { db } from "@/db";
import { transferRequests } from "@/db/schema";
import { fail, ok, readJson, requireRole } from "@/lib/http";
import { logAudit } from "@/lib/inventory";
import { createInterBranchStv } from "@/lib/orders";

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(["central_admin"]);
  if ("response" in auth) return auth.response;
  const { user } = auth;
  const { id } = await ctx.params;
  const requestId = Number(id);
  if (!Number.isFinite(requestId)) return fail("Invalid transfer id", 422);

  const body = await readJson<{ action?: "approve" | "reject"; reviewNote?: string }>(request);
  if (!body?.action || !["approve", "reject"].includes(body.action)) return fail("Action must be approve or reject", 422);
  if (body.action === "reject" && !body.reviewNote?.trim()) return fail("A rejection reason is required", 422);

  const [transfer] = await db.select().from(transferRequests).where(eq(transferRequests.id, requestId)).limit(1);
  if (!transfer) return fail("Transfer request not found", 404);
  if (transfer.status !== "pending") return fail(`Transfer is already ${transfer.status}`, 409);

  let stvId: number | null = null;
  if (body.action === "approve") {
    try {
      const stv = await createInterBranchStv(user, requestId);
      stvId = stv.id;
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Unable to create STV", 409);
    }
  }

  await db
    .update(transferRequests)
    .set({
      status: body.action === "approve" ? "approved" : "rejected",
      reviewNote: body.reviewNote?.trim() || (body.action === "approve" ? "Approved — STV generated at source branch." : null),
      reviewedBy: user.id,
      reviewedAt: new Date(),
    })
    .where(eq(transferRequests.id, requestId));

  await logAudit({
    user,
    action: `transfer.${body.action}`,
    entityType: "transfer",
    entityId: requestId,
    details: `${transfer.code}: ${body.action === "approve" ? `approved, STV #${stvId} generated` : `rejected — ${body.reviewNote}`}`,
  });

  return ok({ success: true, stvId, status: body.action === "approve" ? "approved" : "rejected" });
}
