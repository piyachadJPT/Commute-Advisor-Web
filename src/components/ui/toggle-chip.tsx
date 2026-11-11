"use client";

import type { ReactNode } from "react";

/**
 * An on/off chip, for choices like weekdays. A button with `role="checkbox"`, so Space and
 * Enter toggle it. Submits through a hidden input only while on.
 */
export function ToggleChip({
  name,
  value,
  checked,
  onToggle,
  children,
}: {
  name: string;
  value: string | number;
  checked: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <>
      {checked ? <input type="hidden" name={name} value={value} /> : null}
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        onClick={onToggle}
        className="inline-flex min-h-11 min-w-12 items-center justify-center rounded-chip border border-divider px-3 text-label font-semibold text-ink-2 transition-colors duration-(--duration-fast) hover:bg-fill-soft focus-visible:outline-2 focus-visible:outline-offset-2 aria-checked:border-transparent aria-checked:bg-primary aria-checked:text-primary-ink"
      >
        {children}
      </button>
    </>
  );
}
