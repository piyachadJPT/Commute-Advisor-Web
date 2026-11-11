"use client";

/**
 * An on/off switch of our own: a button with `role="switch"`, so Space and Enter toggle it and
 * screen readers announce on or off. The label is separate text next to it.
 */
export function Switch({
  checked,
  onChange,
  labelledBy,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Id of the element that labels this switch. */
  labelledBy: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border border-divider bg-fill-soft px-0.5 transition-colors duration-(--duration-fast) focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-60 aria-checked:border-transparent aria-checked:bg-primary"
    >
      <span
        aria-hidden="true"
        className={`size-6 rounded-full bg-glass-solid shadow-glass transition-transform duration-(--duration-fast) ${checked ? "translate-x-6" : "translate-x-0"}`}
      />
    </button>
  );
}
