import {
  HOURLY_VARIABLES,
  errorBodySchema,
  forecastResponseSchema,
  type ForecastResponse,
} from "./openMeteoSchema";

export const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
export const FETCH_TIMEOUT_MS = 15_000;
export const MAX_ATTEMPTS = 3;
const BACKOFF_BASE_MS = 1_000;
const BACKOFF_MAX_MS = 10_000;

/** One hourly row, in the shape `save_forecast_batch` expects in `p_rows` (plan §6.9). */
export type HourlyRow = {
  forecast_time: string; // ISO 8601 UTC instant: the bucket label time
  temperature: number | null;
  humidity: number | null;
  precipitation_probability: number | null;
  precipitation: number | null;
  rain: number | null;
  showers: number | null;
  weather_code: number | null;
  wind_speed: number | null;
};

export type OpenMeteoErrorKind =
  "rate_limited" | "http" | "network" | "timeout" | "invalid";

export class OpenMeteoError extends Error {
  constructor(
    readonly kind: OpenMeteoErrorKind,
    message: string,
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = "OpenMeteoError";
  }
}

export type FetchForecastOptions = {
  latitude: number;
  longitude: number;
  fetchImpl?: typeof fetch;
  /** Injectable so tests do not really wait. */
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
  maxAttempts?: number;
};

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export function buildForecastUrl(latitude: number, longitude: number): string {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    hourly: HOURLY_VARIABLES.join(","),
    forecast_days: "3",
    timezone: "Asia/Bangkok",
  });
  return `${FORECAST_URL}?${params.toString()}`;
}

/** Seconds from a Retry-After header, or null. HTTP-date form is ignored. */
function retryAfterMs(res: Response): number | null {
  const raw = res.headers.get("retry-after");
  if (!raw || !/^\d+$/.test(raw)) return null;
  return Number(raw) * 1000;
}

/**
 * Fetches the 3-day hourly forecast for one location. Server-side only (plan §4.5).
 *
 * - Each attempt times out after 15 s (`fetch` has no separate connect timeout).
 * - HTTP 429 is retried with exponential backoff, at most `maxAttempts` attempts in total.
 *   Other failures are not retried: the next scheduler tick retries them (plan §4.6).
 * - Anything that is not a valid forecast throws, so the caller never overwrites a good cache
 *   with bad data.
 */
export async function fetchForecast(
  opts: FetchForecastOptions,
): Promise<HourlyRow[]> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? defaultSleep;
  const maxAttempts = opts.maxAttempts ?? MAX_ATTEMPTS;
  const url = buildForecastUrl(opts.latitude, opts.longitude);

  for (let attempt = 1; ; attempt++) {
    let res: Response;
    try {
      res = await fetchImpl(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(opts.timeoutMs ?? FETCH_TIMEOUT_MS),
      });
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      if (name === "TimeoutError" || name === "AbortError") {
        throw new OpenMeteoError("timeout", "Open-Meteo request timed out");
      }
      throw new OpenMeteoError("network", "Open-Meteo request failed");
    }

    if (res.status === 429) {
      if (attempt >= maxAttempts) {
        throw new OpenMeteoError(
          "rate_limited",
          `Open-Meteo rate limit (HTTP 429) after ${attempt} attempts`,
          429,
        );
      }
      const wait = retryAfterMs(res) ?? BACKOFF_BASE_MS * 2 ** (attempt - 1);
      await sleep(Math.min(wait, BACKOFF_MAX_MS));
      continue;
    }

    if (!res.ok) {
      let reason = "";
      try {
        const body = errorBodySchema.safeParse(await res.json());
        if (body.success) reason = `: ${body.data.reason}`;
      } catch {
        // Body is not JSON; the status code is enough.
      }
      throw new OpenMeteoError(
        "http",
        `Open-Meteo HTTP ${res.status}${reason}`.slice(0, 300),
        res.status,
      );
    }

    let json: unknown;
    try {
      json = await res.json();
    } catch {
      throw new OpenMeteoError(
        "invalid",
        "Open-Meteo returned malformed JSON",
        res.status,
      );
    }
    const parsed = forecastResponseSchema.safeParse(json);
    if (!parsed.success) {
      throw new OpenMeteoError(
        "invalid",
        "Open-Meteo response did not match the expected shape",
        res.status,
      );
    }
    return mapForecast(parsed.data);
  }
}

const LOCAL_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** "2026-11-11T09:00" at offset +25200 s is 2026-11-11T02:00:00.000Z. Host timezone is not used. */
function localToInstant(local: string, utcOffsetSeconds: number): string {
  const m = LOCAL_TIME.exec(local);
  if (!m) throw new OpenMeteoError("invalid", "Unparseable forecast time");
  const [, y, mo, d, h, mi] = m.map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const ms = Date.UTC(y, mo - 1, d, h, mi) - utcOffsetSeconds * 1000;
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) {
    throw new OpenMeteoError("invalid", "Unparseable forecast time");
  }
  return date.toISOString();
}

const intIn = (min: number, max: number) => (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) || v < min || v > max ? null : Math.round(v);
const numIn = (min: number, max: number) => (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) || v < min || v > max ? null : v;

const toProbability = intIn(0, 100);
const toHumidity = intIn(0, 100);
const toWeatherCode = intIn(0, 99);
const toTemperature = numIn(-100, 70);
const toAmount = numIn(0, 1000); // mm
const toWind = numIn(0, 500); // km/h

/**
 * Maps the hourly arrays to rows.
 *
 * "Preceding hour" semantics (re-verified against open-meteo.com/en/docs on 2026-11-11):
 *  - precipitation, rain, showers: "Preceding hour sum"; precipitation_probability: "Preceding
 *    hour probability". The row labelled T therefore covers (T - 1h, T]. The 09:00 row is the
 *    08:00-09:00 hour. §5.1 window mapping depends on this.
 *  - temperature_2m, relative_humidity_2m, wind_speed_10m, weather_code are "Instant" values
 *    at T.
 * Open-Meteo labels times in the requested timezone with a fixed `utc_offset_seconds`; they are
 * converted to UTC instants here and stored as timestamptz.
 *
 * Values that are null, missing (short or absent array) or out of range become null. Null is
 * never turned into 0 (plan §5.2, §15).
 */
export function mapForecast(data: ForecastResponse): HourlyRow[] {
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
      temperature: toTemperature(hourly.temperature_2m?.[i]),
      humidity: toHumidity(hourly.relative_humidity_2m?.[i]),
      precipitation_probability: toProbability(
        hourly.precipitation_probability?.[i],
      ),
      precipitation: toAmount(hourly.precipitation?.[i]),
      rain: toAmount(hourly.rain?.[i]),
      showers: toAmount(hourly.showers?.[i]),
      weather_code: toWeatherCode(hourly.weather_code?.[i]),
      wind_speed: toWind(hourly.wind_speed_10m?.[i]),
    };
  });
}
