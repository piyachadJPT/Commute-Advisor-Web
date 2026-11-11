import { isCommuteDay } from "@/features/commute/domain/schedule";
import { zonedToInstant } from "@/features/commute/domain/tz";
import type { LocalDate, LocalTime } from "@/features/commute/domain/types";

const MIN = 60_000;
/** Two ticks wide, so one missed tick does not lose the notification (plan §13.1). */
export const NOTIFICATION_WINDOW_MS = 20 * MIN;

type Input = {
  now: Date;
  today: LocalDate;
  notificationTime: LocalTime;
  timeZone: string;
};

/**
 * True on a commute day that is not skipped, from `notification_time` up to (not including) 20
 * minutes later (plan §13.1). The claim in `notification_logs` makes the send once-only; this
 * only decides whether to try.
 */
export function isNotificationDue(
  input: Input & { commuteDays: number; skipped: ReadonlySet<string> },
): boolean {
  const { now, today, notificationTime, timeZone, commuteDays, skipped } =
    input;
  if (!isCommuteDay(today, commuteDays) || skipped.has(today)) return false;
  const since =
    now.getTime() - zonedToInstant(today, notificationTime, timeZone).getTime();
  return since >= 0 && since < NOTIFICATION_WINDOW_MS;
}

/**
 * True for the tick 20-30 minutes before `notification_time`, which forces a forecast refresh
 * so the morning message is built from fresh data (plan §13.2). With ticks every 10 minutes
 * exactly one qualifies: at 06:00 for a 06:30 notification (30 minutes before is included, 20
 * is not). If two did, the second would be skipped by the 15-minute rule anyway.
 */
export function isPreNotificationRefresh(input: Input): boolean {
  const { now, today, notificationTime, timeZone } = input;
  const before =
    zonedToInstant(today, notificationTime, timeZone).getTime() - now.getTime();
  return before > 20 * MIN && before <= 30 * MIN;
}
