import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { env } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";

/**
 * Service-role Supabase client. It BYPASSES RLS, so it is only for job routes under
 * `/api/jobs/*` and the services they call (plan §6.0, §14.4). Never use it in a page, Server
 * Action or Route Handler that acts on behalf of a signed-in user: use `server.ts` there.
 * `server-only` makes the build fail if this module is ever imported from client code.
 */
export function createServiceClient() {
  return createSupabaseClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv().SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
