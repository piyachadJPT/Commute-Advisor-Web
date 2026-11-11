import { describe, expect, it } from "vitest";
import {
  decideRefresh,
  localHour,
} from "@/features/forecast/domain/refreshPolicy";

const TZ = "Asia/Bangkok";
// Bangkok is UTC+7 with no DST. Helper: a Date at a Bangkok wall-clock time.
const bkk = (iso: string) => new Date(`${iso}+07:00`);
const minutesBefore = (d: Date, m: number) =>
  new Date(d.getTime() - m * 60_000);

const decide = (
  now: Date,
  ageMin: number | null,
  trigger: "scheduled" | "manual" | "pre_notification",
) =>
  decideRefresh({
    now,
    trigger,
    timeZone: TZ,
    lastSuccessAt: ageMin === null ? null : minutesBefore(now, ageMin),
  });

describe("localHour", () => {
  it("is independent of the host timezone", () => {
    expect(localHour(new Date("2026-11-11T22:30:00Z"), TZ)).toBe(5); // 05:30 next day in Bangkok
    expect(localHour(new Date("2026-11-11T17:00:00Z"), TZ)).toBe(0); // midnight, not 24
  });
});

describe("decideRefresh", () => {
  it("always refreshes when nothing was ever fetched", () => {
    expect(decide(bkk("2026-11-11T03:00:00"), null, "scheduled")).toEqual({
      refresh: true,
    });
  });

  it.each(["scheduled", "manual", "pre_notification"] as const)(
    "skips %s when the last success is under 15 minutes old",
    (trigger) => {
      expect(decide(bkk("2026-11-11T10:00:00"), 14, trigger)).toEqual({
        refresh: false,
        reason: "fresh_enough",
      });
    },
  );

  it("treats a future last-success (clock skew) as fresh", () => {
    expect(decide(bkk("2026-11-11T10:00:00"), -5, "manual")).toMatchObject({
      refresh: false,
    });
  });

  it("lets manual and pre-notification refresh at exactly 15 minutes", () => {
    expect(decide(bkk("2026-11-11T10:00:00"), 15, "manual")).toEqual({
      refresh: true,
    });
    expect(decide(bkk("2026-11-11T06:10:00"), 15, "pre_notification")).toEqual({
      refresh: true,
    });
  });

  describe("scheduled, daytime 05:00-20:00 (hourly)", () => {
    it("is not due well before an hour", () => {
      expect(decide(bkk("2026-11-11T10:00:00"), 30, "scheduled")).toEqual({
        refresh: false,
        reason: "not_due",
      });
    });
    it("is due at 60 minutes and, because ticks jitter, from 55 minutes", () => {
      expect(decide(bkk("2026-11-11T10:00:00"), 60, "scheduled")).toEqual({
        refresh: true,
      });
      expect(decide(bkk("2026-11-11T10:00:00"), 55, "scheduled")).toEqual({
        refresh: true,
      });
      expect(decide(bkk("2026-11-11T10:00:00"), 54, "scheduled")).toMatchObject(
        { refresh: false },
      );
    });
    it("starts at 05:00 sharp", () => {
      expect(decide(bkk("2026-11-11T05:00:00"), 60, "scheduled")).toEqual({
        refresh: true,
      });
      expect(decide(bkk("2026-11-11T04:59:00"), 60, "scheduled")).toMatchObject(
        { refresh: false },
      );
    });
    it("ends before 20:00", () => {
      expect(decide(bkk("2026-11-11T19:59:00"), 60, "scheduled")).toEqual({
        refresh: true,
      });
      expect(decide(bkk("2026-11-11T20:00:00"), 60, "scheduled")).toMatchObject(
        { refresh: false },
      );
    });
  });

  describe("scheduled, outside 05:00-20:00 (every 3 hours)", () => {
    it("is not due at 2 hours, due from 175 minutes", () => {
      expect(decide(bkk("2026-11-11T23:00:00"), 120, "scheduled")).toEqual({
        refresh: false,
        reason: "not_due",
      });
      expect(decide(bkk("2026-11-11T23:00:00"), 175, "scheduled")).toEqual({
        refresh: true,
      });
      expect(
        decide(bkk("2026-11-11T23:00:00"), 174, "scheduled"),
      ).toMatchObject({ refresh: false });
    });
  });
});
