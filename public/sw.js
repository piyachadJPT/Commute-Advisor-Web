/*
 * Commute Advisor service worker (plan §13.3). Hand-written, no build step.
 * Web Push (part B) and offline support (part C).
 *
 * Rules that matter:
 *  - The push handler ALWAYS shows a notification. iOS revokes the push subscription of a web app
 *    that receives a push and shows nothing, so even a malformed or empty push shows something.
 *  - The click handler only ever opens a path on this app's own origin.
 *  - Pages are personal and always come from the network. Nothing but the fallback page and
 *    immutable build files is cached, so cached data is never served as if it were current.
 *
 * Offline support is on only when the worker is registered as /sw.js?cache=1, which the app does
 * for production builds. In dev the build files are not hashed, and caching them would serve stale
 * code, so there the worker handles push only.
 */

const CACHING = new URL(self.location.href).searchParams.get("cache") === "1";
const SHELL_CACHE = "commute-shell-v1";
const STATIC_CACHE = "commute-static-v1";
const OFFLINE_URL = "/offline";
const SHELL_REFRESH_MS = 6 * 60 * 60 * 1000;
let lastShellRefresh = 0;

const ICON = "/icons/icon-192.png";
const FALLBACK_TITLE = "Commute Advisor";
const FALLBACK_BODY = "เปิดแอปเพื่อดูคำแนะนำการเดินทางวันนี้";

self.addEventListener("install", (event) => {
  // A new version takes over without waiting for every tab to close.
  self.skipWaiting();
  // Best effort: a failed precache (offline, signed-out redirect) must not block the install.
  if (CACHING) event.waitUntil(cacheShell().catch(() => undefined));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      if (CACHING) {
        // Drop caches from older versions of this worker.
        for (const name of await caches.keys()) {
          if (name !== SHELL_CACHE && name !== STATIC_CACHE) await caches.delete(name);
        }
      }
      await self.clients.claim();
    })(),
  );
});

/**
 * Stores the offline page and every build file it needs. The page is public and holds no user
 * data (it reads the saved Dashboard from IndexedDB in the browser). The build files are found in
 * its HTML, so the page still starts offline after a deploy changes their names.
 */
async function cacheShell() {
  const res = await fetch(OFFLINE_URL, { credentials: "same-origin", cache: "no-store" });
  // A redirect means a sign-in page answered: do not store that as the offline page.
  if (!res.ok || res.redirected) return;
  const shell = await caches.open(SHELL_CACHE);
  await shell.put(OFFLINE_URL, res.clone());

  const html = await res.text();
  const files = new Set(html.match(/\/_next\/static\/[^"'\\\s)<>]+/g) || []);
  files.add("/icons/icon-192.png");
  files.add("/icons/icon-512.png");
  const statics = await caches.open(STATIC_CACHE);
  await Promise.all(
    [...files].map(async (url) => {
      if (await statics.match(url)) return;
      try {
        const file = await fetch(url);
        if (file.ok) await statics.put(url, file);
      } catch {
        // One missing file should not stop the rest.
      }
    }),
  );
}

async function onNavigate(event) {
  try {
    const res = await fetch(event.request);
    // Online: keep the offline page fresh, at most every few hours.
    if (Date.now() - lastShellRefresh > SHELL_REFRESH_MS) {
      lastShellRefresh = Date.now();
      event.waitUntil(cacheShell().catch(() => undefined));
    }
    return res;
  } catch {
    const fallback = await caches.match(OFFLINE_URL, { cacheName: SHELL_CACHE });
    return (
      fallback ||
      new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } })
    );
  }
}

async function cacheFirst(request) {
  const hit = await caches.match(request, { cacheName: STATIC_CACHE });
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) {
    const cache = await caches.open(STATIC_CACHE);
    await cache.put(request, res.clone());
  }
  return res;
}

self.addEventListener("fetch", (event) => {
  if (!CACHING) return;
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(onNavigate(event));
  } else if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    // Hashed build files never change under the same name, so the cached copy is always right.
    event.respondWith(cacheFirst(request));
  }
  // Anything else (server data, API calls, images) goes to the network untouched.
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
