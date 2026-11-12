import type { CSSProperties } from "react";
import { backdropOf, isBright, isHazy, isWet, unit, type Scene } from "./scene";

const BACKDROP_BG = {
  "day-clear": "bg-(image:--sky-day-clear)",
  "day-hot": "bg-(image:--sky-day-hot)",
  "dawn-clear": "bg-(image:--sky-dawn-clear)",
  "dusk-clear": "bg-(image:--sky-dusk-clear)",
  "day-grey": "bg-(image:--sky-day-grey)",
  "day-rain": "bg-(image:--sky-day-rain)",
  "day-storm": "bg-(image:--sky-day-storm)",
  "night-clear": "bg-(image:--sky-night-clear)",
  "night-grey": "bg-(image:--sky-night-grey)",
  "night-rain": "bg-(image:--sky-night-rain)",
  "night-storm": "bg-(image:--sky-night-storm)",
  "day-haze": "bg-(image:--sky-day-haze)",
  "day-smog": "bg-(image:--sky-day-smog)",
  "dawn-haze": "bg-(image:--sky-dawn-haze)",
  "dusk-haze": "bg-(image:--sky-dusk-haze)",
  "night-haze": "bg-(image:--sky-night-haze)",
} as const;

const DROPS = {
  drizzle: 16,
  sunshower: 22,
  rain: 34,
  storm: 56,
  downpour: 84,
} as const;
const STAR_COUNT = 36;
const PUFF_COUNT = 4;

type Vars = CSSProperties & Record<`--${string}`, string>;

function Drops({ count, heavy }: { count: number; heavy: boolean }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const t = (heavy ? 0.55 : 0.8) + unit(i, 1) * (heavy ? 0.35 : 0.6);
        const style: Vars = {
          "--x": `${Math.round(unit(i, 2) * 118 - 4)}%`,
          "--t": `${t.toFixed(2)}s`,
          "--d": `-${(unit(i, 3) * 3).toFixed(2)}s`,
          "--o": (0.25 + unit(i, 4) * 0.45).toFixed(2),
          "--len": `${Math.round(36 + unit(i, 5) * 54)}px`,
        };
        return <span key={i} className="fx-bg-drop" style={style} />;
      })}
    </>
  );
}

function Stars({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const style: Vars = {
          "--x": `${Math.round(unit(i, 11) * 100)}%`,
          "--y": `${Math.round(unit(i, 12) * 58)}%`,
          "--s": `${(1 + unit(i, 13) * 1.8).toFixed(1)}px`,
          "--t": `${(2.2 + unit(i, 14) * 3.2).toFixed(1)}s`,
          "--d": `-${(unit(i, 15) * 5).toFixed(1)}s`,
        };
        return <span key={i} className="fx-bg-star" style={style} />;
      })}
    </>
  );
}

function Puffs({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const style: Vars = {
          "--y": `${Math.round(4 + unit(i, 21) * 44)}%`,
          "--size": `${Math.round(38 + unit(i, 22) * 30)}vw`,
          "--t": `${Math.round(110 + unit(i, 23) * 70)}s`,
          "--d": `-${Math.round(unit(i, 24) * 150)}s`,
        };
        return <span key={i} className="fx-bg-puff" style={style} />;
      })}
    </>
  );
}

const MIST: Vars[] = [
  { "--y": "18%", "--t": "30s" },
  { "--y": "46%", "--t": "38s", "--d": "-12s" },
  { "--y": "70%", "--t": "34s", "--d": "-20s" },
];

/** Smog is the haze with two more drifting bands. */
const SMOG_MIST: Vars[] = [
  ...MIST,
  { "--y": "32%", "--t": "42s", "--d": "-8s" },
  { "--y": "58%", "--t": "36s", "--d": "-26s" },
];

/**
 * Full-screen sky that follows the real weather and the time of day (plan §12.1): a gradient
 * per scene, then slow drifting cloud, stars at night, a glow where the sun or moon sits, and
 * rain that falls across the screen. Pure CSS animation, so it needs no client code.
 */
export function Sky({ scene }: { scene: Scene }) {
  const { daypart, sky } = scene;
  const wet = isWet(sky);
  const bright = isBright(sky);
  const hazy = isHazy(sky);
  const twilight = daypart === "dawn" || daypart === "dusk";
  const palette = hazy
    ? // Haze keeps a dull glow (red low in the sky, orange city light at night), no stars.
      `fx-haze${sky === "smog" ? " fx-smog" : ""}${twilight ? " fx-low" : ""}${
        daypart === "night" ? " fx-haze-night" : ""
      }`
    : daypart === "night"
      ? `fx-night${wet ? "-wet" : ""}`
      : twilight && bright
        ? "fx-dusk fx-low"
        : `fx-day${wet ? "-wet" : ""}${sky === "hot" ? " fx-hot" : ""}`;
  const starry = daypart === "night" && bright;

  return (
    <div
      aria-hidden="true"
      className={`fixed inset-0 -z-10 overflow-hidden ${palette} ${BACKDROP_BG[backdropOf(scene)]}`}
    >
      {bright || hazy ? <div className="fx-bg-glow" /> : null}
      {starry ? <Stars count={sky === "clear" ? STAR_COUNT : 18} /> : null}
      {sky === "clear" || sky === "hot" ? null : (
        <Puffs count={wet || sky === "overcast" ? PUFF_COUNT : 2} />
      )}
      {sky === "fog" || hazy
        ? (sky === "smog" ? SMOG_MIST : MIST).map((style, i) => (
            <span key={i} className="fx-bg-mist" style={style} />
          ))
        : null}
      {starry && sky === "clear" ? <span className="fx-bg-shoot" /> : null}
      {wet ? (
        <Drops
          count={DROPS[sky as keyof typeof DROPS]}
          heavy={sky === "storm" || sky === "downpour"}
        />
      ) : null}
      {sky === "storm" ? <div className="fx-bg-flash" /> : null}
    </div>
  );
}
