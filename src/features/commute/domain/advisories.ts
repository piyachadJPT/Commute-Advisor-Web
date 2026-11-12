import { ADVISORY_GROUPS, type AdvisoryGroup } from "./advisoryGroups";
import { isHigh } from "./analyzer";
import { ADVISORY_THRESHOLDS as T } from "./advisoryThresholds";
import { HOUR_MS, localTimeOf } from "./tz";
import type {
  Advisory,
  AdvisoryCode,
  AdvisoryLevel,
  HourlyAirQuality,
  HourlyWeather,
  LocationKey,
  TripAnalysis,
} from "./types";

const LOCATIONS: LocationKey[] = ["home", "work"]; // home first: a tie goes to home

/** Order of importance inside one level (plan §23.2). */
const PRIORITY: AdvisoryCode[] = [
  "thunderstorm",
  "heavyRain",
  "pm25",
  "heat",
  "cold",
  "lowVisibility",
  "gust",
  "wetRoad",
  "rainNearWindow",
  "darkReturn",
  "uv",
];

type Located = { location: LocationKey; row: HourlyWeather };
type Worst = { value: number; source: LocationKey };

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Worst value over the rows. Strict comparison, so the first row (home) wins a tie. */
function worst(
  rows: readonly Located[],
  pick: (r: HourlyWeather) => number | null,
  direction: "max" | "min",
): Worst | null {
  let best: Worst | null = null;
  for (const { location, row } of rows) {
    const v = pick(row);
    if (v === null) continue;
    if (
      best === null ||
      (direction === "max" ? v > best.value : v < best.value)
    ) {
      best = { value: v, source: location };
    }
  }
  return best;
}

const levelAtOrAbove = (
  v: number,
  t: { caution: number; warning: number },
): AdvisoryLevel | null =>
  v >= t.warning ? "warning" : v >= t.caution ? "caution" : null;
const levelAtOrBelow = (
  v: number,
  t: { caution: number; warning: number },
): AdvisoryLevel | null =>
  v <= t.warning ? "warning" : v <= t.caution ? "caution" : null;
const levelBelow = (
  v: number,
  t: { caution: number; warning: number },
): AdvisoryLevel | null =>
  v < t.warning ? "warning" : v < t.caution ? "caution" : null;

/**
 * Supporting notes for both trips (plan §23). Pure, and independent of the vehicle decision:
 * nothing here is an input to `decide()`.
 *
 * Only problems are reported. A missing value gives no advisory, and no advisory is never a
 * statement that conditions are fine. Values that are present are still evaluated when others
 * are missing, because a partial worst case can only understate a problem.
 */
