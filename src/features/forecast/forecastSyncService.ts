import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { LocationKey } from "@/features/commute/domain/types";
import { getUserLocations } from "@/features/settings/data/settingsRepo";
import {
  fetchAirQuality,
  type FetchAirQualityOptions,
} from "./data/airQualityClient";
import { saveAirQualityBatch } from "./data/airQualityRepo";
import { getLastSuccessfulFetch, saveForecastBatch } from "./data/forecastRepo";
import {
  OpenMeteoError,
  fetchForecast,
  type FetchForecastOptions,
} from "./data/openMeteoClient";
import { decideRefresh, type SyncTrigger } from "./domain/refreshPolicy";

export type LocationSyncStatus =
  "success" | "skipped" | "failed" | "location_changed" | "not_configured";

export type LocationSyncResult = {
  key: LocationKey;
  status: LocationSyncStatus;
  records: number;
  error?: string;
};

export type SyncDeps = {
  supabase: SupabaseClient<Database>;
  /** Injectable for tests; defaults to the real client. */
  fetchForecast?: (o: FetchForecastOptions) => ReturnType<typeof fetchForecast>;
  fetchAirQuality?: (
    o: FetchAirQualityOptions,
  ) => ReturnType<typeof fetchAirQuality>;
  fetchOptions?: Pick<
    FetchForecastOptions,
    "fetchImpl" | "sleep" | "timeoutMs" | "maxAttempts"
  >;
};

/**
 * Refreshes the forecast of both of a user's locations (plan §4.6, §8.3).
 *
 * - Each location is synced on its own: a failure at one never stops the other, and one
 *   location's error never aborts the call.
 * - Rows are only written after a response parsed and validated. A failed sync writes just a
 *   `failed` log row (empty batch), so a good cache is never overwritten.
 * - Pass a user-scoped client from a Server Action, or the service-role client from a job.
 * - A `skipped` log row is written only for manual and pre-notification triggers. Scheduled
 *   ticks skip most locations most of the time, and a row per no-op would only be noise.
 */
export async function syncUserForecasts(
  deps: SyncDeps,
  input: { userId: string; trigger: SyncTrigger; now: Date },
): Promise<LocationSyncResult[]> {
  const { supabase } = deps;
  const { userId, trigger, now } = input;
  const doFetch = deps.fetchForecast ?? fetchForecast;
  const doFetchAir = deps.fetchAirQuality ?? fetchAirQuality;

  const settings = await getUserLocations(supabase, userId);
  const configured = new Map(settings?.locations.map((l) => [l.key, l]));
  const results: LocationSyncResult[] = [];

  for (const key of ["home", "work"] as const) {
    const location = configured.get(key);
    if (!location || !settings) {
      results.push({ key, status: "not_configured", records: 0 });
      continue;
    }

    try {
      const lastSuccessAt = await getLastSuccessfulFetch(supabase, userId, key);
      const decision = decideRefresh({
        lastSuccessAt,
        now,
        trigger,
        timeZone: settings.timeZone,
      });
      const base = {
        userId,
        locationKey: key,
        latitude: location.latitude,
        longitude: location.longitude,
        fetchedAt: now,
      };

      if (!decision.refresh) {
        if (trigger !== "scheduled") {
          await saveForecastBatch(supabase, {
            ...base,
            rows: [],
            log: { trigger, status: "skipped" },
          });
        }
        results.push({ key, status: "skipped", records: 0 });
        continue;
      }

      let rows;
      try {
        rows = await doFetch({
          latitude: location.latitude,
          longitude: location.longitude,
          ...deps.fetchOptions,
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Forecast fetch failed";
        await saveForecastBatch(supabase, {
          ...base,
          rows: [],
          log: {
            trigger,
            status: "failed",
            responseCode: err instanceof OpenMeteoError ? err.status : null,
            errorMessage: message,
          },
        });
        results.push({ key, status: "failed", records: 0, error: message });
        continue;
      }

      const saved = await saveForecastBatch(supabase, {
        ...base,
        rows,
        log: { trigger, status: "success", responseCode: 200 },
      });
      if (saved.ok) {
        results.push({ key, status: "success", records: saved.saved });
      } else if (saved.locationChanged) {
        // The user moved this location while we were fetching. Drop the batch; the next sync
        // fetches the new coordinates.
        results.push({
          key,
          status: "location_changed",
          records: 0,
          error: saved.message,
        });
      } else {
        results.push({
          key,
          status: "failed",
          records: 0,
          error: saved.message,
        });
      }
    } catch (err) {
      // Unexpected (e.g. database unreachable). Keep going with the other location.
      results.push({
        key,
        status: "failed",
        records: 0,
        error: err instanceof Error ? err.message : "Unexpected sync error",
      });
    }
  }

  // Air quality comes from a different source, so it is synced after the forecast, on its own
  // refresh clock, and can never change a forecast result or throw (plan §23.5).
  if (settings) {
    for (const key of ["home", "work"] as const) {
      const location = configured.get(key);
      if (!location) continue;
      await syncAirQuality(deps, doFetchAir, {
        userId,
        trigger,
        now,
        key,
        latitude: location.latitude,
        longitude: location.longitude,
        timeZone: settings.timeZone,
      });
    }
  }
  return results;
}

/** One location's air quality. Failures are logged with source `air_quality`, never thrown. */
async function syncAirQuality(
  deps: SyncDeps,
  doFetch: NonNullable<SyncDeps["fetchAirQuality"]>,
  input: {
    userId: string;
    trigger: SyncTrigger;
    now: Date;
    key: LocationKey;
    latitude: number;
    longitude: number;
    timeZone: string;
  },
): Promise<void> {
  const { supabase } = deps;
  const { userId, trigger, now, key, latitude, longitude } = input;
  const base = {
    userId,
    locationKey: key,
    latitude,
    longitude,
    fetchedAt: now,
  };
  try {
    const decision = decideRefresh({
      lastSuccessAt: await getLastSuccessfulFetch(
        supabase,
        userId,
        key,
        "air_quality",
      ),
      now,
      trigger,
      timeZone: input.timeZone,
    });
    if (!decision.refresh) {
      if (trigger !== "scheduled") {
        await saveAirQualityBatch(supabase, {
          ...base,
          rows: [],
          log: { trigger, status: "skipped" },
        });
      }
      return;
    }

    let rows;
    try {
      rows = await doFetch({ latitude, longitude, ...deps.fetchOptions });
    } catch (err) {
      await saveAirQualityBatch(supabase, {
        ...base,
        rows: [],
        log: {
          trigger,
          status: "failed",
          responseCode: err instanceof OpenMeteoError ? err.status : null,
          errorMessage:
            err instanceof Error ? err.message : "Air quality fetch failed",
        },
      });
      return;
    }
    await saveAirQualityBatch(supabase, {
      ...base,
      rows,
      log: { trigger, status: "success", responseCode: 200 },
    });
  } catch {
    // Database trouble on the air-quality side only; the next tick tries again.
  }
}
