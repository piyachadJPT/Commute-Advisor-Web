import { describe, expect, it } from "vitest";
import { analyzeTrip } from "@/features/commute/domain/analyzer";
import { computeAdvisories } from "@/features/commute/domain/advisories";
import { asLocalDate, asLocalTime } from "@/features/commute/domain/tz";
import type {
  Advisory,
  AdvisoryCode,
  HourlyWeather,
  LocationKey,
} from "@/features/commute/domain/types";
import { mapWindow } from "@/features/commute/domain/windowMapper";
import { toSnapshot } from "@/features/commute/domain/locking";
import { computeRecommendation } from "@/features/commute/domain/recommend";
import { DATE, TZ, bkk, settings } from "./helpers";

// Departure 08:20-09:20 uses buckets 09:00 and 10:00. Return 18:00-19:00 uses bucket 19:00.
// The buckets just outside are 08:00/07:00 and 11:00 (departure), 18:00/17:00 and 20:00 (return).
const DEP = ["09:00", "10:00"];
const RET = ["19:00"];

type Over = Partial<
  Omit<HourlyWeather, "time" | "location" | "precipitationProbability">
> & { prob?: number | null };

const row = (
  location: LocationKey,
  label: string,
  over: Over = {},
): HourlyWeather => ({
  time: bkk(DATE, label),
  location,
  temperature: 28,
  humidity: 70,
  precipitationProbability: over.prob === undefined ? 0 : over.prob,
  precipitation: 0,
  rain: 0,
  showers: 0,
  weatherCode: 3,
  windSpeed: 5,
  apparentTemperature: null,
  uvIndex: null,
  windGusts: null,
  visibility: null,
  isDay: null,
  ...Object.fromEntries(Object.entries(over).filter(([k]) => k !== "prob")),
});

type Spec = Record<string, Over>; // label -> overrides; a label that is absent has no row
const rows = (location: LocationKey, spec: Spec) =>
  Object.entries(spec).map(([label, over]) => row(location, label, over));

function advise(p: { home?: Spec; work?: Spec }, threshold = 50): Advisory[] {
  const home = rows("home", p.home ?? {});
  const work = rows("work", p.work ?? {});
  const date = asLocalDate(DATE);
  const dep = analyzeTrip(
    mapWindow("departure", date, asLocalTime("08:20"), 60, TZ),
    home,
    work,
  );
  const ret = analyzeTrip(
    mapWindow("return", date, asLocalTime("18:00"), 60, TZ),
    home,
    work,
  );
  return computeAdvisories({
    departure: dep,
    returnTrip: ret,
    threshold,
    home,
    work,
    timeZone: TZ,
  });
}

const spread = (labels: string[], over: Over): Spec =>
  Object.fromEntries(labels.map((l) => [l, over]));
const only = (list: Advisory[], code: AdvisoryCode) =>
  list.filter((a) => a.code === code);

