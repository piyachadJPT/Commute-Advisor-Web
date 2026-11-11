import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

/**
 * Loads public/sw.js against a fake ServiceWorkerGlobalScope and fires its events. The two
 * rules under test are the ones that cost real users when broken: a push must ALWAYS show a
 * notification (iOS revokes the subscription otherwise), and a click must never leave the app.
 */
function load() {
  const listeners: Record<string, (e: unknown) => void> = {};
  const shown: Array<{ title: string; options: Record<string, unknown> }> = [];
  const opened: string[] = [];
  const windows: Array<{
    url: string;
    focus: () => Promise<void>;
    navigate: (u: string) => Promise<void>;
  }> = [];

  const self = {
    location: { origin: "https://app.example" },
    addEventListener: (type: string, fn: (e: unknown) => void) =>
      (listeners[type] = fn),
    skipWaiting: vi.fn(),
    clients: {
      claim: vi.fn().mockResolvedValue(undefined),
      matchAll: vi.fn(async () => windows),
      openWindow: vi.fn(async (u: string) => void opened.push(u)),
    },
    registration: {
      showNotification: vi.fn(
        async (title: string, options: Record<string, unknown>) =>
          void shown.push({ title, options }),
      ),
    },
  };
  new Function("self", readFileSync("public/sw.js", "utf8"))(self);

  async function fire(type: string, event: Record<string, unknown>) {
    let work: Promise<unknown> = Promise.resolve();
    listeners[type]?.({
      ...event,
      waitUntil: (p: Promise<unknown>) => (work = p),
    });
    await work;
  }
  return { fire, shown, opened, windows, self };
}

const push = (data: unknown) => ({
  data:
    data === undefined
      ? null
      : {
          json: () =>
            typeof data === "function" ? (data as () => never)() : data,
        },
});

describe("service worker: push", () => {
  it("shows the title and body it was sent, and opens the app root on click", async () => {
    const sw = load();
    await sw.fire(
      "push",
      push({
        title: "Commute Advisor",
        body: "แนะนำรถยนต์ · ขากลับเสี่ยงฝน 70%",
        url: "/",
      }),
    );
    expect(sw.shown).toHaveLength(1);
    expect(sw.shown[0]).toMatchObject({
      title: "Commute Advisor",
      options: {
        body: "แนะนำรถยนต์ · ขากลับเสี่ยงฝน 70%",
        tag: "commute-morning",
        data: { url: "/" },
      },
    });
  });

  it.each([
    ["no data at all", undefined],
    [
      "data that is not valid JSON",
      () => {
        throw new SyntaxError("bad");
      },
    ],
    ["an empty object", {}],
    ["wrong types", { title: 5, body: null, url: {} }],
  ])("still shows a notification for %s", async (_n, data) => {
    const sw = load();
    await sw.fire("push", push(data as never));
    expect(sw.shown).toHaveLength(1);
    expect(sw.shown[0]!.title.length).toBeGreaterThan(0);
    expect(String(sw.shown[0]!.options.body).length).toBeGreaterThan(0);
  });

  it("ignores a url that is not a path on this site", async () => {
    for (const url of [
      "https://evil.example/",
      "//evil.example",
      "javascript:alert(1)",
    ]) {
      const sw = load();
      await sw.fire("push", push({ title: "t", body: "b", url }));
      expect(sw.shown[0]!.options.data).toEqual({ url: "/" });
    }
  });
});

describe("service worker: click", () => {
  const click = (url: string) => ({
    notification: { close: vi.fn(), data: { url } },
  });

  it("opens the app when no window is open", async () => {
    const sw = load();
    await sw.fire("notificationclick", click("/"));
    expect(sw.opened).toEqual(["https://app.example/"]);
  });

  it("focuses an open window of the app instead of opening another", async () => {
    const sw = load();
    const win = {
      url: "https://app.example/weather",
      focus: vi.fn().mockResolvedValue(undefined),
      navigate: vi.fn().mockResolvedValue(undefined),
    };
    sw.windows.push(win);
    await sw.fire("notificationclick", click("/"));
    expect(win.focus).toHaveBeenCalled();
    expect(win.navigate).toHaveBeenCalledWith("https://app.example/");
    expect(sw.opened).toEqual([]);
  });

  it("never opens another origin", async () => {
    const sw = load();
    await sw.fire("notificationclick", click("https://evil.example/phish"));
    expect(sw.opened).toEqual([]);
  });

  it("closes the notification", async () => {
    const sw = load();
    const e = click("/");
    await sw.fire("notificationclick", e);
    expect(e.notification.close).toHaveBeenCalled();
  });
});
