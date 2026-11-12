import type { HourlyWeather } from "@/features/commute/domain/types";
import type { LocationKey } from "@/features/commute/domain/types";

export const TZ = "Asia/Bangkok";

/** An instant from a Bangkok wall-clock time (Bangkok is UTC+7, no DST). */
export const bkk = (date: string, time: string) =>
  new Date(`${date}T${time}:00+07:00`);

export const iso = (ds: Date[]) => ds.map((d) => d.toISOString());

type Hourly = Partial<
  Record<string, { prob: number | null; mm?: number | null }>
>;

/**
 * Hourly rows for one location on `date`, keyed by bucket label ("09:00"). A key that is
 * absent produces no row at all (forecast does not cover it); `prob: null` produces a row with
 * a null probability.
 */
export function series(
  location: LocationKey,
  date: string,
  byLabel: Hourly,
): HourlyWeather[] {
  return Object.entries(byLabel).map(([label, v]) => ({
    time: bkk(date, label),
    location,
    temperature: 28,
    humidity: 70,
    precipitationProbability: v!.prob,
    precipitation: v!.mm === undefined ? 0 : v!.mm,
    rain: 0,
    showers: 0,
    weatherCode: 3,
    windSpeed: 5,
    apparentTemperature: null,
    uvIndex: null,
    windGusts: null,
    visibility: null,
    isDay: null,
  }));
}

import { computeRecommendation } from "@/features/commute/domain/recommend";
import { asLocalDate, asLocalTime } from "@/features/commute/domain/tz";
import type { CommuteSettings } from "@/features/commute/domain/types";

export const DATE = "2026-11-11"; // Wednesday

export const settings: CommuteSettings = {
  departureTime: asLocalTime("08:20"),
  returnTime: asLocalTime("18:00"),
  durationMinutes: 60,
  threshold: 50,
  commuteDays: 31,
  timeZone: TZ,
};

type Probs = Record<string, number | null | undefined>; // label -> prob; undefined = no row

const toSeries = (location: LocationKey, probs: Probs) =>
  series(
    location,
    DATE,
    Object.fromEntries(
      Object.entries(probs)
        .filter(([, p]) => p !== undefined)
        .map(([label, p]) => [label, { prob: p as number | null }]),
    ),
  );

/** Departure buckets are 09:00 and 10:00; return bucket is 19:00. */
export function compute(
  p: {
    home?: Probs;
    work?: Probs;
  },
  over: Partial<CommuteSettings> = {},
  now = bkk(DATE, "06:00"),
  fetched: { home: Date | null; work: Date | null } = {
    home: bkk(DATE, "05:50"),
    work: bkk(DATE, "05:50"),
  },
) {
  return computeRecommendation({
    date: asLocalDate(DATE),
    settings: { ...settings, ...over },
    home: toSeries("home", p.home ?? {}),
    work: toSeries("work", p.work ?? {}),
    homeFetchedAt: fetched.home,
    workFetchedAt: fetched.work,
    now,
  });
}
