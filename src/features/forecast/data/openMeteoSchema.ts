import { z } from "zod";

/**
 * Open-Meteo forecast DTO (plan §4.2, §7). The DTO is kept separate from the domain and DB
 * row types; mapping happens in `openMeteoClient.ts`.
 *
 * The docs do not say whether hourly arrays can contain null, so every value is nullable, a
 * whole variable may be missing, and an array may be shorter than `time`. Only `time` and
 * `utc_offset_seconds` are required: without them no value can be placed on the timeline.
 */
const numberArray = z.array(z.number().nullable()).optional();

export const HOURLY_VARIABLES = [
  "temperature_2m",
  "relative_humidity_2m",
  "precipitation_probability",
  "precipitation",
  "rain",
  "showers",
  "weather_code",
  "wind_speed_10m",
] as const;

export const forecastResponseSchema = z.object({
  utc_offset_seconds: z.number().int(),
  hourly: z.object({
    // "2026-11-11T09:00": local wall-clock time, no offset (offset is utc_offset_seconds).
    time: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)),
    temperature_2m: numberArray,
    relative_humidity_2m: numberArray,
    precipitation_probability: numberArray,
    precipitation: numberArray,
    rain: numberArray,
    showers: numberArray,
    weather_code: numberArray,
    wind_speed_10m: numberArray,
  }),
});
export type ForecastResponse = z.infer<typeof forecastResponseSchema>;

// Open-Meteo errors are HTTP 400 with {error: true, reason: string}.
export const errorBodySchema = z.object({
  error: z.literal(true),
  reason: z.string(),
});

export const geocodingResponseSchema = z.object({
  // Empty fields are omitted, and the docs do not say whether "no match" omits `results`.
  results: z
    .array(
      z.object({
        id: z.number().int(),
        name: z.string(),
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        country: z.string().optional(),
        admin1: z.string().optional(),
      }),
    )
    .optional(),
});
