import { useTranslations } from "next-intl";
import { Icon } from "@/components/icon";
import type { Locale } from "@/i18n/config";
import { formatDayMonth, formatWeekdayShort } from "@/lib/time/format";
import type { NextDayView } from "../view";
import { VEHICLE_STYLE } from "./risk-style";

/** Upcoming commute days inside the 3-day forecast (§11.2 item 7). */
export function NextDaysCard({
  days,
  locale,
  className = "",
}: {
  days: NextDayView[];
  locale: Locale;
  className?: string;
}) {
  const t = useTranslations("dashboard");
  return (
    <section
      aria-labelledby="next-title"
      className={`@container rounded-card p-[1.125rem] glass ${className}`}
    >
      <h2 id="next-title" className="text-body font-semibold">
        {t("nextDays.title")}
      </h2>
      <p className="text-caption text-ink-3">{t("nextDays.subtitle")}</p>
      <ul className="mt-2">
        {days.map((d) => {
          const vehicle = d.vehicle ?? "unknown";
          const style = VEHICLE_STYLE[vehicle];
          return (
            <li
              key={d.date.toISOString()}
              className="grid grid-cols-[2rem_minmax(0,1fr)] items-center gap-x-2.5 gap-y-0.5 border-b border-divider py-2.5 last:border-b-0 @min-[19rem]:grid-cols-[4.25rem_2rem_minmax(0,1fr)_auto]"
            >
              <p className="col-span-2 font-semibold @min-[19rem]:col-span-1">
                {formatWeekdayShort(d.date, locale)}
                <span className="block text-micro font-normal text-ink-3">
                  {formatDayMonth(d.date, locale)}
                </span>
              </p>
              <span
                className={`grid size-8 place-items-center rounded-[10px] ${style.tint} ${style.text}`}
              >
                <Icon name={style.icon} className="size-5" />
              </span>
              <p className="text-label font-semibold [overflow-wrap:anywhere]">
                {d.vehicle === null
                  ? t("nextDays.beyond")
                  : t(`verdict.${d.vehicle}`)}
              </p>
              <p className="col-start-2 text-caption text-ink-3 tabular @min-[19rem]:col-start-auto">
                {d.departureRisk === null || d.returnRisk === null ? (
                  t("nextDays.beyondNote")
                ) : (
                  <span
                    aria-label={t("nextDays.risksLabel", {
                      dep: d.departureRisk,
                      ret: d.returnRisk,
                    })}
                  >
                    {t("nextDays.risks", {
                      dep: d.departureRisk,
                      ret: d.returnRisk,
                    })}
                  </span>
                )}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
