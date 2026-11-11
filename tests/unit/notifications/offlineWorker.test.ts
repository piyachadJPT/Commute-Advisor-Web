import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

/**
 * Runs public/sw.js against a fake scope with in-memory caches and a scriptable network, to pin
 * the offline rules: personal pages always come from the network, a failed page load falls back
 * to the cached offline page, only the fallback page and build files are ever stored, and none
 * of it happens unless the worker was registered with ?cache=1.
 */
type Listener = (e: Record<string, unknown>) => void;

function makeCaches() {
  const stores = new Map<string, Map<string, Response>>();
  const key = (r: string | Request) =>
    new URL(typeof r === "string" ? r : r.url, "https://app.example").pathname;
  const open = async (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name)!;
    return {
      put: async (r: string | Request, res: Response) =>
        void store.set(key(r), res),
      match: async (r: string | Request) => store.get(key(r))?.clone(),
    };
  };
  return {
    stores,
    open,
    keys: async () => [...stores.keys()],
    delete: async (n: string) => stores.delete(n),
    match: async (r: string | Request, o?: { cacheName?: string }) => {
      for (const [name, store] of stores) {
        if (o?.cacheName && o.cacheName !== name) continue;
        const hit = store.get(key(r));
        if (hit) return hit.clone();
      }
      return undefined;
    },
  };
}

function load(href = "https://app.example/sw.js?cache=1") {
  const listeners: Record<string, Listener> = {};
  const caches = makeCaches();
  const network = vi.fn<(r: string | Request) => Promise<Response>>();
  const self = {
    location: { href, origin: "https://app.example" },
    addEventListener: (t: string, fn: Listener) => (listeners[t] = fn),
    skipWaiting: vi.fn(),
    clients: {
      claim: vi.fn().mockResolvedValue(undefined),
      matchAll: vi.fn(),
      openWindow: vi.fn(),
    },
    registration: { showNotification: vi.fn() },
  };
  new Function("self", "caches", "fetch", readFileSync("public/sw.js", "utf8"))(
    self,
    caches,
    network,
  );

  const tasks: Promise<unknown>[] = [];
  const event = (extra: Record<string, unknown>) => ({
    ...extra,
    waitUntil: (p: Promise<unknown>) => void tasks.push(p),
    respondWith: (p: Promise<Response>) => void (extra.__response = p),
  });
  async function fetchEvent(
    url: string,
    init: { method?: string; mode?: string } = {},
  ) {
    const request = {
      url,
      method: init.method ?? "GET",
      mode: init.mode ?? "cors",
    };
    const holder: Record<string, unknown> = { request };
    const e = event(holder);
    listeners.fetch?.(e);
    const response = holder.__response
      ? await (holder.__response as Promise<Response>)
      : null;
    await Promise.all(tasks);
    return { handled: holder.__response !== undefined, response };
  }
  async function lifecycle(type: "install" | "activate") {
    listeners[type]?.(event({}));
    await Promise.all(tasks);
  }
  return { caches, network, fetchEvent, lifecycle, listeners, self };
}

const html = (body = "") =>
  new Response(
    `<html><script src="/_next/static/chunks/app.abc123.js"></script><link href="/_next/static/chunks/app.def456.css">${body}</html>`,
    { status: 200 },
  );

describe("service worker offline mode", () => {
  it("does nothing for fetches unless registered with ?cache=1", async () => {
    const sw = load("https://app.example/sw.js");
    const r = await sw.fetchEvent("https://app.example/", { mode: "navigate" });
    expect(r.handled).toBe(false);
    await sw.lifecycle("install");
    expect(sw.network).not.toHaveBeenCalled();
  });

  it("install stores the offline page and the build files it names", async () => {
    const sw = load();
    sw.network.mockImplementation(async (u) => {
      const url = String(u);
      return url.endsWith("/offline")
        ? html()
        : new Response("file", { status: 200 });
    });
    await sw.lifecycle("install");
    expect(
      await sw.caches.match("/offline", { cacheName: "commute-shell-v1" }),
    ).toBeDefined();
    expect(
      await sw.caches.match("/_next/static/chunks/app.abc123.js", {
        cacheName: "commute-static-v1",
      }),
    ).toBeDefined();
    expect(
      await sw.caches.match("/_next/static/chunks/app.def456.css", {
        cacheName: "commute-static-v1",
      }),
    ).toBeDefined();
    expect(
      await sw.caches.match("/icons/icon-192.png", {
        cacheName: "commute-static-v1",
      }),
    ).toBeDefined();
  });

  it("does not store a sign-in redirect as the offline page", async () => {
    const sw = load();
    const redirected = html();
    Object.defineProperty(redirected, "redirected", { value: true });
    sw.network.mockResolvedValue(redirected);
    await sw.lifecycle("install");
    expect(await sw.caches.match("/offline")).toBeUndefined();
  });

  it("a page load goes to the network and is NOT cached (pages are personal)", async () => {
    const sw = load();
    sw.network.mockImplementation(
      async () => new Response("personal dashboard", { status: 200 }),
    );
    const r = await sw.fetchEvent("https://app.example/", { mode: "navigate" });
    expect(await r.response!.text()).toBe("personal dashboard");
    expect(await sw.caches.match("/")).toBeUndefined();
  });

  it("falls back to the cached offline page when the network is down", async () => {
    const sw = load();
    sw.network.mockImplementation(async (u) =>
      String(u).endsWith("/offline") ? html("OFFLINE PAGE") : new Response("x"),
    );
    await sw.lifecycle("install");
    sw.network.mockRejectedValue(new TypeError("Failed to fetch"));
    const r = await sw.fetchEvent("https://app.example/weather", {
      mode: "navigate",
    });
    expect(await r.response!.text()).toContain("OFFLINE PAGE");
  });

  it("answers 503 text if the offline page was never cached", async () => {
    const sw = load();
    sw.network.mockRejectedValue(new TypeError("Failed to fetch"));
    const r = await sw.fetchEvent("https://app.example/", { mode: "navigate" });
    expect(r.response!.status).toBe(503);
  });

  it("serves build files from the cache first, and stores them on first use", async () => {
    const sw = load();
    sw.network.mockImplementation(
      async () => new Response("js", { status: 200 }),
    );
    const url = "https://app.example/_next/static/chunks/x.1.js";
    await sw.fetchEvent(url);
    expect(sw.network).toHaveBeenCalledTimes(1);
    sw.network.mockRejectedValue(new TypeError("offline"));
    const again = await sw.fetchEvent(url);
    expect(await again.response!.text()).toBe("js");
  });

  it("leaves everything else alone: data, API calls, other methods and other origins", async () => {
    const sw = load();
    for (const [url, init] of [
      ["https://app.example/api/geocode?q=ab", {}],
      ["https://app.example/weather?_rsc=1", {}],
      ["https://app.example/settings", { method: "POST" }],
      ["https://cdn.example/_next/static/x.js", {}],
    ] as const) {
      expect((await sw.fetchEvent(url, init)).handled).toBe(false);
    }
  });

  it("activation removes caches from older versions", async () => {
    const sw = load();
    await sw.caches.open("commute-shell-v0");
    await sw.caches.open("commute-shell-v1");
    await sw.lifecycle("activate");
    expect(await sw.caches.keys()).toEqual(["commute-shell-v1"]);
    expect(sw.self.clients.claim).toHaveBeenCalled();
  });
});
