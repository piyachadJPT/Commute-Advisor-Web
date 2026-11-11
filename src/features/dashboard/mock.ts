// Static data for the Dashboard mockup (plan §18, Phase 1).
// Replaced by real recommendation and forecast data in Phase 5. Values follow the plan's examples.
import type {
  LocationKey,
  RainRiskLevel,
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
};

export type ReasonView =
  | {
      code: "departureHigh" | "returnHigh";
      risk: number;
      source: LocationKey;
      window: string;
    }
  | { code: "bothLow"; threshold: number; max: number }
  | {
      code: "incomplete";
      trip: "departure" | "return";
      source: LocationKey;
      hours: string;
    };

/** Probability per hour-bucket label, starting at FIRST_HOUR (05:00). */
export type HourlySeries = Array<number | null>;
export const FIRST_HOUR = 5;

export type NowView = {
  location: LocationKey;
  placeName: string;
  temperature: number;
  weatherCode: number;
  rainProbability: number | null;
  humidity: number;
  windSpeed: number;
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
  vehicle: Vehicle | null;
  maxRisk: number | null;
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
  fetchedAt: Date;
  stale: boolean;
  hourly: { home: HourlySeries; work: HourlySeries };
  now: [NowView, NowView];
  nextDays: NextDayView[];
  week: WeekDayView[];
};

export type MockState = "car" | "motorcycle" | "unknown";

const day = (d: number, hh = "00:00") =>
  new Date(`2026-11-${String(d).padStart(2, "0")}T${hh}:00+07:00`);

const TARGET = day(11); // Wed 11 Nov 2026 (2569)

const HOURLY: Record<MockState, { home: HourlySeries; work: HourlySeries }> = {
  car: {
    home: [
      5, 5, 10, 15, 25, 30, 25, 20, 20, 20, 30, 35, 40, 45, 50, 45, 35, 25,
    ],
    work: [5, 5, 5, 10, 20, 25, 25, 20, 20, 25, 35, 40, 50, 55, 70, 65, 45, 30],
  },
  motorcycle: {
    home: [0, 0, 5, 5, 10, 10, 5, 5, 10, 10, 15, 20, 20, 25, 30, 25, 15, 10],
    work: [0, 0, 5, 5, 5, 10, 5, 5, 10, 10, 15, 20, 25, 30, 35, 25, 15, 10],
  },
  unknown: {
    home: [
      5, 10, 15, 15, 15, 20, 15, 10, 10, 15, 15, 20, 20, 20, 15, 10, 10, 5,
    ],
    work: [
      5,
      10,
      15,
      null,
      null,
      20,
      15,
      10,
      10,
      15,
      15,
      20,
      20,
      20,
      15,
      10,
      10,
      5,
    ],
  },
};

const PLACES = {
  th: { home: "ลาดพร้าว", work: "สีลม" },
  en: { home: "Lat Phrao", work: "Silom" },
} as const;

export function getMockDashboard(
  state: MockState,
  stale: boolean,
  locale: "th" | "en",
): DashboardView {
  const names = PLACES[locale];
  const base = {
    targetDate: TARGET,
    isToday: true,
    route: names,
    threshold: 50,
    fetchedAt: stale ? day(10, "21:10") : day(11, "06:12"),
    stale,
    hourly: HOURLY[state],
    nextDays: [
      {
        date: day(12),
        vehicle: "motorcycle" as const,
        departureRisk: 15,
        returnRisk: 30,
      },
      {
        date: day(13),
        vehicle: "car" as const,
        departureRisk: 20,
        returnRisk: 65,
      },
      { date: day(16), vehicle: null, departureRisk: null, returnRisk: null },
    ],
    week: [
      {
        date: day(9),
        kind: "past" as const,
        vehicle: "car" as const,
        maxRisk: 60,
      },
      {
        date: day(10),
        kind: "past" as const,
        vehicle: "motorcycle" as const,
        maxRisk: 25,
      },
      { date: day(11), kind: "today" as const, vehicle: null, maxRisk: null },
      {
        date: day(12),
        kind: "future" as const,
        vehicle: "motorcycle" as const,
        maxRisk: 30,
      },
      {
        date: day(13),
        kind: "future" as const,
        vehicle: "car" as const,
        maxRisk: 65,
      },
    ],
  };

  if (state === "motorcycle") {
    return {
      ...base,
      vehicle: "motorcycle",
      reason: { code: "bothLow", threshold: 50, max: 35 },
      departure: trip("departure", 10, "veryLow", "home", 0),
      returnTrip: trip("return", 35, "low", "work", 0.6),
      now: [
        now("home", names.home, 27, 1, 10, 74, 6),
        now("work", names.work, 29, 2, 10, 70, 9),
      ],
      week: withToday(base.week, "motorcycle", 35),
    };
  }

  if (state === "unknown") {
    return {
      ...base,
      vehicle: "unknown",
      reason: {
        code: "incomplete",
        trip: "departure",
        source: "work",
        hours: "09:00, 10:00",
      },
      departure: {
        ...trip("departure", null, "unknown", null, null),
        missingHours: ["09:00", "10:00"],
      },
      returnTrip: trip("return", 20, "low", "home", 0.2),
      now: [
        now("home", names.home, 26, 45, 15, 88, 4),
        now("work", names.work, 27, 3, null, 84, 6),
      ],
      week: withToday(base.week, "unknown", null),
    };
  }

  return {
    ...base,
    vehicle: "car",
    reason: {
      code: "returnHigh",
      risk: 70,
      source: "work",
      window: "18:00–19:00",
    },
    departure: trip("departure", 30, "low", "home", 0.4),
    returnTrip: trip("return", 70, "veryHigh", "work", 3.2),
    now: [
      now("home", names.home, 27, 3, 20, 82, 8),
      now("work", names.work, 28, 61, 25, 78, 11),
    ],
    week: withToday(base.week, "car", 70),
  };
}

function withToday(
  week: WeekDayView[],
  vehicle: Vehicle,
  maxRisk: number | null,
): WeekDayView[] {
  return week.map((d) => (d.kind === "today" ? { ...d, vehicle, maxRisk } : d));
}

function now(
  location: LocationKey,
  placeName: string,
  temperature: number,
  weatherCode: number,
  rainProbability: number | null,
  humidity: number,
  windSpeed: number,
): NowView {
  return {
    location,
    placeName,
    temperature,
    weatherCode,
    rainProbability,
    humidity,
    windSpeed,
  };
}

function trip(
  type: TripView["type"],
  risk: number | null,
  riskLevel: RainRiskLevel,
  riskSource: LocationKey | null,
  rainMm: number | null,
): TripView {
  return {
    type,
    window: type === "departure" ? "08:20–09:20" : "18:00–19:00",
    risk,
    riskLevel,
    riskSource,
    rainMm,
    missingHours: [],
  };
}
