import type { StoredRecommendation } from "@/features/commute/domain/locking";
import type { LocalDate, Vehicle } from "@/features/commute/domain/types";

export type HistoryRow =
  | {
      kind: "recommendation";
      date: LocalDate;
      vehicle: Vehicle;
      departureRisk: number | null;
      returnRisk: number | null;
      locked: boolean;
      /** Live return risk after the lock, only when it differs from the locked one (§5.7). */
      returnRiskLatest: number | null;
    }
  | { kind: "skipped"; date: LocalDate };

export type MonthView = {
  month: string; // "2026-11"
  first: LocalDate;
  last: LocalDate;
  prev: string;
  /** Null when `month` is the current month: there is no history in the future. */
  next: string | null;
  rows: HistoryRow[]; // newest first
  counts: { car: number; motorcycle: number; unknown: number; skipped: number };
};

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;
const pad = (n: number) => String(n).padStart(2, "0");

export const monthOf = (date: string) => date.slice(0, 7);

/** A valid "yyyy-MM", or `fallback` for anything else (including a missing value). */
export function parseMonth(
  value: string | undefined,
  fallback: string,
): string {
  return value !== undefined && MONTH.test(value) ? value : fallback;
}

export function shiftMonth(month: string, delta: number): string {
  const [, y, m] = MONTH.exec(month)!;
  const index = Number(y) * 12 + (Number(m) - 1) + delta;
  return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`;
}

export function monthBounds(month: string): {
  first: LocalDate;
  last: LocalDate;
} {
  const [, y, m] = MONTH.exec(month)!;
  const lastDay = new Date(Date.UTC(Number(y), Number(m), 0)).getUTCDate();
  return {
    first: `${month}-01` as LocalDate,
    last: `${month}-${pad(lastDay)}` as LocalDate,
  };
}

/**
 * One month of history (plan §11.5): a row per recorded day, newest first, and the counts for
 * the summary. A skipped day shows as skipped even if a recommendation was stored before the
 * skip. Days with neither a record nor a skip are simply absent.
 */
export function buildMonthView(input: {
  month: string;
  currentMonth: string;
  stored: ReadonlyMap<string, StoredRecommendation>;
  skipped: ReadonlySet<string>;
}): MonthView {
  const { month, currentMonth, stored, skipped } = input;
  const { first, last } = monthBounds(month);
  const inMonth = (d: string) => d >= first && d <= last;

  const rows: HistoryRow[] = [];
  const counts = { car: 0, motorcycle: 0, unknown: 0, skipped: 0 };

  for (const date of skipped) {
    if (!inMonth(date)) continue;
    rows.push({ kind: "skipped", date: date as LocalDate });
    counts.skipped++;
  }
  for (const [date, s] of stored) {
    if (!inMonth(date) || skipped.has(date)) continue;
    counts[s.vehicle]++;
    rows.push({
      kind: "recommendation",
      date: date as LocalDate,
      vehicle: s.vehicle,
      departureRisk: s.departureRisk,
      returnRisk: s.returnRisk,
      locked: s.lockedAt !== null,
      returnRiskLatest:
        s.lockedAt !== null &&
        s.returnRiskLatest !== null &&
        s.returnRiskLatest !== s.returnRisk
          ? s.returnRiskLatest
          : null,
    });
  }
  rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  return {
    month,
    first,
    last,
    prev: shiftMonth(month, -1),
    next: month < currentMonth ? shiftMonth(month, 1) : null,
    rows,
    counts,
  };
}
