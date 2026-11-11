import type { SkyKind } from "./risk-style";

const CLOUD = "M30 62a22 22 0 0 1 2-44 30 30 0 0 1 57 6 20 20 0 0 1 3 38Z";

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

/** Hero weather scene: rain cloud (car), sun and cloud (motorcycle), mist (unknown). */
export function WeatherScene({
  kind,
  dimmed,
}: {
  kind: SkyKind;
  dimmed: boolean;
}) {
  return (
    <svg
      viewBox="0 0 200 170"
      aria-hidden="true"
      focusable="false"
      className={`h-auto w-[clamp(96px,26vw,232px)] drop-shadow-[0_12px_24px_rgb(0_0_0/0.15)] ${
        dimmed ? "opacity-60 saturate-50" : ""
      }`}
    >
      {kind === "car" ? (
        <>
          <Cloud x={70} y={10} scale={1.2} className="fill-scene-cloud-back" />
          <Cloud x={10} y={40} scale={1.6} className="fill-scene-cloud" />
          {[40, 70, 100, 130].map((x, i) => (
            <path
              key={x}
              d={`M${x} ${145 - (i % 2) * 8}l-8 18`}
              strokeWidth="5"
              strokeLinecap="round"
              className="stroke-scene-rain"
            />
          ))}
        </>
      ) : null}
      {kind === "moto" ? (
        <>
          <circle
            cx="125"
            cy="60"
            r="52"
            className="fill-scene-sun opacity-25"
          />
          <circle cx="125" cy="60" r="38" className="fill-scene-sun" />
          <Cloud x={20} y={62} scale={1.4} className="fill-scene-cloud" />
        </>
      ) : null}
      {kind === "mist" ? (
        <>
          <Cloud x={40} y={20} scale={1.5} className="fill-scene-cloud-back" />
          <rect
            x="20"
            y="130"
            width="160"
            height="6"
            rx="3"
            className="fill-scene-cloud-back"
          />
          <rect
            x="45"
            y="146"
            width="120"
            height="6"
            rx="3"
            className="fill-scene-cloud-back opacity-75"
          />
        </>
      ) : null}
    </svg>
  );
}
