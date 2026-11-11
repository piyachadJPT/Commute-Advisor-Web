import type {
  CommuteType,
  LocationKey,
  Reason,
} from "@/features/commute/domain/types";

/**
 * Plain-text reason (no markup), for push notifications and history rows. The dashboard renders
 * the same reasons from `messages/*.json` with bold numbers; keep the wording in step with
 * `dashboard.reason.*`. Copy rules (plan §11.8): specific, no exclamation marks, no emoji, never
 * "it will not rain".
 */
const DEFAULT_THRESHOLD = 50; // the fixed label bands are built around 50%

const text = {
  th: {
    trip: { departure: "ขาไป", return: "ขากลับ" } as Record<
      CommuteType,
      string
    >,
    at: { home: "ที่บ้าน", work: "ที่ทำงาน" } as Record<LocationKey, string>,
    high: (t: string, risk: number, at: string, w: string) =>
      `${t}เสี่ยงฝน ${risk}% ${at} (${w})`,
    highCustom: (t: string, risk: number, at: string, w: string, th: number) =>
      `${t} ${risk}% ${at} (${w}) ซึ่งเกินเกณฑ์ที่ตั้งไว้ ${th}%`,
    otherNoData: (t: string) => ` · ยังไม่มีข้อมูล${t}`,
    bothLow: (th: number, max: number) =>
      `โอกาสฝนทั้งสองขาต่ำกว่าเกณฑ์ ${th}% · สูงสุด ${max}%`,
    incomplete: (t: string, at: string, hours: string) =>
      `ยังไม่มีข้อมูลโอกาสฝนช่วง${t}${at} (${hours})`,
  },
  en: {
    trip: { departure: "Outbound", return: "Return" } as Record<
      CommuteType,
      string
    >,
    at: { home: "at home", work: "at work" } as Record<LocationKey, string>,
    high: (t: string, risk: number, at: string, w: string) =>
      `${t}: ${risk}% chance of rain ${at} (${w})`,
    highCustom: (t: string, risk: number, at: string, w: string, th: number) =>
      `${t}: ${risk}% ${at} (${w}), above your ${th}% threshold`,
    otherNoData: (t: string) => ` · no data for the ${t.toLowerCase()} trip`,
    bothLow: (th: number, max: number) =>
      `Both trips below the ${th}% threshold · highest ${max}%`,
    incomplete: (t: string, at: string, hours: string) =>
      `No rain probability yet for the ${t.toLowerCase()} trip ${at} (${hours})`,
  },
};

export function renderReasonText(reason: Reason, locale: "th" | "en"): string {
  const t = text[locale];
  switch (reason.code) {
    case "departureHigh":
    case "returnHigh": {
      const p = reason.params;
      const trip = reason.code === "departureHigh" ? "departure" : "return";
      const other = trip === "departure" ? "return" : "departure";
      const base =
        p.threshold === DEFAULT_THRESHOLD
          ? t.high(t.trip[trip], p.risk, t.at[p.source], p.window)
          : t.highCustom(
              t.trip[trip],
              p.risk,
              t.at[p.source],
              p.window,
              p.threshold,
            );
      return p.otherIncomplete ? base + t.otherNoData(t.trip[other]) : base;
    }
    case "bothLow":
      return t.bothLow(reason.params.threshold, reason.params.max);
    case "incomplete": {
      const p = reason.params;
      return t.incomplete(t.trip[p.trip], t.at[p.source], p.hours);
    }
  }
}
