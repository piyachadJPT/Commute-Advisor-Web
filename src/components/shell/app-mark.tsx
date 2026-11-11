/** Placeholder app mark: a rain cloud over a wheel (final icon set ships in Phase 5, §11.11). */
export function AppMark({ className = "size-9" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M11 17.5a6 6 0 0 1 1.2-11.9A8 8 0 0 1 27.4 7a5.3 5.3 0 0 1 1.6 10.5Z"
        fill="var(--primary)"
      />
      <path
        d="M14 21l-1.6 3.2M20 21l-1.6 3.2M26 21l-1.6 3.2"
        stroke="var(--primary)"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle
        cx="20"
        cy="31"
        r="6.5"
        fill="none"
        stroke="var(--ink)"
        strokeWidth="2.4"
      />
      <circle cx="20" cy="31" r="1.8" fill="var(--ink)" />
    </svg>
  );
}
