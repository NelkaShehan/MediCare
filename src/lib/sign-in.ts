import "server-only";

import { createToken, setSessionCookie } from "@/lib/auth";
import type { SessionUser } from "@/lib/shared";

/** Issues the JWT, sets the httpOnly cookie and returns the raw token. */
export async function signInAndGetToken(session: SessionUser) {
  const token = await createToken({
    uid: session.id,
    name: session.name,
    email: session.email,
    role: session.role,
    locationId: session.locationId,
    locationName: session.locationName,
    locationType: session.locationType,
  });
  await setSessionCookie(token);
  return token;
}
