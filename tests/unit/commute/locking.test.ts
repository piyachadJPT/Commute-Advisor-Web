import { describe, expect, it } from "vitest";
import {
  resolveRecommendation,
  returnWarning,
  toSnapshot,
  type StoredRecommendation,
} from "@/features/commute/domain/locking";
import {
  zonedToInstant,
  asLocalDate,
  asLocalTime,
} from "@/features/commute/domain/tz";
import { TZ, bkk, compute, DATE } from "./helpers";

const low = { "09:00": 10, "10:00": 10, "19:00": 10 };
const departureStart = zonedToInstant(
  asLocalDate(DATE),
  asLocalTime("08:20"),
  TZ,
);

describe("resolveRecommendation (plan §5.7)", () => {
  const motorcycle = compute({ home: low, work: low });
  const car = compute({ home: low, work: { ...low, "19:00": 80 } });

  it("before the departure start: writes an unlocked snapshot", () => {
    const r = resolveRecommendation({
      computed: motorcycle,
      existing: null,
      now: bkk(DATE, "08:19"),
      departureStart,
    });
    expect(r).toMatchObject({
      action: "write",
      lockedAt: null,
      returnRiskLatest: null,
    });
    expect(r.action === "write" && r.snapshot.vehicle).toBe("motorcycle");
  });

  it("exactly at the departure start: locks, stamping lockedAt with now", () => {
    const now = bkk(DATE, "08:20");
    const r = resolveRecommendation({
      computed: motorcycle,
      existing: null,
      now,
      departureStart,
    });
    expect(r).toMatchObject({
      action: "write",
      lockedAt: now,
      returnRiskLatest: 10,
    });
  });

  it("after the start with no existing record: creates and locks immediately", () => {
    const now = bkk(DATE, "09:45");
    const r = resolveRecommendation({
      computed: car,
      existing: null,
      now,
      departureStart,
    });
    expect(r).toMatchObject({ action: "write", lockedAt: now });
    expect(r.action === "write" && r.snapshot.vehicle).toBe("car");
  });

  it("an unlocked existing record is locked with the fresh analysis once the time comes", () => {
    const existing: StoredRecommendation = {
      ...toSnapshot(motorcycle),
      lockedAt: null,
      returnRiskLatest: null,
    };
    const now = bkk(DATE, "08:30");
    const r = resolveRecommendation({
      computed: car,
      existing,
      now,
      departureStart,
    });
    expect(r).toMatchObject({ action: "write", lockedAt: now });
    expect(r.action === "write" && r.snapshot.vehicle).toBe("car");
  });

  it("a locked record is never rewritten: only the live return risk updates", () => {
    const existing: StoredRecommendation = {
      ...toSnapshot(motorcycle),
      lockedAt: bkk(DATE, "08:20"),
      returnRiskLatest: 10,
    };
    // Settings changed or the forecast moved: the fresh analysis says car.
    const r = resolveRecommendation({
      computed: car,
      existing,
      now: bkk(DATE, "13:00"),
      departureStart,
    });
    expect(r).toEqual({ action: "update_latest", returnRiskLatest: 80 });
  });

  it("is idempotent: a second pass over a locked record changes nothing but the live value", () => {
    const existing: StoredRecommendation = {
      ...toSnapshot(motorcycle),
      lockedAt: bkk(DATE, "08:20"),
      returnRiskLatest: 10,
    };
    const a = resolveRecommendation({
      computed: motorcycle,
      existing,
      now: bkk(DATE, "08:30"),
      departureStart,
    });
    const b = resolveRecommendation({
      computed: motorcycle,
      existing,
      now: bkk(DATE, "08:40"),
      departureStart,
    });
    expect(a).toEqual(b);
    expect(a.action).toBe("update_latest");
  });

  it("keeps a null live return risk when the live forecast is incomplete", () => {
    const noReturn = compute({
      home: { "09:00": 10, "10:00": 10 },
      work: { "09:00": 10, "10:00": 10 },
    });
    const existing: StoredRecommendation = {
      ...toSnapshot(motorcycle),
      lockedAt: bkk(DATE, "08:20"),
      returnRiskLatest: 10,
    };
    const r = resolveRecommendation({
      computed: noReturn,
      existing,
      now: bkk(DATE, "13:00"),
      departureStart,
    });
    expect(r).toEqual({ action: "update_latest", returnRiskLatest: null });
  });
});

describe("returnWarning (plan §5.7)", () => {
  it.each([
    ["motorcycle", 70, 50, true],
    ["motorcycle", 50, 50, true],
    ["motorcycle", 49, 50, false],
    ["motorcycle", null, 50, false],
    ["car", 90, 50, false],
    ["unknown", 90, 50, false],
  ] as const)(
    "%s, live %s, threshold %s -> %s",
    (vehicle, live, threshold, expected) => {
      expect(returnWarning({ vehicle, liveReturnRisk: live, threshold })).toBe(
        expected,
      );
    },
  );
});
