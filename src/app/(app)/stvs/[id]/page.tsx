"use client";

import { useMemo, useState } from "react";
import { Link } from "@/components/link";
import { useParams, useRouter } from "next/navigation";
import toast from "react-hot-toast";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Info,
  Loader2,
  Lock,
  Package,
  ShieldAlert,
  Truck,
  User,
} from "lucide-react";

import { useSession } from "@/components/app-shell";
import { Card, ExpiryBadge, Field, InfoBanner, Modal, PageHeader, StatusPill, Stepper, TableSkeleton } from "@/components/ui";
import { apiPatch, useApi, withToken } from "@/lib/client";
import { daysToExpiry, formatDate, formatDateTime, money, STV_STATE_HINTS, type ExpiryTier } from "@/lib/shared";

type StvDetail = {
  id: number;
  code: string;
  type: string;
  status: string;
  sourceName: string;
  destinationName: string;
  createdByName: string;
  notes: string | null;
  exceptionReason: string | null;
  createdAt: string;
  dispatchedAt: string | null;
  deliveredAt: string | null;
  grnPostedAt: string | null;
  indentId: number | null;
  transferRequestId: number | null;
  totalUnits: number;
  items: {
    id: number;
    productName: string;
    sku: string;
    uom: string;
    batchNumber: string;
    expiryDate: string;
    quantity: number;
    acceptedQty: number;
    rejectedQty: number;
    unitCost: number;
  }[];
  events: { id: number; userName: string; previousState: string | null; newState: string; comment: string | null; createdAt: string }[];
  actions: { action: string; label: string; tone: string }[];
};

const ACTION_STYLES: Record<string, string> = {
  primary: "btn-primary btn-sm",
  danger: "btn-danger btn-sm",
  neutral: "btn-ghost btn-sm",
};

