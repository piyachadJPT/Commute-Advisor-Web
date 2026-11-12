import { describe, expect, it } from "vitest";
import { parseSnapshot } from "@/features/offline/snapshot";

const view = (over: Record<string, unknown> = {}) => ({
  targetDate: new Date("2026-11-11T05:00:00Z"),
  vehicle: "car",
  reason: { code: "returnHigh", params: {} },
  departure: { advisories: [] },
  returnTrip: { advisories: [] },
  nextDays: [],
  week: [],
  fetchedAt: new Date("2026-11-11T00:00:00Z"),
  ...over,
});
const snap = (
  over: Record<string, unknown> = {},
  viewOver: Record<string, unknown> = {},
) => ({
  view: view(viewOver),
  savedAt: new Date(),
  locale: "th",
  ...over,
});

describe("parseSnapshot (data read back from IndexedDB)", () => {
  it("accepts a well-formed snapshot, including one with no fetch time", () => {
    expect(parseSnapshot(snap())).not.toBeNull();
    expect(parseSnapshot(snap({}, { fetchedAt: null }))).not.toBeNull();
  });
  it.each([
    ["nothing", undefined],
    ["null", null],
    ["a string", "snapshot"],
    ["no view", { savedAt: new Date(), locale: "th" }],
    ["dates stored as strings", snap({}, { targetDate: "2026-11-11" })],
    ["savedAt as a string", snap({ savedAt: "2026-11-11" })],
    ["an unknown vehicle", snap({}, { vehicle: "bicycle" })],
    ["an unknown locale", snap({ locale: "fr" })],
    ["missing week", snap({}, { week: undefined })],
    ["a string fetchedAt", snap({}, { fetchedAt: "yesterday" })],
    // A v1 snapshot has trips without advisories; the key is versioned, but guard anyway.
    ["a departure trip without advisories", snap({}, { departure: {} })],
    [
      "a return trip with a non-array advisories",
      snap({}, { returnTrip: { advisories: "x" } }),
    ],
  ])("rejects %s", (_n, value) => expect(parseSnapshot(value)).toBeNull());
});