describe("computeAdvisories: threshold edges", () => {
  // [code, field, below, atCaution, atWarning, caution→ level checks]
  const cases: Array<{
    code: AdvisoryCode;
    field: keyof Over;
    none: number;
    caution: number;
    warning: number;
  }> = [
    {
      code: "heat",
      field: "apparentTemperature",
      none: 32.9,
      caution: 33,
      warning: 42,
    },
    { code: "uv", field: "uvIndex", none: 7.9, caution: 8, warning: 11 },
    { code: "gust", field: "windGusts", none: 39.9, caution: 40, warning: 60 },
    {
      code: "heavyRain",
      field: "precipitation",
      none: 9.9,
      caution: 10,
      warning: 30,
    },
  ];
  for (const c of cases) {
    it(`${c.code}: just below, at caution, at warning`, () => {
      const at = (v: number) =>
        only(advise({ home: spread(DEP, { [c.field]: v }) }), c.code);
      expect(at(c.none)).toEqual([]);
      expect(at(c.caution).map((a) => a.level)).toEqual(["caution"]);
      expect(at(c.warning).map((a) => a.level)).toEqual(["warning"]);
    });
  }

  it("cold: lower is worse, edges at 22 and 17", () => {
    const at = (v: number) =>
      only(advise({ home: spread(DEP, { apparentTemperature: v }) }), "cold");
    expect(at(22.1)).toEqual([]);
    expect(at(22).map((a) => a.level)).toEqual(["caution"]);
    expect(at(17.1).map((a) => a.level)).toEqual(["caution"]);
    expect(at(17).map((a) => a.level)).toEqual(["warning"]);
  });

  it("lowVisibility: lower is worse, below 1000 m and below 200 m", () => {
    const at = (v: number) =>
      only(advise({ home: spread(DEP, { visibility: v }) }), "lowVisibility");
    expect(at(1000)).toEqual([]);
    expect(at(999).map((a) => a.level)).toEqual(["caution"]);
    expect(at(200).map((a) => a.level)).toEqual(["caution"]);
    expect(at(199).map((a) => a.level)).toEqual(["warning"]);
  });

  it("thunderstorm: codes 95, 96 and 99 are warnings, other codes are not", () => {
    for (const code of [95, 96, 99]) {
      const got = only(
        advise({ home: spread(DEP, { weatherCode: code }) }),
        "thunderstorm",
      );
      expect(got.map((a) => a.level)).toEqual(["warning"]);
    }
    for (const code of [3, 61, 82, 94, 97]) {
      expect(
        only(
          advise({ home: spread(DEP, { weatherCode: code }) }),
          "thunderstorm",
        ),
      ).toEqual([]);
    }
  });

  it("thunderstorm shows even when rain probability is far below the threshold", () => {
    const got = advise({ home: spread(DEP, { weatherCode: 95, prob: 5 }) });
    expect(got.map((a) => a.code)).toEqual(["thunderstorm"]);
  });
});

describe("computeAdvisories: worst value, source and params", () => {
  it("takes the worst bucket and reports its value, rounded", () => {
    const got = only(
      advise({
        home: {
          "09:00": { apparentTemperature: 34.2 },
          "10:00": { apparentTemperature: 36.6 },
        },
      }),
      "heat",
    );
    expect(got).toEqual([
      {
        code: "heat",
        level: "caution",
        trip: "departure",
        source: "home",
        params: { value: 37 },
      },
    ]);
  });

  it("the location with the worse value is the source", () => {
    const got = only(
      advise({
        home: spread(DEP, { apparentTemperature: 34 }),
        work: spread(DEP, { apparentTemperature: 36 }),
      }),
      "heat",
    );
    expect(got[0]?.source).toBe("work");
  });

  it("a tie goes to home", () => {
    const got = only(
      advise({
        home: spread(DEP, { apparentTemperature: 35 }),
        work: spread(DEP, { apparentTemperature: 35 }),
      }),
      "heat",
    );
    expect(got[0]?.source).toBe("home");
  });

  it("cold takes the lowest value across both locations", () => {
    const got = only(
      advise({
        home: spread(DEP, { apparentTemperature: 21 }),
        work: spread(DEP, { apparentTemperature: 16 }),
      }),
      "cold",
    );
    expect(got).toEqual([
      {
        code: "cold",
        level: "warning",
        trip: "departure",
        source: "work",
        params: { value: 16 },
      },
    ]);
  });

  it("one advisory per code per trip, and trips are evaluated separately", () => {
    const got = only(
      advise({
        home: {
          ...spread(DEP, { uvIndex: 9 }),
          ...spread(RET, { uvIndex: 12 }),
        },
      }),
      "uv",
    );
    expect(got.map((a) => [a.trip, a.level])).toEqual([
      ["return", "warning"], // sorted: warning first
      ["departure", "caution"],
    ]);
  });

  it("heavyRain reports the largest single-bucket amount with one decimal", () => {
    const got = only(
      advise({
        work: {
          "09:00": { precipitation: 4 },
          "10:00": { precipitation: 12.34 },
        },
      }),
      "heavyRain",
    );
    expect(got[0]).toMatchObject({ source: "work", params: { mm: 12.3 } });
  });
});

