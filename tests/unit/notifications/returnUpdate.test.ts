import { describe, expect, it } from "vitest";
import {
  toSnapshot,
  type StoredRecommendation,
} from "@/features/commute/domain/locking";
import { asLocalDate, asLocalTime } from "@/features/commute/domain/tz";
import type { TripAnalysis } from "@/features/commute/domain/types";
import {
  isPreReturnRefresh,
  isReturnUpdateDue,
} from "@/features/notifications/domain/due";
import {
  buildReturnUpdate,
  returnUpdate,
  storedReturnHigh,
} from "@/features/notifications/domain/returnUpdate";
import { TZ, bkk, compute, DATE } from "../commute/helpers";

const base = {
  today: asLocalDate(DATE),
  returnTime: asLocalTime("18:00"),
  timeZone: TZ,
  commuteDays: 31,
  skipped: new Set<string>(),
};

describe("isReturnUpdateDue (v2.2)", () => {
  const due = (time: string, over: Partial<typeof base> = {}) =>
    isReturnUpdateDue({ ...base, ...over, now: bkk(DATE, time) });

  it("is due from an hour before the return time, for 20 minutes", () => {
    expect(due("16:59")).toBe(false);
    expect(due("17:00")).toBe(true);
    expect(due("17:19")).toBe(true);
    expect(due("17:20")).toBe(false);
  });
  it("is not due on a skipped day or a non-commute day", () => {
    expect(due("17:05", { skipped: new Set([DATE]) })).toBe(false);
    expect(due("17:05", { commuteDays: 0 })).toBe(false);
  });
});

describe("isPreReturnRefresh (v2.2)", () => {
  const pre = (time: string) =>
    isPreReturnRefresh({ ...base, now: bkk(DATE, time) });
  it("is the tick 20-30 minutes before the update only", () => {
    expect(pre("16:29")).toBe(false);
    expect(pre("16:30")).toBe(true);
    expect(pre("16:39")).toBe(true);
    expect(pre("16:40")).toBe(false);
  });
});

const low = { "09:00": 10, "10:00": 10, "19:00": 10 };
const stored = (returnProb: number) =>
  ({
    ...toSnapshot(
      compute({ home: { ...low, "19:00": returnProb }, work: low }),
    ),
    lockedAt: bkk(DATE, "08:20"),
    returnRiskLatest: null,
  }) as StoredRecommendation;
const live = (risk: number | null, rainMm: number | null) =>
  ({
    risk,
    rainMm,
    storm: false,
    isComplete: risk !== null,
    window: { localStart: "18:00", localEnd: "19:00" },
  }) as TripAnalysis;

describe("returnUpdate: only when the evening disagrees with the morning", () => {
  it.each([
    ["dry morning, rain now", 10, live(80, 1.5), "rainNow"],
    ["dry morning, still dry", 10, live(20, 0), null],
    ["dry morning, high chance but no rain", 10, live(92, 0), null],
    ["rainy morning, still rainy", 80, live(85, 2), null],
    ["rainy morning, now dry", 80, live(20, 0), "clearing"],
    ["rainy morning, live incomplete", 80, live(null, null), null],
  ] as const)("%s -> %s", (_, morning, l, expected) => {
    expect(
      returnUpdate({ stored: stored(morning), live: l, threshold: 50 }),
    ).toBe(expected);
  });

  it("no stored row counts as a dry morning", () => {
    expect(
      returnUpdate({ stored: null, live: live(80, 1), threshold: 50 }),
    ).toBe("rainNow");
  });

  it("a stored return thunderstorm counts as rainy", () => {
    const s = { ...stored(40), returnRainMm: 0 };
    expect(storedReturnHigh(s, 50)).toBe(false);
    s.advisories = [
      {
        code: "thunderstorm",
        level: "warning",
        trip: "return",
        source: "home",
        params: {},
      },
    ];
    expect(storedReturnHigh(s, 50)).toBe(true);
  });
});

describe("buildReturnUpdate text", () => {
  it("rain now on a motorcycle day suggests rain gear, Thai and English", () => {
    const args = {
      kind: "rainNow" as const,
      live: live(80, 1.5),
      vehicle: "motorcycle" as const,
    };
    expect(buildReturnUpdate({ ...args, locale: "th" }).body).toBe(
      "ขากลับ 18:00–19:00 เสี่ยงฝน 80% · คาด 1.5 มม. · เตรียมชุดกันฝนหรือรอฝนหยุด",
    );
    expect(buildReturnUpdate({ ...args, locale: "en" }).body).toBe(
      "Return 18:00–19:00: 80% chance of rain · 1.5 mm expected · get rain gear ready or wait it out",
    );
  });

  it("clearing never says it will not rain", () => {
    expect(
      buildReturnUpdate({
        kind: "clearing",
        live: live(20, 0),
        vehicle: "car",
        locale: "th",
      }).body,
    ).toBe("ขากลับ 18:00–19:00 ฝนลดลงแล้ว · 20% · คาด 0 มม.");
  });
});
