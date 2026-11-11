import { describe, expect, it } from "vitest";
import { buildNotification } from "@/features/notifications/domain/payload";
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
