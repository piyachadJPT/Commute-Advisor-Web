import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/database.types";
import {
  adminClient,
  createTestUser,
  deleteTestUser,
  PG,
  type TestUser,
} from "./helpers";

type Patch = Database["public"]["Tables"]["daily_recommendations"]["Update"];

let user: TestUser;
const admin = () => adminClient();

beforeAll(async () => {
  user = await createTestUser();
});
afterAll(async () => {
  await deleteTestUser(user);
});

const base = (date: string) => ({
  user_id: user.id,
  recommendation_date: date,
  vehicle: "car",
  departure_risk: 30,
  return_risk: 70,
  return_risk_latest: 70,
  departure_risk_source: "home",
  return_risk_source: "work",
  departure_rain_mm: 0.4,
  return_rain_mm: 3.2,
  reason_code: "returnHigh",
  reason_params: { risk: 70, source: "work", threshold: 50 },
  data_complete: true,
  forecast_fetched_at: "2026-11-11T06:12:00Z",
});

describe("daily_recommendations", () => {
  it("allows one row per user per date and upserts it", async () => {
    const first = await user.client
      .from("daily_recommendations")
      .insert(base("2026-12-01"));
    expect(first.error).toBeNull();

    const dup = await user.client
      .from("daily_recommendations")
      .insert(base("2026-12-01"));
    expect(dup.error?.code).toBe(PG.uniqueViolation);

    const up = await user.client
      .from("daily_recommendations")
      .upsert(
        { ...base("2026-12-01"), vehicle: "motorcycle" },
        { onConflict: "user_id,recommendation_date" },
      )
      .select("vehicle");
    expect(up.error).toBeNull();
    expect(up.data?.[0]?.vehicle).toBe("motorcycle");
  });

  it("rejects invalid values", async () => {
    const bad = [
      { ...base("2026-12-02"), vehicle: "bicycle" },
      { ...base("2026-12-02"), departure_risk: 101 },
      { ...base("2026-12-02"), return_risk_source: "office" },
    ];
    for (const row of bad) {
      const { error } = await user.client
        .from("daily_recommendations")
        .insert(row);
      expect(error?.code).toBe(PG.checkViolation);
    }
  });

  describe("lock invariant (§5.7)", () => {
    const date = "2026-12-03";
    let id: number;

    beforeAll(async () => {
      const { data, error } = await user.client
        .from("daily_recommendations")
        .insert({ ...base(date), locked_at: "2026-11-11T01:20:00Z" })
        .select("id")
        .single();
      expect(error).toBeNull();
      id = data!.id;
    });

    const frozen: Array<[string, Patch]> = [
      ["vehicle", { vehicle: "motorcycle" }],
      ["departure_risk", { departure_risk: 5 }],
      ["return_risk", { return_risk: 5 }],
      ["departure_risk_source", { departure_risk_source: "work" }],
      ["return_risk_source", { return_risk_source: "home" }],
      ["departure_rain_mm", { departure_rain_mm: 9 }],
      ["return_rain_mm", { return_rain_mm: 9 }],
      ["reason_code", { reason_code: "bothLow" }],
      ["reason_params", { reason_params: {} }],
      ["data_complete", { data_complete: false }],
      ["forecast_fetched_at", { forecast_fetched_at: "2026-11-12T00:00:00Z" }],
      ["locked_at (unlock)", { locked_at: null }],
      ["locked_at (move)", { locked_at: "2026-11-12T00:00:00Z" }],
    ];

    it.each(frozen)(
      "rejects a change to %s from the owner",
      async (_name, patch) => {
        const { error } = await user.client
          .from("daily_recommendations")
          .update(patch)
          .eq("id", id);
        expect(error?.code).toBe(PG.checkViolation);
      },
    );

    it.each(frozen)(
      "rejects a change to %s even from the service role",
      async (_name, patch) => {
        const { error } = await admin()
          .from("daily_recommendations")
          .update(patch)
          .eq("id", id);
        expect(error?.code).toBe(PG.checkViolation);
      },
    );

    it("still allows return_risk_latest and bumps updated_at", async () => {
      const before = await admin()
        .from("daily_recommendations")
        .select("*")
        .eq("id", id)
        .single();
      await new Promise((r) => setTimeout(r, 20));
      const { error } = await user.client
        .from("daily_recommendations")
        .update({ return_risk_latest: 85 })
        .eq("id", id);
      expect(error).toBeNull();

      const after = await admin()
        .from("daily_recommendations")
        .select("*")
        .eq("id", id)
        .single();
      expect(after.data?.return_risk_latest).toBe(85);
      expect(after.data?.return_risk).toBe(before.data?.return_risk); // the frozen value is intact
      expect(after.data?.vehicle).toBe("car");
      expect(new Date(after.data!.updated_at).getTime()).toBeGreaterThan(
        new Date(before.data!.updated_at).getTime(),
      );
    });

    it("lets an unlocked row change freely, then lock it exactly once", async () => {
      const unlocked = await user.client
        .from("daily_recommendations")
        .insert(base("2026-12-04"))
        .select("id")
        .single();
      const rowId = unlocked.data!.id;

      const edit = await user.client
        .from("daily_recommendations")
        .update({ vehicle: "motorcycle", return_risk: 20 })
        .eq("id", rowId);
      expect(edit.error).toBeNull();

      const lock = await user.client
        .from("daily_recommendations")
        .update({ locked_at: "2026-11-11T01:20:00Z" })
        .eq("id", rowId);
      expect(lock.error).toBeNull();

      const after = await user.client
        .from("daily_recommendations")
        .update({ vehicle: "car" })
        .eq("id", rowId);
      expect(after.error?.code).toBe(PG.checkViolation);
    });
  });
});
