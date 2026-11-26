import { desc } from "drizzle-orm";

import { db } from "@/db";
import { automationRuns } from "@/db/schema";
import { ok, requireRole } from "@/lib/http";
import { runAutomation } from "@/lib/alerts";

export async function GET() {
  const auth = await requireRole(["central_admin"]);
  if ("response" in auth) return auth.response;
  const rows = await db.select().from(automationRuns).orderBy(desc(automationRuns.id)).limit(10);
  return ok({ rows });
}

export async function POST() {
  const auth = await requireRole(["central_admin"]);
  if ("response" in auth) return auth.response;
  const summary = await runAutomation("manual", auth.user);
  return ok({ summary });
}
