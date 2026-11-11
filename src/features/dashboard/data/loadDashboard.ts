import type { SupabaseClient } from "@supabase/supabase-js";
import { computeRecommendation } from "@/features/commute/domain/recommend";
import { resolveRecommendation } from "@/features/commute/domain/locking";
import { targetDate } from "@/features/commute/domain/schedule";
import {
  addDays,
  localDateOf,
  weekdayOf,
  zonedToInstant,
} from "@/features/commute/domain/tz";
import type { LocalTime } from "@/features/commute/domain/types";
import { latestFetch, toHourlyWeather } from "@/features/forecast/data/mapping";
import { getHourlyForecasts } from "@/features/forecast/data/forecastRepo";
import {
  getRecommendations,
  persistRecommendation,
} from "@/features/recommendations/data/recommendationRepo";
import { listSkippedDays } from "@/features/recommendations/data/skipDayRepo";
import {
  getUserSettings,
  toCommuteSettings,
} from "@/features/settings/data/settingsRepo";
import type { Database } from "@/lib/database.types";
import { buildDashboardView } from "../domain/buildView";
import type { DashboardView } from "../view";

export type DashboardData =
  /** Both locations must be set before there is anything to analyse. */
  | { kind: "needs-locations" }
  /** No commute day is selected, or every one in the next two weeks is skipped. */
  | { kind: "no-commute-days" }
  | { kind: "ready"; view: DashboardView };

/**
 * Loads everything the Dashboard needs and returns its view model (plan §9). Reads go through
 * the user-scoped client, so RLS applies. It also persists the target day's recommendation and
 * locks it once the departure window has started (§5.7: any server-side read after the start
 * locks the day lazily; the scheduler tick in Phase 6 does it too).
 */
export async function loadDashboard(input: {
  supabase: SupabaseClient<Database>;
  userId: string;
  now: Date;
  names: { home: string; work: string };
}): Promise<DashboardData> {
  const { supabase, userId, now } = input;

  const s = await getUserSettings(supabase, userId);
  if (!s) throw new Error("No settings row for the signed-in user");
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

  const [homeRows, workRows, stored] = await Promise.all([
    getHourlyForecasts(supabase, userId, "home", from, to),
    getHourlyForecasts(supabase, userId, "work", from, to),
    getRecommendations(supabase, userId, weekStart, lastDate),
  ]);
  const home = homeRows.map(toHourlyWeather);
  const work = workRows.map(toHourlyWeather);
  const homeFetchedAt = latestFetch(homeRows);
  const workFetchedAt = latestFetch(workRows);

  const computed = computeRecommendation({
    date: target,
    settings,
    home,
    work,
    homeFetchedAt,
    workFetchedAt,
    now,
  });

  // Persist; a failure (e.g. another request locked the day first) must not break the page.
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
    }
  } catch {
    // Show the computed result anyway.
  }

  return {
    kind: "ready",
    view: buildDashboardView({
      now,
      settings,
      names: {
        home: s.home.name ?? input.names.home,
        work: s.work.name ?? input.names.work,
      },
      home,
      work,
      homeFetchedAt,
      workFetchedAt,
      skipped,
      target,
      computed,
      stored,
    }),
  };
}