describe("computeAdvisories: missing data", () => {
  it("no rows at all gives no advisories", () => {
    expect(advise({})).toEqual([]);
  });

  it("null values give no advisory, never a zero reading", () => {
    expect(
      advise({
        home: spread(DEP, {
          apparentTemperature: null,
          uvIndex: null,
          windGusts: null,
          visibility: null,
        }),
      }),
    ).toEqual([]);
  });

  it("present values are still evaluated when others are missing", () => {
    const got = advise({
      home: { "09:00": { windGusts: 45 }, "10:00": { windGusts: null } },
    });
    expect(only(got, "gust").map((a) => a.level)).toEqual(["caution"]);
  });

  it("a missing location does not hide the other location's warning", () => {
    const got = advise({ work: spread(DEP, { uvIndex: 11 }) });
    expect(only(got, "uv")[0]).toMatchObject({
      level: "warning",
      source: "work",
    });
  });
});

describe("computeAdvisories: wetRoad", () => {
  const dryWindow = spread(DEP, { prob: 10 });

  it("0.5 mm in the two buckets before the window, trip not high", () => {
    const got = only(
      advise({
        home: {
          ...dryWindow,
          "07:00": { precipitation: 0.2 },
          "08:00": { precipitation: 0.3 },
        },
      }),
      "wetRoad",
    );
    expect(got).toEqual([
      {
        code: "wetRoad",
        level: "caution",
        trip: "departure",
        source: "home",
        params: { mm: 0.5 },
      },
    ]);
  });

  it("just under 0.5 mm gives nothing", () => {
    expect(
      only(
        advise({
          home: {
            ...dryWindow,
            "07:00": { precipitation: 0.2 },
            "08:00": { precipitation: 0.2 },
          },
        }),
        "wetRoad",
      ),
    ).toEqual([]);
  });

  it("only the two buckets before count", () => {
    expect(
      only(
        advise({ home: { ...dryWindow, "06:00": { precipitation: 5 } } }),
        "wetRoad",
      ),
    ).toEqual([]);
  });

  it("is suppressed when the trip itself is high", () => {
    const got = advise({
      home: { ...spread(DEP, { prob: 60 }), "08:00": { precipitation: 5 } },
      work: spread(DEP, { prob: 0 }),
    });
    expect(only(got, "wetRoad")).toEqual([]);
  });

  it("the location with more rain is the source", () => {
    const got = only(
      advise({
        home: { ...dryWindow, "08:00": { precipitation: 0.6 } },
        work: { ...dryWindow, "08:00": { precipitation: 2 } },
      }),
      "wetRoad",
    );
    expect(got[0]).toMatchObject({ source: "work", params: { mm: 2 } });
  });
});

describe("computeAdvisories: rainNearWindow", () => {
  const dryWindow = spread(DEP, { prob: 10 });

  it("rain just before the window, at the threshold", () => {
    const got = only(
      advise({ home: { ...dryWindow, "08:00": { prob: 50 } } }),
      "rainNearWindow",
    );
    expect(got).toEqual([
      {
        code: "rainNearWindow",
        level: "caution",
        trip: "departure",
        source: "home",
        params: { when: "before", hour: "08:00" },
      },
    ]);
  });

  it("rain just after the window", () => {
    const got = only(
      advise({ work: { ...dryWindow, "11:00": { prob: 70 } } }),
      "rainNearWindow",
    );
    expect(got[0]).toMatchObject({
      source: "work",
      params: { when: "after", hour: "11:00" },
    });
  });

  it("just under the threshold gives nothing; the threshold is the user's", () => {
    expect(
      only(
        advise({ home: { ...dryWindow, "08:00": { prob: 49 } } }),
        "rainNearWindow",
      ),
    ).toEqual([]);
    expect(
      only(
        advise({ home: { ...dryWindow, "08:00": { prob: 40 } } }, 40),
        "rainNearWindow",
      ),
    ).toHaveLength(1);
  });

  it("is suppressed when the trip itself is high", () => {
    const got = advise({
      home: { ...spread(DEP, { prob: 60 }), "08:00": { prob: 90 } },
      work: spread(DEP, { prob: 0 }),
    });
    expect(only(got, "rainNearWindow")).toEqual([]);
  });

  it("a null probability outside the window gives nothing", () => {
    expect(
      only(
        advise({ home: { ...dryWindow, "08:00": { prob: null } } }),
        "rainNearWindow",
      ),
    ).toEqual([]);
  });
});

