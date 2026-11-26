import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { alerts, automationRuns, batches } from "@/db/schema";
import { getStockRows, getVelocity, logAudit } from "@/lib/inventory";
import type { SessionUser } from "@/lib/shared";
import { daysToExpiry, expiryTier } from "@/lib/shared";

export type AutomationSummary = {
  trigger: string;
  expiredQuarantined: number;
  expiryAlerts: number;
  reorderAlerts: number;
  slowMovingAlerts: number;
  suggestions: number;
  ranAt: string;
};

/**
 * Daily background job (node-cron) + manual trigger:
 * - auto-quarantines expired batches
 * - regenerates 3-tier expiry alerts (6m / 3m / 1m)
 * - regenerates low-stock reorder alerts
 * - creates slow-moving redistribution suggestions
 */
export async function runAutomation(trigger: string, actor?: SessionUser | null): Promise<AutomationSummary> {
  const today = new Date().toISOString().slice(0, 10);

  const quarantined = await db
    .update(batches)
    .set({ status: "quarantined" })
    .where(and(eq(batches.status, "available"), sql`${batches.expiryDate} <= ${today}`))
    .returning({ id: batches.id });

  await db
    .delete(alerts)
    .where(and(inArray(alerts.type, ["expiry", "reorder", "slow_moving"]), eq(alerts.status, "open")));

  const stock = await getStockRows({ includeZero: false });
  const velocity = await getVelocity(null);

  const pending: (typeof alerts.$inferInsert)[] = [];

  // 3-tier expiry alerts
  for (const row of stock) {
    if (row.quantity <= 0) continue;
    if (row.tier === "ok") continue;
    const label =
      row.tier === "expired"
        ? "Expired batch quarantined"
        : row.tier === "red"
          ? "Near-expiry: 1 month"
          : row.tier === "orange"
            ? "Expiry alert: 3 months"
            : "Early warning: 6 months";
    pending.push({
      type: "expiry",
      severity: row.tier,
      locationId: row.locationId,
      productId: row.productId,
      batchId: row.batchId,
      title: `${label} — ${row.name}`,
      message: `Batch ${row.batchNumber} (${row.quantity} ${row.uom}) at ${row.locationName} expires ${row.expiryDate} (${row.daysToExpiry} days). ${
        row.tier === "expired"
          ? "Hard locked: returns/disposal only."
          : row.tier === "red"
            ? "Transfers and dispatch locked; local dispensation only."
            : "Eligible for redistribution if slow-moving."
      }`,
    });
  }

  // Low stock / reorder alerts
  const groups = new Map<string, { locationId: number; locationName: string; productId: number; name: string; onHand: number; reorderLevel: number; uom: string }>();
  for (const row of stock) {
    const key = `${row.locationId}-${row.productId}`;
    const existing = groups.get(key);
    if (existing) existing.onHand += row.quantity;
    else
      groups.set(key, {
        locationId: row.locationId,
        locationName: row.locationName,
        productId: row.productId,
        name: row.name,
        onHand: row.quantity,
        reorderLevel: row.reorderLevel,
        uom: row.uom,
      });
  }
  let reorderAlerts = 0;
  for (const g of groups.values()) {
    if (g.onHand > g.reorderLevel) continue;
    reorderAlerts += 1;
    pending.push({
      type: "reorder",
      severity: g.onHand === 0 ? "red" : g.onHand <= g.reorderLevel / 2 ? "orange" : "yellow",
      locationId: g.locationId,
      productId: g.productId,
      title: `Reorder point breached — ${g.name}`,
      message: `${g.locationName} holds ${g.onHand} ${g.uom} against a reorder level of ${g.reorderLevel}. Raise a warehouse indent.`,
    });
  }

  // Slow-moving redistribution suggestions
  let slowMovingAlerts = 0;
  let suggestions = 0;
  const slowRows = velocity.filter(
    (v) => v.locationType === "branch" && v.onHand > 0 && (v.classification === "slow" || v.classification === "no-movement"),
  );
  for (const slow of slowRows) {
    const fastElsewhere = velocity.find(
      (v) =>
        v.productId === slow.productId &&
        v.locationId !== slow.locationId &&
        v.locationType === "branch" &&
        (v.classification === "fast" || v.classification === "moving"),
    );
    slowMovingAlerts += 1;
    if (fastElsewhere) suggestions += 1;
    pending.push({
      type: "slow_moving",
      severity: "info",
      locationId: slow.locationId,
      productId: slow.productId,
      title: `Slow-moving stock — ${slow.productName}`,
      message: `${slow.onHand} units at ${slow.locationName} moved only ${slow.dispensed30} units in 30 days.${
        fastElsewhere
          ? ` Suggest inter-branch transfer to ${fastElsewhere.locationName} (${fastElsewhere.dispensed30} units dispensed).`
          : " Consider redistribution or expiry-risk review."
      }`,
    });
  }

  for (let i = 0; i < pending.length; i += 200) {
    await db.insert(alerts).values(pending.slice(i, i + 200));
  }

  const summary: AutomationSummary = {
    trigger,
    expiredQuarantined: quarantined.length,
    expiryAlerts: pending.filter((p) => p.type === "expiry").length,
    reorderAlerts,
    slowMovingAlerts,
    suggestions,
    ranAt: new Date().toISOString(),
  };

  await db.insert(automationRuns).values({ trigger, summary });
  await logAudit({
    user: actor ?? null,
    userName: actor?.name ?? "Automation Engine",
    action: "automation.run",
    entityType: "automation",
    details: `Expiry alerts ${summary.expiryAlerts}, reorder ${summary.reorderAlerts}, quarantined ${summary.expiredQuarantined}`,
  });

  return summary;
}

export async function generateAlertsIfEmpty() {
  const existing = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(alerts)
    .where(eq(alerts.status, "open"));
  if (Number(existing[0]?.count ?? 0) === 0) {
    await runAutomation("bootstrap");
  }
}

export async function expirySummary(scopeIds: number[] | null) {
  const rows = await getStockRows({ locationIds: scopeIds, includeZero: false });
  const counts: Record<string, number> = { yellow: 0, orange: 0, red: 0, expired: 0, ok: 0 };
  const units: Record<string, number> = { yellow: 0, orange: 0, red: 0, expired: 0, ok: 0 };
  for (const r of rows) {
    counts[r.tier] += 1;
    units[r.tier] += r.quantity;
  }
  return { counts, units };
}

export function tierBuckets() {
  const now = new Date();
  return { now, daysToExpiry, expiryTier };
}
