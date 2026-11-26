import { db } from "@/db";
import { locations } from "@/db/schema";
import { ok, requireSession } from "@/lib/http";
import { getStockRows, scopedLocationIds } from "@/lib/inventory";
import type { ExpiryTier, Role } from "@/lib/shared";

export async function GET(request: Request) {
  const auth = await requireSession();
  if ("response" in auth) return auth.response;
  const { user } = auth;

  const url = new URL(request.url);
  const search = url.searchParams.get("search") ?? undefined;
  const tier = (url.searchParams.get("tier") ?? "all") as ExpiryTier | "all";
  const requestedLocation = Number(url.searchParams.get("locationId") ?? 0);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const pageSize = Math.min(100, Math.max(5, Number(url.searchParams.get("pageSize") ?? 10)));

  const scope = scopedLocationIds(user);
  const locationIds =
    scope === null ? (requestedLocation ? [requestedLocation] : null) : scope;

  const allRows = await getStockRows({ locationIds, search, tier });
  const total = allRows.length;
  const summary = {
    units: allRows.reduce((s, r) => s + r.quantity, 0),
    value: allRows.reduce((s, r) => s + r.quantity * r.unitPrice, 0),
    batches: allRows.length,
    yellow: allRows.filter((r) => r.tier === "yellow").length,
    orange: allRows.filter((r) => r.tier === "orange").length,
    red: allRows.filter((r) => r.tier === "red").length,
    expired: allRows.filter((r) => r.tier === "expired").length,
    locked: allRows.filter((r) => r.transferLocked).length,
  };

  const rows = allRows.slice((page - 1) * pageSize, page * pageSize);
  const allLocations =
    user.role === "central_admin"
      ? await db.select({ id: locations.id, name: locations.name, type: locations.type }).from(locations)
      : [];

  return ok({
    rows,
    total,
    page,
    pageSize,
    summary,
    locations: allLocations,
    scope: {
      role: user.role as Role,
      locationId: user.locationId,
      locationName: user.locationName,
    },
    now: new Date().toISOString(),
  });
}
