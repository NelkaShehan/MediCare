"use client";

import { startTransition, useEffect, useState } from "react";
import { Link } from "@/components/link";
import toast from "react-hot-toast";
import { BellRing, Check, ChevronRight, Flame, Lock, Play, RefreshCw, ShieldAlert, Sparkles, Timer } from "lucide-react";

import { useSession } from "@/components/app-shell";
import { Card, EmptyState, InfoBanner, PageHeader, StatCard, TableSkeleton } from "@/components/ui";
import { apiPost, useApi } from "@/lib/client";
import { formatDateTime, TIER_META, type ExpiryTier } from "@/lib/shared";

type AlertRow = {
  id: number;
  type: string;
  severity: string;
  title: string;
  message: string;
  status: string;
  locationName: string | null;
  createdAt: string;
};

type AlertResponse = { rows: AlertRow[]; counts: { yellow: number; orange: number; red: number; expired: number; info: number; total: number } };

const FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "All alerts" },
  { key: "yellow", label: "6-month warning" },
  { key: "orange", label: "3-month priority" },
  { key: "red", label: "1-month critical" },
  { key: "expired", label: "Expired / quarantined" },
  { key: "info", label: "Slow-moving suggestions" },
];

export default function ExpiryAlertsPage() {
  const user = useSession();
  const [severity, setSeverity] = useState<string>("all");
  const [status, setStatus] = useState<string>("open");
  const [running, setRunning] = useState(false);
  const alerts = useApi<AlertResponse>(`/api/alerts?status=${status}${severity !== "all" ? `&severity=${severity}` : ""}`);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tier = params.get("tier");
    if (tier && FILTERS.some((filter) => filter.key === tier)) startTransition(() => setSeverity(tier));
  }, []);

  async function runAutomation() {
    setRunning(true);
    try {
      const response = await apiPost<{ summary: { expiryAlerts: number; reorderAlerts: number; expiredQuarantined: number; suggestions: number } }>("/api/automation", {});
      toast.success(
        `Scan complete · ${response.summary.expiryAlerts} expiry, ${response.summary.reorderAlerts} reorder, ${response.summary.expiredQuarantined} quarantined`,
      );
      alerts.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Automation failed");
    } finally {
      setRunning(false);
    }
  }

  async function acknowledge(id: number) {
    await apiPost("/api/alerts", { id });
    toast.success("Alert acknowledged");
    alerts.refresh();
  }

  const rows = alerts.data?.rows ?? [];
  const counts = alerts.data?.counts ?? { yellow: 0, orange: 0, red: 0, expired: 0, info: 0, total: 0 };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Expiry alert centre"
        subtitle="Three-tier colour-coded monitoring across every location. Rules are enforced on dispensation, dispatch and inter-branch transfer."
        icon={<BellRing className="h-5 w-5" />}
        actions={
          <>
            <button className="btn btn-ghost btn-sm" onClick={() => alerts.refresh()}>
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </button>
            {user.role === "central_admin" ? (
              <button className="btn-primary btn-sm" onClick={runAutomation} disabled={running}>
                <Play className="h-3.5 w-3.5" /> {running ? "Scanning…" : "Run automation now"}
              </button>
            ) : null}
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="6-month warning" value={counts.yellow} hint="Redistribute if slow-moving" icon={<Timer className="h-5 w-5" />} tone="amber" />
        <StatCard label="3-month priority" value={counts.orange} hint="Prioritise FEFO dispensing" icon={<Flame className="h-5 w-5" />} tone="orange" />
        <StatCard label="1-month critical" value={counts.red} hint="Transfers locked · local only" icon={<ShieldAlert className="h-5 w-5" />} tone="rose" />
        <StatCard label="Expired / quarantined" value={counts.expired} hint="Hard locked · return only" icon={<Lock className="h-5 w-5" />} tone="slate" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {FILTERS.map((filter) => (
            <button
              key={filter.key}
              onClick={() => setSeverity(filter.key)}
              className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition ${
                severity === filter.key
                  ? filter.key === "all"
                    ? "border-slate-900 bg-slate-900 text-white"
                    : `${TIER_META[filter.key as ExpiryTier].badge} border-current`
                  : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <select value={status} onChange={(event) => setStatus(event.target.value)} className="input ml-auto h-9 w-40 py-1.5 text-xs">
          <option value="open">Open alerts</option>
          <option value="acknowledged">Acknowledged</option>
          <option value="all">All alerts</option>
        </select>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Alert feed</h2>
              <p className="text-[11px] text-slate-500">Generated by the daily automation sweep and regenerated on demand.</p>
            </div>
            <span className="chip border-slate-200 bg-slate-50 text-slate-600">{rows.length} shown</span>
          </div>
          {alerts.loading ? (
            <TableSkeleton rows={6} />
          ) : rows.length === 0 ? (
            <EmptyState title="No alerts in this view" description="Run the automation scan or widen the filters." icon={<BellRing className="h-5 w-5" />} />
          ) : (
            <div className="max-h-[620px] divide-y divide-slate-100 overflow-y-auto">
              {rows.map((alert) => {
                const meta = TIER_META[(alert.severity as ExpiryTier) ?? "ok"] ?? TIER_META.ok;
                return (
                  <div key={alert.id} className="flex items-start gap-3 px-5 py-3.5 hover:bg-slate-50/60">
                    <span className={`mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${meta.badge}`}>
                      {alert.severity === "expired" || alert.severity === "red" ? <Lock className="h-3.5 w-3.5" /> : <Timer className="h-3.5 w-3.5" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="text-xs font-semibold text-slate-800">{alert.title}</p>
                        <span className={`chip ${meta.badge}`}>{alert.severity}</span>
                        <span className="chip border-slate-200 bg-slate-50 capitalize text-slate-500">{alert.type.replace("_", " ")}</span>
                        {alert.status !== "open" ? <span className="chip border-slate-200 bg-slate-100 text-slate-500">{alert.status}</span> : null}
                      </div>
                      <p className="mt-1 text-[11px] leading-relaxed text-slate-600">{alert.message}</p>
                      <p className="mt-1 text-[10px] text-slate-400">
                        {alert.locationName ?? "Network-wide"} · {formatDateTime(alert.createdAt)}
                      </p>
                    </div>
                    {alert.status === "open" ? (
                      <button onClick={() => acknowledge(alert.id)} className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-emerald-50 hover:text-emerald-700" title="Acknowledge">
                        <Check className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card className="card-pad">
            <h2 className="text-sm font-semibold text-slate-900">Smart locking rules</h2>
            <div className="mt-3 space-y-2">
              {[
                { tier: "yellow", title: "Early warning · < 6 months", text: "Move slow-moving stock through inter-branch transfer." },
                { tier: "orange", title: "Medium priority · < 3 months", text: "Prioritise manual dispensing via FEFO." },
                { tier: "red", title: "Near expiry · < 1 month", text: "Transfer & warehouse dispatch locked. Local dispensing needs confirmation." },
                { tier: "expired", title: "Expired · hard lock", text: "No dispensing or transfers. Auto-quarantined, return to warehouse only." },
              ].map((rule) => (
                <div key={rule.tier} className={`rounded-xl border p-2.5 ${TIER_META[rule.tier as ExpiryTier].badge}`}>
                  <p className="text-[11px] font-bold">{rule.title}</p>
                  <p className="mt-0.5 text-[10px] leading-relaxed opacity-90">{rule.text}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card className="card-pad">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-teal-600" />
              <h2 className="text-sm font-semibold text-slate-900">Automation schedule</h2>
            </div>
            <ul className="mt-2 space-y-2 text-[11px] text-slate-600">
              <li className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 rounded-full bg-teal-500" /> Daily 02:00 — full inventory scan, expiry tiers, reorder points, slow-moving redistribution.</li>
              <li className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 rounded-full bg-teal-500" /> Hourly — expiry sweep re-quarantines newly expired batches.</li>
              <li className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 rounded-full bg-teal-500" /> Every transition writes an immutable audit record.</li>
            </ul>
            <Link href="/returns" className="btn-ghost btn-sm mt-3 w-full">
              Expired stock returns <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </Card>
        </div>
      </div>

      <InfoBanner tone="warning" title="Locked stock cannot move">
        Near-expiry red batches are excluded from FEFO pick lists and inter-branch allocations by the backend, not just the UI. Expired batches are automatically
        quarantined by the scheduler and can only be cleared by posting a disposal GRN.
      </InfoBanner>
    </div>
  );
}
