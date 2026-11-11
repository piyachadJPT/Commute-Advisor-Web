import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/database.types";
import { env } from "@/lib/env";
import { safeNext } from "@/lib/auth/safe-next";
import { hardenCookie } from "./cookie-options";

/** Paths a signed-out visitor may open. Everything else redirects to /login. */
// /offline is the service worker's fallback page: no user data, read from the device only.
const PUBLIC_PATHS = ["/login", "/offline"];

const isPublic = (pathname: string) =>
  PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

/**
 * Refreshes the Supabase session and applies the route guard (plan §10.2).
 * The proxy is only the first gate: every Server Action and route handler verifies the
 * session again, because a proxy can be bypassed by a misconfigured matcher.
 */
export async function updateSession(
  request: NextRequest,
): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet)
            request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, hardenCookie(options));
          }
          // Responses that carry a session must never be cached by a CDN.
          for (const [key, value] of Object.entries(headers))
            response.headers.set(key, value);
        },
      },
    },
  );

  // getClaims() verifies the JWT (and refreshes it near expiry). Never trust getSession() here.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);
  const { pathname, search } = request.nextUrl;

  const redirectTo = (url: URL) => {
    const redirect = NextResponse.redirect(url);
    // Carry refreshed cookies and the no-cache headers onto the redirect.
    for (const cookie of response.cookies.getAll())
      redirect.cookies.set(cookie);
    for (const key of ["cache-control", "expires", "pragma"]) {
      const value = response.headers.get(key);
      if (value) redirect.headers.set(key, value);
    }
    return redirect;
  };

  if (!signedIn && pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }

  if (!signedIn && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    // Return to the same page after sign-in (plan §11.4, "Session expired").
    if (pathname !== "/") url.searchParams.set("next", `${pathname}${search}`);
    return redirectTo(url);
  }

  if (signedIn && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = safeNext(request.nextUrl.searchParams.get("next"));
    url.search = "";
    return redirectTo(url);
  }

  return response;
}
