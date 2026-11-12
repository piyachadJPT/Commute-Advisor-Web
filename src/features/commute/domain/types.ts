// Domain types (plan §7). Pure: no imports from next, react, @supabase/* or browser APIs.

export type Vehicle = "car" | "motorcycle" | "unknown";
export type RainRiskLevel = "veryLow" | "low" | "high" | "veryHigh" | "unknown";
export type CommuteType = "departure" | "return";
export type LocationKey = "home" | "work";
export type DataFreshness = "fresh" | "stale" | "none";

// Branded types keep instants and local calendar values apart.
export type LocalDate = string & { readonly __brand: "LocalDate" }; // yyyy-MM-dd
export type LocalTime = string & { readonly __brand: "LocalTime" }; // HH:mm
export type Instant = Date; // always UTC-based

/** One hourly forecast row. `time` is the bucket label: the row covers (time - 1h, time]. */
export type HourlyWeather = {
  time: Instant;
  location: LocationKey;
  temperature: number | null;
  humidity: number | null;
  precipitationProbability: number | null;
  precipitation: number | null;
  rain: number | null;
  showers: number | null;
  weatherCode: number | null;
  windSpeed: number | null;
  /** "Feels like" temperature, °C, instant (plan §23.3). */
  apparentTemperature: number | null;
  /** UV index, mean of the preceding hour. */
  uvIndex: number | null;
  /** Maximum gust at 10 m over the preceding hour, km/h. */
  windGusts: number | null;
  /** Visibility in metres, instant. */
  visibility: number | null;
  /** Daylight at the label time, instant. */
  isDay: boolean | null;
};

export type CommuteWindow = {
  type: CommuteType;
  start: Instant;
  end: Instant;
  localStart: LocalTime;
  localEnd: LocalTime;
  /** Bucket labels (instants) whose hour overlaps the window, plan §5.1. */
  bucketTimes: Instant[];
};

export type MissingBucket = { location: LocationKey; time: Instant };

export type TripAnalysis = {
  window: CommuteWindow;
  /**
   * Highest rain probability across the window's buckets at both locations. Null whenever the
   * trip is incomplete: a partial maximum would look like an answer, so none is given.
   * Invariant: `isComplete` is true exactly when `risk` is not null.
   */
  risk: number | null;
  /** Location that produced `risk`. A tie goes to home. Null when `risk` is null. */
  riskSource: LocationKey | null;
  /** Larger of the two locations' precipitation sums; null if either sum is unknown. */
  rainMm: number | null;
  riskLevel: RainRiskLevel;
  isComplete: boolean;
  missingBuckets: MissingBucket[];
};

/** The slice of user settings the engine needs. Times are local to `timeZone`. */
export type CommuteSettings = {
  departureTime: LocalTime;
  returnTime: LocalTime;
  durationMinutes: number;
  threshold: number;
  /** Bitmask: Mon=1, Tue=2, Wed=4 ... Sun=64. */
  commuteDays: number;
  timeZone: string;
};

/**
 * Why the engine decided what it did: a code plus params, stored as `reason_code` and
 * `reason_params` and rendered in the current locale (plan §6.3). The shapes match what the
 * dashboard messages (`dashboard.reason.*`) interpolate.
 */
export type Reason =
  | {
      code: "departureHigh" | "returnHigh";
      params: {
        risk: number;
        source: LocationKey;
        window: string; // "18:00–19:00"
        threshold: number;
        /** Set only when the other trip has no complete data. */
        otherIncomplete?: true;
      };
    }
  | { code: "bothLow"; params: { threshold: number; max: number } }
  | {
      code: "incomplete";
      params: {
        trip: CommuteType;
        source: LocationKey;
        hours: string; // missing bucket labels at `source`, "09:00, 10:00"
        threshold: number;
      };
    };

export type AdvisoryCode =
  | "heat"
  | "cold"
  | "uv"
  | "gust"
  | "lowVisibility"
  | "thunderstorm"
  | "heavyRain"
  | "wetRoad"
  | "rainNearWindow"
  | "darkReturn";
export type AdvisoryLevel = "caution" | "warning";

/**
 * A note about what to prepare for one trip (plan §23). Never changes the vehicle. Stored as
 * jsonb in `daily_recommendations.advisories` and rendered in the current locale.
 */
export type Advisory = {
  code: AdvisoryCode;
  level: AdvisoryLevel;
  trip: CommuteType;
  /** Location that produced the worst value; a tie goes to home. */
  source: LocationKey;
  params: Record<string, number | string>;
};

/** Result of analysing one commute day (plan §5.9), before any lock state is applied. */
export type ComputedRecommendation = {
  date: LocalDate;
  vehicle: Vehicle;
  departure: TripAnalysis;
  returnTrip: TripAnalysis;
  reason: Reason;
  /** Older of the two locations' fetch times; null if either was never fetched. */
  forecastFetchedAt: Instant | null;
  freshness: DataFreshness;
  dataComplete: boolean;
  /** Supporting notes for both trips, most important first (plan §23.2). */
  advisories: Advisory[];
};
