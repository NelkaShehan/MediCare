"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import {
  Building2,
  CheckCircle2,
  KeyRound,
  Lock,
  MapPin,
  Network,
  Pencil,
  Phone,
  Plus,
  ShieldAlert,
  Trash2,
  UserPlus,
  Users,
  Warehouse,
} from "lucide-react";

import { useSession } from "@/components/app-shell";
import { Card, EmptyState, Field, InfoBanner, Modal, PageHeader, RolePill, StatCard, TableSkeleton } from "@/components/ui";
import { api, apiPatch, apiPost, useApi } from "@/lib/client";
import { compact, money, ROLE_LABELS, type Role } from "@/lib/shared";

type LocationRow = {
  id: number;
  code: string;
  name: string;
  type: string;
  address: string | null;
  phone: string | null;
  createdAt: string;
  units?: number;
  value?: number;
  batches?: number;
  skus?: number;
  alertBatches?: number;
  staff?: number;
};

type LocationsResponse = { rows: LocationRow[]; totalSkus?: number };

const emptyForm = { code: "", name: "", type: "branch", address: "", phone: "" };

type StaffRow = {
  id: number;
  name: string;
  email: string;
  role: Role;
  locationId: number | null;
  locationName: string | null;
  active: boolean;
};

const emptyStaff = { name: "", email: "", password: "", role: "branch_manager" as Role };

