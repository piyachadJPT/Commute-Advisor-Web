import type { IconName } from "@/components/icon";

export type ConditionKey =
  | "clear"
  | "partlyCloudy"
  | "overcast"
  | "fog"
  | "drizzle"
  | "rain"
  | "showers"
  | "thunder";

/** WMO weather code → message key and icon (Open-Meteo `weather_code`). */
export function condition(code: number): { key: ConditionKey; icon: IconName } {
  if (code === 0) return { key: "clear", icon: "sunny" };
  if (code <= 2) return { key: "partlyCloudy", icon: "partlyCloudyDay" };
  if (code === 3) return { key: "overcast", icon: "cloud" };
  if (code === 45 || code === 48) return { key: "fog", icon: "foggy" };
  if (code >= 51 && code <= 57) return { key: "drizzle", icon: "rainyLight" };
  if (code >= 80 && code <= 82) return { key: "showers", icon: "rainy" };
  if (code >= 95) return { key: "thunder", icon: "thunderstorm" };
  return { key: "rain", icon: "rainy" };
}
