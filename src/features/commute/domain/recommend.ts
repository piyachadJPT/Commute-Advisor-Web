import { computeAdvisories } from "./advisories";
import { analyzeTrip, decide } from "./analyzer";
import { freshnessOf, olderOf } from "./freshness";
import { deriveReason } from "./reasons";
import type {
  CommuteSettings,
  ComputedRecommendation,
  HourlyWeather,
  Instant,
  LocalDate,
} from "./types";
import { mapWindow } from "./windowMapper";

/**
 * The whole engine as one pure function (plan §5): same forecasts, settings, date and `now`
 * always give the same result. Never calls Date.now() or new Date() with no argument.
 */
export function computeRecommendation(input: {
  date: LocalDate;
  settings: CommuteSettings;
  home: readonly HourlyWeather[];
  work: readonly HourlyWeather[];
  homeFetchedAt: Instant | null;
  workFetchedAt: Instant | null;
  now: Instant;
}): ComputedRecommendation {
  const { date, settings, home, work } = input;
  const { timeZone, threshold, durationMinutes } = settings;

  const departure = analyzeTrip(
    mapWindow(
      "departure",
      date,
      settings.departureTime,
      durationMinutes,
      timeZone,
    ),
    home,
    work,
  );
  const returnTrip = analyzeTrip(
    mapWindow("return", date, settings.returnTime, durationMinutes, timeZone),
    home,
    work,
  );

  return {
    date,
    vehicle: decide(departure, returnTrip, threshold),
    departure,
    returnTrip,
    reason: deriveReason(departure, returnTrip, threshold, timeZone),
    forecastFetchedAt: olderOf(input.homeFetchedAt, input.workFetchedAt),
    freshness: freshnessOf(input.homeFetchedAt, input.workFetchedAt, input.now),
    dataComplete: departure.isComplete && returnTrip.isComplete,
    // Reports only; the vehicle above is decided by rain alone (plan §23.1).
    advisories: computeAdvisories({
      departure,
      returnTrip,
      threshold,
      home,
      work,
      timeZone,
    }),
  };
}
