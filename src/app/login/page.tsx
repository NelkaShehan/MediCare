"use client";

import { startTransition, useEffect, useState } from "react";
import Image from "next/image";
import { ArrowRight, CheckCircle2, Eye, EyeOff, Loader2, Lock, Mail } from "lucide-react";

import { ThemeToggle } from "@/components/theme";

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const message = new URLSearchParams(window.location.search).get("error");
    if (message) startTransition(() => setError(message));
  }, []);

  return (
    <div className="relative grid min-h-screen bg-slate-50 lg:grid-cols-2">
      <div className="absolute right-4 top-4 z-20">
        <ThemeToggle />
      </div>
      {/* Left: image panel */}
      <div className="relative hidden overflow-hidden lg:block">
        <Image
          src="/images/pharmacy-workflow.svg"
          alt="Pharmacist organising medication shelves in a pharmacy"
          fill
          priority
          sizes="(min-width: 1024px) 50vw, 100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-900/80 via-slate-900/55 to-slate-900/85" />
        <div className="absolute inset-0 bg-gradient-to-tr from-teal-900/40 via-transparent to-emerald-900/30" />

        <div className="relative z-10 flex h-full flex-col justify-between p-10 xl:p-12">
          <div className="flex items-center gap-2.5">
            <Image
              src="/images/medicare-logo.svg"
              alt="MediCare"
              width={36}
              height={36}
              priority
              className="h-9 w-9 rounded-lg shadow-md shadow-teal-900/40"
            />
            <div className="leading-tight">
              <p className="text-sm font-bold tracking-tight text-white">MediCare ERP</p>
              <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-teal-300">Supply Chain Suite</p>
            </div>
          </div>

          <div className="max-w-md">
            <h2 className="text-3xl font-bold leading-tight tracking-tight text-white">
              Every batch, branch and transfer in one place.
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">
              Central warehouse replenishment, FEFO pick lists and three-tier expiry control — fully audited.
            </p>
            <div className="mt-7 space-y-2">
              {["Batch-level traceability", "FEFO-driven picking", "Automatic expiry quarantining"].map((item) => (
                <div key={item} className="flex items-center gap-2 text-[13px] text-slate-200">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-teal-400" />
                  {item}
                </div>
              ))}
            </div>
          </div>

          <p className="text-[11px] text-slate-400">© {new Date().getFullYear()} MediCare Pharmacy Network</p>
        </div>
      </div>

      {/* Right: sign-in card */}
      <div className="relative flex items-center justify-center overflow-hidden bg-slate-50 px-5 py-10">
        <div className="pointer-events-none absolute inset-0 grid-pattern opacity-40" />
        <div className="pointer-events-none absolute -right-20 top-0 h-64 w-64 rounded-full bg-teal-200/40 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-10 h-64 w-64 rounded-full bg-emerald-200/40 blur-3xl" />

        <div className="relative w-full max-w-[380px]">
          {/* brand (mobile only) */}
          <div className="mb-6 flex items-center justify-center gap-2.5 lg:hidden">
            <Image src="/images/medicare-logo.svg" alt="MediCare" width={36} height={36} className="h-9 w-9 rounded-lg shadow-sm" />
            <div className="leading-tight">
              <p className="text-sm font-bold tracking-tight text-slate-900">MediCare ERP</p>
              <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-teal-600">Supply Chain</p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
            <h1 className="text-lg font-semibold tracking-tight text-slate-900">Sign in</h1>
            <p className="mt-0.5 text-xs text-slate-500">Internal supply chain workspace</p>

            {error ? <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-medium text-red-700">{error}</p> : null}

            <form action="/api/auth/login" method="post" onSubmit={() => setSubmitting(true)} className="mt-5 space-y-3.5">
              <div>
                <label className="label" htmlFor="email">
                  Email
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id="email"
                    name="email"
                    type="email"
                    required
                    placeholder="you@medicare.lk"
                    className="input pl-9"
                    autoComplete="username"
                  />
                </div>
              </div>

              <div>
                <label className="label" htmlFor="password">
                  Password
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    required
                    placeholder="••••••••"
                    className="input pl-9 pr-9"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 transition hover:text-slate-700"
                    aria-label="Toggle password visibility"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <button type="submit" disabled={submitting} className="btn-primary w-full">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Sign in
                {submitting ? null : <ArrowRight className="h-4 w-4" />}
              </button>
            </form>

          </div>

          <p className="mt-5 text-center text-[10px] text-slate-400">Internal system · Access is monitored and logged</p>
        </div>
      </div>
    </div>
  );
}
