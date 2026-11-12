import { getFormatter, getTranslations } from "next-intl/server";
import { Icon } from "@/components/icon";
import { riskLevelOf } from "@/features/commute/domain/labels";
import { condition } from "@/features/dashboard/ui/condition";
import { RISK_STYLE } from "@/features/dashboard/ui/risk-style";
import type { WeatherView } from "../domain/buildWeatherView";

/**
 * Every hour that has data, as a list. It is also the accessible data table for the chart.
 * Rows inside a commute window carry a text tag and an accent bar (never colour alone).
 */
export async function HourlyList({ view }: { view: WeatherView }) {
  const t = await getTranslations("dashboard");
  const w = await getTranslations("weather");
  const format = await getFormatter();
  const rows = view.hours.filter((h) => h.hasRow);

  if (rows.length === 0) {
    return <p className="mt-3 text-body text-ink-2">{w("empty")}</p>;
  }

  return (
    <ol className="mt-2 divide-y divide-divider">
      {rows.map((h) => {
        const c = h.weatherCode === null ? null : condition(h.weatherCode);
        const risk = RISK_STYLE[riskLevelOf(h.probability)];
        const label = `${String(h.hour % 24).padStart(2, "0")}:00`;
        const extras = [
          h.apparentTemperature === null
            ? null
            : t("now.feelsLike", { value: Math.round(h.apparentTemperature) }),
          h.uvIndex === null
            ? null
            : t("now.uv", { value: Math.round(h.uvIndex) }),
          h.windGusts === null
            ? null
            : t("now.gusts", { value: Math.round(h.windGusts) }),
        ].filter((x): x is string => x !== null);
        return (
          <li
            key={h.hour}
            className={`@container grid grid-cols-[3.25rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-2.5 ${
              h.trip
                ? "-mx-2 rounded-tile bg-fill-soft px-2 shadow-[inset_3px_0_0_var(--primary)]"
                : ""
            }`}
          >
            <p className="text-label font-semibold tabular">{label}</p>
            <p className="flex min-w-0 items-center gap-1.5 text-label text-ink-2">
              {c ? <Icon name={c.icon} className="size-5 shrink-0" /> : null}
              <span className="min-w-0 [overflow-wrap:anywhere]">
                {c ? t(`wmo.${c.key}`) : null}
                {h.trip ? (
                  <span className="ml-1.5 rounded-chip bg-primary px-2 py-0.5 text-micro font-semibold whitespace-nowrap text-primary-ink">
                    {t(`trip.${h.trip}`)}
                  </span>
                ) : null}
              </span>
            </p>
            <dl className="flex items-center gap-x-3 text-label tabular">
              <div
                className={`flex items-center gap-1 font-semibold ${risk.text}`}
              >
                <dt className="sr-only">{t("now.rain")}</dt>
                <Icon name={risk.icon} className="size-[1.125rem] shrink-0" />
                <dd>{h.probability === null ? "—" : `${h.probability}%`}</dd>
              </div>
              <div className="hidden text-ink-2 @min-[22rem]:block">
                <dt className="sr-only">{w("precipitation")}</dt>
                <dd>
                  {h.precipitation === null
                    ? "—"
                    : t("trip.rain", {
                        mm: format.number(h.precipitation, {
                          minimumFractionDigits: 1,
                          maximumFractionDigits: 1,
                        }),
                      })}
                </dd>
              </div>
              <div className="min-w-[2.75rem] text-right font-semibold">
                <dt className="sr-only">{w("temperature")}</dt>
                <dd>
                  {h.temperature === null
                    ? "—"
                    : `${Math.round(h.temperature)}°`}
                </dd>
              </div>
              <div className="hidden min-w-[4.5rem] text-right text-ink-2 @min-[28rem]:block">
                <dt className="sr-only">{t("now.wind")}</dt>
                <dd>
                  {h.windSpeed === null
                    ? "—"
                    : t("now.windValue", { speed: Math.round(h.windSpeed) })}
                </dd>
              </div>
            </dl>
            {extras.length > 0 ? (
              <p className="col-span-3 pl-[3.75rem] text-micro text-ink-3 tabular">
                {extras.join(" · ")}
              </p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
