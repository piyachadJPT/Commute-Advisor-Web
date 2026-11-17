"use client";

import { useEffect, useState, type ReactNode } from "react";

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
  // The text element is kept in state, not a ref: becoming a button replaces it, and the
  // measuring must follow the new element. Watching the old one is what kept chips untappable:
  // once removed it measures 0 wide, reads as "not cut" and turned the button back into a span.
  const [text, setText] = useState<HTMLSpanElement | null>(null);
  const [open, setOpen] = useState(false);
  const [cut, setCut] = useState(false);

  useEffect(() => {
    // Measure folded only; an open chip wraps and never overflows.
    if (!text || open) return;
    const measure = () => {
      if (!text.isConnected) return; // a replaced element says nothing about the chip
      setCut(text.scrollWidth > text.clientWidth + 1);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(text);
    return () => ro.disconnect();
  }, [text, open]);

  const body = (
    <>
      {icon}
      <span
        ref={setText}
        className={`min-w-0 ${open ? "wrap-anywhere" : "truncate"}`}
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
