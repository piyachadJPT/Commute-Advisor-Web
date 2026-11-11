import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { LocationKey } from "@/features/commute/domain/types";
import type { SyncTrigger } from "../domain/refreshPolicy";
import type { HourlyRow } from "./openMeteoClient";

type Client = SupabaseClient<Database>;

export type SaveBatchInput = {
  userId: string;
  locationKey: LocationKey;
  latitude: number;
  longitude: number;
  fetchedAt: Date;
  rows: HourlyRow[]; // empty: only the sync log is written (failed or skipped sync)
  log: {
    trigger: SyncTrigger;
    status: "success" | "failed" | "skipped";
    responseCode?: number | null;
    errorMessage?: string | null;
  };
};

export type SaveBatchResult =
  | { ok: true; saved: number }
  | { ok: false; locationChanged: boolean; message: string };

/**
 * Wraps `save_forecast_batch`: rows and sync log are written in one transaction. No business
 * rules here (plan §8.2). The function refuses a batch for a location that was changed while
 * the fetch was in flight (SQLSTATE CA001), reported as `locationChanged`.
 */
export async function saveForecastBatch(
  supabase: Client,
  input: SaveBatchInput,
): Promise<SaveBatchResult> {
  const { data, error } = await supabase.rpc("save_forecast_batch", {
    p_user_id: input.userId,
    p_location_key: input.locationKey,
    p_latitude: input.latitude,
    p_longitude: input.longitude,
    p_fetched_at: input.fetchedAt.toISOString(),
    p_rows: input.rows,
    p_log: {
      trigger: input.log.trigger,
      status: input.log.status,
      response_code: input.log.responseCode ?? null,
      error_message: input.log.errorMessage ?? null,
    },
  });
  if (error) {
    return {
      ok: false,
      locationChanged: error.code === "CA001",
      message: error.message,
    };
  }
  return { ok: true, saved: data ?? 0 };
}

/** `fetched_at` of the newest successful sync for one location, or null if there never was one. */
export async function getLastSuccessfulFetch(
  supabase: Client,
  userId: string,
  locationKey: LocationKey,
): Promise<Date | null> {
  const { data, error } = await supabase
    .from("forecast_sync_logs")
    .select("fetched_at")
    .eq("user_id", userId)
    .eq("location_key", locationKey)
    .eq("status", "success")
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error)
    throw new Error(`forecast_sync_logs read failed: ${error.message}`);
  return data ? new Date(data.fetched_at) : null;
}

/** Stored hourly rows for one location with `from <= forecast_time < to`, oldest first. */
export async function getHourlyForecasts(
  supabase: Client,
  userId: string,
  locationKey: LocationKey,
  from: Date,
  to: Date,
) {
  const { data, error } = await supabase
    .from("hourly_forecasts")
    .select("*")
    .eq("user_id", userId)
    .eq("location_key", locationKey)
    .gte("forecast_time", from.toISOString())
    .lt("forecast_time", to.toISOString())
    .order("forecast_time", { ascending: true });
  if (error) throw new Error(`hourly_forecasts read failed: ${error.message}`);
  return data;
}
