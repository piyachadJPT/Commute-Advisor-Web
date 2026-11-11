"use client";

import { useRef, type KeyboardEvent } from "react";

type Props = {
  name: string;
  /** Id of the element that labels this slider. */
  labelledBy: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  valueText?: string;
};

const clamp = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, n));

/**
 * A slider of our own. Press or drag anywhere on the track, or use the keyboard: arrows step,
 * Page Up and Down move by ten steps, Home and End jump to the ends. Values snap to `step`.
 * Submits through a hidden input. On touch, vertical swipes still scroll the page.
 */
export function Slider({
  name,
  labelledBy,
  value,
  onChange,
  min,
  max,
  step,
  valueText,
}: Props) {
  const track = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const pct = ((value - min) / (max - min)) * 100;

  const fromPointer = (clientX: number) => {
    const box = track.current?.getBoundingClientRect();
    if (!box) return value;
    const ratio = clamp((clientX - box.left) / box.width, 0, 1);
    const snapped = Math.round((ratio * (max - min)) / step) * step + min;
    return clamp(snapped, min, max);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const by: Record<string, number> = {
      ArrowRight: step,
      ArrowUp: step,
      ArrowLeft: -step,
      ArrowDown: -step,
      PageUp: step * 10,
      PageDown: -step * 10,
    };
    if (e.key === "Home") onChange(min);
    else if (e.key === "End") onChange(max);
    else if (e.key in by) onChange(clamp(value + by[e.key]!, min, max));
    else return;
    e.preventDefault();
  };

  return (
    <>
      <input type="hidden" name={name} value={value} />
      <div
        role="slider"
        tabIndex={0}
        aria-labelledby={labelledBy}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={valueText}
        onKeyDown={onKeyDown}
        onPointerDown={(e) => {
          dragging.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          onChange(fromPointer(e.clientX));
        }}
        onPointerMove={(e) => {
          if (dragging.current) onChange(fromPointer(e.clientX));
        }}
        onPointerUp={(e) => {
          dragging.current = false;
          e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onPointerCancel={() => (dragging.current = false)}
        className="flex h-12 cursor-pointer touch-pan-y items-center rounded-control px-3.5 focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <div
          ref={track}
          className="relative h-1.5 w-full rounded-full bg-divider"
        >
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-primary"
            style={{ width: `${pct}%` }}
          />
          <span
            aria-hidden="true"
            className="absolute top-1/2 size-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-glass-solid shadow-glass"
            style={{ left: `${pct}%` }}
          />
        </div>
      </div>
    </>
  );
}
