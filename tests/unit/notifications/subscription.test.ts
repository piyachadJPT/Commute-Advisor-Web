import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { deviceLabel } from "@/features/notifications/domain/device";
import {
  notificationTimeSchema,
  subscriptionSchema,
} from "@/features/notifications/schemas";

vi.mock("@/features/notifications/data/pushSubscriptionRepo", () => ({
  deleteSubscriptions: vi.fn(),
  recordSuccess: vi.fn(),
  recordFailure: vi.fn(),
}));
import * as repo from "@/features/notifications/data/pushSubscriptionRepo";
import { deliverToUser } from "@/features/notifications/deliver";

describe("deviceLabel", () => {
  it.each([
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
      "iPhone · Safari",
    ],
    [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      "Mac · Chrome",
    ],
    [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 Edg/126.0",
      "Windows · Edge",
    ],
    [
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36",
      "Android · Chrome",
    ],
    [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:127.0) Gecko/20100101 Firefox/127.0",
      "Mac · Firefox",
    ],
  ])("names %s", (ua, label) => expect(deviceLabel(ua)).toBe(label));
  it("falls back when there is nothing to go on", () => {
    expect(deviceLabel(null)).toBe("Unknown device");
    expect(deviceLabel("curl/8")).toBe("Unknown device");
  });
});

describe("subscriptionSchema", () => {
  const ok = {
    endpoint: "https://fcm.googleapis.com/fcm/send/abc",
    keys: { p256dh: "B".repeat(87), auth: "a".repeat(22) },
  };
  it("accepts a real-looking subscription", () => {
    expect(subscriptionSchema.safeParse(ok).success).toBe(true);
  });
  it.each([
    [
      "an endpoint outside the push services",
      { ...ok, endpoint: "https://evil.example/x" },
    ],
    ["an internal endpoint", { ...ok, endpoint: "https://169.254.169.254/x" }],
    ["plain http", { ...ok, endpoint: "http://fcm.googleapis.com/x" }],
    ["missing keys", { endpoint: ok.endpoint }],
    ["a too-short key", { ...ok, keys: { p256dh: "x", auth: ok.keys.auth } }],
    [
      "an over-long endpoint",
      { ...ok, endpoint: `https://fcm.googleapis.com/${"a".repeat(2100)}` },
    ],
    ["not an object", "nope"],
  ])("rejects %s", (_n, input) =>
    expect(subscriptionSchema.safeParse(input).success).toBe(false),
  );
  it("ignores extra fields the browser adds, such as expirationTime", () => {
    expect(
      subscriptionSchema.parse({ ...ok, expirationTime: null }),
    ).not.toHaveProperty("expirationTime");
  });
});

describe("notificationTimeSchema", () => {
  it.each(["06:30", "00:00", "23:59"])("accepts %s", (v) =>
    expect(notificationTimeSchema.safeParse(v).success).toBe(true),
  );
  it.each(["6:30", "24:00", "06:60", "06:30:00", "", "abc"])(
    "rejects %s",
    (v) => expect(notificationTimeSchema.safeParse(v).success).toBe(false),
  );
});

describe("deliverToUser", () => {
  const supabase = {} as SupabaseClient<Database>;
  const sub = (id: number) => ({
    id,
    endpoint: `https://fcm.googleapis.com/fcm/send/${id}`,
    p256dh: "k",
    auth: "a",
    userAgent: null,
    failureCount: id,
    createdAt: "",
    lastSuccessAt: null,
  });
  const payload = { title: "t", body: "b", url: "/" as const };
  const now = new Date("2026-11-11T00:00:00Z");

  it("deletes expired, marks delivered, counts failures", async () => {
    vi.resetAllMocks();
    const send = vi.fn(async (s: { endpoint: string }) => {
      if (s.endpoint.endsWith("/2"))
        throw Object.assign(new Error("gone"), { statusCode: 404 });
      if (s.endpoint.endsWith("/3"))
        throw Object.assign(new Error("busy"), { statusCode: 500 });
    });
    const out = await deliverToUser(
      supabase,
      [sub(1), sub(2), sub(3)],
      payload,
      send,
      now,
    );
    expect(out).toMatchObject({
      sent: [1],
      gone: [2],
      failed: [{ id: 3, failureCount: 3, status: 500 }],
    });
    expect(repo.deleteSubscriptions).toHaveBeenCalledWith(supabase, [2]);
    expect(repo.recordSuccess).toHaveBeenCalledWith(supabase, [1], now);
    expect(repo.recordFailure).toHaveBeenCalledWith(supabase, 3, 3);
  });

  it("removes a subscription whose endpoint is not an allowed host, without sending to it", async () => {
    vi.resetAllMocks();
    const send = vi.fn();
    const bad = { ...sub(9), endpoint: "https://169.254.169.254/latest" };
    const out = await deliverToUser(supabase, [bad], payload, send, now);
    expect(send).not.toHaveBeenCalled();
    expect(out.gone).toEqual([9]);
  });

  it("a bookkeeping error does not turn a delivered message into a failure", async () => {
    vi.resetAllMocks();
    vi.mocked(repo.recordSuccess).mockRejectedValue(new Error("db"));
    const out = await deliverToUser(
      supabase,
      [sub(1)],
      payload,
      vi.fn().mockResolvedValue({}),
      now,
    );
    expect(out.sent).toEqual([1]);
  });
});
