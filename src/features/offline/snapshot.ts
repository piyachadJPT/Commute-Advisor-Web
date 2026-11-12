import { del, get, set } from "idb-keyval";
import type { Locale } from "@/i18n/config";
import type { DashboardView } from "@/features/dashboard/view";

/**
 * The last Dashboard the device loaded, kept in IndexedDB for offline display (plan §9). It is
 * structured-cloned, so the `Date` fields survive. Versioned key: a future change to the view
 * model changes the key instead of breaking old snapshots.
 */
const KEY = "dashboard-snapshot-v2";

export type Snapshot = { view: DashboardView; savedAt: Date; locale: Locale };

export async function saveSnapshot(snapshot: Snapshot): Promise<void> {
  try {
    await set(KEY, snapshot);
  } catch {
    // Private windows and full disks refuse writes; the app works without a snapshot.
  }
}

/** Null when there is none, or when what is stored does not look like a snapshot. */
export async function loadSnapshot(): Promise<Snapshot | null> {
  try {
    return parseSnapshot(await get(KEY));
  } catch {
    return null;
  }
}

/** On sign-out: the snapshot holds place names and risks, so it must not outlive the session. */
export async function clearSnapshot(): Promise<void> {
  try {
    await del(KEY);
  } catch {
    // Nothing to clear.
  }
}

const hasAdvisories = (trip: unknown) =>
  typeof trip === "object" &&
  trip !== null &&
  Array.isArray((trip as Record<string, unknown>).advisories);

/** Guards against corrupt or foreign data in IndexedDB before it reaches the UI. */
export function parseSnapshot(value: unknown): Snapshot | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  const view = v.view as Record<string, unknown> | undefined;
  const ok =
    v.savedAt instanceof Date &&
    (v.locale === "th" || v.locale === "en") &&
    typeof view === "object" &&
    view !== null &&
    view.targetDate instanceof Date &&
    (view.vehicle === "car" ||
      view.vehicle === "motorcycle" ||
      view.vehicle === "unknown") &&
    typeof view.reason === "object" &&
    hasAdvisories(view.departure) &&
    hasAdvisories(view.returnTrip) &&
    Array.isArray(view.nextDays) &&
    Array.isArray(view.week) &&
    (view.fetchedAt === null || view.fetchedAt instanceof Date);
  return ok ? (value as Snapshot) : null;
}
