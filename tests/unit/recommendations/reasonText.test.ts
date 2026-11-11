import { describe, expect, it } from "vitest";
import { renderReasonText } from "@/features/recommendations/reasonText";
import type { Reason } from "@/features/commute/domain/types";

const returnHigh = (over: Record<string, unknown> = {}): Reason =>
  ({
    code: "returnHigh",
    params: {
      risk: 70,
      source: "work",
      window: "18:00–19:00",
      threshold: 50,
      ...over,
    },
  }) as Reason;

describe("renderReasonText (plain text for notifications and history)", () => {
  it("Thai and English returnHigh", () => {
    expect(renderReasonText(returnHigh(), "th")).toBe(
      "ขากลับเสี่ยงฝน 70% ที่ทำงาน (18:00–19:00)",
    );
    expect(renderReasonText(returnHigh(), "en")).toBe(
      "Return: 70% chance of rain at work (18:00–19:00)",
    );
  });

  it("departureHigh at home", () => {
    const r = {
      code: "departureHigh",
      params: {
        risk: 55,
        source: "home",
        window: "08:20–09:20",
        threshold: 50,
      },
    } as Reason;
    expect(renderReasonText(r, "th")).toBe(
      "ขาไปเสี่ยงฝน 55% ที่บ้าน (08:20–09:20)",
    );
    expect(renderReasonText(r, "en")).toBe(
      "Outbound: 55% chance of rain at home (08:20–09:20)",
    );
  });

  it("states a non-default threshold explicitly", () => {
    const r = returnHigh({ risk: 45, threshold: 40 });
    expect(renderReasonText(r, "th")).toBe(
      "ขากลับ 45% ที่ทำงาน (18:00–19:00) ซึ่งเกินเกณฑ์ที่ตั้งไว้ 40%",
    );
    expect(renderReasonText(r, "en")).toBe(
      "Return: 45% at work (18:00–19:00), above your 40% threshold",
    );
  });

  it("notes that the other trip has no data", () => {
    const r = returnHigh({ otherIncomplete: true });
    expect(renderReasonText(r, "th")).toBe(
      "ขากลับเสี่ยงฝน 70% ที่ทำงาน (18:00–19:00) · ยังไม่มีข้อมูลขาไป",
    );
    expect(renderReasonText(r, "en")).toBe(
      "Return: 70% chance of rain at work (18:00–19:00) · no data for the outbound trip",
    );
  });

  it("bothLow", () => {
    const r = { code: "bothLow", params: { threshold: 50, max: 35 } } as Reason;
    expect(renderReasonText(r, "th")).toBe(
      "โอกาสฝนทั้งสองขาต่ำกว่าเกณฑ์ 50% · สูงสุด 35%",
    );
    expect(renderReasonText(r, "en")).toBe(
      "Both trips below the 50% threshold · highest 35%",
    );
  });

  it("incomplete names the trip, location and hours", () => {
    const r = {
      code: "incomplete",
      params: {
        trip: "departure",
        source: "work",
        hours: "09:00, 10:00",
        threshold: 50,
      },
    } as Reason;
    expect(renderReasonText(r, "th")).toBe(
      "ยังไม่มีข้อมูลโอกาสฝนช่วงขาไปที่ทำงาน (09:00, 10:00)",
    );
    expect(renderReasonText(r, "en")).toBe(
      "No rain probability yet for the outbound trip at work (09:00, 10:00)",
    );
  });

  it("never uses exclamation marks, emoji or certainty about dry weather", () => {
    const reasons: Reason[] = [
      returnHigh(),
      returnHigh({ risk: 45, threshold: 40, otherIncomplete: true }),
      { code: "bothLow", params: { threshold: 50, max: 0 } },
      {
        code: "incomplete",
        params: {
          trip: "return",
          source: "home",
          hours: "19:00",
          threshold: 50,
        },
      },
    ];
    for (const r of reasons) {
      for (const locale of ["th", "en"] as const) {
        const text = renderReasonText(r, locale);
        expect(text).not.toMatch(/[!！]/);
        expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
        expect(text).not.toMatch(/ฝนจะไม่ตก|will not rain|definitely/i);
      }
    }
  });
});
