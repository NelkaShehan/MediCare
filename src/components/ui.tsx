"use client";

import { useEffect, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Inbox,
  Lock,
  ShieldAlert,
  X,
} from "lucide-react";

import { cn } from "@/lib/client";
import {
  ROLE_BADGE,
  ROLE_LABELS,
  STV_STATE_STYLE,
  STV_STATES,
  TIER_META,
  type ExpiryTier,
  type Role,
} from "@/lib/shared";

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("card", className)}>{children}</div>;
}

export function PageHeader({
  title,
  subtitle,
  actions,
  icon,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-3">
        {icon ? (
          <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 via-emerald-500 to-cyan-500 text-white shadow-md shadow-teal-500/25 ring-1 ring-white/40">
            {icon}
          </div>
        ) : null}
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
            <span className="h-5 w-1 rounded-full bg-gradient-to-b from-teal-500 to-emerald-400" />
            {title}
          </h1>
          {subtitle ? <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-500">{subtitle}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  trend,
  trendLabel,
  tone = "teal",
  accent,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: ReactNode;
  trend?: "up" | "down" | "flat";
  trendLabel?: string;
  tone?: "teal" | "amber" | "orange" | "red" | "slate" | "indigo" | "sky" | "violet" | "emerald" | "rose";
  accent?: string;
}) {
  const tones: Record<string, { tile: string; ring: string; bar: string; glow: string }> = {
    teal: { tile: "from-teal-500 to-emerald-500", ring: "ring-teal-100", bar: "bg-gradient-to-r from-teal-500 to-emerald-400", glow: "bg-teal-100/60" },
    emerald: { tile: "from-emerald-500 to-green-500", ring: "ring-emerald-100", bar: "bg-gradient-to-r from-emerald-500 to-lime-400", glow: "bg-emerald-100/60" },
    amber: { tile: "from-amber-400 to-yellow-500", ring: "ring-amber-100", bar: "bg-gradient-to-r from-amber-400 to-yellow-400", glow: "bg-amber-100/60" },
    orange: { tile: "from-orange-500 to-amber-500", ring: "ring-orange-100", bar: "bg-gradient-to-r from-orange-500 to-amber-400", glow: "bg-orange-100/60" },
    red: { tile: "from-rose-500 to-red-600", ring: "ring-rose-100", bar: "bg-gradient-to-r from-rose-500 to-red-400", glow: "bg-rose-100/60" },
    rose: { tile: "from-pink-500 to-rose-500", ring: "ring-pink-100", bar: "bg-gradient-to-r from-pink-500 to-rose-400", glow: "bg-pink-100/60" },
    slate: { tile: "from-slate-600 to-slate-800", ring: "ring-slate-200", bar: "bg-gradient-to-r from-slate-600 to-slate-400", glow: "bg-slate-200/60" },
    indigo: { tile: "from-indigo-500 to-blue-600", ring: "ring-indigo-100", bar: "bg-gradient-to-r from-indigo-500 to-blue-400", glow: "bg-indigo-100/60" },
    sky: { tile: "from-sky-500 to-cyan-500", ring: "ring-sky-100", bar: "bg-gradient-to-r from-sky-500 to-cyan-400", glow: "bg-sky-100/60" },
    violet: { tile: "from-violet-500 to-purple-600", ring: "ring-violet-100", bar: "bg-gradient-to-r from-violet-500 to-fuchsia-400", glow: "bg-violet-100/60" },
  };
  const t = tones[tone] ?? tones.teal;

  return (
    <div className={cn("group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg", accent)}>
      <div className={cn("pointer-events-none absolute -right-8 -top-10 h-24 w-24 rounded-full blur-2xl", t.glow)} />
      <div className={cn("absolute inset-x-0 top-0 h-1", t.bar)} />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-2 truncate text-2xl font-bold tracking-tight text-slate-900">{value}</p>
        </div>
        {icon ? (
          <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md ring-1", t.tile, t.ring)}>
            {icon}
          </div>
        ) : null}
      </div>
      <div className="relative mt-3 flex flex-wrap items-center gap-2 text-xs">
        {trend ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-semibold",
              trend === "up" ? "bg-emerald-100 text-emerald-700" : trend === "down" ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-600",
            )}
          >
            {trend === "up" ? <ArrowUpRight className="h-3 w-3" /> : trend === "down" ? <ArrowDownRight className="h-3 w-3" /> : null}
            {trendLabel}
          </span>
        ) : null}
        {hint ? <span className="truncate text-slate-500">{hint}</span> : null}
      </div>
    </div>
  );
}

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("chip", className ?? "border-slate-200 bg-slate-50 text-slate-600")}>{children}</span>;
}

