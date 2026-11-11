// Pure core of the history backfill (no network, no database), so it can be tested.
// See scripts/backfill-history.ts for what the script does and why.
import { computeRecommendation } from "@/features/commute/domain/recommend";
import { toSnapshot } from "@/features/commute/domain/locking";
import { isCommuteDay } from "@/features/commute/domain/schedule";
import {
  addDays,
  localDateOf,
  zonedToInstant,
} from "@/features/commute/domain/tz";
import type {
  CommuteSettings,
  HourlyWeather,
  LocalDate,
  LocalTime,
  LocationKey,
} from "@/features/commute/domain/types";
import type { HourlyRow } from "@/features/forecast/data/openMeteoClient";

/** Marker stored in `reason_params`, so backfilled rows can be recognised and removed. */
export const BACKFILL_MARKER = "backfill";

/**
 * Open-Meteo's archive has the rain that FELL each hour but no forecast probability. This turns
 * the rain into a stand-in for the chance of rain the app would have shown:
 *  - a dry hour starts at 5% and rises to at most 25% as the air gets more humid;
 *  - rain in this hour (and half of each neighbouring hour) lifts it towards 95%:
 *    0.1 mm is about 29%, 0.5 mm about 55%, 1 mm about 74%, 2 mm about 89%.
 * Null stays null: an hour with no data is never read as dry (plan §5.2, §15).
 */
export function rainProbability(
  previousMm: number | null,
  mm: number | null,
  nextMm: number | null,
  humidity: number | null,
): number | null {
  if (mm === null) return null;
  const wet = mm + 0.5 * ((previousMm ?? 0) + (nextMm ?? 0));
  if (wet <= 0) {
    const damp =
      humidity === null ? 0 : Math.min(1, Math.max(0, (humidity - 60) / 40));
    return Math.round(5 + damp * 20);
  }
  return Math.min(95, Math.round(20 + 75 * (1 - Math.exp(-wet / 0.8))));
}

/**
 * Rows → the domain rows the engine reads, with the probability filled in. Archive rows have no
 * probability, so it is estimated from the rain. Rows from the live forecast already carry a real
 * one: with `keepProvidedProbability` it is kept, and only a missing value is estimated.
 */
export function toDomainRows(
  rows: readonly HourlyRow[],
  location: LocationKey,
  options: { keepProvidedProbability?: boolean } = {},
): HourlyWeather[] {
  const sorted = [...rows].sort((a, b) =>
    a.forecast_time.localeCompare(b.forecast_time),
  );
  return sorted.map((r, i) => ({
    time: new Date(r.forecast_time),
    location,
    temperature: r.temperature,
    humidity: r.humidity,
    precipitationProbability:
      options.keepProvidedProbability && r.precipitation_probability !== null
        ? r.precipitation_probability
        : rainProbability(
            sorted[i - 1]?.precipitation ?? null,
            r.precipitation,
            sorted[i + 1]?.precipitation ?? null,
            r.humidity,
          ),
    precipitation: r.precipitation,
    rain: r.rain,
    showers: r.showers,
    weatherCode: r.weather_code,
    windSpeed: r.wind_speed,
  }));
}

/** One `daily_recommendations` row, minus `user_id` (the script adds it). */
export type BackfillRecord = {
  recommendation_date: string;
  vehicle: string;
  departure_risk: number | null;
  return_risk: number | null;
  return_risk_latest: number | null;
  departure_risk_source: string | null;
  return_risk_source: string | null;
  departure_rain_mm: number | null;
  return_rain_mm: number | null;
  reason_code: string;
  reason_params: Record<string, unknown>;
  data_complete: true;
  forecast_fetched_at: string;
  locked_at: string;
  created_at: string;
  updated_at: string;
};

/** Distance in km between two points on the Earth (haversine). */
export function distanceKm(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** First and last local date to backfill: `months` back from today, up to today itself. */
export function backfillRange(now: Date, months: number, timeZone: string) {
  const today = localDateOf(now, timeZone);
  return {
    from: addDays(today, -Math.round(months * 30.4)),
    to: today,
  };
}

/**
 * What the app would have decided on each commute day, run through the real engine. Each day is
 * evaluated at its departure start, locked then, with the forecast "fetched" at 06:00 local.
 * Days off, skipped days and days whose weather is missing or incomplete are left out: the
 * backfill never invents an "unknown" and never fills a gap.
 */
export function planBackfill(input: {
  from: LocalDate;
  to: LocalDate;
  settings: CommuteSettings;
  home: readonly HourlyWeather[];
  work: readonly HourlyWeather[];
  skipped: ReadonlySet<string>;
  /** A day whose departure has not started yet is left for the app to lock itself. */
  now: Date;
}): { records: BackfillRecord[]; commuteDays: number; incompleteDays: number } {
  const { from, to, settings, home, work, skipped, now } = input;
  const tz = settings.timeZone;
  const records: BackfillRecord[] = [];
  let commuteDays = 0;
  let incompleteDays = 0;

  for (let date = from; date <= to; date = addDays(date, 1)) {
    if (!isCommuteDay(date, settings.commuteDays) || skipped.has(date))
      continue;
    const departureStart = zonedToInstant(date, settings.departureTime, tz);
    if (departureStart.getTime() > now.getTime()) continue; // not locked yet: not history
    commuteDays++;

    const fetchedAt = zonedToInstant(date, "06:00" as LocalTime, tz);
    const computed = computeRecommendation({
      date,
      settings,
      home,
      work,
      homeFetchedAt: fetchedAt,
      workFetchedAt: fetchedAt,
      now: departureStart,
    });
    if (!computed.dataComplete) {
      incompleteDays++;
      continue;
    }

    const s = toSnapshot(computed);
    records.push({
      recommendation_date: date,
      vehicle: s.vehicle,
      departure_risk: s.departureRisk,
      return_risk: s.returnRisk,
      return_risk_latest: s.returnRisk,
      departure_risk_source: s.departureRiskSource,
      return_risk_source: s.returnRiskSource,
      departure_rain_mm: s.departureRainMm,
      return_rain_mm: s.returnRainMm,
      reason_code: s.reason.code,
      reason_params: { ...s.reason.params, [BACKFILL_MARKER]: true },
      data_complete: true,
      forecast_fetched_at: fetchedAt.toISOString(),
      locked_at: departureStart.toISOString(),
      created_at: departureStart.toISOString(),
      updated_at: departureStart.toISOString(),
    });
  }
  return { records, commuteDays, incompleteDays };
}
