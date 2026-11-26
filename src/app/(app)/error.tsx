"use client";

import { useEffect } from "react";
import { Link } from "@/components/link";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[medicare] page error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-red-50 text-red-600">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <h2 className="mt-3 text-base font-semibold text-slate-900">This screen could not load</h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          {error.message || "An unexpected error occurred while loading your workspace."}
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <button onClick={reset} className="btn-primary btn-sm">
            <RefreshCw className="h-3.5 w-3.5" /> Try again
          </button>
          <Link href="/dashboard" className="btn-ghost btn-sm">
            Go to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
