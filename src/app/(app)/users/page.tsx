"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Plus, ShieldCheck, UserCog, Users } from "lucide-react";

import { useSession } from "@/components/app-shell";
import { Card, Field, InfoBanner, Modal, PageHeader, RolePill, TableSkeleton } from "@/components/ui";
import { apiPatch, apiPost, useApi } from "@/lib/client";
import { formatDate, ROLE_LABELS, type Role } from "@/lib/shared";

type UserRow = {
  id: number;
  name: string;
  email: string;
  role: Role;
  locationId: number | null;
  locationName: string | null;
  active: boolean;
  createdAt: string;
};

type LocationRow = { id: number; name: string; type: string };

const emptyForm = { name: "", email: "", password: "", role: "pharmacist" as Role, locationId: "" };

export default function UsersPage() {
  const session = useSession();
  const users = useApi<{ rows: UserRow[] }>("/api/users");
  const locations = useApi<{ rows: LocationRow[] }>("/api/locations");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const rows = users.data?.rows ?? [];

  async function createUser() {
    if (!form.name.trim() || !form.email.trim() || form.password.length < 6) {
      return toast.error("Name, email and a 6+ character password are required");
    }
    setBusy(true);
    try {
      await apiPost("/api/users", {
        name: form.name,
        email: form.email,
        password: form.password,
        role: form.role,
        locationId: form.locationId ? Number(form.locationId) : undefined,
      });
      toast.success("User created");
      setOpen(false);
      setForm({ ...emptyForm });
      users.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to create user");
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    if (!editing) return;
    setBusy(true);
    try {
      await apiPatch("/api/users", {
        id: editing.id,
        role: editing.role,
        locationId: editing.locationId ?? undefined,
        active: editing.active,
        password: newPassword ? newPassword : undefined,
      });
      toast.success(newPassword ? "User updated and password reset" : "User updated");
      setEditing(null);
      setNewPassword("");
      users.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update user");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Users, roles & access"
        subtitle="Role-based access control determines every dashboard, navigation item and API action. Branch users are scoped to their own location."
        icon={<Users className="h-5 w-5" />}
        actions={
          <button className="btn-primary btn-sm" onClick={() => setOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> New user
          </button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(Object.keys(ROLE_LABELS) as Role[]).map((role) => (
          <Card
            key={role}
            className={`card-pad relative overflow-hidden bg-gradient-to-br ${
              role === "central_admin"
                ? "from-slate-100 via-white to-slate-200/60"
                : role === "warehouse_staff"
                  ? "from-teal-50 via-white to-emerald-100/60"
                  : role === "branch_manager"
                    ? "from-indigo-50 via-white to-blue-100/60"
                    : "from-fuchsia-50 via-white to-pink-100/60"
            }`}
          >
            <div className={`absolute inset-x-0 top-0 h-1 ${
              role === "central_admin" ? "bg-slate-800" : role === "warehouse_staff" ? "bg-teal-500" : role === "branch_manager" ? "bg-indigo-500" : "bg-fuchsia-500"
            }`} />
            <div className="flex items-center justify-between">
              <RolePill role={role} />
              <span className="text-lg font-bold text-slate-900">{rows.filter((row) => row.role === role).length}</span>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
              {role === "central_admin"
                ? "Global access across branches and warehouse."
                : role === "warehouse_staff"
                  ? "Central warehouse picking, dispatch and returns."
                  : role === "branch_manager"
                    ? "Branch indents, transfers, GRN and EOD."
                    : "Dispensing from branch inventory."}
            </p>
          </Card>
        ))}
      </div>

      <Card>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Platform users</h2>
            <p className="text-[11px] text-slate-500">{rows.length} accounts · passwords hashed with bcrypt</p>
          </div>
          <span className="chip border-teal-200 bg-teal-50 text-teal-700">
            <ShieldCheck className="h-3 w-3" /> JWT session
          </span>
        </div>
        {users.loading ? (
          <TableSkeleton rows={6} />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th className="th">User</th>
                  <th className="th">Role</th>
                  <th className="th">Location</th>
                  <th className="th">Status</th>
                  <th className="th">Created</th>
                  <th className="th" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/60">
                    <td className="td">
                      <p className="font-semibold text-slate-800">
                        {row.name}
                        {row.id === session.id ? <span className="ml-1.5 chip border-slate-200 bg-slate-50 text-slate-500">you</span> : null}
                      </p>
                      <p className="text-[10px] text-slate-500">{row.email}</p>
                    </td>
                    <td className="td"><RolePill role={row.role} /></td>
                    <td className="td text-xs">
                      {row.locationName ?? <span className="chip border-amber-200 bg-amber-50 text-[10px] text-amber-800">No location assigned</span>}
                    </td>
                    <td className="td">
                      <span className={`chip ${row.active ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-100 text-slate-500"}`}>
                        {row.active ? "Active" : "Disabled"}
                      </span>
                    </td>
                    <td className="td text-xs text-slate-500">{formatDate(row.createdAt)}</td>
                    <td className="td text-right">
                      <button
                        onClick={() => {
                          setNewPassword("");
                          setEditing({ ...row });
                        }}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-700"
                      >
                        <UserCog className="h-3 w-3" /> Manage
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {(users.data?.rows ?? []).some((row) => !row.locationName && row.role !== "central_admin") ? (
        <InfoBanner tone="warning" title="Some accounts have no location" icon={<UserCog className="h-4 w-4" />}>
          Branch-scoped roles (Branch Manager, Pharmacist, Warehouse Staff) need a location before they can work. Use <strong>Manage → Location</strong> to assign one.
        </InfoBanner>
      ) : null}

      <InfoBanner tone="info" title="Only your administrator account exists">
        The system now starts with a single administrator (<strong>Nelka Shehan</strong>). Add your own users here and assign each one a role and location — they can sign
        in immediately with the password you set.
      </InfoBanner>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Create user"
        description="Assign a role and location. Roles are enforced server-side on every endpoint."
        footer={
          <>
            <button className="btn-ghost btn-sm" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn-primary btn-sm" onClick={createUser} disabled={busy}>{busy ? "Creating…" : "Create user"}</button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Full name">
            <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="input" />
          </Field>
          <Field label="Email">
            <input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className="input" />
          </Field>
          <Field label="Temporary password" hint="Minimum 6 characters">
            <input value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} className="input" />
          </Field>
          <Field label="Role">
            <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as Role })} className="input">
              {(Object.keys(ROLE_LABELS) as Role[]).map((role) => (
                <option key={role} value={role}>{ROLE_LABELS[role]}</option>
              ))}
            </select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Location" hint="Central admin typically has warehouse oversight; branch roles must be assigned to a branch.">
              <select value={form.locationId} onChange={(event) => setForm({ ...form, locationId: event.target.value })} className="input">
                <option value="">Head office / global</option>
                {(locations.data?.rows ?? []).map((location) => (
                  <option key={location.id} value={location.id}>{location.name}</option>
                ))}
              </select>
            </Field>
          </div>
        </div>
      </Modal>

      <Modal
        open={editing !== null}
        onClose={() => {
          setEditing(null);
          setNewPassword("");
        }}
        title={`Manage ${editing?.name ?? ""}`}
        description="Update role, location assignment or account status."
        footer={
          <>
            <button className="btn-ghost btn-sm" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn-primary btn-sm" onClick={saveEdit} disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
          </>
        }
      >
        {editing ? (
          <div className="space-y-3">
            <Field label="Role">
              <select value={editing.role} onChange={(event) => setEditing({ ...editing, role: event.target.value as Role })} className="input">
                {(Object.keys(ROLE_LABELS) as Role[]).map((role) => (
                  <option key={role} value={role}>{ROLE_LABELS[role]}</option>
                ))}
              </select>
            </Field>
            <Field label="Location">
              <select
                value={editing.locationId ?? ""}
                onChange={(event) => setEditing({ ...editing, locationId: event.target.value ? Number(event.target.value) : null })}
                className="input"
              >
                <option value="">Head office / global</option>
                {(locations.data?.rows ?? []).map((location) => (
                  <option key={location.id} value={location.id}>{location.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Reset password" hint="Leave blank to keep the current password.">
              <input
                type="text"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="New password (min 6 characters)"
                className="input"
              />
            </Field>
            <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-medium text-slate-700">
              <input
                type="checkbox"
                checked={editing.active}
                onChange={(event) => setEditing({ ...editing, active: event.target.checked })}
                className="h-4 w-4 rounded border-slate-300 text-teal-600"
              />
              Account active (can sign in)
            </label>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
