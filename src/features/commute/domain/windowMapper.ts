import { HOUR_MS, floorToLocalHour, localTimeOf, zonedToInstant } from "./tz";
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
