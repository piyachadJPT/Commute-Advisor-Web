import { NextIntlClientProvider } from "next-intl";
import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NowCard } from "@/features/dashboard/ui/now-card";
import type { NowView } from "@/features/dashboard/view";
import en from "../../../messages/en.json";
import th from "../../../messages/th.json";

const now = (over: Partial<NowView> = {}): NowView => ({
  location: "home",
  placeName: "Home",
  temperature: 31,
  weatherCode: 3,
  rainProbability: 10,
  humidity: 70,
  windSpeed: 5,
  apparentTemperature: 35,
  uvIndex: 7,
  pm25: null,
  ...over,
});

const render = (locale: "en" | "th", view: NowView) =>
  renderToStaticMarkup(
    createElement(
      NextIntlClientProvider,
      {
        locale,
        messages: locale === "en" ? en : th,
      } as unknown as ComponentProps<typeof NextIntlClientProvider>,
      createElement(NowCard, { now: view }),
    ),
  );

describe("NowCard", () => {
  it("shows PM2.5 with its band written out, and says it is an estimate", () => {
    const en1 = render("en", now({ pm25: 42 }));
    expect(en1).toContain("PM2.5 42");
    expect(en1).toContain("Starts to affect health");
    expect(en1).toContain("Model estimate");
    const th1 = render("th", now({ pm25: 80 }));
    expect(th1).toContain("มีผลกระทบต่อสุขภาพ");
    expect(th1).toContain("ค่าประมาณ");
  });

  it("shows no PM2.5 line when there is no value, and never a made-up one", () => {
    const html = render("en", now({ pm25: null }));
    expect(html).not.toContain("PM2.5");
  });

  it("shows feels-like and UV beside the temperature", () => {
    const html = render("en", now());
    expect(html).toContain("Feels 35°");
    expect(html).toContain("UV 7");
  });
});
