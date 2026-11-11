import { describe, expect, it } from "vitest";
import { bkk, compute, DATE } from "./helpers";

const low = { "09:00": 10, "10:00": 10, "19:00": 10 };

describe("computeRecommendation: vehicle, reason and metadata", () => {
  it("returns car with a returnHigh reason naming the trip, location and window", () => {
    const r = compute({ home: low, work: { ...low, "19:00": 70 } });
    expect(r.vehicle).toBe("car");
    expect(r.reason).toEqual({
      code: "returnHigh",
      params: {
        risk: 70,
        source: "work",
        window: "18:00–19:00",
        threshold: 50,
      },
    });
    expect(r.returnTrip).toMatchObject({
      risk: 70,
      riskSource: "work",
      riskLevel: "veryHigh",
    });
    expect(r.departure.risk).toBe(10);
    expect(r.dataComplete).toBe(true);
  });

  it("names the departure trip and its window when departure triggers", () => {
    const r = compute({ home: low, work: { ...low, "10:00": 55 } });
    expect(r.reason).toEqual({
      code: "departureHigh",
      params: {
        risk: 55,
        source: "work",
        window: "08:20–09:20",
        threshold: 50,
      },
    });
  });

  it("when both trips are high, explains with the higher one (tie: departure)", () => {
    const both = compute({
      home: { ...low, "09:00": 90, "19:00": 95 },
      work: low,
    });
    expect(both.vehicle).toBe("car");
    expect(both.reason.code).toBe("returnHigh");
    const tie = compute({
      home: { ...low, "09:00": 80, "19:00": 80 },
      work: low,
    });
    expect(tie.reason.code).toBe("departureHigh");
  });

  it("returns motorcycle with a bothLow reason and the highest value", () => {
    const r = compute({ home: { ...low, "10:00": 35 }, work: low });
    expect(r.vehicle).toBe("motorcycle");
    expect(r.reason).toEqual({
      code: "bothLow",
      params: { threshold: 50, max: 35 },
    });
  });

  it("49% on both trips is a motorcycle", () => {
    const r = compute({
      home: { "09:00": 49, "10:00": 49, "19:00": 49 },
      work: { "09:00": 49, "10:00": 49, "19:00": 49 },
    });
    expect(r.vehicle).toBe("motorcycle");
  });

  it("returns unknown and says which hours are missing, never treating them as 0", () => {
    const r = compute({ home: low, work: { "10:00": 10, "19:00": 10 } }); // work 09:00 has no row
    expect(r.vehicle).toBe("unknown");
    expect(r.dataComplete).toBe(false);
    expect(r.departure.risk).toBeNull();
    expect(r.reason).toEqual({
      code: "incomplete",
      params: {
        trip: "departure",
        source: "work",
        hours: "09:00",
        threshold: 50,
      },
    });
  });

  it("reports the return trip when only it is incomplete", () => {
    const r = compute({
      home: { "09:00": 10, "10:00": 10 },
      work: { "09:00": 10, "10:00": 10 },
    });
    expect(r.vehicle).toBe("unknown");
    expect(r.reason).toMatchObject({
      code: "incomplete",
      params: { trip: "return", hours: "19:00" },
    });
  });

  it("recommends car even when the other trip is incomplete, and notes it", () => {
    const r = compute({ home: { "19:00": 60 }, work: { "19:00": 20 } }); // departure has no data
    expect(r.vehicle).toBe("car");
    expect(r.dataComplete).toBe(false);
    expect(r.reason).toMatchObject({
      code: "returnHigh",
      params: { risk: 60, source: "home", otherIncomplete: true },
    });
  });

  it("states the custom threshold in the reason params", () => {
    const r = compute(
      { home: { ...low, "19:00": 45 }, work: low },
      { threshold: 40 },
    );
    expect(r.vehicle).toBe("car");
    expect(r.returnTrip.riskLevel).toBe("low");
    expect(r.reason).toMatchObject({
      code: "returnHigh",
      params: { risk: 45, threshold: 40 },
    });
  });

  it("uses the settings' windows, not hard-coded ones", () => {
    const r = compute(
      {
        home: { "08:00": 5, "09:00": 5, "17:00": 5, "18:00": 80 },
        work: { "08:00": 5, "09:00": 5, "17:00": 5, "18:00": 5 },
      },
      {
        departureTime: "07:00" as never,
        durationMinutes: 30,
        returnTime: "17:00" as never,
      },
    );
    expect(r.departure.window.bucketTimes).toHaveLength(1);
    expect(r.vehicle).toBe("car");
    expect(r.reason).toMatchObject({ params: { window: "17:00–17:30" } });
  });

  describe("freshness and fetch time", () => {
    it("fresh: forecastFetchedAt is the older of the two", () => {
      const r = compute({ home: low, work: low }, {}, bkk(DATE, "06:00"), {
        home: bkk(DATE, "05:00"),
        work: bkk(DATE, "05:50"),
      });
      expect(r.freshness).toBe("fresh");
      expect(r.forecastFetchedAt).toEqual(bkk(DATE, "05:00"));
    });
    it("stale after more than 6 hours", () => {
      const r = compute({ home: low, work: low }, {}, bkk(DATE, "12:00"), {
        home: bkk(DATE, "05:59"),
        work: bkk(DATE, "11:00"),
      });
      expect(r.freshness).toBe("stale");
    });
    it("none when a location was never fetched", () => {
      const r = compute({ home: low, work: low }, {}, bkk(DATE, "06:00"), {
        home: bkk(DATE, "05:50"),
        work: null,
      });
      expect(r.freshness).toBe("none");
      expect(r.forecastFetchedAt).toBeNull();
    });
  });

  it("is deterministic: same inputs give the same result", () => {
    const a = compute({ home: low, work: { ...low, "19:00": 70 } });
    const b = compute({ home: low, work: { ...low, "19:00": 70 } });
    expect(a).toEqual(b);
  });
});
