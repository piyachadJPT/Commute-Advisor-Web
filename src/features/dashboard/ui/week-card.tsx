import { useTranslations } from "next-intl";
import { DragScroll } from "@/components/drag-scroll";
import { Icon } from "@/components/icon";
import type { Locale } from "@/i18n/config";
import { formatDateRange, formatWeekdayCompact } from "@/lib/time/format";
import type { WeekDayView } from "../view";
import { VEHICLE_STYLE } from "./risk-style";

/** Mon–Fri at a glance: locked past days, today, forecast days (§11.2 item 8). */
export function WeekCard({
  week,
  locale,
  className = "",
}: {
  week: WeekDayView[];
  locale: Locale;
  className?: string;
}) {
  const t = useTranslations("dashboard");
  const first = week[0];
  const last = week.at(-1);
  const decided = week.filter((d) => d.kind !== "future");
  const count = (v: "car" | "motorcycle") =>
    decided.filter((d) => d.vehicle === v).length;
  const pending = week.length - decided.length;

  return (
    <section
      aria-labelledby="week-title"
      className={`flex flex-col rounded-card p-[1.125rem] glass ${className}`}
    >
      <h2 id="week-title" className="text-body font-semibold">
        {t("week.title")}
      </h2>
      {first && last ? (
        <p className="text-caption text-ink-3 tabular">
          {formatDateRange(first.date, last.date, locale)}
        </p>
      ) : null}

      <DragScroll label={t("week.title")} className="mt-3.5 flex-1 pb-1">
        <ol className="grid h-full auto-cols-[minmax(3.25rem,1fr)] grid-flow-col gap-2">
          {week.map((d) => {
            const vehicle = d.vehicle ?? "unknown";
            const style = VEHICLE_STYLE[vehicle];
            const caption =
              d.kind === "today"
                ? t("week.today")
                : d.kind === "future"
                  ? d.maxRisk === null
                    ? "—"
                    : `${d.maxRisk}%`
                  : t(`week.short.${vehicle}`);
            const label =
              d.kind === "future" && d.maxRisk !== null
                ? `${t(`verdict.${vehicle}`)} · ${t("week.forecast", { risk: d.maxRisk })}`
                : t(`verdict.${vehicle}`);
            return (
              <li
                key={d.date.toISOString()}
                aria-current={d.kind === "today" ? "date" : undefined}
                className={[
                  "flex min-w-0 flex-col items-center justify-center rounded-tile px-1 py-2.5 text-center",
                  d.kind === "future"
                    ? "border border-dashed border-divider"
                    : "bg-fill-soft",
                  d.kind === "today"
                    ? "outline-2 -outline-offset-2 outline-primary"
                    : "",
                ].join(" ")}
              >
                <p className="text-micro text-ink-3 tabular">
                  {formatWeekdayCompact(d.date, locale)}{" "}
                  {d.date.toLocaleDateString("en-GB", {
                    day: "numeric",
                    timeZone: "Asia/Bangkok",
                  })}
                </p>
                <Icon
                  name={style.icon}
                  label={label}
                  className={`mx-auto my-1.5 size-6 ${style.text}`}
                />
                <p className="w-full truncate text-micro font-semibold tabular">
                  {caption}
                </p>
              </li>
            );
          })}
        </ol>
      </DragScroll>

      <p className="mt-3 flex flex-wrap gap-x-3.5 gap-y-1 text-caption text-ink-3">
        <span>
          {t("week.tally.car")}{" "}
          <b className="font-semibold text-ink tabular">{count("car")}</b>
        </span>
        <span>
          {t("week.tally.motorcycle")}{" "}
          <b className="font-semibold text-ink tabular">
            {count("motorcycle")}
          </b>
        </span>
        <span>
          {t("week.tally.pending")}{" "}
          <b className="font-semibold text-ink tabular">{pending}</b>
        </span>
      </p>
    </section>
  );
}
