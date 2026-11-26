"use client";

import { Link } from "@/components/link";
import {
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
import { ArrowRight, BarChart3, Flame, Layers, Sparkles, TrendingDown, TrendingUp } from "lucide-react";

import { useSession } from "@/components/app-shell";
import { Card, InfoBanner, PageHeader, StatCard, TableSkeleton } from "@/components/ui";
import { useApi } from "@/lib/client";
import { compact, money, type ExpiryTier } from "@/lib/shared";

type ReportsData = {
  totals: { units: number; value: number; skus: number; batches: number; locations: number };
  expiry: { counts: Record<string, number>; units: Record<string, number> };
  stockByLocation: { name: string; units: number; value: number; batches: number }[];
  stockByCategory: { name: string; units: number }[];
  velocity: { name: string; location: string; dispensed: number; onHand: number; classification: string }[];
  fastMovers: { productName: string; locationName: string; dispensed30: number; onHand: number; ratePerDay: number }[];
  slowMovers: { productName: string; locationName: string; dispensed30: number; onHand: number; ratePerDay: number }[];
  suggestions: { productName: string; from: string; to: string; onHand: number; suggestedQty: number; dispensed30: number }[];
};

const TIER_COLORS: Record<string, string> = { ok: "#10b981", yellow: "#f59e0b", orange: "#f97316", red: "#dc2626", expired: "#991b1b" };

export default function ReportsPage() {
  const user = useSession();
  const { data, loading, error } = useApi<ReportsData>("/api/dashboard");

  const topMovers = (data?.velocity ?? []).slice(0, 10);
  const chartMovers = topMovers.map((item) => ({ name: `${item.name} · ${item.location.split("—")[1]?.trim() ?? item.location}`, dispensed: item.dispensed }));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Supply chain analytics"
        subtitle={`Velocity, distribution and expiry exposure for ${user.role === "central_admin" ? "the entire network" : user.locationName}.`}
        icon={<BarChart3 className="h-5 w-5" />}
      />

      {error ? <InfoBanner tone="danger" title="Unable to load analytics">{error}</InfoBanner> : null}

      {loading || !data ? (
        <Card><TableSkeleton rows={6} /></Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Network stock" value={`${compact(data.totals.units)} units`} hint={`${data.totals.skus} SKUs · ${data.totals.batches} batches`} icon={<Layers className="h-5 w-5" />} tone="teal" />
            <StatCard label="Inventory value" value={money(data.totals.value)} hint={`${data.totals.locations} locations`} icon={<BarChart3 className="h-5 w-5" />} tone="violet" />
            <StatCard label="Fast movers" value={data.fastMovers.length} hint="Dispensed ≥ 60 units / 30 days" icon={<TrendingUp className="h-5 w-5" />} tone="emerald" />
            <StatCard label="Slow / no movement" value={data.slowMovers.length} hint="Redistribution candidates" icon={<TrendingDown className="h-5 w-5" />} tone="orange" />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="card-pad lg:col-span-2">
              <div className="mb-4">
                <h2 className="text-sm font-semibold text-slate-900">Top dispensed products (30 days)</h2>
                <p className="text-[11px] text-slate-500">Derived from manual stock-out records</p>
              </div>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartMovers} layout="vertical" margin={{ top: 4, right: 16, left: 24, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 9, fill: "#475569" }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }} />
                    <Bar dataKey="dispensed" fill="#0d9488" radius={[0, 6, 6, 0]} maxBarSize={16} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="card-pad">
              <div className="mb-2">
                <h2 className="text-sm font-semibold text-slate-900">Expiry exposure</h2>
                <p className="text-[11px] text-slate-500">Batches by tier</p>
              </div>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={(["yellow", "orange", "red", "expired"] as ExpiryTier[]).map((tier) => ({
                        name: tier === "expired" ? "Expired" : `${tier} tier`,
                        value: data.expiry.counts[tier] ?? 0,
                        tier,
                      }))}
                      dataKey="value"
                      innerRadius={40}
                      outerRadius={72}
                      paddingAngle={2}
                    >
                      {(["yellow", "orange", "red", "expired"] as ExpiryTier[]).map((tier) => (
                        <Cell key={tier} fill={TIER_COLORS[tier]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 10 }} iconType="circle" />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-1.5 border-t border-slate-100 pt-3 text-[11px]">
                {(["yellow", "orange", "red", "expired"] as ExpiryTier[]).map((tier) => (
                  <div key={tier} className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 capitalize text-slate-600">
                      <span className="h-2 w-2 rounded-full" style={{ background: TIER_COLORS[tier] }} /> {tier}
                    </span>
                    <span className="font-semibold text-slate-800">
                      {data.expiry.counts[tier] ?? 0} batches · {compact(data.expiry.units[tier] ?? 0)} units
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">Fast movers</h2>
                  <p className="text-[11px] text-slate-500">Protect availability with replenishment</p>
                </div>
                <Flame className="h-4 w-4 text-teal-600" />
              </div>
              <div className="divide-y divide-slate-100">
                {data.fastMovers.map((item, index) => (
                  <div key={index} className="flex items-center justify-between px-5 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-slate-800">{item.productName}</p>
                      <p className="text-[10px] text-slate-500">{item.locationName}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-bold text-teal-700">{item.dispensed30}/30d</p>
                      <p className="text-[10px] text-slate-500">{item.ratePerDay}/day · {item.onHand} on hand</p>
                    </div>
                  </div>
                ))}
                {data.fastMovers.length === 0 ? <p className="px-5 py-6 text-center text-xs text-slate-500">No fast movers yet.</p> : null}
              </div>
            </Card>

            <Card>
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">Slow movers</h2>
                  <p className="text-[11px] text-slate-500">Redistribute before expiry risk grows</p>
                </div>
                <TrendingDown className="h-4 w-4 text-amber-500" />
              </div>
              <div className="divide-y divide-slate-100">
                {data.slowMovers.map((item, index) => (
                  <div key={index} className="flex items-center justify-between px-5 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-slate-800">{item.productName}</p>
                      <p className="text-[10px] text-slate-500">{item.locationName}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-bold text-amber-700">{item.dispensed30}/30d</p>
                      <p className="text-[10px] text-slate-500">{item.onHand} on hand</p>
                    </div>
                  </div>
                ))}
                {data.slowMovers.length === 0 ? <p className="px-5 py-6 text-center text-xs text-slate-500">No slow movers detected.</p> : null}
              </div>
            </Card>
          </div>

          <Card>
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Stock distribution & value</h2>
                <p className="text-[11px] text-slate-500">Units and valuation per location</p>
              </div>
              <Link href="/inventory" className="text-[11px] font-semibold text-teal-700">Inventory →</Link>
            </div>
            <div className="grid gap-3 p-5 sm:grid-cols-3">
              {data.stockByLocation.map((location) => (
                <div key={location.name} className="rounded-xl border border-slate-200 p-3">
                  <p className="truncate text-xs font-semibold text-slate-800">{location.name}</p>
                  <p className="mt-1 text-lg font-bold text-slate-900">{compact(location.units)}</p>
                  <p className="text-[10px] text-slate-500">units · {location.batches} batches</p>
                  <p className="mt-1 text-[11px] font-semibold text-teal-700">{money(location.value)}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <div className="flex items-center gap-1.5 border-b border-slate-100 px-5 py-3.5">
              <Sparkles className="h-4 w-4 text-teal-600" />
              <h2 className="text-sm font-semibold text-slate-900">Redistribution suggestions</h2>
            </div>
            {data.suggestions.length === 0 ? (
              <p className="px-5 py-6 text-center text-xs text-slate-500">No redistribution opportunities detected by the current velocity mix.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {data.suggestions.map((suggestion, index) => (
                  <div key={index} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                    <div>
                      <p className="text-xs font-semibold text-slate-800">{suggestion.productName}</p>
                      <p className="text-[11px] text-slate-500">
                        {suggestion.from} <ArrowRight className="mx-1 inline h-3 w-3" /> {suggestion.to} · source moves {suggestion.dispensed30} units/30d
                      </p>
                    </div>
                    <span className="chip border-amber-200 bg-amber-50 text-amber-800">Move {suggestion.suggestedQty} of {suggestion.onHand} units</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
