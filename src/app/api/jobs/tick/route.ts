import { runJob } from "@/features/jobs/runJob";
import { jobSecret } from "@/lib/env.server";
import { bearerMatches } from "@/lib/jobs/auth";

// A tick processes users one at a time; leave headroom for the forecast fetches.
export const maxDuration = 60;

/**
 * POST /api/jobs/tick: called by pg_cron every 10 minutes through pg_net (plan §13.1). Not
 * behind the session proxy (it has no user), so it authenticates itself with JOB_SECRET.
 */
export async function POST(request: Request) {
  const secret = jobSecret();
  // Same answer for "not configured" and "wrong secret": nothing to learn from the difference.
  if (!secret || !bearerMatches(request.headers.get("authorization"), secret)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const summary = await runJob("tick");
    return Response.json({ ok: summary.errors.length === 0, ...summary });
  } catch {
    return Response.json({ error: "tick_failed" }, { status: 500 });
  }
}
