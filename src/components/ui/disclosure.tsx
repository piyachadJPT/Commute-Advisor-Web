"use client";

import { useId, type ReactNode } from "react";

/** Show/hide section with our own header button (replaces the browser's <details>). */
export function Disclosure({
  label,
  open,
  onToggle,
  children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div className="rounded-control border border-divider">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={onToggle}
        className="flex min-h-12 w-full items-center justify-between gap-3 px-3.5 text-left text-label font-semibold focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
      >
        {label}
        <svg
          viewBox="0 0 24 24"
          className={`size-5 shrink-0 text-ink-3 transition-transform duration-(--duration-fast) ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open ? (
        <div id={id} className="px-3.5 pb-3">
          {children}
        </div>
      ) : null}
    </div>
  );
}
