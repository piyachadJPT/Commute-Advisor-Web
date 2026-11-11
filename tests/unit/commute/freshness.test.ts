import { describe, expect, it } from "vitest";
import { freshnessOf, olderOf } from "@/features/commute/domain/freshness";

const NOW = new Date("2026-11-11T12:00:00Z");
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000);

describe("freshnessOf (plan §5.5)", () => {
  it("is fresh at exactly 6 hours and stale one minute later", () => {
    expect(freshnessOf(ago(360), ago(10), NOW)).toBe("fresh");
    expect(freshnessOf(ago(361), ago(10), NOW)).toBe("stale");
  });
  it("is stale when either location is stale", () => {
    expect(freshnessOf(ago(10), ago(400), NOW)).toBe("stale");
  });
  it("is fresh when both are recent", () => {
    expect(freshnessOf(ago(1), ago(2), NOW)).toBe("fresh");
  });
  it("is none when a location has never been fetched", () => {
    expect(freshnessOf(null, ago(1), NOW)).toBe("none");
    expect(freshnessOf(ago(1), null, NOW)).toBe("none");
    expect(freshnessOf(null, null, NOW)).toBe("none");
  });
});

describe("olderOf", () => {
  it("returns the older instant, or null if either is missing", () => {
    expect(olderOf(ago(5), ago(50))).toEqual(ago(50));
    expect(olderOf(null, ago(5))).toBeNull();
  });
});
