import type {
  HourlyWeather,
  LocationKey,
} from "@/features/commute/domain/types";
import type { Database } from "@/lib/database.types";

type Row = Database["public"]["Tables"]["hourly_forecasts"]["Row"];

/** Database row → domain type. The only place the two shapes meet (plan §7). */
export function toHourlyWeather(row: Row): HourlyWeather {
  return {
    time: new Date(row.forecast_time),
    location: row.location_key as LocationKey,
    temperature: row.temperature,
    humidity: row.humidity,
    precipitationProbability: row.precipitation_probability,
    precipitation: row.precipitation,
    rain: row.rain,
    showers: row.showers,
    weatherCode: row.weather_code,
    windSpeed: row.wind_speed,
    apparentTemperature: row.apparent_temperature,
    uvIndex: row.uv_index,
    windGusts: row.wind_gusts,
    visibility: row.visibility,
    isDay: row.is_day,
  };
}

/** Newest `fetched_at` among the rows, i.e. the last successful sync. Null with no rows. */
export function latestFetch(rows: readonly Row[]): Date | null {
  let best: number | null = null;
  for (const r of rows) {
    const t = new Date(r.fetched_at).getTime();
    if (best === null || t > best) best = t;
  }
  return best === null ? null : new Date(best);
}
