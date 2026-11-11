import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icon";
import { localDateOf } from "@/features/commute/domain/tz";
import type { Locale } from "@/i18n/config";
import {
  formatClock,
  formatDayMonth,
  formatHeaderDate,
} from "@/lib/time/format";
import { OfflineNotice } from "@/features/offline/offline-notice";
import { refreshForecast, unskipToday } from "../actions";
import {
  FIRST_HOUR,
  type DashboardView as View,
  type HourlySeries,
  type ReasonView,
} from "../view";
import { Hero } from "./hero";
import { HourlyChartCard } from "./hourly-chart-card";
import { NextDaysCard } from "./next-days-card";
import { NowCard } from "./now-card";
import { RefreshButton } from "./refresh-button";
import { inkTone, sceneFor } from "./scene";
import { Sky } from "./sky";
import { TripsCard } from "./trips-card";
import { WeekCard } from "./week-card";

type Translate = ReturnType<typeof useTranslations<"dashboard">>;

const TIME_ZONE = "Asia/Bangkok"; // fixed in v2.0 (plan §2)
const DEFAULT_THRESHOLD = 50; // the fixed risk labels are built around 50%

export function DashboardView({
  view,
  locale,
  now,
  offline = false,
}: {
  view: View;
  locale: Locale;
  now: Date;
  /**
   * Rendered from the device's saved copy with no connection (plan §11.4): the banner says
   * "offline" and names when the data is from, and anything that needs the server is hidden.
   */
  offline?: boolean;
}) {
  const t = useTranslations("dashboard");
  const scene = sceneFor(
    view.now[0].weatherCode,
    view.vehicle,
    now,
    view.now[0].temperature,
  );
  const max = view.hourly.home.map((h, i) => {
    const w = view.hourly.work[i] ?? null;
    return h === null || w === null ? null : Math.max(h, w);
  });
  const series = { max, home: view.hourly.home, work: view.hourly.work };
  const needsRefresh = !offline && (view.fetchedAt === null || view.stale);
  // Names when the data is from, so cached data is never passed off as current (plan §4.6).
  const offlineText =
    view.fetchedAt === null
      ? t("offlineNoTime")
      : t("offline", { when: fetchedWhen(view.fetchedAt, now, locale, t) });

  return (
    <div data-sky={inkTone(scene)}>
      <Sky scene={scene} />
      <header className="flex items-center justify-between gap-3 pt-[1.125rem] pb-1.5 text-hero">
        <div className="min-w-0">
          <p className="text-title font-semibold tabular">
            {view.isToday ? null : `${t("tomorrow")} · `}
            {formatHeaderDate(view.targetDate, locale)}
          </p>
          <p className="text-caption text-hero-2">{t("route", view.route)}</p>
        </div>
        {offline ? null : (
          <form action={refreshForecast}>
            <RefreshButton label={t("refresh")} />
          </form>
        )}
      </header>

      {offline ? (
        <p
          role="status"
          className="mt-2 flex min-h-11 w-full items-center gap-2 rounded-tile bg-warn-surface px-4 py-2 text-label font-medium text-warn-ink shadow-glass"
        >
          <Icon name="wifiOff" className="size-5 shrink-0" />
          <span className="tabular">{offlineText}</span>
        </p>
      ) : (
        <OfflineNotice text={offlineText} />
      )}

      {needsRefresh ? (
        <form action={refreshForecast} className="mt-2">
          <button
            type="submit"
            className="flex min-h-11 w-full items-center gap-2 rounded-tile bg-warn-surface px-4 py-2 text-left text-label font-medium text-warn-ink shadow-glass"
          >
            <Icon name="warning" className="size-5 shrink-0" />
            <span className="tabular">
              {view.fetchedAt === null
                ? t("noForecast")
                : t("stale", {
                    when: fetchedWhen(view.fetchedAt, now, locale, t),
                  })}
            </span>
          </button>
        </form>
      ) : null}

      {view.skippedToday && !offline ? (
        <form
          action={unskipToday}
          className="mt-2 flex min-h-11 items-center justify-between gap-3 rounded-tile bg-glass px-4 py-1 text-label shadow-glass"
        >
          <p className="font-medium">{t("skippedToday")}</p>
          <button
            type="submit"
            className="inline-flex min-h-11 items-center px-1 font-semibold text-primary"
          >
            {t("unskip")}
          </button>
        </form>
      ) : null}

      <div className="mt-2 grid grid-cols-1 gap-3.5 lg:grid-cols-12 lg:items-start lg:gap-[1.125rem]">
        <Hero
          className="pb-3 lg:col-span-7 lg:pb-2"
          vehicle={view.vehicle}
          scene={scene}
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
          canSkip={view.canSkip && !offline}
          warning={
            view.returnWarning === null
              ? null
              : t("returnWarning", { risk: view.returnWarning })
          }
          updatedLabel={
            view.fetchedAt === null
              ? t("notFetched")
              : t("updated", { time: formatClock(view.fetchedAt, locale) })
          }
        />
        <HourlyChartCard
          className="lg:col-span-8 lg:self-stretch"
          home={view.hourly.home}
          work={view.hourly.work}
          threshold={view.threshold}
          windows={[
            {
              label: t("trip.departure"),
              startHour: view.windows.departure.startHour,
              endHour: view.windows.departure.endHour,
            },
            {
              label: t("trip.return"),
              startHour: view.windows.return.startHour,
              endHour: view.windows.return.endHour,
            },
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
              max: summary(t, "max", series.max, view),
              home: summary(t, "home", series.home, view),
              work: summary(t, "work", series.work, view),
            },
          }}
        />
        <div className="grid gap-3.5 sm:grid-cols-2 lg:col-span-4 lg:grid-cols-1 lg:grid-rows-2 lg:gap-[1.125rem] lg:self-stretch">
          <NowCard now={view.now[0]} />
          <NowCard now={view.now[1]} />
        </div>
        <NextDaysCard
          className="lg:col-span-6 lg:self-stretch"
          days={view.nextDays}
          locale={locale}
        />
        <WeekCard
          className="lg:col-span-6 lg:self-stretch"
          week={view.week}
          locale={locale}
        />
      </div>
    </div>
  );
}

