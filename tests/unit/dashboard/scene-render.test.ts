import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  ALL_SCENES,
  backdropOf,
  type Scene,
} from "@/features/dashboard/ui/scene";
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

describe("haze and smog rendering", () => {
  const art = (scene: Scene) =>
    renderToStaticMarkup(createElement(WeatherScene, { scene, dimmed: false }));
  const sky = (scene: Scene) =>
    renderToStaticMarkup(createElement(Sky, { scene }));
  const tokens = readFileSync("src/styles/tokens.css", "utf8");

  it("every scene has a backdrop that exists in the design tokens", () => {
    for (const scene of ALL_SCENES) {
      const key = backdropOf(scene);
      expect(sky(scene), `${scene.daypart}/${scene.sky}`).toContain(
        `--sky-${key})`,
      );
      expect(tokens, key).toContain(`--sky-${key}:`);
    }
  });

  it("draws drifting haze and a dull glow, with no stars even at night", () => {
    for (const daypart of ["day", "dawn", "dusk", "night"] as const) {
      for (const hazy of ["haze", "smog"] as const) {
        const html = sky({ daypart, sky: hazy });
        expect(html).toContain("fx-bg-mist");
        expect(html).toContain("fx-bg-glow");
        expect(html).not.toContain("fx-bg-star");
        expect(html).not.toContain("fx-bg-drop");
      }
    }
  });

  it("smog is heavier than haze", () => {
    const count = (html: string, cls: string) => html.split(cls).length - 1;
    expect(
      count(sky({ daypart: "day", sky: "smog" }), "fx-bg-mist"),
    ).toBeGreaterThan(
      count(sky({ daypart: "day", sky: "haze" }), "fx-bg-mist"),
    );
  });

  it("the hero shows a dull sun by day and a dull moon at night, never rays or stars", () => {
    const day = art({ daypart: "day", sky: "haze" });
    expect(day).toContain("fill-scene-sun");
    expect(day).not.toContain("fx-spin");
    expect(art({ daypart: "dusk", sky: "smog" })).toContain(
      "fill-scene-sun-low",
    );
    const night = art({ daypart: "night", sky: "haze" });
    expect(night).toContain("fill-scene-moon");
    expect(night).not.toContain("fx-twinkle");
    expect(day).toContain("fill-scene-haze");
  });
});
