import type { DataFreshness, Instant } from "./types";

const STALE_AFTER_MS = 6 * 3_600_000;

/**
 * Plan §5.5. `none` if either location was never fetched; `stale` if either last successful
 * fetch is MORE than 6 hours old (exactly 6 hours is still fresh).
 */
export function freshnessOf(
  homeFetchedAt: Instant | null,
  workFetchedAt: Instant | null,
  now: Instant,
): DataFreshness {
  if (homeFetchedAt === null || workFetchedAt === null) return "none";
  const oldest = Math.min(homeFetchedAt.getTime(), workFetchedAt.getTime());
  return now.getTime() - oldest > STALE_AFTER_MS ? "stale" : "fresh";
}

/** The older of two fetch times, or null if either is missing. */
export function olderOf(a: Instant | null, b: Instant | null): Instant | null {
  if (a === null || b === null) return null;
  return a.getTime() <= b.getTime() ? a : b;
}
