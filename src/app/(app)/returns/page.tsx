"use client";

import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { CheckCircle2, Lock, PackageX, Plus, Trash2, Undo2 } from "lucide-react";

import { useSession } from "@/components/app-shell";
import { Card, EmptyState, ExpiryBadge, Field, InfoBanner, Modal, PageHeader, TableSkeleton } from "@/components/ui";
import { apiPatch, apiPost, useApi } from "@/lib/client";
import { formatDate, formatDateTime, type StockRow } from "@/lib/shared";

type ReturnItem = { batchNumber: string; expiryDate: string; quantity: number; reason: string | null; productName: string; uom: string };
type ReturnRow = {
  id: number;
  code: string;
  locationName: string;
  createdByName: string;
  status: string;
  note: string | null;
  createdAt: string;
  processedAt: string | null;
  items: ReturnItem[];
};

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 border-amber-200",
  received: "bg-sky-100 text-sky-800 border-sky-200",
  disposed: "bg-slate-200 text-slate-700 border-slate-300",
};

export default function ReturnsPage() {
  const user = useSession();
  const returns = useApi<{ rows: ReturnRow[] }>("/api/returns");
  const inventory = useApi<{ rows: StockRow[] }>("/api/inventory?pageSize=100");
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [selected, setSelected] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);

  const eligible = useMemo(() => (inventory.data?.rows ?? []).filter((row) => row.dispenseLocked && row.quantity > 0), [inventory.data]);

  async function submit() {
    const items = Object.entries(selected)
      .filter(([, quantity]) => Number(quantity) > 0)
      .map(([batchId, quantity]) => ({ batchId: Number(batchId), quantity: Number(quantity), reason: "Expired — disposal" }));
    if (items.length === 0) return toast.error("Select at least one expired batch and quantity");
    setBusy(true);
    try {
      await apiPost("/api/returns", { note, items });
      toast.success("Expired stock return submitted to the warehouse");
      setOpen(false);
      setSelected({});
      setNote("");
      returns.refresh();
      inventory.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to submit return");
    } finally {
      setBusy(false);
    }
  }

  async function process(id: number, action: "receive" | "dispose") {
    setBusy(true);
    try {
      await apiPatch("/api/returns", { id, action });
      toast.success(action === "receive" ? "Return received at warehouse" : "Stock disposed & ledger cleared");
      returns.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update return");
    } finally {
      setBusy(false);
    }
  }

  const canCreate = user.role === "branch_manager";
  const canProcess = user.role === "warehouse_staff" || user.role === "central_admin";

  return (
    <div className="space-y-5">
      <PageHeader
        title="Expired stock returns & disposal"
        subtitle="Hard-locked, expired batches are returned to the central warehouse for verified disposal. Stock remains quarantined for the entire workflow."
        icon={<Undo2 className="h-5 w-5" />}
        actions={
          canCreate ? (
            <button className="btn-primary btn-sm" onClick={() => { setOpen(true); inventory.refresh(); }}>
              <Plus className="h-3.5 w-3.5" /> New expired return
            </button>
          ) : null
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Pending receipt", value: (returns.data?.rows ?? []).filter((r) => r.status === "pending").length, tone: "text-amber-700", bg: "from-amber-50 via-white to-yellow-100/60", bar: "from-amber-400 to-yellow-400" },
          { label: "Received", value: (returns.data?.rows ?? []).filter((r) => r.status === "received").length, tone: "text-sky-700", bg: "from-sky-50 via-white to-cyan-100/60", bar: "from-sky-500 to-cyan-400" },
          { label: "Disposed", value: (returns.data?.rows ?? []).filter((r) => r.status === "disposed").length, tone: "text-slate-700", bg: "from-slate-100 via-white to-slate-200/60", bar: "from-slate-600 to-slate-400" },
        ].map((item) => (
          <Card key={item.label} className={`relative overflow-hidden bg-gradient-to-br card-pad ${item.bg}`}>
            <span className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${item.bar}`} />
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{item.label}</p>
            <p className={`mt-1 text-2xl font-bold ${item.tone}`}>{item.value}</p>
          </Card>
        ))}
      </div>

      {returns.loading ? (
        <Card><TableSkeleton rows={5} /></Card>
      ) : (returns.data?.rows ?? []).length === 0 ? (
        <Card>
          <EmptyState title="No expired returns" description="Branch managers raise returns for expired batches; warehouse staff receive and dispose them." icon={<PackageX className="h-5 w-5" />} />
        </Card>
      ) : (
        <div className="space-y-4">
          {(returns.data?.rows ?? []).map((record) => (
            <Card key={record.id}>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-slate-900">{record.code}</p>
                    <span className={`chip ${STATUS_STYLE[record.status] ?? "border-slate-200 bg-slate-50 text-slate-600"}`}>{record.status}</span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {record.locationName} · raised by {record.createdByName} · {formatDate(record.createdAt)}
                    {record.processedAt ? ` · processed ${formatDateTime(record.processedAt)}` : ""}
                  </p>
                  {record.note ? <p className="mt-1 text-[11px] italic text-slate-500">“{record.note}”</p> : null}
                </div>
                {canProcess && record.status !== "disposed" ? (
                  <div className="flex gap-2">
                    {record.status === "pending" ? (
                      <button className="btn-primary btn-sm" disabled={busy} onClick={() => process(record.id, "receive")}>
                        <CheckCircle2 className="h-3.5 w-3.5" /> Receive
                      </button>
                    ) : null}
                    <button className="btn-danger btn-sm" disabled={busy} onClick={() => process(record.id, "dispose")}>
                      <Trash2 className="h-3.5 w-3.5" /> Dispose
                    </button>
                  </div>
                ) : null}
              </div>
              <div className="overflow-x-auto">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th className="th">Medicine</th>
                      <th className="th">Batch</th>
                      <th className="th">Expiry</th>
                      <th className="th">Quantity</th>
                      <th className="th">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {record.items.map((item, index) => (
                      <tr key={index}>
                        <td className="td text-xs font-medium text-slate-800">{item.productName}</td>
                        <td className="td font-mono text-[11px]">{item.batchNumber}</td>
                        <td className="td text-xs">{formatDate(item.expiryDate)}</td>
                        <td className="td text-xs font-semibold">{item.quantity} {item.uom}</td>
                        <td className="td text-[11px] text-slate-500">{item.reason ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}
        </div>
      )}

      <InfoBanner tone="danger" title="Expired stock is locked everywhere else" icon={<Lock className="h-4 w-4" />}>
        Expired batches cannot be dispensed, picked, dispatched or transferred. The automation engine quarantines them within an hour of expiry, and quantity is cleared
        from the ledger only when warehouse staff post the disposal.
      </InfoBanner>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Raise expired stock return"
        description={`Select expired or quarantined batches at ${user.locationName}. Quantities are locked while in transit.`}
        size="lg"
        footer={
          <>
            <button className="btn-ghost btn-sm" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn-primary btn-sm" onClick={submit} disabled={busy}>{busy ? "Submitting…" : "Submit return"}</button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {eligible.length === 0 ? (
              <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">No expired or quarantined batches found at this location.</p>
            ) : (
              eligible.map((row) => (
                <div key={row.batchId} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-slate-800">{row.name}</p>
                    <p className="text-[10px] text-slate-500">{row.batchNumber} · {row.quantity} {row.uom} available</p>
                    <div className="mt-0.5"><ExpiryBadge tier={row.tier} days={row.daysToExpiry} lockLabel={row.lockLabel} /></div>
                  </div>
                  <input
                    type="number"
                    min={0}
                    max={row.quantity}
                    value={selected[row.batchId] ?? ""}
                    onChange={(event) => setSelected((prev) => ({ ...prev, [row.batchId]: event.target.value }))}
                    placeholder="Qty"
                    className="input w-20 py-1.5 text-xs"
                  />
                </div>
              ))
            )}
          </div>
          <Field label="Return note">
            <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} className="input" placeholder="Identified during EOD count; storage seal intact." />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
