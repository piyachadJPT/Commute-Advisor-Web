import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  anonClient,
  createTestUser,
  deleteTestUser,
  PG,
  type TestUser,
} from "./helpers";

// The matrix is driven by table name, so it uses an untyped view of the clients.
type Loose = SupabaseClient;
type Row = Record<string, unknown>;
const loose = (u: TestUser) => u.client as unknown as Loose;

type Ops = {
  select: boolean;
  insert: boolean;
  update: boolean;
  delete: boolean;
};

type TableCase = {
  name: string;
  /** A valid row for `userId`; `n` makes unique columns distinct. Null when the app never inserts. */
  row: ((userId: string, n: number) => Row) | null;
  /** A harmless update that is valid on its own. */
  patch: Row;
  /** Operations granted to `authenticated` (least privilege; see core_tables migration). */
  ops: Ops;
};

const day = (n: number) => `2026-11-${String(10 + n).padStart(2, "0")}`;

const TABLES: TableCase[] = [
  {
    name: "settings",
    row: null, // created by the on_auth_user_created trigger
    patch: { home_name: "patched" },
    ops: { select: true, insert: true, update: true, delete: false },
  },
  {
    name: "hourly_forecasts",
    row: (user_id, n) => ({
      user_id,
      location_key: "home",
      latitude: 13.756,
      longitude: 100.502,
      forecast_time: `2026-11-11T0${n}:00:00Z`,
      fetched_at: "2026-11-11T00:00:00Z",
    }),
    patch: { temperature: 31 },
    ops: { select: true, insert: true, update: true, delete: true },
  },
  {
    name: "daily_recommendations",
    row: (user_id, n) => ({
      user_id,
      recommendation_date: day(n),
      vehicle: "car",
      reason_code: "returnHigh",
      data_complete: true,
    }),
    patch: { data_complete: false },
    ops: { select: true, insert: true, update: true, delete: true },
  },
  {
    name: "skipped_days",
    row: (user_id, n) => ({ user_id, date: day(n) }),
    patch: { date: "2027-01-01" }, // a real change, so the missing UPDATE grant is what stops it
    ops: { select: true, insert: true, update: false, delete: true },
  },
  {
    name: "push_subscriptions",
    row: (user_id) => ({
      user_id,
      endpoint: `https://push.example.test/${randomUUID()}`,
      p256dh: "key",
      auth: "secret",
    }),
    patch: { failure_count: 3 },
    ops: { select: true, insert: true, update: true, delete: true },
  },
  {
    name: "notification_logs",
    row: (user_id, n) => ({
      user_id,
      target_date: day(n),
      kind: "generic",
      status: "sent",
    }),
    patch: { status: "failed" },
    ops: { select: true, insert: false, update: false, delete: false },
  },
  {
    name: "forecast_sync_logs",
    row: (user_id) => ({
      user_id,
      location_key: "home",
      trigger: "manual",
      status: "success",
    }),
    patch: { status: "failed" },
    ops: { select: true, insert: true, update: false, delete: false },
  },
];

let a: TestUser;
let b: TestUser;
const admin = () => adminClient() as unknown as Loose;

beforeAll(async () => {
  a = await createTestUser();
  b = await createTestUser();
  // Seed one row for A in every table that the app inserts into (service role bypasses RLS).
  for (const t of TABLES) {
    if (!t.row) continue;
    const { error } = await admin().from(t.name).insert(t.row(a.id, 1));
    expect(error, `seed ${t.name}`).toBeNull();
  }
});

afterAll(async () => {
  await deleteTestUser(a);
  await deleteTestUser(b);
});

