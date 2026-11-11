import type { Vehicle } from "@/features/commute/domain/types";

/** What the sky is doing, grouped from WMO `weather_code` (Open-Meteo) and the temperature. */
export type SkyState =
  | "clear"
  | "partly"
  | "overcast"
  | "fog"
  | "drizzle"
  | "rain"
  | "downpour"
  | "storm"
  | "sunshower" // rain while the sun is out: shows a rainbow
  | "hot"; // clear and hot
export type Daypart = "dawn" | "day" | "dusk" | "night";

export type Scene = { daypart: Daypart; sky: SkyState };

/**
 * Which ink palette sits on the sky (`data-sky` in globals.css): dark ink on bright skies,
 * light ink on dark ones, and a softer pair for grey skies.
 */
export type InkTone = "moto" | "car" | "mist";

const TIME_ZONE = "Asia/Bangkok"; // fixed in v2.0 (plan §2)
const HOT_FROM = 35; // °C

/** Local hour (0–23) in Bangkok. */
export function bangkokHour(now: Date): number {
  const h = new Intl.DateTimeFormat("en-GB", {
    hour: "numeric",
    hourCycle: "h23",
    timeZone: TIME_ZONE,
  }).format(now);
  return Number(h);
}

/** Dawn 05:00–06:59, day to 16:59, dusk 17:00–18:59, night otherwise. */
export function daypartAt(now: Date): Daypart {
  const h = bangkokHour(now);
  if (h >= 5 && h < 7) return "dawn";
  if (h >= 7 && h < 17) return "day";
  if (h >= 17 && h < 19) return "dusk";
  return "night";
}

function skyFromCode(
  code: number,
  daypart: Daypart,
  temp: number | null,
): SkyState {
  if (code <= 1) {
    return daypart === "day" && temp !== null && temp >= HOT_FROM
      ? "hot"
      : "clear";
  }
  if (code === 2) return "partly";
  if (code === 3) return "overcast";
  if (code === 45 || code === 48) return "fog";
  if (code >= 51 && code <= 57) return "drizzle";
  if (code >= 95) return "storm";
  if (code === 65 || code === 67 || code === 82) return "downpour";
  if (code === 80 && daypart !== "night") return "sunshower";
  return "rain";
}

/** Without a live weather code, fall back on what the verdict implies. */
const SKY_FOR_VEHICLE: Record<Vehicle, SkyState> = {
  car: "rain",
  motorcycle: "partly",
  unknown: "fog",
};

export function sceneFor(
  weatherCode: number | null,
  vehicle: Vehicle,
  now: Date,
  temperature: number | null = null,
): Scene {
  const daypart = daypartAt(now);
  return {
    daypart,
    sky:
      weatherCode === null
        ? SKY_FOR_VEHICLE[vehicle]
        : skyFromCode(weatherCode, daypart, temperature),
  };
}

export const isWet = (sky: SkyState) =>
  sky === "drizzle" ||
  sky === "rain" ||
  sky === "downpour" ||
  sky === "storm" ||
  sky === "sunshower";

/** The sun or moon is in plain view (no cloud cover in front of it). */
export const isBright = (sky: SkyState) =>
  sky === "clear" || sky === "partly" || sky === "hot";

export type SkyBackdrop =
  | "day-clear"
  | "day-hot"
  | "day-grey"
  | "day-rain"
  | "day-storm"
  | "dawn-clear"
  | "dusk-clear"
  | "night-clear"
  | "night-grey"
  | "night-rain"
  | "night-storm";

/** Key of the `--sky-*` gradient token. Dawn and dusk colour only a bright sky. */
export function backdropOf({ daypart, sky }: Scene): SkyBackdrop {
  const group = isBright(sky)
    ? sky === "hot"
      ? "hot"
      : "clear"
    : sky === "overcast" || sky === "fog"
      ? "grey"
      : sky === "storm" || sky === "downpour"
        ? "storm"
        : "rain";
  if (daypart === "night") {
    return group === "hot" ? "night-clear" : (`night-${group}` as SkyBackdrop);
  }
  if (group === "clear" && daypart !== "day") return `${daypart}-clear`;
  return `day-${group}` as SkyBackdrop;
}

export function inkTone({ daypart, sky }: Scene): InkTone {
  if (daypart === "night") return "car";
  if (daypart !== "day" && isBright(sky)) return "car"; // dawn and dusk skies are deep
  if (isBright(sky)) return "moto";
  if (sky === "overcast" || sky === "fog") return "mist";
  return "car";
}

/** Every scene that can really happen, in the order the demo steps through them. */
export const ALL_SCENES: Scene[] = [
  ...(
    [
      "clear",
      "hot",
      "partly",
      "overcast",
      "fog",
      "drizzle",
      "rain",
      "sunshower",
      "downpour",
      "storm",
    ] as const
  ).map((sky): Scene => ({ daypart: "day", sky })),
  ...(["dawn", "dusk"] as const).flatMap((daypart) =>
    (["clear", "partly", "sunshower", "rain"] as const).map((sky): Scene => ({
      daypart,
      sky,
    })),
  ),
  ...(
    [
      "clear",
      "partly",
      "overcast",
      "fog",
      "drizzle",
      "rain",
      "downpour",
      "storm",
    ] as const
  ).map((sky): Scene => ({ daypart: "night", sky })),
];

/** Deterministic 0–1 values (integer hash), so server and client render identical markup. */
export function unit(index: number, salt: number): number {
  let h = Math.imul(index + 1, 374761393) ^ Math.imul(salt + 1, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return ((h >>> 0) % 1000) / 1000;
}
