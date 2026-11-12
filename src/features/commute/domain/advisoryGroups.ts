import type { AdvisoryCode } from "./types";

/**
 * The switches in Settings → Advisories (plan §23.6). `thunderstorm` and `heavyRain` belong to
 * no group, so they cannot be turned off.
 */
export const ADVISORY_GROUPS = {
  heatCold: ["heat", "cold"],
  sun: ["uv"],
  windVisibility: ["gust", "lowVisibility"],
  rainExtras: ["wetRoad", "rainNearWindow", "darkReturn"],
  airQuality: ["pm25"],
} as const satisfies Record<string, readonly AdvisoryCode[]>;

export type AdvisoryGroup = keyof typeof ADVISORY_GROUPS;

/** Same names as the keys above; the migration's check lists them too. */
export const ADVISORY_GROUP_NAMES = [
  "heatCold",
  "sun",
  "windVisibility",
  "rainExtras",
  "airQuality",
] as const satisfies readonly AdvisoryGroup[];

/** Temperature sensitivity range in °C (plan §23.6). */
export const TEMPERATURE_OFFSET_MIN = -3;
export const TEMPERATURE_OFFSET_MAX = 3;
