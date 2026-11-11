import { describe, expect, it } from "vitest";
import {
  isNotificationDue,
  isPreNotificationRefresh,
} from "@/features/notifications/domain/due";
import { asLocalDate, asLocalTime } from "@/features/commute/domain/tz";
import { TZ, bkk } from "../commute/helpers";

const DATE = "2026-11-11"; // Wednesday
const base = {
  today: asLocalDate(DATE),
  notificationTime: asLocalTime("06:30"),
  timeZone: TZ,
  commuteDays: 31,
  skipped: new Set<string>(),
};
const due = (time: string, over: Partial<typeof base> = {}) =>
  isNotificationDue({ ...base, ...over, now: bkk(DATE, time) });

describe("isNotificationDue (plan §13.1)", () => {
  it("is due from exactly notification_time", () => {
    expect(due("06:29")).toBe(false);
    expect(due("06:30")).toBe(true);
  });
  it("is due at +19 minutes and no longer at +20", () => {
    expect(due("06:49")).toBe(true);
    expect(due("06:50")).toBe(false);
  });
  it("is not due on a skipped day or a non-commute day", () => {
    expect(due("06:35", { skipped: new Set([DATE]) })).toBe(false);
    expect(due("06:35", { commuteDays: 1 | 2 })).toBe(false); // Mon, Tue only
  });
  it("uses the local date, not the UTC one", () => {
    // 06:35 on Thursday 12 Nov in Bangkok is still the 11th in UTC.
    const thursday = asLocalDate("2026-11-12");
    expect(
      isNotificationDue({
        ...base,
        today: thursday,
        now: bkk("2026-11-12", "06:35"),
      }),
    ).toBe(true);
  });
});

describe("isPreNotificationRefresh (plan §13.2)", () => {
  const pre = (time: string) =>
    isPreNotificationRefresh({ ...base, now: bkk(DATE, time) });
  it("is the tick 30 minutes before, but not 20 or 10 minutes before", () => {
    expect(pre("06:00")).toBe(true);
    expect(pre("05:59")).toBe(false); // 31 minutes before
    expect(pre("06:10")).toBe(false); // 20 minutes before
    expect(pre("06:20")).toBe(false);
  });
  it("covers the minutes in between", () => {
    expect(pre("06:05")).toBe(true);
    expect(pre("06:09")).toBe(true);
  });
});
