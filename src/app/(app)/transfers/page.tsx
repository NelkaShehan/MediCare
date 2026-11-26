"use client";

import { useMemo, useState } from "react";
import { Link } from "@/components/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { ArrowLeftRight, ArrowRight, CheckCircle2, Lightbulb, Plus, Send, Trash2, Truck, XCircle } from "lucide-react";

import { useSession } from "@/components/app-shell";
import { Card, EmptyState, Field, InfoBanner, Modal, PageHeader, TableSkeleton } from "@/components/ui";
import { apiPatch, apiPost, useApi, withToken } from "@/lib/client";
import { formatDate } from "@/lib/shared";

type TransferItem = { id: number; productId: number; productName: string; sku: string; uom: string; quantity: number };
type TransferRow = {
  id: number;
  code: string;
  fromLocationId: number;
  toLocationId: number;
  fromLocationName: string;
  toLocationName: string;
  kind: string;
  status: string;
  note: string | null;
  reviewNote: string | null;
  requestedByName: string;
  createdAt: string;
  stvId: number | null;
  items: TransferItem[];
};

type LocationRow = { id: number; name: string; type: string };
type ProductRow = { id: number; name: string; sku: string; uom: string };
type DashboardSlow = { productId: number; productName: string; locationName: string; dispensed30: number; onHand: number };

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 border-amber-200",
  approved: "bg-teal-100 text-teal-800 border-teal-200",
  rejected: "bg-red-100 text-red-800 border-red-200",
  completed: "bg-emerald-100 text-emerald-800 border-emerald-200",
  cancelled: "bg-slate-100 text-slate-600 border-slate-200",
};

