import { computeRecommendation } from "@/features/commute/domain/recommend";
import {
  returnWarning,
  type StoredRecommendation,
} from "@/features/commute/domain/locking";
import { riskLevelOf } from "@/features/commute/domain/labels";
import {
  isCommuteDay,
  nextCommuteDay,
} from "@/features/commute/domain/schedule";
import { windowHours } from "@/features/commute/domain/windowMapper";
import {
  addDays,
  localDateOf,
  localTimeOf,
  weekdayOf,
  zonedToInstant,
} from "@/features/commute/domain/tz";
import type {
  Advisory,
  HourlyAirQuality,
  CommuteSettings,
  ComputedRecommendation,
  HourlyWeather,
  Instant,
  LocalDate,
  LocalTime,
  LocationKey,
  TripAnalysis,
  Vehicle,
} from "@/features/commute/domain/types";
import {
  FIRST_HOUR,
  HOURLY_COUNT,
  type DashboardView,
  type HourlySeries,
  type NextDayView,
  type NowView,
  type TripView,
  type WeekDayView,
} from "../view";

export type BuildInput = {
  now: Instant;
  settings: CommuteSettings;
  /** Display names, already localized and with fallbacks applied. */
  names: { home: string; work: string };
  home: readonly HourlyWeather[];
  work: readonly HourlyWeather[];
  homeFetchedAt: Instant | null;
  workFetchedAt: Instant | null;
  /** Air quality the loader judged fresh enough to show (plan §23.5). */
  homeAir?: readonly HourlyAirQuality[];
  workAir?: readonly HourlyAirQuality[];
  skipped: ReadonlySet<string>;
  target: LocalDate;
  /** The analysis of `target`, already computed (the loader persists it). */
  computed: ComputedRecommendation;
  /** Stored recommendations for the visible week and the target day, by local date. */
  stored: ReadonlyMap<string, StoredRecommendation>;
};

const NOON = "12:00" as LocalTime;
const NOW_MAX_DISTANCE_MS = 2 * 3_600_000; // a "now" row further away than this is not shown
const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Builds the Dashboard view model from forecasts, settings and stored recommendations (plan
 * §11.2). Pure: `now` is a parameter. Locked days show the frozen snapshot for the departure
 * trip, the verdict and the reason, while the return trip keeps following the live forecast
 * (§5.7).
 */
export function buildDashboardView(input: BuildInput): DashboardView {
  const { now, settings, names, computed, target, stored, skipped } = input;
  const tz = settings.timeZone;
  const today = localDateOf(now, tz);
  const locked = stored.get(target)?.lockedAt ? stored.get(target)! : null;

  const hasRows = (date: string) =>
    [...input.home, ...input.work].some(
      (r) => localDateOf(r.time, tz) === date,
    );
  const recommend = (date: LocalDate) =>
    computeRecommendation({
      date,
      settings,
      home: input.home,
      work: input.work,
      homeFetchedAt: input.homeFetchedAt,
      workFetchedAt: input.workFetchedAt,
      now,
    });
  const at = (date: LocalDate) => zonedToInstant(date, NOON, tz);

  // --- headline: frozen once locked --------------------------------------------------
  const vehicle = locked ? locked.vehicle : computed.vehicle;
  const reason = locked ? locked.reason : computed.reason;
  const advisoriesOf = (trip: "departure" | "return", from: Advisory[]) =>
    from.filter((a) => a.trip === trip);
  // The departure notes freeze with the verdict; the return notes follow the live forecast,
  // like the return risk (plan §23.4).
  const departure = locked
    ? tripView(
        computed.departure,
        tz,
        advisoriesOf("departure", locked.advisories),
        {
          risk: locked.departureRisk,
          riskSource: locked.departureRiskSource,
          rainMm: locked.departureRainMm,
        },
      )
    : tripView(
        computed.departure,
        tz,
        advisoriesOf("departure", computed.advisories),
      );
  const returnTrip = tripView(
    computed.returnTrip,
    tz,
    advisoriesOf("return", computed.advisories),
  ); // always live

  const liveReturn = computed.returnTrip.risk;
  const warning =
    locked &&
    returnWarning({
      vehicle,
      liveReturnRisk: liveReturn,
      threshold: settings.threshold,
    })
      ? liveReturn
      : null;

  // --- skipped today ----------------------------------------------------------------
  const returnEnd =
    zonedToInstant(today, settings.returnTime, tz).getTime() +
    settings.durationMinutes * 60_000;
  const skippedToday =
    isCommuteDay(today, settings.commuteDays) &&
    skipped.has(today) &&
    now.getTime() < returnEnd;

  // --- upcoming commute days inside the forecast ------------------------------------
  const nextDays: NextDayView[] = [];
  let cursor: LocalDate = target;
  for (let i = 0; i < 3; i++) {
    const next = nextCommuteDay(cursor, settings.commuteDays, skipped);
    if (next === null) break;
    cursor = next;
    if (!hasRows(next)) {
      nextDays.push({
        date: at(next),
        vehicle: null,
        departureRisk: null,
        returnRisk: null,
      });
    } else {
      const r = recommend(next);
      nextDays.push({
        date: at(next),
        vehicle: r.vehicle,
        departureRisk: r.departure.risk,
        returnRisk: r.returnTrip.risk,
      });
    }
  }

  // --- this week ----------------------------------------------------------------------
  const weekStart = addDays(today, -(weekdayOf(today) - 1));
  const week: WeekDayView[] = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(weekStart, i);
    if (!isCommuteDay(date, settings.commuteDays)) continue;
    const kind = date < today ? "past" : date === today ? "today" : "future";
    week.push({ date: at(date), kind, ...weekCell(date, kind) });
  }

  function weekCell(
    date: LocalDate,
    kind: WeekDayView["kind"],
  ): { vehicle: Vehicle | null; maxRisk: number | null } {
    if (kind !== "future") {
      const s = date === target ? (locked ?? null) : (stored.get(date) ?? null);
      if (date === target && !locked) {
        return {
          vehicle: computed.vehicle,
          maxRisk: maxRisk(computed.departure.risk, liveReturn),
        };
      }
      return s
        ? {
            vehicle: s.vehicle,
            maxRisk: maxRisk(s.departureRisk, s.returnRisk),
          }
        : { vehicle: null, maxRisk: null };
    }
    if (date === target) {
      return {
        vehicle: computed.vehicle,
        maxRisk: maxRisk(computed.departure.risk, liveReturn),
      };
    }
    if (!hasRows(date)) return { vehicle: null, maxRisk: null };
    const r = recommend(date);
    return {
      vehicle: r.vehicle,
      maxRisk: maxRisk(r.departure.risk, r.returnTrip.risk),
    };
  }

  return {
    targetDate: at(target),
    isToday: target === today,
    route: names,
    vehicle,
    reason,
    departure,
    returnTrip,
    threshold: settings.threshold,
    fetchedAt: computed.forecastFetchedAt,
    stale: computed.freshness === "stale",
    windows: {
      departure: windowHours(computed.departure.window, tz),
      return: windowHours(computed.returnTrip.window, tz),
    },
    hourly: {
      home: hourlySeries(input.home, target, tz),
      work: hourlySeries(input.work, target, tz),
    },
    now: [
      nowView("home", names.home, input.home, now, input.homeAir ?? []),
      nowView("work", names.work, input.work, now, input.workAir ?? []),
    ],
    nextDays,
    week,
    skippedToday,
    canSkip: target === today,
    returnWarning: warning,
  };
}

