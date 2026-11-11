import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  anonClient,
  createTestUser,
  deleteTestUser,
  PG,
  type TestUser,
} from "./helpers";

let a: TestUser;
let b: TestUser;
const admin = () => adminClient();

beforeAll(async () => {
  a = await createTestUser();
  b = await createTestUser();
});
afterAll(async () => {
  await deleteTestUser(a);
  await deleteTestUser(b);
});

const hour = (h: number, extra: Record<string, unknown> = {}) => ({
  forecast_time: `2026-11-11T${String(h).padStart(2, "0")}:00:00Z`,
  temperature: 28.5,
  humidity: 80,
  precipitation_probability: 40,
  precipitation: 0.2,
  rain: 0.2,
  showers: 0,
  weather_code: 3,
  wind_speed: 7.4,
  ...extra,
});

const log = (extra: Record<string, unknown> = {}) => ({
  trigger: "manual",
  status: "success",
  response_code: 200,
  ...extra,
});

async function counts(userId: string) {
  const forecasts = await admin()
    .from("hourly_forecasts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  const logs = await admin()
    .from("forecast_sync_logs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  return { forecasts: forecasts.count ?? 0, logs: logs.count ?? 0 };
}

async function batch(
  client: TestUser["client"],
  userId: string,
  key: "home" | "work",
  lat: number,
  lon: number,
  rows: unknown[],
  logBody: unknown = log(),
) {
  return client.rpc("save_forecast_batch", {
    p_user_id: userId,
    p_location_key: key,
    p_latitude: lat,
    p_longitude: lon,
    p_fetched_at: "2026-11-11T06:12:00Z",
    p_rows: rows as never,
    p_log: logBody as never,
  });
}

describe("settings defaults (§6.1)", () => {
  it("creates the default row for a new user", async () => {
    const { data, error } = await a.client
      .from("settings")
      .select("*")
      .eq("user_id", a.id)
      .single();
    expect(error).toBeNull();
    expect(data).toMatchObject({
      departure_time: "08:20:00",
      return_time: "18:00:00",
      analysis_duration_minutes: 60,
      rain_threshold: 50,
      notification_time: "06:30:00",
      notifications_enabled: false,
      commute_days: 31,
      timezone: "Asia/Bangkok",
      locale: null,
      onboarding_completed: false,
      home_latitude: null,
    });
  });

  it.each([
    ["rain_threshold below 10", { rain_threshold: 5 }],
    ["rain_threshold above 90", { rain_threshold: 95 }],
    ["duration below 15", { analysis_duration_minutes: 10 }],
    ["duration above 180", { analysis_duration_minutes: 181 }],
    ["commute_days above 127", { commute_days: 128 }],
    ["commute_days below 0", { commute_days: -1 }],
    ["unknown locale", { locale: "fr" }],
    ["other timezone", { timezone: "UTC" }],
    ["latitude without longitude", { home_latitude: 13.7 }],
    ["longitude without latitude", { work_longitude: 100.5 }],
    ["latitude out of range", { home_latitude: 91, home_longitude: 100 }],
  ])("rejects %s", async (_name, patch) => {
    const { error } = await a.client
      .from("settings")
      .update(patch)
      .eq("user_id", a.id);
    expect(error?.code).toBe(PG.checkViolation);
  });
});

describe("update_location (§6.2)", () => {
  it("rounds to ~100 m, stores the name, and purges only that location's forecasts", async () => {
    const home = await batch(a.client, a.id, "home", 13.7, 100.5, []);
    expect(home.error).toBeNull(); // empty rows: log only

    // Give A both locations, then forecasts for both.
    await a.client.rpc("update_location", {
      p_key: "home",
      p_latitude: 13.7,
      p_longitude: 100.5,
      p_name: "Old home",
    });
    await a.client.rpc("update_location", {
      p_key: "work",
      p_latitude: 13.72,
      p_longitude: 100.53,
      p_name: "Work",
    });
    expect(
      (await batch(a.client, a.id, "home", 13.7, 100.5, [hour(1), hour(2)]))
        .error,
    ).toBeNull();
    expect(
      (await batch(a.client, a.id, "work", 13.72, 100.53, [hour(1)])).error,
    ).toBeNull();

    const moved = await a.client.rpc("update_location", {
      p_key: "home",
      p_latitude: 13.756331,
      p_longitude: 100.501765,
      p_name: "  Lat Phrao  ",
    });
    expect(moved.error).toBeNull();

    const s = await a.client
      .from("settings")
      .select("*")
      .eq("user_id", a.id)
      .single();
    expect(s.data).toMatchObject({
      home_latitude: 13.756,
      home_longitude: 100.502,
      home_name: "Lat Phrao",
      work_latitude: 13.72, // untouched
      work_name: "Work",
    });

    const rest = await admin()
      .from("hourly_forecasts")
      .select("location_key")
      .eq("user_id", a.id);
    expect(rest.data).toEqual([{ location_key: "work" }]); // home purged, work kept
  });

  it("only ever changes the caller's own settings", async () => {
    await a.client.rpc("update_location", {
      p_key: "work",
      p_latitude: 1.5,
      p_longitude: 103.8,
      p_name: "SG",
    });
    const other = await b.client
      .from("settings")
      .select("work_latitude, home_latitude")
      .eq("user_id", b.id)
      .single();
    expect(other.data).toEqual({ work_latitude: null, home_latitude: null });
  });

  it.each([
    ["unknown key", { p_key: "office", p_latitude: 13, p_longitude: 100 }],
    [
      "latitude out of range",
      { p_key: "home", p_latitude: 95, p_longitude: 100 },
    ],
    [
      "longitude out of range",
      { p_key: "home", p_latitude: 13, p_longitude: 181 },
    ],
  ])("rejects %s", async (_name, args) => {
    const { error } = await a.client.rpc("update_location", args);
    expect(error?.code).toBe(PG.invalidParameter);
  });

  it("is not callable without a session", async () => {
    const { error } = await anonClient().rpc("update_location", {
      p_key: "home",
      p_latitude: 13,
      p_longitude: 100,
    });
    expect(error?.code).toBe(PG.insufficientPrivilege);
  });
});

describe("save_forecast_batch (§6.9)", () => {
  beforeAll(async () => {
    await b.client.rpc("update_location", {
      p_key: "home",
      p_latitude: 13.756,
      p_longitude: 100.502,
      p_name: "Home",
    });
  });

  it("saves the rows and the sync log together, and upserts on the same hour", async () => {
    const first = await batch(b.client, b.id, "home", 13.756, 100.502, [
      hour(3),
      hour(4),
    ]);
    expect(first.error).toBeNull();
    expect(first.data).toBe(2);
    expect(await counts(b.id)).toEqual({ forecasts: 2, logs: 1 });

    const again = await batch(b.client, b.id, "home", 13.756, 100.502, [
      hour(3, { precipitation_probability: 90 }),
      hour(4),
    ]);
    expect(again.error).toBeNull();
    expect(await counts(b.id)).toEqual({ forecasts: 2, logs: 2 }); // no duplicate rows

    const row = await admin()
      .from("hourly_forecasts")
      .select("precipitation_probability")
      .eq("user_id", b.id)
      .eq("forecast_time", "2026-11-11T03:00:00Z")
      .single();
    expect(row.data?.precipitation_probability).toBe(90);

    const lg = await admin()
      .from("forecast_sync_logs")
      .select("records_count, status, trigger")
      .eq("user_id", b.id)
      .limit(1)
      .single();
    expect(lg.data).toEqual({
      records_count: 2,
      status: "success",
      trigger: "manual",
    });
  });

  it("is atomic: one bad row leaves no rows and no log", async () => {
    const before = await counts(b.id);
    const { error } = await batch(b.client, b.id, "home", 13.756, 100.502, [
      hour(5),
      hour(6, { humidity: 150 }), // violates the 0..100 check
    ]);
    expect(error?.code).toBe(PG.checkViolation);
    expect(await counts(b.id)).toEqual(before);
  });

  it("rejects a batch that repeats an hour", async () => {
    const before = await counts(b.id);
    const { error } = await batch(b.client, b.id, "home", 13.756, 100.502, [
      hour(7),
      hour(7),
    ]);
    expect(error).not.toBeNull();
    expect(await counts(b.id)).toEqual(before);
  });

  it("rejects a batch without a trigger in its log, and writes nothing", async () => {
    const before = await counts(b.id);
    const { error } = await batch(
      b.client,
      b.id,
      "home",
      13.756,
      100.502,
      [hour(8)],
      { status: "success" },
    );
    expect(error).not.toBeNull();
    expect(await counts(b.id)).toEqual(before);
  });

  it("refuses a batch for a location that is no longer configured", async () => {
    const before = await counts(b.id);
    // The user moved home while a fetch for the old coordinates was in flight.
    const { error } = await batch(b.client, b.id, "home", 12.0, 99.0, [
      hour(9),
    ]);
    expect(error?.message).toBe("location_changed");
    expect(await counts(b.id)).toEqual(before);

    // work was never configured for b, so nothing can be saved for it either.
    const unset = await batch(b.client, b.id, "work", 13.756, 100.502, [
      hour(9),
    ]);
    expect(unset.error?.message).toBe("location_changed");
  });

  it("with no rows, writes only the log (a failed or skipped sync)", async () => {
    const before = await counts(b.id);
    const { data, error } = await batch(
      b.client,
      b.id,
      "home",
      13.756,
      100.502,
      [],
      log({
        status: "failed",
        response_code: 429,
        error_message: "rate limited",
      }),
    );
    expect(error).toBeNull();
    expect(data).toBe(0);
    expect(await counts(b.id)).toEqual({
      forecasts: before.forecasts,
      logs: before.logs + 1,
    });
  });

  it("rejects bad arguments", async () => {
    const notArray = await batch(
      b.client,
      b.id,
      "home",
      13.756,
      100.502,
      {} as never,
    );
    expect(notArray.error?.code).toBe(PG.invalidParameter);
    const badKey = await batch(
      b.client,
      b.id,
      "office" as never,
      13.756,
      100.502,
      [],
    );
    expect(badKey.error?.code).toBe(PG.invalidParameter);
  });

  it("cannot be used to write another user's data", async () => {
    const before = await counts(a.id);
    const { error } = await batch(b.client, a.id, "work", 1.5, 103.8, [
      hour(10),
    ]);
    expect(error).not.toBeNull(); // RLS hides a's settings and blocks the insert
    expect(await counts(a.id)).toEqual(before);
  });

  it("is not callable by anon, but the service role can run it for any user", async () => {
    const anon = await batch(anonClient(), b.id, "home", 13.756, 100.502, [
      hour(11),
    ]);
    expect(anon.error?.code).toBe(PG.insufficientPrivilege);

    const svc = await batch(
      admin(),
      b.id,
      "home",
      13.756,
      100.502,
      [hour(11)],
      log({ trigger: "scheduled" }),
    );
    expect(svc.error).toBeNull();
    expect(svc.data).toBe(1);
  });
});