export function ExpiryBadge({ tier, days, lockLabel }: { tier: ExpiryTier; days?: number; lockLabel?: string | null }) {
  const meta = TIER_META[tier];
  return (
    <span className={cn("chip", meta.badge)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
      {tier === "expired" ? "Expired" : days === undefined ? meta.short : `${days}d`}
      {lockLabel ? (
        <>
          <Lock className="ml-0.5 h-3 w-3" />
          {lockLabel}
        </>
      ) : null}
    </span>
  );
}

export function StatusPill({ status }: { status: string }) {
  return (
    <span className={cn("chip whitespace-nowrap", STV_STATE_STYLE[status] ?? "border-slate-200 bg-slate-50 text-slate-600")}>
      {status === "GRN Posted" ? <CheckCircle2 className="h-3 w-3" /> : null}
      {status}
    </span>
  );
}

export function RolePill({ role }: { role: Role }) {
  return <span className={cn("chip border-transparent", ROLE_BADGE[role])}>{ROLE_LABELS[role]}</span>;
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  const widths = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-slate-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-6">
      <div className={cn("animate-in w-full rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:rounded-2xl", widths[size])}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">{title}</h3>
            {description ? <p className="mt-1 text-xs leading-relaxed text-slate-500">{description}</p> : null}
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[65vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3">{footer}</div> : null}
      </div>
    </div>
  );
}

export function EmptyState({ title, description, icon, action }: { title: string; description?: string; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
        {icon ?? <Inbox className="h-6 w-6" />}
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-800">{title}</p>
        {description ? <p className="mt-1 max-w-md text-xs leading-relaxed text-slate-500">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="h-9 animate-pulse rounded-lg bg-slate-100" />
      ))}
    </div>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
      <span>
        Showing <span className="font-semibold text-slate-700">{total === 0 ? 0 : (page - 1) * pageSize + 1}</span>–
        <span className="font-semibold text-slate-700">{Math.min(page * pageSize, total)}</span> of{" "}
        <span className="font-semibold text-slate-700">{total}</span> records
      </span>
      <div className="flex items-center gap-1">
        <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </button>
        {Array.from({ length: Math.min(5, pages) }).map((_, index) => {
          const start = Math.max(1, Math.min(page - 2, pages - 4));
          const value = start + index;
          if (value > pages) return null;
          return (
            <button
              key={value}
              onClick={() => onPage(value)}
              className={cn(
                "h-7 min-w-7 rounded-lg px-2 text-xs font-semibold transition",
                value === page ? "bg-teal-600 text-white" : "text-slate-600 hover:bg-slate-100",
              )}
            >
              {value}
            </button>
          );
        })}
        <button className="btn btn-ghost btn-sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}

export function Stepper({ status }: { status: string }) {
  const currentIndex = STV_STATES.indexOf(status as (typeof STV_STATES)[number]);
  const isException = currentIndex === -1;
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {STV_STATES.map((state, index) => {
          const done = currentIndex >= 0 && index < currentIndex;
          const active = index === currentIndex;
          return (
            <div key={state} className="flex flex-1 items-center gap-2">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold",
                    done
                      ? "border-teal-600 bg-teal-600 text-white"
                      : active
                        ? "border-teal-600 bg-teal-50 text-teal-700 ring-4 ring-teal-500/10"
                        : "border-slate-200 bg-white text-slate-400",
                  )}
                >
                  {done ? <Check className="h-3.5 w-3.5" /> : index + 1}
                </span>
                <span
                  className={cn(
                    "whitespace-nowrap text-[11px] font-semibold",
                    active ? "text-teal-700" : done ? "text-slate-700" : "text-slate-400",
                  )}
                >
                  {state}
                </span>
              </div>
              {index < STV_STATES.length - 1 ? (
                <div className={cn("hidden h-px flex-1 sm:block", done ? "bg-teal-500" : "bg-slate-200")} />
              ) : null}
            </div>
          );
        })}
      </div>
      {isException ? (
        <div className="flex items-start gap-2 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2.5 text-xs text-orange-800">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Exception state: {status}</p>
            <p className="mt-0.5 text-orange-700">Stock movement is paused pending resolution. All transitions are captured in the audit trail.</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function InfoBanner({
  tone = "info",
  title,
  children,
  icon,
}: {
  tone?: "info" | "warning" | "danger" | "success";
  title?: string;
  children: ReactNode;
  icon?: ReactNode;
}) {
  const tones = {
    info: "border-sky-200 bg-sky-50 text-sky-800",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
    danger: "border-red-200 bg-red-50 text-red-800",
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  };
  return (
    <div className={cn("flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-xs leading-relaxed", tones[tone])}>
      <span className="mt-0.5 shrink-0">{icon ?? <AlertTriangle className="h-4 w-4" />}</span>
      <div>
        {title ? <p className="font-semibold">{title}</p> : null}
        <div className={title ? "mt-0.5 opacity-90" : ""}>{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div>
      <span className="label">{label}</span>
      {children}
      {hint ? <p className="mt-1 text-[11px] text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function MiniBar({ value, max, tone = "bg-teal-500" }: { value: number; max: number; tone?: string }) {
  const width = max > 0 ? Math.max(2, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
      <div className={cn("h-full rounded-full", tone)} style={{ width: `${width}%` }} />
    </div>
  );
}

/** Colourful card section header used across the workspaces. */
export function SectionHeader({
  icon,
  title,
  subtitle,
  right,
  gradient = "from-teal-500 to-emerald-400",
}: {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  right?: ReactNode;
  gradient?: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2.5">
        {icon ? (
          <span className={cn("flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br text-white shadow-sm", gradient)}>{icon}</span>
        ) : null}
        <div>
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          {subtitle ? <p className="text-[11px] text-slate-500">{subtitle}</p> : null}
        </div>
      </div>
      {right}
    </div>
  );
}
