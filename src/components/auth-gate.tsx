"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@/components/link";
import { Loader2, LogIn, ShieldAlert } from "lucide-react";

import Image from "next/image";

import { AppShell } from "@/components/app-shell";
import { api, readToken, writeToken } from "@/lib/client";
import type { SessionUser } from "@/lib/shared";

/**
 * Guarantees the client always holds a *fresh* token: on mount it re-validates
 * the session against /api/auth/me (cookie or Bearer) and replaces any stale
 * value stored in the browser. Without this, a token left over from an earlier
 * deploy would make every data request fail with 401.
 */
export function AuthGate({ initialUser, children }: { initialUser: SessionUser | null; children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(initialUser);
  // Render immediately when the server already resolved a session: the page
  // content is server-rendered and must not wait for a client round-trip.
  const [state, setState] = useState<"refreshing" | "anonymous" | "ready">(initialUser ? "ready" : "refreshing");

  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      const hadToken = Boolean(readToken());
      try {
        const response = await api<{ user: SessionUser; token?: string }>("/api/auth/me");
        if (cancelled) return;
        if (response.token) writeToken(response.token);
        setUser(response.user);
        setState("ready");
      } catch {
        if (cancelled) return;
        // Keep a server-rendered session alive even if the refresh call failed;
        // the per-request recovery in api() will retry with the cookie.
        if (initialUser) {
          setState("ready");
          return;
        }
        if (hadToken) writeToken(null);
        setState("anonymous");
      }
    }

    void resolve();
    return () => {
      cancelled = true;
    };
  }, [initialUser]);

  if (state === "ready" && user) return <AppShell user={user}>{children}</AppShell>;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <Image src="/images/medicare-logo.svg" alt="MediCare" width={48} height={48} className="mx-auto rounded-xl shadow-lg" />
        <h1 className="mt-3 text-base font-bold text-slate-900">MediCare ERP</h1>

        <p className="mt-2 flex items-center justify-center gap-2 text-xs font-medium text-slate-500">
          {state === "refreshing" ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin text-teal-600" /> Restoring your workspace…
            </>
          ) : (
            <>
              <ShieldAlert className="h-3.5 w-3.5 text-amber-600" /> No active session found in this browser
            </>
          )}
        </p>

        <p className="mt-1 text-[11px] leading-relaxed text-slate-500">Sign in with your staff account to continue.</p>
        <a href="/login" className="btn-primary btn-sm mt-4 w-full">
          <LogIn className="h-3.5 w-3.5" /> Go to sign in
        </a>
      </div>
    </div>
  );
}
