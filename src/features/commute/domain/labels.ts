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
