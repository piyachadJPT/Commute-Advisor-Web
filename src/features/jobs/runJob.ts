import "server-only";
import { createWebPushSender } from "@/features/notifications/webPushSender";
import { createServiceClient } from "@/lib/supabase/service";
import { finishRun, startRun } from "./jobRunRepo";
import { runTick } from "./tickService";

/**
 * Runs one tick and records it in `job_runs` (plan §6.8, §13.1). Used by `/api/jobs/tick`
 * (pg_cron, every 10 minutes) and `/api/jobs/daily` (Vercel Cron, a backup that also keeps the
 * Supabase project from looking inactive).
 */
export async function runJob(job: "tick" | "daily") {
  const supabase = createServiceClient();
  const startedAt = new Date();
  const runId = await startRun(supabase, job, startedAt);
  try {
    const summary = await runTick({
      supabase,
      now: startedAt,
      send: createWebPushSender(),
    });
    await finishRun(supabase, runId, {
      status: summary.errors.length === 0 ? "ok" : "error",
      details: summary,
      now: new Date(),
    });
    return summary;
  } catch (err) {
    await finishRun(supabase, runId, {
      status: "error",
      details: {
        error:
          err instanceof Error ? err.message.slice(0, 300) : "unknown error",
      },
      now: new Date(),
    }).catch(() => undefined);
    throw err;
  }
}
