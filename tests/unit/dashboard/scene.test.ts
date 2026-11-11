import { describe, expect, it } from "vitest";
import {
  backdropOf,
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

describe("inkTone and backdropOf", () => {
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
