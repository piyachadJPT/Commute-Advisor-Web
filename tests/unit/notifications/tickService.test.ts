import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { bkk, compute, DATE } from "../commute/helpers";

vi.mock("@/features/settings/data/settingsRepo", () => ({
  getUserSettings: vi.fn(),
  listActiveUserIds: vi.fn(),
}));
vi.mock("@/features/forecast/forecastSyncService", () => ({
  syncUserForecasts: vi.fn(),
}));
vi.mock("@/features/recommendations/recommendationService", () => ({
  analyzeUser: vi.fn(),
}));
vi.mock("@/features/notifications/data/notificationLogRepo", () => ({
  claimDay: vi.fn(),
  finishLog: vi.fn(),
}));
vi.mock("@/features/notifications/data/pushSubscriptionRepo", () => ({
  listSubscriptions: vi.fn(),
  deleteSubscriptions: vi.fn(),
  recordSuccess: vi.fn(),
  recordFailure: vi.fn(),
}));

import { syncUserForecasts } from "@/features/forecast/forecastSyncService";
import {
  claimDay,
  finishLog,
} from "@/features/notifications/data/notificationLogRepo";
import * as subs from "@/features/notifications/data/pushSubscriptionRepo";
import { analyzeUser } from "@/features/recommendations/recommendationService";
import {
  getUserSettings,
  listActiveUserIds,
} from "@/features/settings/data/settingsRepo";
import { runTick } from "@/features/jobs/tickService";

const supabase = {} as SupabaseClient<Database>;
const low = { "09:00": 10, "10:00": 10, "19:00": 10 };
const sub = (
  id: number,
  endpoint = `https://fcm.googleapis.com/fcm/send/${id}`,
) => ({
  id,
  endpoint,
  p256dh: "k",
  auth: "a",
  userAgent: null,
  failureCount: 0,
  createdAt: "",
  lastSuccessAt: null,
});
const settings = (over = {}) => ({
  timeZone: "Asia/Bangkok",
  notificationTime: "06:30",
  notificationsEnabled: true,
  commuteDays: 31,
  locale: null,
  ...over,
});

function arrange(opts: {
  now: Date;
  settings?: object;
  skipped?: string[];
  target?: string;
  lockedNow?: boolean;
}) {
  vi.mocked(listActiveUserIds).mockResolvedValue(["u1"]);
  vi.mocked(getUserSettings).mockResolvedValue(
    settings(opts.settings) as never,
  );
  vi.mocked(syncUserForecasts).mockResolvedValue([
    { key: "home", status: "success", records: 72 },
    { key: "work", status: "success", records: 72 },
  ]);
  vi.mocked(analyzeUser).mockResolvedValue({
    kind: "ready",
    target: opts.target ?? DATE,
    skipped: new Set(opts.skipped ?? []),
    computed: compute(
      { home: low, work: { ...low, "19:00": 70 } },
      {},
      opts.now,
    ),
    lockedNow: opts.lockedNow ?? false,
  } as never);
  vi.mocked(subs.listSubscriptions).mockResolvedValue([sub(1), sub(2)]);
  vi.mocked(claimDay).mockResolvedValue(true);
}

beforeEach(() => vi.resetAllMocks());

