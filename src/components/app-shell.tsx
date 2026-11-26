"use client";

import { createContext, startTransition, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "@/components/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import toast from "react-hot-toast";
import {
  Activity,
  ArrowLeftRight,
  BarChart3,
  Bell,
  BellRing,
  ChevronDown,
  ClipboardCheck,
  ClipboardList,
  FileCode,
  FileDown,
  FileText,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  Network,
  Package,
  Pill,
  PanelLeftClose,
  PanelLeftOpen,
  PillBottle,
  RotateCcw,
  Truck,
  Undo2,
  Users,
  X,
} from "lucide-react";

import { apiPost, cn, useApi, writeToken } from "@/lib/client";
import { ThemeSegmented, ThemeToggle } from "@/components/theme";
import { formatDateTime, ROLE_LABELS, TIER_META, type NotificationItem, type Role, type SessionUser } from "@/lib/shared";
import { RolePill } from "@/components/ui";

const SessionContext = createContext<SessionUser | null>(null);

export function useSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error("Session unavailable");
  return session;
}

type NavItem = { href: string; label: string; icon: typeof LayoutDashboard; roles: Role[]; badge?: number };
type NavGroup = { title: string; items: NavItem[] };

function buildNav(user: SessionUser, pending: { indents: number; transfers: number; stvs: number }): NavGroup[] {
  const all: Role[] = ["central_admin", "warehouse_staff", "branch_manager", "pharmacist"];
  return [
    {
      title: "Overview",
      items: [
        { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: all },
        { href: "/reports", label: "Analytics", icon: BarChart3, roles: ["central_admin", "branch_manager"] },
      ],
    },
    {
      title: "Inventory",
      items: [
        { href: "/inventory", label: "Stock on hand", icon: Package, roles: all },
        { href: "/expiry-alerts", label: "Expiry alerts", icon: BellRing, roles: all },
        { href: "/stock-out", label: "Dispense stock", icon: Pill, roles: ["pharmacist", "branch_manager"] },
        { href: "/eod", label: "EOD reconciliation", icon: ClipboardCheck, roles: ["pharmacist", "branch_manager", "central_admin"] },
      ],
    },
    {
      title: "Supply chain",
      items: [
        { href: "/indents", label: "Warehouse indents", icon: FileText, roles: all, badge: pending.indents },
        { href: "/transfers", label: "Inter-branch", icon: ArrowLeftRight, roles: ["central_admin", "branch_manager"], badge: pending.transfers },
        { href: "/stvs", label: "Transfer vouchers", icon: Truck, roles: ["central_admin", "warehouse_staff", "branch_manager"], badge: pending.stvs },
        { href: "/returns", label: "Expired returns", icon: Undo2, roles: ["central_admin", "warehouse_staff", "branch_manager"] },
      ],
    },
    {
      title: "Administration",
      items: [
        { href: "/branches", label: "Branches", icon: Network, roles: ["central_admin"] },
        { href: "/products", label: "Product master", icon: PillBottle, roles: ["central_admin"] },
        { href: "/users", label: "Users & roles", icon: Users, roles: ["central_admin"] },
      ],
    },
    {
      title: "Support",
      items: [
        { href: "/help", label: "Help & guide", icon: HelpCircle, roles: all },
        { href: "/downloads/medicare-erp-source.zip", label: "Download source", icon: FileDown, roles: all },
        { href: "/source", label: "Source viewer", icon: FileCode, roles: all },
      ],
    },
  ];
}

