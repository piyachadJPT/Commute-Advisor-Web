import { PM25_BAND_EDGES } from "./advisoryThresholds";
import type { RainRiskLevel } from "./types";

/**
 * Fixed risk bands (plan §5.4). They do not move with the user's threshold, so a label can
 * disagree with the vehicle (45% is "low" but a car at a 40% threshold); the reason states the
 * threshold in that case.
 */
export function riskLevelOf(probability: number | null): RainRiskLevel {
  if (probability === null) return "unknown";
  if (probability >= 70) return "veryHigh";
  if (probability >= 50) return "high";
  if (probability >= 20) return "low";
  return "veryLow";
}

export type Pm25Band =
  "veryGood" | "good" | "moderate" | "unhealthySensitive" | "unhealthy";

/** Thai PCD PM2.5 band of a concentration in µg/m³ (plan §23.5). Edges belong to the lower band. */
export function pm25BandOf(value: number): Pm25Band {
  const [a, b, c, d] = PM25_BAND_EDGES;
  return value <= a
    ? "veryGood"
    : value <= b
      ? "good"
      : value <= c
        ? "moderate"
        : value <= d
          ? "unhealthySensitive"
          : "unhealthy";
}
