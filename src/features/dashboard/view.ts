// View model the Dashboard UI renders (plan §11.2). Built from real data by
// `domain/buildView.ts`. Types only: no logic here.
import type {
  Advisory,
  LocationKey,
  RainRiskLevel,
  Reason,
  Vehicle,
} from "@/features/commute/domain/types";

export type TripView = {
  type: "departure" | "return";
  window: string; // "08:20–09:20"
  risk: number | null;
  riskLevel: RainRiskLevel;
  riskSource: LocationKey | null;
  rainMm: number | null;
  missingHours: string[];
  /** Supporting notes for this trip, most important first (plan §23). Never change the verdict. */
  advisories: Advisory[];
};

/** Same shape the engine stores (`reason_code` + `reason_params`). */
export type ReasonView = Reason;

/** Probability per hour-bucket label, starting at FIRST_HOUR (05:00). */
export type HourlySeries = Array<number | null>;
export const FIRST_HOUR = 5;
export const HOURLY_COUNT = 18; // labels 05:00 ... 22:00

export type NowView = {
  location: LocationKey;
  placeName: string;
  temperature: number | null;
  weatherCode: number | null;
  rainProbability: number | null;
  humidity: number | null;
  windSpeed: number | null;
  /** "Feels like", °C, rounded. */
  apparentTemperature: number | null;
  uvIndex: number | null;
  /** PM2.5 in µg/m³, rounded; a model estimate (plan §23.5). */
  pm25: number | null;
};

export type NextDayView = {
  date: Date;
  vehicle: Vehicle | null; // null = beyond the 3-day forecast horizon
  departureRisk: number | null;
  returnRisk: number | null;
};

export type WeekDayView = {
  date: Date;
  kind: "past" | "today" | "future";
  vehicle: Vehicle | null; // null = not decided yet
  maxRisk: number | null;
};

export type WindowView = {
  startHour: number; // local, fractional: 8:20 is 8.333
  endHour: number;
  /** Local hour of each bucket label the window uses (§5.1). */
  buckets: number[];
};

export type DashboardView = {
  targetDate: Date;
  isToday: boolean;
  route: { home: string; work: string };
  vehicle: Vehicle;
  reason: ReasonView;
  departure: TripView;
  returnTrip: TripView;
  threshold: number;
  /** Older of the two locations' fetch times; null if either was never fetched. */
  fetchedAt: Date | null;
  stale: boolean;
  windows: { departure: WindowView; return: WindowView };
  hourly: { home: HourlySeries; work: HourlySeries };
  now: [NowView, NowView];
  nextDays: NextDayView[];
  week: WeekDayView[];
  /** Today is a commute day that was skipped; the rest of the screen shows the next day. */
  skippedToday: boolean;
  /** The target is today, so "skip today" applies. */
  canSkip: boolean;
  /** Live return risk when a locked motorcycle day has reached the threshold (§5.7). */
  returnWarning: number | null;
};