/** "21:10" for today, "10 พ.ย. 21:10" for an earlier day. */
function fetchedWhen(
  fetchedAt: Date,
  now: Date,
  locale: Locale,
  t: Translate,
): string {
  const clock = formatClock(fetchedAt, locale);
  return localDateOf(fetchedAt, TIME_ZONE) === localDateOf(now, TIME_ZONE)
    ? clock
    : t("staleOtherDay", {
        day: formatDayMonth(fetchedAt, locale),
        time: clock,
      });
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
  view: View,
): string {
  const dep = windowMax(values, view.windows.departure.buckets);
  const ret = windowMax(values, view.windows.return.buckets);
  return t("chart.summary", {
    series: t(`chart.series.${key}`),
    dep: dep ?? t("chart.noData"),
    ret: ret ?? t("chart.noData"),
    threshold: view.threshold,
  });
}

function renderReason(reason: ReasonView, t: Translate): ReactNode {
  const b = (chunks: ReactNode) => <b>{chunks}</b>;
  switch (reason.code) {
    case "departureHigh":
    case "returnHigh": {
      const p = reason.params;
      const other = reason.code === "departureHigh" ? "return" : "departure";
      return (
        <>
          {t.rich(`reason.${reason.code}`, {
            b,
            risk: p.risk,
            source: t(`location.${p.source}`),
            window: p.window,
          })}
          {/* A custom threshold can disagree with the fixed label, so state it (plan §5.4). */}
          {p.threshold !== DEFAULT_THRESHOLD
            ? ` · ${t("reason.aboveThreshold", { threshold: p.threshold })}`
            : null}
          {p.otherIncomplete
            ? ` · ${t("reason.otherIncomplete", { trip: t(`trip.${other}`) })}`
            : null}
        </>
      );
    }
    case "bothLow":
      return t.rich("reason.bothLow", {
        b,
        threshold: reason.params.threshold,
        max: reason.params.max,
      });
    case "incomplete":
      return t.rich("reason.incomplete", {
        b,
        trip: t(`trip.${reason.params.trip}`),
        source: t(`location.${reason.params.source}`),
        hours: reason.params.hours,
      });
  }
}
