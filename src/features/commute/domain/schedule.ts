import { addDays, localDateOf, weekdayOf, zonedToInstant } from "./tz";
import type { CommuteSettings, LocalDate } from "./types";

/** Bitmask values for `settings.commute_days`. */
export const COMMUTE_DAYS = {
  mon: 1,
  tue: 2,
  wed: 4,
  thu: 8,
  fri: 16,
  sat: 32,
  sun: 64,
} as const;

export type ScheduleSettings = Pick<
  CommuteSettings,
  "commuteDays" | "returnTime" | "durationMinutes" | "timeZone"
>;

export function isCommuteDay(date: LocalDate, commuteDays: number): boolean {
  return (commuteDays & (1 << (weekdayOf(date) - 1))) !== 0;
}

/** First commute day strictly after `from` that is not skipped; null if none within `maxDays`. */
export function nextCommuteDay(
  from: LocalDate,
  commuteDays: number,
  skipped: ReadonlySet<string>,
  maxDays = 14,
): LocalDate | null {
  for (let i = 1; i <= maxDays; i++) {
    const day = addDays(from, i);
    if (isCommuteDay(day, commuteDays) && !skipped.has(day)) return day;
  }
  return null;
}

/**
 * The next relevant commute day (plan §5.6): today while it is a commute day, not skipped, and
 * `now` is before the end of today's return window; otherwise the next commute day that is
 * not skipped. "Today" is the local date in the settings' timezone, not the UTC date.
 */
export function targetDate(input: {
  now: Date;
  settings: ScheduleSettings;
  skipped: ReadonlySet<string>;
}): LocalDate | null {
  const { now, settings, skipped } = input;
  const today = localDateOf(now, settings.timeZone);

  if (isCommuteDay(today, settings.commuteDays) && !skipped.has(today)) {
    const returnEnd =
      zonedToInstant(today, settings.returnTime, settings.timeZone).getTime() +
      settings.durationMinutes * 60_000;
    if (now.getTime() < returnEnd) return today;
  }
  return nextCommuteDay(today, settings.commuteDays, skipped);
}
