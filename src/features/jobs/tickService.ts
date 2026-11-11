import type { SupabaseClient } from "@supabase/supabase-js";
import { localDateOf } from "@/features/commute/domain/tz";
import type { LocalTime } from "@/features/commute/domain/types";
import { syncUserForecasts } from "@/features/forecast/forecastSyncService";
import {
  claimDay,
  finishLog,
} from "@/features/notifications/data/notificationLogRepo";
import { listSubscriptions } from "@/features/notifications/data/pushSubscriptionRepo";
import {
  isNotificationDue,
  isPreNotificationRefresh,
} from "@/features/notifications/domain/due";
import { buildNotification } from "@/features/notifications/domain/payload";
import { deliverToUser } from "@/features/notifications/deliver";
import type { SendFn } from "@/features/notifications/sendPush";
import { analyzeUser } from "@/features/recommendations/recommendationService";
import {
  getUserSettings,
  listActiveUserIds,
} from "@/features/settings/data/settingsRepo";
import type { Database } from "@/lib/database.types";

export type TickSummary = {
  users: number;
  /** Locations whose forecast was fetched this tick. */
  refreshed: number;
  /** Days locked by this tick. */
  locked: number;
  notificationsSent: number;
  devicesSent: number;
  /** A message was due but the user has no device subscribed. */
  noSubscription: number;
  /** A message was due but push is not configured (VAPID keys missing). */
  pushNotConfigured: number;
  errors: Array<{ userId: string; message: string }>;
};

/**
 * One scheduler tick for all users (plan §13.1). `send` is null when push is not configured.
 *
 * Every step is idempotent, so overlapping, retried or duplicated ticks never lock a day twice
 * or send a second notification: locking goes through `resolveRecommendation` and the database
 * trigger, and the notification is claimed in `notification_logs` before it is sent. Users are
 * processed one at a time, and one user's failure is recorded without stopping the rest.
 */
export async function runTick(input: {
  supabase: SupabaseClient<Database>; // service role
  now: Date;
  send: SendFn | null;
}): Promise<TickSummary> {
  const { supabase, now, send } = input;
  const summary: TickSummary = {
    users: 0,
    refreshed: 0,
    locked: 0,
    notificationsSent: 0,
    devicesSent: 0,
    noSubscription: 0,
    pushNotConfigured: 0,
    errors: [],
  };

  const userIds = await listActiveUserIds(supabase);
  summary.users = userIds.length;

  for (const userId of userIds) {
    try {
      const s = await getUserSettings(supabase, userId);
      if (!s) continue;
      const tz = s.timeZone;
      const today = localDateOf(now, tz);
      const notificationTime = s.notificationTime as LocalTime;

      // 1. Refresh forecasts. The tick before the morning message forces it (plan §13.2).
      const trigger =
        s.notificationsEnabled &&
        isPreNotificationRefresh({ now, today, notificationTime, timeZone: tz })
          ? "pre_notification"
          : "scheduled";
      const sync = await syncUserForecasts(
        { supabase },
        { userId, trigger, now },
      );
      summary.refreshed += sync.filter((r) => r.status === "success").length;

      // 2. Analyse the target day, lock it if its departure window has started.
      const a = await analyzeUser({ supabase, userId, now, userSettings: s });
      if (a.kind !== "ready") continue;
      if (a.lockedNow) summary.locked++;

      // 3. The morning notification: today's recommendation, claimed once per day.
      const due =
        s.notificationsEnabled &&
        a.target === today &&
        isNotificationDue({
          now,
          today,
          notificationTime,
          timeZone: tz,
          commuteDays: s.commuteDays,
          skipped: a.skipped,
        });
      if (!due) continue;

      if (send === null) {
        summary.pushNotConfigured++;
        continue;
      }
      const subs = await listSubscriptions(supabase, userId);
      if (subs.length === 0) {
        summary.noSubscription++;
        continue;
      }

      const { kind, payload } = buildNotification({
        computed: a.computed,
        now,
        timeZone: tz,
        locale: s.locale ?? "th",
      });
      if (!(await claimDay(supabase, { userId, targetDate: today, kind })))
        continue; // already sent

      let outcome: Awaited<ReturnType<typeof deliverToUser>>;
      try {
        outcome = await deliverToUser(supabase, subs, payload, send, now);
      } catch (err) {
        await finishLog(supabase, {
          userId,
          targetDate: today,
          status: "failed",
          devicesSent: 0,
          now,
          error: err instanceof Error ? err.message : "send failed",
        });
        throw err;
      }
      await finishLog(supabase, {
        userId,
        targetDate: today,
        status: outcome.sent.length > 0 ? "sent" : "failed",
        devicesSent: outcome.sent.length,
        now,
        error:
          outcome.sent.length > 0
            ? null
            : `no device accepted the message (${outcome.failed.length} failed, ${outcome.gone.length} removed)`,
      });
      if (outcome.sent.length > 0) summary.notificationsSent++;
      summary.devicesSent += outcome.sent.length;
    } catch (err) {
      summary.errors.push({
        userId,
        message: (err instanceof Error ? err.message : "unknown error").slice(
          0,
          200,
        ),
      });
    }
  }
  return summary;
}
