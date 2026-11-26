import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { locations, users } from "@/db/schema";
import { hashPassword } from "@/lib/auth";
import { fail, ok, readJson, requireRole } from "@/lib/http";
import { logAudit } from "@/lib/inventory";
import { ROLES } from "@/lib/shared";

export async function GET() {
  const auth = await requireRole(["central_admin"]);
  if ("response" in auth) return auth.response;
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      locationId: users.locationId,
      locationName: locations.name,
      active: users.active,
      createdAt: users.createdAt,
    })
    .from(users)
    .leftJoin(locations, eq(users.locationId, locations.id))
    .orderBy(asc(users.id));
  return ok({ rows });
}

export async function POST(request: Request) {
  const auth = await requireRole(["central_admin"]);
  if ("response" in auth) return auth.response;
  const body = await readJson<{
    name?: string;
    email?: string;
    password?: string;
    role?: string;
    locationId?: number;
  }>(request);

  if (!body?.name?.trim() || !body?.email?.trim() || !body?.password) {
    return fail("Name, email and password are required", 422);
  }
  if (!ROLES.includes(body.role as (typeof ROLES)[number])) return fail("Invalid role", 422);
  if ((body.password ?? "").length < 6) return fail("Password must be at least 6 characters", 422);

  const email = body.email.toLowerCase().trim();
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) return fail("Email already in use", 409);

  const [created] = await db
    .insert(users)
    .values({
      name: body.name.trim(),
      email,
      passwordHash: await hashPassword(body.password),
      role: body.role!,
      locationId: body.locationId ? Number(body.locationId) : null,
    })
    .returning({ id: users.id, name: users.name, email: users.email, role: users.role });

  await logAudit({ user: auth.user, action: "user.create", entityType: "user", entityId: created.id, details: `${created.name} (${created.role})` });
  return ok({ user: created });
}

export async function PATCH(request: Request) {
  const auth = await requireRole(["central_admin"]);
  if ("response" in auth) return auth.response;
  const body = await readJson<{ id?: number; role?: string; locationId?: number; active?: boolean; password?: string }>(request);
  if (!body?.id) return fail("User id is required", 422);
  if (body.role && !ROLES.includes(body.role as (typeof ROLES)[number])) return fail("Invalid role", 422);
  if (Number(body.id) === auth.user.id && body.active === false) return fail("You cannot deactivate your own account", 409);
  if (body.password !== undefined && body.password !== "" && body.password.length < 6) {
    return fail("Password must be at least 6 characters", 422);
  }

  const [updated] = await db
    .update(users)
    .set({
      ...(body.role ? { role: body.role } : {}),
      ...(body.locationId !== undefined ? { locationId: body.locationId ? Number(body.locationId) : null } : {}),
      ...(body.active !== undefined ? { active: Boolean(body.active) } : {}),
      ...(body.password ? { passwordHash: await hashPassword(body.password) } : {}),
    })
    .where(eq(users.id, Number(body.id)))
    .returning({ id: users.id, role: users.role, active: users.active });

  if (!updated) return fail("User not found", 404);
  await logAudit({
    user: auth.user,
    action: "user.update",
    entityType: "user",
    entityId: updated.id,
    details: `role ${updated.role}, active ${updated.active}${body.password ? ", password reset" : ""}`,
  });
  return ok({ user: updated });
}
