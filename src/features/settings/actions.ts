"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { syncUserForecasts } from "@/features/forecast/forecastSyncService";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { updateCommuteSettings, updateLocation } from "./data/settingsRepo";
import { commuteSchema, locationSchema } from "./schemas";
import type { SettingsFormState } from "./state";

const text = (v: FormDataEntryValue | null) => (typeof v === "string" ? v : "");

/** Saves commute times, days, duration and the rain threshold (plan §11.6). */
export async function saveCommuteSettings(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const user = await requireUser(); // never trust the proxy alone (plan §10.2)

  const parsed = commuteSchema.safeParse({
    departureTime: text(formData.get("departureTime")),
    returnTime: text(formData.get("returnTime")),
    durationMinutes: text(formData.get("durationMinutes")),
    threshold: text(formData.get("threshold")),
    commuteDays: formData.getAll("day").map((v) => Number(v)),
  });
  if (!parsed.success) return { status: "invalid" };

  try {
    await updateCommuteSettings(await createClient(), user.id, parsed.data);
  } catch {
    return { status: "failed" };
  }
  // Locked days are never recomputed (plan §5.7); the Dashboard analyses on read.
  revalidatePath("/", "layout");
  return { status: "saved" };
}

/**
 * Saves one location, then fetches its forecast right away so the Dashboard has data on the
 * next screen. `update_location` rounds the coordinates and purges the old forecasts in one
 * transaction (plan §6.2). A failed fetch does not fail the save: the sync is logged and the
 * scheduler retries.
 */
export async function saveLocation(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const user = await requireUser();

  const parsed = locationSchema.safeParse({
    key: text(formData.get("key")),
    latitude: text(formData.get("latitude")),
    longitude: text(formData.get("longitude")),
    name: text(formData.get("name")),
  });
  if (!parsed.success) return { status: "invalid" };

  const supabase = await createClient();
  const { key, latitude, longitude, name } = parsed.data;
  try {
    await updateLocation(supabase, key, latitude, longitude, name);
  } catch {
    return { status: "failed" };
  }
  try {
    await syncUserForecasts(
      { supabase },
      { userId: user.id, trigger: "manual", now: new Date() },
    );
  } catch {
    // Already logged by the sync service where possible; the save itself succeeded.
  }
  revalidatePath("/", "layout");
  redirect("/settings"); // outside any try/catch: redirect() throws
}
