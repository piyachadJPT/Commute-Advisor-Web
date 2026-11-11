import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Icon } from "@/components/icon";
import { riskLevelOf } from "@/features/commute/domain/labels";
import { asLocalDate, zonedToInstant } from "@/features/commute/domain/tz";
import type { LocalDate, LocalTime } from "@/features/commute/domain/types";
import { RISK_STYLE, VEHICLE_STYLE } from "@/features/dashboard/ui/risk-style";
import { monthOf } from "@/features/history/domain/buildHistory";
import { getRecommendations } from "@/features/recommendations/data/recommendationRepo";
import { listSkippedDays } from "@/features/recommendations/data/skipDayRepo";
import { renderReasonText } from "@/features/recommendations/reasonText";
import { getUserSettings } from "@/features/settings/data/settingsRepo";
import { card, quietButton } from "@/features/settings/ui/styles";
import { defaultLocale, isLocale } from "@/i18n/config";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatHeaderDate, formatStamp } from "@/lib/time/format";

export default function DayPage({ params }: PageProps<"/history/[date]">) {
  return (
    <Suspense
      fallback={
        <div aria-busy="true" className="pt-6 lg:pt-8">
          <div className="h-10 w-56 animate-pulse rounded-tile bg-(--hero-chip-light)" />
          <div className="mt-4 h-64 max-w-2xl animate-pulse rounded-card glass" />
        </div>
      }
    >
      <DayContent params={params} />
    </Suspense>
  );
}

async function DayContent({
  params,
}: Pick<PageProps<"/history/[date]">, "params">) {
  const { date: raw } = await params;
  let date: LocalDate;
  try {
    date = asLocalDate(raw);
  } catch {
    notFound();
  }

  const localeRaw = await getLocale();
  const locale = isLocale(localeRaw) ? localeRaw : defaultLocale;
  const [t, td, user, format] = await Promise.all([
    getTranslations("history.detail"),
    getTranslations("dashboard"),
    requireUser(),
    getFormatter(),
  ]);
  const supabase = await createClient();
  const settings = await getUserSettings(supabase, user.id);
  if (!settings) throw new Error("No settings row for the signed-in user");

  const [stored, skipped] = await Promise.all([
    getRecommendations(supabase, user.id, date, date),
    listSkippedDays(supabase, user.id, date, date),
  ]);
  const rec = stored.get(date);
  const isSkipped = skipped.has(date);
  if (!rec && !isSkipped) notFound();

  const noon = zonedToInstant(date, "12:00" as LocalTime, settings.timeZone);
  const back = (
    <Link
      href={`/history?month=${monthOf(date)}`}
      className={`${quietButton} -ml-2`}
    >
      {t("back")}
    </Link>
  );
  const heading = (
    <h1 className="mt-2 text-headline font-bold tracking-[-0.01em] text-hero">
      {formatHeaderDate(noon, locale)}
    </h1>
  );

  // A skipped day shows as skipped, even if a recommendation was stored before the skip.
  if (isSkipped || !rec) {
    return (
      <div className="pt-6 lg:pt-8">
        {back}
        {heading}
        <section className={`${card} mt-4 max-w-2xl`}>
          <p className="flex items-center gap-2 text-body font-medium">
            <Icon name="eventBusy" className="size-5 shrink-0" />
            {t("skipped")}
          </p>
        </section>
      </div>
    );
  }

  const style = VEHICLE_STYLE[rec.vehicle];
  const trips = [
    {
      type: "departure",
      risk: rec.departureRisk,
      source: rec.departureRiskSource,
      mm: rec.departureRainMm,
    },
    {
      type: "return",
      risk: rec.returnRisk,
      source: rec.returnRiskSource,
      mm: rec.returnRainMm,
    },
  ] as const;
  const latestDiffers =
    rec.lockedAt !== null &&
    rec.returnRiskLatest !== null &&
    rec.returnRiskLatest !== rec.returnRisk;

  return (
    <div className="pt-6 lg:pt-8">
      {back}
      {heading}

      <section
        aria-labelledby="verdict-title"
        className={`${card} mt-4 max-w-2xl`}
      >
        <div className="flex items-center gap-3">
          <span
            className={`grid size-10 place-items-center rounded-tile ${style.tint} ${style.text}`}
          >
            <Icon name={style.icon} className="size-6" />
          </span>
          <h2 id="verdict-title" className="text-title font-semibold">
            {td(`verdict.${rec.vehicle}`)}
          </h2>
        </div>
        <p className="mt-3 text-body text-ink-2">
          {renderReasonText(rec.reason, locale)}
        </p>
      </section>

      <section
        aria-label={td("trips")}
        className={`${card} mt-4 grid max-w-2xl gap-4 sm:grid-cols-2`}
      >
        {trips.map((trip) => {
          const level = riskLevelOf(trip.risk);
          const risk = RISK_STYLE[level];
          return (
            <div key={trip.type}>
              <p className="text-caption font-medium text-ink-3">
                {td(`trip.${trip.type}`)}
              </p>
              <p className="text-numeral font-bold tracking-[-0.02em] tabular">
                {trip.risk === null ? (
                  <span className="text-ink-3">—</span>
                ) : (
                  `${trip.risk}%`
                )}
              </p>
              <p
                className={`mt-1 flex items-center gap-1 text-label font-semibold ${risk.text}`}
              >
                <Icon name={risk.icon} className="size-[1.125rem] shrink-0" />
                {td(`risk.${level}`)}
              </p>
              <p className="mt-1 text-caption text-ink-3 tabular">
                {trip.mm === null
                  ? td("trip.rainUnknown")
                  : td("trip.rain", {
                      mm: format.number(trip.mm, {
                        minimumFractionDigits: 1,
                        maximumFractionDigits: 1,
                      }),
                    })}
                {trip.source
                  ? ` · ${td("trip.source", { source: td(`location.${trip.source}`) })}`
                  : null}
              </p>
            </div>
          );
        })}
      </section>

      <section className={`${card} mt-4 max-w-2xl`}>
        <dl className="space-y-2 text-label">
          <Row label={t("lockedLabel")}>
            {rec.lockedAt ? formatStamp(rec.lockedAt, locale) : t("notLocked")}
          </Row>
          <Row label={t("fetchedLabel")}>
            {rec.forecastFetchedAt
              ? formatStamp(rec.forecastFetchedAt, locale)
              : t("noFetch")}
          </Row>
          {latestDiffers ? (
            <Row label={t("latestLabel")}>
              <span className="tabular">
                {t("latest", { risk: rec.returnRiskLatest! })}
              </span>
            </Row>
          ) : null}
          <Row label={t("dataLabel")}>
            {rec.dataComplete ? t("complete") : t("incomplete")}
          </Row>
        </dl>
      </section>
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap justify-between gap-x-4 gap-y-0.5 border-b border-divider pb-2 last:border-b-0 last:pb-0">
      <dt className="text-ink-3">{label}</dt>
      <dd className="font-medium tabular">{children}</dd>
    </div>
  );
}
