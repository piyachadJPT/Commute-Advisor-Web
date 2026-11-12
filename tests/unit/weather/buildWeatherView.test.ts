import { describe, expect, it } from "vitest";
import { windowHours, mapWindow } from "@/features/commute/domain/windowMapper";
import { asLocalDate, asLocalTime } from "@/features/commute/domain/tz";
import { buildWeatherView } from "@/features/weather/domain/buildWeatherView";
import { DATE, TZ, bkk, series, settings } from "../commute/helpers";

const D = asLocalDate(DATE);
const rows = (probs: Record<string, number | null>) =>
  series(
    "home",
    DATE,
    Object.fromEntries(
      Object.entries(probs).map(([k, p]) => [k, { prob: p, mm: 0.4 }]),
    ),
  );

describe("windowHours", () => {
  it("gives fractional hours and the label hour of each bucket", () => {
    const w = mapWindow("departure", D, asLocalTime("08:20"), 60, TZ);
    const h = windowHours(w, TZ);
    expect(h.startHour).toBeCloseTo(8 + 20 / 60);
    expect(h.endHour).toBeCloseTo(9 + 20 / 60);
    expect(h.buckets).toEqual([9, 10]);
  });
  it("keeps labels increasing across midnight", () => {
    const w = mapWindow("return", D, asLocalTime("23:30"), 60, TZ);
    expect(windowHours(w, TZ).buckets).toEqual([24, 25]);
  });
});

describe("buildWeatherView", () => {
  it("always has 24 labelled hours, 01:00 to 24:00, and marks which have data", () => {
    const v = buildWeatherView({
      rows: rows({ "09:00": 10, "10:00": 60 }),
      date: D,
      settings,
    });
    expect(v.hours).toHaveLength(24);
    expect(v.hours.map((h) => h.hour)).toEqual(
      Array.from({ length: 24 }, (_, i) => i + 1),
    );
    expect(v.hours[8]).toMatchObject({
      hour: 9,
      hasRow: true,
      probability: 10,
      precipitation: 0.4,
    });
    expect(v.hours[11]).toMatchObject({
      hour: 12,
      hasRow: false,
      probability: null,
    });
    expect(v.hours[23]?.time).toEqual(bkk("2026-11-12", "00:00")); // label 24 is the next midnight
  });

  it("adds PM2.5 per hour from the air rows, null where there is none", () => {
    const air = [
      {
        time: bkk(DATE, "09:00"),
        location: "home" as const,
        pm25: 38.4,
        pm10: null,
      },
      {
        time: bkk(DATE, "10:00"),
        location: "home" as const,
        pm25: null,
        pm10: null,
      },
    ];
    const v = buildWeatherView({
      rows: rows({ "09:00": 10, "10:00": 10, "11:00": 10 }),
      air,
      date: D,
      settings,
    });
    expect(v.hours.slice(8, 11).map((h) => h.pm25)).toEqual([38.4, null, null]);
  });

  it("tags buckets with the commute window they belong to", () => {
    const v = buildWeatherView({
      rows: rows({ "09:00": 1, "10:00": 1, "11:00": 1, "19:00": 1 }),
      date: D,
      settings,
    });
    const trip = (hour: number) => v.hours[hour - 1]?.trip;
    expect([trip(8), trip(9), trip(10), trip(11), trip(19), trip(20)]).toEqual([
      null,
      "departure",
      "departure",
      null,
      "return",
      null,
    ]);
    expect(v.windows).toHaveLength(2);
    expect(v.windows[1]).toMatchObject({
      type: "return",
      startHour: 18,
      endHour: 19,
    });
  });

  it("reports the peak probability and where it happens, ignoring nulls", () => {
    const v = buildWeatherView({
      rows: rows({ "09:00": 20, "10:00": null, "14:00": 70, "19:00": 70 }),
      date: D,
      settings,
    });
    expect(v.peak).toEqual({ probability: 70, hour: 14 }); // first of equal peaks
    expect(buildWeatherView({ rows: [], date: D, settings }).peak).toBeNull();
  });

  it("does not read another day's rows into this day", () => {
    const other = series("home", "2026-11-12", { "09:00": { prob: 99 } });
    const v = buildWeatherView({ rows: other, date: D, settings });
    expect(v.hours.every((h) => !h.hasRow)).toBe(true);
  });
});
