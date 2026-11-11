import { z } from "zod";

/**
 * Environment variables, validated once at startup (plan §14.2).
 * `next.config.ts` imports this file, so a missing variable stops `next dev` and `next build`.
 *
 * NEXT_PUBLIC_* variables must be read as literal `process.env.NAME` expressions: Next.js
 * inlines them into the browser bundle by text match, so they cannot be read from a loop.
 * Server-only variables (service-role key, job secrets, VAPID) are added here in the phase
 * that first uses them.
 */
const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  // Publishable key (RLS applies). The secret key must never use a NEXT_PUBLIC_ name.
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
});

const parsed = schema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
});

if (!parsed.success) {
  throw new Error(
    `Invalid environment variables:\n${z.prettifyError(parsed.error)}`,
  );
}

export const env = parsed.data;
