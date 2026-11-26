import { fail, ok, readJson, requireRole, requireSession } from "@/lib/http";
import { logAudit } from "@/lib/inventory";
import { createWarehouseStv, listStvs } from "@/lib/orders";

export async function GET(request: Request) {
  const auth = await requireSession();
  if ("response" in auth) return auth.response;
  const url = new URL(request.url);
  const rows = await listStvs(auth.user, {
    status: url.searchParams.get("status") ?? undefined,
    type: url.searchParams.get("type") ?? undefined,
  });
  return ok({ rows });
}

export async function POST(request: Request) {
  const auth = await requireRole(["warehouse_staff", "central_admin"]);
  if ("response" in auth) return auth.response;
  const { user } = auth;

  const body = await readJson<{ indentId?: number }>(request);
  if (!body?.indentId) return fail("Select an approved indent to generate a pick list", 422);

  try {
    const stv = await createWarehouseStv(user, Number(body.indentId));
    await logAudit({
      user,
      action: "stv.create",
      entityType: "stv",
      entityId: stv.id,
      details: `${stv.code}: FEFO pick list generated for indent #${body.indentId}`,
    });
    return ok({ stv });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Unable to generate pick list", 409);
  }
}
