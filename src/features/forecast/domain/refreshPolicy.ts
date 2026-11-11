// Forecast refresh policy (plan §4.6, §13.2). Pure: every input, including `now`, is a parameter.

export type SyncTrigger = "scheduled" | "pre_notification" | "manual";

export const MIN_REFRESH_AGE_MS = 15 * 60_000;
const DAY_INTERVAL_MS = 60 * 60_000;
const NIGHT_INTERVAL_MS = 3 * 60 * 60_000;
// Scheduler ticks are 10 minutes apart and jitter, so a forecast that is 55 minutes old at one
// tick would otherwise wait for the next one and make "hourly" drift to ~70 minutes. Half a
// tick of tolerance keeps the real cadence at 60 minutes.
export const TICK_TOLERANCE_MS = 5 * 60_000;
const DAY_START_HOUR = 5; // inclusive
const DAY_END_HOUR = 20; // exclusive: 20:00 sharp already uses the 3-hour cadence

export type RefreshDecision =
  { refresh: true } | { refresh: false; reason: "fresh_enough" | "not_due" };

/** Hour of day (0-23) in `timeZone`, independent of the host timezone. */
export function localHour(now: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = parts.find((p) => p.type === "hour")?.value;
  return Number(hour);
}

/**
 * @param lastSuccessAt fetched_at of the last successful sync for this location, or null.
 */
export function decideRefresh(input: {
  lastSuccessAt: Date | null;
  now: Date;
  trigger: SyncTrigger;
  timeZone: string;
}): RefreshDecision {
  const { lastSuccessAt, now, trigger, timeZone } = input;
  if (lastSuccessAt === null) return { refresh: true };

  const age = now.getTime() - lastSuccessAt.getTime();
  // Under 15 minutes old: skip for every trigger, scheduled and manual alike (§4.6).
  // A negative age (clock skew) counts as fresh too.
  if (age < MIN_REFRESH_AGE_MS)
    return { refresh: false, reason: "fresh_enough" };

  // Manual refresh and the forced pre-notification refresh only need the 15-minute rule.
  if (trigger !== "scheduled") return { refresh: true };

  const hour = localHour(now, timeZone);
  const interval =
    hour >= DAY_START_HOUR && hour < DAY_END_HOUR
      ? DAY_INTERVAL_MS
      : NIGHT_INTERVAL_MS;
  return age >= interval - TICK_TOLERANCE_MS
    ? { refresh: true }
    : { refresh: false, reason: "not_due" };
}
