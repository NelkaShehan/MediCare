"use client";

import { useMemo, useState } from "react";
import { Link } from "@/components/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { ArrowRight, Package, Plus, Truck, Warehouse } from "lucide-react";

import { useSession } from "@/components/app-shell";
import { Card, EmptyState, InfoBanner, PageHeader, StatusPill, TableSkeleton } from "@/components/ui";
import { apiPost, useApi, withToken } from "@/lib/client";
import { formatDate } from "@/lib/shared";

type StvRow = {
  id: number;
  code: string;
  type: string;
  status: string;
  sourceName: string;
  destinationName: string;
  createdByName: string;
  createdAt: string;
  lineCount: number;
  totalUnits: number;
  preview: string[];
};

type IndentRow = {
  id: number;
  code: string;
  branchName: string;
  status: string;
  priority: string;
  items: { productName: string; requestedQty: number; approvedQty: number }[];
};

export default function StvsPage() {
  const user = useSession();
  const router = useRouter();
  const stvs = useApi<{ rows: StvRow[] }>("/api/stvs");
  const indents = useApi<{ rows: IndentRow[] }>(user.role === "central_admin" || user.role === "warehouse_staff" ? "/api/indents" : null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [busy, setBusy] = useState<number | null>(null);

  const rows = useMemo(() => {
    return (stvs.data?.rows ?? []).filter(
      (row) => (statusFilter === "all" || row.status === statusFilter) && (typeFilter === "all" || row.type === typeFilter),
    );
  }, [stvs.data, statusFilter, typeFilter]);

  const pendingPick = useMemo(() => {
    const withStv = new Set((stvs.data?.rows ?? []).map((row) => row.code));
    void withStv;
    const indentIdsWithStv = new Set<number>();
    for (const row of stvs.data?.rows ?? []) {
      if ("indentId" in row && row.indentId) indentIdsWithStv.add(row.indentId as number);
    }
    return (indents.data?.rows ?? []).filter((indent) => indent.status === "approved" && !indentIdsWithStv.has(indent.id));
  }, [indents.data, stvs.data]);

  async function generate(indent: IndentRow) {
    setBusy(indent.id);
    try {
      const response = await apiPost<{ stv: { id: number; code: string } }>("/api/stvs", { indentId: indent.id });
      toast.success(`${response.stv.code} generated with FEFO batch allocation`);
      stvs.refresh();
      indents.refresh();
      router.push(withToken(`/stvs/${response.stv.id}`));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to generate pick list");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Stock transfer vouchers"
        subtitle="Warehouse replenishment and inter-branch transfers. Every transition is audited with user, timestamp, previous state, new state and reason."
        icon={<Truck className="h-5 w-5" />}
        actions={
          <Link href="/indents" className="btn btn-ghost btn-sm">
            <Package className="h-3.5 w-3.5" /> Approved indents
          </Link>
        }
      />

      {user.role === "warehouse_staff" || user.role === "central_admin" ? (
        <Card>
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Ready to pick · approved indents</h2>
              <p className="text-[11px] text-slate-500">Generate a pick list to auto-allocate batches sorted by earliest expiry (FEFO).</p>
            </div>
            <span className="chip border-teal-200 bg-teal-50 text-teal-700">{pendingPick.length} queued</span>
          </div>
          {indents.loading ? (
            <TableSkeleton rows={2} />
          ) : pendingPick.length === 0 ? (
            <EmptyState title="No indents waiting for picking" description="Approved branch indents appear here for warehouse fulfilment." icon={<Warehouse className="h-5 w-5" />} />
          ) : (
            <div className="divide-y divide-slate-100">
              {pendingPick.map((indent) => (
                <div key={indent.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-slate-800">{indent.code}</p>
                      <span className="chip border-slate-200 bg-slate-50 text-slate-600">{indent.branchName}</span>
                      {indent.priority === "emergency" ? <span className="chip border-red-200 bg-red-50 text-red-700">Emergency</span> : null}
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {indent.items.map((item) => `${item.productName} × ${item.approvedQty || item.requestedQty}`).join(" · ")}
                    </p>
                  </div>
                  <button className="btn-primary btn-sm" disabled={busy === indent.id} onClick={() => generate(indent)}>
                    <Plus className="h-3.5 w-3.5" /> {busy === indent.id ? "Allocating…" : "Generate pick list"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {["all", "Created", "Picking", "Packed & Verified", "In-Transit", "Delivered", "GRN Posted", "Cancelled"].map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition ${
                statusFilter === status
                  ? status === "all"
                    ? "border-slate-900 bg-gradient-to-r from-slate-800 to-slate-900 text-white shadow-sm"
                    : status === "Created"
                      ? "border-slate-400 bg-gradient-to-r from-slate-600 to-slate-800 text-white shadow-sm"
                      : status === "Picking"
                        ? "border-amber-300 bg-gradient-to-r from-amber-400 to-yellow-400 text-amber-950 shadow-sm"
                        : status === "Packed & Verified"
                          ? "border-indigo-300 bg-gradient-to-r from-indigo-500 to-blue-600 text-white shadow-sm"
                          : status === "In-Transit"
                            ? "border-sky-300 bg-gradient-to-r from-sky-500 to-cyan-500 text-white shadow-sm"
                            : status === "Delivered"
                              ? "border-teal-300 bg-gradient-to-r from-teal-500 to-emerald-500 text-white shadow-sm"
                              : status === "GRN Posted"
                                ? "border-emerald-300 bg-gradient-to-r from-emerald-500 to-green-600 text-white shadow-sm"
                                : "border-rose-300 bg-gradient-to-r from-rose-500 to-red-600 text-white shadow-sm"
                  : "border-slate-200 bg-white text-slate-500 hover:border-teal-300 hover:bg-teal-50/50"
              }`}
            >
              {status === "all" ? "All states" : status}
            </button>
          ))}
        </div>
        <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="input ml-auto h-9 w-44 py-1.5 text-xs">
          <option value="all">All voucher types</option>
          <option value="warehouse">Warehouse</option>
          <option value="inter_branch">Inter-branch</option>
        </select>
      </div>

      <Card>
        {stvs.loading ? (
          <TableSkeleton rows={6} />
        ) : rows.length === 0 ? (
          <EmptyState title="No transfer vouchers" description="Pick lists generated from approved indents and inter-branch transfers appear here." icon={<Truck className="h-5 w-5" />} />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th className="th">Voucher</th>
                  <th className="th">Route</th>
                  <th className="th">Contents</th>
                  <th className="th">Units</th>
                  <th className="th">Status</th>
                  <th className="th">Created</th>
                  <th className="th" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/60">
                    <td className="td">
                      <p className="font-semibold text-slate-800">{row.code}</p>
                      <p className="text-[10px] uppercase tracking-wide text-slate-400">{row.type === "warehouse" ? "Warehouse → Branch" : "Branch → Branch"}</p>
                    </td>
                    <td className="td text-xs">
                      <span className="font-medium text-slate-700">{row.sourceName}</span>
                      <ArrowRight className="mx-1 inline h-3 w-3 text-slate-400" />
                      <span className="font-medium text-slate-700">{row.destinationName}</span>
                    </td>
                    <td className="td max-w-[240px]">
                      <p className="truncate text-[11px] text-slate-600">{row.preview.join(" · ") || "—"}</p>
                      <p className="text-[10px] text-slate-400">{row.lineCount} line(s)</p>
                    </td>
                    <td className="td font-semibold">{row.totalUnits}</td>
                    <td className="td">
                      <StatusPill status={row.status} />
                    </td>
                    <td className="td text-xs text-slate-500">{formatDate(row.createdAt)}</td>
                    <td className="td text-right">
                      <Link href={`/stvs/${row.id}`} className="text-[11px] font-semibold text-teal-700 hover:text-teal-800">
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <InfoBanner tone="warning" title="Stock movement rule">
        Dispatch deducts source stock and moves the voucher to <strong>In-Transit</strong>. Destination stock is <strong>not</strong> increased until the receiving branch
        manager verifies quantities and posts the GRN. Dispatched vouchers cannot be deleted or silently edited.
      </InfoBanner>
    </div>
  );
}
