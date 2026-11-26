import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const SESSION_COOKIE = "psc_session";
const SECRET = new TextEncoder().encode(process.env.JWT_SECRET || "medicare-dev-secret-change-me");
const PUBLIC_APIS = ["/api/auth/login", "/api/auth/logout", "/api/auth/me", "/api/health", "/api/seed"];

async function isValidToken(token: string | undefined | null) {
  if (!token) return false;
  try {
    await jwtVerify(token, SECRET);
    return true;
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  const isApi = pathname.startsWith("/api");
  const isPublicApi = PUBLIC_APIS.some((path) => pathname.startsWith(path));

  const queryToken = searchParams.get("token");
  const cookieToken = request.cookies.get(SESSION_COOKIE)?.value;
  const bearer = request.headers.get("authorization")?.replace(/^bearer\s+/i, "").trim();

  // Sign-in handoff: a valid ?token= proves the session for THIS request even
  // when the browser blocks cookies and local storage entirely.
  let handoff: string | null = null;
  if (queryToken && (await isValidToken(queryToken))) handoff = queryToken;

  const valid = (await isValidToken(cookieToken)) || (await isValidToken(bearer)) || Boolean(handoff);

  if (isApi && !isPublicApi && !valid) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  if (pathname === "/login" && valid) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  const requestHeaders = new Headers(request.headers);
  if (handoff) requestHeaders.set("x-session-token", handoff);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  if (handoff) {
    const secure = (request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "")) === "https";
    response.cookies.set(SESSION_COOKIE, handoff, {
      httpOnly: true,
      path: "/",
      maxAge: 60 * 60 * 12,
      secure,
      sameSite: secure ? "none" : "lax",
    });
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
