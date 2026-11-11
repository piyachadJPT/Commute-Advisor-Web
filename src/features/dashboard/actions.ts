"use server";

import { revalidatePath } from "next/cache";
import { localDateOf } from "@/features/commute/domain/tz";
import { syncUserForecasts } from "@/features/forecast/forecastSyncService";
import {
  skipDay,
  unskipDay,
} from "@/features/recommendations/data/skipDayRepo";
import { getUserSettings } from "@/features/settings/data/settingsRepo";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

/**
 * Manual refresh (plan §4.6, §9). The 15-minute rule lives in the sync service, so tapping
 * repeatedly cannot hammer Open-Meteo. A failed fetch keeps the cached forecast and is logged.
 */
export async function refreshForecast(): Promise<void> {
  const user = await requireUser();
  await syncUserForecasts(
    { supabase: await createClient() },
    { userId: user.id, trigger: "manual", now: new Date() },
  );
  revalidatePath("/", "layout");
}

/** Today's local date comes from the server, never from the client. */
async function todayFor(userId: string) {
  const supabase = await createClient();
  const settings = await getUserSettings(supabase, userId);
  return {
    supabase,
    today: localDateOf(new Date(), settings?.timeZone ?? "Asia/Bangkok"),
  };
}

export async function skipToday(): Promise<void> {
  const user = await requireUser();
  const { supabase, today } = await todayFor(user.id);
  await skipDay(supabase, user.id, today);
  revalidatePath("/", "layout");
}

export async function unskipToday(): Promise<void> {
  const user = await requireUser();
  const { supabase, today } = await todayFor(user.id);
  await unskipDay(supabase, user.id, today);
  revalidatePath("/", "layout");
}
