"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icon";
import {
  fieldLabel,
  inputClass,
  optionClass,
  popoverClass,
  smallPrimary,
} from "./styles";
import { useDismiss } from "./use-dismiss";

type Props = {
  id: string;
  name: string;
  label: string;
  /** "HH:mm" */
  value: string;
  onChange: (value: string) => void;
  labels: { hours: string; minutes: string; done: string };
};

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * A time picker of our own: a button that opens two scrolling columns, hours and minutes.
 * Submits "HH:mm" through a hidden input. Keyboard: Enter or Space opens it, Up and Down change
 * the focused column, Tab moves between columns, Escape closes and returns focus to the button.
 */
export function TimeField({ id, name, label, value, onChange, labels }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const [hour = 0, minute = 0] = value.split(":").map(Number);

  const close = useCallback(() => {
    setOpen(false);
    button.current?.focus();
  }, []);
  useDismiss(root, open, close);

  const set = (h: number, m: number) => onChange(`${pad(h)}:${pad(m)}`);

  return (
    <div ref={root} className="relative">
      <label id={`${id}-label`} htmlFor={id} className={fieldLabel}>
        {label}
      </label>
      <input type="hidden" name={name} value={value} />
      <button
        id={id}
        ref={button}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-labelledby={`${id}-label ${id}`}
        onClick={() => setOpen((o) => !o)}
        className={`${inputClass} flex items-center justify-between text-left tabular`}
      >
        <span>{value}</span>
        <Icon name="schedule" className="size-5 text-ink-3" />
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label={label}
          className={`${popoverClass} w-64 p-3`}
        >
          <div className="grid grid-cols-2 gap-3">
            <Column
              label={labels.hours}
              count={24}
              value={hour}
              onPick={(h) => set(h, minute)}
            />
            <Column
              label={labels.minutes}
              count={60}
              value={minute}
              onPick={(m) => set(hour, m)}
            />
          </div>
          <button
            type="button"
            onClick={close}
            className={`${smallPrimary} mt-3`}
          >
            {labels.done}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Column({
  label,
  count,
  value,
  onPick,
}: {
  label: string;
  count: number;
  value: number;
  onPick: (value: number) => void;
}) {
  const list = useRef<HTMLDivElement>(null);
  const hasFocus = useRef(false);

  // Keep the selected row in view (and focused, if focus is inside) whenever it changes.
  useEffect(() => {
    const el = list.current?.querySelector<HTMLElement>(
      '[aria-selected="true"]',
    );
    const box = list.current;
    if (!el || !box) return;
    box.scrollTop = el.offsetTop - box.clientHeight / 2 + el.clientHeight / 2;
    if (hasFocus.current) el.focus();
  }, [value]);

  return (
    <div>
      <p className="mb-1 text-caption font-medium text-ink-3">{label}</p>
      <div
        ref={list}
        role="listbox"
        aria-label={label}
        onFocus={() => (hasFocus.current = true)}
        onBlur={() => (hasFocus.current = false)}
        onKeyDown={(e) => {
          const step = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
          if (step === 0) return;
          e.preventDefault();
          onPick((value + step + count) % count);
        }}
        className="relative h-48 overflow-y-auto rounded-control bg-fill-soft p-1"
      >
        {Array.from({ length: count }, (_, i) => (
          <button
            key={i}
            type="button"
            role="option"
            aria-selected={i === value}
            tabIndex={i === value ? 0 : -1}
            onClick={() => onPick(i)}
            className={optionClass}
          >
            {pad(i)}
          </button>
        ))}
      </div>
    </div>
  );
}
