import { ADVISORY_THRESHOLDS } from "./advisoryThresholds";
import { riskLevelOf } from "./labels";
import { HOUR_MS } from "./tz";
import type {
  CommuteWindow,
  HourlyWeather,
  LocationKey,
  MissingBucket,
  TripAnalysis,
  Vehicle,
} from "./types";

/**
 * The rain rule's fixed amounts (plan §5.3, v2.2). Open-Meteo's probability counts any hour with
 * more than 0.1 mm anywhere in a ~25 km model cell, so a high percentage on its own often means
 * drizzle somewhere nearby. A trip is "rainy" only when the forecast also expects real rain on it.
 * Tune these after real use and record each change in the Decision Log.
 */
export const RAIN_RULE = {
  /** Expected mm over the trip that makes a probability at or above the threshold count. */
  minMm: 0.5,
  /** Expected mm over the trip that counts even below the threshold. */
  heavyMm: 2,
  /** Probability floor for the amount and thunderstorm triggers, so a lone model spike is ignored. */
  strongSignalMinRisk: 30,
} as const;

export type HighCause = "chance" | "amount" | "storm";

const index = (rows: readonly HourlyWeather[]) =>
  new Map(rows.map((r) => [r.time.getTime(), r]));

const isStormCode = (code: number | null | undefined) =>
  code != null &&
  (ADVISORY_THRESHOLDS.thunderstormCodes as readonly number[]).includes(code);

/** Fraction of an hour that bucket `label` shares with the window. Bucket T covers (T - 1h, T]. */
function overlapHours(label: number, window: CommuteWindow): number {
  const from = Math.max(label - HOUR_MS, window.start.getTime());
  const to = Math.min(label, window.end.getTime());
  return Math.max(0, to - from) / HOUR_MS;
}

/**
 * Per-trip risk (plan §5.2, v2.2) from the stored hourly rows of both locations.
 *
 * - `risk`: at each location, the mean probability of the window's buckets weighted by how much
 *   of each hour the trip covers; then the higher location (a tie goes to home). Averaging
 *   instead of taking the single worst hour keeps a bucket the trip barely touches from
 *   deciding the day.
 * - `rainMm`: at each location, each bucket's mm scaled by its overlap, summed: the rain expected
 *   during the trip itself. Then the higher location. Null if either location lacks a value.
 * - `storm`: a thunderstorm code in any bucket at either location.
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
  const weights = window.bucketTimes.map((t) =>
    overlapHours(t.getTime(), window),
  );
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const share = (i: number) =>
    totalWeight > 0 ? weights[i]! / totalWeight : 1 / weights.length;

  const missingBuckets: MissingBucket[] = [];
  let risk: number | null = null;
  let riskSource: LocationKey | null = null;
  let storm = false;
  const sums: Array<number | null> = [];

  for (const [location, rows] of byLocation) {
    let mean = 0;
    let missing = false;
    let sum: number | null = 0;
    window.bucketTimes.forEach((time, i) => {
      const row = rows.get(time.getTime());
      if (!row || row.precipitationProbability === null) {
        missingBuckets.push({ location, time });
        missing = true;
      } else {
        mean += row.precipitationProbability * share(i);
      }
      if (isStormCode(row?.weatherCode)) storm = true;
      sum =
        row?.precipitation == null || sum === null
          ? null
          : sum + row.precipitation * weights[i]!;
    });
    sums.push(sum);
    if (!missing && window.bucketTimes.length > 0) {
      const rounded = Math.round(mean);
      // Strictly greater: on a tie the earlier location (home) keeps the attribution.
      if (risk === null || rounded > risk) {
        risk = rounded;
        riskSource = location;
      }
    }
  }

  const isComplete = missingBuckets.length === 0;
  const [homeSum, workSum] = sums as [number | null, number | null];
  return {
    window,
    risk: isComplete ? risk : null,
    riskSource: isComplete ? riskSource : null,
    rainMm:
      homeSum === null || workSum === null
        ? null
        : Math.round(Math.max(homeSum, workSum) * 10) / 10,
    storm,
    riskLevel: riskLevelOf(isComplete ? risk : null),
    isComplete,
    missingBuckets,
  };
}

/**
 * Why a trip counts as rainy, or null when it does not (plan §5.3, v2.2):
 * - `storm`: a thunderstorm code, with at least `strongSignalMinRisk`.
 * - `amount`: at least `heavyMm` expected, with at least `strongSignalMinRisk`.
 * - `chance`: probability at or above the threshold and at least `minMm` expected. When the
 *   amount is unknown, the probability alone decides, as before: missing data never weakens it.
 */
export function highCause(
  trip: TripAnalysis,
  threshold: number,
): HighCause | null {
  if (!trip.isComplete || trip.risk === null) return null;
  const strong = trip.risk >= RAIN_RULE.strongSignalMinRisk;
  if (trip.storm && strong) return "storm";
  if (strong && trip.rainMm !== null && trip.rainMm >= RAIN_RULE.heavyMm)
    return "amount";
  if (
    trip.risk >= threshold &&
    (trip.rainMm === null || trip.rainMm >= RAIN_RULE.minMm)
  )
    return "chance";
  return null;
}

/** A trip counts as high only when its data is complete and `highCause` finds a reason. */
export function isHigh(trip: TripAnalysis, threshold: number): boolean {
  return highCause(trip, threshold) !== null;
}

/**
 * Probability at or above the threshold, but too little rain expected to count: the "light
 * rain" case the reason explains (pack rain gear, the motorcycle is fine).
 */
export function isLightRain(trip: TripAnalysis, threshold: number): boolean {
  return (
    trip.isComplete &&
    trip.risk !== null &&
    trip.risk >= threshold &&
    !isHigh(trip, threshold)
  );
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
