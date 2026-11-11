import { describe, expect, it } from "vitest";
import { mapWindow } from "@/features/commute/domain/windowMapper";
import { asLocalDate, asLocalTime } from "@/features/commute/domain/tz";
import { TZ, bkk, iso } from "./helpers";

const win = (start: string, minutes: number, date = "2026-11-11", tz = TZ) =>
  mapWindow("departure", asLocalDate(date), asLocalTime(start), minutes, tz);

describe("mapWindow (plan §5.1: bucket T covers (T-1h, T])", () => {
  it("08:20-09:20 uses buckets 09:00 and 10:00", () => {
    const w = win("08:20", 60);
    expect(iso(w.bucketTimes)).toEqual(
      iso([bkk("2026-11-11", "09:00"), bkk("2026-11-11", "10:00")]),
    );
    expect(w.localStart).toBe("08:20");
    expect(w.localEnd).toBe("09:20");
  });

  it("18:00-19:00 uses only bucket 19:00", () => {
    expect(iso(win("18:00", 60).bucketTimes)).toEqual(
      iso([bkk("2026-11-11", "19:00")]),
    );
  });

  it("07:00-07:30 uses only bucket 08:00", () => {
    expect(iso(win("07:00", 30).bucketTimes)).toEqual(
      iso([bkk("2026-11-11", "08:00")]),
    );
  });

  it("a window starting on the hour does not include the bucket ending at its start", () => {
    // Bucket 18:00 covers 17:00-18:00, which ends exactly when the window starts.
    expect(iso(win("18:00", 60).bucketTimes)).not.toContain(
      bkk("2026-11-11", "18:00").toISOString(),
    );
  });

  it("a window ending on the hour does not include the next bucket", () => {
    // 19:00-20:00 would be bucket 20:00, which starts at the window end.
    expect(win("18:00", 60).bucketTimes).toHaveLength(1);
  });

  it("handles a duration that crosses midnight", () => {
    const w = win("23:30", 60);
    expect(iso(w.bucketTimes)).toEqual(
      iso([bkk("2026-11-12", "00:00"), bkk("2026-11-12", "01:00")]),
    );
    expect(w.localEnd).toBe("00:30");
  });

  it("a long window spans every overlapping bucket", () => {
    expect(win("08:00", 180).bucketTimes).toHaveLength(3); // 09:00, 10:00, 11:00
    expect(win("08:15", 180).bucketTimes).toHaveLength(4); // 09:00 ... 12:00
  });

  it("uses local hour labels in a half-hour-offset timezone", () => {
    // Asia/Kolkata is UTC+5:30: local 09:00 is 03:30Z.
    const w = win("08:20", 60, "2026-11-11", "Asia/Kolkata");
    expect(iso(w.bucketTimes)).toEqual([
      "2026-11-11T03:30:00.000Z",
      "2026-11-11T04:30:00.000Z",
    ]);
  });
});
