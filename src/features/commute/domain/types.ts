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
