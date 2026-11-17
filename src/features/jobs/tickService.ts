import type { SupabaseClient } from "@supabase/supabase-js";
import { localDateOf } from "@/features/commute/domain/tz";
import type { LocalDate, LocalTime } from "@/features/commute/domain/types";
import { syncUserForecasts } from "@/features/forecast/forecastSyncService";
import {
  claimDay,
  finishLog,
  type NotificationSlot,
} from "@/features/notifications/data/notificationLogRepo";
import { listSubscriptions } from "@/features/notifications/data/pushSubscriptionRepo";
import {
  isNotificationDue,
  isPreNotificationRefresh,
  isPreReturnRefresh,
  isReturnUpdateDue,
} from "@/features/notifications/domain/due";
import {
  buildNotification,
  type NotificationKind,
  type PushPayload,
} from "@/features/notifications/domain/payload";
import {
  buildReturnUpdate,
  returnUpdate,
} from "@/features/notifications/domain/returnUpdate";
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
 * or send a message twice: locking goes through `resolveRecommendation` and the database
 * trigger, and each message is claimed in `notification_logs` (per day and slot) before it is
 * sent. Users are processed one at a time, and one user's failure is recorded without stopping
 * the rest.
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
      const returnTime = s.returnTime as LocalTime;

      // 1. Refresh forecasts. The tick before each message forces it (plan §13.2).
      const trigger =
        s.notificationsEnabled &&
        (isPreNotificationRefresh({
          now,
          today,
          notificationTime,
          timeZone: tz,
        }) ||
          isPreReturnRefresh({ now, today, returnTime, timeZone: tz }))
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
      if (!s.notificationsEnabled || a.target !== today) continue;

      const dueInput = {
        now,
        today,
        timeZone: tz,
        commuteDays: s.commuteDays,
        skipped: a.skipped,
      };
      const locale = s.locale ?? "th";

      // 3. The morning notification: today's recommendation, claimed once per day.
      if (isNotificationDue({ ...dueInput, notificationTime })) {
        const { kind, payload } = buildNotification({
          computed: a.computed,
          now,
          timeZone: tz,
          locale,
        });
        await deliver(userId, today, "morning", kind, payload);
      }

      // 4. The return update (v2.2): an hour before the return trip, only when the live
      //    return forecast disagrees with the frozen morning one.
      if (isReturnUpdateDue({ ...dueInput, returnTime })) {
        const stored = a.stored.get(today) ?? null;
        const kind = returnUpdate({
          stored,
          live: a.computed.returnTrip,
          threshold: a.settings.threshold,
        });
        if (kind !== null) {
          const payload = buildReturnUpdate({
            kind,
            live: a.computed.returnTrip,
            vehicle: stored?.vehicle ?? a.computed.vehicle,
            locale,
          });
          await deliver(userId, today, "return", "return_update", payload);
        }
      }
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

  /** Claims the slot, sends to every device and records the outcome. */
  async function deliver(
    userId: string,
    targetDate: LocalDate,
    slot: NotificationSlot,
    kind: NotificationKind,
    payload: PushPayload,
  ): Promise<void> {
    if (send === null) {
      summary.pushNotConfigured++;
      return;
    }
    const subs = await listSubscriptions(supabase, userId);
    if (subs.length === 0) {
      summary.noSubscription++;
      return;
    }
    const slotArg = slot === "morning" ? {} : { slot };
    if (!(await claimDay(supabase, { userId, targetDate, kind, ...slotArg })))
      return; // already sent

    let outcome: Awaited<ReturnType<typeof deliverToUser>>;
    try {
      outcome = await deliverToUser(supabase, subs, payload, send, now);
    } catch (err) {
      await finishLog(supabase, {
        userId,
        targetDate,
        ...slotArg,
        status: "failed",
        devicesSent: 0,
        now,
        error: err instanceof Error ? err.message : "send failed",
      });
      throw err;
    }
    await finishLog(supabase, {
      userId,
      targetDate,
      ...slotArg,
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
  }
}
