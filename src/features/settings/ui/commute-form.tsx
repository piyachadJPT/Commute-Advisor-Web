"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { saveCommuteSettings } from "../actions";
import { initialSettingsState } from "../state";
import { WEEKDAY_BITS } from "../schemas";
import { card, cardTitle, fieldLabel, input, primaryButton } from "./styles";

const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

type Props = {
  departureTime: string;
  returnTime: string;
  durationMinutes: number;
  threshold: number;
  commuteDays: number;
};

/**
 * Commute times, days and the rain threshold. Fields are controlled on purpose: React resets
 * uncontrolled fields after every form action, which would wipe the form after saving.
 */
export function CommuteForm(initial: Props) {
  const t = useTranslations("settings");
  const [state, action, pending] = useActionState(
    saveCommuteSettings,
    initialSettingsState,
  );
  const [departure, setDeparture] = useState(initial.departureTime);
  const [ret, setRet] = useState(initial.returnTime);
  const [duration, setDuration] = useState(String(initial.durationMinutes));
  const [threshold, setThreshold] = useState(initial.threshold);
  const [days, setDays] = useState(initial.commuteDays);

  return (
    <form action={action} className="space-y-6">
      <section aria-labelledby="commute-title" className={card}>
        <h2 id="commute-title" className={cardTitle}>
          {t("commute.title")}
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="departureTime" className={fieldLabel}>
              {t("commute.departure")}
            </label>
            <input
              id="departureTime"
              name="departureTime"
              type="time"
              required
              value={departure}
              onChange={(e) => setDeparture(e.target.value)}
              className={`${input} tabular-nums`}
            />
          </div>
          <div>
            <label htmlFor="returnTime" className={fieldLabel}>
              {t("commute.return")}
            </label>
            <input
              id="returnTime"
              name="returnTime"
              type="time"
              required
              value={ret}
              onChange={(e) => setRet(e.target.value)}
              className={`${input} tabular-nums`}
            />
          </div>
          <div>
            <label htmlFor="durationMinutes" className={fieldLabel}>
              {t("commute.duration")}
            </label>
            <input
              id="durationMinutes"
              name="durationMinutes"
              type="number"
              inputMode="numeric"
              min={15}
              max={180}
              step={5}
              required
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className={`${input} tabular-nums`}
            />
          </div>
        </div>

        <fieldset className="mt-5">
          <legend className={fieldLabel}>{t("commute.days")}</legend>
          <div className="flex flex-wrap gap-2">
            {DAY_KEYS.map((key, i) => {
              const bit = WEEKDAY_BITS[i]!;
              return (
                <label
                  key={key}
                  className="relative inline-flex min-h-11 min-w-12 cursor-pointer items-center justify-center rounded-chip border border-divider px-3 text-label font-semibold text-ink-2 transition-colors duration-(--duration-fast) has-checked:border-transparent has-checked:bg-primary has-checked:text-primary-ink has-focus-visible:outline-2 has-focus-visible:outline-offset-2"
                >
                  <input
                    type="checkbox"
                    name="day"
                    value={bit}
                    checked={(days & bit) !== 0}
                    onChange={() => setDays((d) => d ^ bit)}
                    className="absolute inset-0 cursor-pointer opacity-0"
                  />
                  {t(`days.${key}`)}
                </label>
              );
            })}
          </div>
        </fieldset>
      </section>

      <section aria-labelledby="analysis-title" className={card}>
        <h2 id="analysis-title" className={cardTitle}>
          {t("analysis.title")}
        </h2>
        <label htmlFor="threshold" className={`${fieldLabel} mt-4`}>
          {t("analysis.threshold")}
          <span className="ml-2 font-semibold tabular-nums">{threshold}%</span>
        </label>
        <input
          id="threshold"
          name="threshold"
          type="range"
          min={10}
          max={90}
          step={5}
          value={threshold}
          onChange={(e) => setThreshold(Number(e.target.value))}
          className="block min-h-11 w-full accent-primary"
        />
        <p className="mt-1 text-caption text-ink-3" aria-live="polite">
          {t("analysis.preview", { value: threshold })}
        </p>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={primaryButton}>
          {pending ? t("saving") : t("save")}
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
