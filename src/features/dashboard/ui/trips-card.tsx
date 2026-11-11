import { useFormatter, useTranslations } from "next-intl";
import { Icon } from "@/components/icon";
import { skipToday } from "../actions";
import type { TripView } from "../view";
import { RISK_STYLE } from "./risk-style";

type TripsCardProps = {
  departure: TripView;
  returnTrip: TripView;
  threshold: number;
  updatedLabel: string;
  /** The target is today, so "skip today" applies. */
  canSkip: boolean;
  /** Live return-risk warning for a locked motorcycle day (plan §5.7). */
  warning: string | null;
  className?: string;
};

/** Both trips in one glass card, split by a dashed divider: one journey (§11.2). */
export function TripsCard({
  departure,
  returnTrip,
  threshold,
  updatedLabel,
  canSkip,
  warning,
  className = "",
}: TripsCardProps) {
  const t = useTranslations("dashboard");
  return (
    <section
      aria-label={t("trips")}
      className={`rounded-card glass ${className}`}
    >
      <div className="@container">
        <div className="grid grid-cols-1 py-[1.125rem] @min-[19rem]:grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)]">
          <Trip trip={departure} threshold={threshold} />
          <div
            aria-hidden="true"
            className="mx-[1.125rem] my-4 h-px bg-[repeating-linear-gradient(to_right,var(--divider)_0_6px,transparent_6px_11px)] @min-[19rem]:mx-0 @min-[19rem]:my-0 @min-[19rem]:h-auto @min-[19rem]:w-px @min-[19rem]:bg-[repeating-linear-gradient(to_bottom,var(--divider)_0_6px,transparent_6px_11px)]"
          />
          <Trip trip={returnTrip} threshold={threshold} />
        </div>
      </div>
      {warning ? (
        <p
          role="status"
          className="mx-[1.125rem] mb-3 flex items-start gap-2 rounded-tile bg-warn-surface px-3 py-2 text-label font-medium text-warn-ink"
        >
          <Icon name="warning" className="mt-0.5 size-[1.125rem] shrink-0" />
          {warning}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-divider px-[1.125rem] py-3">
        <p className="flex items-center gap-1.5 text-caption text-ink-3">
          <Icon name="schedule" className="size-4" />
          <span className="tabular">{updatedLabel}</span>
        </p>
        {canSkip ? (
          <form action={skipToday}>
            <button
              type="submit"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-control border border-divider px-3.5 text-label font-semibold whitespace-nowrap text-primary transition-colors duration-(--duration-fast) hover:bg-fill-soft"
            >
              <Icon name="eventBusy" className="size-[1.125rem]" />
              {t("skipToday")}
            </button>
          </form>
        ) : null}
      </div>
    </section>
  );
}

function Trip({ trip, threshold }: { trip: TripView; threshold: number }) {
  const t = useTranslations("dashboard");
  const format = useFormatter();
  const risk = RISK_STYLE[trip.riskLevel];
  const label = t(`trip.${trip.type}`);

  return (
    <div
      className="min-w-0 px-[1.125rem]"
      aria-label={`${label} ${trip.window}`}
      role="group"
    >
      <p className="text-caption font-medium text-ink-3">{label}</p>
      <p className="text-body font-semibold tabular">{trip.window}</p>
      <p className="mt-2.5 text-numeral font-bold tracking-[-0.02em] tabular">
        {trip.risk === null ? (
          <span className="text-ink-3">—</span>
        ) : (
          <>
            {trip.risk}
            <span className="ml-0.5 text-[0.45em] font-medium text-ink-3">
              %
            </span>
          </>
        )}
      </p>
      <div
        aria-hidden="true"
        className="relative mt-2.5 h-1.5 rounded-full bg-divider"
      >
        {trip.risk !== null ? (
          <div
            className={`h-full rounded-full ${risk.bg}`}
            style={{ width: `${trip.risk}%` }}
          />
        ) : null}
        <span
          className="absolute -top-1 -bottom-1 w-0.5 rounded-full bg-ink"
          style={{ left: `${threshold}%` }}
        />
      </div>
      <p
        className={`mt-2 flex items-center gap-1 text-label font-semibold ${risk.text}`}
      >
        <Icon name={risk.icon} className="size-[1.125rem] shrink-0" />
        {t(`risk.${trip.riskLevel}`)}
      </p>
      <p className="mt-1 text-caption text-ink-3 tabular">
        {trip.riskSource === null
          ? t("trip.missing", { hours: trip.missingHours.join(", ") })
          : `${
              trip.rainMm === null
                ? t("trip.rainUnknown")
                : t("trip.rain", {
                    mm: format.number(trip.rainMm, {
                      minimumFractionDigits: 1,
                      maximumFractionDigits: 1,
                    }),
                  })
            } · ${t("trip.source", { source: t(`location.${trip.riskSource}`) })}`}
      </p>
    </div>
  );
}