export function computeAdvisories(input: {
  departure: TripAnalysis;
  returnTrip: TripAnalysis;
  threshold: number;
  home: readonly HourlyWeather[];
  work: readonly HourlyWeather[];
  /** Air quality the caller already judged fresh enough to use; none means no `pm25`. */
  homeAir?: readonly HourlyAirQuality[];
  workAir?: readonly HourlyAirQuality[];
  /** Groups the user turned off; `thunderstorm` and `heavyRain` are in none (plan §23.6). */
  disabledGroups?: readonly AdvisoryGroup[];
  /** °C added to the heat and cold thresholds (plan §23.6). */
  temperatureOffset?: number;
  timeZone: string;
}): Advisory[] {
  const offset = input.temperatureOffset ?? 0;
  const heatT = {
    caution: T.heat.caution + offset,
    warning: T.heat.warning + offset,
  };
  const coldT = {
    caution: T.cold.caution + offset,
    warning: T.cold.warning + offset,
  };
  const off = new Set<AdvisoryCode>(
    (input.disabledGroups ?? []).flatMap((g) => ADVISORY_GROUPS[g]),
  );
  const byLocation: Record<LocationKey, Map<number, HourlyWeather>> = {
    home: new Map(input.home.map((r) => [r.time.getTime(), r])),
    work: new Map(input.work.map((r) => [r.time.getTime(), r])),
  };
  const at = (location: LocationKey, time: Date) =>
    byLocation[location].get(time.getTime()) ?? null;
  const airByLocation: Record<LocationKey, Map<number, HourlyAirQuality>> = {
    home: new Map((input.homeAir ?? []).map((r) => [r.time.getTime(), r])),
    work: new Map((input.workAir ?? []).map((r) => [r.time.getTime(), r])),
  };

  const out: Advisory[] = [];
  for (const trip of [input.departure, input.returnTrip]) {
    const type = trip.window.type;
    const inWindow: Located[] = [];
    for (const location of LOCATIONS) {
      for (const time of trip.window.bucketTimes) {
        const row = at(location, time);
        if (row) inWindow.push({ location, row });
      }
    }
    const add = (
      code: AdvisoryCode,
      level: AdvisoryLevel | null,
      source: LocationKey,
      params: Advisory["params"],
    ) => {
      if (level) out.push({ code, level, trip: type, source, params });
    };

    // --- values from the window's own buckets -------------------------------------------
    const heat = worst(inWindow, (r) => r.apparentTemperature, "max");
    if (heat) {
      add("heat", levelAtOrAbove(heat.value, heatT), heat.source, {
        value: Math.round(heat.value),
      });
    }
    const cold = worst(inWindow, (r) => r.apparentTemperature, "min");
    if (cold) {
      add("cold", levelAtOrBelow(cold.value, coldT), cold.source, {
        value: Math.round(cold.value),
      });
    }
    const uv = worst(inWindow, (r) => r.uvIndex, "max");
    if (uv) {
      add("uv", levelAtOrAbove(uv.value, T.uv), uv.source, {
        value: Math.round(uv.value),
      });
    }
    const gust = worst(inWindow, (r) => r.windGusts, "max");
    if (gust) {
      add("gust", levelAtOrAbove(gust.value, T.gust), gust.source, {
        value: Math.round(gust.value),
      });
    }
    const vis = worst(inWindow, (r) => r.visibility, "min");
    if (vis) {
      add("lowVisibility", levelBelow(vis.value, T.lowVisibility), vis.source, {
        value: Math.round(vis.value),
      });
    }
    const rain = worst(inWindow, (r) => r.precipitation, "max");
    if (rain) {
      add("heavyRain", levelAtOrAbove(rain.value, T.heavyRain), rain.source, {
        mm: round1(rain.value),
      });
    }
    // PM2.5: the highest value over the window's buckets at either location.
    let pm: Worst | null = null;
    for (const location of LOCATIONS) {
      for (const time of trip.window.bucketTimes) {
        const v = airByLocation[location].get(time.getTime())?.pm25;
        if (v !== null && v !== undefined && (pm === null || v > pm.value)) {
          pm = { value: v, source: location };
        }
      }
    }
    if (pm) {
      add(
        "pm25",
        pm.value > T.pm25.warning
          ? "warning"
          : pm.value > T.pm25.caution
            ? "caution"
            : null,
        pm.source,
        { value: Math.round(pm.value) },
      );
    }
    const storm = inWindow.find(
      ({ row }) =>
        row.weatherCode !== null &&
        (T.thunderstormCodes as readonly number[]).includes(row.weatherCode),
    );
    if (storm) add("thunderstorm", "warning", storm.location, {});

    // --- derived from rain, only when the trip itself is not already a "car" trip --------
    const first = trip.window.bucketTimes[0];
    const last = trip.window.bucketTimes[trip.window.bucketTimes.length - 1];
    if (!isHigh(trip, input.threshold) && first && last) {
      // Wet road: rain in the two hours before the first bucket.
      let wet: Worst | null = null;
      for (const location of LOCATIONS) {
        let sum = 0;
        let seen = false;
        for (const back of [1, 2]) {
          const mm = at(
            location,
            new Date(first.getTime() - back * HOUR_MS),
          )?.precipitation;
          if (mm !== null && mm !== undefined) {
            sum += mm;
            seen = true;
          }
        }
        if (seen && (wet === null || sum > wet.value)) {
          wet = { value: sum, source: location };
        }
      }
      if (wet && wet.value + 1e-9 >= T.wetRoadMm) {
        add("wetRoad", "caution", wet.source, { mm: round1(wet.value) });
      }

      // Rain in the hour just before or just after the window.
      let near: {
        prob: number;
        source: LocationKey;
        label: Date;
        when: string;
      } | null = null;
      for (const [when, label] of [
        ["before", new Date(first.getTime() - HOUR_MS)],
        ["after", new Date(last.getTime() + HOUR_MS)],
      ] as const) {
        for (const location of LOCATIONS) {
          const p = at(location, label)?.precipitationProbability;
          if (
            p !== null &&
            p !== undefined &&
            p >= input.threshold &&
            (near === null || p > near.prob)
          ) {
            near = { prob: p, source: location, label, when };
          }
        }
      }
      if (near) {
        add("rainNearWindow", "caution", near.source, {
          when: near.when,
          hour: localTimeOf(near.label, input.timeZone),
        });
      }
    }

    // --- rain after dark on the way home ------------------------------------------------
    if (
      type === "return" &&
      trip.risk !== null &&
      trip.risk >= T.darkReturnMinRisk
    ) {
      const dark = inWindow.find(({ row }) => row.isDay === false);
      if (dark)
        add("darkReturn", "caution", dark.location, { risk: trip.risk });
    }
  }

  const rank = (a: Advisory) =>
    (a.level === "warning" ? 0 : 1000) +
    PRIORITY.indexOf(a.code) * 10 +
    (a.trip === "departure" ? 0 : 1);
  return out.filter((a) => !off.has(a.code)).sort((a, b) => rank(a) - rank(b));
}
