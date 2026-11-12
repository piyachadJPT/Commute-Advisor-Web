import { describe, expect, it } from "vitest";
import {
  ALL_SCENES,
  backdropOf,
  isHazy,
  daypartAt,
  inkTone,
  sceneFor,
  unit,
} from "@/features/dashboard/ui/scene";

// Bangkok is UTC+7
const at = (h: number) => new Date(Date.UTC(2026, 10, 11, h - 7, 30));

describe("daypartAt", () => {
  it("splits the Bangkok day into dawn, day, dusk and night", () => {
    expect(daypartAt(at(4))).toBe("night");
    expect(daypartAt(at(5))).toBe("dawn");
    expect(daypartAt(at(7))).toBe("day");
    expect(daypartAt(at(16))).toBe("day");
    expect(daypartAt(at(17))).toBe("dusk");
    expect(daypartAt(at(19))).toBe("night");
    expect(daypartAt(at(0))).toBe("night");
  });
});

describe("sceneFor", () => {
  it("maps WMO codes to a sky", () => {
    const sky = (c: number) => sceneFor(c, "car", at(12)).sky;
    expect(sky(0)).toBe("clear");
    expect(sky(2)).toBe("partly");
    expect(sky(3)).toBe("overcast");
    expect(sky(48)).toBe("fog");
    expect(sky(53)).toBe("drizzle");
    expect(sky(63)).toBe("rain");
    expect(sky(81)).toBe("rain");
    expect(sky(95)).toBe("storm");
  });

  it("finds heavy rain, sunshowers and hot days", () => {
    expect(sceneFor(65, "car", at(12)).sky).toBe("downpour");
    expect(sceneFor(82, "car", at(12)).sky).toBe("downpour");
    expect(sceneFor(80, "car", at(12)).sky).toBe("sunshower");
    expect(sceneFor(80, "car", at(22)).sky).toBe("rain");
    expect(sceneFor(0, "car", at(12), 36).sky).toBe("hot");
    expect(sceneFor(0, "car", at(12), 30).sky).toBe("clear");
    expect(sceneFor(0, "car", at(22), 36).sky).toBe("clear");
  });

  it("falls back on the verdict without a weather code", () => {
    expect(sceneFor(null, "car", at(12)).sky).toBe("rain");
    expect(sceneFor(null, "motorcycle", at(12)).sky).toBe("partly");
    expect(sceneFor(null, "unknown", at(12)).sky).toBe("fog");
  });
});

describe("sceneFor with PM2.5 (haze and smog)", () => {
  const sky = (
    code: number | null,
    pm25: number | null,
    hour = 12,
    temperature: number | null = 28,
    vehicle: "car" | "motorcycle" | "unknown" = "car",
  ) => sceneFor(code, vehicle, at(hour), temperature, pm25).sky;

  it("above 37.5 is haze and above 75 is smog; the edges themselves are not", () => {
    expect(sky(0, 37.5)).toBe("clear");
    expect(sky(0, 37.6)).toBe("haze");
    expect(sky(0, 75)).toBe("haze");
    expect(sky(0, 75.1)).toBe("smog");
  });

  it("replaces clear, partly, overcast, fog and hot", () => {
    for (const code of [0, 2, 3, 45]) expect(sky(code, 60)).toBe("haze");
    expect(sky(0, 60, 12, 36)).toBe("haze"); // would be "hot" without the haze
    expect(sky(0, 90, 12, 36)).toBe("smog");
  });

  it("never replaces rain or a storm", () => {
    expect(sky(53, 90)).toBe("drizzle");
    expect(sky(63, 90)).toBe("rain");
    expect(sky(65, 90)).toBe("downpour");
    expect(sky(80, 90)).toBe("sunshower");
    expect(sky(95, 90)).toBe("storm");
  });

  it("works at dawn, dusk and night", () => {
    for (const hour of [6, 18, 22]) {
      expect(sceneFor(0, "car", at(hour), 28, 60)).toMatchObject({
        sky: "haze",
      });
    }
    expect(sceneFor(0, "car", at(6), 28, 60).daypart).toBe("dawn");
    expect(sceneFor(0, "car", at(18), 28, 90).daypart).toBe("dusk");
    expect(sceneFor(0, "car", at(22), 28, 90).sky).toBe("smog");
  });

  it("hazes a sky taken from the verdict, except the rainy one", () => {
    expect(sky(null, 60, 12, null, "motorcycle")).toBe("haze"); // partly
    expect(sky(null, 60, 12, null, "unknown")).toBe("haze"); // fog
    expect(sky(null, 60, 12, null, "car")).toBe("rain");
  });

  it("changes nothing without a PM2.5 value", () => {
    expect(sky(0, null)).toBe("clear");
    expect(sceneFor(0, "car", at(12), 28).sky).toBe("clear");
  });

  it("uses the temperature it is given for 'hot', so the caller can pass feels-like", () => {
    expect(sceneFor(0, "car", at(12), 35).sky).toBe("hot");
    expect(sceneFor(0, "car", at(12), 34.9).sky).toBe("clear");
  });
});

