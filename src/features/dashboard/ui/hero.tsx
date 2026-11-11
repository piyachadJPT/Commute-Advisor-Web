import type { ReactNode } from "react";
import { Icon } from "@/components/icon";
import type { Vehicle } from "@/features/commute/domain/types";
import { VEHICLE_STYLE } from "./risk-style";
import type { Scene } from "./scene";
import { WeatherScene } from "./weather-scene";

type HeroProps = {
  vehicle: Vehicle;
  scene: Scene;
  chip: string;
  verdict: string;
  reason: ReactNode;
  dimmed: boolean;
  className?: string;
};

/** Verdict directly on the sky, no card (§11.2, §12.1). */
export function Hero({
  vehicle,
  scene,
  chip,
  verdict,
  reason,
  dimmed,
  className = "",
}: HeroProps) {
  return (
    <section
      aria-labelledby="verdict"
      className={`grid grid-cols-[1fr_auto] items-end gap-x-2 text-hero [grid-template-areas:'chip_scene'_'text_text'] lg:pt-4 lg:[grid-template-areas:'chip_scene'_'text_scene'] ${className}`}
    >
      <div className="[grid-area:chip]">
        <span className="inline-flex items-center gap-1.5 rounded-chip border border-glass-line bg-(--hero-chip-bg) py-1 pr-3 pl-2 text-caption font-semibold backdrop-blur-md">
          <Icon
            name={VEHICLE_STYLE[vehicle].icon}
            className="size-[1.125rem]"
          />
          {chip}
        </span>
      </div>
      <div className="min-w-0 [grid-area:text]">
        <h1
          id="verdict"
          className="mt-2 mb-1.5 text-display font-bold tracking-[-0.02em]"
        >
          {verdict}
        </h1>
        <p className="max-w-[34ch] text-title text-hero-2 [&_b]:font-semibold [&_b]:text-hero">
          {reason}
        </p>
      </div>
      <div className="-mr-[6px] [grid-area:scene]">
        <WeatherScene scene={scene} dimmed={dimmed} />
      </div>
    </section>
  );
}
