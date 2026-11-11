import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type Client = SupabaseClient<Database>;

export type PushSubscriptionRow = {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string | null;
  failureCount: number;
  createdAt: string;
  lastSuccessAt: string | null;
};

export async function listSubscriptions(
  supabase: Client,
  userId: string,
): Promise<PushSubscriptionRow[]> {
  const { data, error } = await supabase
    .from("push_subscriptions")
    .select(
      "id, endpoint, p256dh, auth, user_agent, failure_count, created_at, last_success_at",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error)
    throw new Error(`push_subscriptions read failed: ${error.message}`);
  return data.map((r) => ({
    id: r.id,
    endpoint: r.endpoint,
    p256dh: r.p256dh,
    auth: r.auth,
    userAgent: r.user_agent,
    failureCount: r.failure_count,
    createdAt: r.created_at,
    lastSuccessAt: r.last_success_at,
  }));
}

/** A subscription the push service rejected (404/410) or one that is not allowed. */
export async function deleteSubscriptions(
  supabase: Client,
  ids: number[],
): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .in("id", ids);
  if (error)
    throw new Error(`push_subscriptions delete failed: ${error.message}`);
}

export async function recordSuccess(
  supabase: Client,
  ids: number[],
  now: Date,
): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase
    .from("push_subscriptions")
    .update({ last_success_at: now.toISOString(), failure_count: 0 })
    .in("id", ids);
  if (error)
    throw new Error(`push_subscriptions update failed: ${error.message}`);
}

export async function recordFailure(
  supabase: Client,
  id: number,
  previousFailures: number,
): Promise<void> {
  const { error } = await supabase
    .from("push_subscriptions")
    .update({ failure_count: Math.min(previousFailures + 1, 32_000) })
    .eq("id", id);
  if (error)
    throw new Error(`push_subscriptions update failed: ${error.message}`);
}
