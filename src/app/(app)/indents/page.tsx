"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { CheckCircle2, FileText, Package, Plus, Trash2, Truck, X, XCircle, Zap } from "lucide-react";

import { useSession } from "@/components/app-shell";
import { Card, EmptyState, Field, InfoBanner, Modal, PageHeader, StatusPill, TableSkeleton } from "@/components/ui";
import { apiPatch, apiPost, useApi, withToken } from "@/lib/client";
import { formatDate, type SessionUser } from "@/lib/shared";

type IndentItem = {
  id: number;
  productId: number;
  productName: string;
  sku: string;
  uom: string;
  requestedQty: number;
  approvedQty: number;
  fulfilledQty: number;
};

type IndentRow = {
  id: number;
  code: string;
  branchId: number;
  branchName: string;
  requestedByName: string;
  status: string;
  priority: string;
  note: string | null;
  reviewNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
  items: IndentItem[];
};

type ProductRow = { id: number; name: string; sku: string; uom: string; reorderLevel: number };

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 border-amber-200",
  approved: "bg-teal-100 text-teal-800 border-teal-200",
  rejected: "bg-red-100 text-red-800 border-red-200",
  fulfilled: "bg-emerald-100 text-emerald-800 border-emerald-200",
  cancelled: "bg-slate-100 text-slate-600 border-slate-200",
};