describe("runTick", () => {
  it("sends one notification in the window, to every device, and logs it", async () => {
    const now = bkk(DATE, "06:35");
    arrange({ now });
    const send = vi.fn().mockResolvedValue({});
    const s = await runTick({ supabase, now, send });
    expect(send).toHaveBeenCalledTimes(2);
    expect(JSON.parse(send.mock.calls[0]![1])).toMatchObject({
      body: "แนะนำรถยนต์ · ขากลับเสี่ยงฝน 70%",
    });
    expect(claimDay).toHaveBeenCalledWith(supabase, {
      userId: "u1",
      targetDate: DATE,
      kind: "recommendation",
    });
    expect(finishLog).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({ status: "sent", devicesSent: 2 }),
    );
    expect(s).toMatchObject({
      users: 1,
      refreshed: 2,
      notificationsSent: 1,
      devicesSent: 2,
      errors: [],
    });
  });

  it("does not send again when the day was already claimed by another tick", async () => {
    const now = bkk(DATE, "06:35");
    arrange({ now });
    vi.mocked(claimDay).mockResolvedValue(false);
    const send = vi.fn();
    const s = await runTick({ supabase, now, send });
    expect(send).not.toHaveBeenCalled();
    expect(s.notificationsSent).toBe(0);
  });

  it.each([
    ["before the window", "06:29", {}],
    ["after the window", "06:50", {}],
    ["on a skipped day", "06:35", { skipped: [DATE], target: "2026-11-12" }],
    [
      "with notifications off",
      "06:35",
      { settings: { notificationsEnabled: false } },
    ],
    ["when the target is not today", "06:35", { target: "2026-11-12" }],
  ])("sends nothing %s", async (_n, time, over) => {
    const now = bkk(DATE, time);
    arrange({ now, ...over });
    const send = vi.fn();
    await runTick({ supabase, now, send });
    expect(send).not.toHaveBeenCalled();
    expect(claimDay).not.toHaveBeenCalled();
  });

  it("forces the refresh on the tick 30 minutes before, and only then", async () => {
    arrange({ now: bkk(DATE, "06:00") });
    await runTick({ supabase, now: bkk(DATE, "06:00"), send: vi.fn() });
    expect(syncUserForecasts).toHaveBeenLastCalledWith(
      { supabase },
      expect.objectContaining({ trigger: "pre_notification" }),
    );
    arrange({ now: bkk(DATE, "07:00") });
    await runTick({ supabase, now: bkk(DATE, "07:00"), send: vi.fn() });
    expect(syncUserForecasts).toHaveBeenLastCalledWith(
      { supabase },
      expect.objectContaining({ trigger: "scheduled" }),
    );
  });

  it("counts a lock made by this tick", async () => {
    const now = bkk(DATE, "08:30");
    arrange({ now, lockedNow: true });
    expect((await runTick({ supabase, now, send: vi.fn() })).locked).toBe(1);
  });

  it("reports push as not configured instead of claiming the day", async () => {
    const now = bkk(DATE, "06:35");
    arrange({ now });
    const s = await runTick({ supabase, now, send: null });
    expect(s.pushNotConfigured).toBe(1);
    expect(claimDay).not.toHaveBeenCalled();
  });

  it("does not claim the day when the user has no device", async () => {
    const now = bkk(DATE, "06:35");
    arrange({ now });
    vi.mocked(subs.listSubscriptions).mockResolvedValue([]);
    const s = await runTick({ supabase, now, send: vi.fn() });
    expect(s.noSubscription).toBe(1);
    expect(claimDay).not.toHaveBeenCalled();
  });

  it("removes expired subscriptions, counts other failures and keeps the accepted ones", async () => {
    const now = bkk(DATE, "06:35");
    arrange({ now });
    vi.mocked(subs.listSubscriptions).mockResolvedValue([
      sub(1),
      sub(2),
      sub(3),
    ]);
    const send = vi.fn(async (s: { endpoint: string }) => {
      if (s.endpoint.endsWith("/2"))
        throw Object.assign(new Error("gone"), { statusCode: 410 });
      if (s.endpoint.endsWith("/3"))
        throw Object.assign(new Error("busy"), { statusCode: 503 });
    });
    const s = await runTick({ supabase, now, send });
    expect(subs.deleteSubscriptions).toHaveBeenCalledWith(supabase, [2]);
    expect(subs.recordSuccess).toHaveBeenCalledWith(supabase, [1], now);
    expect(subs.recordFailure).toHaveBeenCalledWith(supabase, 3, 0);
    expect(s).toMatchObject({ notificationsSent: 1, devicesSent: 1 });
  });

  it("marks the day failed when no device accepted the message", async () => {
    const now = bkk(DATE, "06:35");
    arrange({ now });
    const send = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error("x"), { statusCode: 500 }));
    const s = await runTick({ supabase, now, send });
    expect(finishLog).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({ status: "failed", devicesSent: 0 }),
    );
    expect(s.notificationsSent).toBe(0);
  });

  it("an error for one user is recorded and the next user still runs", async () => {
    const now = bkk(DATE, "06:35");
    arrange({ now });
    vi.mocked(listActiveUserIds).mockResolvedValue(["u1", "u2"]);
    vi.mocked(syncUserForecasts).mockRejectedValueOnce(new Error("db down"));
    const send = vi.fn().mockResolvedValue({});
    const s = await runTick({ supabase, now, send });
    expect(s.errors).toEqual([{ userId: "u1", message: "db down" }]);
    expect(s.notificationsSent).toBe(1); // u2
  });
});
