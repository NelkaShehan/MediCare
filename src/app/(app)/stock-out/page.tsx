"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { AlertTriangle, CheckCircle2, Clock, Lock, Pill, Search, ShoppingCart, X } from "lucide-react";

import { useSession } from "@/components/app-shell";
import { Card, EmptyState, ExpiryBadge, Field, InfoBanner, Modal, PageHeader, TableSkeleton } from "@/components/ui";
import { ApiError, apiPost, useApi } from "@/lib/client";
import { daysToExpiry, formatDate, formatDateTime, type StockRow } from "@/lib/shared";

type InventoryResponse = { rows: StockRow[]; total: number };
type StockOutRow = {
  id: number;
  code: string;
  productName: string;
  sku: string;
  batchNumber: string;
  quantity: number;
  uom: string;
  pharmacistName: string;
  reference: string | null;
  note: string | null;
  createdAt: string;
};

export default function StockOutPage() {
  const user = useSession();
  const inventory = useApi<InventoryResponse>("/api/inventory?pageSize=100");
  const history = useApi<{ rows: StockOutRow[] }>("/api/stock-out");

  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmBatch, setConfirmBatch] = useState<StockRow | null>(null);
  const [result, setResult] = useState<{ code: string; product: string; quantity: number; remaining: number } | null>(null);

  const rows = useMemo(() => inventory.data?.rows ?? [], [inventory.data]);
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows
      .filter((row) => row.quantity > 0)
      .filter(
        (row) =>
          !term ||
          row.name.toLowerCase().includes(term) ||
          row.sku.toLowerCase().includes(term) ||
          row.batchNumber.toLowerCase().includes(term) ||
          (row.genericName ?? "").toLowerCase().includes(term),
      )
      .sort((a, b) => a.daysToExpiry - b.daysToExpiry)
      .slice(0, 30);
  }, [rows, search]);

  const selected = rows.find((row) => row.batchId === selectedId) ?? null;

  useEffect(() => {
    startTransition(() => {
      setQuantity("1");
      setReference("");
      setNote("");
    });
  }, [selectedId]);

  async function submit(forceNearExpiry = false) {
    if (!selected) return toast.error("Select a batch first");
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) return toast.error("Enter a valid quantity");
    if (qty > selected.quantity) return toast.error(`Only ${selected.quantity} ${selected.uom} available`);

    if (selected.tier === "red" && !forceNearExpiry) {
      setConfirmBatch(selected);
      return;
    }

    setSubmitting(true);
    try {
      const response = await apiPost<{ code: string; remaining: number }>("/api/stock-out", {
        batchId: selected.batchId,
        quantity: qty,
        reference,
        note,
        confirmNearExpiry: forceNearExpiry,
      });
      toast.success(`Dispensed ${qty} ${selected.uom} · ${response.code}`);
      setResult({ code: response.code, product: selected.name, quantity: qty, remaining: response.remaining });
      setConfirmBatch(null);
      setSelectedId(null);
      inventory.refresh();
      history.refresh();
    } catch (error) {
      if (error instanceof ApiError && error.payload.requiresConfirmation) {
        setConfirmBatch(selected);
      } else {
        toast.error(error instanceof Error ? error.message : "Dispensing failed");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Stock-out · manual dispensing"
        subtitle={`Dispense from ${user.locationName} by selecting the medicine batch manually. FEFO ordering surfaces the earliest expiry first — no barcode scanners.`}
        icon={<Pill className="h-5 w-5" />}
      />

      <InfoBanner tone="info" title="Manual search & select" icon={<ShoppingCart className="h-4 w-4" />}>
        Expired and quarantined batches are disabled. Red-tier batches (&lt; 30 days) can still be dispensed locally but require an explicit confirmation warning.
      </InfoBanner>

      <div className="grid gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <div className="border-b border-slate-100 p-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search medicine name, generic, SKU or batch number…"
                className="input pl-9"
              />
            </div>
            <p className="mt-2 text-[11px] text-slate-500">
              {filtered.length} batch{filtered.length === 1 ? "" : "es"} matching · sorted by earliest expiry (FEFO)
            </p>
          </div>

          {inventory.loading ? (
            <TableSkeleton rows={6} />
          ) : filtered.length === 0 ? (
            <EmptyState title="No batches found" description="Try a different search term. If your branch is out of stock, raise an indent." icon={<Pill className="h-5 w-5" />} />
          ) : (
            <div className="max-h-[460px] divide-y divide-slate-100 overflow-y-auto">
              {filtered.map((row) => {
                const disabled = row.dispenseLocked;
                const active = row.batchId === selectedId;
                return (
                  <button
                    key={row.batchId}
                    disabled={disabled}
                    onClick={() => setSelectedId(row.batchId)}
                    className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition ${
                      disabled
                        ? "cursor-not-allowed bg-slate-50/70 opacity-70"
                        : active
                          ? "bg-gradient-to-r from-teal-50 via-emerald-50 to-white ring-1 ring-inset ring-teal-200"
                          : "hover:bg-slate-50"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-semibold text-slate-800">{row.name}</p>
                        {disabled ? <Lock className="h-3 w-3 shrink-0 text-red-500" /> : null}
                      </div>
                      <p className="truncate text-[11px] text-slate-500">
                        {row.sku} · Batch {row.batchNumber} · {row.quantity} {row.uom} available
                      </p>
                      <p className="text-[10px] text-slate-400">Expires {formatDate(row.expiryDate)}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <ExpiryBadge tier={row.tier} days={row.daysToExpiry} />
                      {disabled ? (
                        <span className="chip border-red-200 bg-red-100 text-red-800">
                          <Lock className="h-3 w-3" /> {row.status === "quarantined" ? "Quarantined" : "Expired"}
                        </span>
                      ) : active ? (
                        <span className="chip border-teal-200 bg-teal-100 text-teal-800">
                          <CheckCircle2 className="h-3 w-3" /> Selected
                        </span>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <div className="relative overflow-hidden border-b border-slate-100 bg-gradient-to-r from-teal-50 via-white to-emerald-50 px-5 py-3.5">
            <span className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-teal-500 to-emerald-400" />
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-teal-500 to-emerald-400 text-white">
                <Pill className="h-3.5 w-3.5" />
              </span>
              Dispensing details
            </h2>
            <p className="text-[11px] text-slate-500">Quantity is deducted atomically from the selected batch.</p>
          </div>

          {!selected ? (
            <EmptyState title="No batch selected" description="Pick a batch from the searchable list to continue." icon={<Pill className="h-5 w-5" />} />
          ) : (
            <div className="space-y-4 p-5">
              <div
                className={`rounded-xl border p-3 ${
                  selected.tier === "red"
                    ? "border-rose-200 bg-gradient-to-br from-rose-50 to-red-100/70"
                    : selected.tier === "orange"
                      ? "border-orange-200 bg-gradient-to-br from-orange-50 to-amber-100/70"
                      : selected.tier === "yellow"
                        ? "border-amber-200 bg-gradient-to-br from-amber-50 to-yellow-100/70"
                        : "border-teal-200 bg-gradient-to-br from-teal-50 to-emerald-100/60"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{selected.name}</p>
                    <p className="text-[11px] text-slate-600">
                      {selected.sku} · {selected.category} · {selected.uom}
                    </p>
                  </div>
                  <ExpiryBadge tier={selected.tier} days={selected.daysToExpiry} />
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-1.5 text-[11px]">
                  <div>
                    <dt className="text-slate-500">Batch</dt>
                    <dd className="font-mono font-semibold text-slate-800">{selected.batchNumber}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Expiry</dt>
                    <dd className="font-semibold text-slate-800">{formatDate(selected.expiryDate)}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Available</dt>
                    <dd className="font-semibold text-slate-800">
                      {selected.quantity} {selected.uom}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Days remaining</dt>
                    <dd className="font-semibold text-slate-800">{daysToExpiry(selected.expiryDate)}</dd>
                  </div>
                </dl>
              </div>

              {selected.tier === "red" ? (
                <InfoBanner tone="danger" title="Near-expiry batch" icon={<AlertTriangle className="h-4 w-4" />}>
                  This batch expires in {selected.daysToExpiry} day(s). Dispensing is allowed locally, but a red-tier confirmation will be required.
                </InfoBanner>
              ) : null}

              <Field label={`Quantity (${selected.uom})`} hint={`Maximum ${selected.quantity} ${selected.uom}`}>
                <input
                  type="number"
                  min={1}
                  max={selected.quantity}
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                  className="input"
                />
              </Field>
              <Field label="Reference / prescription no.">
                <input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="e.g. OPD-RX-1042" className="input" />
              </Field>
              <Field label="Note (optional)">
                <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} className="input" placeholder="Dispensed to OPD patient" />
              </Field>
              <button onClick={() => submit(false)} disabled={submitting} className="btn-primary w-full">
                {submitting ? "Recording…" : "Record stock-out"}
              </button>
              <button onClick={() => setSelectedId(null)} className="btn-ghost w-full">
                <X className="h-3.5 w-3.5" /> Clear selection
              </button>
            </div>
          )}
        </Card>
      </div>

      {result ? (
        <Card className="border-emerald-200 bg-emerald-50/60 p-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" />
            <div>
              <p className="text-sm font-semibold text-emerald-900">
                {result.code} posted · {result.quantity} units of {result.product}
              </p>
              <p className="text-xs text-emerald-700">Remaining batch balance: {result.remaining} units. Stock velocity charts refresh automatically.</p>
            </div>
            <button onClick={() => setResult(null)} className="ml-auto rounded-lg p-1 text-emerald-700 hover:bg-emerald-100">
              <X className="h-4 w-4" />
            </button>
          </div>
        </Card>
      ) : null}

      <Card>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Recent dispensations</h2>
            <p className="text-[11px] text-slate-500">Latest 200 stock-out records for {user.locationName}</p>
          </div>
          <span className="chip border-slate-200 bg-slate-50 text-slate-500">
            <Clock className="h-3 w-3" /> Audit logged
          </span>
        </div>
        {history.loading ? (
          <TableSkeleton rows={4} />
        ) : (history.data?.rows ?? []).length === 0 ? (
          <EmptyState title="No dispensations yet" description="Manual stock-out records appear here and feed the EOD sheet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th className="th">Reference</th>
                  <th className="th">Medicine</th>
                  <th className="th">Batch</th>
                  <th className="th">Qty</th>
                  <th className="th">Pharmacist</th>
                  <th className="th">Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {(history.data?.rows ?? []).slice(0, 25).map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/60">
                    <td className="td font-mono text-[11px] text-slate-600">{row.code}</td>
                    <td className="td">
                      <p className="font-medium text-slate-800">{row.productName}</p>
                      <p className="text-[10px] text-slate-500">{row.sku}</p>
                    </td>
                    <td className="td font-mono text-[11px]">{row.batchNumber}</td>
                    <td className="td font-semibold">
                      {row.quantity} {row.uom}
                    </td>
                    <td className="td text-xs">{row.pharmacistName}</td>
                    <td className="td text-xs text-slate-500">{formatDateTime(row.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={confirmBatch !== null}
        onClose={() => setConfirmBatch(null)}
        title="Near-expiry dispensation warning"
        description="This batch is in the red tier (< 30 days to expiry). Confirm that you are dispensing it under pharmacist supervision."
        footer={
          <>
            <button className="btn-ghost btn-sm" onClick={() => setConfirmBatch(null)}>
              Cancel
            </button>
            <button className="btn-danger btn-sm" onClick={() => submit(true)} disabled={submitting}>
              {submitting ? "Recording…" : `Confirm & dispense ${quantity} ${confirmBatch?.uom ?? "units"}`}
            </button>
          </>
        }
      >
        {confirmBatch ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-red-200 bg-red-50 p-3">
              <p className="text-sm font-semibold text-red-900">{confirmBatch.name}</p>
              <p className="mt-1 text-xs text-red-800">
                Batch {confirmBatch.batchNumber} expires {formatDate(confirmBatch.expiryDate)} ({confirmBatch.daysToExpiry} days). Transfers and warehouse dispatch are
                locked for this batch — local dispensing is the only permitted movement.
              </p>
            </div>
            <ul className="list-inside list-disc space-y-1 text-xs text-slate-600">
              <li>Dispense earliest-expiry stock first (FEFO).</li>
              <li>The action is recorded in the audit trail with your user ID.</li>
              <li>Stock cannot be returned to transferable inventory once dispensed.</li>
            </ul>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
