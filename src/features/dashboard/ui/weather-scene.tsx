import type { CSSProperties } from "react";
import { isWet, unit, type Scene } from "./scene";

// Rainbow bands, outermost first (colours of a rainbow, not theme colours).
const RAINBOW = [
  "#ff6b6b",
  "#ffb35c",
  "#ffe27a",
  "#6fd08c",
  "#6aa8ff",
  "#a98bff",
];

const CLOUD = "M30 62a22 22 0 0 1 2-44 30 30 0 0 1 57 6 20 20 0 0 1 3 38Z";
const STAR = "M0-5L1.3-1.3 5 0 1.3 1.3 0 5-1.3 1.3-5 0-1.3-1.3Z";
const BOLT = "M104 112l-15 26h11l-7 24 24-32h-12l9-18Z";

type Vars = CSSProperties & Record<`--${string}`, string>;

function Cloud({
  x,
  y,
  scale,
  className,
}: {
  x: number;
  y: number;
  scale: number;
  className: string;
}) {
  return (
    <path
      d={CLOUD}
      transform={`translate(${x} ${y}) scale(${scale})`}
      className={className}
    />
  );
}

function Sun({
  cx,
  cy,
  r,
  rays = true,
  opacity = 1,
  low = false,
  fast = false,
}: {
  cx: number;
  cy: number;
  r: number;
  rays?: boolean;
  opacity?: number;
  /** Orange, near the horizon (dawn and dusk). */
  low?: boolean;
  fast?: boolean;
}) {
  return (
    <g opacity={opacity}>
      {rays ? (
        <g
          className={`${fast ? "fx-spin-fast" : "fx-spin"} ${
            low ? "stroke-scene-sun-low" : "stroke-scene-sun-ray"
          }`}
          style={{ transformOrigin: `${cx}px ${cy}px` }}
          strokeWidth="4"
          strokeLinecap="round"
        >
          {Array.from({ length: 12 }, (_, i) => (
            <line
              key={i}
              x1={cx}
              y1={cy - r * 1.22}
              x2={cx}
              y2={cy - r * (i % 2 ? 1.36 : 1.5)}
              transform={`rotate(${i * 30} ${cx} ${cy})`}
            />
          ))}
        </g>
      ) : null}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        className={low ? "fill-scene-sun-low" : "fill-scene-sun"}
      />
    </g>
  );
}

function Moon({
  cx,
  cy,
  r,
  opacity = 1,
}: {
  cx: number;
  cy: number;
  r: number;
  opacity?: number;
}) {
  const crater = (dx: number, dy: number, k: number) => (
    <circle
      cx={cx + dx * r}
      cy={cy + dy * r}
      r={k * r}
      className="fill-scene-moon-crater"
    />
  );
  return (
    <g opacity={opacity} className="fx-float">
      <circle cx={cx} cy={cy} r={r} className="fill-scene-moon" />
      {crater(-0.35, -0.2, 0.2)}
      {crater(0.25, 0.3, 0.26)}
      {crater(0.38, -0.35, 0.12)}
      {crater(-0.2, 0.5, 0.1)}
    </g>
  );
}

const STARS = [
  [30, 30, 1],
  [70, 14, 0.7],
  [175, 18, 0.9],
  [185, 92, 0.7],
  [24, 100, 0.8],
  [96, 112, 0.6],
];

function Stars() {
  return (
    <>
      {STARS.map(([x, y, s], i) => (
        <g key={i} transform={`translate(${x} ${y}) scale(${s})`}>
          <path
            d={STAR}
            className="fx-box fx-twinkle fill-scene-star"
            style={
              {
                "--t": `${(2.4 + unit(i, 31) * 2.4).toFixed(1)}s`,
                "--d": `-${(unit(i, 32) * 4).toFixed(1)}s`,
              } as Vars
            }
          />
        </g>
      ))}
    </>
  );
}

function Rain({
  count,
  y,
  x0 = 36,
  span = 110,
  fast = false,
}: {
  count: number;
  y: number;
  x0?: number;
  span?: number;
  fast?: boolean;
}) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const x = x0 + (i * span) / (count - 1) + (i % 2) * 3;
        const style: Vars = {
          "--t": `${((0.85 + unit(i, 41) * 0.5) * (fast ? 0.6 : 1)).toFixed(2)}s`,
          "--d": `-${(unit(i, 42) * 1.4).toFixed(2)}s`,
        };
        return (
          <path
            key={i}
            d={`M${x} ${y + (i % 3) * 5}l-3.5 9`}
            strokeWidth="3.5"
            strokeLinecap="round"
            className="fx-drop stroke-scene-rain"
            style={style}
          />
        );
      })}
    </>
  );
}

function Rainbow() {
  return (
    <g
      className="fx-rainbow"
      fill="none"
      strokeWidth="5"
      transform="translate(70 160)"
    >
      {RAINBOW.map((color, i) => {
        const r = 66 - i * 6;
        return (
          <path
            key={color}
            d={`M${-r} 0A${r} ${r} 0 0 1 ${r} 0`}
            stroke={color}
          />
        );
      })}
    </g>
  );
}

function HeatWaves() {
  return (
    <g
      fill="none"
      strokeWidth="3"
      strokeLinecap="round"
      className="stroke-scene-sun-ray"
    >
      {[122, 136, 150].map((y, i) => (
        <path
          key={y}
          d={`M44 ${y}q10-7 20 0t20 0t20 0t20 0t20 0t20 0`}
          className="fx-heat"
          style={{ "--d": `-${i * 0.9}s` } as Vars}
        />
      ))}
    </g>
  );
}

