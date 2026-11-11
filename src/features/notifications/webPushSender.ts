import "server-only";
import webpush from "web-push";
import { pushEnv } from "@/lib/env.server";
import type { SendFn } from "./sendPush";

/**
 * The real sender, signed with the VAPID keys (plan §13.3). Null when push is not configured,
 * so the tick can skip notifications without failing. TTL is 2 hours and urgency high: a
 * morning message that cannot be delivered in time is dropped rather than arriving at noon.
 */
export function createWebPushSender(): SendFn | null {
  const env = pushEnv();
  if (!env) return null;
  webpush.setVapidDetails(
    env.VAPID_SUBJECT,
    env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    env.VAPID_PRIVATE_KEY,
  );
  return (sub, body) =>
    webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      body,
      { TTL: 2 * 60 * 60, urgency: "high" },
    );
}
