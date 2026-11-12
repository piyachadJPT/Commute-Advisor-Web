import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  anonClient,
  createTestUser,
  daysAgo,
  deleteTestUser,
  PG,
  type TestUser,
} from "./helpers";

const admin = () => adminClient();

describe("notification claim (§6.6, §13.1)", () => {
  let user: TestUser;
  beforeAll(async () => {
    user = await createTestUser();
  });
  afterAll(async () => {
    await deleteTestUser(user);
  });

  it("produces exactly one row when many ticks claim the same day at once", async () => {
    const claim = () =>
      admin()
        .from("notification_logs")
        .upsert(
          {
            user_id: user.id,
            target_date: "2026-11-11",
            kind: "recommendation",
            status: "sending",
          },
          { onConflict: "user_id,target_date", ignoreDuplicates: true },
        )
        .select("id");

    const results = await Promise.all(Array.from({ length: 25 }, claim));
    for (const r of results) expect(r.error).toBeNull();

    // `ignoreDuplicates` returns only rows this call inserted: exactly one caller may send.
    const winners = results.filter((r) => (r.data?.length ?? 0) === 1);
    expect(winners).toHaveLength(1);

    const rows = await admin()
      .from("notification_logs")
      .select("id")
      .eq("user_id", user.id);
    expect(rows.data).toHaveLength(1);
  });

  it("allows a different day for the same user", async () => {
    const { error } = await admin().from("notification_logs").insert({
      user_id: user.id,
      target_date: "2026-11-12",
      kind: "generic",
      status: "sent",
    });
    expect(error).toBeNull();
  });

  it("rejects invalid kind and status values", async () => {
    const bad = [
      { kind: "email", status: "sent" },
      { kind: "generic", status: "queued" },
    ];
    for (const [i, extra] of bad.entries()) {
      const { error } = await admin()
        .from("notification_logs")
        .insert({
          user_id: user.id,
          target_date: `2026-12-0${i + 1}`,
          ...extra,
        });
      expect(error?.code).toBe(PG.checkViolation);
    }
  });
});

describe("push_subscriptions endpoint (§6.5)", () => {
  let a: TestUser;
  let b: TestUser;
  beforeAll(async () => {
    a = await createTestUser();
    b = await createTestUser();
  });
  afterAll(async () => {
    await deleteTestUser(a);
    await deleteTestUser(b);
  });

  const sub = (user_id: string, endpoint: string) => ({
    user_id,
    endpoint,
    p256dh: "k",
    auth: "s",
  });

  it("only accepts https endpoints, so the sender can never be pointed at http or file URLs", async () => {
    for (const endpoint of [
      "http://push.example.test/x",
      "file:///etc/passwd",
      "ftp://x/y",
      "javascript:1",
    ]) {
      const { error } = await a.client
        .from("push_subscriptions")
        .insert(sub(a.id, endpoint));
      expect(error?.code, endpoint).toBe(PG.checkViolation);
    }
    const ok = await a.client
      .from("push_subscriptions")
      .insert(sub(a.id, `https://push.example.test/${randomUUID()}`));
    expect(ok.error).toBeNull();
  });

  it("rejects an oversized endpoint", async () => {
    const { error } = await a.client
      .from("push_subscriptions")
      .insert(sub(a.id, `https://push.example.test/${"x".repeat(2100)}`));
    expect(error?.code).toBe(PG.checkViolation);
  });

  it("keeps endpoints unique, and a user can re-subscribe the same device with an upsert", async () => {
    const endpoint = `https://push.example.test/${randomUUID()}`;
    expect(
      (await a.client.from("push_subscriptions").insert(sub(a.id, endpoint)))
        .error,
    ).toBeNull();

    const again = await a.client
      .from("push_subscriptions")
      .upsert(
        { ...sub(a.id, endpoint), p256dh: "new-key" },
        { onConflict: "endpoint" },
      )
      .select("p256dh");
    expect(again.error).toBeNull();
    expect(again.data?.[0]?.p256dh).toBe("new-key");

    // Another user cannot take over A's endpoint.
    const takeover = await b.client
      .from("push_subscriptions")
      .upsert(
        { ...sub(b.id, endpoint), p256dh: "evil" },
        { onConflict: "endpoint" },
      )
      .select("p256dh");
    expect(takeover.error).not.toBeNull();
    const stored = await admin()
      .from("push_subscriptions")
      .select("p256dh,user_id")
      .eq("endpoint", endpoint)
      .single();
    expect(stored.data).toEqual({ p256dh: "new-key", user_id: a.id });
  });
});

