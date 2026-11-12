import type { SupabaseClient } from "@supabase/supabase-js";
import {
  resolveRecommendation,
  type StoredRecommendation,
} from "@/features/commute/domain/locking";
import { computeRecommendation } from "@/features/commute/domain/recommend";
import { targetDate } from "@/features/commute/domain/schedule";
import {
  addDays,
  localDateOf,
  weekdayOf,
  zonedToInstant,
} from "@/features/commute/domain/tz";
import type {
  CommuteSettings,
  ComputedRecommendation,
  HourlyAirQuality,
  HourlyWeather,
  Instant,
  LocalDate,
  LocalTime,
} from "@/features/commute/domain/types";
import { getHourlyAirQuality } from "@/features/forecast/data/airQualityRepo";
import { getHourlyForecasts } from "@/features/forecast/data/forecastRepo";
import {
  latestFetch,
  toHourlyAirQuality,
  toHourlyWeather,
} from "@/features/forecast/data/mapping";
import {
  getUserSettings,
  toCommuteSettings,
  type UserSettings,
} from "@/features/settings/data/settingsRepo";
import type { Database } from "@/lib/database.types";
import {
  getRecommendations,
  persistRecommendation,
} from "./data/recommendationRepo";
import { listSkippedDays } from "./data/skipDayRepo";

export type Analysis =
  /** Both locations must be set before there is anything to analyse. */
  | { kind: "needs-locations" }
  /** No commute day is selected, or every one in the next two weeks is skipped. */
  | { kind: "no-commute-days" }
  | {
      kind: "ready";
      userSettings: UserSettings;
      settings: CommuteSettings;
      today: LocalDate;
      target: LocalDate;
      skipped: Set<string>;
      home: HourlyWeather[];
      work: HourlyWeather[];
      homeFetchedAt: Instant | null;
      workFetchedAt: Instant | null;
      /** Air quality as stored; callers judge freshness (plan §23.5). */
      homeAir: HourlyAirQuality[];
      workAir: HourlyAirQuality[];
      homeAirFetchedAt: Instant | null;
      workAirFetchedAt: Instant | null;
      computed: ComputedRecommendation;
      stored: Map<string, StoredRecommendation>;
      /** This call set the target day's lock (plan §5.7). */
      lockedNow: boolean;
    };

/**
 * Analyses the next relevant commute day for one user, persists the result and locks the day
 * once its departure window has started (plan §5.6, §5.7). Shared by the Dashboard (user-scoped
 * client, RLS applies) and the scheduler tick (service-role client). Idempotent.
 */
export async function analyzeUser(input: {
  supabase: SupabaseClient<Database>;
  userId: string;
  now: Date;
  /** Pass settings already read to save a query. */
  userSettings?: UserSettings;
}): Promise<Analysis> {
  const { supabase, userId, now } = input;

  const s = input.userSettings ?? (await getUserSettings(supabase, userId));
  if (!s) throw new Error("No settings row for the user");
  if (!s.home.isSet || !s.work.isSet) return { kind: "needs-locations" };

  const settings = toCommuteSettings(s);
  const tz = settings.timeZone;
  const today = localDateOf(now, tz);
  const weekStart = addDays(today, -(weekdayOf(today) - 1));

  const skipped = await listSkippedDays(
    supabase,
    userId,
    weekStart,
    addDays(today, 30),
  );
  const target = targetDate({ now, settings, skipped });
  if (target === null) return { kind: "no-commute-days" };

  const midnight = "00:00" as LocalTime;
  const from = zonedToInstant(today, midnight, tz);
  const to = zonedToInstant(addDays(today, 5), midnight, tz);
  const lastDate =
    target > addDays(weekStart, 6) ? target : addDays(weekStart, 6);

  // Air quality is optional: if it cannot be read, the recommendation is unaffected (§23.1).
  const airRows = (location: "home" | "work") =>
    getHourlyAirQuality(supabase, userId, location, from, to).catch(() => []);
  const [homeRows, workRows, stored, homeAirRows, workAirRows] =
    await Promise.all([
      getHourlyForecasts(supabase, userId, "home", from, to),
      getHourlyForecasts(supabase, userId, "work", from, to),
      getRecommendations(supabase, userId, weekStart, lastDate),
      airRows("home"),
      airRows("work"),
    ]);
  const home = homeRows.map(toHourlyWeather);
  const work = workRows.map(toHourlyWeather);
  const homeFetchedAt = latestFetch(homeRows);
  const workFetchedAt = latestFetch(workRows);
  const homeAir = homeAirRows.map(toHourlyAirQuality);
  const workAir = workAirRows.map(toHourlyAirQuality);
  const homeAirFetchedAt = latestFetch(homeAirRows);
  const workAirFetchedAt = latestFetch(workAirRows);

  const computed = computeRecommendation({
    date: target,
    settings,
    home,
    work,
    homeFetchedAt,
    workFetchedAt,
    homeAir,
    workAir,
    homeAirFetchedAt,
    workAirFetchedAt,
    now,
  });

  // Persist; a failure (e.g. another request locked the day first) must not break the caller.
  let lockedNow = false;
  try {
    const existing = stored.get(target) ?? null;
    const write = resolveRecommendation({
      computed,
      existing,
      now,
      departureStart: zonedToInstant(target, settings.departureTime, tz),
    });
    if (
      write.action === "update_latest" &&
      existing?.returnRiskLatest === write.returnRiskLatest
    ) {
      // nothing changed
    } else {
      await persistRecommendation(supabase, userId, target, write, now);
      lockedNow =
        write.action === "write" &&
        write.lockedAt !== null &&
        !existing?.lockedAt;
    }
  } catch {
    // Use the computed result anyway.
  }

  return {
    kind: "ready",
    userSettings: s,
    settings,
    today,
    target,
    skipped,
    home,
    work,
    homeFetchedAt,
    workFetchedAt,
    homeAir,
    workAir,
    homeAirFetchedAt,
    workAirFetchedAt,
    computed,
    stored,
    lockedNow,
  };
}
