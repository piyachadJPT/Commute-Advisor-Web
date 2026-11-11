"use client";

import { useId, useRef, useState } from "react";
import { fieldLabel, inputClass, popoverClass } from "./styles";
import { useDismiss } from "./use-dismiss";

export type ComboOption = { id: string; label: string; description?: string };

type Props = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: ComboOption[];
  onSelect: (option: ComboOption) => void;
  /** Status line under the field (hint, searching, no results). Announced politely. */
  status?: string | null;
  listLabel: string;
};

/**
 * A text field with our own dropdown of suggestions (the ARIA combobox pattern). Typing is a
 * real `<input>`; the list is ours: arrows move, Enter picks, Escape closes, a press picks.
 * It is controlled by the parent, which decides what the options are.
 */
export function Combobox({
  id,
  label,
  value,
  onChange,
  options,
  onSelect,
  status,
  listLabel,
}: Props) {
  const listId = useId();
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const visible = open && options.length > 0;

  useDismiss(root, visible, () => setOpen(false));

  const pick = (o: ComboOption) => {
    onSelect(o);
    setOpen(false);
    setActive(-1);
  };

  return (
    <div ref={root}>
      <label htmlFor={id} className={fieldLabel}>
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type="text"
          role="combobox"
          aria-expanded={visible}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            visible && active >= 0 ? `${listId}-${active}` : undefined
          }
          aria-describedby={`${id}-status`}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              if (options.length === 0) return;
              e.preventDefault();
              setOpen(true);
              const delta = e.key === "ArrowDown" ? 1 : -1;
              setActive((a) => (a + delta + options.length) % options.length);
            } else if (e.key === "Enter" && visible && active >= 0) {
              e.preventDefault(); // do not submit the form; pick the option
              pick(options[active]!);
            }
          }}
          className={inputClass}
        />

        {visible ? (
          <ul
            id={listId}
            role="listbox"
            aria-label={listLabel}
            className={`${popoverClass} top-full max-h-64 w-full overflow-y-auto p-1`}
          >
            {options.map((o, i) => (
              <li
                key={o.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                // mousedown keeps focus in the field, so the list does not close before the pick
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(o)}
                onMouseMove={() => setActive(i)}
                className="flex min-h-12 cursor-pointer flex-col justify-center rounded-tile px-3 py-1.5 transition-colors duration-(--duration-fast) aria-selected:bg-primary aria-selected:text-primary-ink"
              >
                <span className="text-body font-medium">{o.label}</span>
                {o.description ? (
                  <span className="text-caption opacity-80">
                    {o.description}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <p
        id={`${id}-status`}
        role="status"
        className="mt-1.5 text-caption text-ink-3"
      >
        {status}
      </p>
    </div>
  );
}
