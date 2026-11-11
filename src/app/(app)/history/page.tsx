import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Suspense } from "react";
import { Icon } from "@/components/icon";
import { localDateOf, zonedToInstant } from "@/features/commute/domain/tz";
import type { LocalDate, LocalTime } from "@/features/commute/domain/types";
import { NeedsSetup } from "@/features/dashboard/ui/needs-setup";
import { VEHICLE_STYLE } from "@/features/dashboard/ui/risk-style";
import {
  buildMonthView,
  monthBounds,
  monthOf,
  parseMonth,
} from "@/features/history/domain/buildHistory";
import { HistoryList } from "@/features/history/ui/history-list";
import { getRecommendations } from "@/features/recommendations/data/recommendationRepo";
import { listSkippedDays } from "@/features/recommendations/data/skipDayRepo";
import { getUserSettings } from "@/features/settings/data/settingsRepo";
import { card } from "@/features/settings/ui/styles";
import { defaultLocale, isLocale } from "@/i18n/config";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatMonthYear } from "@/lib/time/format";

export default function HistoryPage({ searchParams }: PageProps<"/history">) {
  return (
    <Suspense
      fallback={
        <div aria-busy="true" className="pt-6 lg:pt-8">
          <div className="h-10 w-40 animate-pulse rounded-tile bg-(--hero-chip-light)" />
          <div className="mt-4 h-64 animate-pulse rounded-card glass" />
        </div>
      }
    >
      <HistoryContent searchParams={searchParams} />
    </Suspense>
  );
}

const navButton =
  "grid size-11 place-items-center rounded-control border border-divider text-ink transition-colors duration-(--duration-fast) hover:bg-fill-soft";

async function HistoryContent({
  searchParams,
}: Pick<PageProps<"/history">, "searchParams">) {
  const params = await searchParams;
  const raw = await getLocale();
  const locale = isLocale(raw) ? raw : defaultLocale;
  const [nav, t, td, user] = await Promise.all([
    getTranslations("nav"),
    getTranslations("history"),
    getTranslations("dashboard"),
    requireUser(),
  ]);
  const supabase = await createClient();
  const settings = await getUserSettings(supabase, user.id);
  if (!settings) throw new Error("No settings row for the signed-in user");

  const tz = settings.timeZone;
  const currentMonth = monthOf(localDateOf(new Date(), tz));
  const month = parseMonth(
    typeof params.month === "string" ? params.month : undefined,
    currentMonth,
  );
  const { first, last } = monthBounds(month); // real last day: Postgres rejects 2026-11-31

  const [stored, skipped] = await Promise.all([
    getRecommendations(supabase, user.id, first, last),
    listSkippedDays(supabase, user.id, first, last),
  ]);
  const view = buildMonthView({ month, currentMonth, stored, skipped });
  const at = (date: string) =>
    zonedToInstant(date as LocalDate, "12:00" as LocalTime, tz);
  const title = formatMonthYear(at(view.first), locale);

  const decided =
    view.counts.car + view.counts.motorcycle + view.counts.unknown;
  const legend = [
    { key: "car", count: view.counts.car, bar: "bg-car" },
    { key: "motorcycle", count: view.counts.motorcycle, bar: "bg-moto" },
    { key: "unknown", count: view.counts.unknown, bar: "bg-risk-unknown-fill" },
  ] as const;

  return (
    <div className="pt-6 lg:pt-8">
      <h1 className="text-display font-bold tracking-[-0.02em] text-hero">
        {nav("history")}
      </h1>

      {!settings.home.isSet || !settings.work.isSet ? (
        <NeedsSetup reason="locations" />
      ) : null}

      <div className="mt-4 flex items-center justify-between gap-3">
        <Link
          href={`/history?month=${view.prev}`}
          scroll={false}
          aria-label={t("prevMonth")}
          className={navButton}
        >
          <span aria-hidden="true">‹</span>
        </Link>
        <h2 className="text-title font-semibold tabular">{title}</h2>
        {view.next ? (
          <Link
            href={`/history?month=${view.next}`}
            scroll={false}
            aria-label={t("nextMonth")}
            className={navButton}
          >
            <span aria-hidden="true">›</span>
          </Link>
        ) : (
          <span aria-hidden="true" className="size-11" />
        )}
      </div>

      <section aria-labelledby="summary-title" className={`${card} mt-3`}>
        <h2 id="summary-title" className="text-body font-semibold">
          {t("summary")}
        </h2>
        {decided > 0 ? (
          <div
            role="img"
            aria-label={t("bar", {
              car: view.counts.car,
              motorcycle: view.counts.motorcycle,
              unknown: view.counts.unknown,
            })}
            className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-divider"
          >
            {legend.map((l) =>
              l.count > 0 ? (
                <span
                  key={l.key}
                  className={l.bar}
                  style={{ width: `${(l.count / decided) * 100}%` }}
                />
              ) : null,
            )}
          </div>
        ) : null}
        <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {legend.map((l) => {
            const style = VEHICLE_STYLE[l.key];
            return (
              <div key={l.key} className="rounded-tile bg-fill-soft px-3 py-2">
                <dt
                  className={`flex items-center gap-1.5 text-caption font-medium ${style.text}`}
                >
                  <Icon name={style.icon} className="size-4 shrink-0" />
                  {td(`week.short.${l.key}`)}
                </dt>
                <dd className="text-headline font-semibold tabular">
                  {l.count}
                </dd>
              </div>
            );
          })}
          <div className="rounded-tile bg-fill-soft px-3 py-2">
            <dt className="flex items-center gap-1.5 text-caption font-medium text-ink-3">
              <Icon name="eventBusy" className="size-4 shrink-0" />
              {t("skipped")}
            </dt>
            <dd className="text-headline font-semibold tabular">
              {view.counts.skipped}
            </dd>
          </div>
        </dl>
      </section>

      <section aria-label={title} className={`${card} mt-4`}>
        {view.rows.length === 0 ? (
          <p className="text-body text-ink-2">{t("empty", { month: title })}</p>
        ) : (
          <HistoryList rows={view.rows} at={at} locale={locale} />
        )}
      </section>
    </div>
  );
}
