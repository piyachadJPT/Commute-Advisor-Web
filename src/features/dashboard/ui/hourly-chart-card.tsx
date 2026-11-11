"use client";

import { useState } from "react";
import { DragScroll } from "@/components/drag-scroll";
import { useElementWidth } from "@/components/use-element-width";
import type { HourlySeries } from "../view";
import { FIRST_HOUR } from "../view";
import { riskLevelOf } from "@/features/commute/domain/labels";
import { RISK_STYLE } from "./risk-style";

type Series = "max" | "home" | "work";

type Window = { label: string; startHour: number; endHour: number };

type Labels = {
  title: string;
  subtitle: string;
  seriesLabel: string;
  series: Record<Series, string>;
  /** Pre-rendered per series, since ICU formatting lives on the server. */
  summary: Record<Series, string>;
};

type Props = {
  home: HourlySeries;
  work: HourlySeries;
  threshold: number;
  windows: Window[];
  labels: Labels;
  className?: string;
};

// The chart is laid out in real pixels from its measured width, so text stays 13px at any screen
// size and the plot simply gets wider (and a little taller). It never goes below 42rem; narrower
// screens scroll the chart instead (§11.2).
const MIN_W = 672;
const L = 34;
const R = 26;
const T = 28;
const B = 28;
const FROM = 4;
const TO = 22;
const MAX_BAR = 40;

export function HourlyChartCard({
  home,
  work,
  threshold,
  windows,
  labels,
  className = "",
}: Props) {
  const [series, setSeries] = useState<Series>("max");
  const [box, measured] = useElementWidth<HTMLDivElement>(MIN_W);
  const values: HourlySeries =
    series === "home"
      ? home
      : series === "work"
        ? work
        : home.map((h, i) => {
            const w = work[i] ?? null;
            return h === null || w === null ? null : Math.max(h, w);
          });

  const W = Math.max(measured, MIN_W);
  const H = Math.min(360, Math.max(240, Math.round(W * 0.28)));
  const plotW = W - L - R;
  const plotH = H - T - B;
  const x = (hour: number) => L + ((hour - FROM) / (TO - FROM)) * plotW;
  const y = (p: number) => T + plotH - (p / 100) * plotH;
  const slot = plotW / (TO - FROM);
  const bw = Math.min(slot * 0.6, MAX_BAR);

  return (
    <section
      aria-labelledby="chart-title"
      className={`rounded-card p-[1.125rem] glass ${className}`}
    >
      <div className="mb-3.5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-[1_1_14rem]">
          <h2 id="chart-title" className="text-body font-semibold">
            {labels.title}
          </h2>
          <p className="text-caption text-ink-3">{labels.subtitle}</p>
        </div>
        <div
          role="group"
          aria-label={labels.seriesLabel}
          className="inline-flex max-w-full flex-wrap rounded-control bg-fill-soft p-[3px]"
        >
          {(["max", "home", "work"] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={series === s}
              onClick={() => setSeries(s)}
              className="min-h-9 rounded-[9px] px-3 text-caption font-semibold whitespace-nowrap text-ink-3 transition-colors duration-(--duration-fast) hover:text-ink aria-pressed:bg-glass-strong aria-pressed:text-ink aria-pressed:shadow-[0_1px_3px_rgb(0_0_0/0.08)]"
            >
              {labels.series[s]}
            </button>
          ))}
        </div>
      </div>

      <DragScroll
        label={labels.title}
        className="-mx-[1.125rem] px-[1.125rem] focus-visible:outline-offset-[-2px]"
      >
        <div ref={box} className="w-full min-w-[42rem]">
          <svg
            width={W}
            height={H}
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label={labels.summary[series]}
            className="block"
          >
            {windows.map((w) => (
              <g key={w.label}>
                <rect
                  x={x(w.startHour)}
                  y={T - 20}
                  width={x(w.endHour) - x(w.startHour)}
                  height={plotH + 20}
                  rx="8"
                  className="fill-primary opacity-[0.13]"
                />
                <text
                  x={x(w.startHour) + 6}
                  y={T - 6}
                  fontSize="13"
                  fontWeight="600"
                  className="fill-ink-2"
                >
                  {w.label}
                </text>
              </g>
            ))}

            {[0, 50, 100].map((p) => (
              <g key={p}>
                <line
                  x1={L}
                  x2={W - R}
                  y1={y(p)}
                  y2={y(p)}
                  className="stroke-divider"
                />
                <text
                  x={L - 8}
                  y={y(p) + 4}
                  textAnchor="end"
                  fontSize="13"
                  className="fill-ink-3 tabular"
                >
                  {p}
                </text>
              </g>
            ))}

            {values.map((p, i) => {
              const hour = FIRST_HOUR + i;
              const bx = x(hour - 1) + (slot - bw) / 2;
              if (p === null) {
                return (
                  <rect
                    key={hour}
                    x={bx}
                    y={T + plotH - 24}
                    width={bw}
                    height={24}
                    rx="6"
                    fill="none"
                    strokeDasharray="3 3"
                    className="stroke-risk-unknown"
                  />
                );
              }
              const top = y(Math.max(p, 2));
              return (
                <g key={hour}>
                  <rect
                    x={bx}
                    y={top}
                    width={bw}
                    height={T + plotH - top}
                    rx="6"
                    className={`${RISK_STYLE[riskLevelOf(p)].svgFill} transition-[y,height] duration-(--duration-sky) ease-(--ease-standard)`}
                  />
                  {p >= threshold ? (
                    <text
                      x={bx + bw / 2}
                      y={top - 6}
                      textAnchor="middle"
                      fontSize="13"
                      fontWeight="600"
                      className="fill-ink tabular"
                    >
                      {p}
                    </text>
                  ) : null}
                </g>
              );
            })}

            <line
              x1={L}
              x2={W - R}
              y1={y(threshold)}
              y2={y(threshold)}
              strokeDasharray="6 5"
              strokeWidth="1.4"
              className="stroke-ink opacity-70"
            />

            {Array.from(
              { length: (TO - FROM) / 2 + 1 },
              (_, i) => FROM + i * 2,
            ).map((h) => (
              <text
                key={h}
                x={x(h)}
                y={H - 6}
                textAnchor="middle"
                fontSize="13"
                className="fill-ink-3 tabular"
              >
                {`${String(h).padStart(2, "0")}:00`}
              </text>
            ))}
          </svg>
        </div>
      </DragScroll>
    </section>
  );
}
