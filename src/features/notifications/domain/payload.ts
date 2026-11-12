import {
  localDateOf,
  localTimeOf,
  addDays,
} from "@/features/commute/domain/tz";
import type {
  Advisory,
  AdvisoryCode,
  CommuteType,
  ComputedRecommendation,
  Reason,
  Vehicle,
} from "@/features/commute/domain/types";

export type NotificationKind = "recommendation" | "stale" | "generic";
export type PushPayload = { title: string; body: string; url: "/" };
export type Locale = "th" | "en";

const DEFAULT_THRESHOLD = 50;

/**
 * Longest body a lock-screen preview is expected to show whole (plan §23.6). Advisories are
 * dropped to fit; the recommendation never is.
 */
export const MAX_BODY_LENGTH = 95;
const MAX_ADVISORIES = 2;

type Params = Advisory["params"];
const advisoryText: Record<
  Locale,
  Record<AdvisoryCode, (p: Params) => string>
> = {
  th: {
    thunderstorm: () => "พายุฝนฟ้าคะนอง",
    heavyRain: () => "ฝนหนัก",
    pm25: (p) => `ฝุ่น PM2.5 ${p.value} ใส่ N95`,
    heat: (p) => `ร้อน รู้สึก ${p.value}°`,
    cold: (p) => `หนาว รู้สึก ${p.value}°`,
    lowVisibility: () => "ทัศนวิสัยต่ำ",
    gust: (p) => `ลมกระโชก ${p.value} กม./ชม.`,
    wetRoad: () => "ถนนเปียก",
    rainNearWindow: () => "ฝนใกล้ช่วงเดินทาง",
    darkReturn: () => "ฝนตอนมืด",
    uv: (p) => `UV ${p.value}`,
  },
  en: {
    thunderstorm: () => "thunderstorm risk",
    heavyRain: () => "heavy rain",
    pm25: (p) => `PM2.5 ${p.value}, wear N95`,
    heat: (p) => `hot, feels like ${p.value}°`,
    cold: (p) => `cold, feels like ${p.value}°`,
    lowVisibility: () => "low visibility",
    gust: (p) => `gusts ${p.value} km/h`,
    wetRoad: () => "wet roads",
    rainNearWindow: () => "rain near the trip",
    darkReturn: () => "rain after dark",
    uv: (p) => `UV ${p.value}`,
  },
};

/**
 * The first `MAX_ADVISORIES` advisories, one per code (the list is already ordered by
 * importance, plan §23.2), joined after the main line. Fewer are added until the body fits;
 * with none that fit, the body is the main line alone.
 */
function withAdvisories(
  main: string,
  advisories: readonly Advisory[],
  locale: Locale,
): string {
  const seen = new Set<AdvisoryCode>();
  const picked: string[] = [];
  for (const a of advisories) {
    if (seen.has(a.code)) continue;
    seen.add(a.code);
    picked.push(advisoryText[locale][a.code](a.params));
    if (picked.length === MAX_ADVISORIES) break;
  }
  for (let n = picked.length; n > 0; n--) {
    const body = [main, ...picked.slice(0, n)].join(" · ");
    if (body.length <= MAX_BODY_LENGTH) return body;
  }
  return main;
}

