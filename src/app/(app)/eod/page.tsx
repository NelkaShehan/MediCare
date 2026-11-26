"use client";

import { startTransition, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { CalendarCheck, ClipboardCheck, Download, Lock, Pill, RefreshCw, UserRound } from "lucide-react";

import { useSession } from "@/components/app-shell";
import { Card, EmptyState, Field, InfoBanner, PageHeader, StatCard, TableSkeleton } from "@/components/ui";
import { apiPost, downloadCsv, useApi } from "@/lib/client";
import { formatDate, formatDateTime } from "@/lib/shared";

type EodRow = { productId: number; productName: string; sku: string; uom: string; quantity: number; lines: number; batches: string; lastDispensedAt: string };
type EodResponse = {
  date: string;
  locationId: number;
  rows: EodRow[];
  totals: { units: number; lines: number; products: number };
  sheet: { id: number; status: string; notes: string | null; reconciledByName: string; reconciledAt: string | null } | null;
  byPharmacist: { pharmacistId: number; pharmacistName: string; quantity: number; lines: number; products: number; lastAt: string; isMe: boolean }[];
  canReconcile: boolean;
  viewer: { id: number; name: string; role: string };
};

export default function EodPage() {
  const user = useSession();
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const { data, loading, error, refresh } = useApi<EodResponse>(`/api/eod?date=${date}`);

  useEffect(() => {
    startTransition(() => setNotes(data?.sheet?.notes ?? ""));
  }, [data?.sheet?.notes, date]);

  async function submit(action: "save" | "reconcile") {
    setBusy(true);
    try {
      await apiPost("/api/eod", { date, notes, action });
      toast.success(action === "reconcile" ? "EOD sheet reconciled and locked" : "EOD draft saved");
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to save EOD sheet");
    } finally {
      setBusy(false);
    }
  }

  const canReconcile = data?.canReconcile ?? (user.role === "branch_manager" || user.role === "central_admin");
  const mine = (data?.byPharmacist ?? []).find((row) => row.isMe) ?? null;
  const isPharmacist = user.role === "pharmacist";

  return (
    <div className="space-y-5">
      <PageHeader
        title="End-of-day stock reconciliation"
        subtitle="Aggregated dispensing record for the selected date. Managers compare against the physical shelf count and reconcile the sheet."
        icon={<ClipboardCheck className="h-5 w-5" />}
        actions={
          <>
            <button className="btn btn-ghost btn-sm" onClick={refresh}>
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                if (!data || data.rows.length === 0) return toast.error("Nothing to export");
                downloadCsv(`eod-${date}.csv`, data.rows.map((row) => ({ Medicine: row.productName, SKU: row.sku, Quantity: row.quantity, UOM: row.uom, Batches: row.batches })));
                toast.success("EOD sheet exported");
              }}
            >
              <Download className="h-3.5 w-3.5" /> Export CSV
            </button>
          </>
        }
      />

      {error ? (
        error.toLowerCase().includes("no branch")
          ? (
            <InfoBanner tone="warning" title="Your account has no branch assigned" icon={<Lock className="h-4 w-4" />}>
              Ask your administrator to open <strong>Users &amp; roles → Manage</strong> and assign you to a branch. Once assigned, your daily dispensing sheet appears here
              automatically.
            </InfoBanner>
          )
          : <InfoBanner tone="danger" title="Unable to load EOD data">{error}</InfoBanner>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Units dispensed" value={data?.totals.units ?? 0} hint="Manual stock-outs" icon={<CalendarCheck className="h-5 w-5" />} tone="teal" />
        <StatCard label="Dispensing records" value={data?.totals.lines ?? 0} hint="Individual stock-out entries" icon={<ClipboardCheck className="h-5 w-5" />} tone="sky" />
        <StatCard label="Distinct medicines" value={data?.totals.products ?? 0} hint="Across all batches" icon={<CalendarCheck className="h-5 w-5" />} tone="slate" />
        <StatCard
          label="My dispensing"
          value={`${mine?.quantity ?? 0} units`}
          hint={`${mine?.lines ?? 0} records · ${mine?.products ?? 0} medicines by you`}
          icon={<Pill className="h-5 w-5" />}
          tone="sky"
        />
        <StatCard
          label="Sheet status"
          value={data?.sheet?.status ? data.sheet.status : "not created"}
          hint={data?.sheet?.reconciledByName ? `By ${data.sheet.reconciledByName}` : "Draft not yet reconciled"}
          icon={<ClipboardCheck className="h-5 w-5" />}
          tone={data?.sheet?.status === "reconciled" ? "emerald" : "amber"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3.5">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Dispensing summary · {formatDate(date)}</h2>
              <p className="text-[11px] text-slate-500">Grouped per medicine, with all contributing batches</p>
            </div>
            <input type="date" value={date} max={today} onChange={(event) => setDate(event.target.value)} className="input h-9 w-40 py-1.5 text-xs" />
          </div>
          {loading ? (
            <TableSkeleton rows={5} />
          ) : (data?.rows ?? []).length === 0 ? (
            <EmptyState title="No dispensing recorded" description="Pharmacist stock-outs for the selected date will appear here." icon={<ClipboardCheck className="h-5 w-5" />} />
          ) : (
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th className="th">Medicine</th>
                    <th className="th">Batches used</th>
                    <th className="th">Records</th>
                    <th className="th">Quantity</th>
                    <th className="th">Last dispensed</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.rows ?? []).map((row) => (
                    <tr key={row.productId} className="hover:bg-slate-50/60">
                      <td className="td">
                        <p className="text-xs font-semibold text-slate-800">{row.productName}</p>
                        <p className="text-[10px] text-slate-500">{row.sku}</p>
                      </td>
                      <td className="td max-w-[220px] truncate font-mono text-[10px] text-slate-500">{row.batches}</td>
                      <td className="td text-xs">{row.lines}</td>
                      <td className="td text-xs font-semibold">{row.quantity} {row.uom}</td>
                      <td className="td text-[11px] text-slate-500">{formatDateTime(row.lastDispensedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card>
            <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-indigo-50 via-white to-white px-5 py-3.5 dark:from-indigo-950/40 dark:via-transparent dark:to-transparent">
              <div>
                <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 text-white">
                    <UserRound className="h-3.5 w-3.5" />
                  </span>
                  Dispensed by pharmacist
                </h2>
                <p className="text-[11px] text-slate-500">Who recorded what on {formatDate(date)}</p>
              </div>
              <span className="chip border-indigo-200 bg-indigo-50 text-indigo-700">{(data?.byPharmacist ?? []).length}</span>
            </div>
            <div className="divide-y divide-slate-100">
              {(data?.byPharmacist ?? []).map((row) => (
                <div key={`${row.pharmacistId}-${row.pharmacistName}`} className="flex items-center justify-between gap-2 px-5 py-2.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold text-white ${row.isMe ? "bg-gradient-to-br from-teal-500 to-emerald-500" : "bg-gradient-to-br from-slate-500 to-slate-700"}`}>
                      {row.pharmacistName.split(" ").map((part) => part[0]).slice(0, 2).join("")}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[11px] font-semibold text-slate-800">
                        {row.pharmacistName} {row.isMe ? <span className="chip ml-1 border-teal-200 bg-teal-50 text-[9px] text-teal-700">you</span> : null}
                      </p>
                      <p className="text-[10px] text-slate-500">{row.lines} records · {row.products} medicines</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold text-slate-900">{row.quantity} units</p>
                    <p className="text-[10px] text-slate-400">{formatDateTime(row.lastAt)}</p>
                  </div>
                </div>
              ))}
              {(data?.byPharmacist ?? []).length === 0 ? (
                <p className="px-5 py-5 text-center text-[11px] text-slate-500">No dispensations recorded for this date.</p>
              ) : null}
            </div>
          </Card>

          <Card className="card-pad">
            <h2 className="text-sm font-semibold text-slate-900">Reconciliation</h2>
            <p className="mt-1 text-[11px] text-slate-500">
              Record any variance in the notes, then reconcile to lock the sheet. Reconciled sheets are retained for audit.
            </p>
            <div className="mt-3 space-y-3">
              <Field label="Notes / variance explanation">
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={4}
                  className="input"
                  placeholder="Physical count matched system. No variance."
                  disabled={data?.sheet?.status === "reconciled" && !canReconcile}
                />
              </Field>
              <button className="btn-ghost w-full btn-sm" disabled={busy} onClick={() => submit("save")}>
                Save draft{isPharmacist ? " (my entries)" : ""}
              </button>
              {canReconcile ? (
                <button className="btn-primary w-full btn-sm" disabled={busy} onClick={() => submit("reconcile")}>
                  <ClipboardCheck className="h-3.5 w-3.5" /> {busy ? "Saving…" : "Reconcile & lock sheet"}
                </button>
              ) : (
                <p className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-900">
                  <Lock className="mt-0.5 h-3 w-3 shrink-0" />
                  You can review and save the draft. Only a Branch Manager or Central Admin can reconcile and lock the sheet.
                </p>
              )}
              {data?.sheet?.reconciledAt ? (
                <p className="text-[10px] text-emerald-700">Reconciled by {data.sheet.reconciledByName} · {formatDateTime(data.sheet.reconciledAt)}</p>
              ) : null}
            </div>
          </Card>

          <InfoBanner tone="info" title="EOD control">
            Stock-out entries are immutable. Corrections must be raised as a new dispensing entry or an expired return, preserving the audit trail.
          </InfoBanner>
        </div>
      </div>
    </div>
  );
}
