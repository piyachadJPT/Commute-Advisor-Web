import { describe, expect, it, vi } from "vitest";
import {
  OpenMeteoError,
  buildForecastUrl,
  fetchForecast,
  mapForecast,
} from "@/features/forecast/data/openMeteoClient";
import { forecastResponseSchema } from "@/features/forecast/data/openMeteoSchema";

const ok = (hourly: Record<string, unknown>, offset = 25200) =>
  new Response(JSON.stringify({ utc_offset_seconds: offset, hourly }), {
    status: 200,
  });

const fullHourly = {
  time: ["2026-11-11T08:00", "2026-11-11T09:00"],
  temperature_2m: [27.5, 28.1],
  relative_humidity_2m: [80, 75],
  precipitation_probability: [10, 60],
  precipitation: [0, 1.2],
  rain: [0, 1.0],
  showers: [0, 0.2],
  weather_code: [3, 61],
  wind_speed_10m: [5.4, 7.2],
  apparent_temperature: [31.2, 33.8],
  uv_index: [0.4, 5.6],
  wind_gusts_10m: [12.6, 25.1],
  visibility: [24140, 18000],
  is_day: [1, 1],
};

const noSleep = () => Promise.resolve();

describe("mapForecast", () => {
  it("converts local Bangkok labels to UTC instants and maps every field", () => {
    const rows = mapForecast(
      forecastResponseSchema.parse({
        utc_offset_seconds: 25200,
        hourly: fullHourly,
      }),
    );
    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual({
      forecast_time: "2026-11-11T02:00:00.000Z", // 09:00 +07:00
      temperature: 28.1,
      humidity: 75,
      precipitation_probability: 60,
      precipitation: 1.2,
      rain: 1.0,
      showers: 0.2,
      weather_code: 61,
      wind_speed: 7.2,
      apparent_temperature: 33.8,
      uv_index: 5.6,
      wind_gusts: 25.1,
      visibility: 18000,
      is_day: true,
    });
  });

  it("maps is_day 0 to false and anything else to null", () => {
    const rows = mapForecast(
      forecastResponseSchema.parse({
        utc_offset_seconds: 25200,
        hourly: {
          time: ["2026-11-11T20:00", "2026-11-11T21:00", "2026-11-11T22:00"],
          is_day: [0, 2, null],
        },
      }),
    );
    expect(rows.map((r) => r.is_day)).toEqual([false, null, null]);
  });

  it("nulls out-of-range values of the supporting fields", () => {
    const rows = mapForecast(
      forecastResponseSchema.parse({
        utc_offset_seconds: 25200,
        hourly: {
          time: ["2026-11-11T08:00"],
          apparent_temperature: [120],
          uv_index: [-1],
          wind_gusts_10m: [900],
          visibility: [-5],
        },
      }),
    );
    expect(rows[0]).toMatchObject({
      apparent_temperature: null,
      uv_index: null,
      wind_gusts: null,
      visibility: null,
    });
  });

  it("a response without the supporting fields still parses, with nulls", () => {
    const { time, temperature_2m } = fullHourly;
    const rows = mapForecast(
      forecastResponseSchema.parse({
        utc_offset_seconds: 25200,
        hourly: { time, temperature_2m },
      }),
    );
    expect(rows[0]).toMatchObject({
      temperature: 27.5,
      apparent_temperature: null,
      uv_index: null,
      wind_gusts: null,
      visibility: null,
      is_day: null,
    });
  });

  it("crosses midnight correctly", () => {
    const rows = mapForecast(
      forecastResponseSchema.parse({
        utc_offset_seconds: 25200,
        hourly: { time: ["2026-11-12T00:00"] },
      }),
    );
    expect(rows[0]?.forecast_time).toBe("2026-11-11T17:00:00.000Z");
  });

  it("keeps null as null, never 0", () => {
    const rows = mapForecast(
      forecastResponseSchema.parse({
        utc_offset_seconds: 25200,
        hourly: {
          ...fullHourly,
          precipitation_probability: [null, 40],
          precipitation: [null, null],
        },
      }),
    );
    expect(rows[0]?.precipitation_probability).toBeNull();
    expect(rows[0]?.precipitation).toBeNull();
    expect(rows[1]?.precipitation_probability).toBe(40);
  });

  it("treats a missing variable and a short array as null", () => {
    const rows = mapForecast(
      forecastResponseSchema.parse({
        utc_offset_seconds: 25200,
        hourly: {
          time: ["2026-11-11T08:00", "2026-11-11T09:00"],
          precipitation_probability: [30], // short
          // everything else missing
        },
      }),
    );
    expect(rows[0]?.precipitation_probability).toBe(30);
    expect(rows[1]?.precipitation_probability).toBeNull();
    expect(rows[0]?.temperature).toBeNull();
    expect(rows[0]?.wind_speed).toBeNull();
  });

  it("nulls out-of-range values and rounds integer columns", () => {
    const rows = mapForecast(
      forecastResponseSchema.parse({
        utc_offset_seconds: 25200,
        hourly: {
          time: ["2026-11-11T08:00", "2026-11-11T09:00"],
          precipitation_probability: [150, 55.6],
          relative_humidity_2m: [-5, 79.5],
          precipitation: [-1, 2],
          weather_code: [200, 95],
        },
      }),
    );
    expect(rows[0]).toMatchObject({
      precipitation_probability: null,
      humidity: null,
      precipitation: null,
      weather_code: null,
    });
    expect(rows[1]).toMatchObject({
      precipitation_probability: 56,
      humidity: 80,
      precipitation: 2,
      weather_code: 95,
    });
  });

  it("rejects an empty response and duplicate times", () => {
    expect(() =>
      mapForecast(
        forecastResponseSchema.parse({
          utc_offset_seconds: 0,
          hourly: { time: [] },
        }),
      ),
    ).toThrow(OpenMeteoError);
    expect(() =>
      mapForecast(
        forecastResponseSchema.parse({
          utc_offset_seconds: 0,
          hourly: { time: ["2026-11-11T08:00", "2026-11-11T08:00"] },
        }),
      ),
    ).toThrow(/Duplicate/);
  });
});