export default function TransfersPage() {
  const user = useSession();
  const router = useRouter();
  const transfers = useApi<{ rows: TransferRow[] }>("/api/transfers");
  const locations = useApi<{ rows: LocationRow[] }>("/api/locations");
  const products = useApi<{ rows: ProductRow[] }>("/api/products");
  const dashboard = useApi<{ slowMovers: DashboardSlow[] }>(user.role === "branch_manager" ? "/api/dashboard" : null);

  const [createOpen, setCreateOpen] = useState(false);
  const [kind, setKind] = useState<"request" | "offer">("offer");
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<{ productId: string; quantity: string }[]>([{ productId: "", quantity: "" }]);
  const [review, setReview] = useState<TransferRow | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [busy, setBusy] = useState(false);

  const isManager = user.role === "branch_manager";
  const isAdmin = user.role === "central_admin";
  const branches = (locations.data?.rows ?? []).filter((location) => location.type === "branch");

  const grouped = useMemo(() => {
    const rows = transfers.data?.rows ?? [];
    return {
      pending: rows.filter((row) => row.status === "pending"),
      approved: rows.filter((row) => row.status === "approved"),
      closed: rows.filter((row) => !["pending", "approved"].includes(row.status)),
    };
  }, [transfers.data]);

  function openCreate(preset?: DashboardSlow) {
    setKind("offer");
    setFromId(String(user.locationId ?? ""));
    setToId("");
    setNote(preset ? `Slow-moving redistribution suggestion: ${preset.productName} moved only ${preset.dispensed30} units in 30 days.` : "");
    setLines([{ productId: preset ? String(preset.productId) : "", quantity: preset ? String(Math.max(5, Math.round(preset.onHand * 0.4))) : "" }]);
    setCreateOpen(true);
  }

  async function submitTransfer() {
    const items = lines
      .filter((line) => Number(line.productId) > 0 && Number(line.quantity) > 0)
      .map((line) => ({ productId: Number(line.productId), quantity: Number(line.quantity) }));
    if (items.length === 0) return toast.error("Add at least one product line");
    if (!fromId || !toId) return toast.error("Select source and destination branches");
    if (fromId === toId) return toast.error("Source and destination must differ");

    setBusy(true);
    try {
      await apiPost("/api/transfers", {
        fromLocationId: Number(fromId),
        toLocationId: Number(toId),
        kind,
        note,
        items,
      });
      toast.success("Transfer request submitted for central approval");
      setCreateOpen(false);
      transfers.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to create transfer");
    } finally {
      setBusy(false);
    }
  }

  async function decide(action: "approve" | "reject") {
    if (!review) return;
    if (action === "reject" && !reviewNote.trim()) return toast.error("A rejection reason is required");
    setBusy(true);
    try {
      const response = await apiPatch<{ stvId: number | null }>(`/api/transfers/${review.id}`, { action, reviewNote });
      toast.success(action === "approve" ? "Approved — source branch STV created" : "Transfer rejected");
      setReview(null);
      setReviewNote("");
      transfers.refresh();
      if (action === "approve" && response.stvId) router.push(withToken(`/stvs/${response.stvId}`));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update transfer");
    } finally {
      setBusy(false);
    }
  }

  const slowMovers = dashboard.data?.slowMovers ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Inter-branch stock sharing"
        subtitle="Redistribute slow-moving stock to branches where the same medicine is fast-moving. Central approval is required before an inter-branch STV is dispatched."
        icon={<ArrowLeftRight className="h-5 w-5" />}
        actions={
          isManager ? (
            <button onClick={() => openCreate()} className="btn-primary btn-sm">
              <Plus className="h-3.5 w-3.5" /> New transfer request
            </button>
          ) : null
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="card-pad lg:col-span-2">
          <h2 className="text-sm font-semibold text-slate-900">How velocity-driven sharing works</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {[
              { step: "1", title: "Velocity detection", text: "Consumption from stock-out records flags slow movers at one branch." },
              { step: "2", title: "Central approval", text: "Admin validates stock and approves the redistribution." },
              { step: "3", title: "STV + GRN", text: "Source dispatches, destination posts GRN to increase stock." },
            ].map((item) => (
              <div key={item.step} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-teal-600 text-[11px] font-bold text-white">{item.step}</span>
                <p className="mt-2 text-xs font-semibold text-slate-800">{item.title}</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{item.text}</p>
              </div>
            ))}
          </div>
        </Card>
        <Card className="card-pad">
          <div className="flex items-center gap-1.5">
            <Lightbulb className="h-4 w-4 text-amber-500" />
            <h2 className="text-sm font-semibold text-slate-900">Slow movers at your branch</h2>
          </div>
          {!isManager ? (
            <p className="mt-3 text-xs text-slate-500">Available to branch managers only.</p>
          ) : slowMovers.length === 0 ? (
            <p className="mt-3 text-xs text-slate-500">No slow-moving stock detected. Velocity updates as pharmacists dispense.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {slowMovers.slice(0, 4).map((item) => (
                <button
                  key={item.productId}
                  onClick={() => openCreate(item)}
                  className="w-full rounded-xl border border-amber-100 bg-amber-50/60 p-2.5 text-left transition hover:border-amber-300"
                >
                  <p className="truncate text-[11px] font-semibold text-slate-800">{item.productName}</p>
                  <p className="text-[10px] text-slate-500">
                    {item.onHand} on hand · {item.dispensed30} dispensed/30d
                  </p>
                  <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-teal-700">
                    Offer to another branch <ArrowRight className="h-3 w-3" />
                  </span>
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>

      {[
        { title: "Awaiting central approval", rows: grouped.pending, chip: "chip border-amber-200 bg-amber-50 text-amber-700" },
        { title: "Approved · STV in progress", rows: grouped.approved, chip: "chip border-teal-200 bg-teal-50 text-teal-700" },
        { title: "Closed & history", rows: grouped.closed, chip: "chip border-slate-200 bg-slate-50 text-slate-600" },
      ].map((section) => (
        <Card key={section.title}>
          <div className={`flex items-center justify-between border-b border-slate-100 bg-gradient-to-r px-5 py-3.5 ${
            section.title.startsWith("Awaiting")
              ? "from-amber-50 via-white to-white"
              : section.title.startsWith("Approved")
                ? "from-teal-50 via-white to-white"
                : "from-slate-50 via-white to-white"
          }`}>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">{section.title}</h2>
              <p className="text-[11px] text-slate-500">{section.rows.length} request(s)</p>
            </div>
            <span className={section.chip}>{section.rows.length}</span>
          </div>
          {transfers.loading ? (
            <TableSkeleton rows={3} />
          ) : section.rows.length === 0 ? (
            <EmptyState title="Nothing here" description="Requests move through this queue as they are approved and dispatched." icon={<ArrowLeftRight className="h-5 w-5" />} />
          ) : (
            <div className="divide-y divide-slate-100">
              {section.rows.map((transfer) => (
                <div key={transfer.id} className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-800">{transfer.code}</p>
                      <span className={`chip ${STATUS_STYLE[transfer.status] ?? "border-slate-200 bg-slate-50 text-slate-600"}`}>{transfer.status}</span>
                      <span className="chip border-slate-200 bg-slate-50 capitalize text-slate-600">{transfer.kind}</span>
                    </div>
                    <p className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-slate-600">
                      {transfer.fromLocationName}
                      <ArrowRight className="h-3 w-3 text-slate-400" />
                      {transfer.toLocationName}
                      <span className="text-slate-400">·</span>
                      {transfer.requestedByName}
                      <span className="text-slate-400">·</span>
                      {formatDate(transfer.createdAt)}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {transfer.items.map((item) => (
                        <span key={item.id} className="chip border-slate-200 bg-white text-slate-600">
                          {item.productName} × {item.quantity}
                        </span>
                      ))}
                    </div>
                    {transfer.note ? <p className="mt-1.5 max-w-2xl text-[11px] italic text-slate-500">“{transfer.note}”</p> : null}
                    {transfer.reviewNote ? <p className="mt-1 text-[11px] text-teal-700">Central: {transfer.reviewNote}</p> : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {transfer.stvId ? (
                      <Link href={`/stvs/${transfer.stvId}`} className="btn btn-ghost btn-sm">
                        <Truck className="h-3.5 w-3.5" /> View STV
                      </Link>
                    ) : null}
                    {isAdmin && transfer.status === "pending" ? (
                      <button
                        className="btn-primary btn-sm"
                        onClick={() => {
                          setReview(transfer);
                          setReviewNote("");
                        }}
                      >
                        Review request
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      ))}

      <InfoBanner tone="info" title="Smart locking applies to inter-branch transfers">
        Approved transfers automatically allocate the earliest-expiry transferable batch at the source (FEFO). Red-tier (&lt; 30 days) and expired batches are excluded
        from allocation, and approval fails if only locked batches are available.
      </InfoBanner>

      {/* Create modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New inter-branch stock sharing request"
        description="Offer slow-moving stock or request surplus stock from another branch."
        size="lg"
        footer={
          <>
            <button className="btn-ghost btn-sm" onClick={() => setCreateOpen(false)}>
              Cancel
            </button>
            <button className="btn-primary btn-sm" onClick={submitTransfer} disabled={busy}>
              <Send className="h-3.5 w-3.5" /> {busy ? "Submitting…" : "Submit for approval"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Transfer type">
              <select
                value={kind}
                onChange={(event) => {
                  const next = event.target.value as "request" | "offer";
                  setKind(next);
                  if (next === "offer") {
                    setFromId(String(user.locationId ?? ""));
                    setToId("");
                  } else {
                    setFromId("");
                    setToId(String(user.locationId ?? ""));
                  }
                }}
                className="input"
              >
                <option value="offer">Offer my slow-moving stock</option>
                <option value="request">Request stock from another branch</option>
              </select>
            </Field>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-[11px] text-slate-600">
              {kind === "offer"
                ? "The source is your branch. The receiving branch manager posts the GRN."
                : "The destination is your branch. The source branch dispatches after approval."}
            </div>
            <Field label="Source branch">
              <select value={fromId} onChange={(event) => setFromId(event.target.value)} className="input">
                <option value="">Select source…</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id} disabled={kind === "offer" && branch.id !== user.locationId}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Destination branch">
              <select value={toId} onChange={(event) => setToId(event.target.value)} className="input">
                <option value="">Select destination…</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id} disabled={kind === "request" && branch.id !== user.locationId}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div>
            <span className="label">Medicines</span>
            <div className="space-y-2">
              {lines.map((line, index) => (
                <div key={index} className="flex items-center gap-2">
                  <select
                    value={line.productId}
                    onChange={(event) => setLines((prev) => prev.map((l, i) => (i === index ? { ...l, productId: event.target.value } : l)))}
                    className="input flex-1"
                  >
                    <option value="">Select medicine…</option>
                    {(products.data?.rows ?? []).map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name} ({product.sku})
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={1}
                    value={line.quantity}
                    onChange={(event) => setLines((prev) => prev.map((l, i) => (i === index ? { ...l, quantity: event.target.value } : l)))}
                    placeholder="Qty"
                    className="input w-24"
                  />
                  <button
                    className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    onClick={() => setLines((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)))}
                    aria-label="Remove line"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <button onClick={() => setLines((prev) => [...prev, { productId: "", quantity: "" }])} className="btn-ghost btn-sm mt-2">
              <Plus className="h-3.5 w-3.5" /> Add medicine
            </button>
          </div>
          <Field label="Justification">
            <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} className="input" placeholder="Why is this redistribution needed?" />
          </Field>
        </div>
      </Modal>

      {/* Review modal */}
      <Modal
        open={review !== null}
        onClose={() => setReview(null)}
        title={`Review ${review?.code ?? ""}`}
        description={`${review?.fromLocationName ?? ""} → ${review?.toLocationName ?? ""}`}
        footer={
          <>
            <button className="btn btn-ghost btn-sm" onClick={() => decide("reject")} disabled={busy}>
              <XCircle className="h-3.5 w-3.5" /> Reject
            </button>
            <button className="btn-primary btn-sm" onClick={() => decide("approve")} disabled={busy}>
              <CheckCircle2 className="h-3.5 w-3.5" /> {busy ? "Approving…" : "Approve & generate STV"}
            </button>
          </>
        }
      >
        {review ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-600">{review.note ?? "No justification supplied."}</div>
            <div className="space-y-1">
              {review.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-xs">
                  <span className="font-medium text-slate-800">{item.productName}</span>
                  <span className="font-semibold text-slate-700">
                    {item.quantity} {item.uom}
                  </span>
                </div>
              ))}
            </div>
            <Field label="Review comment / rejection reason">
              <textarea value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} rows={2} className="input" />
            </Field>
            <InfoBanner tone="warning" title="Approval creates the source STV immediately">
              Stock is deducted only on dispatch. The source branch manager then picks (FEFO), packs and dispatches.
            </InfoBanner>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
