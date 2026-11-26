"use client";

import { useState } from "react";
import { Link } from "@/components/link";
import {
  Activity,
  ArrowLeftRight,
  ArrowRight,
  BellRing,
  Boxes,
  Building2,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  FileText,
  HelpCircle,
  KeyRound,
  Layers,
  Lock,
  Package,
  Pill,
  ScrollText,
  Download,
  Search,
  ShieldCheck,
  Sparkles,
  Truck,
  Undo2,
  Users,
  Warehouse,
} from "lucide-react";

import { useSession } from "@/components/app-shell";
import { DownloadButton } from "@/components/download-button";
import { Card, InfoBanner, PageHeader, RolePill } from "@/components/ui";
import { ROLE_LABELS, STV_STATES, type Role } from "@/lib/shared";

type Section = {
  id: string;
  title: string;
  icon: typeof Package;
  gradient: string;
  summary: string;
  points: string[];
  roles?: Role[];
};

const ROLE_ACCESS: { role: Role; lands: string; scope: string; can: string[] }[] = [
  {
    role: "central_admin",
    lands: "/dashboard",
    scope: "Entire network — warehouse + all branches",
    can: ["Approve indents & inter-branch transfers", "Branches, products, users & roles", "Global stock, expiry & analytics", "Run the automation engine"],
  },
  {
    role: "warehouse_staff",
    lands: "/stvs",
    scope: "Central warehouse only",
    can: ["Receive stock with batch & expiry", "Generate FEFO pick lists", "Pack, verify & dispatch STVs", "Process expired returns / disposal"],
  },
  {
    role: "branch_manager",
    lands: "/dashboard",
    scope: "Own branch only",
    can: ["Raise indents & inter-branch offers", "Verify deliveries & post GRNs", "Reconcile EOD stock sheets", "Initiate expired-stock returns"],
  },
  {
    role: "pharmacist",
    lands: "/stock-out",
    scope: "Own branch only",
    can: ["View branch stock with expiry badges", "Raise emergency indents", "Record manual dispensations", "—"],
  },
];

