import { describe, expect, it } from "vitest";
import {
  toSnapshot,
  type StoredRecommendation,
} from "@/features/commute/domain/locking";
import { computeRecommendation } from "@/features/commute/domain/recommend";
import { asLocalDate } from "@/features/commute/domain/tz";
import { buildDashboardView } from "@/features/dashboard/domain/buildView";
import { DATE, bkk, series, settings } from "../commute/helpers";

const names = { home: "Home", work: "Work" };
const D = asLocalDate(DATE); // Wednesday 2026-11-11

type Opts = {
  now?: Date;
  home?: ReturnType<typeof series>;
  work?: ReturnType<typeof series>;
  skipped?: string[];
  stored?: Record<string, StoredRecommendation>;
  target?: string;
};

const flat = (
  location: "home" | "work",
  date: string,
  probs: Record<string, number>,
) =>
  series(
    location,
    date,
    Object.fromEntries(
      Object.entries(probs).map(([k, p]) => [k, { prob: p, mm: 0.5 }]),
    ),
  );

function build(o: Opts = {}) {
  const now = o.now ?? bkk(DATE, "06:00");
  const home =
    o.home ?? flat("home", DATE, { "09:00": 10, "10:00": 10, "19:00": 10 });
  const work =
    o.work ?? flat("work", DATE, { "09:00": 10, "10:00": 10, "19:00": 10 });
  const fetched = bkk(DATE, "05:50");
  const target = asLocalDate(o.target ?? DATE);
  const computed = computeRecommendation({
    date: target,
    settings,
    home,
    work,
    homeFetchedAt: fetched,
    workFetchedAt: fetched,
    now,
  });
  return buildDashboardView({
    now,
    settings,
    names,
    home,
    work,
    homeFetchedAt: fetched,
    workFetchedAt: fetched,
    skipped: new Set(o.skipped ?? []),
    target,
    computed,
    stored: new Map(Object.entries(o.stored ?? {})),
  });
}

const lockedFrom = (
  v: ReturnType<typeof computeRecommendation>,
  returnRiskLatest: number | null,
) =>
  ({
    ...toSnapshot(v),
    lockedAt: bkk(DATE, "08:20"),
    returnRiskLatest,
  }) as StoredRecommendation;

