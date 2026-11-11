import type { SupabaseClient } from "@supabase/supabase-js";
import { analyzeUser } from "@/features/recommendations/recommendationService";
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
 * the user-scoped client, so RLS applies. `analyzeUser` also persists the target day's
 * recommendation and locks it once the departure window has started (§5.7).
 */
export async function loadDashboard(input: {
  supabase: SupabaseClient<Database>;
  userId: string;
  now: Date;
  names: { home: string; work: string };
}): Promise<DashboardData> {
  const { supabase, userId, now } = input;
  const a = await analyzeUser({ supabase, userId, now });
  if (a.kind !== "ready") return { kind: a.kind };

  return {
    kind: "ready",
    view: buildDashboardView({
      now,
      settings: a.settings,
      names: {
        home: a.userSettings.home.name ?? input.names.home,
        work: a.userSettings.work.name ?? input.names.work,
      },
      home: a.home,
      work: a.work,
      homeFetchedAt: a.homeFetchedAt,
      workFetchedAt: a.workFetchedAt,
      skipped: a.skipped,
      target: a.target,
      computed: a.computed,
      stored: a.stored,
    }),
  };
}