export default function StvDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const user = useSession();
  const id = Number(params?.id);
  const { data, loading, error, refresh } = useApi<{ stv: StvDetail }>(Number.isFinite(id) ? `/api/stvs/${id}` : null);

  const stv = data?.stv;
  const [busy, setBusy] = useState(false);
  const [grnOpen, setGrnOpen] = useState(false);
  const [exceptionOpen, setExceptionOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [receipts, setReceipts] = useState<Record<number, string>>({});

  const totals = useMemo(() => {
    const items = stv?.items ?? [];
    return {
      units: items.reduce((sum, item) => sum + item.quantity, 0),
      value: items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0),
      accepted: items.reduce((sum, item) => sum + item.acceptedQty, 0),
      rejected: items.reduce((sum, item) => sum + item.rejectedQty, 0),
    };
  }, [stv]);

  async function perform(action: string, payload: { comment?: string; receipts?: { itemId: number; acceptedQty: number }[] } = {}) {
    if (!stv) return;
    setBusy(true);
    try {
      const response = await apiPatch<{ status: string; totalAccepted?: number; totalRejected?: number }>(`/api/stvs/${stv.id}`, {
        action,
        comment: payload.comment,
        receipts: payload.receipts,
      });
      toast.success(
        `Voucher moved to ${response.status}${response.totalAccepted ? ` · accepted ${response.totalAccepted}` : ""}${
          response.totalRejected ? ` · rejected ${response.totalRejected}` : ""
        }`,
      );
      setGrnOpen(false);
      setExceptionOpen(false);
      setComment("");
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Transition failed");
    } finally {
      setBusy(false);
    }
  }

  function openGrn() {
    if (!stv) return;
    setReceipts(Object.fromEntries(stv.items.map((item) => [item.id, String(item.quantity)])));
    setComment("");
    setGrnOpen(true);
  }

  function handleAction(action: string) {
    if (action === "post_grn") return openGrn();
    if (action === "exception" || action === "reject") {
      setComment("");
      setExceptionOpen(true);
      return;
    }
    void perform(action);
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Card><TableSkeleton rows={6} /></Card>
      </div>
    );
  }

  if (error || !stv) {
    return (
      <div className="space-y-4">
        <InfoBanner tone="danger" title="Voucher unavailable">{error ?? "This voucher could not be found."}</InfoBanner>
        <Link href="/stvs" className="btn btn-ghost btn-sm"><ArrowLeft className="h-3.5 w-3.5" /> Back to vouchers</Link>
      </div>
    );
  }

  const isDestination = stv.destinationName === user.locationName;
  const isSource = stv.sourceName === user.locationName;

  return (
    <div className="space-y-5">
      <Link href="/stvs" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-3.5 w-3.5" /> All transfer vouchers
      </Link>

      <PageHeader
        title={stv.code}
        subtitle={`${stv.type === "warehouse" ? "Warehouse replenishment" : "Inter-branch transfer"} · ${stv.sourceName} → ${stv.destinationName}`}
        icon={<Truck className="h-5 w-5" />}
        actions={
          <>
            <StatusPill status={stv.status} />
            {stv.actions.map((action) => (
              <button key={action.action} className={ACTION_STYLES[action.tone] ?? "btn-ghost btn-sm"} onClick={() => handleAction(action.action)} disabled={busy}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {action.label}
              </button>
            ))}
          </>
        }
      />

      <Card className="card-pad">
        <Stepper status={stv.status} />
        <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Source", value: stv.sourceName, icon: Package },
            { label: "Destination", value: stv.destinationName, icon: Truck },
            { label: "Created by", value: stv.createdByName, icon: User },
            { label: "Created", value: formatDate(stv.createdAt), icon: Clock },
          ].map((item) => (
            <div key={item.label} className="flex items-start gap-2">
              <item.icon className="mt-0.5 h-3.5 w-3.5 text-slate-400" />
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{item.label}</p>
                <p className="text-xs font-medium text-slate-800">{item.value}</p>
              </div>
            </div>
          ))}
        </div>
        {stv.notes ? <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-600">{stv.notes}</p> : null}
        {stv.exceptionReason ? (
          <div className="mt-3">
            <InfoBanner tone="danger" title="Discrepancy recorded" icon={<ShieldAlert className="h-4 w-4" />}>
              {stv.exceptionReason}
            </InfoBanner>
          </div>
        ) : null}
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3.5">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Voucher lines · FEFO allocation</h2>
                <p className="text-[11px] text-slate-500">Batch, expiry, UOM and quantity are carried through the transfer.</p>
              </div>
              <div className="flex gap-2">
                <span className="chip border-slate-200 bg-slate-50 text-slate-600">{totals.units} units</span>
                <span className="chip border-slate-200 bg-slate-50 text-slate-600">{money(totals.value)}</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th className="th">Medicine</th>
                    <th className="th">Batch & expiry</th>
                    <th className="th">Dispatched</th>
                    <th className="th">Accepted</th>
                    <th className="th">Rejected</th>
                    <th className="th">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {stv.items.map((item) => {
                    const days = daysToExpiry(item.expiryDate);
                    const tier: ExpiryTier = days <= 0 ? "expired" : days <= 30 ? "red" : days <= 90 ? "orange" : days <= 180 ? "yellow" : "ok";
                    return (
                      <tr key={item.id} className="hover:bg-slate-50/60">
                        <td className="td">
                          <p className="font-semibold text-slate-800">{item.productName}</p>
                          <p className="text-[10px] text-slate-500">{item.sku} · {item.uom}</p>
                        </td>
                        <td className="td">
                          <p className="font-mono text-[11px] text-slate-700">{item.batchNumber}</p>
                          <div className="mt-0.5 flex items-center gap-1.5">
                            <ExpiryBadge tier={tier} days={days} />
                            <span className="text-[10px] text-slate-500">{formatDate(item.expiryDate)}</span>
                          </div>
                        </td>
                        <td className="td font-semibold">
                          {item.quantity} <span className="text-[10px] font-normal text-slate-500">{item.uom}</span>
                        </td>
                        <td className="td">
                          {stv.status === "GRN Posted" ? (
                            <span className="font-semibold text-emerald-700">{item.acceptedQty}</span>
                          ) : (
                            <span className="text-xs text-slate-400">Pending GRN</span>
                          )}
                        </td>
                        <td className="td">
                          {stv.status === "GRN Posted" ? (
                            <span className={item.rejectedQty > 0 ? "font-semibold text-red-600" : "text-xs text-slate-400"}>{item.rejectedQty}</span>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                        <td className="td text-xs">{money(item.quantity * item.unitCost)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {stv.status === "GRN Posted" ? (
              <div className="flex flex-wrap items-center gap-4 border-t border-slate-100 px-5 py-3 text-[11px]">
                <span className="flex items-center gap-1 font-semibold text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" /> {totals.accepted} units added to {stv.destinationName}
                </span>
                {totals.rejected > 0 ? <span className="font-semibold text-red-600">{totals.rejected} units rejected & quarantined at source</span> : null}
                <span className="text-slate-500">GRN posted {formatDateTime(stv.grnPostedAt)}</span>
              </div>
            ) : null}
          </Card>

          <Card>
            <div className="border-b border-slate-100 px-5 py-3.5">
              <h2 className="text-sm font-semibold text-slate-900">Audit trail</h2>
              <p className="text-[11px] text-slate-500">Immutable state transitions with user, timestamp and comment.</p>
            </div>
            <div className="space-y-0 p-5">
              {stv.events.map((event, index) => (
                <div key={event.id} className="relative flex gap-3 pb-5 last:pb-0">
                  {index < stv.events.length - 1 ? <span className="absolute left-[11px] top-6 h-full w-px bg-slate-200" /> : null}
                  <span className="relative z-10 mt-0.5 flex h-[23px] w-[23px] shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white">
                    <span className="h-2 w-2 rounded-full bg-teal-500" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="text-xs font-semibold text-slate-800">{event.newState}</p>
                      {event.previousState ? <span className="text-[10px] text-slate-400">from {event.previousState}</span> : <span className="text-[10px] text-slate-400">created</span>}
                    </div>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-slate-600">{event.comment ?? STV_STATE_HINTS[event.newState] ?? "State updated."}</p>
                    <p className="mt-0.5 text-[10px] text-slate-400">
                      {event.userName} · {formatDateTime(event.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="card-pad">
            <h2 className="text-sm font-semibold text-slate-900">Stock movement</h2>
            <div className="mt-3 space-y-2.5 text-[11px]">
              {[
                { label: "Source deduction", done: Boolean(stv.dispatchedAt), text: stv.dispatchedAt ? `${totals.units} units deducted at dispatch` : "Occurs on dispatch" },
                { label: "Destination increase", done: stv.status === "GRN Posted", text: stv.status === "GRN Posted" ? `${totals.accepted} accepted units posted` : "Only after GRN posting" },
              ].map((item) => (
                <div key={item.label} className={`rounded-xl border p-2.5 ${item.done ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}>
                  <div className="flex items-center justify-between">
                    <p className={`font-semibold ${item.done ? "text-emerald-800" : "text-slate-700"}`}>{item.label}</p>
                    {item.done ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <Lock className="h-3.5 w-3.5 text-slate-400" />}
                  </div>
                  <p className={`mt-0.5 ${item.done ? "text-emerald-700" : "text-slate-500"}`}>{item.text}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 border-t border-slate-100 pt-3 text-[11px] text-slate-500">
              <p className="flex items-center justify-between"><span>Dispatched</span><span className="font-medium text-slate-700">{formatDateTime(stv.dispatchedAt)}</span></p>
              <p className="mt-1 flex items-center justify-between"><span>Delivered</span><span className="font-medium text-slate-700">{formatDateTime(stv.deliveredAt)}</span></p>
              <p className="mt-1 flex items-center justify-between"><span>GRN posted</span><span className="font-medium text-slate-700">{formatDateTime(stv.grnPostedAt)}</span></p>
            </div>
          </Card>

          <Card className="card-pad">
            <h2 className="text-sm font-semibold text-slate-900">Your permissions</h2>
            <p className="mt-1 text-[11px] text-slate-500">
              {isSource ? "You operate the source location." : isDestination ? "You operate the receiving location." : "You have oversight access (head office)."}
            </p>
            <div className="mt-2 space-y-1.5">
              {stv.actions.length === 0 ? (
                <p className="rounded-lg bg-slate-50 px-2.5 py-2 text-[11px] text-slate-500">
                  No action available for your role in the <strong>{stv.status}</strong> state.
                </p>
              ) : (
                stv.actions.map((action) => (
                  <button key={action.action} className={`${ACTION_STYLES[action.tone]} w-full`} onClick={() => handleAction(action.action)} disabled={busy}>
                    {action.label}
                  </button>
                ))
              )}
            </div>
            <div className="mt-3 flex items-start gap-1.5 rounded-lg bg-slate-50 px-2.5 py-2 text-[10px] text-slate-500">
              <Info className="mt-0.5 h-3 w-3 shrink-0" />
              {STV_STATE_HINTS[stv.status]}
            </div>
          </Card>

          <Card className="card-pad">
            <h2 className="text-sm font-semibold text-slate-900">Reference</h2>
            <dl className="mt-2 space-y-1.5 text-[11px]">
              <div className="flex justify-between"><dt className="text-slate-500">Type</dt><dd className="font-medium capitalize text-slate-800">{stv.type.replace("_", " ")}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Indent</dt><dd className="font-medium text-slate-800">{stv.indentId ? `#${stv.indentId}` : "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Transfer request</dt><dd className="font-medium text-slate-800">{stv.transferRequestId ? `#${stv.transferRequestId}` : "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Lines</dt><dd className="font-medium text-slate-800">{stv.items.length}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Units</dt><dd className="font-medium text-slate-800">{totals.units}</dd></div>
            </dl>
            <button onClick={() => router.push(withToken("/stvs"))} className="btn-ghost btn-sm mt-3 w-full">
              <ArrowRight className="h-3.5 w-3.5" /> Back to list
            </button>
          </Card>
        </div>
      </div>

      {/* GRN modal */}
      <Modal
        open={grnOpen}
        onClose={() => setGrnOpen(false)}
        title={`Post GRN · ${stv.code}`}
        description="Enter accepted quantities. Accepted stock is added to your branch. Any shortfall is quarantined back at the source."
        size="lg"
        footer={
          <>
            <button className="btn-ghost btn-sm" onClick={() => setGrnOpen(false)}>Cancel</button>
            <button
              className="btn-primary btn-sm"
              disabled={busy}
              onClick={() =>
                perform("post_grn", {
                  comment,
                  receipts: stv.items.map((item) => ({ itemId: item.id, acceptedQty: Number(receipts[item.id] ?? item.quantity) })),
                })
              }
            >
              <ClipboardCheck className="h-3.5 w-3.5" /> {busy ? "Posting…" : "Post GRN & add stock"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <InfoBanner tone="info" title="Only accepted quantities are added" icon={<Info className="h-4 w-4" />}>
            Stock is currently still in transit. Posting the GRN atomically increases {stv.destinationName} inventory and writes the audit record.
          </InfoBanner>
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="table-base">
              <thead>
                <tr>
                  <th className="th">Medicine</th>
                  <th className="th">Batch</th>
                  <th className="th">Dispatched</th>
                  <th className="th">Accepted</th>
                </tr>
              </thead>
              <tbody>
                {stv.items.map((item) => (
                  <tr key={item.id}>
                    <td className="td">
                      <p className="text-xs font-semibold text-slate-800">{item.productName}</p>
                      <p className="text-[10px] text-slate-500">{item.uom}</p>
                    </td>
                    <td className="td font-mono text-[11px]">{item.batchNumber}</td>
                    <td className="td text-xs font-semibold">{item.quantity}</td>
                    <td className="td">
                      <input
                        type="number"
                        min={0}
                        max={item.quantity}
                        value={receipts[item.id] ?? String(item.quantity)}
                        onChange={(event) => setReceipts((prev) => ({ ...prev, [item.id]: event.target.value }))}
                        className="input w-24 py-1.5 text-xs"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Field label="GRN note">
            <textarea value={comment} onChange={(event) => setComment(event.target.value)} rows={2} className="input" placeholder="Physical count matched; cartons sealed." />
          </Field>
        </div>
      </Modal>

      {/* Exception modal */}
      <Modal
        open={exceptionOpen}
        onClose={() => setExceptionOpen(false)}
        title="Report delivery discrepancy / reject"
        description="Describe the issue. Rejecting restores dispatched quantities to the source location as quarantined stock."
        footer={
          <>
            <button className="btn-ghost btn-sm" onClick={() => setExceptionOpen(false)}>Cancel</button>
            <button className="btn-danger btn-sm" disabled={busy || comment.trim().length < 5} onClick={() => perform(stv.status === "Delivery Exception" ? "reject" : "exception", { comment })}>
              {busy ? "Saving…" : stv.status === "Delivery Exception" ? "Reject & quarantine" : "Record discrepancy"}
            </button>
          </>
        }
      >
        <Field label="Reason (required)" hint="Minimum 5 characters. Captured in the audit timeline.">
          <textarea value={comment} onChange={(event) => setComment(event.target.value)} rows={3} className="input" placeholder="e.g. 2 cartons damaged in transit; batch seal broken." />
        </Field>
      </Modal>
    </div>
  );
}
