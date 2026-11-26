import { authenticate } from "@/lib/auth";
import { fail, ok, readJson, seeOther } from "@/lib/http";
import { ensureSeeded } from "@/lib/seed";
import { signInAndGetToken } from "@/lib/sign-in";
import { homePathForRole } from "@/lib/shared";

/**
 * Accepts either a normal HTML form post (no JavaScript required) or JSON.
 * Form posts answer with a relative 303 redirect carrying the token in the URL
 * hash, so signing in works even when cookies and local storage are blocked.
 */
export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  const isForm = contentType.includes("form");

  let email = "";
  let password = "";
  if (isForm) {
    const form = await request.formData();
    email = String(form.get("email") ?? "");
    password = String(form.get("password") ?? "");
  } else {
    const body = await readJson<{ email?: string; password?: string }>(request);
    email = body?.email ?? "";
    password = body?.password ?? "";
  }

  if (!email.trim() || !password) {
    if (isForm) return seeOther(`/login?error=${encodeURIComponent("Email and password are required")}`);
    return fail("Email and password are required", 422);
  }

  try {
    await ensureSeeded();
    const session = await authenticate(email, password);
    if (!session) {
      if (isForm) return seeOther(`/login?error=${encodeURIComponent("Invalid email or password")}`);
      return fail("Invalid email or password", 401);
    }

    const token = await signInAndGetToken(session);
    const home = homePathForRole(session.role, session.locationId);
    if (isForm) return seeOther(`${home}?token=${encodeURIComponent(token)}`);
    return ok({ user: session, token, redirectTo: home });
  } catch (error) {
    console.error("[login]", error);
    if (isForm) return seeOther(`/login?error=${encodeURIComponent("Sign-in failed — please try again")}`);
    return fail("Sign-in failed — please try again", 500);
  }
}