export default function IndentsPage() {
  const user = useSession();
  const router = useRouter();
  const indents = useApi<{ rows: IndentRow[] }>("/api/indents");
  const products = useApi<{ rows: ProductRow[] }>("/api/products");
  const stvs = useApi<{ rows: { id: number; indentId: number | null; code: string }[] }>("/api/stvs");

  const [filter, setFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [lines, setLines] = useState<{ productId: string; qty: string }[]>([{ productId: "", qty: "" }]);
  const [priority, setPriority] = useState("normal");
  const [note, setNote] = useState("");
  const [review, setReview] = useState<IndentRow | null>(null);
  const [reviewAction, setReviewAction] = useState<"approve" | "reject">("approve");
  const [reviewNote, setReviewNote] = useState("");
  const [approvedQty, setApprovedQty] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);

  const canCreate = user.role === "branch_manager" || user.role === "pharmacist";
  const isAdmin = user.role === "central_admin";
  const isWarehouse = user.role === "warehouse_staff" || user.role === "central_admin";

  const rows = useMemo(() => {
    const all = indents.data?.rows ?? [];
    return filter === "all" ? all : all.filter((row) => row.status === filter);
  }, [indents.data, filter]);

  const stvByIndent = useMemo(() => {
    const map = new Map<number, { id: number; code: string }>();
    for (const stv of stvs.data?.rows ?? []) {
      if (stv.indentId) map.set(stv.indentId, stv);
    }
    return map;
  }, [stvs.data]);

  function openCreate() {
    setLines([{ productId: "", qty: "" }]);
    setPriority(user.role === "pharmacist" ? "emergency" : "normal");
    setNote("");
    setCreateOpen(true);
  }

  async function createIndent() {
    const payload = lines
      .filter((line) => Number(line.productId) > 0 && Number(line.qty) > 0)
      .map((line) => ({ productId: Number(line.productId), requestedQty: Number(line.qty) }));
    if (payload.length === 0) return toast.error("Add at least one product line");
    setBusy(true);
    try {
      await apiPost("/api/indents", { priority, note, items: payload });
      toast.success("Indent submitted for central review");
      setCreateOpen(false);
      indents.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to create indent");
    } finally {
      setBusy(false);
    }
  }

  async function submitReview() {
    if (!review) return;
    if (reviewAction === "reject" && !reviewNote.trim()) return toast.error("A rejection reason is required");
    setBusy(true);
    try {
      await apiPatch(`/api/indents/${review.id}`, {
        action: reviewAction,
        reviewNote,
        items:
          reviewAction === "approve"
            ? review.items.map((item) => ({ itemId: item.id, approvedQty: Number(approvedQty[item.id] ?? item.requestedQty) }))
            : undefined,
      });
      toast.success(reviewAction === "approve" ? "Indent approved — warehouse can pick" : "Indent rejected");
      setReview(null);
      setReviewNote("");
      indents.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Review failed");
    } finally {
      setBusy(false);
    }
  }

  async function generatePickList(indent: IndentRow) {
    setBusy(true);
    try {
      const response = await apiPost<{ stv: { id: number; code: string } }>("/api/stvs", { indentId: indent.id });
      toast.success(`Pick list ${response.stv.code} generated (FEFO)`);
      router.push(withToken(`/stvs/${response.stv.id}`));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to generate pick list");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Warehouse indents"
        subtitle="Branches request replenishment, head office reviews warehouse availability, then the storekeeper generates a FEFO pick list."
        icon={<FileText className="h-5 w-5" />}
        actions={
          canCreate ? (
            <button onClick={openCreate} className="btn-primary btn-sm">
              <Plus className="h-3.5 w-3.5" /> {user.role === "pharmacist" ? "Emergency indent" : "New indent"}
            </button>
          ) : null
        }
      />

      <div className="flex flex-wrap items-center gap-1.5">
        {["all", "pending", "approved", "rejected", "fulfilled"].map((status) => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold capitalize transition ${
              filter === status
                ? status === "pending"
                  ? "border-amber-300 bg-gradient-to-r from-amber-400 to-yellow-400 text-amber-950 shadow-sm"
                  : status === "approved"
                    ? "border-teal-300 bg-gradient-to-r from-teal-500 to-emerald-500 text-white shadow-sm"
                    : status === "rejected"
                      ? "border-rose-300 bg-gradient-to-r from-rose-500 to-red-600 text-white shadow-sm"
                      : status === "fulfilled"
                        ? "border-emerald-300 bg-gradient-to-r from-emerald-500 to-green-500 text-white shadow-sm"
                        : "border-slate-900 bg-gradient-to-r from-slate-800 to-slate-900 text-white shadow-sm"
                : "border-slate-200 bg-white text-slate-500 hover:border-teal-300 hover:bg-teal-50/50"
            }`}
          >
            {status}
          </button>
        ))}
        <span className="ml-auto text-[11px] text-slate-500">{rows.length} indent(s)</span>
      </div>

      <Card>
        {indents.loading ? (
          <TableSkeleton rows={5} />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No indents in this view"
            description={canCreate ? "Raise a replenishment request to the central warehouse." : "Branch indents will appear here for review."}
            icon={<FileText className="h-5 w-5" />}
            action={canCreate ? <button onClick={openCreate} className="btn-primary btn-sm">Create indent</button> : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th className="th">Indent</th>
                  <th className="th">Branch</th>
                  <th className="th">Lines</th>
                  <th className="th">Priority</th>
                  <th className="th">Status</th>
                  <th className="th">Requested</th>
                  <th className="th" />
                </tr>
              </thead>
              <tbody>
                {rows.map((indent) => {
                  const stv = stvByIndent.get(indent.id);
                  return (
                    <tr key={indent.id} className="align-top hover:bg-slate-50/60">
                      <td className="td">
                        <p className="font-semibold text-slate-800">{indent.code}</p>
                        <p className="text-[10px] text-slate-500">{indent.requestedByName}</p>
                        {indent.reviewNote ? <p className="mt-1 max-w-[220px] text-[10px] italic text-slate-500">“{indent.reviewNote}”</p> : null}
                      </td>
                      <td className="td text-xs">{indent.branchName}</td>
                      <td className="td">
                        <div className="space-y-1">
                          {indent.items.slice(0, 3).map((item) => (
                            <p key={item.id} className="text-[11px] text-slate-600">
                              {item.productName} × <span className="font-semibold">{item.requestedQty}</span>
                              {indent.status === "approved" || indent.status === "fulfilled" ? (
                                <span className="text-teal-700"> (appr. {item.approvedQty})</span>
                              ) : null}
                            </p>
                          ))}
                          {indent.items.length > 3 ? <p className="text-[10px] text-slate-400">+{indent.items.length - 3} more</p> : null}
                        </div>
                      </td>
                      <td className="td">
                        <span className={`chip ${indent.priority === "emergency" ? "border-red-200 bg-red-50 text-red-700" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
                          {indent.priority === "emergency" ? <Zap className="h-3 w-3" /> : null} {indent.priority}
                        </span>
                      </td>
                      <td className="td">
                        <span className={`chip ${STATUS_STYLE[indent.status] ?? "border-slate-200 bg-slate-50 text-slate-600"}`}>{indent.status}</span>
                      </td>
                      <td className="td text-xs text-slate-500">{formatDate(indent.createdAt)}</td>
                      <td className="td text-right">
                        <div className="flex flex-col items-end gap-1.5">
                          {isAdmin && indent.status === "pending" ? (
                            <>
                              <button
                                className="btn btn-ghost btn-sm"
                                onClick={() => {
                                  setReview(indent);
                                  setReviewAction("approve");
                                  setReviewNote("");
                                  setApprovedQty(Object.fromEntries(indent.items.map((item) => [item.id, String(item.requestedQty)])));
                                }}
                              >
                                Review
                              </button>
                            </>
                          ) : null}
                          {isWarehouse && indent.status === "approved" ? (
                            stv ? (
                              <button className="btn btn-ghost btn-sm" onClick={() => router.push(withToken(`/stvs/${stv.id}`))}>
                                <Truck className="h-3 w-3" /> {stv.code}
                              </button>
                            ) : (
                              <button disabled={busy} className="btn-primary btn-sm" onClick={() => generatePickList(indent)}>
                                <Package className="h-3 w-3" /> Generate pick list
                              </button>
                            )
                          ) : null}
                          {indent.status === "fulfilled" ? (
                            <span className="chip border-emerald-200 bg-emerald-50 text-emerald-700">
                              <CheckCircle2 className="h-3 w-3" /> GRN posted
                            </span>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <InfoBanner tone="info" title="Replenishment flow">
        Branch indent → Central Admin approval (availability checked) → warehouse FEFO pick list → pack & dispatch STV → branch GRN posting increases branch stock.
      </InfoBanner>

      {/* Create modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={user.role === "pharmacist" ? "Raise emergency indent" : "New warehouse indent"}
        description="Select medicines and quantities. Central admin will review warehouse availability before picking."
        size="lg"
        footer={
          <>
            <button className="btn-ghost btn-sm" onClick={() => setCreateOpen(false)}>
              Cancel
            </button>
            <button className="btn-primary btn-sm" onClick={createIndent} disabled={busy}>
              {busy ? "Submitting…" : "Submit indent"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          {user.role === "pharmacist" ? (
            <InfoBanner tone="warning" title="Emergency priority" icon={<Zap className="h-4 w-4" />}>
              Pharmacist indents are automatically flagged as emergency and appear at the top of the central review queue.
            </InfoBanner>
          ) : (
            <Field label="Priority">
              <select value={priority} onChange={(event) => setPriority(event.target.value)} className="input">
                <option value="normal">Normal replenishment</option>
                <option value="emergency">Emergency</option>
              </select>
            </Field>
          )}
          <div>
            <span className="label">Line items</span>
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
                        {product.name} ({product.sku}) · {product.uom}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={1}
                    value={line.qty}
                    onChange={(event) => setLines((prev) => prev.map((l, i) => (i === index ? { ...l, qty: event.target.value } : l)))}
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
            <button onClick={() => setLines((prev) => [...prev, { productId: "", qty: "" }])} className="btn-ghost btn-sm mt-2">
              <Plus className="h-3.5 w-3.5" /> Add line
            </button>
          </div>
          <Field label="Note">
            <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} className="input" placeholder="Justification or special instructions" />
          </Field>
        </div>
      </Modal>

      {/* Review modal */}
      <Modal
        open={review !== null}
        onClose={() => setReview(null)}
        title={`Review ${review?.code ?? ""}`}
        description={`${review?.branchName ?? ""} · requested by ${review?.requestedByName ?? ""}`}
        size="lg"
        footer={
          <>
            <button
              className={`btn-sm btn ${reviewAction === "approve" ? "bg-teal-600 text-white hover:bg-teal-700" : "btn-ghost"}`}
              onClick={() => setReviewAction("approve")}
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> Approve
            </button>
            <button
              className={`btn-sm btn ${reviewAction === "reject" ? "btn-danger" : "btn-ghost"}`}
              onClick={() => setReviewAction("reject")}
            >
              <XCircle className="h-3.5 w-3.5" /> Reject
            </button>
            <button className="btn-primary btn-sm" onClick={submitReview} disabled={busy}>
              {busy ? "Saving…" : reviewAction === "approve" ? "Confirm approval" : "Confirm rejection"}
            </button>
          </>
        }
      >
        {review ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">{review.note ?? "No note supplied."}</div>
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <table className="table-base">
                <thead>
                  <tr>
                    <th className="th">Medicine</th>
                    <th className="th">Requested</th>
                    <th className="th">Approve qty</th>
                  </tr>
                </thead>
                <tbody>
                  {review.items.map((item) => (
                    <tr key={item.id}>
                      <td className="td">
                        <p className="text-xs font-semibold text-slate-800">{item.productName}</p>
                        <p className="text-[10px] text-slate-500">{item.sku} · {item.uom}</p>
                      </td>
                      <td className="td text-xs font-semibold">{item.requestedQty}</td>
                      <td className="td">
                        <input
                          type="number"
                          min={0}
                          max={item.requestedQty}
                          disabled={reviewAction === "reject"}
                          value={approvedQty[item.id] ?? String(item.requestedQty)}
                          onChange={(event) => setApprovedQty((prev) => ({ ...prev, [item.id]: event.target.value }))}
                          className="input w-24 py-1.5 text-xs"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Field label={reviewAction === "approve" ? "Review comment" : "Rejection reason (required)"}>
              <textarea
                value={reviewNote}
                onChange={(event) => setReviewNote(event.target.value)}
                rows={2}
                className="input"
                placeholder={reviewAction === "approve" ? "Warehouse stock verified" : "Explain why this indent cannot be fulfilled"}
              />
            </Field>
            {reviewAction === "approve" ? (
              <p className="text-[11px] text-slate-500">Approved lines become pickable by the warehouse. Unchecked availability may cause a short pick list.</p>
            ) : (
              <p className="text-[11px] text-red-600">
                <X className="mr-1 inline h-3 w-3" /> Rejection is final and recorded in the audit trail.
              </p>
            )}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
