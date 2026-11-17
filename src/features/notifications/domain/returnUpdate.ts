import { isHigh } from "@/features/commute/domain/analyzer";
import type { StoredRecommendation } from "@/features/commute/domain/locking";
import type { TripAnalysis, Vehicle } from "@/features/commute/domain/types";
import type { Locale, PushPayload } from "./payload";

export type ReturnUpdateKind = "rainNow" | "clearing";

/**
 * Was the return trip rainy in the stored (morning) snapshot? Rebuilt from the frozen columns
 * and judged by today's rule, so both sides of the comparison use the same rule. A thunderstorm
 * on the return trip is in the frozen advisories (that advisory cannot be turned off).
 */
export function storedReturnHigh(
  stored: StoredRecommendation | null,
  threshold: number,
): boolean {
  if (!stored || stored.returnRisk === null) return false;
  const pseudo = {
    risk: stored.returnRisk,
    rainMm: stored.returnRainMm,
    storm: stored.advisories.some(
      (a) => a.code === "thunderstorm" && a.trip === "return",
    ),
    isComplete: true,
  } as TripAnalysis;
  return isHigh(pseudo, threshold);
}

/**
 * What the return update says, or null when there is nothing new (v2.2). It is sent only when
 * the live return forecast disagrees with the morning one, so an ordinary day stays quiet:
 * - `rainNow`: rain now expected on a return the morning thought was dry.
 * - `clearing`: the morning expected rain on the return and it no longer does.
 * An incomplete live forecast sends nothing: it would be a guess either way.
 */
export function returnUpdate(input: {
  stored: StoredRecommendation | null;
  live: TripAnalysis;
  threshold: number;
}): ReturnUpdateKind | null {
  const { stored, live, threshold } = input;
  if (!live.isComplete || live.risk === null) return null;
  const was = storedReturnHigh(stored, threshold);
  const now = isHigh(live, threshold);
  if (now && !was) return "rainNow";
  if (!now && was) return "clearing";
  return null;
}

const text = {
  th: {
    title: "Commute Advisor",
    rainNow: (w: string, risk: number, mm: string, moto: boolean) =>
      `ขากลับ ${w} เสี่ยงฝน ${risk}%${mm}` +
      (moto ? " · เตรียมชุดกันฝนหรือรอฝนหยุด" : ""),
    clearing: (w: string, risk: number, mm: string) =>
      `ขากลับ ${w} ฝนลดลงแล้ว · ${risk}%${mm}`,
    mm: (mm: number) => ` · คาด ${mm} มม.`,
  },
  en: {
    title: "Commute Advisor",
    rainNow: (w: string, risk: number, mm: string, moto: boolean) =>
      `Return ${w}: ${risk}% chance of rain${mm}` +
      (moto ? " · get rain gear ready or wait it out" : ""),
    clearing: (w: string, risk: number, mm: string) =>
      `Return ${w}: rain easing · ${risk}%${mm}`,
    mm: (mm: number) => ` · ${mm} mm expected`,
  },
};

/** The return update's push text. Never promises that it will not rain (plan §11.8). */
export function buildReturnUpdate(input: {
  kind: ReturnUpdateKind;
  live: TripAnalysis;
  vehicle: Vehicle;
  locale: Locale;
}): PushPayload {
  const { kind, live, vehicle, locale } = input;
  const t = text[locale];
  const w = `${live.window.localStart}–${live.window.localEnd}`;
  const mm = live.rainMm === null ? "" : t.mm(live.rainMm);
  const body =
    kind === "rainNow"
      ? t.rainNow(w, live.risk!, mm, vehicle === "motorcycle")
      : t.clearing(w, live.risk!, mm);
  return { title: t.title, body, url: "/" };
}
