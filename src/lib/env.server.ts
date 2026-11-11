import "server-only";
import { z } from "zod";

/**
 * Server-only environment variables (plan §14.2), validated lazily on first use.
 * They are not part of `env.ts` because that file is imported by `next.config.ts`: a missing
 * job secret should stop the job that needs it, not `next dev` or the build of every page.
 * Add JOB_SECRET, CRON_SECRET, VAPID_* and APP_URL here in Phase 6.
 */
const schema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
});

export function serverEnv() {
  const parsed = schema.safeParse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });
  if (!parsed.success) {
    throw new Error(
      `Invalid server environment variables:\n${z.prettifyError(parsed.error)}`,
    );
  }
  return parsed.data;
}
