/*
 * Commute Advisor service worker (plan §13.3). Hand-written, no build step.
 * Part B: Web Push. Offline caching is added in a later part.
 *
 * Rules that matter:
 *  - The push handler ALWAYS shows a notification. iOS revokes the push subscription of a web app
 *    that receives a push and shows nothing, so even a malformed or empty push shows something.
 *  - The click handler only ever opens a path on this app's own origin.
 */

const ICON = "/icons/icon-192.png";
const FALLBACK_TITLE = "Commute Advisor";
const FALLBACK_BODY = "เปิดแอปเพื่อดูคำแนะนำการเดินทางวันนี้";

self.addEventListener("install", () => {
  // A new version takes over without waiting for every tab to close.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let title = FALLBACK_TITLE;
  let body = FALLBACK_BODY;
  let url = "/";

  try {
    const data = event.data ? event.data.json() : null;
    if (data && typeof data.title === "string" && data.title)
      title = data.title.slice(0, 100);
    if (data && typeof data.body === "string" && data.body)
      body = data.body.slice(0, 300);
    if (
      data &&
      typeof data.url === "string" &&
      data.url.startsWith("/") &&
      !data.url.startsWith("//")
    ) {
      url = data.url;
    }
  } catch {
    // Keep the fallback text: a push must still be shown.
  }

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: ICON,
      badge: ICON,
      // One morning message at a time: a new one replaces the old.
      tag: "commute-morning",
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = (event.notification.data && event.notification.data.url) || "/";
  const target = new URL(path, self.location.origin);
  if (target.origin !== self.location.origin) return; // never leave the app

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of windows) {
        if (
          new URL(client.url).origin === self.location.origin &&
          "focus" in client
        ) {
          await client.focus();
          if ("navigate" in client)
            await client.navigate(target.href).catch(() => undefined);
          return;
        }
      }
      await self.clients.openWindow(target.href);
    })(),
  );
});
