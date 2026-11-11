import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { LocalDate } from "@/features/commute/domain/types";

type Client = SupabaseClient<Database>;

export async function listSkippedDays(
  supabase: Client,
  userId: string,
  from: LocalDate,
  to: LocalDate,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("skipped_days")
    .select("date")
    .eq("user_id", userId)
    .gte("date", from)
    .lte("date", to);
  if (error) throw new Error(`skipped_days read failed: ${error.message}`);
  return new Set(data.map((r) => r.date));
}

/** Idempotent: skipping an already-skipped day is not an error. */
export async function skipDay(
  supabase: Client,
  userId: string,
  date: LocalDate,
): Promise<void> {
  const { error } = await supabase
    .from("skipped_days")
    .insert({ user_id: userId, date });
  if (error && error.code !== "23505") {
    throw new Error(`skipped_days insert failed: ${error.message}`);
  }
}

export async function unskipDay(
  supabase: Client,
  userId: string,
  date: LocalDate,
): Promise<void> {
  const { error } = await supabase
    .from("skipped_days")
    .delete()
    .eq("user_id", userId)
    .eq("date", date);
  if (error) throw new Error(`skipped_days delete failed: ${error.message}`);
}
