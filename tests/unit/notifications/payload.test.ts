import { describe, expect, it } from "vitest";
import type { Advisory } from "@/features/commute/domain/types";
import {
  MAX_BODY_LENGTH,
  buildNotification,
} from "@/features/notifications/domain/payload";
import { bkk, compute, DATE } from "../commute/helpers";

const low = { "09:00": 10, "10:00": 10, "19:00": 10 };
const NOW = bkk(DATE, "06:30");
const build = (
  c: ReturnType<typeof compute> | null,
  locale: "th" | "en" = "th",
  now = NOW,
) => buildNotification({ computed: c, now, timeZone: "Asia/Bangkok", locale });

describe("buildNotification (plan §11.8)", () => {
  it("fresh car recommendation, Thai and English", () => {
    const c = compute({ home: low, work: { ...low, "19:00": 70 } });
    expect(build(c)).toEqual({
      kind: "recommendation",
      payload: {
        title: "Commute Advisor",
        body: "แนะนำรถยนต์ · ขากลับเสี่ยงฝน 70%",
        url: "/",
      },
    });
    expect(build(c, "en").payload.body).toBe(
      "Take the car · Return 70% chance of rain",
    );
  });

  it("fresh motorcycle recommendation", () => {
    const c = compute({ home: { ...low, "10:00": 35 }, work: low });
    expect(build(c).payload.body).toBe(
      "แนะนำมอเตอร์ไซค์ · โอกาสฝนต่ำทั้งสองขา · สูงสุด 35%",
    );
  });

  it("names a custom threshold", () => {
    const c = compute(
      { home: { ...low, "19:00": 45 }, work: low },
      { threshold: 40 },
    );
    expect(build(c).payload.body).toBe(
      "แนะนำรถยนต์ · ขากลับเสี่ยงฝน 45% (เกณฑ์ 40%)",
    );
  });

  it("incomplete data gives an honest unknown", () => {
    const c = compute({
      home: { "10:00": 10, "19:00": 10 },
      work: { "10:00": 10, "19:00": 10 },
    });
    expect(build(c).payload.body).toBe(
      "ยังสรุปไม่ได้ · ข้อมูลพยากรณ์ขาไปยังไม่ครบ",
    );
  });

  it("stale data carries when it is from", () => {
    const fetched = { home: bkk(DATE, "00:10"), work: bkk(DATE, "00:10") };
    const sameDay = compute(
      { home: low, work: low },
      {},
      bkk(DATE, "08:00"),
      fetched,
    );
    expect(build(sameDay, "th", bkk(DATE, "08:00"))).toMatchObject({
      kind: "stale",
      payload: { body: "แนะนำมอเตอร์ไซค์ (ข้อมูล 00:10) · เปิดแอปเพื่ออัปเดต" },
    });
    const yesterday = {
      home: bkk("2026-11-10", "21:10"),
      work: bkk("2026-11-10", "21:10"),
    };
    const old = compute({ home: low, work: low }, {}, NOW, yesterday);
    expect(build(old).payload.body).toBe(
      "แนะนำมอเตอร์ไซค์ (ข้อมูล 21:10 เมื่อวาน) · เปิดแอปเพื่ออัปเดต",
    );
    expect(build(old, "en").payload.body).toBe(
      "Ride the motorcycle (data from 21:10 yesterday) · open the app to update",
    );
  });

  it("falls back to the generic text with no data at all", () => {
    const never = compute({ home: low, work: low }, {}, NOW, {
      home: null,
      work: null,
    });
    expect(build(never)).toMatchObject({
      kind: "generic",
      payload: { body: "เปิดแอปเพื่อดูคำแนะนำการเดินทางวันนี้" },
    });
    expect(build(null).kind).toBe("generic");
  });

  it("never says it will not rain, uses no exclamation marks or emoji, and stays small", () => {
    const cases = [
      compute({ home: low, work: { ...low, "19:00": 70 } }),
      compute({ home: low, work: low }),
      null,
    ];
    for (const c of cases) {
      for (const locale of ["th", "en"] as const) {
        const { payload } = build(c, locale);
        expect(payload.body).not.toMatch(/[!！]/);
        expect(payload.body).not.toMatch(/\p{Extended_Pictographic}/u);
        expect(payload.body).not.toMatch(/ฝนจะไม่ตก|will not rain|no rain/i);
        expect(JSON.stringify(payload).length).toBeLessThan(4000);
        expect(JSON.stringify(payload)).not.toMatch(/latitude|longitude/i);
      }
    }
  });
});

