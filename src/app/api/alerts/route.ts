import { and, desc, eq, inArray, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { alerts, locations } from "@/db/schema";
import { fail, ok, readJson, requireSession } from "@/lib/http";
import { scopedLocationIds } from "@/lib/inventory";

export async function GET(request: Request) {
  const auth = await requireSession();
  if ("response" in auth) return auth.response;
  const { user } = auth;
  const scope = scopedLocationIds(user);
  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? "open";
  const severity = url.searchParams.get("severity");
  const type = url.searchParams.get("type");

  const conditions = [];
  if (status !== "all") conditions.push(eq(alerts.status, status));
  if (severity && severity !== "all") conditions.push(eq(alerts.severity, severity));
  if (type && type !== "all") conditions.push(eq(alerts.type, type));
  if (scope) {
    // Warehouse-side roles also see system-wide returns/reorder items for their location.
    conditions.push(or(inArray(alerts.locationId, scope), sql`${alerts.locationId} is null`));
  }

  const rows = await db
    .select({
      id: alerts.id,
      type: alerts.type,
      severity: alerts.severity,
      title: alerts.title,
      message: alerts.message,
      status: alerts.status,
      locationId: alerts.locationId,
      locationName: locations.name,
      createdAt: alerts.createdAt,
    })
    .from(alerts)
    .leftJoin(locations, eq(alerts.locationId, locations.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(alerts.id))
    .limit(200);

  const counts = {
    yellow: rows.filter((r) => r.severity === "yellow").length,
    orange: rows.filter((r) => r.severity === "orange").length,
    red: rows.filter((r) => r.severity === "red").length,
    expired: rows.filter((r) => r.severity === "expired").length,
    info: rows.filter((r) => r.severity === "info").length,
    total: rows.length,
  };

  return ok({ rows, counts });
}

export async function POST(request: Request) {
  const auth = await requireSession();
  if ("response" in auth) return auth.response;
  const body = await readJson<{ id?: number; all?: boolean }>(request);

  if (body?.all) {
    await db.update(alerts).set({ status: "acknowledged" }).where(eq(alerts.status, "open"));
    return ok({ success: true, acknowledgedAll: true });
  }
  if (!body?.id) return fail("Alert id or all flag is required", 422);
  await db.update(alerts).set({ status: "acknowledged" }).where(eq(alerts.id, Number(body.id)));
  return ok({ success: true });
}
