import {
  HOUR_MS,
  floorToLocalHour,
  localParts,
  localTimeOf,
  zonedToInstant,
} from "./tz";
import type {
  CommuteType,
  CommuteWindow,
  Instant,
  LocalDate,
  LocalTime,
} from "./types";

/**
 * Maps a commute window to the hourly buckets it overlaps (plan §5.1).
 *
 * Open-Meteo labels precipitation by the END of its hour: bucket T covers (T - 1h, T]. A
 * bucket is used when it overlaps the window [start, end):
 *
 *   include T  <=>  (T - 1h) < end  AND  T > start
 *
 * The first label after `start` is always the next whole local hour, so buckets are walked
 * from there. Labels are whole LOCAL hours, which also holds for half-hour timezone offsets.
 * Works on instants, so a window that crosses midnight needs no special case.
 */
export function mapWindow(
  type: CommuteType,
  date: LocalDate,
  start: LocalTime,
  durationMinutes: number,
  timeZone: string,
): CommuteWindow {
  const startInstant = zonedToInstant(date, start, timeZone);
  const endInstant = new Date(
    startInstant.getTime() + durationMinutes * 60_000,
  );

  const bucketTimes: Instant[] = [];
  let label = floorToLocalHour(startInstant, timeZone).getTime() + HOUR_MS;
  while (label - HOUR_MS < endInstant.getTime()) {
    bucketTimes.push(new Date(label));
    label += HOUR_MS;
  }

  return {
    type,
    start: startInstant,
    end: endInstant,
    localStart: start,
    localEnd: localTimeOf(endInstant, timeZone),
    bucketTimes,
  };
}

/**
 * Where a window sits on a local-time chart: fractional start and end hours (8:20 is 8.333)
 * and the local hour of each bucket label it uses (08:20-09:20 -> 9 and 10). Labels after
 * midnight continue past 24 (23:30-00:30 -> 24 and 25), so they stay in order.
 */
export function windowHours(
  window: CommuteWindow,
  timeZone: string,
): { startHour: number; endHour: number; buckets: number[] } {
  const start = localParts(window.start, timeZone);
  const startHour = start.hour + start.minute / 60;
  const firstLabel =
    localParts(floorToLocalHour(window.start, timeZone), timeZone).hour + 1;
  return {
    startHour,
    endHour:
      startHour + (window.end.getTime() - window.start.getTime()) / HOUR_MS,
    buckets: window.bucketTimes.map((_, i) => firstLabel + i),
  };
}
