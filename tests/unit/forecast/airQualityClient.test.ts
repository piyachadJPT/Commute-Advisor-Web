import { describe, expect, it, vi } from "vitest";
import {
  airQualityResponseSchema,
  buildAirQualityUrl,
  fetchAirQuality,
  mapAirQuality,
} from "@/features/forecast/data/airQualityClient";
import { OpenMeteoError } from "@/features/forecast/data/openMeteoClient";

const ok = (hourly: Record<string, unknown>, offset = 25200) =>
  new Response(JSON.stringify({ utc_offset_seconds: offset, hourly }), {
    status: 200,
  });

const hourly = {
  time: ["2026-11-11T08:00", "2026-11-11T09:00"],
  pm2_5: [14.2, 38.6],
  pm10: [20.1, 55],
};
const noSleep = () => Promise.resolve();

describe("mapAirQuality", () => {
  it("converts local Bangkok labels to UTC instants and maps both fields", () => {
    const rows = mapAirQuality(
      airQualityResponseSchema.parse({ utc_offset_seconds: 25200, hourly }),
    );
    expect(rows).toEqual([
      { forecast_time: "2026-11-11T01:00:00.000Z", pm2_5: 14.2, pm10: 20.1 },
      { forecast_time: "2026-11-11T02:00:00.000Z", pm2_5: 38.6, pm10: 55 },
    ]);
  });

  it("keeps null as null, treats a missing variable and a short array as null", () => {
    const rows = mapAirQuality(
      airQualityResponseSchema.parse({
        utc_offset_seconds: 25200,
        hourly: { time: hourly.time, pm2_5: [null] }, // short, and pm10 missing
      }),
    );
    expect(rows.map((r) => [r.pm2_5, r.pm10])).toEqual([
      [null, null],
      [null, null],
    ]);
  });

  it("nulls out-of-range values", () => {
    const rows = mapAirQuality(
      airQualityResponseSchema.parse({
        utc_offset_seconds: 25200,
        hourly: { time: hourly.time, pm2_5: [-1, 5000], pm10: [-3, 12] },
      }),
    );
    expect(rows[0]).toMatchObject({ pm2_5: null, pm10: null });
    expect(rows[1]).toMatchObject({ pm2_5: null, pm10: 12 });
  });

  it("rejects an empty response and duplicate times", () => {
    expect(() =>
      mapAirQuality(
        airQualityResponseSchema.parse({
          utc_offset_seconds: 0,
          hourly: { time: [] },
        }),
      ),
    ).toThrow(OpenMeteoError);
    expect(() =>
      mapAirQuality(
        airQualityResponseSchema.parse({
          utc_offset_seconds: 0,
          hourly: { time: ["2026-11-11T08:00", "2026-11-11T08:00"] },
        }),
      ),
    ).toThrow(/Duplicate/);
  });
});

describe("airQualityResponseSchema", () => {
  it.each([
    ["missing hourly", { utc_offset_seconds: 0 }],
    ["missing time", { utc_offset_seconds: 0, hourly: {} }],
    ["missing offset", { hourly: { time: [] } }],
    [
      "string in a numeric array",
      {
        utc_offset_seconds: 0,
        hourly: { time: ["2026-11-11T08:00"], pm2_5: ["x"] },
      },
    ],
  ])("rejects %s", (_n, body) => {
    expect(airQualityResponseSchema.safeParse(body).success).toBe(false);
  });
});

describe("buildAirQualityUrl", () => {
  it("asks for PM2.5 and PM10, 3 days and the Bangkok timezone", () => {
    const url = new URL(buildAirQualityUrl(13.756, 100.502));
    expect(url.origin + url.pathname).toBe(
      "https://air-quality-api.open-meteo.com/v1/air-quality",
    );
    expect(url.searchParams.get("latitude")).toBe("13.756");
    expect(url.searchParams.get("hourly")).toBe("pm2_5,pm10");
    expect(url.searchParams.get("forecast_days")).toBe("3");
    expect(url.searchParams.get("timezone")).toBe("Asia/Bangkok");
  });
});

describe("fetchAirQuality", () => {
  const base = { latitude: 13.756, longitude: 100.502, sleep: noSleep };

  it("returns mapped rows on success", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok(hourly));
    const rows = await fetchAirQuality({ ...base, fetchImpl });
    expect(rows).toHaveLength(2);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain("air-quality-api");
    expect((fetchImpl.mock.calls[0]?.[1] as RequestInit).signal).toBeInstanceOf(
      AbortSignal,
    );
  });

  it("retries 429 with backoff and gives up after 3 attempts", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fetchImpl = vi
      .fn()
      .mockImplementation(async () => new Response("", { status: 429 }));
    await expect(
      fetchAirQuality({ ...base, sleep, fetchImpl }),
    ).rejects.toMatchObject({ kind: "rate_limited", status: 429 });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([1000, 2000]);
  });

  it("surfaces an HTTP error reason without retrying", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: true, reason: "bad variable" }), {
        status: 400,
      }),
    );
    await expect(fetchAirQuality({ ...base, fetchImpl })).rejects.toMatchObject(
      {
        kind: "http",
        message: expect.stringContaining("bad variable"),
      },
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects a wrong shape as invalid, so no cache is overwritten", async () => {
    await expect(
      fetchAirQuality({
        ...base,
        fetchImpl: vi.fn().mockResolvedValue(ok({ pm2_5: [1] })),
      }),
    ).rejects.toMatchObject({ kind: "invalid" });
  });

  it("reports a timeout and a network failure", async () => {
    const timeout = Object.assign(new Error("t"), { name: "TimeoutError" });
    await expect(
      fetchAirQuality({
        ...base,
        fetchImpl: vi.fn().mockRejectedValue(timeout),
      }),
    ).rejects.toMatchObject({ kind: "timeout" });
    await expect(
      fetchAirQuality({
        ...base,
        fetchImpl: vi.fn().mockRejectedValue(new TypeError("down")),
      }),
    ).rejects.toMatchObject({ kind: "network" });
  });
});
