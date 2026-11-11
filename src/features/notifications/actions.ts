"use server";

import { getLocale } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import {
  deleteByEndpoint,
  deleteById,
  listSubscriptions,
  saveSubscription,
} from "@/features/notifications/data/pushSubscriptionRepo";
import { deliverToUser } from "@/features/notifications/deliver";
import { createWebPushSender } from "@/features/notifications/webPushSender";
import {
  setNotificationsEnabled,
  updateNotificationTime,
} from "@/features/settings/data/settingsRepo";
import type { SettingsFormState } from "@/features/settings/state";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { notificationTimeSchema, subscriptionSchema } from "./schemas";

export type PushActionResult =
  { ok: true } | { ok: false; error: "invalid" | "failed" };

/** `notifications_enabled` follows whether any device is still subscribed (plan §6.1). */
async function syncEnabledFlag(userId: string) {
  const supabase = await createClient();
  const remaining = await listSubscriptions(supabase, userId);
  await setNotificationsEnabled(supabase, userId, remaining.length > 0);
  revalidatePath("/settings");
}

/**
 * Stores this device's push subscription (plan §13.3). The user comes from the session, never
 * from the client, and the endpoint must be a known push service: the server later sends
 * requests to it.
 */
export async function subscribePush(input: unknown): Promise<PushActionResult> {
  const user = await requireUser();
  const parsed = subscriptionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  try {
    const ua = (await headers()).get("user-agent");
    await saveSubscription(await createClient(), user.id, parsed.data, ua);
    await syncEnabledFlag(user.id);
    return { ok: true };
  } catch {
    return { ok: false, error: "failed" };
  }
}

/** Turning the toggle off removes this device's subscription. */
export async function unsubscribePush(
  endpoint: string,
): Promise<PushActionResult> {
  const user = await requireUser();
  if (typeof endpoint !== "string" || endpoint.length > 2048)
    return { ok: false, error: "invalid" };
  try {
    await deleteByEndpoint(await createClient(), user.id, endpoint);
    await syncEnabledFlag(user.id);
    return { ok: true };
  } catch {
    return { ok: false, error: "failed" };
  }
}

/** Removes another device from the list (plan §13.3). */
export async function removeDevice(id: number): Promise<PushActionResult> {
  const user = await requireUser();
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "invalid" };
  try {
    await deleteById(await createClient(), user.id, id);
    await syncEnabledFlag(user.id);
    return { ok: true };
  } catch {
    return { ok: false, error: "failed" };
  }
}

export async function saveNotificationTime(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const user = await requireUser();
  const parsed = notificationTimeSchema.safeParse(
    formData.get("notificationTime"),
  );
  if (!parsed.success) return { status: "invalid" };
  try {
    await updateNotificationTime(await createClient(), user.id, parsed.data);
  } catch {
    return { status: "failed" };
  }
  revalidatePath("/settings");
  return { status: "saved" };
}

export type TestResult =
  | { ok: true; sent: number }
  | { ok: false; error: "not_configured" | "no_device" | "failed" };

/**
 * Sends a test message to every device right away, so push can be checked without waiting for
 * the morning tick (plan §16.4). It only ever sends to the signed-in user's own devices.
 */
export async function sendTestNotification(): Promise<TestResult> {
  const user = await requireUser();
  const send = createWebPushSender();
  if (!send) return { ok: false, error: "not_configured" };

  try {
    const supabase = await createClient();
    const subs = await listSubscriptions(supabase, user.id);
    if (subs.length === 0) return { ok: false, error: "no_device" };
    const th = (await getLocale()) !== "en";
    const outcome = await deliverToUser(
      supabase,
      subs,
      {
        title: "Commute Advisor",
        body: th
          ? "ทดสอบการแจ้งเตือน: อุปกรณ์นี้รับข้อความตอนเช้าได้"
          : "Test notification: this device can receive the morning message",
        url: "/",
      },
      send,
      new Date(),
    );
    revalidatePath("/settings");
    return outcome.sent.length > 0
      ? { ok: true, sent: outcome.sent.length }
      : { ok: false, error: "failed" };
  } catch {
    return { ok: false, error: "failed" };
  }
}
