import { useTranslations } from "next-intl";
import { Icon, type IconName } from "@/components/icon";
import type {
  Advisory,
  AdvisoryCode,
  Vehicle,
} from "@/features/commute/domain/types";

const ICON: Record<AdvisoryCode, IconName> = {
  heat: "thermostat",
  cold: "acUnit",
  uv: "sunny",
  gust: "air",
  lowVisibility: "foggy",
  thunderstorm: "thunderstorm",
  heavyRain: "rainyHeavy",
  wetRoad: "waterDrop",
  rainNearWindow: "rainyLight",
  darkReturn: "bedtime",
  pm25: "masks",
};

/**
 * Supporting notes for one trip (plan §23.4). Most of them concern the rider, so a car day
 * shows warnings only. The level is never colour alone: a warning has a bordered chip with a
 * "!" mark, and both levels carry a screen-reader prefix.
 */
export function AdvisoryChips({
  advisories,
  vehicle,
}: {
  advisories: readonly Advisory[];
  vehicle: Vehicle;
}) {
  const t = useTranslations("dashboard");
  const shown =
    vehicle === "car"
      ? advisories.filter((a) => a.level === "warning")
      : advisories;
  if (shown.length === 0) return null;

  return (
    <ul className="mt-3 flex flex-wrap gap-1.5">
      {shown.map((a) => {
        const warning = a.level === "warning";
        return (
          <li
            key={a.code}
            className={`inline-flex max-w-full items-start gap-1 rounded-chip px-2 py-1 text-micro leading-snug font-medium ${
              warning
                ? "border border-risk-very-high bg-fill-soft text-risk-very-high"
                : "bg-warn-surface text-warn-ink"
            }`}
          >
            <Icon
              name={ICON[a.code]}
              className="mt-px size-[1.125rem] shrink-0"
            />
            <span className="min-w-0 [overflow-wrap:anywhere]">
              <span className="sr-only">
                {t(`advisory.level.${a.level}`)}:{" "}
              </span>
              {warning ? (
                <span aria-hidden="true" className="font-bold">
                  !{" "}
                </span>
              ) : null}
              {t(`advisory.${a.code}`, a.params)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
