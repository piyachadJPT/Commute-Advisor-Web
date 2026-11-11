import type { SupabaseClient } from "@supabase/supabase-js";
import type { Json } from "@/lib/database.types";
import type { Database } from "@/lib/database.types";

type Client = SupabaseClient<Database>;

/**
 * Records scheduler runs in `job_runs` (plan §6.8). Service-role client only: the table is
 * closed to every API role. A run starts as `ok` with no `finished_at`, which the health check
 * ignores, so a run that dies half way never looks like a success.
 */
export async function startRun(
  supabase: Client,
  job: "tick" | "daily",
  now: Date,
): Promise<number> {
  const { data, error } = await supabase
    .from("job_runs")
    .insert({ job, started_at: now.toISOString(), status: "ok" })
    .select("id")
    .single();
  if (error) throw new Error(`job_runs insert failed: ${error.message}`);
  return data.id;
}

export async function finishRun(
  supabase: Client,
  id: number,
  result: { status: "ok" | "error"; details: Json; now: Date },
): Promise<void> {
  const { error } = await supabase
    .from("job_runs")
    .update({
      status: result.status,
      finished_at: result.now.toISOString(),
      details: result.details as NonNullable<Json>,
    })
    .eq("id", id);
  if (error) throw new Error(`job_runs update failed: ${error.message}`);
}
