"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Pencil, PillBottle, Plus, Search } from "lucide-react";

import { useSession } from "@/components/app-shell";
import { Card, EmptyState, Field, InfoBanner, Modal, PageHeader, TableSkeleton } from "@/components/ui";
import { apiPatch, apiPost, useApi } from "@/lib/client";
import { money, UOMS } from "@/lib/shared";

type Product = {
  id: number;
  sku: string;
  name: string;
  genericName: string | null;
  category: string;
  uom: string;
  packSize: number;
  unitPrice: number;
  reorderLevel: number;
  fastMovingThreshold: number;
  active: boolean;
};

const emptyForm = { sku: "", name: "", genericName: "", category: "Analgesic", uom: "Tablet", packSize: "1", unitPrice: "0", reorderLevel: "100", fastMovingThreshold: "60" };

export default function ProductsPage() {
  const user = useSession();
  const { data, loading, error, refresh } = useApi<{ rows: Product[]; uoms: string[] }>("/api/products");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [busy, setBusy] = useState(false);

  const rows = (data?.rows ?? []).filter((row) =>
    !search.trim() ? true : `${row.name} ${row.sku} ${row.genericName ?? ""} ${row.category}`.toLowerCase().includes(search.trim().toLowerCase()),
  );

  function openCreate() {
    setEditing(null);
    setForm({ ...emptyForm });
    setOpen(true);
  }

  function openEdit(product: Product) {
    setEditing(product);
    setForm({
      sku: product.sku,
      name: product.name,
      genericName: product.genericName ?? "",
      category: product.category,
      uom: product.uom,
      packSize: String(product.packSize),
      unitPrice: String(product.unitPrice),
      reorderLevel: String(product.reorderLevel),
      fastMovingThreshold: String(product.fastMovingThreshold ?? 60),
    });
    setOpen(true);
  }

  async function save() {
    if (!form.sku.trim() || !form.name.trim()) return toast.error("SKU and name are required");
    setBusy(true);
    try {
      if (editing) {
        await apiPatch("/api/products", {
          id: editing.id,
          name: form.name,
          category: form.category,
          uom: form.uom,
          unitPrice: Number(form.unitPrice),
          reorderLevel: Number(form.reorderLevel),
          fastMovingThreshold: Number(form.fastMovingThreshold),
        });
        toast.success("Product updated");
      } else {
        await apiPost("/api/products", {
          ...form,
          packSize: Number(form.packSize),
          unitPrice: Number(form.unitPrice),
          reorderLevel: Number(form.reorderLevel),
          fastMovingThreshold: Number(form.fastMovingThreshold),
        });
        toast.success("Product created");
      }
      setOpen(false);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to save product");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(product: Product) {
    try {
      await apiPatch("/api/products", { id: product.id, active: !product.active });
      toast.success(product.active ? "Product deactivated" : "Product reactivated");
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to update product");
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Product & UOM master"
        subtitle="Central catalogue used across all locations. UOM, pack size, price and reorder level flow into indents, pick lists and dispensing."
        icon={<PillBottle className="h-5 w-5" />}
        actions={
          <button className="btn-primary btn-sm" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5" /> New product
          </button>
        }
      />

      {error ? <InfoBanner tone="danger" title="Unable to load products">{error}</InfoBanner> : null}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 p-4">
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search SKU, brand, generic…" className="input pl-9" />
          </div>
          <span className="chip border-slate-200 bg-slate-50 text-slate-600">{rows.length} products</span>
        </div>
        {loading ? (
          <TableSkeleton rows={6} />
        ) : rows.length === 0 ? (
          <EmptyState title="No products found" description="Create your first product to start receiving stock." icon={<PillBottle className="h-5 w-5" />} />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th className="th">Product</th>
                  <th className="th">Category</th>
                  <th className="th">UOM</th>
                  <th className="th">Price</th>
                  <th className="th">Reorder level</th>
                  <th className="th">Fast-move at</th>
                  <th className="th">Status</th>
                  <th className="th" />
                </tr>
              </thead>
              <tbody>
                {rows.map((product) => (
                  <tr key={product.id} className="hover:bg-slate-50/60">
                    <td className="td">
                      <p className="font-semibold text-slate-800">{product.name}</p>
                      <p className="text-[10px] text-slate-500">
                        {product.sku} · {product.genericName ?? "—"}
                      </p>
                    </td>
                    <td className="td text-xs">{product.category}</td>
                    <td className="td text-xs">
                      {product.uom}
                      <span className="ml-1 text-[10px] text-slate-400">pack {product.packSize}</span>
                    </td>
                    <td className="td text-xs font-medium">{money(product.unitPrice)}</td>
                    <td className="td text-xs">{product.reorderLevel}</td>
                    <td className="td text-xs">
                      {product.fastMovingThreshold ?? 60}
                      <span className="ml-1 text-[10px] text-slate-400">/30d</span>
                    </td>
                    <td className="td">
                      <button onClick={() => toggleActive(product)} className={`chip ${product.active ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-100 text-slate-500"}`}>
                        {product.active ? "Active" : "Inactive"}
                      </button>
                    </td>
                    <td className="td text-right">
                      <button onClick={() => openEdit(product)} className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-700">
                        <Pencil className="h-3 w-3" /> Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <InfoBanner tone="info" title="Central admin control">
        Product master changes require the Central Admin role. Stock quantities are never edited directly — they change only through receipts, dispatch, GRN posting and
        dispensing.
      </InfoBanner>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Edit ${editing.name}` : "New product"}
        description="Master data shared by the warehouse and all branches."
        size="lg"
        footer={
          <>
            <button className="btn-ghost btn-sm" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn-primary btn-sm" onClick={save} disabled={busy}>{busy ? "Saving…" : editing ? "Save changes" : "Create product"}</button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="SKU">
            <input value={form.sku} disabled={Boolean(editing)} onChange={(event) => setForm({ ...form, sku: event.target.value })} className="input" placeholder="PCM-500" />
          </Field>
          <Field label="Product name">
            <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="input" placeholder="Paracetamol 500mg" />
          </Field>
          <Field label="Generic name">
            <input value={form.genericName} onChange={(event) => setForm({ ...form, genericName: event.target.value })} className="input" placeholder="Paracetamol" />
          </Field>
          <Field label="Category">
            <input value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} className="input" />
          </Field>
          <Field label="Unit of measure">
            <select value={form.uom} onChange={(event) => setForm({ ...form, uom: event.target.value })} className="input">
              {(data?.uoms ?? UOMS).map((uom) => (
                <option key={uom} value={uom}>{uom}</option>
              ))}
            </select>
          </Field>
          <Field label="Pack size">
            <input type="number" min={1} value={form.packSize} onChange={(event) => setForm({ ...form, packSize: event.target.value })} className="input" />
          </Field>
          <Field label="Unit price (LKR)">
            <input type="number" min={0} value={form.unitPrice} onChange={(event) => setForm({ ...form, unitPrice: event.target.value })} className="input" />
          </Field>
          <Field label="Reorder level" hint="Branch stock below this triggers a reorder alert.">
            <input type="number" min={0} value={form.reorderLevel} onChange={(event) => setForm({ ...form, reorderLevel: event.target.value })} className="input" />
          </Field>
          <Field label="Fast-moving threshold" hint="Units dispensed per 30 days to be classed fast-moving. ≥25% of this is 'moving'; less is 'slow'.">
            <input
              type="number"
              min={1}
              value={form.fastMovingThreshold}
              onChange={(event) => setForm({ ...form, fastMovingThreshold: event.target.value })}
              className="input"
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