export default function BranchesPage() {
  const user = useSession();
  const { data, loading, error, refresh } = useApi<LocationsResponse>("/api/locations?stats=1");
  const staffApi = useApi<{ rows: StaffRow[] }>("/api/users");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<LocationRow | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [busy, setBusy] = useState(false);
  const [staffFor, setStaffFor] = useState<LocationRow | null>(null);
  const [staffForm, setStaffForm] = useState({ ...emptyStaff });
  const [staffBusy, setStaffBusy] = useState(false);

  const staff = staffApi.data?.rows ?? [];

  const isAdmin = user.role === "central_admin";
  const rows = data?.rows ?? [];
  const branches = rows.filter((row) => row.type === "branch");
  const warehouses = rows.filter((row) => row.type === "warehouse");
  const totalUnits = rows.reduce((sum, row) => sum + (row.units ?? 0), 0);
  const totalValue = rows.reduce((sum, row) => sum + (row.value ?? 0), 0);

  function openCreate() {
    setEditing(null);
    setForm({ ...emptyForm });
    setOpen(true);
  }

  function openEdit(location: LocationRow) {
    setEditing(location);
    setForm({
      code: location.code,
      name: location.name,
      type: location.type,
      address: location.address ?? "",
      phone: location.phone ?? "",
    });
    setOpen(true);
  }

  async function save() {
    if (!form.code.trim() || !form.name.trim()) return toast.error("Branch code and name are required");
    setBusy(true);
    try {
      if (editing) {
        await apiPatch("/api/locations", { id: editing.id, name: form.name, address: form.address, phone: form.phone });
        toast.success("Branch updated");
      } else {
        await apiPost("/api/locations", {
          code: form.code,
          name: form.name,
          type: form.type,
          address: form.address,
          phone: form.phone,
        });
        toast.success(`${form.type === "warehouse" ? "Warehouse" : "Branch"} added to the network`);
      }
      const createdName = form.name;
      setOpen(false);
      refresh();
      if (!editing) {
        toast("Next: create a login for this location in Staff accounts.", { icon: "🔑" });
        setTimeout(() => {
          void api<LocationsResponse>("/api/locations?stats=1").then((fresh) => {
            const created = fresh.rows.find((row) => row.name === createdName);
            if (created) {
              setStaffForm({ ...emptyStaff });
              setStaffFor(created);
            }
          });
        }, 400);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to save branch");
    } finally {
      setBusy(false);
    }
  }

  async function saveStaff() {
    if (!staffFor) return;
    if (!staffForm.name.trim() || !staffForm.email.trim() || staffForm.password.length < 6) {
      return toast.error("Name, email and a 6+ character password are required");
    }
    setStaffBusy(true);
    try {
      await apiPost("/api/users", {
        name: staffForm.name,
        email: staffForm.email,
        password: staffForm.password,
        role: staffForm.role,
        locationId: staffFor.id,
      });
      toast.success(`${ROLE_LABELS[staffForm.role]} account created for ${staffFor.name}`);
      setStaffForm({ ...emptyStaff });
      staffApi.refresh();
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to create the account");
    } finally {
      setStaffBusy(false);
    }
  }

  async function remove(location: LocationRow) {
    if (!window.confirm(`Remove ${location.name} from the network? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await api(`/api/locations?id=${location.id}`, { method: "DELETE" });
      toast.success("Branch removed");
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to remove branch");
    } finally {
      setBusy(false);
    }
  }

  if (!isAdmin) {
    return (
      <div className="space-y-4">
        <PageHeader title="Branches" subtitle="Network administration is restricted to the Central Admin." icon={<Network className="h-5 w-5" />} />
        <InfoBanner tone="warning" title="Administrator access required" icon={<Lock className="h-4 w-4" />}>
          Only a Central Admin can add or change branches in the pharmacy network. You can still view your own location from the navbar.
        </InfoBanner>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Pharmacy network & branches"
        subtitle="Add branches to the network, keep their contact details current and monitor stock coverage per location. Only the Central Admin can make changes."
        icon={<Network className="h-5 w-5" />}
        actions={
          <button onClick={openCreate} className="btn-primary btn-sm">
            <Plus className="h-3.5 w-3.5" /> Add branch
          </button>
        }
      />

      {error ? <InfoBanner tone="danger" title="Unable to load the network">{error}</InfoBanner> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Branches" value={branches.length} hint={`${warehouses.length} central warehouse`} icon={<Building2 className="h-5 w-5" />} tone="teal" />
        <StatCard label="Network stock" value={`${compact(totalUnits)} units`} hint={`${data?.totalSkus ?? 0} SKUs in master`} icon={<Warehouse className="h-5 w-5" />} tone="indigo" />
        <StatCard label="Network value" value={money(totalValue)} hint="At cost price" icon={<Network className="h-5 w-5" />} tone="violet" />
        <StatCard
          label="Expiry attention"
          value={rows.reduce((sum, row) => sum + (row.alertBatches ?? 0), 0)}
          hint="Batches past the 6-month window"
          icon={<ShieldAlert className="h-5 w-5" />}
          tone="amber"
        />
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-gradient-to-r from-teal-50 via-white to-white px-5 py-3.5 dark:from-teal-950/40 dark:via-transparent dark:to-transparent">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Locations</h2>
            <p className="text-[11px] text-slate-500">Central warehouse and all branch nodes</p>
          </div>
          <span className="chip border-teal-200 bg-teal-50 text-teal-700">{rows.length} nodes</span>
        </div>

        {loading ? (
          <TableSkeleton rows={4} />
        ) : rows.length === 0 ? (
          <EmptyState title="No locations yet" description="Add your first branch to start receiving stock." icon={<Network className="h-5 w-5" />} />
        ) : (
          <div className="divide-y divide-slate-100">
            {rows.map((location) => {
              const isWarehouse = location.type === "warehouse";
              return (
                <div key={location.id} className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm ${
                        isWarehouse ? "from-slate-700 to-slate-900" : "from-teal-500 to-emerald-500"
                      }`}
                    >
                      {isWarehouse ? <Warehouse className="h-4 w-4" /> : <Building2 className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900">{location.name}</p>
                        <span className="chip border-slate-200 bg-slate-50 font-mono text-slate-600">{location.code}</span>
                        <span
                          className={`chip ${
                            isWarehouse ? "border-slate-300 bg-slate-100 text-slate-700" : "border-teal-200 bg-teal-50 text-teal-700"
                          }`}
                        >
                          {isWarehouse ? "Central warehouse" : "Branch"}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3" /> {location.address ?? "No address recorded"}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Phone className="h-3 w-3" /> {location.phone ?? "—"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 lg:justify-end">
                    <div className="hidden flex-wrap items-center gap-1 xl:flex">
                      {staff.filter((member) => member.locationId === location.id).slice(0, 3).map((member) => (
                        <span key={member.id} className="chip border-slate-200 bg-slate-50 text-slate-600" title={member.email}>
                          {member.name.split(" ")[0]} · {ROLE_LABELS[member.role].split(" ")[0]}
                        </span>
                      ))}
                      {staff.filter((member) => member.locationId === location.id).length === 0 ? (
                        <span className="chip border-amber-200 bg-amber-50 text-amber-800">No logins yet</span>
                      ) : null}
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Units</p>
                        <p className="text-xs font-bold text-slate-800">{compact(location.units ?? 0)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">SKUs</p>
                        <p className="text-xs font-bold text-slate-800">{location.skus ?? 0}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Staff</p>
                        <p className="text-xs font-bold text-slate-800">{location.staff ?? 0}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => {
                          setStaffForm({ ...emptyStaff });
                          setStaffFor(location);
                        }}
                        className="btn btn-ghost btn-sm border-teal-200 text-teal-700 hover:bg-teal-50"
                      >
                        <UserPlus className="h-3.5 w-3.5" /> Staff
                      </button>
                      <button onClick={() => openEdit(location)} className="btn btn-ghost btn-sm">
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </button>
                      {!isWarehouse ? (
                        <button
                          onClick={() => remove(location)}
                          disabled={busy}
                          className="btn btn-ghost btn-sm border-red-200 text-red-600 hover:bg-red-50"
                          title="Remove branch"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="card-pad lg:col-span-2">
          <h2 className="text-sm font-semibold text-slate-900">Coverage by location</h2>
          <p className="text-[11px] text-slate-500">Units, value and expiry exposure for every node</p>
          <div className="mt-3 overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th className="th">Location</th>
                  <th className="th">Units</th>
                  <th className="th">Value</th>
                  <th className="th">Batches</th>
                  <th className="th">Expiry alerts</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((location) => (
                  <tr key={location.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                    <td className="td">
                      <p className="text-xs font-semibold text-slate-800">{location.name}</p>
                      <p className="font-mono text-[10px] text-slate-500">{location.code}</p>
                    </td>
                    <td className="td text-xs font-semibold">{compact(location.units ?? 0)}</td>
                    <td className="td text-xs">{money(location.value ?? 0)}</td>
                    <td className="td text-xs">{location.batches ?? 0}</td>
                    <td className="td">
                      <span className={`chip ${(location.alertBatches ?? 0) > 0 ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
                        {location.alertBatches ?? 0}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="card-pad">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 text-white">
                <Users className="h-3.5 w-3.5" />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Branch logins</h2>
                <p className="text-[11px] text-slate-500">{staff.length} account(s) in the network</p>
              </div>
            </div>
          </div>

          <div className="mt-3 space-y-2">
            {rows.map((location) => {
              const members = staff.filter((member) => member.locationId === location.id);
              return (
                <div key={location.id} className="rounded-xl border border-slate-200 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[11px] font-semibold text-slate-800">{location.name}</p>
                    <button
                      onClick={() => {
                        setStaffForm({ ...emptyStaff });
                        setStaffFor(location);
                      }}
                      className="inline-flex items-center gap-1 text-[10px] font-semibold text-teal-700 hover:text-teal-800"
                    >
                      <UserPlus className="h-3 w-3" /> Add
                    </button>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {members.length === 0 ? (
                      <span className="chip border-amber-200 bg-amber-50 text-[10px] text-amber-800">No login yet</span>
                    ) : (
                      members.map((member) => (
                        <span key={member.id} className={`chip text-[10px] ${member.active ? "border-slate-200 bg-slate-50 text-slate-600" : "border-red-200 bg-red-50 text-red-700"}`}>
                          {member.name} · {ROLE_LABELS[member.role].split(" ")[0]}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-3 flex items-start gap-1.5 rounded-lg bg-slate-50 px-2.5 py-2 text-[10px] leading-relaxed text-slate-500 dark:bg-slate-800/60">
            <KeyRound className="mt-0.5 h-3 w-3 shrink-0 text-teal-600" />
            Each account signs in with its own email and password and lands in the workspace for its role — branch users only ever see their own branch.
          </div>
        </Card>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Edit ${editing.name}` : "Add branch to the network"}
        description={
          editing
            ? "Update the display name and contact details. The code cannot change once created."
            : "The new branch is immediately available for stock receipts, indents and transfers."
        }
        footer={
          <>
            <button className="btn-ghost btn-sm" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn-primary btn-sm" onClick={save} disabled={busy}>
              {busy ? "Saving…" : editing ? "Save changes" : "Add branch"}
            </button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Branch code" hint="2–20 characters, e.g. BR-C or KDY-01">
            <input
              value={form.code}
              disabled={Boolean(editing)}
              onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })}
              className="input font-mono"
              placeholder="BR-C"
            />
          </Field>
          <Field label="Location type" hint={editing ? "Type is fixed after creation." : "Only one central warehouse is allowed."}>
            <select value={form.type} disabled={Boolean(editing)} onChange={(event) => setForm({ ...form, type: event.target.value })} className="input">
              <option value="branch">Branch</option>
              <option value="warehouse">Central warehouse</option>
            </select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Branch name">
              <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="input" placeholder="Branch C — Kandy" />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Address">
              <input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} className="input" placeholder="128 Peradeniya Road, Kandy" />
            </Field>
          </div>
          <Field label="Phone">
            <input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} className="input" placeholder="+94 81 223 4455" />
          </Field>
          <div className="flex items-end">
            <p className="text-[11px] leading-relaxed text-slate-500">
              After saving, create a Branch Manager and Pharmacist for this branch in <strong>Users &amp; roles</strong>.
            </p>
          </div>
        </div>
      </Modal>

      <Modal
        open={staffFor !== null}
        onClose={() => setStaffFor(null)}
        title={`Create login · ${staffFor?.name ?? ""}`}
        description="The account is bound to this location. After signing in, the user only sees this branch (role-scoped)."
        footer={
          <>
            <button className="btn-ghost btn-sm" onClick={() => setStaffFor(null)}>Close</button>
            <button className="btn-primary btn-sm" onClick={saveStaff} disabled={staffBusy}>
              {staffBusy ? "Creating…" : "Create account"}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="rounded-xl border border-teal-200 bg-teal-50/70 px-3 py-2 text-[11px] text-teal-800">
            Location: <strong>{staffFor?.name}</strong> <span className="font-mono">({staffFor?.code})</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Full name">
              <input value={staffForm.name} onChange={(event) => setStaffForm({ ...staffForm, name: event.target.value })} className="input" placeholder="Kandy Manager" />
            </Field>
            <Field label="Email (login)">
              <input
                type="email"
                value={staffForm.email}
                onChange={(event) => setStaffForm({ ...staffForm, email: event.target.value })}
                className="input"
                placeholder="kandy.manager@medicare.lk"
              />
            </Field>
            <Field label="Role">
              <select value={staffForm.role} onChange={(event) => setStaffForm({ ...staffForm, role: event.target.value as Role })} className="input">
                {(Object.keys(ROLE_LABELS) as Role[]).map((role) => (
                  <option key={role} value={role}>{ROLE_LABELS[role]}</option>
                ))}
              </select>
            </Field>
            <Field label="Temporary password" hint="Minimum 6 characters — share it securely.">
              <input value={staffForm.password} onChange={(event) => setStaffForm({ ...staffForm, password: event.target.value })} className="input" placeholder="Welcome@123" />
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 py-2 text-[10px] text-slate-500 dark:bg-slate-800/60">
            <RolePill role={staffForm.role} />
            <span>
              lands on <span className="font-mono text-slate-700 dark:text-slate-300">{staffForm.role === "pharmacist" ? "/stock-out" : staffForm.role === "warehouse_staff" ? "/stvs" : "/dashboard"}</span>
            </span>
          </div>
        </div>
      </Modal>
    </div>
  );
}
