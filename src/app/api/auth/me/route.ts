import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { locations, users } from "@/db/schema";
import { createToken, getSession, setSessionCookie, verifyToken } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import type { Role } from "@/lib/shared";

/** Resolves the current session from cookie or Bearer token (used by the client AuthGate). */
export async function GET(request: Request) {
  const user = await getSession();
  if (user) {
    // Re-issue a fresh token: heals clients that hold a stale value in storage.
    const token = await createToken({
      uid: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      locationId: user.locationId,
      locationName: user.locationName,
      locationType: user.locationType,
    });
    return ok({ user, token });
  }

  // Explicit Bearer path — guarantees a 401 instead of an empty object.
  const authorization = request.headers.get("authorization");
  if (!authorization?.toLowerCase().startsWith("bearer ")) return fail("Authentication required", 401);
  const payload = await verifyToken(authorization.slice(7).trim());
  if (!payload) return fail("Session expired", 401);

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      locationId: users.locationId,
      locationName: locations.name,
      locationType: locations.type,
    })
    .from(users)
    .leftJoin(locations, eq(users.locationId, locations.id))
    .where(eq(users.id, payload.uid))
    .limit(1);

  const record = rows[0];
  if (!record) return fail("Account no longer exists", 401);

  return ok({
    user: {
      id: record.id,
      name: record.name,
      email: record.email,
      role: record.role as Role,
      locationId: record.locationId,
      locationName: record.locationName ?? "Head Office",
      locationType: record.locationType ?? "head_office",
    },
    token: await createToken({
      uid: record.id,
      name: record.name,
      email: record.email,
      role: record.role as Role,
      locationId: record.locationId,
      locationName: record.locationName ?? "Head Office",
      locationType: record.locationType ?? "head_office",
    }),
  });
}

/** Re-issues the httpOnly cookie from a valid Bearer token (cookie repair). */
export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.toLowerCase().startsWith("bearer ")) return fail("Bearer token required", 400);
  const payload = await verifyToken(authorization.slice(7).trim());
  if (!payload) return fail("Session expired", 401);

  const token = await createToken({
    uid: payload.uid,
    name: payload.name,
    email: payload.email,
    role: payload.role,
    locationId: payload.locationId,
    locationName: payload.locationName,
    locationType: payload.locationType,
  });
  await setSessionCookie(token);
  return NextResponse.json({ success: true });
}