describe.each(TABLES)("RLS: $name", (t) => {
  it("lets the owner read their own row", async () => {
    const { data, error } = await loose(a)
      .from(t.name)
      .select("user_id")
      .eq("user_id", a.id);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("hides the row from another user", async () => {
    const { data, error } = await loose(b)
      .from(t.name)
      .select("user_id")
      .eq("user_id", a.id);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("gives the anon role no access at all", async () => {
    const { data, error } = await (anonClient() as unknown as Loose)
      .from(t.name)
      .select("*");
    expect(error?.code).toBe(PG.insufficientPrivilege);
    expect(data).toBeNull();
  });

  it("does not let another user change the row", async () => {
    const res = await loose(b)
      .from(t.name)
      .update(t.patch)
      .eq("user_id", a.id)
      .select();
    if (t.ops.update) {
      expect(res.error).toBeNull();
      expect(res.data).toEqual([]); // RLS filtered the row out: nothing was updated
    } else {
      expect(res.error?.code).toBe(PG.insufficientPrivilege);
    }
    const { data } = await admin().from(t.name).select("*").eq("user_id", a.id);
    expect(data).toHaveLength(1);
  });

  it("does not let another user delete the row", async () => {
    const res = await loose(b)
      .from(t.name)
      .delete()
      .eq("user_id", a.id)
      .select();
    if (t.ops.delete) {
      expect(res.error).toBeNull();
      expect(res.data).toEqual([]);
    } else {
      expect(res.error?.code).toBe(PG.insufficientPrivilege);
    }
    const { data } = await admin().from(t.name).select("*").eq("user_id", a.id);
    expect(data).toHaveLength(1);
  });

  it("does not let a user create a row owned by someone else", async () => {
    const row = t.row ? t.row(a.id, 2) : { user_id: a.id };
    const { error } = await loose(b).from(t.name).insert(row);
    expect(error?.code).toBe(PG.insufficientPrivilege);
  });

  const makeRow = t.row;
  if (t.ops.insert && makeRow) {
    it("lets the owner create their own row", async () => {
      const { error } = await loose(a).from(t.name).insert(makeRow(a.id, 3));
      expect(error).toBeNull();
    });
  }

  if (!t.ops.insert && makeRow) {
    it("refuses the owner an insert that only jobs may do", async () => {
      const { error } = await loose(a).from(t.name).insert(makeRow(a.id, 4));
      expect(error?.code).toBe(PG.insufficientPrivilege);
    });
  }

  if (t.ops.update) {
    it("lets the owner update, but never hand the row to another user", async () => {
      const ok = await loose(a)
        .from(t.name)
        .update(t.patch)
        .eq("user_id", a.id)
        .select();
      expect(ok.error).toBeNull();
      expect(ok.data?.length).toBeGreaterThan(0);

      // The WITH CHECK clause stops the owner from reassigning user_id.
      const steal = await loose(a)
        .from(t.name)
        .update({ user_id: b.id })
        .eq("user_id", a.id);
      expect(steal.error?.code).toBe(PG.insufficientPrivilege);
    });
  } else {
    it("refuses the owner an update that only jobs may do", async () => {
      const { error } = await loose(a)
        .from(t.name)
        .update({ user_id: a.id })
        .eq("user_id", a.id);
      expect(error?.code).toBe(PG.insufficientPrivilege);
    });
  }

  if (t.ops.delete) {
    it("lets the owner delete their own row", async () => {
      const { error } = await loose(a)
        .from(t.name)
        .delete()
        .eq("user_id", a.id);
      expect(error).toBeNull();
    });
  } else {
    it("refuses the owner a delete that only jobs may do", async () => {
      const { error } = await loose(a)
        .from(t.name)
        .delete()
        .eq("user_id", a.id);
      expect(error?.code).toBe(PG.insufficientPrivilege);
    });
  }
});

describe("job_runs and scheduler health", () => {
  it("is closed to every API role", async () => {
    for (const client of [loose(a), anonClient() as unknown as Loose]) {
      const read = await client.from("job_runs").select("*");
      expect(read.error?.code).toBe(PG.insufficientPrivilege);
      const write = await client.from("job_runs").insert({
        job: "tick",
        status: "ok",
        finished_at: new Date().toISOString(),
      });
      expect(write.error?.code).toBe(PG.insufficientPrivilege);
    }
  });

  it("exposes only the last successful run time, and only to signed-in users", async () => {
    const finished = new Date(Date.now() - 5 * 60_000).toISOString();
    const inserted = await admin()
      .from("job_runs")
      .insert({ job: "tick", status: "ok", finished_at: finished })
      .select("id")
      .single();
    expect(inserted.error).toBeNull();

    const signedIn = await loose(a).rpc("get_scheduler_health");
    expect(signedIn.error).toBeNull();
    // A newer run from another test file could exist; the value is never older than ours.
    expect(new Date(signedIn.data as string).getTime()).toBeGreaterThanOrEqual(
      new Date(finished).getTime() - 1000,
    );

    const anon = await (anonClient() as unknown as Loose).rpc(
      "get_scheduler_health",
    );
    expect(anon.error?.code).toBe(PG.insufficientPrivilege);

    await admin().from("job_runs").delete().eq("id", inserted.data?.id);
  });

  it("ignores failed runs", async () => {
    // A failed run, newer than any ok run, must not move the health timestamp.
    const before = await loose(a).rpc("get_scheduler_health");
    const failed = await admin()
      .from("job_runs")
      .insert({
        job: "tick",
        status: "error",
        finished_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    const after = await loose(a).rpc("get_scheduler_health");
    expect(after.data).toBe(before.data);
    await admin().from("job_runs").delete().eq("id", failed.data?.id);
  });
});
