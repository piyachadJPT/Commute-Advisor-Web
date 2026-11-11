import { riskLevelOf } from "./labels";
import type {
  CommuteWindow,
  HourlyWeather,
  LocationKey,
  MissingBucket,
  TripAnalysis,
  Vehicle,
} from "./types";

const index = (rows: readonly HourlyWeather[]) =>
  new Map(rows.map((r) => [r.time.getTime(), r]));

/**
 * Per-trip risk (plan §5.2) from the stored hourly rows of both locations.
 *
 * A trip is complete only if every selected bucket exists at both locations with a non-null
 * probability. Missing data is never read as 0%: an incomplete trip has `risk: null`.
 */
export function analyzeTrip(
  window: CommuteWindow,
  home: readonly HourlyWeather[],
  work: readonly HourlyWeather[],
): TripAnalysis {
  const byLocation: Array<[LocationKey, Map<number, HourlyWeather>]> = [
    ["home", index(home)],
    ["work", index(work)],
  ];

  const missingBuckets: MissingBucket[] = [];
  let risk: number | null = null;
  let riskSource: LocationKey | null = null;
  const sums: Array<number | null> = [];

  for (const [location, rows] of byLocation) {
    let sum: number | null = 0;
    for (const time of window.bucketTimes) {
      const row = rows.get(time.getTime());
      if (!row || row.precipitationProbability === null) {
        missingBuckets.push({ location, time });
      } else if (risk === null || row.precipitationProbability > risk) {
        // Strictly greater: on a tie the earlier location (home) keeps the attribution.
        risk = row.precipitationProbability;
        riskSource = location;
      }
      sum =
        row?.precipitation == null || sum === null
          ? null
          : sum + row.precipitation;
    }
    sums.push(sum);
  }

  const isComplete = missingBuckets.length === 0;
  const [homeSum, workSum] = sums as [number | null, number | null];
  return {
    window,
    risk: isComplete ? risk : null,
    riskSource: isComplete ? riskSource : null,
    rainMm:
      homeSum === null || workSum === null ? null : Math.max(homeSum, workSum),
    riskLevel: riskLevelOf(isComplete ? risk : null),
    isComplete,
    missingBuckets,
  };
}

/** A trip counts as high only when its data is complete and its risk reaches the threshold. */
export function isHigh(trip: TripAnalysis, threshold: number): boolean {
  return trip.isComplete && trip.risk !== null && trip.risk >= threshold;
}

/** Primary rule (plan §5.3). Any known high risk wins; missing data never becomes a motorcycle. */
export function decide(
  dep: TripAnalysis,
  ret: TripAnalysis,
  threshold: number,
): Vehicle {
  if (isHigh(dep, threshold) || isHigh(ret, threshold)) return "car";
  if (!dep.isComplete || !ret.isComplete) return "unknown";
  return "motorcycle";
}
