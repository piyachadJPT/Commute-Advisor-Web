import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { VEHICLE_STYLE } from "@/features/dashboard/ui/risk-style";
import type { Locale } from "@/i18n/config";
import { formatDayMonth, formatWeekdayShort } from "@/lib/time/format";
import type { HistoryRow } from "../domain/buildHistory";

/** Days of one month, newest first. Each row links to its detail page. */
export async function HistoryList({
  rows,
  at,
  locale,
}: {
  rows: HistoryRow[];
  /** A noon instant for a local date, so weekday and day-month are formatted for that day. */
  at: (date: string) => Date;
  locale: Locale;
}) {
  const t = await getTranslations("history");
  const td = await getTranslations("dashboard");

  return (
    <ul className="divide-y divide-divider">
      {rows.map((row) => {
        const when = at(row.date);
        const day = (
          <p className="font-semibold">
            {formatWeekdayShort(when, locale)}
            <span className="block text-micro font-normal text-ink-3 tabular">
              {formatDayMonth(when, locale)}
            </span>
          </p>
        );

        if (row.kind === "skipped") {
          return (
            <li key={row.date}>
              <Link
                href={`/history/${row.date}`}
                className="grid min-h-16 grid-cols-[4.25rem_minmax(0,1fr)] items-center gap-x-2.5 py-2.5 text-ink-3 transition-colors duration-(--duration-fast) hover:text-ink"
              >
                {day}
                <p className="flex items-center gap-2 text-label font-medium">
                  <Icon name="eventBusy" className="size-5 shrink-0" />
                  {t("skipped")}
                </p>
              </Link>
            </li>
          );
        }

        const style = VEHICLE_STYLE[row.vehicle];
        const risks =
          row.departureRisk === null || row.returnRisk === null
            ? "—"
            : td("nextDays.risks", {
                dep: row.departureRisk,
                ret: row.returnRisk,
              });
        return (
          <li key={row.date}>
            <Link
              href={`/history/${row.date}`}
              className="grid min-h-16 grid-cols-[4.25rem_2rem_minmax(0,1fr)_auto] items-center gap-x-2.5 py-2.5 transition-colors duration-(--duration-fast) hover:text-primary"
            >
              {day}
              <span
                className={`grid size-8 place-items-center rounded-[10px] ${style.tint} ${style.text}`}
              >
                <Icon name={style.icon} className="size-5" />
              </span>
              <p className="min-w-0 text-label font-semibold [overflow-wrap:anywhere]">
                {td(`verdict.${row.vehicle}`)}
                {!row.locked ? (
                  <span className="block text-micro font-normal text-ink-3">
                    {t("pending")}
                  </span>
                ) : null}
                {row.returnRiskLatest !== null ? (
                  <span className="block text-micro font-normal text-ink-3 tabular">
                    {t("returnNow", { risk: row.returnRiskLatest })}
                  </span>
                ) : null}
              </p>
              <p className="text-caption text-ink-3 tabular">{risks}</p>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