describe("computeAdvisories: darkReturn", () => {
  it("return trip, a night bucket and risk of at least 20%", () => {
    const got = only(
      advise({
        home: { "19:00": { prob: 20, isDay: false } },
        work: { "19:00": { prob: 0 } },
      }),
      "darkReturn",
    );
    expect(got).toEqual([
      {
        code: "darkReturn",
        level: "caution",
        trip: "return",
        source: "home",
        params: { risk: 20 },
      },
    ]);
  });

  it("risk of 19% gives nothing", () => {
    expect(
      only(
        advise({
          home: { "19:00": { prob: 19, isDay: false } },
          work: { "19:00": { prob: 0 } },
        }),
        "darkReturn",
      ),
    ).toEqual([]);
  });

  it("daylight or unknown daylight gives nothing", () => {
    expect(
      only(
        advise({
          home: { "19:00": { prob: 40, isDay: true } },
          work: { "19:00": { prob: 0 } },
        }),
        "darkReturn",
      ),
    ).toEqual([]);
    expect(
      only(
        advise({
          home: { "19:00": { prob: 40, isDay: null } },
          work: { "19:00": { prob: 0 } },
        }),
        "darkReturn",
      ),
    ).toEqual([]);
  });

  it("never applies to the departure trip", () => {
    const got = advise({
      home: {
        ...spread(DEP, { prob: 40, isDay: false }),
        "19:00": { prob: 40, isDay: true },
      },
      work: { ...spread(DEP, { prob: 40 }), "19:00": { prob: 40 } },
    });
    expect(only(got, "darkReturn")).toEqual([]);
  });

  it("an incomplete trip has no risk, so no darkReturn", () => {
    expect(
      only(
        advise({ home: { "19:00": { prob: null, isDay: false } } }),
        "darkReturn",
      ),
    ).toEqual([]);
  });
});

describe("computeAdvisories: order", () => {
  it("warnings first, then the fixed priority, then departure before return", () => {
    const got = advise({
      home: {
        ...spread(DEP, {
          uvIndex: 9,
          apparentTemperature: 34,
          weatherCode: 95,
          prob: 5,
        }),
        ...spread(RET, { uvIndex: 9, windGusts: 70 }),
      },
    });
    expect(got.map((a) => `${a.level}:${a.code}:${a.trip}`)).toEqual([
      "warning:thunderstorm:departure",
      "warning:gust:return",
      "caution:heat:departure",
      "caution:uv:departure",
      "caution:uv:return",
    ]);
  });
});

describe("advisories never change the verdict (plan §23.1)", () => {
  const stormy: Over = {
    prob: 10,
    weatherCode: 95,
    apparentTemperature: 45,
    uvIndex: 12,
    windGusts: 70,
    visibility: 100,
    precipitation: 0,
    isDay: false,
  };
  const calm: Over = { prob: 10, precipitation: 0 };
  const run = (over: Over) => {
    const labels = [...DEP, ...RET];
    return computeRecommendation({
      date: asLocalDate(DATE),
      settings,
      home: rows("home", spread(labels, over)),
      work: rows("work", spread(labels, over)),
      homeFetchedAt: bkk(DATE, "05:50"),
      workFetchedAt: bkk(DATE, "05:50"),
      now: bkk(DATE, "06:00"),
    });
  };

  it("extreme supporting values leave vehicle, risks and reason exactly as with calm ones", () => {
    const a = run(stormy);
    const b = run(calm);
    expect(a.advisories.length).toBeGreaterThan(0);
    expect(b.advisories).toEqual([]);
    expect(a.vehicle).toBe("motorcycle");
    expect({ ...a, advisories: [] }).toEqual({ ...b, advisories: [] });
  });

  it("the snapshot that gets stored and frozen carries the advisories", () => {
    const a = run(stormy);
    expect(toSnapshot(a).advisories).toEqual(a.advisories);
  });
});
