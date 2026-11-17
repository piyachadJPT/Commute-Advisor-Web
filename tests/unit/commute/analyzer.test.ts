import { describe, expect, it } from "vitest";
import {
  analyzeTrip,
  decide,
  highCause,
  isLightRain,
} from "@/features/commute/domain/analyzer";
import { riskLevelOf } from "@/features/commute/domain/labels";
import { deriveReason } from "@/features/commute/domain/reasons";
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
  it("averages each location's buckets by overlap, then takes the higher location", () => {
    // 08:20-09:20 covers 40 min of the 09:00 bucket and 20 min of the 10:00 bucket.
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
      risk: 47, // 55 * 2/3 + 30 * 1/3 = 46.7; home is 13.3
      riskSource: "work",
      isComplete: true,
      riskLevel: "low",
    });
    expect(t.missingBuckets).toEqual([]);
  });

  it("a bucket the trip barely touches no longer decides it", () => {
    // 18:50-19:50: 10 min of the 19:00 bucket, 50 min of the 20:00 bucket.
    const w = mapWindow("return", asLocalDate(D), asLocalTime("18:50"), 60, TZ);
    const rows = (loc: "home" | "work") =>
      series(loc, D, { "19:00": { prob: 92 }, "20:00": { prob: 20 } });
    expect(analyzeTrip(w, rows("home"), rows("work")).risk).toBe(32); // 92/6 + 20*5/6
  });

  it("flags a thunderstorm code at either location", () => {
    const home = series("home", D, { "19:00": { prob: 40 } });
    const work = series("work", D, { "19:00": { prob: 40 } });
    work[0]!.weatherCode = 95;
    expect(analyzeTrip(ret, home, work).storm).toBe(true);
    expect(analyzeTrip(ret, home, home).storm).toBe(false);
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

  it("rainMm is the rain expected during the trip at the wetter location", () => {
    const home = series("home", D, {
      "09:00": { prob: 1, mm: 0.5 },
      "10:00": { prob: 1, mm: 1.0 },
    });
    const work = series("work", D, {
      "09:00": { prob: 1, mm: 2.0 },
      "10:00": { prob: 1, mm: 0.1 },
    });
    // work: 2.0 * 2/3 + 0.1 * 1/3 = 1.37; home: 0.67
    expect(analyzeTrip(dep, home, work).rainMm).toBe(1.4);
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
  rainMm: number | null = null,
  storm = false,
): TripAnalysis => ({
  window: dep,
  risk,
  riskSource: risk === null ? null : source,
  rainMm,
  storm,
  riskLevel: riskLevelOf(risk),
  isComplete: risk !== null,
  missingBuckets: [],
});

describe("highCause: the v2.2 rain rule (plan §5.3)", () => {
  it.each([
    // risk, mm, storm, expected
    [92, 0, false, null], // the reported case: high chance, no rain expected
    [92, 0.4, false, null],
    [92, 0.5, false, "chance"],
    [50, 0.5, false, "chance"],
    [49, 1.9, false, null],
    [30, 2, false, "amount"],
    [29, 5, false, null], // a lone model spike
    [35, 0, true, "storm"],
    [29, 0, true, null],
    [70, null, false, "chance"], // amount unknown: probability alone, as before
    [null, 5, true, null],
  ] as const)("%s%% / %s mm / storm %s -> %s", (r, mm, storm, expected) => {
    expect(highCause(trip(r, "home", mm, storm), 50)).toBe(expected);
  });

  it("light rain is a probability over the threshold that is not rainy", () => {
    expect(isLightRain(trip(92, "home", 0.1), 50)).toBe(true);
    expect(isLightRain(trip(92, "home", 1), 50)).toBe(false);
    expect(isLightRain(trip(40, "home", 0.1), 50)).toBe(false);
    expect(isLightRain(trip(null), 50)).toBe(false);
  });

  it("92% with no rain expected on either trip -> motorcycle", () => {
    expect(decide(trip(92, "home", 0), trip(92, "work", 0.2), 50)).toBe(
      "motorcycle",
    );
  });

  it("explains that case as light rain, naming the trip with the higher chance", () => {
    const r = { ...trip(92, "work", 0.2), window: ret };
    expect(deriveReason(trip(60, "home", 0), r, 50, TZ)).toEqual({
      code: "lightRain",
      params: {
        trip: "return",
        risk: 92,
        mm: 0.2,
        window: "18:00–19:00",
        threshold: 50,
      },
    });
  });

  it("names the amount when heavy rain below the threshold picks the car", () => {
    const r = { ...trip(40, "work", 3.2), window: ret };
    expect(deriveReason(trip(10, "home", 0), r, 50, TZ)).toMatchObject({
      code: "returnHigh",
      params: { risk: 40, cause: "amount", mm: 3.2 },
    });
  });
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
      "10:00": { prob: 55 },
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
