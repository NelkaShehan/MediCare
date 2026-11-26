"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Download, Info, Loader2, Save } from "lucide-react";

/**
 * Download button that works inside the platform preview frame.
 *
 * IMPORTANT: never open the raw sandbox URL in a new tab — the gateway rejects
 * it with "traffic access token is missing". Every request must stay inside the
 * preview context, where the platform injects the token.
 *
 * Primary: same-tab anchor (the gateway passes it, the attachment header saves it).
 * Secondary: fetch → blob → save, so the page does not navigate away.
 */
export function DownloadButton({
  href,
  filename,
  label = "Download .zip",
  className = "btn-primary btn-sm mt-3 w-full",
}: {
  href: string;
  filename: string;
  label?: string;
  className?: string;
}) {
  const [saving, setSaving] = useState(false);

  async function saveInPlace() {
    if (saving) return;
    setSaving(true);
    try {
      const response = await fetch(href, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      if (blob.size === 0) throw new Error("empty");

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);

      toast.success(`Saving ${filename} (${Math.round(blob.size / 1024)} KB) — check your downloads (Ctrl+J)`, { duration: 6000 });
    } catch {
      toast.error("Could not save automatically — use the Download button above instead.", { duration: 6000 });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 space-y-1.5">
      {/* Same-tab navigation keeps the platform's access token attached. */}
      <a href={href} download={filename} className={className}>
        <Download className="h-3.5 w-3.5" /> {label}
      </a>

      <button type="button" onClick={saveInPlace} disabled={saving} className="btn btn-ghost btn-sm w-full">
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
        {saving ? "Saving…" : "Save without leaving the page"}
      </button>

      <p className="flex items-start gap-1.5 text-[10px] leading-relaxed text-slate-500">
        <Info className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" />
        If the file does not appear, check your browser downloads with{" "}
        <kbd className="rounded border border-slate-200 bg-slate-50 px-1 font-mono text-[9px]">Ctrl</kbd>+<kbd className="rounded border border-slate-200 bg-slate-50 px-1 font-mono text-[9px]">J</kbd>. The file also
        lives in the workspace at <span className="font-mono text-slate-600">public/downloads/medicare-erp-source.zip</span>.
      </p>
    </div>
  );
}
