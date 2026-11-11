import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { Icon } from "@/components/icon";
import type { Locale } from "@/i18n/config";
import { formatClock, formatHeaderDate } from "@/lib/time/format";
import {
  FIRST_HOUR,
  type DashboardView as View,
  type HourlySeries,
  type ReasonView,
} from "../mock";
import { Hero } from "./hero";
import { HourlyChartCard } from "./hourly-chart-card";
import { NextDaysCard } from "./next-days-card";
import { NowCard } from "./now-card";
import { SKY_FOR } from "./risk-style";
import { Sky } from "./sky";
import { TripsCard } from "./trips-card";
import { WeekCard } from "./week-card";

// Bucket labels per trip for the mock windows (§5.1): 08:20–09:20 → 09, 10; 18:00–19:00 → 19.
const DEPARTURE_BUCKETS = [9, 10];
const RETURN_BUCKETS = [19];

type Translate = Awaited<ReturnType<typeof getTranslations<"dashboard">>>;

export async function DashboardView({
  view,
  locale,
}: {
  view: View;
  locale: Locale;
}) {
  const t = await getTranslations("dashboard");
  const sky = SKY_FOR[view.vehicle];
  const max = view.hourly.home.map((h, i) => {
    const w = view.hourly.work[i] ?? null;
    return h === null || w === null ? null : Math.max(h, w);
  });
  const series = { max, home: view.hourly.home, work: view.hourly.work };

  return (
    <div data-sky={sky}>
      <Sky kind={sky} />

      <header className="flex items-center justify-between gap-3 pt-[1.125rem] pb-1.5 text-hero">
        <div className="min-w-0">
          <p className="text-title font-semibold tabular">
            {view.isToday ? null : `${t("tomorrow")} · `}
            {formatHeaderDate(view.targetDate, locale)}
          </p>
          <p className="text-caption text-hero-2">{t("route", view.route)}</p>
        </div>
        <button
          type="button"
          aria-label={t("refresh")}
          className="grid size-11 shrink-0 place-items-center rounded-tile border border-glass-line bg-(--hero-chip-bg) backdrop-blur-md transition-colors duration-(--duration-fast) hover:bg-glass"
        >
          <Icon name="refresh" className="size-[1.375rem]" />
        </button>
      </header>

      {view.stale ? (
        <button
          type="button"
          className="mt-2 flex min-h-11 w-full items-center gap-2 rounded-tile bg-warn-surface px-4 py-2 text-left text-label font-medium text-warn-ink shadow-glass"
        >
          <Icon name="warning" className="size-5 shrink-0" />
          <span className="tabular">
            {t("stale", { time: formatClock(view.fetchedAt, locale) })}
          </span>
        </button>
      ) : null}

      <div className="mt-2 grid grid-cols-1 gap-3.5 lg:grid-cols-12 lg:items-start lg:gap-[1.125rem]">
        <Hero
          className="pb-3 lg:col-span-7 lg:pb-2"
          vehicle={view.vehicle}
          chip={t(`chip.${view.vehicle}`)}
          verdict={t(`verdict.${view.vehicle}`)}
          reason={renderReason(view.reason, t)}
          dimmed={view.stale}
        />
        <TripsCard
          className="lg:col-span-5 lg:self-end"
          departure={view.departure}
          returnTrip={view.returnTrip}
          threshold={view.threshold}
          updatedLabel={t("updated", {
            time: formatClock(view.fetchedAt, locale),
          })}
        />
        <HourlyChartCard
          className="lg:col-span-8"
          home={view.hourly.home}
          work={view.hourly.work}
          threshold={view.threshold}
          windows={[
            {
              label: t("trip.departure"),
              startHour: 8 + 20 / 60,
              endHour: 9 + 20 / 60,
            },
            { label: t("trip.return"), startHour: 18, endHour: 19 },
          ]}
          labels={{
            title: t("chart.title"),
            subtitle: t("chart.subtitle", { threshold: view.threshold }),
            seriesLabel: t("chart.series.label"),
            series: {
              max: t("chart.series.max"),
              home: t("chart.series.home"),
              work: t("chart.series.work"),
            },
            summary: {
              max: summary(t, "max", series.max, view.threshold),
              home: summary(t, "home", series.home, view.threshold),
              work: summary(t, "work", series.work, view.threshold),
            },
          }}
        />
        <div className="grid gap-3.5 sm:grid-cols-2 lg:col-span-4 lg:grid-cols-1 lg:gap-[1.125rem]">
          <NowCard now={view.now[0]} />
          <NowCard now={view.now[1]} />
        </div>
        <NextDaysCard
          className="lg:col-span-6"
          days={view.nextDays}
          locale={locale}
        />
        <WeekCard className="lg:col-span-6" week={view.week} locale={locale} />
      </div>
    </div>
  );
}

function windowMax(values: HourlySeries, buckets: number[]): number | null {
  let max: number | null = null;
  for (const hour of buckets) {
    const v = values[hour - FIRST_HOUR];
    if (v === null || v === undefined) return null;
    max = max === null ? v : Math.max(max, v);
  }
  return max;
}

function summary(
  t: Translate,
  key: "max" | "home" | "work",
  values: HourlySeries,
  threshold: number,
): string {
  const dep = windowMax(values, DEPARTURE_BUCKETS);
  const ret = windowMax(values, RETURN_BUCKETS);
  return t("chart.summary", {
    series: t(`chart.series.${key}`),
    dep: dep ?? t("chart.noData"),
    ret: ret ?? t("chart.noData"),
    threshold,
  });
}

function renderReason(reason: ReasonView, t: Translate): ReactNode {
  const b = (chunks: ReactNode) => <b>{chunks}</b>;
  switch (reason.code) {
    case "departureHigh":
    case "returnHigh":
      return t.rich(`reason.${reason.code}`, {
        b,
        risk: reason.risk,
        source: t(`location.${reason.source}`),
        window: reason.window,
      });
    case "bothLow":
      return t.rich("reason.bothLow", {
        b,
        threshold: reason.threshold,
        max: reason.max,
      });
    case "incomplete":
      return t.rich("reason.incomplete", {
        b,
        trip: t(`trip.${reason.trip}`),
        source: t(`location.${reason.source}`),
        hours: reason.hours,
      });
  }
}
