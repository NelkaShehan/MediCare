import { ok, requireRole } from "@/lib/http";
import { reseedDemoData } from "@/lib/seed";

/**
 * Rebuilds the demo dataset. Destructive: central admin only.
 * The initial dataset is created automatically on first login / health check.
 */
export async function POST() {
  const auth = await requireRole(["central_admin"]);
  if ("response" in auth) return auth.response;
  await reseedDemoData();
  return ok({ success: true, message: "Demo dataset rebuilt" });
}
