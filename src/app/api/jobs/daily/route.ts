import { runJob } from "@/features/jobs/runJob";
import { cronSecret } from "@/lib/env.server";
import { bearerMatches } from "@/lib/jobs/auth";

export const maxDuration = 60;

/**
 * GET /api/jobs/daily: called once a day by Vercel Cron, which sends `Bearer $CRON_SECRET`
 * (plan §13.5). On the Hobby plan its timing can drift by up to 59 minutes, so it is never used
 * for notification timing: it is a backup tick and a database query that keeps the Supabase
 * Free project from looking inactive.
 */
export async function GET(request: Request) {
  const secret = cronSecret();
  if (!secret || !bearerMatches(request.headers.get("authorization"), secret)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const summary = await runJob("daily");
    return Response.json({ ok: summary.errors.length === 0, ...summary });
  } catch {
    return Response.json({ error: "daily_failed" }, { status: 500 });
  }
}