describe("buildDashboardView", () => {
  it("maps windows and hourly series onto the user's own settings", () => {
    const v = build();
    expect(v.windows.departure.buckets).toEqual([9, 10]);
    expect(v.windows.departure.startHour).toBeCloseTo(8 + 20 / 60);
    expect(v.windows.departure.endHour).toBeCloseTo(9 + 20 / 60);
    expect(v.windows.return).toMatchObject({
      startHour: 18,
      endHour: 19,
      buckets: [19],
    });
    expect(v.hourly.home[9 - 5]).toBe(10); // 09:00 -> index 4
    expect(v.hourly.home[11 - 5]).toBeNull(); // no row
    expect(v.hourly.home).toHaveLength(18);
    expect(v.isToday).toBe(true);
    expect(v.canSkip).toBe(true);
    expect(v.vehicle).toBe("motorcycle");
  });

  it("keeps the frozen verdict and departure after the lock, but the return trip stays live", () => {
    // Locked this morning as a motorcycle day with 10% on both trips...
    const morning = computeRecommendation({
      date: D,
      settings,
      home: flat("home", DATE, { "09:00": 10, "10:00": 10, "19:00": 10 }),
      work: flat("work", DATE, { "09:00": 10, "10:00": 10, "19:00": 10 }),
      homeFetchedAt: bkk(DATE, "05:50"),
      workFetchedAt: bkk(DATE, "05:50"),
      now: bkk(DATE, "08:20"),
    });
    // ...and by noon the live forecast says 70% on the way home, 80% on the way in.
    const v = build({
      now: bkk(DATE, "12:00"),
      home: flat("home", DATE, { "09:00": 80, "10:00": 80, "19:00": 70 }),
      work: flat("work", DATE, { "09:00": 10, "10:00": 10, "19:00": 10 }),
      stored: { [DATE]: lockedFrom(morning, 10) },
    });
    expect(v.vehicle).toBe("motorcycle");
    expect(v.reason.code).toBe("bothLow");
    expect(v.departure.risk).toBe(10); // frozen, not 80
    expect(v.returnTrip.risk).toBe(70); // live
    expect(v.returnWarning).toBe(70);
  });

  it("no return warning when the locked day is a car, or the live risk is still below the threshold", () => {
    const carMorning = computeRecommendation({
      date: D,
      settings,
      home: flat("home", DATE, { "09:00": 80, "10:00": 80, "19:00": 10 }),
      work: flat("work", DATE, { "09:00": 10, "10:00": 10, "19:00": 10 }),
      homeFetchedAt: bkk(DATE, "05:50"),
      workFetchedAt: bkk(DATE, "05:50"),
      now: bkk(DATE, "08:20"),
    });
    expect(
      build({
        now: bkk(DATE, "12:00"),
        stored: { [DATE]: lockedFrom(carMorning, 10) },
      }).returnWarning,
    ).toBeNull();
    const motoMorning = build().vehicle;
    expect(motoMorning).toBe("motorcycle");
  });

  it("marks today as skipped only while the return window has not ended", () => {
    const skippedMorning = build({ skipped: [DATE], target: "2026-11-12" });
    expect(skippedMorning.skippedToday).toBe(true);
    expect(skippedMorning.isToday).toBe(false);
    expect(skippedMorning.canSkip).toBe(false);
    const skippedEvening = build({
      skipped: [DATE],
      target: "2026-11-12",
      now: bkk(DATE, "19:30"),
    });
    expect(skippedEvening.skippedToday).toBe(false);
  });

  it("shows a day beyond the forecast as having no forecast, never as a guess", () => {
    // Rows exist only for the 11th and 12th; the 13th and 16th have none.
    const home = [
      ...flat("home", DATE, { "09:00": 10, "10:00": 10, "19:00": 10 }),
      ...flat("home", "2026-11-12", { "09:00": 10, "10:00": 10, "19:00": 60 }),
    ];
    const work = [
      ...flat("work", DATE, { "09:00": 10, "10:00": 10, "19:00": 10 }),
      ...flat("work", "2026-11-12", { "09:00": 10, "10:00": 10, "19:00": 10 }),
    ];
    const v = build({ home, work });
    expect(v.nextDays.map((d) => d.vehicle)).toEqual(["car", null, null]);
    expect(v.nextDays[0]).toMatchObject({ departureRisk: 10, returnRisk: 60 });
    expect(v.nextDays[1]).toMatchObject({
      departureRisk: null,
      returnRisk: null,
    });
  });

  it("builds the week: past from stored rows, today and future from the forecast", () => {
    const monday = lockedFrom(
      computeRecommendation({
        date: asLocalDate("2026-11-09"),
        settings,
        home: flat("home", "2026-11-09", {
          "09:00": 60,
          "10:00": 10,
          "19:00": 10,
        }),
        work: flat("work", "2026-11-09", {
          "09:00": 10,
          "10:00": 10,
          "19:00": 10,
        }),
        homeFetchedAt: bkk("2026-11-09", "05:50"),
        workFetchedAt: bkk("2026-11-09", "05:50"),
        now: bkk("2026-11-09", "08:20"),
      }),
      10,
    );
    const v = build({ stored: { "2026-11-09": monday } });
    expect(v.week.map((d) => [d.kind, d.vehicle])).toEqual([
      ["past", "car"], // Monday, stored
      ["past", null], // Tuesday: never opened, so undecided
      ["today", "motorcycle"],
      ["future", null], // Thursday: no forecast rows
      ["future", null],
    ]);
    expect(v.week[0]?.maxRisk).toBe(60);
  });

  it("shows the nearest hourly row as 'now' and nothing when none is close", () => {
    const v = build({ now: bkk(DATE, "09:10") });
    expect(v.now[0]).toMatchObject({
      location: "home",
      placeName: "Home",
      rainProbability: 10,
      temperature: 28,
    });
    const far = build({ now: bkk(DATE, "15:00") }); // nearest row is 19:00, 4 h away
    expect(far.now[0]).toMatchObject({
      temperature: null,
      rainProbability: null,
      weatherCode: null,
    });
  });

  it("reports fetch time and staleness from the computed result", () => {
    const v = build();
    expect(v.fetchedAt).toEqual(bkk(DATE, "05:50"));
    expect(v.stale).toBe(false);
    expect(build({ now: bkk(DATE, "13:00") }).stale).toBe(true);
  });
});
