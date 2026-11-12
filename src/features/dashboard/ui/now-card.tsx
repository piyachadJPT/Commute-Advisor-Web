import { useTranslations } from "next-intl";
import { Icon } from "@/components/icon";
import type { NowView } from "../view";
import { pm25BandOf, type Pm25Band } from "@/features/commute/domain/labels";
import type { RainRiskLevel } from "@/features/commute/domain/types";
import { condition } from "./condition";
import { RISK_STYLE } from "./risk-style";

// Colour comes from the risk palette; the band is always also written out (plan §11.10).
const BAND_TONE: Record<Pm25Band, RainRiskLevel> = {
  veryGood: "veryLow",
  good: "veryLow",
  moderate: "low",
  unhealthySensitive: "high",
  unhealthy: "veryHigh",
};

/** Current-hour forecast for one location (§11.2 item 6). */
export function NowCard({ now }: { now: NowView }) {
  const t = useTranslations("dashboard");
  const c = now.weatherCode === null ? null : condition(now.weatherCode);
  const place = t(`place.${now.location}`);
  // Only what the forecast actually has; nothing is shown in place of a missing value.
  const extras = [
    now.apparentTemperature === null
      ? null
      : t("now.feelsLike", { value: now.apparentTemperature }),
    now.uvIndex === null ? null : t("now.uv", { value: now.uvIndex }),
  ].filter((x): x is string => x !== null);

  return (
    <section
      aria-label={`${place} · ${t("now.note")}`}
      className="@container rounded-card p-[1.125rem] glass"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 text-body font-semibold">
            <Icon
              name={now.location === "home" ? "homeFill" : "work"}
              className="size-[1.125rem]"
            />
            {place}
          </h2>
          <p className="flex items-center gap-1 text-caption text-ink-3">
            {c ? <Icon name={c.icon} className="size-4 shrink-0" /> : null}
            <span className="min-w-0">
              {c ? `${t(`wmo.${c.key}`)} · ` : null}
              {now.placeName}
            </span>
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-temp font-semibold tabular">
            {now.temperature === null ? "—" : `${now.temperature}°`}
          </p>
          {extras.length > 0 ? (
            <p className="text-micro text-ink-3 tabular">
              {extras.join(" · ")}
            </p>
          ) : null}
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-1 gap-2 @min-[17rem]:grid-cols-3">
        <Stat
          label={t("now.rain")}
          value={now.rainProbability === null ? "—" : `${now.rainProbability}%`}
        />
        <Stat
          label={t("now.humidity")}
          value={now.humidity === null ? "—" : `${now.humidity}%`}
        />
        <Stat
          label={t("now.wind")}
          value={
            now.windSpeed === null
              ? "—"
              : t("now.windValue", { speed: now.windSpeed })
          }
        />
      </dl>
      {now.pm25 === null ? null : (
        <div className="mt-2">
          <p
            className={`flex items-center gap-1 text-label font-semibold tabular ${RISK_STYLE[BAND_TONE[pm25BandOf(now.pm25)]].text}`}
          >
            <Icon name="masks" className="size-[1.125rem] shrink-0" />
            {t("pm.value", { value: now.pm25 })} ·{" "}
            {t(`pm.band.${pm25BandOf(now.pm25)}`)}
          </p>
          <p className="text-micro text-ink-3">{t("pm.estimate")}</p>
        </div>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-tile bg-fill-soft px-2.5 py-2">
      <dt className="text-micro text-ink-3">{label}</dt>
      <dd className="text-label font-semibold tabular">{value}</dd>
    </div>
  );
}