const SECTIONS: Section[] = [
  {
    id: "auth",
    title: "Authentication & sign-in",
    icon: KeyRound,
    gradient: "from-slate-600 to-slate-900",
    summary: "JWT session with role-based routing. Every account lands in the workspace built for its role.",
    points: [
      "Passwords are hashed with bcrypt; the session is a signed JWT in an httpOnly cookie, with a Bearer fallback for locked-down browsers.",
      "After signing in you are redirected by role: Central Admin & Branch Manager → Dashboard, Warehouse Staff → Transfer vouchers, Pharmacist → Dispense stock.",
      "Branch-scoped roles only ever see their own location — enforced in the API, not just hidden in the UI.",
      "A branch role without an assigned location lands on the dashboard and is flagged in Users & roles.",
    ],
    roles: ["central_admin", "warehouse_staff", "branch_manager", "pharmacist"],
  },
  {
    id: "dashboard",
    title: "Role dashboards & analytics",
    icon: Activity,
    gradient: "from-teal-500 to-emerald-400",
    summary: "One-glance view of stock, value, velocity and expiry exposure.",
    points: [
      "KPI cards: stock on hand, inventory value in LKR, units dispensed today and the pending action queue.",
      "Colourful expiry strip counts batches in the 6-month, 3-month, 1-month and expired tiers.",
      "Charts: stock by location, fast vs slow-moving donut, and a 14-day dispensing trend (Recharts).",
      "Stock transfer pipeline, expiry watchlist, reorder risks, redistribution suggestions and audit activity.",
      "Server-rendered: the numbers are present on the very first paint, then refresh on demand.",
    ],
  },
  {
    id: "inventory",
    title: "Stock on hand (batch level)",
    icon: Boxes,
    gradient: "from-sky-500 to-cyan-400",
    summary: "Every medicine is tracked per batch: batch number, expiry, UOM, quantity and value.",
    points: [
      "Search by medicine, generic, SKU or batch number; filter by expiry tier and (as admin) by location.",
      "Colour-coded expiry badges plus the lock state — Transfer Locked, or Expired – Locked.",
      "Download the current view as CSV; paginate 10/20/50 rows at a time.",
      "Warehouse Staff & Central Admin can receive new stock here with a mandatory batch number and expiry date (past expiry is rejected).",
    ],
  },
  {
    id: "indents",
    title: "Warehouse indents (replenishment)",
    icon: FileText,
    gradient: "from-indigo-500 to-violet-500",
    summary: "Branch asks, head office approves, warehouse picks.",
    points: [
      "Branch Manager raises an indent line by line; a Pharmacist's indent is automatically flagged Emergency.",
      "Central Admin reviews warehouse availability and approves (with per-line approved quantities) or rejects with a required reason.",
      "Approved indents appear in the warehouse queue for pick-list generation; the indent closes as Fulfilled once the GRN is posted.",
    ],
  },
  {
    id: "fefo",
    title: "FEFO pick lists",
    icon: Layers,
    gradient: "from-emerald-500 to-lime-500",
    summary: "First Expiry, First Out — the earliest expiring batch always leaves first.",
    points: [
      "The system allocates batches automatically in ascending expiry order, spanning multiple batches when needed.",
      "Near-expiry red batches (< 30 days) and expired batches are excluded from allocation by the backend.",
      "Batch number, expiry, UOM and quantity travel with the voucher for full traceability.",
    ],
  },
  {
    id: "stv",
    title: "STV state machine & GRN",
    icon: Truck,
    gradient: "from-sky-500 to-blue-600",
    summary: "The most important stock rule: destination stock only increases when the GRN is posted.",
    points: [
      `States: ${STV_STATES.join(" → ")} (plus Delivery Exception, Rejected / Quarantined and Cancelled before dispatch).`,
      "Dispatch deducts the source location immediately, but the destination stays unchanged while the voucher is In-Transit.",
      "The receiving Branch Manager verifies quantities and posts the GRN — only accepted quantities are added; shortfalls return to the source as quarantined.",
      "Every transition writes an audit event with user, timestamp, previous state, new state and comment. Dispatched vouchers can never be deleted or silently edited.",
      "Discrepancies are recorded as a Delivery Exception with a mandatory reason, then resolved or rejected.",
    ],
  },
  {
    id: "transfers",
    title: "Inter-branch stock sharing",
    icon: ArrowLeftRight,
    gradient: "from-amber-400 to-orange-500",
    summary: "Move slow-moving stock to a branch where the same medicine is fast-moving.",
    points: [
      "Velocity is calculated from stock-out records over 30 days and classified Fast / Moving / Slow / No movement.",
      "Branch Managers can offer their slow-moving stock or request surplus from another branch.",
      "Central Admin approval automatically creates the source STV with FEFO allocation; the request closes after the destination posts its GRN.",
      "The dashboard surfaces concrete redistribution suggestions with a suggested quantity.",
    ],
  },
  {
    id: "expiry",
    title: "3-tier expiry alerts & smart locking",
    icon: BellRing,
    gradient: "from-rose-500 to-red-600",
    summary: "Colour-coded monitoring with locks enforced in the API.",
    points: [
      "Yellow (< 180 days) — early warning, ideal for redistribution of slow-moving stock.",
      "Orange (< 90 days) — prioritise dispensing via FEFO.",
      "Red (< 30 days) — warehouse dispatch and inter-branch transfers are locked; local dispensing is allowed only after an explicit confirmation warning.",
      "Expired — fully locked and auto-quarantined; it can only leave through the expired return / disposal workflow.",
      "The alert centre filters by tier, shows counts, and lets you acknowledge alerts individually or all at once.",
    ],
  },
  {
    id: "stockout",
    title: "Manual dispensing (no barcode scanners)",
    icon: Pill,
    gradient: "from-teal-500 to-emerald-500",
    summary: "Pharmacists record dispensations by searching the batch list manually.",
    points: [
      "Select a medicine and batch from a searchable list ordered by earliest expiry.",
      "Expired and quarantined batches are disabled and cannot be selected.",
      "Dispensing a red-tier batch requires confirming a prominent warning modal.",
      "Quantities are deducted atomically, with an optional reference and note; the record feeds velocity, reorder alerts and the EOD sheet.",
    ],
    roles: ["pharmacist", "branch_manager", "central_admin"],
  },
  {
    id: "eod",
    title: "End-of-day reconciliation",
    icon: ClipboardCheck,
    gradient: "from-violet-500 to-fuchsia-500",
    summary: "Match the day's dispensing against the physical shelf count.",
    points: [
      "Pick a date to see total units, record count and per-medicine quantities with the batches used.",
      "Pharmacists can open the sheet, see their own dispensing total and save a draft; reconciling and locking is reserved for a Branch Manager or Central Admin.",
      "A per-pharmacist breakdown shows who recorded which quantities on the selected date.",
      "Reconciled sheets are retained for audit and can be exported as CSV.",
    ],
    roles: ["pharmacist", "branch_manager", "central_admin"],
  },
  {
    id: "returns",
    title: "Expired returns & disposal",
    icon: Undo2,
    gradient: "from-slate-600 to-slate-800",
    summary: "Expired stock leaves the ledger only after a verified disposal.",
    points: [
      "Branch Manager raises a return for expired or quarantined batches; quantities are validated against the batch.",
      "Stock stays quarantined for the entire workflow and cannot be dispensed or transferred.",
      "Warehouse Staff receive the return and then post the disposal, which clears the quantity and keeps the audit trail.",
    ],
  },
  {
    id: "branches",
    title: "Branches & network",
    icon: Building2,
    gradient: "from-teal-500 to-emerald-500",
    summary: "Administrators grow the pharmacy network; each branch gets its own login.",
    points: [
      "Only the Central Admin can add or edit branches. Codes are unique and the network supports a single central warehouse.",
      "Each location card shows units, SKUs, staff and expiry alerts, with a Staff button to create its logins.",
      "A branch holding stock or users cannot be deleted, protecting historical records.",
      "After creating a branch, the create-login modal opens so you can add its Branch Manager and Pharmacist immediately.",
    ],
    roles: ["central_admin"],
  },
  {
    id: "users",
    title: "Users, roles & passwords",
    icon: Users,
    gradient: "from-indigo-500 to-blue-600",
    summary: "Control who can do what, and where.",
    points: [
      "Create accounts with a name, email, temporary password, role and location.",
      "Manage lets you change the role or location, reset a password, or disable an account.",
      "The pharmacist role cannot reach admin APIs; the API returns 403 regardless of the UI.",
      "Accounts without a location are highlighted so branch roles are never left unusable.",
    ],
    roles: ["central_admin"],
  },
  {
    id: "automation",
    title: "Automation & alerts",
    icon: Sparkles,
    gradient: "from-amber-400 to-yellow-500",
    summary: "Scheduled jobs keep alerts and locks accurate without manual checks.",
    points: [
      "Daily at 02:00 (PKT): expiry tiers, reorder points, auto-quarantine of expired batches and slow-moving redistribution suggestions.",
      "Hourly sweep re-quarantines batches that just expired, keeping hard locks accurate.",
      "Central Admins can trigger the same scan on demand from the expiry alert centre.",
    ],
  },
  {
    id: "audit",
    title: "Audit trail",
    icon: ScrollText,
    gradient: "from-slate-600 to-slate-900",
    summary: "Everything is traceable, forever.",
    points: [
      "Every stock movement and state change records the user, timestamp, previous state, new state and reason.",
      "The STV detail page shows a visual timeline; the dashboard shows a live activity feed.",
      "Dispensing records and dispatched vouchers are immutable — corrections are new, auditable entries.",
    ],
  },
];

