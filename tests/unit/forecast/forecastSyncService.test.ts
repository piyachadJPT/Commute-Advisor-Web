import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import {
  OpenMeteoError,
  type HourlyRow,
} from "@/features/forecast/data/openMeteoClient";
import type { AirQualityRow } from "@/features/forecast/data/airQualityClient";

vi.mock("@/features/settings/data/settingsRepo", () => ({
  getUserLocations: vi.fn(),
}));
vi.mock("@/features/forecast/data/forecastRepo", () => ({
  getLastSuccessfulFetch: vi.fn(),
  saveForecastBatch: vi.fn(),
}));

vi.mock("@/features/forecast/data/airQualityRepo", () => ({
  saveAirQualityBatch: vi.fn(),
}));

import { saveAirQualityBatch } from "@/features/forecast/data/airQualityRepo";
import {
  getLastSuccessfulFetch,
  saveForecastBatch,
} from "@/features/forecast/data/forecastRepo";
import { getUserLocations } from "@/features/settings/data/settingsRepo";
import { syncUserForecasts } from "@/features/forecast/forecastSyncService";

const supabase = {} as SupabaseClient<Database>;
const NOW = new Date("2026-11-11T03:00:00Z"); // 10:00 Bangkok
const home = {
  key: "home",
  latitude: 13.756,
  longitude: 100.502,
  name: "Home",
} as const;
const work = {
  key: "work",
  latitude: 13.727,
  longitude: 100.524,
  name: "Work",
} as const;
const row: HourlyRow = {
  forecast_time: "2026-11-11T02:00:00.000Z",
  temperature: 28,
  humidity: 70,
  precipitation_probability: 20,
  precipitation: 0,
  rain: 0,
  showers: 0,
  weather_code: 3,
  wind_speed: 5,
  apparent_temperature: null,
  uv_index: null,
  wind_gusts: null,
  visibility: null,
  is_day: null,
};

const airRow: AirQualityRow = {
  forecast_time: "2026-11-11T02:00:00.000Z",
  pm2_5: 20,
  pm10: 30,
};

const run = (
  fetchForecast: (o: { latitude: number }) => Promise<HourlyRow[]>,
  trigger: "scheduled" | "manual" | "pre_notification" = "scheduled",
  fetchAirQuality: (o: {
    latitude: number;
  }) => Promise<AirQualityRow[]> = async () => [airRow],
) =>
  syncUserForecasts(
    {
      supabase,
      fetchForecast: fetchForecast as never,
      fetchAirQuality: fetchAirQuality as never,
    },
    { userId: "u1", trigger, now: NOW },
  );

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getUserLocations).mockResolvedValue({
    timeZone: "Asia/Bangkok",
    locations: [home, work],
  });
  vi.mocked(getLastSuccessfulFetch).mockResolvedValue(null);
  vi.mocked(saveForecastBatch).mockResolvedValue({ ok: true, saved: 1 });
  vi.mocked(saveAirQualityBatch).mockResolvedValue({ ok: true, saved: 1 });
});

describe("syncUserForecasts", () => {
  it("fetches and saves both locations with a success log", async () => {
    const results = await run(async () => [row]);
    expect(results).toEqual([
      { key: "home", status: "success", records: 1 },
      { key: "work", status: "success", records: 1 },
    ]);
    const calls = vi.mocked(saveForecastBatch).mock.calls.map((c) => c[1]);
    expect(calls.map((c) => c.locationKey)).toEqual(["home", "work"]);
    expect(calls[0]).toMatchObject({
      rows: [row],
      fetchedAt: NOW,
      latitude: 13.756,
      log: { trigger: "scheduled", status: "success" },
    });
    expect(calls[1]).toMatchObject({ latitude: 13.727 });
  });

  it("saves the other location when one fails, logging the failure with empty rows", async () => {
    const results = await run(async ({ latitude }) => {
      if (latitude === 13.756)
        throw new OpenMeteoError("rate_limited", "429 after 3", 429);
      return [row];
    });
    expect(results.map((r) => r.status)).toEqual(["failed", "success"]);
    const [failedCall, okCall] = vi
      .mocked(saveForecastBatch)
      .mock.calls.map((c) => c[1]);
    expect(failedCall).toMatchObject({
      locationKey: "home",
      rows: [], // good cache is untouched: only the log row is written
      log: { status: "failed", responseCode: 429 },
    });
    expect(okCall).toMatchObject({ locationKey: "work", rows: [row] });
  });

  it("never writes rows for an invalid response", async () => {
    await run(async () => {
      throw new OpenMeteoError("invalid", "bad shape", 200);
    });
    for (const [, input] of vi.mocked(saveForecastBatch).mock.calls) {
      expect(input.rows).toEqual([]);
      expect(input.log.status).toBe("failed");
    }
  });

  it("skips a recently fetched location without calling the API, and logs only for manual", async () => {
    vi.mocked(getLastSuccessfulFetch).mockResolvedValue(
      new Date(NOW.getTime() - 5 * 60_000),
    );
    const fetchForecast = vi.fn();

    const scheduled = await run(fetchForecast as never, "scheduled");
    expect(scheduled.map((r) => r.status)).toEqual(["skipped", "skipped"]);
    expect(saveForecastBatch).not.toHaveBeenCalled();

    await run(fetchForecast as never, "manual");
    expect(fetchForecast).not.toHaveBeenCalled();
    const logs = vi.mocked(saveForecastBatch).mock.calls.map((c) => c[1]);
    expect(logs).toHaveLength(2);
    expect(logs[0]).toMatchObject({
      rows: [],
      log: { trigger: "manual", status: "skipped" },
    });
  });

  it("reports a location that is not configured and syncs the other", async () => {
    vi.mocked(getUserLocations).mockResolvedValue({
      timeZone: "Asia/Bangkok",
      locations: [work],
    });
    const results = await run(async () => [row]);
    expect(results.map((r) => [r.key, r.status])).toEqual([
      ["home", "not_configured"],
      ["work", "success"],
    ]);
  });

  it("returns not_configured for both when the user has no settings row", async () => {
    vi.mocked(getUserLocations).mockResolvedValue(null);
    const fetchForecast = vi.fn();
    const results = await run(fetchForecast as never);
    expect(results.map((r) => r.status)).toEqual([
      "not_configured",
      "not_configured",
    ]);
    expect(fetchForecast).not.toHaveBeenCalled();
  });

  it("reports location_changed when the database refuses a stale batch", async () => {
    vi.mocked(saveForecastBatch).mockResolvedValueOnce({
      ok: false,
      locationChanged: true,
      message: "location_changed",
    });
    const results = await run(async () => [row]);
    expect(results[0]).toMatchObject({
      key: "home",
      status: "location_changed",
    });
    expect(results[1]).toMatchObject({ key: "work", status: "success" });
  });

  it("keeps going when the database errors for one location", async () => {
    vi.mocked(getLastSuccessfulFetch).mockRejectedValueOnce(
      new Error("db down"),
    );
    const results = await run(async () => [row]);
    expect(results[0]).toMatchObject({
      key: "home",
      status: "failed",
      error: "db down",
    });
    expect(results[1]).toMatchObject({ key: "work", status: "success" });
  });

  it("refreshes a stale location on a manual trigger", async () => {
    vi.mocked(getLastSuccessfulFetch).mockResolvedValue(
      new Date(NOW.getTime() - 20 * 60_000),
    );
    const fetchForecast = vi.fn().mockResolvedValue([row]);
    await run(fetchForecast as never, "manual");
    expect(fetchForecast).toHaveBeenCalledTimes(2);
  });
});

