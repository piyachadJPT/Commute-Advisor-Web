import type { Locale } from "@/i18n/config";

const TIME_ZONE = "Asia/Bangkok";

/** Thai uses the Buddhist Era calendar (พ.ศ.); English uses Gregorian. 24-hour time in both. */
function intlLocale(locale: Locale): string {
  return locale === "th" ? "th-TH-u-ca-buddhist" : "en-GB";
}

/** "พุธ 11 พ.ย. 2569" / "Wed 11 Nov 2026" */
export function formatHeaderDate(date: Date, locale: Locale): string {
  const parts = new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: TIME_ZONE,
    weekday: locale === "th" ? "long" : "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  // Thai long weekday is "วันพุธ"; the board header uses the bare name "พุธ".
  const weekday = get("weekday").replace(/^วัน/, "");
  return `${weekday} ${get("day")} ${get("month")} ${get("year")}`;
}

/** "06:12" */
export function formatClock(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

function parts(
  date: Date,
  locale: Locale,
  options: Intl.DateTimeFormatOptions,
) {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: TIME_ZONE,
    ...options,
  }).formatToParts(date);
}

function part(
  list: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
): string {
  return list.find((p) => p.type === type)?.value ?? "";
}

/** "พฤหัส" / "Thu" */
export function formatWeekdayShort(date: Date, locale: Locale): string {
  return part(parts(date, locale, { weekday: "short" }), "weekday");
}

/** Compact weekday for tight cells: "พฤ." / "Thu" */
export function formatWeekdayCompact(date: Date, locale: Locale): string {
  if (locale === "en") return formatWeekdayShort(date, locale);
  return `${part(parts(date, locale, { weekday: "narrow" }), "weekday")}.`;
}

/** "12 พ.ย." / "12 Nov" */
export function formatDayMonth(date: Date, locale: Locale): string {
  const p = parts(date, locale, { day: "numeric", month: "short" });
  return `${part(p, "day")} ${part(p, "month")}`;
}

/** "9–13 พ.ย. 2569" / "9–13 Nov 2026" (same month); falls back to two full dates. */
export function formatDateRange(
  start: Date,
  end: Date,
  locale: Locale,
): string {
  const a = parts(start, locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const b = parts(end, locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  if (
    part(a, "month") === part(b, "month") &&
    part(a, "year") === part(b, "year")
  ) {
    return `${part(a, "day")}–${part(b, "day")} ${part(b, "month")} ${part(b, "year")}`;
  }
  return `${part(a, "day")} ${part(a, "month")} – ${part(b, "day")} ${part(b, "month")} ${part(b, "year")}`;
}

/** "พฤศจิกายน 2569" / "November 2026" */
export function formatMonthYear(date: Date, locale: Locale): string {
  const p = parts(date, locale, { month: "long", year: "numeric" });
  return `${part(p, "month")} ${part(p, "year")}`;
}

/** "ศ. 13 พ.ย. 2569, 08:20" style stamp: day, month, year and clock. */
export function formatStamp(date: Date, locale: Locale): string {
  return `${formatDayMonth(date, locale)} ${formatClock(date, locale)}`;
}
