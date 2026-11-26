import "server-only";

import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies, headers } from "next/headers";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { locations, users } from "@/db/schema";
import type { Role, SessionUser } from "@/lib/shared";

export const SESSION_COOKIE = "psc_session";
const SECRET = new TextEncoder().encode(process.env.JWT_SECRET || "medicare-dev-secret-change-me");
const MAX_AGE = 60 * 60 * 12; // 12 hours

export type TokenPayload = {
  uid: number;
  name: string;
  email: string;
  role: Role;
  locationId: number | null;
  locationName: string;
  locationType: string;
};

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function createToken(payload: TokenPayload) {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(SECRET);
}

export async function verifyToken(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload as unknown as TokenPayload;
  } catch {
    return null;
  }
}

/**
 * Cookie flags are negotiated so authentication also works when the preview is
 * embedded in a cross-site frame (requires SameSite=None; Secure) or served over
 * plain http (Secure cookies would be dropped by the browser).
 */
async function cookieOptions() {
  let https = process.env.NODE_ENV === "production";
  try {
    const headerStore = await headers();
    const proto = headerStore.get("x-forwarded-proto")?.split(",")[0]?.trim();
    if (proto) https = proto === "https";
  } catch {
    // Outside a request scope — fall back to the environment default.
  }
  return {
    httpOnly: true,
    path: "/",
    maxAge: MAX_AGE,
    secure: https,
    sameSite: (https ? "none" : "lax") as "none" | "lax",
  };
}

export async function setSessionCookie(token: string) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, await cookieOptions());
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}

/**
 * Reads the session from the httpOnly cookie, falling back to a Bearer token.
 * The fallback keeps API calls authenticated in browsers/frames that block
 * third-party cookies. Used by server components / route handlers.
 */
export async function getSession(): Promise<SessionUser | null> {
  const jar = await cookies();
  let token = jar.get(SESSION_COOKIE)?.value;
  if (!token) {
    try {
      const headerStore = await headers();
      // Set by middleware from ?token= (blocked-cookie / no-JS handoff) …
      token = headerStore.get("x-session-token") ?? undefined;
      // … or an explicit Bearer header from the client data layer.
      if (!token) {
        const authorization = headerStore.get("authorization");
        if (authorization?.toLowerCase().startsWith("bearer ")) token = authorization.slice(7).trim();
      }
    } catch {
      // ignore — no request scope
    }
  }
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload) return null;
  return {
    id: payload.uid,
    name: payload.name,
    email: payload.email,
    role: payload.role,
    locationId: payload.locationId,
    locationName: payload.locationName,
    locationType: payload.locationType,
  };
}

export async function authenticate(email: string, password: string) {
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      passwordHash: users.passwordHash,
      locationId: users.locationId,
      active: users.active,
      locationName: locations.name,
      locationType: locations.type,
    })
    .from(users)
    .leftJoin(locations, eq(users.locationId, locations.id))
    .where(eq(users.email, email.toLowerCase().trim()))
    .limit(1);

  const user = rows[0];
  if (!user || !user.active) return null;
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return null;

  const session: SessionUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role as Role,
    locationId: user.locationId,
    locationName: user.locationName ?? "Head Office",
    locationType: user.locationType ?? "head_office",
  };
  return session;
}

export function isCentral(role: Role) {
  return role === "central_admin";
}

export function canManageMasters(role: Role) {
  return role === "central_admin";
}

/** Central admin + warehouse staff operate the warehouse side. */
export function isWarehouseSide(role: Role) {
  return role === "central_admin" || role === "warehouse_staff";
}

/** Returns the raw session token from cookie, middleware handoff or Bearer header. */
export async function getSessionToken(): Promise<string | null> {
  const jar = await cookies();
  const cookieToken = jar.get(SESSION_COOKIE)?.value;
  if (cookieToken) return cookieToken;
  try {
    const headerStore = await headers();
    const handoff = headerStore.get("x-session-token");
    if (handoff) return handoff;
    const authorization = headerStore.get("authorization");
    if (authorization?.toLowerCase().startsWith("bearer ")) return authorization.slice(7).trim();
  } catch {
    // no request scope
  }
  return null;
}
