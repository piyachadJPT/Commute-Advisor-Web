import { z } from "zod";
import {
  OpenMeteoError,
  fetchOpenMeteoJson,
  localToInstant,
  numIn,
  type FetchJsonOptions,
} from "./openMeteoClient";

export const AIR_QUALITY_URL =
  "https://air-quality-api.open-meteo.com/v1/air-quality";

/**
 * Open-Meteo Air Quality DTO (plan §23.5). Same leniency as the forecast DTO: every value is
 * nullable, a variable may be missing, and an array may be shorter than `time`.
 */
const numberArray = z.array(z.number().nullable()).optional();
export const airQualityResponseSchema = z.object({
  utc_offset_seconds: z.number().int(),
  hourly: z.object({
    time: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)),
    pm2_5: numberArray,
    pm10: numberArray,
  }),
});
export type AirQualityResponse = z.infer<typeof airQualityResponseSchema>;

/** One hourly row, in the shape `save_air_quality_batch` expects in `p_rows`. */
export type AirQualityRow = {
  forecast_time: string; // ISO 8601 UTC instant
  pm2_5: number | null; // µg/m³
  pm10: number | null; // µg/m³
};

export function buildAirQualityUrl(latitude: number, longitude: number) {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    hourly: "pm2_5,pm10",
    forecast_days: "3",
    timezone: "Asia/Bangkok",
  });
  return `${AIR_QUALITY_URL}?${params.toString()}`;
}

// Concentrations in µg/m³. Values far above any real reading are treated as bad data.
const toConcentration = numIn(0, 2000);

/**
 * Maps the hourly arrays to rows. pm2_5 and pm10 are instant values at the label time
 * (re-verified against open-meteo.com/en/docs/air-quality-api on 2026-11-12). Null, missing or
 * out-of-range values become null, never 0.
 */
export function mapAirQuality(data: AirQualityResponse): AirQualityRow[] {
  const { hourly, utc_offset_seconds: offset } = data;
  if (hourly.time.length === 0) {
    throw new OpenMeteoError("invalid", "Open-Meteo returned no hourly rows");
  }
  const seen = new Set<string>();
  return hourly.time.map((local, i) => {
    const forecast_time = localToInstant(local, offset);
    if (seen.has(forecast_time)) {
      throw new OpenMeteoError(
        "invalid",
        "Duplicate forecast time in response",
      );
    }
    seen.add(forecast_time);
    return {
      forecast_time,
      pm2_5: toConcentration(hourly.pm2_5?.[i]),
      pm10: toConcentration(hourly.pm10?.[i]),
    };
  });
}

export type FetchAirQualityOptions = FetchJsonOptions & {
  latitude: number;
  longitude: number;
};

/** Fetches the 3-day hourly PM2.5 and PM10 for one location. Server-side only. */
export async function fetchAirQuality(
  opts: FetchAirQualityOptions,
): Promise<AirQualityRow[]> {
  const json = await fetchOpenMeteoJson(
    buildAirQualityUrl(opts.latitude, opts.longitude),
    opts,
  );
  const parsed = airQualityResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new OpenMeteoError(
      "invalid",
      "Open-Meteo response did not match the expected shape",
      200,
    );
  }
  return mapAirQuality(parsed.data);
}
