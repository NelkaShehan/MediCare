"use client";

import { useMemo, useState } from "react";
import { Link } from "@/components/link";
import toast from "react-hot-toast";
import {
  Boxes,
  Download,
  Filter,
  Layers,
  Lock,
  Package,
  Pill,
  Search,
  ShieldAlert,
  Undo2,
  Warehouse,
} from "lucide-react";

import { useSession } from "@/components/app-shell";
import { Card, EmptyState, ExpiryBadge, Field, InfoBanner, Modal, PageHeader, Pagination, StatCard, TableSkeleton } from "@/components/ui";
import { apiPost, downloadCsv, useApi, useDebouncedValue } from "@/lib/client";
import { compact, formatDate, money, TIER_META, type ExpiryTier, type StockRow } from "@/lib/shared";

type InventoryResponse = {
  rows: StockRow[];
  total: number;
  page: number;
  pageSize: number;
  summary: { units: number; value: number; batches: number; yellow: number; orange: number; red: number; expired: number; locked: number };
  locations: { id: number; name: string; type: string }[];
};

const TIERS: { key: ExpiryTier | "all"; label: string }[] = [
  { key: "all", label: "All batches" },
  { key: "yellow", label: "6M warning" },
  { key: "orange", label: "3M priority" },
  { key: "red", label: "1M critical" },
  { key: "expired", label: "Expired" },
];

