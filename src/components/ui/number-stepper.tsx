"use client";

import { useState } from "react";
import { fieldLabel, inputClass } from "./styles";

type Props = {
  id: string;
  name: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  unit?: string;
  decreaseLabel: string;
  increaseLabel: string;
};

const clamp = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, n));

const stepper =
  "grid size-12 shrink-0 place-items-center rounded-control border border-divider glass-control glass-rim text-ink transition-colors duration-(--duration-fast) hover:bg-fill-soft disabled:cursor-not-allowed disabled:text-ink-3 focus-visible:outline-2 focus-visible:outline-offset-2";

/**
 * A number field with our own minus and plus buttons. You can type a value too: it applies as
 * soon as it is in range and snaps into range when you leave the field. The value is submitted
 * through a hidden input, so a half-typed number never reaches the server.
 */
export function NumberStepper({
  id,
  name,
  label,
  value,
  onChange,
  min,
  max,
  step,
  unit,
  decreaseLabel,
  increaseLabel,
}: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  const bump = (by: number) => {
    setDraft(null);
    onChange(clamp(value + by, min, max));
  };

  return (
    <div role="group" aria-labelledby={`${id}-label`}>
      <label id={`${id}-label`} htmlFor={id} className={fieldLabel}>
        {label}
      </label>
      <input type="hidden" name={name} value={value} />
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={decreaseLabel}
          disabled={value <= min}
          onClick={() => bump(-step)}
          className={stepper}
        >
          <svg
            viewBox="0 0 24 24"
            className="size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M5 12h14" />
          </svg>
        </button>
        <input
          id={id}
          role="spinbutton"
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          inputMode="numeric"
          autoComplete="off"
          value={draft ?? String(value)}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, "").slice(0, 3);
            setDraft(digits);
            const n = Number(digits);
            if (digits !== "" && n >= min && n <= max) onChange(n);
          }}
          onBlur={() => {
            setDraft(null);
            onChange(
              clamp(
                Number.isNaN(Number(draft)) || draft === ""
                  ? value
                  : Number(draft ?? value),
                min,
                max,
              ),
            );
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp" || e.key === "ArrowDown") {
              e.preventDefault();
              bump(e.key === "ArrowUp" ? step : -step);
            }
          }}
          className={`${inputClass} w-20 text-center tabular`}
        />
        <button
          type="button"
          aria-label={increaseLabel}
          disabled={value >= max}
          onClick={() => bump(step)}
          className={stepper}
        >
          <svg
            viewBox="0 0 24 24"
            className="size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M5 12h14M12 5v14" />
          </svg>
        </button>
        {unit ? <span className="text-label text-ink-3">{unit}</span> : null}
      </div>
    </div>
  );
}