describe("inkTone and backdropOf", () => {
  it("gives haze and smog their own backdrops", () => {
    expect(backdropOf({ daypart: "day", sky: "haze" })).toBe("day-haze");
    expect(backdropOf({ daypart: "day", sky: "smog" })).toBe("day-smog");
    for (const sky of ["haze", "smog"] as const) {
      expect(backdropOf({ daypart: "dawn", sky })).toBe("dawn-haze");
      expect(backdropOf({ daypart: "dusk", sky })).toBe("dusk-haze");
      expect(backdropOf({ daypart: "night", sky })).toBe("night-haze");
    }
  });

  it("uses dark ink on light day haze, light ink on smog, dawn, dusk and night", () => {
    expect(inkTone({ daypart: "day", sky: "haze" })).toBe("mist");
    expect(inkTone({ daypart: "day", sky: "smog" })).toBe("car");
    for (const daypart of ["dawn", "dusk", "night"] as const) {
      expect(inkTone({ daypart, sky: "haze" })).toBe("car");
      expect(inkTone({ daypart, sky: "smog" })).toBe("car");
    }
  });

  it("lists haze and smog in every part of the day among all scenes", () => {
    expect(ALL_SCENES.filter((s) => isHazy(s.sky))).toHaveLength(8);
    expect(ALL_SCENES).toHaveLength(34);
  });

  it("uses dark ink on bright day skies and light ink at night or in rain", () => {
    expect(inkTone({ daypart: "day", sky: "clear" })).toBe("moto");
    expect(inkTone({ daypart: "day", sky: "fog" })).toBe("mist");
    expect(inkTone({ daypart: "day", sky: "rain" })).toBe("car");
    expect(inkTone({ daypart: "night", sky: "clear" })).toBe("car");
    expect(inkTone({ daypart: "dusk", sky: "clear" })).toBe("car");
    expect(inkTone({ daypart: "dusk", sky: "overcast" })).toBe("mist");
  });

  it("groups skies into backdrops", () => {
    expect(backdropOf({ daypart: "night", sky: "partly" })).toBe("night-clear");
    expect(backdropOf({ daypart: "day", sky: "drizzle" })).toBe("day-rain");
    expect(backdropOf({ daypart: "day", sky: "storm" })).toBe("day-storm");
    expect(backdropOf({ daypart: "day", sky: "downpour" })).toBe("day-storm");
    expect(backdropOf({ daypart: "dawn", sky: "clear" })).toBe("dawn-clear");
    expect(backdropOf({ daypart: "dusk", sky: "rain" })).toBe("day-rain");
    expect(backdropOf({ daypart: "day", sky: "hot" })).toBe("day-hot");
  });
});

describe("unit", () => {
  it("is deterministic and within 0..1", () => {
    expect(unit(3, 7)).toBe(unit(3, 7));
    for (let i = 0; i < 50; i++) {
      expect(unit(i, 2)).toBeGreaterThanOrEqual(0);
      expect(unit(i, 2)).toBeLessThan(1);
    }
  });
});
