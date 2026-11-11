import type {
  ComputedRecommendation,
  Instant,
  LocationKey,
  Reason,
  Vehicle,
} from "./types";

/** The frozen part of a day's recommendation (plan §6.3). */
export type RecommendationSnapshot = {
  vehicle: Vehicle;
  departureRisk: number | null;
  returnRisk: number | null;
  departureRiskSource: LocationKey | null;
  returnRiskSource: LocationKey | null;
  departureRainMm: number | null;
  returnRainMm: number | null;
  reason: Reason;
  dataComplete: boolean;
  forecastFetchedAt: Instant | null;
};

export type StoredRecommendation = RecommendationSnapshot & {
  lockedAt: Instant | null;
  /** Live return risk, updated after the lock. */
  returnRiskLatest: number | null;
};

export function toSnapshot(c: ComputedRecommendation): RecommendationSnapshot {
  return {
    vehicle: c.vehicle,
    departureRisk: c.departure.risk,
    returnRisk: c.returnTrip.risk,
    departureRiskSource: c.departure.riskSource,
    returnRiskSource: c.returnTrip.riskSource,
    departureRainMm: c.departure.rainMm,
    returnRainMm: c.returnTrip.rainMm,
    reason: c.reason,
    dataComplete: c.dataComplete,
    forecastFetchedAt: c.forecastFetchedAt,
  };
}

export type ResolvedWrite =
  /** Locked already: touch nothing but the live return risk (the DB trigger enforces this too). */
  | { action: "update_latest"; returnRiskLatest: number | null }
  | {
      action: "write";
      snapshot: RecommendationSnapshot;
      /** Set when the departure window has started: this write locks the day. */
      lockedAt: Instant | null;
      returnRiskLatest: number | null;
    };

/**
 * Decides what to persist for a day (plan §5.7). Idempotent.
 * - Already locked: only `returnRiskLatest` follows the fresh analysis. A settings change or a
 *   new forecast never alters the frozen columns.
 * - Not locked and `now >= departureStart`: write the fresh analysis and lock it now. This is
 *   also how a missed tick is repaired, and how a day with no record yet is created locked.
 * - Otherwise write the fresh analysis unlocked.
 */
export function resolveRecommendation(input: {
  computed: ComputedRecommendation;
  existing: StoredRecommendation | null;
  now: Instant;
  departureStart: Instant;
}): ResolvedWrite {
  const { computed, existing, now, departureStart } = input;

  if (existing?.lockedAt) {
    return {
      action: "update_latest",
      returnRiskLatest: computed.returnTrip.risk,
    };
  }
  const lock = now.getTime() >= departureStart.getTime();
  return {
    action: "write",
    snapshot: toSnapshot(computed),
    lockedAt: lock ? now : null,
    returnRiskLatest: lock ? computed.returnTrip.risk : null,
  };
}

/** Warn when a locked motorcycle day's live return risk has reached the threshold (§5.7). */
export function returnWarning(input: {
  vehicle: Vehicle;
  liveReturnRisk: number | null;
  threshold: number;
}): boolean {
  return (
    input.vehicle === "motorcycle" &&
    input.liveReturnRisk !== null &&
    input.liveReturnRisk >= input.threshold
  );
}
