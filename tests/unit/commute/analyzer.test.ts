import { describe, expect, it } from "vitest";
import { analyzeTrip, decide } from "@/features/commute/domain/analyzer";
import { riskLevelOf } from "@/features/commute/domain/labels";
import { mapWindow } from "@/features/commute/domain/windowMapper";
import { asLocalDate, asLocalTime } from "@/features/commute/domain/tz";
import type { TripAnalysis } from "@/features/commute/domain/types";
import { TZ, bkk, series } from "./helpers";

const D = "2026-11-11";
const dep = mapWindow(
  "departure",
  asLocalDate(D),
  asLocalTime("08:20"),
  60,
  TZ,
); // 09:00, 10:00
const ret = mapWindow("return", asLocalDate(D), asLocalTime("18:00"), 60, TZ); // 19:00

describe("analyzeTrip (plan §5.2)", () => {
  it("takes the max over both locations and attributes it", () => {
    const home = series("home", D, {
      "09:00": { prob: 10 },
      "10:00": { prob: 20 },
    });
    const work = series("work", D, {
      "09:00": { prob: 55 },
      "10:00": { prob: 30 },
    });
    const t = analyzeTrip(dep, home, work);
    expect(t).toMatchObject({
      risk: 55,
      riskSource: "work",
      isComplete: true,
      riskLevel: "high",
    });
    expect(t.missingBuckets).toEqual([]);
  });

  it("attributes a tie to home", () => {
    const home = series("home", D, { "19:00": { prob: 40 } });
    const work = series("work", D, { "19:00": { prob: 40 } });
    expect(analyzeTrip(ret, home, work)).toMatchObject({
      risk: 40,
      riskSource: "home",
    });
  });

  it("is incomplete when a bucket has a null probability, and never reads it as 0", () => {
    const home = series("home", D, {
      "09:00": { prob: 10 },
      "10:00": { prob: null },
    });
    const work = series("work", D, {
      "09:00": { prob: 20 },
      "10:00": { prob: 20 },
    });
    const t = analyzeTrip(dep, home, work);
    expect(t.isComplete).toBe(false);
    expect(t.risk).toBeNull();
    expect(t.riskSource).toBeNull();
    expect(t.riskLevel).toBe("unknown");
    expect(t.missingBuckets).toEqual([
      { location: "home", time: bkk(D, "10:00") },
    ]);
  });

  it("is incomplete when the forecast does not cover a bucket at one location", () => {
    const home = series("home", D, {
      "09:00": { prob: 10 },
      "10:00": { prob: 10 },
    });
    const work = series("work", D, { "09:00": { prob: 10 } }); // 10:00 missing
    const t = analyzeTrip(dep, home, work);
    expect(t.isComplete).toBe(false);
    expect(t.missingBuckets).toEqual([
      { location: "work", time: bkk(D, "10:00") },
    ]);
  });

  it("is incomplete with no data at all, listing every bucket at both locations", () => {
    const t = analyzeTrip(dep, [], []);
    expect(t.isComplete).toBe(false);
    expect(t.missingBuckets).toHaveLength(4);
  });

  it("rainMm is the larger of the two locations' sums", () => {
    const home = series("home", D, {
      "09:00": { prob: 1, mm: 0.5 },
      "10:00": { prob: 1, mm: 1.0 },
    });
    const work = series("work", D, {
      "09:00": { prob: 1, mm: 2.0 },
      "10:00": { prob: 1, mm: 0.1 },
    });
    expect(analyzeTrip(dep, home, work).rainMm).toBeCloseTo(2.1);
  });

  it("rainMm is null when any precipitation value is null", () => {
    const home = series("home", D, {
      "09:00": { prob: 1, mm: null },
      "10:00": { prob: 1, mm: 1 },
    });
    const work = series("work", D, {
      "09:00": { prob: 1, mm: 3 },
      "10:00": { prob: 1, mm: 3 },
    });
    const t = analyzeTrip(dep, home, work);
    expect(t.isComplete).toBe(true);
    expect(t.rainMm).toBeNull();
  });

  it("ignores rows outside the window", () => {
    const home = series("home", D, {
      "08:00": { prob: 99 },
      "09:00": { prob: 5 },
      "10:00": { prob: 5 },
      "11:00": { prob: 99 },
    });
    const work = series("work", D, {
      "09:00": { prob: 5 },
      "10:00": { prob: 5 },
    });
    expect(analyzeTrip(dep, home, work).risk).toBe(5);
  });
});

describe("riskLevelOf (plan §5.4 fixed bands)", () => {
  it.each([
    [0, "veryLow"],
    [19, "veryLow"],
    [20, "low"],
    [49, "low"],
    [50, "high"],
    [69, "high"],
    [70, "veryHigh"],
    [100, "veryHigh"],
    [null, "unknown"],
  ] as const)("%s -> %s", (p, level) => {
    expect(riskLevelOf(p)).toBe(level);
  });
});

const trip = (
  risk: number | null,
  source: "home" | "work" | null = "home",
): TripAnalysis => ({
  window: dep,
  risk,
  riskSource: risk === null ? null : source,
  rainMm: null,
  riskLevel: riskLevelOf(risk),
  isComplete: risk !== null,
  missingBuckets: [],
});

describe("decide: the v1.1 decision table (plan §16.5)", () => {
  it.each([
    [10, 15, "motorcycle"],
    [20, 50, "car"],
    [70, 10, "car"],
    [90, 95, "car"],
    [null, 10, "unknown"],
    [null, 60, "car"],
    [49, 49, "motorcycle"],
  ] as const)("departure %s / return %s -> %s", (d, r, expected) => {
    expect(decide(trip(d), trip(r), 50)).toBe(expected);
  });

  it("home 10% / work 55% on departure -> car, attributed to work", () => {
    const home = series("home", D, {
      "09:00": { prob: 10 },
      "10:00": { prob: 10 },
    });
    const work = series("work", D, {
      "09:00": { prob: 55 },
      "10:00": { prob: 10 },
    });
    const homeR = series("home", D, { "19:00": { prob: 10 } });
    const workR = series("work", D, { "19:00": { prob: 10 } });
    const d = analyzeTrip(dep, home, work);
    const r = analyzeTrip(ret, homeR, workR);
    expect(d.riskSource).toBe("work");
    expect(decide(d, r, 50)).toBe("car");
  });

  it("is unknown when one trip is incomplete and the other is below the threshold", () => {
    expect(decide(trip(10), trip(null), 50)).toBe("unknown");
    expect(decide(trip(null), trip(null), 50)).toBe("unknown");
  });

  it("the threshold is inclusive", () => {
    expect(decide(trip(50), trip(0), 50)).toBe("car");
    expect(decide(trip(49), trip(49), 50)).toBe("motorcycle");
  });

  it("a custom threshold can disagree with the fixed label", () => {
    const t = trip(45);
    expect(t.riskLevel).toBe("low"); // label says low to moderate
    expect(decide(t, trip(0), 40)).toBe("car"); // but 45 >= 40
    expect(decide(t, trip(0), 50)).toBe("motorcycle");
  });
});
