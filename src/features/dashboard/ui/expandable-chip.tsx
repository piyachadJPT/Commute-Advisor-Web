"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * One advisory chip on a single line, cut with "…" when it does not fit. Only a chip that is
 * actually cut becomes a button, and tapping it shows the whole text (tap again to fold). The
 * full text is always in the DOM, so screen readers read it whole either way.
 */
export function ExpandableChip({
  className,
  icon,
  children,
}: {
  className: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  const textRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [cut, setCut] = useState(false);

  useEffect(() => {
    const el = textRef.current;
    if (!el || open) return; // measure folded only; an open chip wraps and never overflows
    const measure = () => setCut(el.scrollWidth > el.clientWidth + 1);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);

  const body = (
    <>
      {icon}
      <span
        ref={textRef}
        className={`min-w-0 ${open ? "[overflow-wrap:anywhere]" : "truncate"}`}
      >
        {children}
      </span>
    </>
  );
  const layout = "flex max-w-full items-start gap-1 text-left";

  return (
    <li className={`inline-flex max-w-full ${className}`}>
      {cut || open ? (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className={`${layout} cursor-pointer rounded-chip focus-visible:outline-2 focus-visible:outline-offset-2`}
        >
          {body}
        </button>
      ) : (
        <span className={layout}>{body}</span>
      )}
    </li>
  );
}
