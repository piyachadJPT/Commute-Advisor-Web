import { riskLevelOf } from "@/features/commute/domain/labels";
import { RISK_STYLE } from "@/features/dashboard/ui/risk-style";
import type { WeatherView } from "../domain/buildWeatherView";

type Props = {
  view: WeatherView;
  threshold: number;
  title: string;
  /** Text alternative for the whole chart; the hourly list is the full data table (§11.10). */
  summary: string;
  windowLabels: { departure: string; return: string };
};

// Plot geometry in viewBox units. The SVG never renders narrower than 42rem so its 13-unit
// text stays readable; narrow screens scroll the chart instead (§11.2).
const W = 700;
const H = 240;
const L = 34;
const R = 14;
const T = 28;
const B = 28;
const plotW = W - L - R;
const plotH = H - T - B;
const x = (hour: number) => L + (hour / 24) * plotW;
const y = (p: number) => T + plotH - (p / 100) * plotH;
const slot = plotW / 24;

/** Hourly rain probability for one location and day, drawn as plain SVG (plan §11.3). */
export function WeatherChart({
  view,
  threshold,
  title,
  summary,
  windowLabels,
}: Props) {
  return (
    <div
      role="region"
      aria-label={title}
      tabIndex={0}
      className="-mx-[1.125rem] overflow-x-auto px-[1.125rem] focus-visible:outline-offset-[-2px]"
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={summary}
        className="block h-auto w-full min-w-[42rem]"
      >
        {view.windows.map((w) => (
          <g key={w.type}>
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
              {windowLabels[w.type]}
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

        {view.hours.map((h) => {
          // Label T covers the hour BEFORE it, so its bar sits between T-1 and T.
          const bx = x(h.hour - 1) + slot * 0.2;
          const bw = slot * 0.6;
          if (h.probability === null) {
            return (
              <rect
                key={h.hour}
                x={bx}
                y={T + plotH - 24}
                width={bw}
                height={24}
                rx="5"
                fill="none"
                strokeDasharray="3 3"
                className="stroke-risk-unknown"
              />
            );
          }
          const top = y(Math.max(h.probability, 2));
          return (
            <g key={h.hour}>
              <rect
                x={bx}
                y={top}
                width={bw}
                height={T + plotH - top}
                rx="5"
                className={RISK_STYLE[riskLevelOf(h.probability)].svgFill}
              />
              {h.probability >= threshold ? (
                <text
                  x={bx + bw / 2}
                  y={top - 6}
                  textAnchor="middle"
                  fontSize="13"
                  fontWeight="600"
                  className="fill-ink tabular"
                >
                  {h.probability}
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

        {[0, 3, 6, 9, 12, 15, 18, 21, 24].map((h) => (
          <text
            key={h}
            x={x(h)}
            y={H - 6}
            textAnchor="middle"
            fontSize="13"
            className="fill-ink-3 tabular"
          >
            {`${String(h % 24).padStart(2, "0")}:00`}
          </text>
        ))}
      </svg>
    </div>
  );
}
