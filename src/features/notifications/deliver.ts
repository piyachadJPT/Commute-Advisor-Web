import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import {
  deleteSubscriptions,
  recordFailure,
  recordSuccess,
  type PushSubscriptionRow,
} from "./data/pushSubscriptionRepo";
import type { PushPayload } from "./domain/payload";
import { sendToSubscriptions, type SendFn, type SendResult } from "./sendPush";

/**
 * Sends to every device of one user, then tidies up: expired subscriptions are deleted (404 or
 * 410, plan §13.3), accepted ones are marked delivered, other failures are counted. The
 * bookkeeping is best effort: the message was already sent, so a bookkeeping error must not make
 * the caller report the send as failed. Shared by the scheduler tick and the test notification.
 */
export async function deliverToUser(
  supabase: SupabaseClient<Database>,
  subscriptions: PushSubscriptionRow[],
  payload: PushPayload,
  send: SendFn,
  now: Date,
): Promise<SendResult> {
  const outcome = await sendToSubscriptions(subscriptions, payload, send);
  try {
    await deleteSubscriptions(supabase, outcome.gone);
    await recordSuccess(supabase, outcome.sent, now);
    for (const f of outcome.failed)
      await recordFailure(supabase, f.id, f.failureCount);
  } catch {
    // Left for the next tick to correct.
  }
  return outcome;
}
