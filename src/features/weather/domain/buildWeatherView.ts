import { mapWindow, windowHours } from "@/features/commute/domain/windowMapper";
import { addDays, zonedToInstant } from "@/features/commute/domain/tz";
import type {
  CommuteSettings,
  CommuteType,
  HourlyAirQuality,
  HourlyWeather,
  LocalDate,
  LocalTime,
} from "@/features/commute/domain/types";

export type WeatherHour = {
  /** Bucket label hour, 1..24 (24 is the next day's 00:00). The row covers the hour ending here. */
  hour: number;
  time: Date;
  hasRow: boolean;
  probability: number | null;
  precipitation: number | null;
  temperature: number | null;
  humidity: number | null;
  weatherCode: number | null;
  windSpeed: number | null;
  apparentTemperature: number | null;
  uvIndex: number | null;
  windGusts: number | null;
  /** PM2.5 in µg/m³ from the air-quality rows; a model estimate. */
  pm25: number | null;
  /** The commute window this bucket belongs to, if any (departure wins an overlap). */
  trip: CommuteType | null;
};

export type WeatherWindow = {
  type: CommuteType;
  startHour: number;
  endHour: number;
};

export type WeatherView = {
  date: LocalDate;
  hours: WeatherHour[]; // always 24 entries
  windows: WeatherWindow[];
  /** Highest probability and the label hour it occurs at, or null with no data. */
  peak: { probability: number; hour: number } | null;
};

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * One location, one local day, for the Weather screen (plan §11.3). Labels 01:00 ... 24:00:
 * label T covers (T - 1h, T], so a day's hours run from its own 00:00 to the next 00:00.
 * Pure: the rows are whatever the loader fetched.
 */
export function buildWeatherView(input: {
  rows: readonly HourlyWeather[];
  /** Air quality that is fresh enough to show; none means no PM2.5 column. */
  air?: readonly HourlyAirQuality[];
  date: LocalDate;
  settings: CommuteSettings;
}): WeatherView {
  const { rows, date, settings } = input;
  const tz = settings.timeZone;
  const byTime = new Map(rows.map((r) => [r.time.getTime(), r]));
  const airByTime = new Map(
    (input.air ?? []).map((r) => [r.time.getTime(), r]),
  );

  const windows = (
    [
      ["departure", settings.departureTime],
      ["return", settings.returnTime],
    ] as Array<[CommuteType, LocalTime]>
  ).map(([type, start]) => {
    const w = mapWindow(type, date, start, settings.durationMinutes, tz);
    return { type, window: w, ...windowHours(w, tz) };
  });

  const tripAt = new Map<number, CommuteType>();
  for (const w of [...windows].reverse()) {
    // Reversed so the departure window (inserted last) wins an overlap.
    for (const t of w.window.bucketTimes) tripAt.set(t.getTime(), w.type);
  }

  const hours: WeatherHour[] = Array.from({ length: 24 }, (_, i) => {
    const hour = i + 1;
    const time =
      hour === 24
        ? zonedToInstant(addDays(date, 1), "00:00" as LocalTime, tz)
        : zonedToInstant(date, `${pad(hour)}:00` as LocalTime, tz);
    const row = byTime.get(time.getTime());
    return {
      hour,
      time,
      hasRow: row !== undefined,
      probability: row?.precipitationProbability ?? null,
      precipitation: row?.precipitation ?? null,
      temperature: row?.temperature ?? null,
      humidity: row?.humidity ?? null,
      weatherCode: row?.weatherCode ?? null,
      windSpeed: row?.windSpeed ?? null,
      apparentTemperature: row?.apparentTemperature ?? null,
      uvIndex: row?.uvIndex ?? null,
      windGusts: row?.windGusts ?? null,
      pm25: airByTime.get(time.getTime())?.pm25 ?? null,
      trip: tripAt.get(time.getTime()) ?? null,
    };
  });

  let peak: WeatherView["peak"] = null;
  for (const h of hours) {
    if (
      h.probability !== null &&
      (peak === null || h.probability > peak.probability)
    ) {
      peak = { probability: h.probability, hour: h.hour };
    }
  }

  return {
    date,
    hours,
    windows: windows.map(({ type, startHour, endHour }) => ({
      type,
      startHour,
      endHour,
    })),
    peak,
  };
}
