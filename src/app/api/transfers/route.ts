import { fail, makeCodeSafe, ok, readJson, requireRole, requireSession } from "@/lib/http";
import { db } from "@/db";
import { transferRequestItems, transferRequests } from "@/db/schema";
import { logAudit } from "@/lib/inventory";
import { listTransfers } from "@/lib/orders";

export async function GET() {
  const auth = await requireSession();
  if ("response" in auth) return auth.response;
  const rows = await listTransfers(auth.user);
  return ok({ rows });
}

export async function POST(request: Request) {
  const auth = await requireRole(["branch_manager"]);
  if ("response" in auth) return auth.response;
  const { user } = auth;
  if (!user.locationId) return fail("No branch assigned to this user", 403);

  const body = await readJson<{
    fromLocationId?: number;
    toLocationId?: number;
    kind?: string;
    note?: string;
    items?: { productId?: number; quantity?: number }[];
  }>(request);

  const items = (body?.items ?? []).filter((i) => Number(i.productId) > 0 && Number(i.quantity) > 0);
  if (items.length === 0) return fail("Add at least one product with a quantity", 422);

  const kind = body?.kind === "offer" ? "offer" : "request";
  const fromLocationId = Number(body?.fromLocationId ?? (kind === "offer" ? user.locationId : 0));
  const toLocationId = Number(body?.toLocationId ?? (kind === "request" ? user.locationId : 0));

  if (!fromLocationId || !toLocationId) return fail("Source and destination branches are required", 422);
  if (fromLocationId === toLocationId) return fail("Source and destination must be different branches", 422);
  if (kind === "offer" && fromLocationId !== user.locationId) return fail("Offers must originate from your own branch", 403);
  if (kind === "request" && toLocationId !== user.locationId) return fail("Requests can only be raised for your own branch", 403);

  const [created] = await db
    .insert(transferRequests)
    .values({
      code: makeCodeSafe("IBT"),
      fromLocationId,
      toLocationId,
      kind,
      requestedBy: user.id,
      requestedByName: user.name,
      status: "pending",
      note: body?.note?.trim() || null,
    })
    .returning({ id: transferRequests.id, code: transferRequests.code });

  await db.insert(transferRequestItems).values(
    items.map((i) => ({
      requestId: created.id,
      productId: Number(i.productId),
      quantity: Math.floor(Number(i.quantity)),
    })),
  );

  await logAudit({
    user,
    action: kind === "offer" ? "transfer.offer" : "transfer.request",
    entityType: "transfer",
    entityId: created.id,
    details: `${created.code}: ${items.length} line(s) between branches`,
  });

  return ok({ request: created });
}