const FOG_BANDS = [
  { y: 104, x: 22, w: 156, t: "12s", d: "0s", o: 1 },
  { y: 122, x: 40, w: 128, t: "15s", d: "-5s", o: 0.8 },
  { y: 140, x: 28, w: 144, t: "13s", d: "-9s", o: 0.6 },
];

function Fog({ night }: { night: boolean }) {
  const fill = night ? "fill-scene-cloud-dark-back" : "fill-scene-cloud-back";
  return (
    <>
      {FOG_BANDS.map((b) => (
        <rect
          key={b.y}
          x={b.x}
          y={b.y}
          width={b.w}
          height="8"
          rx="4"
          opacity={b.o}
          className={`fx-band ${fill}`}
          style={{ "--t": b.t, "--d": b.d } as Vars}
        />
      ))}
    </>
  );
}

/**
 * Hero weather picture: the sun by day or the moon and stars by night, behind whatever the
 * sky is really doing (cloud, fog, drizzle, rain, thunderstorm). Everything moves slowly
 * (CSS only), and stops under reduced motion.
 */
export function WeatherScene({
  scene,
  dimmed,
}: {
  scene: Scene;
  dimmed: boolean;
}) {
  const { daypart, sky } = scene;
  const night = daypart === "night";
  const twilight = daypart === "dawn" || daypart === "dusk";
  const wet = isWet(sky);
  const dark = (wet && sky !== "sunshower") || night;
  const cloud = dark ? "fill-scene-cloud-dark" : "fill-scene-cloud";
  const cloudBack = dark
    ? "fill-scene-cloud-dark-back"
    : "fill-scene-cloud-back";

  // Sun or moon: full when clear, peeking over a rain cloud, absent in heavy rain and storms.
  const body = (() => {
    if (sky === "storm" || sky === "downpour") return null;
    const peek = sky === "drizzle" || sky === "rain";
    const faded = sky === "fog" || sky === "overcast" ? 0.6 : 1;
    if (sky === "sunshower") {
      return <Sun cx={48} cy={40} r={24} low={twilight} />;
    }
    const [cx, cy, r] = peek
      ? [150, 36, 25]
      : sky === "partly"
        ? [130, twilight ? 92 : 52, 34]
        : sky === "hot"
          ? [125, 58, 42]
          : [125, twilight ? 92 : 62, 38];
    return night ? (
      <Moon cx={cx} cy={cy} r={peek ? r - 3 : r - 6} opacity={faded} />
    ) : (
      <Sun
        cx={cx}
        cy={cy}
        r={r}
        rays={!peek && faded === 1}
        opacity={faded}
        low={twilight && !peek}
        fast={sky === "hot"}
      />
    );
  })();

  return (
    <svg
      viewBox="0 0 200 170"
      aria-hidden="true"
      focusable="false"
      className={`h-auto w-[clamp(96px,26vw,232px)] drop-shadow-[0_12px_24px_rgb(0_0_0/0.15)] ${
        dimmed ? "opacity-60 saturate-50" : ""
      }`}
    >
      {night && (sky === "clear" || sky === "partly") ? <Stars /> : null}
      {body}
      {sky === "hot" ? <HeatWaves /> : null}
      {sky === "sunshower" ? <Rainbow /> : null}

      {sky === "partly" ? (
        <g className="fx-sway">
          <Cloud x={20} y={68} scale={1.4} className={cloud} />
        </g>
      ) : null}

      {sky === "overcast" ? (
        <>
          <g className="fx-sway-slow">
            <Cloud x={70} y={10} scale={1.2} className={cloudBack} />
          </g>
          <g className="fx-sway">
            <Cloud x={14} y={42} scale={1.6} className={cloud} />
          </g>
        </>
      ) : null}

      {sky === "fog" ? (
        <>
          <g className="fx-sway-slow">
            <Cloud x={40} y={14} scale={1.5} className={cloudBack} />
          </g>
          <Fog night={night} />
        </>
      ) : null}

      {wet ? (
        <>
          {sky === "sunshower" ? (
            <Rain count={6} y={64} x0={112} span={68} />
          ) : (
            <Rain
              count={
                sky === "drizzle"
                  ? 5
                  : sky === "rain"
                    ? 8
                    : sky === "storm"
                      ? 11
                      : 15
              }
              y={sky === "storm" || sky === "downpour" ? 118 : 126}
              fast={sky === "downpour"}
            />
          )}
          {sky === "storm" ? (
            <path d={BOLT} className="fx-bolt fill-scene-bolt" />
          ) : null}
          {sky === "sunshower" ? (
            <g className="fx-sway">
              <Cloud x={86} y={10} scale={1} className={cloud} />
            </g>
          ) : (
            <>
              <g className="fx-sway-slow">
                <Cloud
                  x={70}
                  y={sky === "storm" || sky === "downpour" ? 0 : 8}
                  scale={1.2}
                  className={cloudBack}
                />
              </g>
              <g className="fx-sway">
                <Cloud
                  x={10}
                  y={sky === "storm" || sky === "downpour" ? 22 : 36}
                  scale={1.6}
                  className={cloud}
                />
              </g>
            </>
          )}
        </>
      ) : null}
    </svg>
  );
}