const WORKFLOW: { title: string; summary: string; steps: { label: string; owner: string; href: string }[] }[] = [
  {
    title: "Warehouse replenishment",
    summary: "Branch request to verified receipt",
    steps: [
      { label: "Create an indent", owner: "Branch Manager / Pharmacist", href: "/indents" },
      { label: "Review quantities", owner: "Central Admin", href: "/indents" },
      { label: "Build the FEFO pick", owner: "Warehouse Staff", href: "/stvs" },
      { label: "Pack and dispatch", owner: "Warehouse Staff", href: "/stvs" },
      { label: "Verify delivery and post GRN", owner: "Branch Manager", href: "/stvs" },
    ],
  },
  {
    title: "Inter-branch sharing",
    summary: "Surplus moves to where it is needed",
    steps: [
      { label: "Offer or request stock", owner: "Branch Manager", href: "/transfers" },
      { label: "Approve the transfer", owner: "Central Admin", href: "/transfers" },
      { label: "Dispatch the generated STV", owner: "Source location", href: "/stvs" },
      { label: "Verify quantities and post GRN", owner: "Destination Branch Manager", href: "/stvs" },
      { label: "Confirm the request is complete", owner: "Branch Manager", href: "/transfers" },
    ],
  },
  {
    title: "Dispensing and close-out",
    summary: "Record every batch and reconcile daily",
    steps: [
      { label: "Find the medicine and batch", owner: "Pharmacist", href: "/stock-out" },
      { label: "Review expiry and confirm if prompted", owner: "Pharmacist", href: "/stock-out" },
      { label: "Record the dispensed quantity", owner: "Pharmacist", href: "/stock-out" },
      { label: "Review updated stock and velocity", owner: "Branch Manager", href: "/dashboard" },
      { label: "Reconcile and lock the day", owner: "Branch Manager", href: "/eod" },
    ],
  },
  {
    title: "Expired stock return",
    summary: "Quarantine stays in place through disposal",
    steps: [
      { label: "Review expiry alerts", owner: "Branch Manager", href: "/expiry-alerts" },
      { label: "Raise a return for expired stock", owner: "Branch Manager", href: "/returns" },
      { label: "Receive the quarantined return", owner: "Warehouse Staff", href: "/returns" },
      { label: "Post the verified disposal", owner: "Warehouse Staff", href: "/returns" },
      { label: "Confirm the stock ledger is updated", owner: "Warehouse Staff", href: "/inventory" },
    ],
  },
];

