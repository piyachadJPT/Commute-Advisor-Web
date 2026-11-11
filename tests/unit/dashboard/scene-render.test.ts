import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ALL_SCENES, type Scene } from "@/features/dashboard/ui/scene";
import { Sky } from "@/features/dashboard/ui/sky";
import { WeatherScene } from "@/features/dashboard/ui/weather-scene";

const all = ALL_SCENES;

describe("weather scene rendering", () => {
  it.each(all)("renders $daypart $sky the same way twice", (scene) => {
    const sky = () => renderToStaticMarkup(createElement(Sky, { scene }));
    const art = () =>
      renderToStaticMarkup(
        createElement(WeatherScene, { scene, dimmed: false }),
      );
    expect(sky()).toBe(sky());
    expect(art()).toBe(art());
  });

  it("shows sun by day, moon and stars by night, rain only when wet", () => {
    const art = (scene: Scene) =>
      renderToStaticMarkup(
        createElement(WeatherScene, { scene, dimmed: false }),
      );
    expect(art({ daypart: "day", sky: "clear" })).toContain("fill-scene-sun");
    expect(art({ daypart: "day", sky: "clear" })).not.toContain(
      "fill-scene-moon",
    );
    const night = art({ daypart: "night", sky: "rain" });
    expect(night).toContain("fill-scene-moon");
    expect(night).toContain("fx-drop");
    expect(art({ daypart: "night", sky: "clear" })).toContain("fx-twinkle");
    expect(art({ daypart: "day", sky: "partly" })).not.toContain("fx-drop");
    expect(art({ daypart: "day", sky: "storm" })).toContain("fx-bolt");
  });

  it("draws the new events", () => {
    const art = (scene: Scene) =>
      renderToStaticMarkup(
        createElement(WeatherScene, { scene, dimmed: false }),
      );
    expect(art({ daypart: "day", sky: "sunshower" })).toContain("fx-rainbow");
    expect(art({ daypart: "day", sky: "hot" })).toContain("fx-heat");
    expect(art({ daypart: "dusk", sky: "clear" })).toContain(
      "fill-scene-sun-low",
    );
    expect(art({ daypart: "day", sky: "downpour" })).not.toContain(
      "fill-scene-sun",
    );
    expect(art({ daypart: "day", sky: "downpour" })).toContain("fx-drop");
    const sky = (scene: Scene) =>
      renderToStaticMarkup(createElement(Sky, { scene }));
    expect(sky({ daypart: "night", sky: "clear" })).toContain("fx-bg-shoot");
  });
});