function SidebarContent({
  user,
  collapsed,
  pending,
  onNavigate,
}: {
  user: SessionUser;
  collapsed: boolean;
  pending: { indents: number; transfers: number; stvs: number };
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const nav = buildNav(user, pending);

  return (
    <div className="flex h-full flex-col">
      <div className={cn("relative flex items-center gap-3 px-4 py-5", collapsed && "justify-center px-2")}>
        <div className="pointer-events-none absolute -left-6 -top-6 h-20 w-20 rounded-full bg-teal-500/20 blur-2xl" />
        <Image
          src="/images/medicare-logo.svg"
          alt="MediCare"
          width={40}
          height={40}
          priority
          className="relative h-10 w-10 shrink-0 rounded-xl shadow-lg shadow-teal-900/30"
        />
        {!collapsed ? (
          <div className="min-w-0">
            <p className="truncate text-sm font-bold tracking-tight text-white">MediCare ERP</p>
            <p className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-teal-400">Supply Chain Suite</p>
          </div>
        ) : null}
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-2 pb-4">
        {nav.map((group) => {
          const items = group.items.filter((item) => item.roles.includes(user.role));
          if (items.length === 0) return null;
          return (
            <div key={group.title}>
              {!collapsed ? (
                <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{group.title}</p>
              ) : (
                <div className="mx-2 mb-2 h-px bg-white/10" />
              )}
              <div className="space-y-0.5">
                {items.map((item) => {
                  const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));
                  const linkClass = cn("nav-link", active && "nav-link-active", collapsed && "justify-center px-2");
                  const inner = (
                    <>
                      <span
                        className={cn(
                          "flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition",
                          active ? "bg-gradient-to-br from-teal-400 to-emerald-500 text-slate-900 shadow-sm" : "text-slate-400",
                        )}
                      >
                        <item.icon className="h-3.5 w-3.5" />
                      </span>
                      {!collapsed ? (
                        <>
                          <span className="flex-1 truncate">{item.label}</span>
                          {item.badge && item.badge > 0 ? (
                            <span className="rounded-full bg-teal-500/20 px-1.5 py-0.5 text-[10px] font-bold text-teal-200">{item.badge}</span>
                          ) : null}
                        </>
                      ) : null}
                    </>
                  );

                  // File downloads must not go through the client-side router.
                  if (item.href.startsWith("/downloads/")) {
                    return (
                      <a
                        key={item.href}
                        href={item.href}
                        download="medicare-erp-source.zip"
                        onClick={onNavigate}
                        title={collapsed ? item.label : undefined}
                        className={linkClass}
                      >
                        {inner}
                      </a>
                    );
                  }

                  return (
                    <Link key={item.href} href={item.href} onClick={onNavigate} title={collapsed ? item.label : undefined} className={linkClass}>
                      {inner}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      <div className={cn("border-t border-white/10 p-3", collapsed && "px-2")}>
        <div className={cn("flex items-center gap-2.5 rounded-xl bg-white/5 p-2.5", collapsed && "justify-center")}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-500/20 text-xs font-bold text-teal-200">
            {user.name
              .split(" ")
              .map((part) => part[0])
              .slice(0, 2)
              .join("")}
          </div>
          {!collapsed ? (
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-white">{user.name}</p>
              <p className="truncate text-[10px] text-slate-400">{ROLE_LABELS[user.role]}</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function AppShell({ user, children }: { user: SessionUser; children: ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const alerts = useApi<{ rows: NotificationItem[]; counts: { total: number; red: number; orange: number; yellow: number; expired: number; info: number } }>(
    "/api/alerts?status=open",
  );
  const stvs = useApi<{ rows: { status: string }[] }>(
    user.role === "pharmacist" ? null : "/api/stvs",
  );
  const indents = useApi<{ rows: { status: string }[] }>(user.role === "pharmacist" ? null : "/api/indents");
  const transfers = useApi<{ rows: { status: string }[] }>(
    user.role === "central_admin" || user.role === "branch_manager" ? "/api/transfers" : null,
  );

  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem("pf_sidebar_collapsed") : null;
    if (saved === "1") startTransition(() => setCollapsed(true));
  }, []);

  useEffect(() => {
    startTransition(() => {
      setMobileOpen(false);
      setNotifOpen(false);
      setProfileOpen(false);
    });
  }, [pathname]);

  const refreshAlerts = alerts.refresh;
  useEffect(() => {
    const timer = setInterval(refreshAlerts, 45_000);
    return () => clearInterval(timer);
  }, [refreshAlerts]);

  const pending = useMemo(
    () => ({
      indents: (indents.data?.rows ?? []).filter((row) => row.status === "pending").length,
      transfers: (transfers.data?.rows ?? []).filter((row) => row.status === "pending").length,
      stvs: (stvs.data?.rows ?? []).filter((row) => ["Created", "Picking", "Packed & Verified"].includes(row.status)).length,
    }),
    [indents.data, transfers.data, stvs.data],
  );

  function toggleCollapsed() {
    setCollapsed((value) => {
      const next = !value;
      window.localStorage.setItem("pf_sidebar_collapsed", next ? "1" : "0");
      return next;
    });
  }

  async function logout() {
    try {
      await apiPost("/api/auth/logout", {});
    } catch {
      // ignore network errors — still clear the local session
    }
    writeToken(null);
    toast.success("Signed out");
    window.location.replace("/login");
  }

  const unread = alerts.data?.counts.total ?? 0;
  const nameInitials = user.name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("");

  return (
    <SessionContext.Provider value={user}>
      <div className="min-h-screen bg-slate-50">
        {/* Desktop sidebar */}
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-40 hidden border-r border-slate-800 bg-slate-900 transition-all duration-200 lg:block",
            collapsed ? "w-[76px]" : "w-64",
          )}
        >
          <SidebarContent user={user} collapsed={collapsed} pending={pending} />
        </aside>

        {/* Mobile drawer */}
        {mobileOpen ? (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
            <aside className="absolute inset-y-0 left-0 w-72 bg-slate-900 shadow-2xl">
              <button
                onClick={() => setMobileOpen(false)}
                className="absolute right-3 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
                aria-label="Close menu"
              >
                <X className="h-4 w-4" />
              </button>
              <SidebarContent user={user} collapsed={false} pending={pending} onNavigate={() => setMobileOpen(false)} />
            </aside>
          </div>
        ) : null}

        <div className={cn("flex min-h-screen flex-col transition-all duration-200", collapsed ? "lg:pl-[76px]" : "lg:pl-64")}>
          {/* Top navbar */}
          <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
            <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6">
              <div className="flex min-w-0 items-center gap-2">
                <button
                  onClick={() => setMobileOpen(true)}
                  className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 lg:hidden"
                  aria-label="Open menu"
                >
                  <Menu className="h-5 w-5" />
                </button>
                <button
                  onClick={toggleCollapsed}
                  className="hidden rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 lg:inline-flex"
                  aria-label="Toggle sidebar"
                >
                  {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
                </button>
                <div className="hidden items-center gap-1.5 rounded-lg border border-teal-200 bg-gradient-to-r from-teal-50 to-emerald-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 sm:flex">
                  <MapPin className="h-3.5 w-3.5 text-teal-600" />
                  <span className="max-w-[180px] truncate">{user.locationName}</span>
                  <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500 ring-1 ring-slate-200">
                    {user.locationType === "warehouse" ? "WH" : user.locationType === "branch" ? "Branch" : "HQ"}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="hidden sm:block">
                  <RolePill role={user.role} />
                </div>

                <ThemeToggle className="hidden sm:inline-flex" />

                {/* Notification bell */}
                <div className="relative">
                  <button
                    onClick={() => {
                      setNotifOpen((value) => !value);
                      setProfileOpen(false);
                    }}
                    className="relative rounded-lg border border-slate-200 bg-white p-2 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
                    aria-label="Alerts"
                  >
                    <Bell className="h-4 w-4" />
                    {unread > 0 ? (
                      <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-gradient-to-br from-rose-500 to-red-600 px-1 text-[9px] font-bold text-white shadow-sm">
                        {unread > 99 ? "99+" : unread}
                      </span>
                    ) : null}
                  </button>
                  {notifOpen ? (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setNotifOpen(false)} />
                      <div className="absolute right-0 z-20 mt-2 w-[min(92vw,380px)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
                        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">Live alerts</p>
                            <p className="text-[11px] text-slate-500">{unread} open across expiry, reorder & slow-moving</p>
                          </div>
                          <button
                            onClick={async () => {
                              await apiPost("/api/alerts", { all: true });
                              toast.success("All alerts acknowledged");
                              alerts.refresh();
                            }}
                            className="text-[11px] font-semibold text-teal-700 hover:text-teal-800"
                          >
                            Mark all read
                          </button>
                        </div>
                        <div className="max-h-80 divide-y divide-slate-100 overflow-y-auto">
                          {(alerts.data?.rows ?? []).slice(0, 8).map((alert) => (
                            <Link
                              key={alert.id}
                              href={`/expiry-alerts?tier=${alert.severity}`}
                              onClick={() => setNotifOpen(false)}
                              className="flex gap-2.5 px-4 py-3 transition hover:bg-slate-50"
                            >
                              <span
                                className={cn(
                                  "mt-1 h-2 w-2 shrink-0 rounded-full",
                                  TIER_META[(alert.severity as keyof typeof TIER_META) ?? "ok"]?.dot ?? "bg-slate-400",
                                )}
                              />
                              <div className="min-w-0">
                                <p className="truncate text-xs font-semibold text-slate-800">{alert.title}</p>
                                <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-slate-500">{alert.message}</p>
                                <p className="mt-1 text-[10px] text-slate-400">{formatDateTime(alert.createdAt)}</p>
                              </div>
                            </Link>
                          ))}
                          {(alerts.data?.rows ?? []).length === 0 ? (
                            <p className="px-4 py-8 text-center text-xs text-slate-500">No open alerts. Everything is healthy.</p>
                          ) : null}
                        </div>
                        <Link
                          href="/expiry-alerts"
                          onClick={() => setNotifOpen(false)}
                          className="block border-t border-slate-100 bg-slate-50 px-4 py-2.5 text-center text-[11px] font-semibold text-teal-700 hover:bg-slate-100"
                        >
                          View all alerts
                        </Link>
                      </div>
                    </>
                  ) : null}
                </div>

                {/* Profile */}
                <div className="relative">
                  <button
                    onClick={() => {
                      setProfileOpen((value) => !value);
                      setNotifOpen(false);
                    }}
                    className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white py-1.5 pl-1.5 pr-2 transition hover:bg-slate-50"
                  >
                    <span className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-teal-500 to-emerald-600 text-[10px] font-bold text-white shadow-sm">{nameInitials}</span>
                    <span className="hidden max-w-[120px] truncate text-xs font-semibold text-slate-800 sm:block">{user.name}</span>
                    <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                  </button>
                  {profileOpen ? (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setProfileOpen(false)} />
                      <div className="absolute right-0 z-20 mt-2 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
                        <div className="border-b border-slate-100 px-4 py-3">
                          <p className="text-sm font-semibold text-slate-900">{user.name}</p>
                          <p className="truncate text-[11px] text-slate-500">{user.email}</p>
                          <div className="mt-2 flex items-center gap-1.5">
                            <RolePill role={user.role} />
                            <span className="chip border-slate-200 bg-slate-50 text-slate-600">{user.locationName}</span>
                          </div>
                        </div>
                        <div className="border-y border-slate-100 px-4 py-3 dark:border-slate-800">
                          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Appearance</p>
                          <ThemeSegmented />
                        </div>
                        <div className="p-1.5">
                          <Link
                            href="/inventory"
                            onClick={() => setProfileOpen(false)}
                            className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            <ClipboardList className="h-4 w-4 text-slate-400" /> My stock on hand
                          </Link>
                          <Link
                            href="/stvs"
                            onClick={() => setProfileOpen(false)}
                            className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            <Truck className="h-4 w-4 text-slate-400" /> Transfer vouchers
                          </Link>
                          <Link
                            href="/returns"
                            onClick={() => setProfileOpen(false)}
                            className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            <RotateCcw className="h-4 w-4 text-slate-400" /> Expired returns
                          </Link>
                          <Link
                            href="/help"
                            onClick={() => setProfileOpen(false)}
                            className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            <HelpCircle className="h-4 w-4 text-slate-400" /> Help &amp; feature guide
                          </Link>
                          {user.role === "central_admin" ? (
                            <Link
                              href="/branches"
                              onClick={() => setProfileOpen(false)}
                              className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                            >
                              <Network className="h-4 w-4 text-slate-400" /> Branches &amp; network
                            </Link>
                          ) : null}
                          <button
                            onClick={logout}
                            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"
                          >
                            <LogOut className="h-4 w-4" /> Sign out
                          </button>
                        </div>
                      </div>
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          </header>

          <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-[1400px]">{children}</div>
          </main>

          <footer className="border-t border-slate-200 bg-white px-4 py-3 text-[11px] text-slate-400 sm:px-6">
            <div className="mx-auto flex max-w-[1400px] flex-col items-center justify-between gap-1 sm:flex-row">
              <span>MediCare ERP · Internal supply chain operations</span>
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Automation engine active · daily 02:00 PKT
              </span>
            </div>
          </footer>
        </div>
      </div>
    </SessionContext.Provider>
  );
}