export default function HelpPage() {
  const user = useSession();
  const [query, setQuery] = useState("");
  const [activeRole, setActiveRole] = useState<Role | "all">(user.role);

  const term = query.trim().toLowerCase();
  const sections = SECTIONS.filter((section) => {
    const matchesRole = activeRole === "all" || !section.roles || section.roles.includes(activeRole);
    const matchesTerm =
      !term ||
      section.title.toLowerCase().includes(term) ||
      section.summary.toLowerCase().includes(term) ||
      section.points.some((point) => point.toLowerCase().includes(term));
    return matchesRole && matchesTerm;
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Help & feature guide"
        subtitle="What every module does, which role owns it, and how stock actually moves through the system."
        icon={<HelpCircle className="h-5 w-5" />}
        actions={
          <a href="/dashboard" className="btn btn-ghost btn-sm">
            <ArrowRight className="h-3.5 w-3.5" /> Back to dashboard
          </a>
        }
      />

      {/* Role-based landing summary */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {ROLE_ACCESS.map((item) => {
          const isMine = item.role === user.role;
          return (
            <button
              key={item.role}
              onClick={() => setActiveRole(item.role)}
              className={`relative overflow-hidden rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md ${
                isMine ? "border-teal-300 bg-gradient-to-br from-teal-50 via-white to-emerald-50" : "border-slate-200 bg-white"
              }`}
            >
              {isMine ? <span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-teal-500 to-emerald-400" /> : null}
              <div className="flex items-center justify-between">
                <RolePill role={item.role} />
                {isMine ? <span className="chip border-teal-200 bg-teal-50 text-[10px] text-teal-700">You</span> : null}
              </div>
              <p className="mt-2 text-[11px] text-slate-500">Lands on <span className="font-mono text-slate-700">{item.lands}</span></p>
              <p className="mt-1 text-[11px] font-medium text-slate-700">{item.scope}</p>
              <ul className="mt-2 space-y-0.5">
                {item.can.filter((line) => line !== "—").map((line) => (
                  <li key={line} className="flex items-start gap-1 text-[10px] leading-relaxed text-slate-500">
                    <ChevronRight className="mt-0.5 h-2.5 w-2.5 shrink-0 text-teal-500" />
                    {line}
                  </li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search features, rules or workflows…"
            className="input pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setActiveRole("all")}
            className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition ${
              activeRole === "all" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
            }`}
          >
            All modules
          </button>
          {(Object.keys(ROLE_LABELS) as Role[]).map((role) => (
            <button
              key={role}
              onClick={() => setActiveRole(role)}
              className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition ${
                activeRole === role ? "border-teal-300 bg-teal-500 text-white" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
              }`}
            >
              {ROLE_LABELS[role]}
            </button>
          ))}
        </div>
      </div>

      <InfoBanner tone="info" title="Stock movement rule of thumb" icon={<ShieldCheck className="h-4 w-4" />}>
        Source stock leaves on <strong>dispatch</strong>; destination stock arrives only when the <strong>GRN is posted</strong> with accepted quantities. Near-expiry (red) batches
        never move between locations, and expired batches are locked to the return workflow.
      </InfoBanner>

      {/* Sections */}
      <div className="grid gap-4 lg:grid-cols-2">
        {sections.map((section) => (
          <Card key={section.id} className="overflow-hidden">
            <div className="flex items-start gap-3 border-b border-slate-100 bg-gradient-to-r from-slate-50 via-white to-white px-5 py-3.5 dark:from-slate-800/40 dark:via-transparent dark:to-transparent">
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm ${section.gradient}`}>
                <section.icon className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-slate-900">{section.title}</h2>
                <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{section.summary}</p>
              </div>
            </div>
            <ul className="space-y-1.5 px-5 py-4">
              {section.points.map((point) => (
                <li key={point} className="flex items-start gap-1.5 text-[11px] leading-relaxed text-slate-600">
                  <ChevronRight className="mt-0.5 h-3 w-3 shrink-0 text-teal-500" />
                  {point}
                </li>
              ))}
            </ul>
            {section.roles ? (
              <div className="flex flex-wrap gap-1 border-t border-slate-100 px-5 py-2.5 dark:border-slate-800">
                {section.roles.map((role) => (
                  <RolePill key={role} role={role} />
                ))}
              </div>
            ) : null}
          </Card>
        ))}
      </div>

      {sections.length === 0 ? (
        <Card className="card-pad text-center">
          <p className="text-sm font-semibold text-slate-800">No module matches “{query}”</p>
          <p className="mt-1 text-xs text-slate-500">Try a different keyword such as expiry, GRN, FEFO or dispensing.</p>
        </Card>
      ) : null}

      {/* Workflows */}
      <Card className="card-pad">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-teal-500 to-emerald-400 text-white">
            <ClipboardList className="h-3.5 w-3.5" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">End-to-end workflows</h2>
            <p className="text-[11px] text-slate-500">Follow each hand-off in order; select a step to open its workspace.</p>
          </div>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {WORKFLOW.map((flow) => (
            <div key={flow.title} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-700">{flow.title}</p>
              <p className="mt-0.5 text-[10px] leading-relaxed text-slate-500">{flow.summary}</p>
              <ol className="mt-3 space-y-2.5">
                {flow.steps.map((step, index) => (
                  <li key={step.label} className="flex items-start gap-2">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-600 text-[9px] font-bold text-white">{index + 1}</span>
                    <Link
                      href={step.href}
                      className="min-w-0 flex-1 rounded-md text-[11px] leading-relaxed transition hover:text-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40"
                      aria-label={`${step.label}; ${step.owner}; open workspace`}
                    >
                      <span className="block font-medium text-slate-700">{step.label}</span>
                      <span className="block text-[10px] text-slate-500">{step.owner}</span>
                    </Link>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </Card>

      {/* Quick reference */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="card-pad">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-rose-500 to-red-600 text-white">
              <Lock className="h-3.5 w-3.5" />
            </span>
            <h2 className="text-sm font-semibold text-slate-900">Lock quick reference</h2>
          </div>
          <ul className="mt-3 space-y-2 text-[11px]">
            {[
              { label: "Yellow · < 180 days", note: "Free to move — redistribute slow movers", cls: "border-amber-200 bg-amber-50 text-amber-800" },
              { label: "Orange · < 90 days", note: "Free to move — dispense first (FEFO)", cls: "border-orange-200 bg-orange-50 text-orange-800" },
              { label: "Red · < 30 days", note: "Transfers & dispatch locked; local dispense requires confirmation", cls: "border-red-200 bg-red-50 text-red-800" },
              { label: "Expired", note: "Everything locked — return & disposal only", cls: "border-red-300 bg-red-100 text-red-900" },
            ].map((tier) => (
              <li key={tier.label} className={`rounded-lg border px-2.5 py-2 ${tier.cls}`}>
                <p className="font-semibold">{tier.label}</p>
                <p className="mt-0.5 text-[10px] leading-relaxed opacity-90">{tier.note}</p>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="card-pad">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-cyan-400 text-white">
              <Warehouse className="h-3.5 w-3.5" />
            </span>
            <h2 className="text-sm font-semibold text-slate-900">Getting started</h2>
          </div>
          <ol className="mt-3 space-y-2 text-[11px] text-slate-600">
            {[
              "Sign in as the administrator and review stock on hand.",
              "Add a branch (Branches → Add branch) and immediately create its logins.",
              "Approve a pending indent, then generate the pick list as warehouse staff.",
              "Dispatch the voucher, switch to the branch, verify and post the GRN.",
              "Dispense a medicine as the pharmacist and reconcile the EOD sheet.",
            ].map((step, index) => (
              <li key={step} className="flex items-start gap-1.5">
                <span className="mt-[1px] flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[9px] font-bold text-white">{index + 1}</span>
                {step}
              </li>
            ))}
          </ol>
        </Card>

        <Card className="card-pad">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-teal-500 to-emerald-400 text-white">
              <Download className="h-3.5 w-3.5" />
            </span>
            <h2 className="text-sm font-semibold text-slate-900">Source code</h2>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-slate-600">
            Download the complete project source (Next.js app, API routes, Drizzle schema, seed data and setup instructions).
          </p>
          <DownloadButton href="/downloads/medicare-erp-source.zip" filename="medicare-erp-source.zip" />
          <p className="mt-2 text-[10px] text-slate-400">Archive excludes node_modules and build output. Run <span className="font-mono">npm install</span> after unzipping.</p>
        </Card>

        <Card className="card-pad">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white">
              <KeyRound className="h-3.5 w-3.5" />
            </span>
            <h2 className="text-sm font-semibold text-slate-900">Accounts</h2>
          </div>
          <div className="mt-3 space-y-2 text-[11px] text-slate-600">
            <p className="rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-2 text-teal-900">
              <span className="font-semibold">Nelka Shehan</span> · Central Admin
              <br />
              <span className="font-mono text-[10px]">nelkasehan@gmail.com</span>
            </p>
            <p>
              Every other account is created by the administrator in <strong>Users &amp; roles</strong> or from <strong>Branches → Staff</strong>. Passwords can be reset from
              the same screen.
            </p>
            <p className="flex items-start gap-1.5 rounded-lg bg-slate-50 px-2.5 py-2 text-[10px] text-slate-500 dark:bg-slate-800/60">
              <Users className="mt-0.5 h-3 w-3 shrink-0" /> Branch roles must have a location, otherwise they cannot dispense or raise indents.
            </p>
          </div>
        </Card>
      </div>

      <p className="pb-2 text-center text-[10px] text-slate-400">
        MediCare ERP · internal supply chain documentation · signed in as {user.name} ({ROLE_LABELS[user.role]})
      </p>
    </div>
  );
}
