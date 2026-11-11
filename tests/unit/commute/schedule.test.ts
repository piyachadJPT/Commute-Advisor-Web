import { describe, expect, it } from "vitest";
import {
  COMMUTE_DAYS,
  isCommuteDay,
  nextCommuteDay,
  targetDate,
  type ScheduleSettings,
} from "@/features/commute/domain/schedule";
import { addDays, asLocalDate, weekdayOf } from "@/features/commute/domain/tz";
import { TZ, bkk } from "./helpers";

// 2026-11-11 is a Wednesday.
const settings: ScheduleSettings = {
  commuteDays: 31, // Mon-Fri
  returnTime: "18:00" as never,
  durationMinutes: 60,
  timeZone: TZ,
};
const d = asLocalDate;
const target = (
  date: string,
  time: string,
  over: Partial<ScheduleSettings> = {},
  skipped: string[] = [],
) =>
  targetDate({
    now: bkk(date, time),
    settings: { ...settings, ...over },
    skipped: new Set(skipped.map(d)),
  });

describe("date helpers", () => {
  it("weekdayOf: Monday is 1 ... Sunday is 7", () => {
    expect(weekdayOf(d("2026-11-09"))).toBe(1);
    expect(weekdayOf(d("2026-11-11"))).toBe(3);
    expect(weekdayOf(d("2026-11-15"))).toBe(7);
  });
  it("addDays crosses month and year boundaries", () => {
    expect(addDays(d("2026-11-30"), 1)).toBe("2026-12-01");
    expect(addDays(d("2026-12-31"), 1)).toBe("2027-01-01");
    expect(addDays(d("2026-03-01"), -1)).toBe("2026-02-28");
  });
  it("isCommuteDay reads the Mon=1 ... Sun=64 bitmask", () => {
    expect(isCommuteDay(d("2026-11-09"), 31)).toBe(true); // Mon
    expect(isCommuteDay(d("2026-11-13"), 31)).toBe(true); // Fri
    expect(isCommuteDay(d("2026-11-14"), 31)).toBe(false); // Sat
    expect(isCommuteDay(d("2026-11-15"), COMMUTE_DAYS.sun)).toBe(true);
    expect(isCommuteDay(d("2026-11-11"), 0)).toBe(false);
  });
});

describe("nextCommuteDay", () => {
  it("is strictly after the given date and skips weekends and skipped days", () => {
    expect(nextCommuteDay(d("2026-11-11"), 31, new Set())).toBe("2026-11-12");
    expect(nextCommuteDay(d("2026-11-13"), 31, new Set())).toBe("2026-11-16");
    expect(
      nextCommuteDay(d("2026-11-11"), 31, new Set([d("2026-11-12")])),
    ).toBe("2026-11-13");
  });
  it("is null when there are no commute days", () => {
    expect(nextCommuteDay(d("2026-11-11"), 0, new Set())).toBeNull();
  });
});

describe("targetDate (plan §5.6)", () => {
  it("before departure on a commute day -> today", () => {
    expect(target("2026-11-11", "06:00")).toBe("2026-11-11");
  });
  it("between the trips -> today", () => {
    expect(target("2026-11-11", "12:00")).toBe("2026-11-11");
  });
  it("just before the return window ends -> today; at the end -> next day", () => {
    expect(target("2026-11-11", "18:59")).toBe("2026-11-11");
    expect(target("2026-11-11", "19:00")).toBe("2026-11-12");
  });
  it("after the return -> next commute day", () => {
    expect(target("2026-11-11", "20:00")).toBe("2026-11-12");
  });
  it("Friday evening and the weekend -> Monday", () => {
    expect(target("2026-11-13", "20:00")).toBe("2026-11-16");
    expect(target("2026-11-14", "10:00")).toBe("2026-11-16");
    expect(target("2026-11-15", "10:00")).toBe("2026-11-16");
  });
  it("a skipped today -> the next commute day", () => {
    expect(target("2026-11-11", "06:00", {}, ["2026-11-11"])).toBe(
      "2026-11-12",
    );
  });
  it("a skipped Friday is followed by the weekend -> Monday", () => {
    expect(target("2026-11-13", "07:00", {}, ["2026-11-13"])).toBe(
      "2026-11-16",
    );
  });
  it("skips a skipped day after today's return too", () => {
    expect(target("2026-11-11", "20:00", {}, ["2026-11-12"])).toBe(
      "2026-11-13",
    );
  });
  it("is null with no commute days", () => {
    expect(target("2026-11-11", "06:00", { commuteDays: 0 })).toBeNull();
  });
  it("uses the local date, not the UTC date", () => {
    // 18:30Z on the 11th is 01:30 on Thu the 12th in Bangkok.
    expect(
      targetDate({
        now: new Date("2026-11-11T18:30:00Z"),
        settings,
        skipped: new Set(),
      }),
    ).toBe("2026-11-12");
  });
  it("honours a custom return window end", () => {
    expect(
      target("2026-11-11", "20:30", {
        returnTime: "19:30" as never,
        durationMinutes: 90,
      }),
    ).toBe("2026-11-11");
    expect(
      target("2026-11-11", "21:00", {
        returnTime: "19:30" as never,
        durationMinutes: 90,
      }),
    ).toBe("2026-11-12");
  });
});
