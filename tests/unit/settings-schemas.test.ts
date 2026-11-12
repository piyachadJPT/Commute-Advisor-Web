import { describe, expect, it } from "vitest";
import { commuteSchema, locationSchema } from "@/features/settings/schemas";

const commute = (over: Record<string, unknown> = {}) => ({
  departureTime: "08:20",
  returnTime: "18:00",
  durationMinutes: "60",
  threshold: "50",
  commuteDays: [1, 2, 4, 8, 16],
  advisoriesDisabled: [],
  temperatureOffset: "0",
  ...over,
});

describe("commuteSchema", () => {
  it("accepts the defaults and sums the weekday bits", () => {
    const r = commuteSchema.parse(commute());
    expect(r).toMatchObject({
      durationMinutes: 60,
      threshold: 50,
      commuteDays: 31,
    });
  });
  it.each([
    ["time without leading zero", { departureTime: "8:20" }],
    ["hour 24", { returnTime: "24:00" }],
    ["duration below 15", { durationMinutes: "14" }],
    ["duration above 180", { durationMinutes: "181" }],
    ["decimal duration", { durationMinutes: "60.5" }],
    ["empty threshold", { threshold: "" }],
    ["threshold below 10", { threshold: "5" }],
    ["threshold above 90", { threshold: "95" }],
    ["a bit that is not a weekday", { commuteDays: [3] }],
    ["a duplicated day", { commuteDays: [1, 1] }],
  ])("rejects %s", (_n, over) => {
    expect(commuteSchema.safeParse(commute(over)).success).toBe(false);
  });
  it("parses the advisory settings: disabled groups and a signed temperature offset", () => {
    const r = commuteSchema.parse(
      commute({
        advisoriesDisabled: ["sun", "airQuality"],
        temperatureOffset: "-2",
      }),
    );
    expect(r).toMatchObject({
      advisoriesDisabled: ["sun", "airQuality"],
      temperatureOffset: -2,
    });
  });
  it.each(["-3", "-1", "0", "2", "3"])(
    "accepts a temperature offset of %s",
    (v) => {
      expect(
        commuteSchema.parse(commute({ temperatureOffset: v }))
          .temperatureOffset,
      ).toBe(Number(v));
    },
  );
  it.each([
    ["offset above 3", { temperatureOffset: "4" }],
    ["offset below -3", { temperatureOffset: "-4" }],
    ["decimal offset", { temperatureOffset: "1.5" }],
    ["empty offset", { temperatureOffset: "" }],
    ["unknown group", { advisoriesDisabled: ["heatCold", "thunderstorm"] }],
    ["a duplicated group", { advisoriesDisabled: ["sun", "sun"] }],
  ])("rejects %s", (_n, over) => {
    expect(commuteSchema.safeParse(commute(over)).success).toBe(false);
  });
  it("allows no commute days", () => {
    expect(commuteSchema.parse(commute({ commuteDays: [] })).commuteDays).toBe(
      0,
    );
  });
});

const location = (over: Record<string, unknown> = {}) => ({
  key: "home",
  latitude: "13.763",
  longitude: "100.538",
  name: "  Ladprao  ",
  ...over,
});

describe("locationSchema", () => {
  it("parses coordinates and trims the name", () => {
    expect(locationSchema.parse(location())).toEqual({
      key: "home",
      latitude: 13.763,
      longitude: 100.538,
      name: "Ladprao",
    });
  });
  it("turns a blank name into null", () => {
    expect(locationSchema.parse(location({ name: "   " })).name).toBeNull();
  });
  it.each([
    ["an empty latitude (must not become 0)", { latitude: "" }],
    ["a blank longitude", { longitude: "  " }],
    ["latitude out of range", { latitude: "90.1" }],
    ["longitude out of range", { longitude: "-180.5" }],
    ["non-numeric", { latitude: "abc" }],
    ["exponent notation", { latitude: "1e2" }],
    ["unknown key", { key: "office" }],
    ["an over-long name", { name: "x".repeat(81) }],
  ])("rejects %s", (_n, over) => {
    expect(locationSchema.safeParse(location(over)).success).toBe(false);
  });
  it("accepts the range limits", () => {
    expect(
      locationSchema.safeParse(location({ latitude: "-90", longitude: "180" }))
        .success,
    ).toBe(true);
  });
});
