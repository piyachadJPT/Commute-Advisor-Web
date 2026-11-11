import { getTranslations } from "next-intl/server";
import { Icon } from "@/components/icon";
import type { NowView } from "../mock";
import { condition } from "./condition";

/** Current-hour forecast for one location (§11.2 item 6). */
export async function NowCard({ now }: { now: NowView }) {
  const t = await getTranslations("dashboard");
  const c = condition(now.weatherCode);
  const place = t(`place.${now.location}`);

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
            <Icon name={c.icon} className="size-4 shrink-0" />
            <span className="min-w-0">
              {t(`wmo.${c.key}`)} · {now.placeName}
            </span>
          </p>
        </div>
        <p className="text-temp font-semibold tabular">{now.temperature}°</p>
      </div>
      <dl className="mt-3 grid grid-cols-1 gap-2 @min-[17rem]:grid-cols-3">
        <Stat
          label={t("now.rain")}
          value={now.rainProbability === null ? "—" : `${now.rainProbability}%`}
        />
        <Stat label={t("now.humidity")} value={`${now.humidity}%`} />
        <Stat
          label={t("now.wind")}
          value={t("now.windValue", { speed: now.windSpeed })}
        />
      </dl>
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