describe("buildNotification: advisories (plan §23.6)", () => {
  const adv = (
    code: Advisory["code"],
    level: Advisory["level"],
    params: Advisory["params"] = {},
    trip: Advisory["trip"] = "departure",
  ): Advisory => ({ code, level, trip, source: "home", params });
  const withAdvisories = (list: Advisory[]) => ({
    ...compute({ home: low, work: low }),
    advisories: list,
  });
  const mainTh = "แนะนำมอเตอร์ไซค์ · โอกาสฝนต่ำทั้งสองขา · สูงสุด 10%";
  const mainEn =
    "Ride the motorcycle · Low chance of rain both ways · highest 10%";

  it("adds nothing when there are no advisories, so the body is exactly the old one", () => {
    expect(build(withAdvisories([])).payload.body).toBe(mainTh);
  });

  it("adds the two most important advisories after the main line, in both languages", () => {
    const list = [
      adv("heat", "warning", { value: 39 }),
      adv("uv", "caution", { value: 9 }),
      adv("wetRoad", "caution", { mm: 1 }), // a third one is not added
    ];
    expect(build(withAdvisories(list)).payload.body).toBe(
      `${mainTh} · ร้อน รู้สึก 39° · UV 9`,
    );
    expect(build(withAdvisories(list), "en").payload.body).toBe(
      `${mainEn} · hot, feels like 39° · UV 9`,
    );
  });

  it("names a code once even when both trips have it", () => {
    const list = [
      adv("heat", "warning", { value: 44 }),
      adv("heat", "warning", { value: 43 }, "return"),
      adv("uv", "caution", { value: 9 }),
    ];
    expect(build(withAdvisories(list), "en").payload.body).toBe(
      `${mainEn} · hot, feels like 44° · UV 9`,
    );
  });

  it("drops advisories, never the recommendation, when the body would be too long", () => {
    const list = [
      adv("thunderstorm", "warning"),
      adv("pm25", "warning", { value: 90 }),
    ];
    const c = {
      ...compute(
        { home: { ...low, "19:00": 45 }, work: low },
        { threshold: 40 },
      ),
      advisories: list,
    };
    const body = build(c, "en").payload.body;
    const main = "Take the car · Return 45% chance of rain (threshold 40%)";
    expect(body.startsWith(main)).toBe(true);
    expect(body.length).toBeLessThanOrEqual(MAX_BODY_LENGTH);
    expect(body).toBe(`${main} · thunderstorm risk`); // one advisory fits, two do not
  });

  it("never exceeds the limit unless it is just the main line", () => {
    for (const locale of ["th", "en"] as const) {
      const body = build(
        withAdvisories([
          adv("thunderstorm", "warning"),
          adv("pm25", "warning", { value: 120 }),
          adv("gust", "caution", { value: 65 }),
        ]),
        locale,
      ).payload.body;
      expect(body.length).toBeLessThanOrEqual(MAX_BODY_LENGTH);
    }
  });

  it("stale and generic notifications carry no advisories", () => {
    const fetched = { home: bkk(DATE, "00:10"), work: bkk(DATE, "00:10") };
    const stale = {
      ...compute({ home: low, work: low }, {}, bkk(DATE, "08:00"), fetched),
      advisories: [adv("heat", "warning", { value: 44 })],
    };
    const s = build(stale, "en", bkk(DATE, "08:00"));
    expect(s.kind).toBe("stale");
    expect(s.payload.body).not.toContain("hot");
    const g = build(null, "en");
    expect(g.kind).toBe("generic");
  });
});
