import type { CookieOptions } from "@supabase/ssr";

/**
 * Session cookies are set only by the server (Server Actions and proxy.ts), and the browser
 * never needs to read them, so they are HttpOnly: an XSS bug cannot steal the session token.
 * The default @supabase/ssr cookie is readable from JavaScript so its browser client can work.
 * This app does not use that client, so this is a free hardening.
 *
 * Secure in production (HTTPS on Vercel). SameSite=Lax comes from the library default.
 */
export function hardenCookie(options: CookieOptions): CookieOptions {
  return {
    ...options,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  };
}