describe("syncUserForecasts: air quality (plan §23.5)", () => {
  const airCalls = () =>
    vi.mocked(saveAirQualityBatch).mock.calls.map((c) => c[1]);

  it("saves air quality for both locations after the forecast, with a success log", async () => {
    await run(async () => [row]);
    expect(airCalls().map((c) => c.locationKey)).toEqual(["home", "work"]);
    expect(airCalls()[0]).toMatchObject({
      rows: [airRow],
      fetchedAt: NOW,
      latitude: 13.756,
      log: { trigger: "scheduled", status: "success" },
    });
  });

  it("a failing air-quality API logs a failure and leaves the forecast result untouched", async () => {
    const results = await run(
      async () => [row],
      "scheduled",
      async () => {
        throw new OpenMeteoError("rate_limited", "429 after 3", 429);
      },
    );
    expect(results).toEqual([
      { key: "home", status: "success", records: 1 },
      { key: "work", status: "success", records: 1 },
    ]);
    expect(airCalls()).toHaveLength(2);
    expect(airCalls()[0]).toMatchObject({
      rows: [], // nothing cached is overwritten
      log: { status: "failed", responseCode: 429 },
    });
    // The forecast batches are the same as without any air-quality problem.
    expect(
      vi.mocked(saveForecastBatch).mock.calls.map((c) => c[1].log.status),
    ).toEqual(["success", "success"]);
  });

  it("still fetches air quality when the forecast fails, and reports only the forecast", async () => {
    const results = await run(async () => {
      throw new OpenMeteoError("http", "HTTP 503", 503);
    });
    expect(results.map((r) => r.status)).toEqual(["failed", "failed"]);
    expect(airCalls().map((c) => c.log.status)).toEqual(["success", "success"]);
  });

  it("an air-quality database error never throws or changes the forecast result", async () => {
    vi.mocked(saveAirQualityBatch).mockRejectedValue(new Error("db down"));
    const results = await run(async () => [row]);
    expect(results.map((r) => r.status)).toEqual(["success", "success"]);
  });

  it("uses its own last-fetch time, so a fresh forecast does not skip air quality", async () => {
    vi.mocked(getLastSuccessfulFetch).mockImplementation(
      async (_s, _u, _k, source) =>
        source === "air_quality" ? null : new Date(NOW.getTime() - 5 * 60_000),
    );
    const fetchForecast = vi.fn();
    await run(fetchForecast as never);
    expect(fetchForecast).not.toHaveBeenCalled(); // forecast is fresh
    expect(airCalls().map((c) => c.log.status)).toEqual(["success", "success"]);
    expect(
      vi.mocked(getLastSuccessfulFetch).mock.calls.map((c) => c[3]),
    ).toContain("air_quality");
  });

  it("skips fresh air quality, and logs the skip only for non-scheduled triggers", async () => {
    vi.mocked(getLastSuccessfulFetch).mockResolvedValue(
      new Date(NOW.getTime() - 5 * 60_000),
    );
    const fetchAirQuality = vi.fn();
    await run(vi.fn() as never, "scheduled", fetchAirQuality as never);
    expect(airCalls()).toHaveLength(0);
    await run(vi.fn() as never, "manual", fetchAirQuality as never);
    expect(fetchAirQuality).not.toHaveBeenCalled();
    expect(airCalls().map((c) => c.log)).toEqual([
      { trigger: "manual", status: "skipped" },
      { trigger: "manual", status: "skipped" },
    ]);
  });

  it("does nothing for a location that is not configured", async () => {
    vi.mocked(getUserLocations).mockResolvedValue({
      timeZone: "Asia/Bangkok",
      locations: [work],
    });
    await run(async () => [row]);
    expect(airCalls().map((c) => c.locationKey)).toEqual(["work"]);
  });
});
