import { describe, expect, it } from "vitest";
import {
  BACKFILL_MARKER,
  backfillRange,
  distanceKm,
  planBackfill,
  rainProbability,
  toDomainRows,
} from "../../scripts/backfill-core";
import { asLocalDate } from "@/features/commute/domain/tz";
import type { HourlyRow } from "@/features/forecast/data/openMeteoClient";
import { bkk, settings } from "./commute/helpers";

describe("rainProbability (a stand-in for the forecast, built from rain that fell)", () => {
  it("a dry hour is 5%, rising to 25% only as the air gets humid", () => {
    expect(rainProbability(0, 0, 0, 40)).toBe(5);
    expect(rainProbability(0, 0, 0, 60)).toBe(5);
    expect(rainProbability(0, 0, 0, 80)).toBe(15);
    expect(rainProbability(0, 0, 0, 100)).toBe(25);
    expect(rainProbability(0, 0, 0, null)).toBe(5);
  });
  it("rain lifts it, more rain lifts it more, and it never passes 95%", () => {
    const at = (mm: number) => rainProbability(0, mm, 0, 70);
    expect(at(0.1)).toBe(29);
    expect(at(0.5)).toBe(55);
    expect(at(1)).toBe(74);
    expect(at(2)).toBe(89);
    expect(at(50)).toBe(95);
    expect(at(0.1)).toBeLessThan(at(0.5)!);
  });
  it("rain in a neighbouring hour counts for half", () => {
    expect(rainProbability(2, 0, 0, 70)).toBeGreaterThan(
      rainProbability(0, 0, 0, 70)!,
    );
    expect(rainProbability(2, 0, 0, 70)).toBeLessThan(
      rainProbability(0, 2, 0, 70)!,
    );
  });
  it("an hour with no data stays null, and a missing neighbour is not an error", () => {
    expect(rainProbability(1, null, 1, 90)).toBeNull();
    expect(rainProbability(null, 0.5, null, 70)).toBe(55);
  });
});

const row = (time: string, over: Partial<HourlyRow> = {}): HourlyRow => ({
  forecast_time: bkk("2026-11-10", time).toISOString(),
  temperature: 28,
  humidity: 70,
  precipitation_probability: null,
  precipitation: 0,
  rain: 0,
  showers: null,
  weather_code: 3,
  wind_speed: 5,
  ...over,
});

describe("toDomainRows", () => {
  it("sorts by time, keeps the weather and fills the probability from neighbouring rain", () => {
    const rows = toDomainRows(
      [row("10:00", { precipitation: 1 }), row("09:00"), row("11:00")],
      "home",
    );
    expect(rows.map((r) => r.time.toISOString())).toEqual([
      bkk("2026-11-10", "09:00").toISOString(),
      bkk("2026-11-10", "10:00").toISOString(),
      bkk("2026-11-10", "11:00").toISOString(),
    ]);
    expect(rows[1]).toMatchObject({
      location: "home",
      temperature: 28,
      precipitation: 1,
    });
    expect(rows[1]!.precipitationProbability).toBeGreaterThan(
      rows[0]!.precipitationProbability!,
    );
    expect(rows[0]!.precipitationProbability).toBeGreaterThan(5); // next hour is wet
  });
});

// Dry all day on 2026-11-09 (Mon) and 2026-11-10 (Tue); heavy rain 18:00-19:00 on Wed 11 Nov.
function hours(
  date: string,
  rainy: string[] = [],
  missing: string[] = [],
): HourlyRow[] {
  return Array.from({ length: 24 }, (_, h) => {
    const t = `${String(h).padStart(2, "0")}:00`;
    const r: HourlyRow = {
      forecast_time: bkk(date, t).toISOString(),
      temperature: 28,
      humidity: 70,
      precipitation_probability: null,
      precipitation: rainy.includes(t) ? 3 : 0,
      rain: 0,
      showers: null,
      weather_code: 3,
      wind_speed: 5,
    };
    return missing.includes(t) ? { ...r, precipitation: null } : r;
  });
}

function plan(opts: {
  rainy?: string[];
  missing?: string[];
  skipped?: string[];
  from?: string;
  to?: string;
  days?: number;
}) {
  const h = (loc: "home" | "work") =>
    toDomainRows(
      [
        ...hours("2026-11-08"), // Sunday
        ...hours("2026-11-09"),
        ...hours("2026-11-10"),
        ...hours("2026-11-11", opts.rainy, opts.missing),
        ...hours("2026-11-12"),
      ],
      loc,
    );
  return planBackfill({
    from: asLocalDate(opts.from ?? "2026-11-08"),
    to: asLocalDate(opts.to ?? "2026-11-12"),
    settings: { ...settings, commuteDays: opts.days ?? 31 },
    home: h("home"),
    work: h("work"),
    skipped: new Set(opts.skipped ?? []),
  });
}

