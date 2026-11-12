import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { LocationKey } from "@/features/commute/domain/types";
import type { SyncTrigger } from "../domain/refreshPolicy";
import type { AirQualityRow } from "./airQualityClient";

type Client = SupabaseClient<Database>;

export type SaveAirQualityInput = {
  userId: string;
  locationKey: LocationKey;
  latitude: number;
  longitude: number;
  fetchedAt: Date;
  rows: AirQualityRow[]; // empty: only the sync log is written (failed or skipped sync)
  log: {
    trigger: SyncTrigger;
    status: "success" | "failed" | "skipped";
    responseCode?: number | null;
    errorMessage?: string | null;
  };
};

export type SaveAirQualityResult =
  | { ok: true; saved: number }
  | { ok: false; locationChanged: boolean; message: string };

/**
 * Wraps `save_air_quality_batch`: rows and the sync log (source `air_quality`) are written in
 * one transaction. No business rules here (plan §8.2).
 */
export async function saveAirQualityBatch(
  supabase: Client,
  input: SaveAirQualityInput,
): Promise<SaveAirQualityResult> {
  const { data, error } = await supabase.rpc("save_air_quality_batch", {
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

/** Stored hourly rows for one location with `from <= forecast_time < to`, oldest first. */
export async function getHourlyAirQuality(
  supabase: Client,
  userId: string,
  locationKey: LocationKey,
  from: Date,
  to: Date,
) {
  const { data, error } = await supabase
    .from("hourly_air_quality")
    .select("*")
    .eq("user_id", userId)
    .eq("location_key", locationKey)
    .gte("forecast_time", from.toISOString())
    .lt("forecast_time", to.toISOString())
    .order("forecast_time", { ascending: true });
  if (error)
    throw new Error(`hourly_air_quality read failed: ${error.message}`);
  return data;
}
