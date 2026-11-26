"use client";

import { Link } from "@/components/link";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowRight,
  Boxes,
  CalendarClock,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  FileText,
  Gauge,
  IndianRupee,
  Layers,
  Lock,
  Package,
  PackageX,
  Pill,
  RefreshCw,
  ShoppingCart,
  Sparkles,
  Truck,
  Undo2,
} from "lucide-react";

import { useEffect, useState } from "react";

import { useSession } from "@/components/app-shell";
import { Card, ExpiryBadge, MiniBar, PageHeader, StatusPill, StatCard, TableSkeleton, InfoBanner, EmptyState } from "@/components/ui";
import { api } from "@/lib/client";
import { compact, formatDate, formatDateTime, money, ROLE_LABELS, TIER_META, type ExpiryTier, type StockRow } from "@/lib/shared";
import { greetingForHour, localDateLabel, localTimeLabel, type Greeting } from "@/lib/greeting";

type DashboardData = {
  totals: {
    units: number;
    value: number;
    batches: number;
    skus: number;
    locations: number;
    dispensedToday: number;
    pendingIndents: number;
    pendingTransfers: number;
    pendingStvs: number;
    fastMovers: number;
    slowMovers: number;
  };
  expiry: { counts: Record<string, number>; units: Record<string, number> };
  stockByLocation: { name: string; units: number; value: number; batches: number }[];
  stockByCategory: { name: string; units: number }[];
  velocity: { name: string; location: string; dispensed: number; onHand: number; classification: string }[];
  fastMovers: { productName: string; locationName: string; dispensed30: number; onHand: number; ratePerDay: number }[];
  slowMovers: { productId: number; productName: string; locationName: string; dispensed30: number; onHand: number; ratePerDay: number }[];
  suggestions: { productName: string; from: string; to: string; onHand: number; suggestedQty: number; dispensed30: number }[];
  dispensingTrend: { date: string; label: string; units: number }[];
  stvPipeline: { status: string; count: number }[];
  lowStock: { productId: number; name: string; locationName: string; onHand: number; reorderLevel: number; uom: string }[];
  expiryBatches: {
    batchId: number;
    name: string;
    batchNumber: string;
    expiryDate: string;
    daysToExpiry: number;
    quantity: number;
    uom: string;
    locationName: string;
    tier: ExpiryTier;
    lockLabel: string | null;
  }[];
  recentStvs: {
    id: number;
    code: string;
    type: string;
    status: string;
    sourceName: string;
    destinationName: string;
    totalUnits: number;
    createdAt: string;
  }[];
  activity: { id: number; userName: string; action: string; details: string | null; createdAt: string }[];
};

const CHART_COLORS = ["#0d9488", "#059669", "#0ea5e9", "#6366f1", "#f59e0b", "#f97316", "#dc2626", "#64748b"];

