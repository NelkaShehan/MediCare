"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Check, Copy, FileCode, RefreshCw, Save } from "lucide-react";

import { Card, InfoBanner, PageHeader } from "@/components/ui";

/**
 * Always-working fallback for environments where the preview frame blocks
 * binary (.zip) downloads: the whole project source as selectable text.
 */
export default function SourcePage() {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/source", { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const body = await response.text();
        if (!cancelled) setText(body);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unable to load source");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const fileCount = text ? (text.match(/^===== /gm) ?? []).length : 0;
  const sizeKb = text ? Math.round(text.length / 1024) : 0;

  async function copyAll() {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success(`Copied ${fileCount} files (${sizeKb} KB) — paste it into a file to keep it`, { duration: 6000 });
      setTimeout(() => setCopied(false), 4000);
    } catch {
      toast.error("Copy blocked — click inside the box, then Ctrl+A and Ctrl+C", { duration: 6000 });
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Source code viewer"
        subtitle="The complete project as plain text — works even where the preview frame blocks .zip downloads."
        icon={<FileCode className="h-5 w-5" />}
        actions={
          <>
            <button className="btn btn-ghost btn-sm" onClick={() => window.location.reload()}>
              <RefreshCw className="h-3.5 w-3.5" /> Reload
            </button>
            <a href="/api/source?download=1" className="btn btn-ghost btn-sm" download="medicare-erp-source.txt">
              <Save className="h-3.5 w-3.5" /> Save as .txt
            </a>
            <button className="btn-primary btn-sm" onClick={copyAll} disabled={!text}>
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy all source"}
            </button>
          </>
        }
      />

      <InfoBanner tone="info" title="If .zip downloads are blocked by the preview frame">
        Use <strong>Copy all source</strong> → paste into a file named <span className="font-mono">medicare-erp-source.txt</span> on your computer → follow the
        reconstruction note at the top of the file (each <span className="font-mono">===== path =====</span> section is one file). The original .zip also lives in the
        workspace at <span className="font-mono">public/downloads/medicare-erp-source.zip</span>.
      </InfoBanner>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-gradient-to-r from-teal-50 via-white to-white px-5 py-3 dark:from-teal-950/40 dark:via-transparent dark:to-transparent">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">medicare-erp-source.txt</h2>
            <p className="text-[11px] text-slate-500">
              {text ? `${fileCount} files · ${sizeKb} KB · ${text.split("\n").length.toLocaleString()} lines` : error ? `Error: ${error}` : "Loading…"}
            </p>
          </div>
          <button onClick={copyAll} disabled={!text} className="btn btn-ghost btn-sm">
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <textarea
          readOnly
          value={text ?? ""}
          onFocus={(event) => event.currentTarget.select()}
          placeholder={error ? `Failed to load: ${error}` : "Loading project source…"}
          spellCheck={false}
          className="h-[60vh] w-full resize-y bg-slate-950 p-4 font-mono text-[11px] leading-relaxed text-slate-100 outline-none"
        />
      </Card>
    </div>
  );
}
