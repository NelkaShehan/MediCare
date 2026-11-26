import "server-only";

import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import type { Role, SessionUser } from "@/lib/shared";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function fail(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

/** Returns the session or a 401 response. */
export async function requireSession(): Promise<{ user: SessionUser } | { response: NextResponse }> {
  const user = await getSession();
  if (!user) return { response: fail("Authentication required", 401) };
  return { user };
}

export async function requireRole(
  roles: Role[],
): Promise<{ user: SessionUser } | { response: NextResponse }> {
  const result = await requireSession();
  if ("response" in result) return result;
  if (!roles.includes(result.user.role)) {
    return { response: fail("You do not have permission to perform this action", 403) };
  }
  return result;
}

export function isFail(result: { user: SessionUser } | { response: NextResponse }): result is { response: NextResponse } {
  return "response" in result;
}

export async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

export function makeCodeSafe(prefix: string) {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(2, 12);
  const rand = Math.floor(100 + Math.random() * 900);
  return `${prefix}-${stamp}${rand}`;
}

/**
 * 303 redirect with a RELATIVE Location header. Never derive the redirect host
 * from `request.url`: behind a preview proxy that value can be an internal
 * address (e.g. http://0.0.0.0:3000) which the browser cannot open.
 */
export function seeOther(path: string) {
  return new Response(null, { status: 303, headers: { Location: path } });
}

export const codeNumber = makeCodeSafe;

export function todayString() {
  return new Date().toISOString().slice(0, 10);
}