export default function InventoryPage() {
  const user = useSession();
  const [search, setSearch] = useState("");
  const [tier, setTier] = useState<ExpiryTier | "all">("all");
  const [locationId, setLocationId] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const [batchForm, setBatchForm] = useState({ productId: "", batchNumber: "", expiryDate: "", quantity: "", unitCost: "", supplier: "" });
  const debouncedSearch = useDebouncedValue(search, 300);
  const productList = useApi<{ rows: { id: number; name: string; sku: string; uom: string; unitPrice: number }[] }>(
    user.role === "warehouse_staff" || user.role === "central_admin" ? "/api/products" : null,
  );

  const url = useMemo(() => {
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (tier !== "all") params.set("tier", tier);
    if (locationId) params.set("locationId", locationId);
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    return `/api/inventory?${params.toString()}`;
  }, [debouncedSearch, tier, locationId, page, pageSize]);

  const { data, loading, error, refresh } = useApi<InventoryResponse>(url);

  function updateFilter(action: () => void) {
    action();
    setPage(1);
  }

  async function receiveStock() {
    if (!batchForm.productId || !batchForm.batchNumber.trim() || !batchForm.expiryDate) {
      return toast.error("Product, batch number and expiry date are required");
    }
    setReceiving(true);
    try {
      await apiPost("/api/batches", {
        productId: Number(batchForm.productId),
        batchNumber: batchForm.batchNumber,
        expiryDate: batchForm.expiryDate,
        quantity: Number(batchForm.quantity),
        unitCost: Number(batchForm.unitCost || 0),
        supplier: batchForm.supplier,
      });
      toast.success("Stock received and batch created");
      setReceiveOpen(false);
      setBatchForm({ productId: "", batchNumber: "", expiryDate: "", quantity: "", unitCost: "", supplier: "" });
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to receive stock");
    } finally {
      setReceiving(false);
    }
  }

  const rows = data?.rows ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Stock on hand"
        subtitle="Batch-level inventory with three-tier expiry badges and smart locks. Quantities update only on dispatch (source) and GRN posting (destination)."
        icon={<Boxes className="h-5 w-5" />}
        actions={
          <>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                if (rows.length === 0) return toast.error("Nothing to export");
                downloadCsv(
                  `stock-${new Date().toISOString().slice(0, 10)}.csv`,
                  rows.map((r) => ({
                    Product: r.name,
                    SKU: r.sku,
                    Location: r.locationName,
                    Batch: r.batchNumber,
                    Expiry: r.expiryDate,
                    Days: r.daysToExpiry,
                    Tier: r.tier,
                    Quantity: r.quantity,
                    UOM: r.uom,
                    Status: r.status,
                    Lock: r.lockLabel ?? "",
                  })),
                );
                toast.success("Inventory exported");
              }}
            >
              <Download className="h-3.5 w-3.5" /> Export
            </button>
            {user.role === "warehouse_staff" || user.role === "central_admin" ? (
              <button className="btn-primary btn-sm" onClick={() => setReceiveOpen(true)}>
                <Package className="h-3.5 w-3.5" /> Receive stock
              </button>
            ) : null}
            {user.role === "pharmacist" || user.role === "branch_manager" ? (
              <Link href="/stock-out" className="btn-primary btn-sm">
                <Pill className="h-3.5 w-3.5" /> Dispense stock
              </Link>
            ) : null}
          </>
        }
      />

      {error ? <InfoBanner tone="danger" title="Could not load inventory">{error}</InfoBanner> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Visible stock" value={`${compact(data?.summary.units ?? 0)} units`} hint={`${data?.summary.batches ?? 0} batches`} icon={<Package className="h-5 w-5" />} tone="teal" />
        <StatCard label="Stock value" value={money(data?.summary.value ?? 0)} hint="At cost price" icon={<Layers className="h-5 w-5" />} tone="violet" />
        <StatCard
          label="Expiry risk"
          value={(data?.summary.red ?? 0) + (data?.summary.expired ?? 0)}
          hint={`${data?.summary.red ?? 0} near-expiry · ${data?.summary.expired ?? 0} expired`}
          icon={<ShieldAlert className="h-5 w-5" />}
          tone="red"
        />
        <StatCard label="Locked batches" value={data?.summary.locked ?? 0} hint="Transfer or fully locked" icon={<Lock className="h-5 w-5" />} tone="orange" />
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => updateFilter(() => setSearch(event.target.value))}
                placeholder="Search medicine, SKU, generic or batch…"
                className="input pl-9"
              />
            </div>
            {user.role === "central_admin" && (data?.locations?.length ?? 0) > 0 ? (
              <select
                value={locationId}
                onChange={(event) => updateFilter(() => setLocationId(event.target.value))}
                className="input sm:w-52"
              >
                <option value="">All locations</option>
                {(data?.locations ?? []).map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Filter className="hidden h-3.5 w-3.5 text-slate-400 sm:block" />
            {TIERS.map((item) => (
              <button
                key={item.key}
                onClick={() => updateFilter(() => setTier(item.key))}
                className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition ${
                  tier === item.key
                    ? item.key === "all"
                      ? "border-slate-900 bg-gradient-to-r from-slate-800 to-slate-900 text-white shadow-sm"
                      : item.key === "yellow"
                        ? "border-amber-300 bg-gradient-to-r from-amber-400 to-yellow-400 text-amber-950 shadow-sm"
                        : item.key === "orange"
                          ? "border-orange-300 bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-sm"
                          : item.key === "red"
                            ? "border-rose-300 bg-gradient-to-r from-rose-500 to-red-600 text-white shadow-sm"
                            : "border-slate-400 bg-gradient-to-r from-slate-700 to-slate-900 text-white shadow-sm"
                    : "border-slate-200 bg-white text-slate-500 hover:border-teal-300 hover:bg-teal-50/50"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <TableSkeleton rows={pageSize} />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No batches match this view"
            description="Adjust the search or expiry filter. Warehouse receipts and GRN postings create new batches here."
            icon={<Warehouse className="h-5 w-5" />}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th className="th">Medicine</th>
                  <th className="th">Location</th>
                  <th className="th">Batch & expiry</th>
                  <th className="th">On hand</th>
                  <th className="th">Value</th>
                  <th className="th">Availability</th>
                  <th className="th" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.batchId} className="hover:bg-slate-50/60">
                    <td className="td">
                      <p className="font-semibold text-slate-800">{row.name}</p>
                      <p className="text-[11px] text-slate-500">
                        {row.sku} · {row.category}
                      </p>
                    </td>
                    <td className="td text-xs">
                      <p className="font-medium text-slate-700">{row.locationName}</p>
                      <p className="text-[10px] uppercase tracking-wide text-slate-400">{row.locationType}</p>
                    </td>
                    <td className="td">
                      <ExpiryBadge tier={row.tier} days={row.daysToExpiry} />
                      <p className="mt-1 font-mono text-[11px] text-slate-600">{row.batchNumber}</p>
                      <p className="text-[10px] text-slate-500">Exp {formatDate(row.expiryDate)}</p>
                    </td>
                    <td className="td">
                      <p className="font-semibold text-slate-800">
                        {row.quantity} <span className="text-[11px] font-normal text-slate-500">{row.uom}</span>
                      </p>
                      <p className="text-[10px] text-slate-400">Reorder at {row.reorderLevel}</p>
                    </td>
                    <td className="td text-xs font-medium text-slate-700">{money(row.quantity * row.unitPrice)}</td>
                    <td className="td">
                      {row.status !== "available" ? (
                        <span className="chip border-red-200 bg-red-50 text-red-700">
                          <Lock className="h-3 w-3" /> {row.status}
                        </span>
                      ) : row.lockLabel ? (
                        <span className="chip border-red-200 bg-red-50 text-red-700">
                          <Lock className="h-3 w-3" /> {row.lockLabel}
                        </span>
                      ) : (
                        <span className="chip border-emerald-200 bg-emerald-50 text-emerald-700">Available</span>
                      )}
                      <p className="mt-1 text-[10px] text-slate-500">
                        {row.dispenseLocked ? "Dispense locked" : "Dispense allowed"} · {row.transferLocked ? "transfer locked" : "transferable"}
                      </p>
                    </td>
                    <td className="td text-right">
                      {row.dispenseLocked ? (
                        user.role === "branch_manager" || user.role === "central_admin" ? (
                          <Link href="/returns" className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-700">
                            <Undo2 className="h-3 w-3" /> Return
                          </Link>
                        ) : (
                          <span className="text-[11px] font-semibold text-slate-400">Locked</span>
                        )
                      ) : user.role === "pharmacist" || user.role === "branch_manager" ? (
                        <Link href="/stock-out" className="text-[11px] font-semibold text-teal-700">
                          Dispense
                        </Link>
                      ) : (
                        <span className="text-[11px] text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-col gap-2 border-t border-slate-100 px-4 py-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-[11px] text-slate-500">
            Rows per page
            <select
              value={pageSize}
              onChange={(event) => updateFilter(() => setPageSize(Number(event.target.value)))}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px]"
            >
              {[10, 20, 50].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
        </div>
        <Pagination page={page} pageSize={pageSize} total={data?.total ?? 0} onPage={setPage} />
      </Card>

      <InfoBanner tone="warning" title="Smart locking rules">
        <span className="block">Yellow (&lt; 180 days) — early warning, ideal for redistribution of slow-moving stock.</span>
        <span className="block">Orange (&lt; 90 days) — prioritise FEFO dispensing.</span>
        <span className="block">Red (&lt; 30 days) — transfers locked; local dispensing requires explicit confirmation.</span>
        <span className="block">Expired — fully locked, quarantined automatically and processed only through the expired-return workflow.</span>
      </InfoBanner>

      <Modal
        open={receiveOpen}
        onClose={() => setReceiveOpen(false)}
        title="Receive stock · create batch"
        description="Warehouse intake with mandatory batch number and expiry date. Near-expiry receipts are accepted but automatically transfer-locked."
        size="lg"
        footer={
          <>
            <button className="btn-ghost btn-sm" onClick={() => setReceiveOpen(false)}>Cancel</button>
            <button className="btn-primary btn-sm" onClick={receiveStock} disabled={receiving}>
              {receiving ? "Receiving…" : "Receive into stock"}
            </button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Product">
              <select
                value={batchForm.productId}
                onChange={(event) => setBatchForm({ ...batchForm, productId: event.target.value, unitCost: String(productList.data?.rows.find((p) => p.id === Number(event.target.value))?.unitPrice ?? "") })}
                className="input"
              >
                <option value="">Select medicine…</option>
                {(productList.data?.rows ?? []).map((product) => (
                  <option key={product.id} value={product.id}>{product.name} ({product.sku}) · {product.uom}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Batch number">
            <input value={batchForm.batchNumber} onChange={(event) => setBatchForm({ ...batchForm, batchNumber: event.target.value })} className="input" placeholder="PCM-500-A-902" />
          </Field>
          <Field label="Expiry date">
            <input type="date" value={batchForm.expiryDate} onChange={(event) => setBatchForm({ ...batchForm, expiryDate: event.target.value })} className="input" />
          </Field>
          <Field label="Quantity">
            <input type="number" min={1} value={batchForm.quantity} onChange={(event) => setBatchForm({ ...batchForm, quantity: event.target.value })} className="input" />
          </Field>
          <Field label="Unit cost (LKR)">
            <input type="number" min={0} value={batchForm.unitCost} onChange={(event) => setBatchForm({ ...batchForm, unitCost: event.target.value })} className="input" />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Supplier">
              <input value={batchForm.supplier} onChange={(event) => setBatchForm({ ...batchForm, supplier: event.target.value })} className="input" placeholder="Getz Pharma Distribution" />
            </Field>
          </div>
        </div>
      </Modal>
    </div>
  );
}
