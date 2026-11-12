import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Suspense } from "react";
import {
  addDays,
  localDateOf,
  zonedToInstant,
} from "@/features/commute/domain/tz";
import type { LocalTime, LocationKey } from "@/features/commute/domain/types";
import { isFreshEnough } from "@/features/commute/domain/freshness";
import { getHourlyAirQuality } from "@/features/forecast/data/airQualityRepo";
import {
  getHourlyForecasts,
  getLastSuccessfulFetch,
} from "@/features/forecast/data/forecastRepo";
import {
  latestFetch,
  toHourlyAirQuality,
  toHourlyWeather,
} from "@/features/forecast/data/mapping";
import {
  getUserSettings,
  toCommuteSettings,
} from "@/features/settings/data/settingsRepo";
import { card } from "@/features/settings/ui/styles";
import { buildWeatherView } from "@/features/weather/domain/buildWeatherView";
import { HourlyList } from "@/features/weather/ui/hourly-list";
import { WeatherChart } from "@/features/weather/ui/weather-chart";
import { defaultLocale, isLocale } from "@/i18n/config";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  formatClock,
  formatDayMonth,
  formatWeekdayShort,
} from "@/lib/time/format";
import { NeedsSetup } from "@/features/dashboard/ui/needs-setup";

const HOUR_MS = 3_600_000;
const STALE_AFTER_MS = 6 * HOUR_MS;

export default function WeatherPage({ searchParams }: PageProps<"/weather">) {
  return (
    <Suspense
      fallback={
        <div aria-busy="true" className="pt-6 lg:pt-8">
          <div className="h-10 w-40 animate-pulse rounded-tile bg-(--hero-chip-light)" />
          <div className="mt-4 h-72 animate-pulse rounded-card glass" />
        </div>
      }
    >
      <WeatherContent searchParams={searchParams} />
    </Suspense>
  );
}

const segment =
  "inline-flex min-h-11 items-center justify-center rounded-[9px] px-4 text-label font-semibold whitespace-nowrap text-ink-3 transition-colors duration-(--duration-fast) hover:text-ink aria-[current=true]:glass-control aria-[current=true]:glass-rim aria-[current=true]:text-ink";

async function WeatherContent({
  searchParams,
}: Pick<PageProps<"/weather">, "searchParams">) {
  const params = await searchParams;
  const loc: LocationKey = params.loc === "work" ? "work" : "home";
  const dayParam = Number(typeof params.day === "string" ? params.day : "0");
  const day = dayParam === 1 || dayParam === 2 ? dayParam : 0;

  const raw = await getLocale();
  const locale = isLocale(raw) ? raw : defaultLocale;
  const [nav, t, td, user] = await Promise.all([
    getTranslations("nav"),
    getTranslations("weather"),
    getTranslations("dashboard"),
    requireUser(),
  ]);
  const supabase = await createClient();
  const s = await getUserSettings(supabase, user.id);
  if (!s) throw new Error("No settings row for the signed-in user");
  if (!s.home.isSet || !s.work.isSet) {
    return (
      <>
        <h1 className="pt-6 text-display font-bold tracking-[-0.02em] text-hero lg:pt-8">
          {nav("weather")}
        </h1>
        <NeedsSetup reason="locations" />
      </>
    );
  }

  const settings = toCommuteSettings(s);
  const tz = settings.timeZone;
  const now = new Date();
  const today = localDateOf(now, tz);
  const date = addDays(today, day);

  // Labels 01:00 ... 24:00 of `date` (label T covers the hour ending at T).
  const midnight = "00:00" as LocalTime;
  const from = new Date(zonedToInstant(date, midnight, tz).getTime() + HOUR_MS);
  const to = new Date(
    zonedToInstant(addDays(date, 1), midnight, tz).getTime() + HOUR_MS,
  );
  const [rows, fetchedAt, airRows] = await Promise.all([
    getHourlyForecasts(supabase, user.id, loc, from, to),
    getLastSuccessfulFetch(supabase, user.id, loc),
    // Optional: a failed read leaves the screen without PM2.5, nothing else (plan §23.1).
    getHourlyAirQuality(supabase, user.id, loc, from, to).catch(() => []),
  ]);
  const view = buildWeatherView({
    rows: rows.map(toHourlyWeather),
    // Old air quality must not look current (plan §23.5).
    air: isFreshEnough(latestFetch(airRows), now)
      ? airRows.map(toHourlyAirQuality)
      : [],
    date,
    settings,
  });

  const place =
    loc === "home"
      ? (s.home.name ?? td("place.home"))
      : (s.work.name ?? td("place.work"));
  const at = (d: typeof date) => zonedToInstant(d, "12:00" as LocalTime, tz);
  const dayName = [
    t("day.today"),
    t("day.tomorrow"),
    `${formatWeekdayShort(at(date), locale)} ${formatDayMonth(at(date), locale)}`,
  ][day]!;

  const summary = view.peak
    ? t("chart.summary", {
        place,
        day: dayName,
        max: view.peak.probability,
        hour: `${String(view.peak.hour % 24).padStart(2, "0")}:00`,
        threshold: settings.threshold,
      })
    : t("chart.summaryEmpty", { place, day: dayName });

  const href = (l: LocationKey, d: number) => `/weather?loc=${l}&day=${d}`;

  return (
    <div className="pt-6 lg:pt-8">
      <h1 className="text-display font-bold tracking-[-0.02em] text-hero">
        {nav("weather")}
      </h1>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <nav
          aria-label={t("location")}
          className="inline-flex rounded-control bg-fill-soft p-[3px]"
        >
          {(["home", "work"] as const).map((l) => (
            <Link
              key={l}
              href={href(l, day)}
              scroll={false}
              aria-current={loc === l}
              className={segment}
            >
              {td(`place.${l}`)}
            </Link>
          ))}
        </nav>
        <nav
          aria-label={t("dayLabel")}
          className="inline-flex rounded-control bg-fill-soft p-[3px]"
        >
          {[0, 1, 2].map((d) => (
            <Link
              key={d}
              href={href(loc, d)}
              scroll={false}
              aria-current={day === d}
              className={segment}
            >
              {d === 0
                ? t("day.today")
                : d === 1
                  ? t("day.tomorrow")
                  : formatWeekdayShort(at(addDays(today, 2)), locale)}
            </Link>
          ))}
        </nav>
      </div>

      <section aria-labelledby="chart-title" className={`${card} mt-4`}>
        <h2 id="chart-title" className="text-title font-semibold">
          {t("chart.title", { place })}
        </h2>
        <p className="mb-3.5 text-caption text-ink-3">
          {t("chart.subtitle", { day: dayName, threshold: settings.threshold })}
        </p>
        <WeatherChart
          view={view}
          threshold={settings.threshold}
          title={t("chart.title", { place })}
          summary={summary}
          windowLabels={{
            departure: td("trip.departure"),
            return: td("trip.return"),
          }}
        />
      </section>

      <section aria-labelledby="list-title" className={`${card} mt-4`}>
        <h2 id="list-title" className="text-title font-semibold">
          {t("list.title")}
        </h2>
        <p className="text-caption text-ink-3">{t("list.note")}</p>
        <HourlyList view={view} />
        <p className="mt-3 border-t border-divider pt-3 text-caption text-ink-3 tabular">
          {fetchedAt === null
            ? td("noForecast")
            : `${td("updated", { time: formatClock(fetchedAt, locale) })}${
                now.getTime() - fetchedAt.getTime() > STALE_AFTER_MS
                  ? ` · ${t("stale")}`
                  : ""
              }`}
        </p>
      </section>
    </div>
  );
}
