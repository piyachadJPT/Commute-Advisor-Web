import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { asLocalTime } from "@/features/commute/domain/tz";
import type {
  CommuteSettings,
  LocationKey,
} from "@/features/commute/domain/types";

type Client = SupabaseClient<Database>;

export type ConfiguredLocation = {
  key: LocationKey;
  latitude: number;
  longitude: number;
  name: string | null;
};

export type UserLocations = {
  timeZone: string;
  locations: ConfiguredLocation[]; // only locations with both coordinates set
};

/** The user's configured locations. A location missing either coordinate is left out. */
export async function getUserLocations(
  supabase: Client,
  userId: string,
): Promise<UserLocations | null> {
  const { data, error } = await supabase
    .from("settings")
    .select(
      "timezone, home_latitude, home_longitude, home_name, work_latitude, work_longitude, work_name",
    )
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`settings read failed: ${error.message}`);
  if (!data) return null;

  const locations: ConfiguredLocation[] = [];
  if (data.home_latitude !== null && data.home_longitude !== null) {
    locations.push({
      key: "home",
      latitude: data.home_latitude,
      longitude: data.home_longitude,
      name: data.home_name,
    });
  }
  if (data.work_latitude !== null && data.work_longitude !== null) {
    locations.push({
      key: "work",
      latitude: data.work_latitude,
      longitude: data.work_longitude,
      name: data.work_name,
    });
  }
  return { timeZone: data.timezone, locations };
}

/**
 * Wraps `update_location`: one transaction that rounds the coordinates to ~100 m, updates
 * settings and purges that location's forecasts. User-scoped client only: the function reads
 * `auth.uid()`. The caller refetches afterwards (plan §15, "Location changed").
 */
export async function updateLocation(
  supabase: Client,
  key: LocationKey,
  latitude: number,
  longitude: number,
  name: string | null,
): Promise<void> {
  const { error } = await supabase.rpc("update_location", {
    p_key: key,
    p_latitude: latitude,
    p_longitude: longitude,
    p_name: name ?? undefined,
  });
  if (error) throw new Error(`update_location failed: ${error.message}`);
}

export type UserSettings = {
  departureTime: string; // "HH:mm"
  returnTime: string;
  durationMinutes: number;
  threshold: number;
  commuteDays: number;
  timeZone: string;
  notificationTime: string; // "HH:mm"
  notificationsEnabled: boolean;
  /** null = follow the browser; the tick falls back to Thai. */
  locale: "th" | "en" | null;
  onboardingCompleted: boolean;
  home: { name: string | null; isSet: boolean };
  work: { name: string | null; isSet: boolean };
};

/** Everything the Settings screen shows. Null if the user has no settings row. */
export async function getUserSettings(
  supabase: Client,
  userId: string,
): Promise<UserSettings | null> {
  const { data, error } = await supabase
    .from("settings")
    .select(
      "departure_time, return_time, analysis_duration_minutes, rain_threshold, commute_days, timezone, notification_time, notifications_enabled, locale, onboarding_completed, home_latitude, home_name, work_latitude, work_name",
    )
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`settings read failed: ${error.message}`);
  if (!data) return null;
  return {
    departureTime: data.departure_time.slice(0, 5), // Postgres returns HH:mm:ss
    returnTime: data.return_time.slice(0, 5),
    durationMinutes: data.analysis_duration_minutes,
    threshold: data.rain_threshold,
    commuteDays: data.commute_days,
    timeZone: data.timezone,
    notificationTime: data.notification_time.slice(0, 5),
    notificationsEnabled: data.notifications_enabled,
    locale: data.locale === "th" || data.locale === "en" ? data.locale : null,
    onboardingCompleted: data.onboarding_completed,
    home: { name: data.home_name, isSet: data.home_latitude !== null },
    work: { name: data.work_name, isSet: data.work_latitude !== null },
  };
}

export type CommutePatch = {
  departureTime: string;
  returnTime: string;
  durationMinutes: number;
  threshold: number;
  commuteDays: number;
};

export async function updateCommuteSettings(
  supabase: Client,
  userId: string,
  patch: CommutePatch,
): Promise<void> {
  const { error } = await supabase
    .from("settings")
    .update({
      departure_time: patch.departureTime,
      return_time: patch.returnTime,
      analysis_duration_minutes: patch.durationMinutes,
      rain_threshold: patch.threshold,
      commute_days: patch.commuteDays,
    })
    .eq("user_id", userId);
  if (error) throw new Error(`settings update failed: ${error.message}`);
}

/** The slice of settings the engine needs, with branded local times. */
export function toCommuteSettings(s: UserSettings): CommuteSettings {
  return {
    departureTime: asLocalTime(s.departureTime),
    returnTime: asLocalTime(s.returnTime),
    durationMinutes: s.durationMinutes,
    threshold: s.threshold,
    commuteDays: s.commuteDays,
    timeZone: s.timeZone,
  };
}

export async function markOnboardingCompleted(
  supabase: Client,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from("settings")
    .update({ onboarding_completed: true })
    .eq("user_id", userId);
  if (error) throw new Error(`settings update failed: ${error.message}`);
}

/**
 * Users the scheduler processes: both locations set (onboarding or not, since the analysis
 * needs both). Service-role client only; it reads every user's settings row.
 */
export async function listActiveUserIds(supabase: Client): Promise<string[]> {
  const { data, error } = await supabase
    .from("settings")
    .select("user_id")
    .not("home_latitude", "is", null)
    .not("work_latitude", "is", null);
  if (error) throw new Error(`settings read failed: ${error.message}`);
  return data.map((r) => r.user_id);
}
