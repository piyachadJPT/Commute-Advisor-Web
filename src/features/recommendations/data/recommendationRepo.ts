import type { SupabaseClient } from "@supabase/supabase-js";
import type { Json } from "@/lib/database.types";
import type { Database } from "@/lib/database.types";
import type {
  LocalDate,
  LocationKey,
  Reason,
  Vehicle,
} from "@/features/commute/domain/types";
import type {
  ResolvedWrite,
  StoredRecommendation,
} from "@/features/commute/domain/locking";

type Client = SupabaseClient<Database>;
type Row = Database["public"]["Tables"]["daily_recommendations"]["Row"];

const REASON_CODES = new Set([
  "departureHigh",
  "returnHigh",
  "bothLow",
  "incomplete",
]);

function toStored(row: Row): StoredRecommendation {
  if (!REASON_CODES.has(row.reason_code)) {
    throw new Error(
      `Unknown reason_code in daily_recommendations: ${row.reason_code}`,
    );
  }
  return {
    vehicle: row.vehicle as Vehicle,
    departureRisk: row.departure_risk,
    returnRisk: row.return_risk,
    departureRiskSource: row.departure_risk_source as LocationKey | null,
    returnRiskSource: row.return_risk_source as LocationKey | null,
    departureRainMm: row.departure_rain_mm,
    returnRainMm: row.return_rain_mm,
    reason: { code: row.reason_code, params: row.reason_params } as Reason,
    dataComplete: row.data_complete,
    forecastFetchedAt: row.forecast_fetched_at
      ? new Date(row.forecast_fetched_at)
      : null,
    lockedAt: row.locked_at ? new Date(row.locked_at) : null,
    returnRiskLatest: row.return_risk_latest,
  };
}

/** Stored recommendations with `from <= date <= to`, keyed by local date. */
export async function getRecommendations(
  supabase: Client,
  userId: string,
  from: LocalDate,
  to: LocalDate,
): Promise<Map<string, StoredRecommendation>> {
  const { data, error } = await supabase
    .from("daily_recommendations")
    .select("*")
    .eq("user_id", userId)
    .gte("recommendation_date", from)
    .lte("recommendation_date", to);
  if (error)
    throw new Error(`daily_recommendations read failed: ${error.message}`);
  return new Map(data.map((r) => [r.recommendation_date, toStored(r)]));
}

/**
 * Applies a `ResolvedWrite` (plan §5.7). A locked day only ever gets `return_risk_latest`:
 * the database trigger rejects anything else, and this never tries.
 */
export async function persistRecommendation(
  supabase: Client,
  userId: string,
  date: LocalDate,
  write: ResolvedWrite,
  now: Date,
): Promise<void> {
  if (write.action === "update_latest") {
    const { error } = await supabase
      .from("daily_recommendations")
      .update({
        return_risk_latest: write.returnRiskLatest,
        updated_at: now.toISOString(),
      })
      .eq("user_id", userId)
      .eq("recommendation_date", date);
    if (error)
      throw new Error(`daily_recommendations update failed: ${error.message}`);
    return;
  }

  const s = write.snapshot;
  const { error } = await supabase.from("daily_recommendations").upsert(
    {
      user_id: userId,
      recommendation_date: date,
      vehicle: s.vehicle,
      departure_risk: s.departureRisk,
      return_risk: s.returnRisk,
      return_risk_latest: write.returnRiskLatest,
      departure_risk_source: s.departureRiskSource,
      return_risk_source: s.returnRiskSource,
      departure_rain_mm: s.departureRainMm,
      return_rain_mm: s.returnRainMm,
      reason_code: s.reason.code,
      reason_params: s.reason.params as NonNullable<Json>,
      data_complete: s.dataComplete,
      forecast_fetched_at: s.forecastFetchedAt?.toISOString() ?? null,
      locked_at: write.lockedAt?.toISOString() ?? null,
      updated_at: now.toISOString(),
    },
    { onConflict: "user_id,recommendation_date" },
  );
  if (error)
    throw new Error(`daily_recommendations upsert failed: ${error.message}`);
}
