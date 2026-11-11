"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The rendered width of an element, kept up to date as it resizes. Charts use it to lay out in
 * real pixels, so text keeps its size instead of scaling with the width of the screen.
 * `initial` is what server rendering and the first paint use.
 */
export function useElementWidth<T extends HTMLElement>(initial: number) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(initial);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // ResizeObserver reports once when it starts observing, so there is no separate first read.
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(Math.round(w));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, width] as const;
}
