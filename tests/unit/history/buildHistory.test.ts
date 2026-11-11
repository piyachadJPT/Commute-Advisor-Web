import { describe, expect, it } from "vitest";
import {
  toSnapshot,
  type StoredRecommendation,
} from "@/features/commute/domain/locking";
import { computeRecommendation } from "@/features/commute/domain/recommend";
import { asLocalDate } from "@/features/commute/domain/tz";
import {
  buildMonthView,
  monthBounds,
  parseMonth,
  shiftMonth,
} from "@/features/history/domain/buildHistory";
import { bkk, series, settings } from "../commute/helpers";

function stored(
  date: string,
  dep: number,
  ret: number,
  lock: boolean,
  latest: number | null = null,
) {
  const probs = (p: number) => ({
    "09:00": { prob: dep },
    "10:00": { prob: dep },
    "19:00": { prob: p },
  });
  const c = computeRecommendation({
    date: asLocalDate(date),
    settings,
    home: series("home", date, probs(ret)),
    work: series("work", date, probs(ret)),
    homeFetchedAt: bkk(date, "05:50"),
    workFetchedAt: bkk(date, "05:50"),
    now: bkk(date, "08:20"),
  });
  return {
    ...toSnapshot(c),
    lockedAt: lock ? bkk(date, "08:20") : null,
    returnRiskLatest: latest,
  } as StoredRecommendation;
}

describe("month helpers", () => {
  it("shifts across year boundaries", () => {
    expect(shiftMonth("2026-11", 1)).toBe("2026-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });
  it("knows the last day of each month, including leap February", () => {
    expect(monthBounds("2026-11").last).toBe("2026-11-30");
    expect(monthBounds("2028-02").last).toBe("2028-02-29");
    expect(monthBounds("2026-02").last).toBe("2026-02-28");
  });
  it("rejects a malformed month and falls back", () => {
    expect(parseMonth("2026-13", "2026-11")).toBe("2026-11");
    expect(parseMonth("2026-1", "2026-11")).toBe("2026-11");
    expect(parseMonth("../x", "2026-11")).toBe("2026-11");
    expect(parseMonth(undefined, "2026-11")).toBe("2026-11");
    expect(parseMonth("2026-10", "2026-11")).toBe("2026-10");
  });
});

describe("buildMonthView", () => {
  const data = new Map([
    ["2026-11-09", stored("2026-11-09", 60, 10, true)], // car
    ["2026-11-10", stored("2026-11-10", 10, 10, true)], // motorcycle
    ["2026-11-11", stored("2026-11-11", 10, 10, true, 70)], // motorcycle, return rose to 70
    ["2026-10-30", stored("2026-10-30", 10, 10, true)], // another month
  ]);

  it("lists only the month's days, newest first, and counts by vehicle", () => {
    const v = buildMonthView({
      month: "2026-11",
      currentMonth: "2026-11",
      stored: data,
      skipped: new Set(),
    });
    expect(v.rows.map((r) => r.date)).toEqual([
      "2026-11-11",
      "2026-11-10",
      "2026-11-09",
    ]);
    expect(v.counts).toEqual({ car: 1, motorcycle: 2, unknown: 0, skipped: 0 });
  });

  it("reports the live return risk only when it differs from the locked one", () => {
    const v = buildMonthView({
      month: "2026-11",
      currentMonth: "2026-11",
      stored: data,
      skipped: new Set(),
    });
    const [r11, r10] = v.rows;
    expect(r11).toMatchObject({
      date: "2026-11-11",
      returnRisk: 10,
      returnRiskLatest: 70,
    });
    expect(r10).toMatchObject({ returnRiskLatest: null });
  });

  it("shows skipped days as muted rows and does not count them as decided", () => {
    const v = buildMonthView({
      month: "2026-11",
      currentMonth: "2026-11",
      stored: data,
      skipped: new Set(["2026-11-10", "2026-11-12", "2026-10-31"]),
    });
    expect(v.rows.map((r) => [r.date, r.kind])).toEqual([
      ["2026-11-12", "skipped"],
      ["2026-11-11", "recommendation"],
      ["2026-11-10", "skipped"], // skipped after a recommendation was stored
      ["2026-11-09", "recommendation"],
    ]);
    expect(v.counts).toEqual({ car: 1, motorcycle: 1, unknown: 0, skipped: 2 });
  });

  it("has no next month from the current month, and a prev one always", () => {
    const now = buildMonthView({
      month: "2026-11",
      currentMonth: "2026-11",
      stored: data,
      skipped: new Set(),
    });
    expect([now.prev, now.next]).toEqual(["2026-10", null]);
    const past = buildMonthView({
      month: "2026-10",
      currentMonth: "2026-11",
      stored: data,
      skipped: new Set(),
    });
    expect([past.prev, past.next]).toEqual(["2026-09", "2026-11"]);
  });

  it("returns no rows for an empty month", () => {
    const v = buildMonthView({
      month: "2026-09",
      currentMonth: "2026-11",
      stored: data,
      skipped: new Set(),
    });
    expect(v.rows).toEqual([]);
    expect(v.counts).toEqual({ car: 0, motorcycle: 0, unknown: 0, skipped: 0 });
  });
});
