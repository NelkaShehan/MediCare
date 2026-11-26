"use client";

import { startTransition, useCallback, useEffect, useRef, useState } from "react";

export class ApiError extends Error {
  status: number;
  payload: Record<string, unknown>;
  constructor(message: string, status: number, payload: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

export const TOKEN_KEY = "pf_token";

/**
 * Session token resolution that survives hostile embedding contexts:
 *   1. in-memory (client-side navigation, no reload needed)
 *   2. localStorage (persists reloads when storage is allowed)
 *   3. URL hash `#t=<jwt>` (works even when cookies AND storage are blocked)
 * The hash is stripped from the address bar as soon as it is read.
 */
let memoryToken: string | null = null;
let bootstrapped = false;

/** Reads `?token=` (server handoff) or `#t=` and cleans the address bar. */
export function readUrlToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const fromQuery = new URLSearchParams(window.location.search).get("token");
    const fromHash = window.location.hash.match(/[#&]t=([^&]+)/)?.[1];
    const raw = fromQuery ?? (fromHash ? decodeURIComponent(fromHash) : null);
    if (!raw) return null;
    writeToken(raw);
    try {
      window.history.replaceState(null, "", window.location.pathname + window.location.hash.replace(/[#&]?t=[^&]*/, ""));
    } catch {
      window.history.replaceState(null, "", window.location.pathname);
    }
    return raw;
  } catch {
    return null;
  }
}

export function readToken(): string | null {
  if (typeof window === "undefined") return null;
  // Freshest handoff from the server wins over any cached value.
  const fromUrl = readUrlToken();
  if (fromUrl) return fromUrl;
  if (memoryToken) return memoryToken;
  try {
    const stored = window.localStorage.getItem(TOKEN_KEY);
    if (stored) {
      memoryToken = stored;
      return stored;
    }
  } catch {
    // storage blocked (sandboxed frame) — session stays in memory only
  }
  return null;
}

/** Appends the session token to an internal path so navigation survives cookie blocking. */
export function withToken(path: string, explicitToken?: string | null): string {
  const token = explicitToken ?? readToken();
  if (!token || !path.startsWith("/") || path.startsWith("//")) return path;
  if (path.startsWith("/api/")) return path;
  const url = new URL(path, "http://app.local");
  url.searchParams.set("token", token);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function writeToken(token: string | null) {
  memoryToken = token;
  if (typeof window === "undefined") return;
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // storage unavailable — memory + hash keep the session alive
  }
}

type FetchOptions = RequestInit & { retry?: boolean };

async function rawFetch(url: string, init: FetchOptions, token: string | null) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  Object.assign(headers, (init.headers as Record<string, string>) ?? {});
  return fetch(url, { ...init, headers, credentials: "same-origin", cache: "no-store" });
}

function withAuthToken(url: string, token: string | null) {
  if (!token) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}token=${encodeURIComponent(token)}`;
}

export async function api<T>(url: string, init: FetchOptions = {}): Promise<T> {
  let token = readToken();

  let response: Response;
  try {
    response = await rawFetch(withAuthToken(url, token), init, token);
  } catch {
    // transient network blip — one retry
    await new Promise((resolve) => setTimeout(resolve, 400));
    response = await rawFetch(withAuthToken(url, token), init, token);
  }

  // A rejected token (often stale after a redeploy) must never poison the
  // session: drop it and retry once using the httpOnly cookie instead.
  if (response.status === 401 && token) {
    writeToken(null);
    token = null;
    response = await rawFetch(url, init, null);
  }

  // One retry for transient server errors.
  if (!response.ok && response.status >= 500 && init.retry !== false) {
    await new Promise((resolve) => setTimeout(resolve, 700));
    const retryToken = readToken();
    response = await rawFetch(withAuthToken(url, retryToken), init, retryToken);
  }

  const text = await response.text();
  let payload: Record<string, unknown> = {};
  try {
    payload = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    payload = { error: `Unexpected response from the server (${response.status})` };
  }
  if (!response.ok) {
    throw new ApiError((payload.error as string) || `Request failed (${response.status})`, response.status, payload);
  }
  return payload as T;
}

export function apiPost<T>(url: string, body: unknown) {
  return api<T>(url, { method: "POST", body: JSON.stringify(body) });
}

export function apiPatch<T>(url: string, body: unknown) {
  return api<T>(url, { method: "PATCH", body: JSON.stringify(body) });
}

export function useApi<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(Boolean(url));
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!url) {
      startTransition(() => setLoading(false));
      return;
    }
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    startTransition(() => setLoading(true));

    const load = (attempt: number) => {
      api<T>(url)
        .then((payload) => {
          if (cancelled) return;
          setData(payload);
          setError(null);
          setLoading(false);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          // One automatic retry: the session token can arrive from the auth
          // gate a moment after the first render.
          if (attempt === 0) {
            retryTimer = setTimeout(() => load(1), 700);
            return;
          }
          setError(err instanceof Error ? err.message : "Unable to load data");
          setLoading(false);
        });
    };

    load(0);
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [url, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, error, refresh, setData };
}

export function useDebouncedValue<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const csv = [headers.join(","), ...rows.map((row) => headers.map((h) => escape(row[h])).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

// Runs as soon as this module is imported in the browser: captures `?token=`
// from the URL before any component effect fires its first data request.
if (typeof window !== "undefined" && !bootstrapped) {
  bootstrapped = true;
  readUrlToken();
}
