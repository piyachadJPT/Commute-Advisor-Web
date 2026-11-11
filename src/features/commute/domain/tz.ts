// Timezone-aware date and time helpers. They use Intl only, never the host timezone, so
// results are identical under TZ=UTC and TZ=Asia/Bangkok (plan §15, §16.1).
import type { Instant, LocalDate, LocalTime } from "./types";

const HOUR_MS = 3_600_000;

export function asLocalDate(s: string): LocalDate {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  const ok =
    m !== null &&
    new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!)).toISOString().startsWith(s);
  if (!ok) throw new Error(`Invalid local date: ${s}`);
  return s as LocalDate;
}

/** Accepts "HH:mm" or the "HH:mm:ss" Postgres returns for `time` columns. */
export function asLocalTime(s: string): LocalTime {
  const m = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/.exec(s);
  if (!m) throw new Error(`Invalid local time: ${s}`);
  return `${m[1]}:${m[2]}` as LocalTime;
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

export type LocalParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

export function localParts(instant: Instant, timeZone: string): LocalParts {
  const out: Record<string, number> = {};
  for (const p of formatter(timeZone).formatToParts(instant)) {
    if (p.type !== "literal") out[p.type] = Number(p.value);
  }
  return out as LocalParts;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function localDateOf(instant: Instant, timeZone: string): LocalDate {
  const p = localParts(instant, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}` as LocalDate;
}

export function localTimeOf(instant: Instant, timeZone: string): LocalTime {
  const p = localParts(instant, timeZone);
  return `${pad(p.hour)}:${pad(p.minute)}` as LocalTime;
}

function offsetMs(instant: Instant, timeZone: string): number {
  const p = localParts(instant, timeZone);
  const asUtc = Date.UTC(
    p.year,
    p.month - 1,
    p.day,
    p.hour,
    p.minute,
    p.second,
  );
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** The instant at which the wall clock in `timeZone` reads `date` `time`. */
export function zonedToInstant(
  date: LocalDate,
  time: LocalTime,
  timeZone: string,
): Instant {
  const [y, mo, d] = date.split("-").map(Number) as [number, number, number];
  const [h, mi] = time.split(":").map(Number) as [number, number];
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  const first = wall - offsetMs(new Date(wall), timeZone);
  return new Date(wall - offsetMs(new Date(first), timeZone));
}

export function addDays(date: LocalDate, days: number): LocalDate {
  const [y, mo, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, mo - 1, d + days))
    .toISOString()
    .slice(0, 10) as LocalDate;
}

/** ISO weekday: Monday = 1 ... Sunday = 7. */
export function weekdayOf(date: LocalDate): number {
  const [y, mo, d] = date.split("-").map(Number) as [number, number, number];
  return ((new Date(Date.UTC(y, mo - 1, d)).getUTCDay() + 6) % 7) + 1;
}

/** Start of the local clock hour containing `instant`. */
export function floorToLocalHour(instant: Instant, timeZone: string): Instant {
  const p = localParts(instant, timeZone);
  const sinceHourMs =
    (p.minute * 60 + p.second) * 1000 +
    (((instant.getTime() % 1000) + 1000) % 1000);
  return new Date(instant.getTime() - sinceHourMs);
}

export { HOUR_MS };
