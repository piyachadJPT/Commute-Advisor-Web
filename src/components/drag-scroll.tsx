"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * A horizontally scrolling region that a mouse can scroll. Scrollbars are hidden app-wide, so a
 * mouse needs another way to reach the rest of a wide chart. Three are provided:
 *  - the mouse wheel: scrolls the region sideways while it can still move in that direction, and
 *    once it reaches an end the wheel goes back to scrolling the page, so the page never traps you;
 *  - dragging with the mouse or a pen;
 *  - the keyboard: Tab to the region, then the arrow keys.
 * Touch needs nothing (native panning), and a trackpad's sideways swipe works natively too.
 */
export function DragScroll({
  children,
  label,
  className = "",
}: {
  children: ReactNode;
  /** Accessible name of the region. */
  label: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; left: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  // A native listener, not onWheel: React's wheel handlers are passive and cannot cancel the
  // page scroll.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      // A sideways gesture (trackpad, Shift + wheel) is already horizontal: leave it alone.
      if (Math.abs(e.deltaX) >= Math.abs(e.deltaY) || e.ctrlKey) return;
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 0) return;
      const atStart = el.scrollLeft <= 0 && e.deltaY < 0;
      const atEnd = el.scrollLeft >= max - 1 && e.deltaY > 0;
      if (atStart || atEnd) return; // let the page scroll
      const unit =
        e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientWidth : 1;
      el.scrollLeft += e.deltaY * unit;
      e.preventDefault();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  return (
    <div
      ref={ref}
      role="region"
      aria-label={label}
      tabIndex={0}
      onPointerDown={(e) => {
        // Touch pans natively. Only a primary-button mouse or pen drag is handled here.
        if (e.pointerType === "touch" || e.button !== 0 || !ref.current) return;
        start.current = { x: e.clientX, left: ref.current.scrollLeft };
        ref.current.setPointerCapture(e.pointerId);
        setDragging(true);
      }}
      onPointerMove={(e) => {
        if (start.current && ref.current) {
          ref.current.scrollLeft =
            start.current.left - (e.clientX - start.current.x);
        }
      }}
      onPointerUp={(e) => {
        start.current = null;
        ref.current?.releasePointerCapture(e.pointerId);
        setDragging(false);
      }}
      onPointerCancel={() => {
        start.current = null;
        setDragging(false);
      }}
      className={`overflow-x-auto ${dragging ? "cursor-grabbing select-none" : "cursor-grab"} ${className}`}
    >
      {children}
    </div>
  );
}
