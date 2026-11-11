import "server-only";
import { z } from "zod";

/**
 * Server-only environment variables (plan §14.2), validated lazily on first use.
 * They are not part of `env.ts` because that file is imported by `next.config.ts`: a missing
 * job secret should stop the job that needs it, not `next dev` or the build of every page.
 * Each group has its own getter, so a missing push key does not break the scheduler's secret check.
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

const secret = z.string().min(32); // `openssl rand -hex 32` gives 64

/** Authenticates pg_cron's call to /api/jobs/tick (plan §13.1). */
export function jobSecret(): string | null {
  const parsed = secret.safeParse(process.env.JOB_SECRET);
  return parsed.success ? parsed.data : null;
}

/** Authenticates Vercel Cron's call to /api/jobs/daily (it sends `Bearer $CRON_SECRET`). */
export function cronSecret(): string | null {
  const parsed = secret.safeParse(process.env.CRON_SECRET);
  return parsed.success ? parsed.data : null;
}

const pushSchema = z.object({
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().min(40),
  VAPID_PRIVATE_KEY: z.string().min(20),
  // A mailto: or https: contact the push services can reach (plan §14.2).
  VAPID_SUBJECT: z.string().regex(/^(mailto:|https:\/\/)/),
});

/** VAPID settings for sending Web Push. Null if any is missing, so callers can skip quietly. */
export function pushEnv() {
  const parsed = pushSchema.safeParse({
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
    VAPID_SUBJECT: process.env.VAPID_SUBJECT,
  });
  return parsed.success ? parsed.data : null;
}
