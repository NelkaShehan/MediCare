/* Pure helpers shared by server and client code. */

export const ROLES = ["central_admin", "warehouse_staff", "branch_manager", "pharmacist"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  central_admin: "Central Admin",
  warehouse_staff: "Warehouse Staff",
  branch_manager: "Branch Manager",
  pharmacist: "Pharmacist",
};

/** Landing workspace after sign-in, based on the signed-in user's role. */
export const ROLE_HOME: Record<Role, string> = {
  central_admin: "/dashboard",
  warehouse_staff: "/stvs",
  branch_manager: "/dashboard",
  pharmacist: "/stock-out",
};

export const ROLE_BADGE: Record<Role, string> = {
  central_admin: "bg-slate-900 text-white",
  warehouse_staff: "bg-teal-100 text-teal-800",
  branch_manager: "bg-indigo-100 text-indigo-800",
  pharmacist: "bg-emerald-100 text-emerald-800",
};

export type ExpiryTier = "ok" | "yellow" | "orange" | "red" | "expired";

export const TIER_META: Record<
  ExpiryTier,
  { label: string; short: string; badge: string; dot: string; bar: string; text: string }
> = {
  ok: {
    label: "Healthy",
    short: "6M+",
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-500",
    bar: "bg-emerald-500",
    text: "text-emerald-700",
  },
  yellow: {
    label: "Early warning (< 6 months)",
    short: "6M",
    badge: "bg-amber-100 text-amber-800 border-amber-200",
    dot: "bg-amber-500",
    bar: "bg-amber-500",
    text: "text-amber-700",
  },
  orange: {
    label: "Priority (< 3 months)",
    short: "3M",
    badge: "bg-orange-100 text-orange-800 border-orange-200",
    dot: "bg-orange-500",
    bar: "bg-orange-500",
    text: "text-orange-700",
  },
  red: {
    label: "Near expiry (< 1 month)",
    short: "1M",
    badge: "bg-red-100 text-red-800 border-red-200",
    dot: "bg-red-500",
    bar: "bg-red-500",
    text: "text-red-700",
  },
  expired: {
    label: "Expired / Quarantined",
    short: "Expired",
    badge: "bg-red-100 text-red-800 border-red-300",
    dot: "bg-red-700",
    bar: "bg-red-700",
    text: "text-red-800",
  },
};

export const DAY_MS = 86_400_000;

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function daysToExpiry(expiryDate: string, now: Date = new Date()): number {
  const expiry = new Date(`${expiryDate.slice(0, 10)}T23:59:59Z`).getTime();
  return Math.ceil((expiry - now.getTime()) / DAY_MS);
}

export function expiryTier(days: number): ExpiryTier {
  if (days <= 0) return "expired";
  if (days <= 30) return "red";
  if (days <= 90) return "orange";
  if (days <= 180) return "yellow";
  return "ok";
}

export function tierFor(expiryDate: string, now: Date = new Date()): ExpiryTier {
  return expiryTier(daysToExpiry(expiryDate, now));
}

/** Near-expiry (red) locks transfers/dispatch; expired or non-available locks everything. */
export function lockState(expiryDate: string, batchStatus: string) {
  const tier = tierFor(expiryDate);
  const expired = tier === "expired" || batchStatus === "disposed";
  const dispenseLocked = expired || batchStatus !== "available";
  const transferLocked = dispenseLocked || tier === "red";
  return {
    tier,
    dispenseLocked,
    transferLocked,
    lockLabel: expired ? "Expired - Locked" : transferLocked ? "Transfer Locked" : null,
  };
}

export const STV_STATES = [
  "Created",
  "Picking",
  "Packed & Verified",
  "In-Transit",
  "Delivered",
  "GRN Posted",
] as const;
export type StvState = (typeof STV_STATES)[number];

export const STV_EXCEPTIONS = ["Delivery Exception", "Rejected / Quarantined", "Cancelled"] as const;

export const STV_STATE_STYLE: Record<string, string> = {
  Created: "bg-slate-100 text-slate-700 border-slate-200",
  Picking: "bg-amber-100 text-amber-800 border-amber-200",
  "Packed & Verified": "bg-indigo-100 text-indigo-800 border-indigo-200",
  "In-Transit": "bg-sky-100 text-sky-800 border-sky-200",
  Delivered: "bg-teal-100 text-teal-800 border-teal-200",
  "GRN Posted": "bg-emerald-100 text-emerald-800 border-emerald-200",
  "Delivery Exception": "bg-orange-100 text-orange-800 border-orange-200",
  "Rejected / Quarantined": "bg-red-100 text-red-800 border-red-200",
  Cancelled: "bg-slate-200 text-slate-600 border-slate-300",
};

export const STV_STATE_HINTS: Record<string, string> = {
  Created: "Pick list generated using FEFO (earliest expiry first).",
  Picking: "Storekeeper is picking batches from the shelf.",
  "Packed & Verified": "Items packed and verified. Ready for dispatch.",
  "In-Transit": "Source stock deducted. Destination stock NOT increased yet.",
  Delivered: "Receiving manager confirmed physical delivery. Post GRN to add stock.",
  "GRN Posted": "Accepted quantities added to destination stock. Ledger balanced.",
  "Delivery Exception": "Discrepancy reported. Awaiting resolution by Central Admin.",
  "Rejected / Quarantined": "Shipment rejected — quantities restored to source as quarantined.",
  Cancelled: "Cancelled before dispatch. No stock movement occurred.",
};

export const UOMS = ["Tablet", "Capsule", "Bottle", "Vial", "Ampoule", "Sachet", "Tube", "Box", "Injection", "Syrup"];

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value.length === 10 ? `${value}T00:00:00Z` : value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function money(value: number): string {
  return `LKR ${Math.round(value || 0).toLocaleString("en-LK")}`;
}

export function compact(value: number): string {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value || 0);
}

export type SessionUser = {
  id: number;
  name: string;
  email: string;
  role: Role;
  locationId: number | null;
  locationName: string;
  locationType: string;
};

export type StockRow = {
  batchId: number;
  productId: number;
  sku: string;
  name: string;
  genericName: string | null;
  category: string;
  uom: string;
  unitPrice: number;
  reorderLevel: number;
  locationId: number;
  locationName: string;
  locationType: string;
  batchNumber: string;
  expiryDate: string;
  quantity: number;
  status: string;
  supplier: string | null;
  daysToExpiry: number;
  tier: ExpiryTier;
  dispenseLocked: boolean;
  transferLocked: boolean;
  lockLabel: string | null;
};

export type NotificationItem = {
  id: number;
  type: "expiry" | "reorder" | "slow_moving";
  severity: string;
  title: string;
  message: string;
  status: string;
  locationName: string | null;
  createdAt: string;
};

/** Where a user should land right after authentication. */
export function homePathForRole(role: Role | string, locationId?: number | null): string {
  const home = ROLE_HOME[role as Role] ?? "/dashboard";
  const needsBranch = role === "pharmacist" || role === "branch_manager" || role === "warehouse_staff";
  if (needsBranch && !locationId) return "/dashboard";
  return home;
}
