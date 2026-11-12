import { describe, expect, it } from "vitest";
import { pm25BandOf } from "@/features/commute/domain/labels";

describe("pm25BandOf (Thai PCD bands, plan §23.5)", () => {
  it.each([
    [0, "veryGood"],
    [15, "veryGood"],
    [15.1, "good"],
    [25, "good"],
    [25.1, "moderate"],
    [37.5, "moderate"],
    [37.6, "unhealthySensitive"],
    [75, "unhealthySensitive"],
    [75.1, "unhealthy"],
    [300, "unhealthy"],
  ] as const)("%s µg/m³ is %s", (value, band) => {
    expect(pm25BandOf(value)).toBe(band);
  });
});
