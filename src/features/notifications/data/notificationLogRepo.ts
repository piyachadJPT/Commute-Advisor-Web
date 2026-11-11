import type { SupabaseClient } from "@supabase/supabase-js";
import type { LocalDate } from "@/features/commute/domain/types";
import type { Database } from "@/lib/database.types";
import type { NotificationKind } from "../domain/payload";

type Client = SupabaseClient<Database>;

/**
 * Claims a day by inserting a `sending` row (plan §6.6, §13.1). The unique (user_id,
 * target_date) constraint means at most one caller gets `true`, however many ticks overlap:
 * `ignoreDuplicates` makes a lost race return no row instead of an error.
 */
export async function claimDay(
  supabase: Client,
  input: { userId: string; targetDate: LocalDate; kind: NotificationKind },
): Promise<boolean> {
  const { data, error } = await supabase
    .from("notification_logs")
    .upsert(
      {
        user_id: input.userId,
        target_date: input.targetDate,
        kind: input.kind,
        status: "sending",
      },
      { onConflict: "user_id,target_date", ignoreDuplicates: true },
    )
    .select("id");
  if (error)
    throw new Error(`notification_logs claim failed: ${error.message}`);
  return data.length === 1;
}

/** Records the outcome. `sent` means a push service accepted it, not that a device showed it. */
export async function finishLog(
  supabase: Client,
  input: {
    userId: string;
    targetDate: LocalDate;
    status: "sent" | "failed";
    devicesSent: number;
    now: Date;
    error?: string | null;
  },
): Promise<void> {
  const { error } = await supabase
    .from("notification_logs")
    .update({
      status: input.status,
      devices_sent: input.devicesSent,
      sent_at: input.status === "sent" ? input.now.toISOString() : null,
      error_message: input.error?.slice(0, 500) ?? null,
    })
    .eq("user_id", input.userId)
    .eq("target_date", input.targetDate);
  if (error)
    throw new Error(`notification_logs update failed: ${error.message}`);
}
