import { describe, expect, it, vi } from "vitest";
import {
  GeocodingError,
  searchPlaces,
} from "@/features/forecast/data/geocodingClient";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

describe("searchPlaces", () => {
  it("maps results and fills omitted optional fields with null", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      json({
        results: [
          {
            id: 1,
            name: "Ladprao",
            latitude: 13.8,
            longitude: 100.6,
            country: "Thailand",
            admin1: "Bangkok",
            elevation: 3,
          },
          { id: 2, name: "Somewhere", latitude: 1, longitude: 2 },
        ],
      }),
    );
    const out = await searchPlaces({
      query: "ลาดพร้าว",
      language: "th",
      fetchImpl,
    });
    expect(out).toEqual([
      {
        id: 1,
        name: "Ladprao",
        latitude: 13.8,
        longitude: 100.6,
        country: "Thailand",
        admin1: "Bangkok",
      },
      {
        id: 2,
        name: "Somewhere",
        latitude: 1,
        longitude: 2,
        country: null,
        admin1: null,
      },
    ]);
    const url = new URL(fetchImpl.mock.calls[0]?.[0] as string);
    expect(url.searchParams.get("name")).toBe("ลาดพร้าว");
    expect(url.searchParams.get("language")).toBe("th");
    expect(url.searchParams.get("count")).toBe("10");
  });

  it("treats a missing `results` key as no match", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(json({ generationtime_ms: 0.4 }));
    expect(
      await searchPlaces({ query: "zzzz", language: "en", fetchImpl }),
    ).toEqual([]);
  });

  it.each([
    ["HTTP error", () => json({ error: true, reason: "x" }, 400)],
    ["malformed JSON", () => new Response("nope", { status: 200 })],
    [
      "out-of-range coordinates",
      () =>
        json({ results: [{ id: 1, name: "x", latitude: 95, longitude: 0 }] }),
    ],
    ["wrong type", () => json({ results: "oops" })],
  ])("throws GeocodingError on %s", async (_n, make) => {
    const fetchImpl = vi.fn().mockResolvedValue(make());
    await expect(
      searchPlaces({ query: "ab", language: "en", fetchImpl }),
    ).rejects.toBeInstanceOf(GeocodingError);
  });

  it("throws GeocodingError when the request itself fails", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    await expect(
      searchPlaces({ query: "ab", language: "en", fetchImpl }),
    ).rejects.toBeInstanceOf(GeocodingError);
  });
});
