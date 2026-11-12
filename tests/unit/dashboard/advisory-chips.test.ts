import { NextIntlClientProvider } from "next-intl";
import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Advisory } from "@/features/commute/domain/types";
import { AdvisoryChips } from "@/features/dashboard/ui/advisory-chips";
import en from "../../../messages/en.json";
import th from "../../../messages/th.json";

const adv = (
  code: Advisory["code"],
  level: Advisory["level"],
  params: Advisory["params"] = {},
): Advisory => ({ code, level, trip: "departure", source: "home", params });

const ALL: Advisory[] = [
  adv("heat", "warning", { value: 43 }),
  adv("cold", "caution", { value: 20 }),
  adv("uv", "caution", { value: 9 }),
  adv("gust", "caution", { value: 45 }),
  adv("lowVisibility", "caution", { value: 800 }),
  adv("thunderstorm", "warning"),
  adv("heavyRain", "caution", { mm: 12.3 }),
  adv("wetRoad", "caution", { mm: 0.6 }),
  adv("rainNearWindow", "caution", { when: "before", hour: "08:00" }),
  adv("darkReturn", "caution", { risk: 30 }),
];

const render = (
  locale: "en" | "th",
  advisories: Advisory[],
  vehicle: "car" | "motorcycle" | "unknown",
) =>
  renderToStaticMarkup(
    createElement(
      NextIntlClientProvider,
      // The children go in as an argument (react/no-children-prop); the cast only drops the
      // `children` the props type would otherwise require.
      {
        locale,
        messages: locale === "en" ? en : th,
      } as unknown as ComponentProps<typeof NextIntlClientProvider>,
      createElement(AdvisoryChips, { advisories, vehicle }),
    ),
  );

describe("AdvisoryChips", () => {
  it.each(["en", "th"] as const)(
    "renders every advisory in %s with its values and no missing-message markers",
    (locale) => {
      const html = render(locale, ALL, "motorcycle");
      expect(html.match(/<li /g)).toHaveLength(ALL.length);
      expect(html).toContain("43");
      expect(html).toContain("12.3");
      expect(html).toContain("08:00");
      // next-intl prints the key path when a message is missing.
      expect(html).not.toContain("dashboard.advisory");
      expect(html).not.toContain("advisory.");
    },
  );

  it("picks the before/after wording from `when`", () => {
    const before = render(
      "en",
      [adv("rainNearWindow", "caution", { when: "before", hour: "08:00" })],
      "motorcycle",
    );
    const after = render(
      "en",
      [adv("rainNearWindow", "caution", { when: "after", hour: "11:00" })],
      "motorcycle",
    );
    expect(before).toContain("just before");
    expect(after).toContain("just after");
  });

  it("shows only warnings on a car day", () => {
    const html = render("en", ALL, "car");
    expect(html.match(/<li /g)).toHaveLength(2); // heat and thunderstorm
    expect(html).toContain("Thunderstorm");
    expect(html).not.toContain("UV");
  });

  it("renders nothing when there is nothing to show", () => {
    expect(render("en", [], "motorcycle")).toBe("");
    expect(render("en", [adv("uv", "caution", { value: 9 })], "car")).toBe("");
  });

  it("does not rely on colour: warnings carry a mark, every chip has a level prefix", () => {
    const html = render(
      "en",
      [adv("heat", "warning", { value: 43 })],
      "unknown",
    );
    expect(html).toContain("Warning: ");
    expect(html).toContain(">!");
    const caution = render(
      "en",
      [adv("uv", "caution", { value: 9 })],
      "unknown",
    );
    expect(caution).toContain("Caution: ");
    expect(caution).not.toContain(">!");
  });
});