describe("forecastResponseSchema", () => {
  it.each([
    ["missing hourly", { utc_offset_seconds: 0 }],
    ["missing time", { utc_offset_seconds: 0, hourly: {} }],
    ["missing offset", { hourly: { time: [] } }],
    [
      "time without the expected format",
      { utc_offset_seconds: 0, hourly: { time: ["11/11/2026"] } },
    ],
    [
      "string in a numeric array",
      {
        utc_offset_seconds: 0,
        hourly: { time: ["2026-11-11T08:00"], rain: ["x"] },
      },
    ],
  ])("rejects %s", (_n, body) => {
    expect(forecastResponseSchema.safeParse(body).success).toBe(false);
  });
});

describe("buildForecastUrl", () => {
  it("requests the plan's fields, 3 days and the Bangkok timezone", () => {
    const url = new URL(buildForecastUrl(13.756, 100.502));
    expect(url.origin + url.pathname).toBe(
      "https://api.open-meteo.com/v1/forecast",
    );
    expect(url.searchParams.get("latitude")).toBe("13.756");
    expect(url.searchParams.get("forecast_days")).toBe("3");
    expect(url.searchParams.get("timezone")).toBe("Asia/Bangkok");
    expect(url.searchParams.get("hourly")).toBe(
      "temperature_2m,relative_humidity_2m,precipitation_probability,precipitation,rain,showers,weather_code,wind_speed_10m,apparent_temperature,uv_index,wind_gusts_10m,visibility,is_day",
    );
  });
});

describe("fetchForecast", () => {
  const base = { latitude: 13.756, longitude: 100.502, sleep: noSleep };

  it("returns mapped rows on success", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok(fullHourly));
    const rows = await fetchForecast({ ...base, fetchImpl });
    expect(rows).toHaveLength(2);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("retries 429 with exponential backoff and then succeeds", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 429 }))
      .mockResolvedValueOnce(new Response("", { status: 429 }))
      .mockResolvedValueOnce(ok(fullHourly));
    const rows = await fetchForecast({ ...base, sleep, fetchImpl });
    expect(rows).toHaveLength(2);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([1000, 2000]);
  });

  it("gives up after 3 attempts on 429", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fetchImpl = vi
      .fn()
      .mockImplementation(async () => new Response("", { status: 429 }));
    await expect(
      fetchForecast({ ...base, sleep, fetchImpl }),
    ).rejects.toMatchObject({
      kind: "rate_limited",
      status: 429,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("honours Retry-After but caps the wait", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("", { status: 429, headers: { "retry-after": "3" } }),
      )
      .mockResolvedValueOnce(
        new Response("", { status: 429, headers: { "retry-after": "999" } }),
      )
      .mockResolvedValueOnce(ok(fullHourly));
    await fetchForecast({ ...base, sleep, fetchImpl });
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([3000, 10_000]);
  });

  it("does not retry other HTTP errors and surfaces the reason", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: true, reason: "bad variable" }), {
        status: 400,
      }),
    );
    await expect(fetchForecast({ ...base, fetchImpl })).rejects.toMatchObject({
      kind: "http",
      status: 400,
      message: expect.stringContaining("bad variable"),
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("handles a 5xx with a non-JSON body", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response("<html>oops</html>", { status: 503 }));
    await expect(fetchForecast({ ...base, fetchImpl })).rejects.toMatchObject({
      kind: "http",
      status: 503,
    });
  });

  it("rejects malformed JSON and wrong shapes as invalid", async () => {
    await expect(
      fetchForecast({
        ...base,
        fetchImpl: vi
          .fn()
          .mockResolvedValue(new Response("not json", { status: 200 })),
      }),
    ).rejects.toMatchObject({ kind: "invalid" });
    await expect(
      fetchForecast({
        ...base,
        fetchImpl: vi
          .fn()
          .mockResolvedValue(new Response("{}", { status: 200 })),
      }),
    ).rejects.toMatchObject({ kind: "invalid" });
  });

  it("maps a timeout and a network failure", async () => {
    const timeout = Object.assign(new Error("t"), { name: "TimeoutError" });
    await expect(
      fetchForecast({ ...base, fetchImpl: vi.fn().mockRejectedValue(timeout) }),
    ).rejects.toMatchObject({ kind: "timeout" });
    await expect(
      fetchForecast({
        ...base,
        fetchImpl: vi.fn().mockRejectedValue(new TypeError("fetch failed")),
      }),
    ).rejects.toMatchObject({ kind: "network" });
  });
});