describe("retention (§6.9)", () => {
  let user: TestUser;
  const ids = { oldRows: [] as number[] };
  beforeAll(async () => {
    user = await createTestUser();
  });
  afterAll(async () => {
    await admin().from("job_runs").delete().in("id", ids.oldRows);
    await deleteTestUser(user);
  });

  it("deletes data older than 14 days from the right tables and keeps the rest", async () => {
    const uid = user.id;
    const hf = (n: number, fetched: string) => ({
      user_id: uid,
      location_key: "home",
      latitude: 13.7,
      longitude: 100.5,
      forecast_time: `2026-11-${String(10 + n).padStart(2, "0")}T00:00:00Z`,
      fetched_at: fetched,
    });
    const aq = (n: number, fetched: string) => ({
      ...hf(n, fetched),
      pm2_5: 20,
    });
    // `hf` carries no pm columns; `aq` is the same key shape for the air-quality table.
    const sl = (fetched: string) => ({
      user_id: uid,
      location_key: "home",
      trigger: "scheduled",
      status: "success",
      fetched_at: fetched,
    });
    const nl = (n: number, created: string) => ({
      user_id: uid,
      target_date: `2026-11-${String(10 + n).padStart(2, "0")}`,
      kind: "generic",
      status: "sent",
      created_at: created,
    });

    await admin()
      .from("hourly_forecasts")
      .insert([hf(1, daysAgo(15)), hf(2, daysAgo(13))]);
    await admin()
      .from("hourly_air_quality")
      .insert([aq(1, daysAgo(15)), aq(2, daysAgo(13))]);
    await admin()
      .from("forecast_sync_logs")
      .insert([sl(daysAgo(15)), sl(daysAgo(13))]);
    await admin()
      .from("notification_logs")
      .insert([nl(1, daysAgo(15)), nl(2, daysAgo(13))]);
    const jr = await admin()
      .from("job_runs")
      .insert([
        { job: "tick", status: "ok", started_at: daysAgo(15) },
        { job: "tick", status: "ok", started_at: daysAgo(13) },
      ])
      .select("id");
    ids.oldRows = (jr.data ?? []).map((r) => r.id);

    // Kept forever, however old.
    await admin()
      .from("daily_recommendations")
      .insert({
        user_id: uid,
        recommendation_date: "2025-01-02",
        vehicle: "car",
        reason_code: "returnHigh",
        data_complete: true,
        created_at: daysAgo(400),
      });
    await admin()
      .from("skipped_days")
      .insert({ user_id: uid, date: "2025-01-03", created_at: daysAgo(400) });

    const run = await admin().rpc("run_retention");
    expect(run.error).toBeNull();
    expect(run.data).toMatchObject({
      hourly_forecasts: expect.any(Number),
      hourly_air_quality: expect.any(Number),
      forecast_sync_logs: expect.any(Number),
      notification_logs: expect.any(Number),
      job_runs: expect.any(Number),
    });

    const left = async (
      table:
        | "hourly_forecasts"
        | "hourly_air_quality"
        | "forecast_sync_logs"
        | "notification_logs",
    ) =>
      (
        await admin()
          .from(table)
          .select("id", { count: "exact", head: true })
          .eq("user_id", uid)
      ).count;
    expect(await left("hourly_forecasts")).toBe(1);
    expect(await left("hourly_air_quality")).toBe(1);
    expect(await left("forecast_sync_logs")).toBe(1);
    expect(await left("notification_logs")).toBe(1);

    const runs = await admin()
      .from("job_runs")
      .select("id")
      .in("id", ids.oldRows);
    expect(runs.data).toHaveLength(1);

    const recs = await admin()
      .from("daily_recommendations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", uid);
    const skips = await admin()
      .from("skipped_days")
      .select("id", { count: "exact", head: true })
      .eq("user_id", uid);
    expect(recs.count).toBe(1);
    expect(skips.count).toBe(1);
  });

  it("cannot be triggered by app users or anon", async () => {
    expect((await user.client.rpc("run_retention")).error?.code).toBe(
      PG.insufficientPrivilege,
    );
    expect((await anonClient().rpc("run_retention")).error?.code).toBe(
      PG.insufficientPrivilege,
    );
  });
});

describe("account deletion (§6.0, §14.6)", () => {
  it("removes every row the user owns", async () => {
    const user = await createTestUser();
    const uid = user.id;
    await user.client.rpc("update_location", {
      p_key: "home",
      p_latitude: 13.756,
      p_longitude: 100.502,
    });

    const inserts = await Promise.all([
      admin()
        .from("hourly_forecasts")
        .insert({
          user_id: uid,
          location_key: "home",
          latitude: 13.756,
          longitude: 100.502,
          forecast_time: "2026-11-11T00:00:00Z",
          fetched_at: daysAgo(0),
        }),
      admin()
        .from("daily_recommendations")
        .insert({
          user_id: uid,
          recommendation_date: "2026-11-11",
          vehicle: "car",
          reason_code: "x",
          data_complete: true,
          locked_at: daysAgo(0),
        }),
      admin().from("skipped_days").insert({ user_id: uid, date: "2026-11-12" }),
      admin()
        .from("push_subscriptions")
        .insert({
          user_id: uid,
          endpoint: `https://push.example.test/${randomUUID()}`,
          p256dh: "k",
          auth: "s",
        }),
      admin().from("notification_logs").insert({
        user_id: uid,
        target_date: "2026-11-11",
        kind: "generic",
        status: "sent",
      }),
      admin().from("forecast_sync_logs").insert({
        user_id: uid,
        location_key: "home",
        trigger: "manual",
        status: "success",
      }),
    ]);
    for (const r of inserts) expect(r.error).toBeNull();

    const gone = await admin().auth.admin.deleteUser(uid);
    expect(gone.error).toBeNull();

    for (const table of [
      "settings",
      "hourly_forecasts",
      "daily_recommendations",
      "skipped_days",
      "push_subscriptions",
      "notification_logs",
      "forecast_sync_logs",
    ] as const) {
      const { count, error } = await admin()
        .from(table)
        .select("id:user_id", { count: "exact", head: true })
        .eq("user_id", uid);
      expect(error, table).toBeNull();
      expect(count, table).toBe(0);
    }
  });
});
