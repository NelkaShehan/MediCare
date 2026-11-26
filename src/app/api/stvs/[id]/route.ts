import { fail, ok, readJson, requireSession } from "@/lib/http";
import { getStvDetail } from "@/lib/orders";
import { transitionStv } from "@/lib/stv";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireSession();
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;
  const stv = await getStvDetail(auth.user, Number(id));
  if (!stv) return fail("STV not found", 404);
  return ok({ stv });
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireSession();
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;
  const stvId = Number(id);
  if (!Number.isFinite(stvId)) return fail("Invalid STV id", 422);

  const body = await readJson<{
    action?: string;
    comment?: string;
    receipts?: { itemId: number; acceptedQty: number }[];
  }>(request);
  if (!body?.action) return fail("Transition action is required", 422);

  try {
    const result = await transitionStv(auth.user, stvId, {
      action: body.action,
      comment: body.comment,
      receipts: body.receipts,
    });
    return ok({ success: true, ...result });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Transition failed", 409);
  }
}
