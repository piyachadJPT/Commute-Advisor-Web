import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/database.types";
import { env } from "@/lib/env";
import { hardenCookie } from "./cookie-options";

/**
 * User-scoped Supabase client for Server Components, Server Actions and Route Handlers.
 * Uses the publishable key plus the session cookie, so RLS always applies (plan §6.0).
 * Create one per request; never share a client between requests.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, hardenCookie(options));
            }
          } catch {
            // Server Components cannot write cookies. proxy.ts refreshes the session instead.
          }
        },
      },
    },
  );
}
