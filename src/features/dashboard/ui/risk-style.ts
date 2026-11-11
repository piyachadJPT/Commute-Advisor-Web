import type { IconName } from "@/components/icon";
import type { RainRiskLevel, Vehicle } from "@/features/commute/domain/types";

// Every risk colour is paired with an icon and a text label (§11.10).
export const RISK_STYLE: Record<
  RainRiskLevel,
  { text: string; bg: string; svgFill: string; icon: IconName }
> = {
  veryLow: {
    text: "text-risk-very-low",
    bg: "bg-risk-very-low-fill",
    svgFill: "fill-risk-very-low-fill",
    icon: "partlyCloudyDay",
  },
  low: {
    text: "text-risk-low",
    bg: "bg-risk-low-fill",
    svgFill: "fill-risk-low-fill",
    icon: "rainyLight",
  },
  high: {
    text: "text-risk-high",
    bg: "bg-risk-high-fill",
    svgFill: "fill-risk-high-fill",
    icon: "rainy",
  },
  veryHigh: {
    text: "text-risk-very-high",
    bg: "bg-risk-very-high-fill",
    svgFill: "fill-risk-very-high-fill",
    icon: "rainyHeavy",
  },
  unknown: {
    text: "text-risk-unknown",
    bg: "bg-risk-unknown-fill",
    svgFill: "fill-risk-unknown-fill",
    icon: "questionMark",
  },
};

export const VEHICLE_STYLE: Record<
  Vehicle,
  { text: string; tint: string; icon: IconName }
> = {
  car: { text: "text-car", tint: "bg-car/15", icon: "directionsCar" },
  motorcycle: { text: "text-moto", tint: "bg-moto/15", icon: "twoWheeler" },
  unknown: {
    text: "text-risk-unknown",
    tint: "bg-risk-unknown/15",
    icon: "questionMark",
  },
};