function maxRisk(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.max(a, b);
}

function tripView(
  trip: TripAnalysis,
  tz: string,
  advisories: Advisory[],
  frozen?: {
    risk: number | null;
    riskSource: LocationKey | null;
    rainMm: number | null;
  },
): TripView {
  const risk = frozen ? frozen.risk : trip.risk;
  return {
    type: trip.window.type,
    window: `${trip.window.localStart}–${trip.window.localEnd}`,
    risk,
    riskLevel: frozen ? riskLevelOf(frozen.risk) : trip.riskLevel,
    riskSource: frozen ? frozen.riskSource : trip.riskSource,
    rainMm: frozen ? frozen.rainMm : trip.rainMm,
    missingHours: [
      ...new Set(trip.missingBuckets.map((b) => localTimeOf(b.time, tz))),
    ],
    advisories,
  };
}

/** Rain probability at the labels 05:00 ... 22:00 of `date`; null where there is no row. */
function hourlySeries(
  rows: readonly HourlyWeather[],
  date: LocalDate,
  tz: string,
): HourlySeries {
  const byTime = new Map(
    rows.map((r) => [r.time.getTime(), r.precipitationProbability]),
  );
  return Array.from({ length: HOURLY_COUNT }, (_, i) => {
    const label = zonedToInstant(
      date,
      `${pad(FIRST_HOUR + i)}:00` as LocalTime,
      tz,
    );
    return byTime.get(label.getTime()) ?? null;
  });
}

function nowView(
  location: LocationKey,
  placeName: string,
  rows: readonly HourlyWeather[],
  now: Instant,
  air: readonly HourlyAirQuality[],
): NowView {
  let best: HourlyWeather | null = null;
  let bestDistance = Infinity;
  for (const r of rows) {
    const d = Math.abs(r.time.getTime() - now.getTime());
    if (d < bestDistance) {
      best = r;
      bestDistance = d;
    }
  }
  const row =
    best !== null && bestDistance <= NOW_MAX_DISTANCE_MS ? best : null;
  return {
    location,
    placeName,
    temperature: row?.temperature == null ? null : Math.round(row.temperature),
    weatherCode: row?.weatherCode ?? null,
    rainProbability: row?.precipitationProbability ?? null,
    humidity: row?.humidity ?? null,
    windSpeed: row?.windSpeed == null ? null : Math.round(row.windSpeed),
    apparentTemperature:
      row?.apparentTemperature == null
        ? null
        : Math.round(row.apparentTemperature),
    uvIndex: row?.uvIndex == null ? null : Math.round(row.uvIndex),
    pm25: nearestPm25(air, now),
  };
}

/** PM2.5 of the air row nearest to `now`, rounded; null when none is within the "now" distance. */
function nearestPm25(
  rows: readonly HourlyAirQuality[],
  now: Instant,
): number | null {
  let best: HourlyAirQuality | null = null;
  let bestDistance = Infinity;
  for (const r of rows) {
    const d = Math.abs(r.time.getTime() - now.getTime());
    if (d < bestDistance) {
      best = r;
      bestDistance = d;
    }
  }
  return best !== null &&
    bestDistance <= NOW_MAX_DISTANCE_MS &&
    best.pm25 !== null
    ? Math.round(best.pm25)
    : null;
}
