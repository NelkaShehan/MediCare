import { ok, requireSession } from "@/lib/http";
import { loadDashboard } from "@/lib/dashboard";

export async function GET() {
  const auth = await requireSession();
  if ("response" in auth) return auth.response;
  const data = await loadDashboard(auth.user);
  return ok(data);
}