const text = {
  th: {
    title: "Commute Advisor",
    verdict: {
      car: "แนะนำรถยนต์",
      motorcycle: "แนะนำมอเตอร์ไซค์",
      unknown: "ยังสรุปไม่ได้",
    } as Record<Vehicle, string>,
    trip: { departure: "ขาไป", return: "ขากลับ" } as Record<
      CommuteType,
      string
    >,
    high: (trip: string, risk: number, threshold: number) =>
      threshold === DEFAULT_THRESHOLD
        ? `${trip}เสี่ยงฝน ${risk}%`
        : `${trip}เสี่ยงฝน ${risk}% (เกณฑ์ ${threshold}%)`,
    bothLow: (max: number) => `โอกาสฝนต่ำทั้งสองขา · สูงสุด ${max}%`,
    incomplete: (trip: string) => `ข้อมูลพยากรณ์${trip}ยังไม่ครบ`,
    stale: (verdict: string, when: string) =>
      `${verdict} (ข้อมูล ${when}) · เปิดแอปเพื่ออัปเดต`,
    yesterday: "เมื่อวาน",
    generic: "เปิดแอปเพื่อดูคำแนะนำการเดินทางวันนี้",
  },
  en: {
    title: "Commute Advisor",
    verdict: {
      car: "Take the car",
      motorcycle: "Ride the motorcycle",
      unknown: "No call yet",
    } as Record<Vehicle, string>,
    trip: { departure: "outbound", return: "return" } as Record<
      CommuteType,
      string
    >,
    high: (trip: string, risk: number, threshold: number) =>
      threshold === DEFAULT_THRESHOLD
        ? `${trip} ${risk}% chance of rain`
        : `${trip} ${risk}% chance of rain (threshold ${threshold}%)`,
    bothLow: (max: number) => `Low chance of rain both ways · highest ${max}%`,
    incomplete: (trip: string) => `Forecast for the ${trip} trip is incomplete`,
    stale: (verdict: string, when: string) =>
      `${verdict} (data from ${when}) · open the app to update`,
    yesterday: "yesterday",
    generic: "Open the app for today's commute recommendation",
  },
};

function shortReason(reason: Reason, locale: Locale): string {
  const t = text[locale];
  switch (reason.code) {
    case "departureHigh":
    case "returnHigh": {
      const trip =
        t.trip[reason.code === "departureHigh" ? "departure" : "return"];
      const sentence = t.high(
        trip,
        reason.params.risk,
        reason.params.threshold,
      );
      // English reads better capitalised at the start of the body.
      return locale === "en"
        ? sentence.charAt(0).toUpperCase() + sentence.slice(1)
        : sentence;
    }
    case "bothLow":
      return t.bothLow(reason.params.max);
    case "incomplete": {
      const sentence = t.incomplete(t.trip[reason.params.trip]);
      return sentence;
    }
  }
}

/** "21:10" today, "21:10 เมื่อวาน" yesterday, "10/11 21:10" earlier (local time). */
function fetchedWhen(
  fetchedAt: Date,
  now: Date,
  tz: string,
  locale: Locale,
): string {
  const clock = localTimeOf(fetchedAt, tz);
  const day = localDateOf(fetchedAt, tz);
  const today = localDateOf(now, tz);
  if (day === today) return clock;
  if (day === addDays(today, -1)) return `${clock} ${text[locale].yesterday}`;
  return `${day.slice(8)}/${day.slice(5, 7)} ${clock}`;
}

/**
 * The morning message (plan §11.8, §13.2). Fresh data: verdict and the main reason. Stale data:
 * verdict plus when the data is from. No data at all: the generic prompt. Never promises that it
 * will not rain, and never carries coordinates.
 */
export function buildNotification(input: {
  computed: ComputedRecommendation | null;
  now: Date;
  timeZone: string;
  locale: Locale;
}): { kind: NotificationKind; payload: PushPayload } {
  const { computed, now, timeZone, locale } = input;
  const t = text[locale];
  const make = (kind: NotificationKind, body: string) => ({
    kind,
    payload: { title: t.title, body, url: "/" as const },
  });

  if (
    computed === null ||
    computed.freshness === "none" ||
    computed.forecastFetchedAt === null
  ) {
    return make("generic", t.generic);
  }
  const verdict = t.verdict[computed.vehicle];
  if (computed.freshness === "stale") {
    return make(
      "stale",
      t.stale(
        verdict,
        fetchedWhen(computed.forecastFetchedAt, now, timeZone, locale),
      ),
    );
  }
  return make(
    "recommendation",
    withAdvisories(
      `${verdict} · ${shortReason(computed.reason, locale)}`,
      computed.advisories,
      locale,
    ),
  );
}