export function DashboardView({ initialData }: { initialData: DashboardData | null }) {
  const user = useSession();
  const [data, setData] = useState<DashboardData | null>(initialData);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const loading = data === null && error === null;

  const refresh = async () => {
    setRefreshing(true);
    try {
      const next = await api<DashboardData>("/api/dashboard");
      setData(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load dashboard");
    } finally {
      setRefreshing(false);
    }
  };

  // Greeting follows the viewer's own clock and updates every minute.
  const [clock, setClock] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setClock(new Date());
    tick();
    const timer = setInterval(tick, 30_000);
    return () => clearInterval(timer);
  }, []);

  const greeting: Greeting | null = clock ? greetingForHour(clock.getHours()) : null;
  const today = clock ? localDateLabel(clock) : "your workspace";
  const expiryCounts = data?.expiry.counts ?? { yellow: 0, orange: 0, red: 0, expired: 0 };

  const quickActions = [
    { href: "/indents", label: "Raise indent", icon: FileText, roles: ["branch_manager", "pharmacist"] },
    { href: "/stock-out", label: "Dispense medicine", icon: Pill, roles: ["pharmacist", "branch_manager"] },
    { href: "/stvs", label: "Pick & dispatch", icon: Truck, roles: ["warehouse_staff", "central_admin", "branch_manager"] },
    { href: "/transfers", label: "Inter-branch", icon: ArrowLeftRight, roles: ["branch_manager", "central_admin"] },
    { href: "/eod", label: "EOD sheet", icon: ClipboardCheck, roles: ["pharmacist", "branch_manager", "central_admin"] },
    { href: "/products", label: "Product master", icon: Layers, roles: ["central_admin"] },
  ].filter((a) => a.roles.includes(user.role));

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${greeting ? greeting.text : "Welcome"}, ${user.name.split(" ")[0]}${greeting ? ` ${greeting.emoji}` : ""}`}
        subtitle={`${ROLE_LABELS[user.role]} workspace · ${user.locationName} · ${today}${clock ? ` · ${localTimeLabel(clock)} local` : ""}${
          greeting ? ` — ${greeting.hint}` : ""
        }`}
        icon={<Gauge className="h-5 w-5" />}
        actions={
          <>
            <button onClick={refresh} className="btn btn-ghost btn-sm">
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} /> Refresh
            </button>
            {quickActions.slice(0, 2).map((action) => (
              <Link key={action.href} href={action.href} className="btn-primary btn-sm">
                <action.icon className="h-3.5 w-3.5" /> {action.label}
              </Link>
            ))}
          </>
        }
      />

      {error ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800">
          <span>
            <span className="font-semibold">Unable to load dashboard.</span> {error}
          </span>
          <button onClick={refresh} className="btn btn-ghost btn-sm border-red-200 text-red-700 hover:bg-red-100">
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </button>
        </div>
      ) : null}

      {loading || !data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Card key={index} className="h-32 animate-pulse"><span /></Card>
          ))}
        </div>
      ) : (
        <>
          {/* Colourful hero strip */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-teal-600 via-emerald-600 to-cyan-600 p-5 text-white shadow-lg shadow-teal-600/20">
            <div className="absolute -right-10 -top-16 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
            <div className="absolute -bottom-20 right-24 h-56 w-56 rounded-full bg-amber-300/20 blur-3xl" />
            <div className="relative flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-teal-100">{user.locationName} · live snapshot</p>
                <p className="mt-1 text-2xl font-bold tracking-tight">
                  {compact(data.totals.units)} units on hand across {data.totals.batches} batches
                </p>
                <p className="mt-1 text-xs text-teal-50/90">
                  Inventory valued at {money(data.totals.value)} · {data.totals.skus} SKUs · {data.totals.locations} locations
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: "6M", value: expiryCounts.yellow, cls: "bg-amber-300/90 text-amber-950" },
                  { label: "3M", value: expiryCounts.orange, cls: "bg-orange-300/90 text-orange-950" },
                  { label: "1M", value: expiryCounts.red, cls: "bg-red-300/90 text-red-950" },
                  { label: "Expired", value: expiryCounts.expired, cls: "bg-slate-900/70 text-white" },
                ].map((chip) => (
                  <span key={chip.label} className={`rounded-xl px-3 py-2 text-center shadow-sm ${chip.cls}`}>
                    <span className="block text-lg font-bold leading-none">{chip.value}</span>
                    <span className="text-[10px] font-semibold uppercase tracking-wide">{chip.label}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* KPI cards */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Stock on hand"
              value={`${compact(data.totals.units)} units`}
              hint={`${data.totals.batches} active batches · ${data.totals.skus} SKUs`}
              icon={<Boxes className="h-5 w-5" />}
              tone="teal"
              trend="up"
              trendLabel="Live"
            />
            <StatCard
              label="Inventory value"
              value={money(data.totals.value)}
              hint={user.role === "central_admin" ? `Across ${data.totals.locations} locations` : "At your location"}
              icon={<IndianRupee className="h-5 w-5" />}
              tone="violet"
            />
            <StatCard
              label="Dispensed today"
              value={`${compact(data.totals.dispensedToday)} units`}
              hint="Manual stock-out records"
              icon={<Pill className="h-5 w-5" />}
              tone="sky"
              trend={data.totals.dispensedToday > 0 ? "up" : "flat"}
              trendLabel="FEFO"
            />
            <StatCard
              label={user.role === "central_admin" ? "Awaiting approval" : "Action queue"}
              value={
                user.role === "central_admin"
                  ? data.totals.pendingIndents + data.totals.pendingTransfers
                  : data.totals.pendingIndents + data.totals.pendingStvs
              }
              hint={`${data.totals.pendingIndents} indents · ${data.totals.pendingStvs} STVs · ${data.totals.pendingTransfers} transfers`}
              icon={<ClipboardList className="h-5 w-5" />}
              tone="amber"
            />
          </div>

          {/* Expiry tier strip */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {(["yellow", "orange", "red", "expired"] as ExpiryTier[]).map((tier) => {
              const meta = TIER_META[tier];
              const count = expiryCounts[tier] ?? 0;
              const units = data.expiry.units[tier] ?? 0;
              return (
                <Link
                  key={tier}
                  href={`/expiry-alerts?tier=${tier}`}
                  className={`card card-pad group relative overflow-hidden border-0 transition hover:-translate-y-0.5 hover:shadow-lg ${
                    tier === "yellow"
                      ? "bg-gradient-to-br from-amber-50 via-white to-amber-100/70"
                      : tier === "orange"
                        ? "bg-gradient-to-br from-orange-50 via-white to-orange-100/70"
                        : tier === "red"
                          ? "bg-gradient-to-br from-red-50 via-white to-rose-100/70"
                          : "bg-gradient-to-br from-slate-100 via-white to-slate-200/70"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        {tier === "yellow" ? "6-month warning" : tier === "orange" ? "3-month priority" : tier === "red" ? "1-month critical" : "Expired / quarantined"}
                      </p>
                      <p className="mt-1.5 text-2xl font-bold text-slate-900">{count}</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">{compact(units)} units impacted</p>
                    </div>
                    <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${meta.badge}`}>
                      {tier === "expired" ? <Lock className="h-4 w-4" /> : tier === "red" ? <AlertTriangle className="h-4 w-4" /> : <CalendarClock className="h-4 w-4" />}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className={`chip ${meta.badge}`}>{tier === "expired" ? "Hard lock" : tier === "red" ? "Transfer locked" : "Redistribute"}</span>
                    <ChevronRight className="h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-teal-600" />
                  </div>
                </Link>
              );
            })}
          </div>

          {/* STV pipeline */}
          <Card className="card-pad">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-cyan-400 text-white">
                    <Truck className="h-3.5 w-3.5" />
                  </span>
                  Stock transfer pipeline
                </h2>
                <p className="text-[11px] text-slate-500">Destination stock is only increased when the GRN is posted.</p>
              </div>
              <Link href="/stvs" className="text-xs font-semibold text-teal-700 hover:text-teal-800">
                Open vouchers →
              </Link>
            </div>
            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {data.stvPipeline.map((step) => (
                <div
                  key={step.status}
                  className={`rounded-xl border p-3 ${
                    step.status === "Created"
                      ? "border-slate-200 bg-gradient-to-br from-slate-50 to-slate-100"
                      : step.status === "Picking"
                        ? "border-amber-200 bg-gradient-to-br from-amber-50 to-amber-100"
                        : step.status === "Packed & Verified"
                          ? "border-indigo-200 bg-gradient-to-br from-indigo-50 to-indigo-100"
                          : step.status === "In-Transit"
                            ? "border-sky-200 bg-gradient-to-br from-sky-50 to-sky-100"
                            : step.status === "Delivered"
                              ? "border-teal-200 bg-gradient-to-br from-teal-50 to-teal-100"
                              : "border-emerald-200 bg-gradient-to-br from-emerald-50 to-emerald-100"
                  }`}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">{step.status}</p>
                  <p className="mt-1 text-xl font-bold text-slate-900">{step.count}</p>
                </div>
              ))}
            </div>
          </Card>

          {/* Charts */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="card-pad lg:col-span-2">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-teal-500 to-emerald-400 text-white">
                      <Boxes className="h-3.5 w-3.5" />
                    </span>
                    Stock distribution by location
                  </h2>
                  <p className="text-[11px] text-slate-500">Units on hand per node</p>
                </div>
                <span className="chip border-teal-200 bg-teal-50 text-teal-700">
                  <Boxes className="h-3 w-3" /> {data.stockByLocation.length} nodes
                </span>
              </div>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.stockByLocation} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }} />
                    <Bar dataKey="units" radius={[8, 8, 0, 0]} maxBarSize={64}>
                      {data.stockByLocation.map((_, index) => (
                        <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="card-pad">
              <div className="mb-4">
                <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-fuchsia-500 to-pink-500 text-white">
                    <Gauge className="h-3.5 w-3.5" />
                  </span>
                  Fast vs slow moving
                </h2>
                <p className="text-[11px] text-slate-500">Consumption velocity (30 days)</p>
              </div>
              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: "Fast", value: data.velocity.filter((v) => v.classification === "fast").length },
                        { name: "Moving", value: data.velocity.filter((v) => v.classification === "moving").length },
                        { name: "Slow", value: data.velocity.filter((v) => v.classification === "slow").length },
                        { name: "No movement", value: data.velocity.filter((v) => v.classification === "no-movement").length },
                      ]}
                      dataKey="value"
                      innerRadius={42}
                      outerRadius={68}
                      paddingAngle={2}
                    >
                      {["#10b981", "#0ea5e9", "#f59e0b", "#ef4444"].map((color, index) => (
                        <Cell key={index} fill={color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 10 }} iconType="circle" />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-center">
                <div className="rounded-lg bg-teal-50 px-2 py-1.5">
                  <p className="text-[10px] font-semibold uppercase text-teal-700">Fast movers</p>
                  <p className="text-sm font-bold text-teal-800">{data.totals.fastMovers}</p>
                </div>
                <div className="rounded-lg bg-amber-50 px-2 py-1.5">
                  <p className="text-[10px] font-semibold uppercase text-amber-700">Slow movers</p>
                  <p className="text-sm font-bold text-amber-800">{data.totals.slowMovers}</p>
                </div>
              </div>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="card-pad lg:col-span-2">
              <div className="mb-4">
                <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-sky-500 text-white">
                    <Sparkles className="h-3.5 w-3.5" />
                  </span>
                  Dispensing trend · last 14 days
                </h2>
                <p className="text-[11px] text-slate-500">Units dispensed manually from branch inventory</p>
              </div>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.dispensingTrend} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="dispenseGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.35} />
                        <stop offset="55%" stopColor="#0ea5e9" stopOpacity={0.16} />
                        <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }} />
                    <Area type="monotone" dataKey="units" stroke="#0ea5e9" strokeWidth={2.5} fill="url(#dispenseGradient)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="card-pad">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-rose-500 text-white">
                    <CalendarClock className="h-3.5 w-3.5" />
                  </span>
                  Expiry watchlist
                </h2>
                <Link href="/expiry-alerts" className="text-[11px] font-semibold text-teal-700">
                  All
                </Link>
              </div>
              <div className="space-y-2.5">
                {data.expiryBatches.slice(0, 5).map((batch) => (
                  <div key={batch.batchId} className="rounded-xl border border-slate-100 bg-slate-50/50 p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-slate-800">{batch.name}</p>
                        <p className="truncate text-[10px] text-slate-500">
                          {batch.batchNumber} · {batch.locationName}
                        </p>
                      </div>
                      <ExpiryBadge tier={batch.tier} days={batch.daysToExpiry} />
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-500">
                      <span>
                        {batch.quantity} {batch.uom} · exp {formatDate(batch.expiryDate)}
                      </span>
                      {batch.lockLabel ? (
                        <span className="flex items-center gap-0.5 font-semibold text-red-700">
                          <Lock className="h-3 w-3" /> Locked
                        </span>
                      ) : null}
                    </div>
                  </div>
                ))}
                {data.expiryBatches.length === 0 ? <EmptyState title="No expiry risks" description="Every batch is beyond the 6-month window." /> : null}
              </div>
            </Card>
          </div>

          {/* Role-specific action panels */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">
                    {user.role === "central_admin"
                      ? "Approvals & redistribution"
                      : user.role === "warehouse_staff"
                        ? "Warehouse fulfilment queue"
                        : "Branch action centre"}
                  </h2>
                  <p className="text-[11px] text-slate-500">Priority items requiring your role</p>
                </div>
                <Link href={user.role === "warehouse_staff" ? "/indents" : "/stvs"} className="text-[11px] font-semibold text-teal-700">
                  Open workspace →
                </Link>
              </div>

              <div className="grid gap-3 p-4 sm:grid-cols-3">
                <Link href="/indents" className="rounded-xl border border-teal-200 bg-gradient-to-br from-teal-50 to-white p-3 transition hover:-translate-y-0.5 hover:shadow-md">
                  <FileText className="h-4 w-4 text-teal-600" />
                  <p className="mt-2 text-lg font-bold text-slate-900">{data.totals.pendingIndents}</p>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Pending indents</p>
                </Link>
                <Link href="/stvs" className="rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white p-3 transition hover:-translate-y-0.5 hover:shadow-md">
                  <Truck className="h-4 w-4 text-indigo-600" />
                  <p className="mt-2 text-lg font-bold text-slate-900">{data.totals.pendingStvs}</p>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Open pick / dispatch</p>
                </Link>
                <Link href="/transfers" className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-3 transition hover:-translate-y-0.5 hover:shadow-md">
                  <ArrowLeftRight className="h-4 w-4 text-amber-600" />
                  <p className="mt-2 text-lg font-bold text-slate-900">{data.totals.pendingTransfers}</p>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Inter-branch requests</p>
                </Link>
              </div>

              <div className="border-t border-slate-100 px-5 py-4">
                <div className="mb-2 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-teal-600" />
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Slow-moving redistribution suggestions</h3>
                </div>
                <div className="space-y-2">
                  {data.suggestions.map((s, index) => (
                    <div key={index} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-100 bg-amber-50/50 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-slate-800">{s.productName}</p>
                        <p className="truncate text-[10px] text-slate-500">
                          {s.from} → {s.to} · moved {s.dispensed30} units/30d at source
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="chip border-amber-200 bg-white text-amber-700">Suggest {s.suggestedQty} units</span>
                        <Link href="/transfers" className="text-[11px] font-semibold text-teal-700">
                          Transfer
                        </Link>
                      </div>
                    </div>
                  ))}
                  {data.suggestions.length === 0 ? <p className="text-xs text-slate-500">No redistribution opportunities detected.</p> : null}
                </div>
              </div>

              <div className="border-t border-slate-100 px-5 py-4">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Fast movers to protect</h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  {data.fastMovers.slice(0, 4).map((item, index) => (
                    <div key={index} className="rounded-lg border border-slate-100 px-2.5 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-[11px] font-semibold text-slate-800">{item.productName}</p>
                        <span className="text-[10px] font-bold text-teal-700">{item.dispensed30}/mo</span>
                      </div>
                      <div className="mt-1.5">
                        <MiniBar value={item.dispensed30} max={Math.max(...data.fastMovers.map((f) => f.dispensed30), 1)} />
                      </div>
                      <p className="mt-1 truncate text-[10px] text-slate-500">{item.locationName} · {item.onHand} on hand</p>
                    </div>
                  ))}
                  {data.fastMovers.length === 0 ? <p className="text-xs text-slate-500">Not enough dispensing history yet.</p> : null}
                </div>
              </div>
            </Card>

            <div className="space-y-4">
              <Card className="card-pad">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-900">Reorder risks</h2>
                  <Link href="/inventory" className="text-[11px] font-semibold text-teal-700">
                    Inventory
                  </Link>
                </div>
                <div className="space-y-2.5">
                  {data.lowStock.map((item, index) => (
                    <div key={index}>
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="truncate font-semibold text-slate-800">{item.name}</span>
                        <span className="shrink-0 font-bold text-red-600">
                          {item.onHand}/{item.reorderLevel}
                        </span>
                      </div>
                      <p className="mb-1 text-[10px] text-slate-500">{item.locationName}</p>
                      <MiniBar value={item.onHand} max={item.reorderLevel} tone={item.onHand === 0 ? "bg-red-500" : "bg-amber-500"} />
                    </div>
                  ))}
                  {data.lowStock.length === 0 ? (
                    <div className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-700">
                      <Package className="h-3.5 w-3.5" /> All products above reorder level.
                    </div>
                  ) : null}
                </div>
              </Card>

              <Card className="card-pad">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-900">Recent activity</h2>
                  <span className="chip border-slate-200 bg-slate-50 text-slate-500">Audit</span>
                </div>
                <div className="space-y-2.5">
                  {data.activity.map((item) => (
                    <div key={item.id} className="flex gap-2">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-500" />
                      <div className="min-w-0">
                        <p className="truncate text-[11px] font-semibold text-slate-800">{item.action.replace(/\./g, " · ")}</p>
                        <p className="line-clamp-2 text-[10px] leading-relaxed text-slate-500">{item.details}</p>
                        <p className="mt-0.5 text-[10px] text-slate-400">
                          {item.userName} · {formatDateTime(item.createdAt)}
                        </p>
                      </div>
                    </div>
                  ))}
                  {data.activity.length === 0 ? <p className="text-xs text-slate-500">No activity recorded yet.</p> : null}
                </div>
              </Card>
            </div>
          </div>

          {/* Recent STVs */}
          <Card>
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Recent transfer vouchers</h2>
                <p className="text-[11px] text-slate-500">Warehouse & inter-branch movements</p>
              </div>
              <Link href="/stvs" className="text-[11px] font-semibold text-teal-700">
                View all
              </Link>
            </div>
            {data.recentStvs.length === 0 ? (
              <EmptyState title="No vouchers yet" description="Approved indents and inter-branch transfers generate vouchers here." icon={<Truck className="h-5 w-5" />} />
            ) : (
              <div className="overflow-x-auto">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th className="th">Voucher</th>
                      <th className="th">Route</th>
                      <th className="th">Units</th>
                      <th className="th">Status</th>
                      <th className="th">Created</th>
                      <th className="th" />
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentStvs.map((stv) => (
                      <tr key={stv.id} className="hover:bg-slate-50/60">
                        <td className="td">
                          <p className="font-semibold text-slate-800">{stv.code}</p>
                          <p className="text-[10px] uppercase tracking-wide text-slate-400">{stv.type === "warehouse" ? "Warehouse replenishment" : "Inter-branch"}</p>
                        </td>
                        <td className="td text-xs">
                          {stv.sourceName} <ArrowRight className="mx-1 inline h-3 w-3 text-slate-400" /> {stv.destinationName}
                        </td>
                        <td className="td font-semibold">{stv.totalUnits}</td>
                        <td className="td">
                          <StatusPill status={stv.status} />
                        </td>
                        <td className="td text-xs text-slate-500">{formatDate(stv.createdAt)}</td>
                        <td className="td text-right">
                          <Link href={`/stvs/${stv.id}`} className="text-[11px] font-semibold text-teal-700 hover:text-teal-800">
                            Open
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {user.role === "pharmacist" ? (
            <InfoBanner tone="info" title="Manual dispensing only" icon={<ShoppingCart className="h-4 w-4" />}>
              No barcode scanners are used. Open <Link href="/stock-out" className="font-semibold underline">Dispense stock</Link> and search the branch batch list. Red-tier
              batches require explicit confirmation; expired and quarantined batches are disabled.
            </InfoBanner>
          ) : null}
          {user.role === "warehouse_staff" ? (
            <InfoBanner tone="warning" title="Dispatch rules" icon={<PackageX className="h-4 w-4" />}>
              Dispatch deducts from the warehouse immediately but destination stock only increases when the branch manager posts the GRN. Never dispatch expired or
              near-expiry (red) batches — the system blocks them.
            </InfoBanner>
          ) : null}
          {user.role === "branch_manager" ? (
            <InfoBanner tone="success" title="GRN control" icon={<ClipboardCheck className="h-4 w-4" />}>
              In-transit stock is not available for dispensing. Verify deliveries in <Link href="/stvs" className="font-semibold underline">Transfer vouchers</Link>, accept
              quantities and post the GRN to add stock.
            </InfoBanner>
          ) : null}
          {user.role === "central_admin" ? (
            <Card className="card-pad">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-teal-300">
                    <Undo2 className="h-4 w-4" />
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">Automation engine</h3>
                    <p className="text-[11px] text-slate-500">Daily scan at 02:00 PKT: expiry tiers, reorder alerts, auto-quarantine and redistribution suggestions.</p>
                  </div>
                </div>
                <Link href="/expiry-alerts" className="btn-ghost btn-sm">
                  Open alert centre <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
