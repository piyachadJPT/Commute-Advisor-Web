import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";

export type SessionUser = { id: string; email: string | null };

/**
 * The signed-in user, verified. getClaims() checks the JWT; getSession() would only read the
 * cookie, which must never be trusted for an authorization decision. Returns null if signed out.
 */
export async function getUser(): Promise<SessionUser | null> {
  // Everything after the signed-in user is known depends on who is asking and on the clock
  // (JWT expiry, `new Date()`). Wait for a real request first, so Cache Components never tries
  // to prerender it: in dev that raised "unstable value Date.now() while prerendering".
  await connection();
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  return {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
  };
}

/** For Server Actions and route handlers: repeat the check, do not rely on proxy.ts alone. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}
