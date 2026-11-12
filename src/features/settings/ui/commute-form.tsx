"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { NumberStepper } from "@/components/ui/number-stepper";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  ADVISORY_GROUP_NAMES,
  TEMPERATURE_OFFSET_MAX,
  TEMPERATURE_OFFSET_MIN,
  type AdvisoryGroup,
} from "@/features/commute/domain/advisoryGroups";
import { TimeField } from "@/components/ui/time-field";
import { ToggleChip } from "@/components/ui/toggle-chip";
import { saveCommuteSettings } from "../actions";
import { initialSettingsState } from "../state";
import { WEEKDAY_BITS } from "../schemas";
import { card, cardTitle, fieldLabel, primaryButton } from "./styles";

const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

type Props = {
  /** Onboarding shows only times and days, and continues to the next step after saving. */
  variant?: "settings" | "onboarding";
  departureTime: string;
  returnTime: string;
  durationMinutes: number;
  threshold: number;
  commuteDays: number;
  /** Advisory settings: settings variant only (plan §23.6). */
  advisoriesDisabled?: readonly AdvisoryGroup[];
  temperatureOffset?: number;
};

/**
 * Commute times, days and the rain threshold, built from our own controls. Fields are
 * controlled on purpose: React resets uncontrolled fields after every form action, which would
 * wipe the form after saving. Each control submits through a hidden input.
 */
export function CommuteForm(initial: Props) {
  const onboarding = initial.variant === "onboarding";
  const t = useTranslations("settings");
  const [state, action, pending] = useActionState(
    saveCommuteSettings,
    initialSettingsState,
  );
  const [departure, setDeparture] = useState(initial.departureTime);
  const [ret, setRet] = useState(initial.returnTime);
  const [duration, setDuration] = useState(initial.durationMinutes);
  const [threshold, setThreshold] = useState(initial.threshold);
  const [days, setDays] = useState(initial.commuteDays);
  const [disabled, setDisabled] = useState<readonly AdvisoryGroup[]>(
    initial.advisoriesDisabled ?? [],
  );
  const [offset, setOffset] = useState(initial.temperatureOffset ?? 0);
  const toggleGroup = (group: AdvisoryGroup, on: boolean) =>
    setDisabled((d) => (on ? d.filter((g) => g !== group) : [...d, group]));
  const timeLabels = {
    hours: t("time.hours"),
    minutes: t("time.minutes"),
    done: t("time.done"),
  };

  return (
    <form action={action} className="space-y-6">
      {onboarding ? (
        <>
          <input type="hidden" name="returnTo" value="onboarding" />
          <input type="hidden" name="threshold" value={threshold} />
        </>
      ) : null}
      {/* z-20: the time pickers open over the cards below this one */}
      <section
        aria-labelledby="commute-title"
        className={`${card} relative z-20`}
      >
        <h2 id="commute-title" className={cardTitle}>
          {t("commute.title")}
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <TimeField
            id="departureTime"
            name="departureTime"
            label={t("commute.departure")}
            value={departure}
            onChange={setDeparture}
            labels={timeLabels}
          />
          <TimeField
            id="returnTime"
            name="returnTime"
            label={t("commute.return")}
            value={ret}
            onChange={setRet}
            labels={timeLabels}
          />
          <NumberStepper
            id="durationMinutes"
            name="durationMinutes"
            label={t("commute.duration")}
            value={duration}
            onChange={setDuration}
            min={15}
            max={180}
            step={5}
            unit={t("commute.minutes")}
            decreaseLabel={t("commute.decrease")}
            increaseLabel={t("commute.increase")}
          />
        </div>

        <fieldset className="mt-5">
          <legend className={fieldLabel}>{t("commute.days")}</legend>
          <div className="flex flex-wrap gap-2">
            {DAY_KEYS.map((key, i) => {
              const bit = WEEKDAY_BITS[i]!;
              return (
                <ToggleChip
                  key={key}
                  name="day"
                  value={bit}
                  checked={(days & bit) !== 0}
                  onToggle={() => setDays((d) => d ^ bit)}
                >
                  {t(`days.${key}`)}
                </ToggleChip>
              );
            })}
          </div>
        </fieldset>
      </section>

      {onboarding ? null : (
        <section
          aria-labelledby="analysis-title"
          className={`${card} relative z-10`}
        >
          <h2 id="analysis-title" className={cardTitle}>
            {t("analysis.title")}
          </h2>
          <p id="threshold-label" className={`${fieldLabel} mt-4`}>
            {t("analysis.threshold")}
            <span className="ml-2 font-semibold tabular-nums">
              {threshold}%
            </span>
          </p>
          <Slider
            name="threshold"
            labelledBy="threshold-label"
            value={threshold}
            onChange={setThreshold}
            min={10}
            max={90}
            step={5}
            valueText={`${threshold}%`}
          />
          <p className="mt-1 text-caption text-ink-3" aria-live="polite">
            {t("analysis.preview", { value: threshold })}
          </p>
        </section>
      )}

      {onboarding ? null : (
        <section
          aria-labelledby="advisories-title"
          className={`${card} relative z-0`}
        >
          <h2 id="advisories-title" className={cardTitle}>
            {t("advisories.title")}
          </h2>
          <p className="mt-1 text-caption text-ink-3">{t("advisories.note")}</p>
          <ul className="mt-2 divide-y divide-divider">
            {ADVISORY_GROUP_NAMES.map((group) => {
              const on = !disabled.includes(group);
              return (
                <li
                  key={group}
                  className="flex min-h-14 items-center justify-between gap-3 py-2"
                >
                  <span id={`advisory-${group}`} className="text-body">
                    {t(`advisories.groups.${group}`)}
                  </span>
                  <Switch
                    checked={on}
                    onChange={(next) => toggleGroup(group, next)}
                    labelledBy={`advisory-${group}`}
                  />
                  {on ? null : (
                    <input type="hidden" name="advisoryOff" value={group} />
                  )}
                </li>
              );
            })}
          </ul>
          <p id="offset-label" className={`${fieldLabel} mt-4`}>
            {t("advisories.offset")}
            <span className="ml-2 font-semibold tabular-nums">
              {offset > 0 ? `+${offset}` : offset}°
            </span>
          </p>
          <Slider
            name="temperatureOffset"
            labelledBy="offset-label"
            value={offset}
            onChange={setOffset}
            min={TEMPERATURE_OFFSET_MIN}
            max={TEMPERATURE_OFFSET_MAX}
            step={1}
            valueText={`${offset > 0 ? "+" : ""}${offset}°`}
          />
          <p className="mt-1 text-caption text-ink-3" aria-live="polite">
            {t("advisories.offsetHint")}
          </p>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={primaryButton}>
          {pending ? t("saving") : onboarding ? t("continue") : t("save")}
        </button>
        <p role="status" className="text-label">
          {state.status === "saved" ? t("saved") : null}
          {state.status === "invalid" ? t("errors.invalid") : null}
          {state.status === "failed" ? t("errors.failed") : null}
        </p>
      </div>
    </form>
  );
}