describe("planBackfill", () => {
  it("makes one locked row per commute day, none for the weekend", () => {
    const { records, commuteDays } = plan({});
    expect(commuteDays).toBe(4); // Mon-Thu inside Sun 8 - Thu 12
    expect(records.map((r) => r.recommendation_date)).toEqual([
      "2026-11-09",
      "2026-11-10",
      "2026-11-11",
      "2026-11-12",
    ]);
  });

  it("recommends a motorcycle on a dry day and a car when it rains on the way home", () => {
    const { records } = plan({ rainy: ["19:00"] });
    const byDate = Object.fromEntries(
      records.map((r) => [r.recommendation_date, r]),
    );
    expect(byDate["2026-11-10"]).toMatchObject({
      vehicle: "motorcycle",
      reason_code: "bothLow",
    });
    expect(byDate["2026-11-11"]).toMatchObject({
      vehicle: "car",
      reason_code: "returnHigh",
      return_risk: 93,
    });
  });

  it("locks each day at its departure start, with the forecast 'fetched' at 06:00", () => {
    const r = plan({}).records[0]!;
    expect(r.locked_at).toBe(bkk("2026-11-09", "08:20").toISOString());
    expect(r.created_at).toBe(r.locked_at);
    expect(r.forecast_fetched_at).toBe(
      bkk("2026-11-09", "06:00").toISOString(),
    );
    expect(r.data_complete).toBe(true);
    expect(r.return_risk_latest).toBe(r.return_risk);
  });

  it("marks every row so --undo can find it", () => {
    for (const r of plan({ rainy: ["19:00"] }).records) {
      expect(r.reason_params[BACKFILL_MARKER]).toBe(true);
    }
  });

  it("leaves out skipped days, and days whose weather is missing, without inventing 'unknown'", () => {
    const { records, incompleteDays } = plan({
      skipped: ["2026-11-10"],
      missing: ["19:00"],
    });
    expect(records.map((r) => r.recommendation_date)).toEqual([
      "2026-11-09",
      "2026-11-12",
    ]);
    expect(incompleteDays).toBe(1); // the 11th has no 19:00
    expect(records.every((r) => r.vehicle !== "unknown")).toBe(true);
  });

  it("follows the user's commute days", () => {
    const { records } = plan({ days: 1 | 2 }); // Mon, Tue only
    expect(records.map((r) => r.recommendation_date)).toEqual([
      "2026-11-09",
      "2026-11-10",
    ]);
  });

  it("is deterministic", () => {
    expect(plan({ rainy: ["19:00"] })).toEqual(plan({ rainy: ["19:00"] }));
  });
});

describe("backfillRange", () => {
  it("goes back about N months and stops yesterday, by the local date", () => {
    // 01:30 on Thu 12 Nov in Bangkok is still the 11th in UTC: today is the 12th, yesterday the 11th.
    const r = backfillRange(
      new Date("2026-11-11T18:30:00Z"),
      6,
      "Asia/Bangkok",
    );
    expect(r.to).toBe("2026-11-11");
    expect(r.from).toBe("2026-05-14"); // 182 days before the 12th
  });
});

describe("distanceKm", () => {
  it("is zero for the same point and about 1.11 km per 0.01 degree of latitude", () => {
    expect(
      distanceKm({ lat: 13.75, lon: 100.5 }, { lat: 13.75, lon: 100.5 }),
    ).toBe(0);
    expect(
      distanceKm({ lat: 13.75, lon: 100.5 }, { lat: 13.76, lon: 100.5 }),
    ).toBeCloseTo(1.11, 1);
  });
  it("matches a known pair: Bangkok to Chiang Mai is about 580 km", () => {
    expect(
      distanceKm(
        { lat: 13.7563, lon: 100.5018 },
        { lat: 18.7883, lon: 98.9853 },
      ),
    ).toBeGreaterThan(570);
    expect(
      distanceKm(
        { lat: 13.7563, lon: 100.5018 },
        { lat: 18.7883, lon: 98.9853 },
      ),
    ).toBeLessThan(590);
  });
});
