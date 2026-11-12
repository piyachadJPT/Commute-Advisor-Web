import { describe, expect, it } from "vitest";
import { analyzeTrip } from "@/features/commute/domain/analyzer";
import { computeAdvisories } from "@/features/commute/domain/advisories";
import type { AdvisoryGroup } from "@/features/commute/domain/advisoryGroups";
import { asLocalDate, asLocalTime } from "@/features/commute/domain/tz";
import type {
  Advisory,
  AdvisoryCode,
  HourlyAirQuality,
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

describe("pm25 advisory (plan §23.5)", () => {
  const air = (
    location: LocationKey,
    byLabel: Record<string, number | null>,
  ): HourlyAirQuality[] =>
    Object.entries(byLabel).map(([label, pm25]) => ({
      time: bkk(DATE, label),
      location,
      pm25,
      pm10: null,
    }));
  const run = (p: {
    home?: Record<string, number | null>;
    work?: Record<string, number | null>;
  }) => {
    const date = asLocalDate(DATE);
    const dep = analyzeTrip(
      mapWindow("departure", date, asLocalTime("08:20"), 60, TZ),
      [],
      [],
    );
    const ret = analyzeTrip(
      mapWindow("return", date, asLocalTime("18:00"), 60, TZ),
      [],
      [],
    );
    return computeAdvisories({
      departure: dep,
      returnTrip: ret,
      threshold: 50,
      home: [],
      work: [],
      homeAir: air("home", p.home ?? {}),
      workAir: air("work", p.work ?? {}),
      timeZone: TZ,
    }).filter((a) => a.code === "pm25");
  };

  it("above 37.5 is a caution, above 75 a warning; the edges themselves are not", () => {
    const at = (v: number) => run({ home: { "09:00": v } }).map((a) => a.level);
    expect(at(37.5)).toEqual([]);
    expect(at(37.6)).toEqual(["caution"]);
    expect(at(75)).toEqual(["caution"]);
    expect(at(75.1)).toEqual(["warning"]);
  });

  it("takes the highest bucket and the worse location, rounded; a tie goes to home", () => {
    expect(
      run({
        home: { "09:00": 40, "10:00": 44.4 },
        work: { "09:00": 60.2 },
      }),
    ).toEqual([
      {
        code: "pm25",
        level: "caution",
        trip: "departure",
        source: "work",
        params: { value: 60 },
      },
    ]);
    expect(
      run({ home: { "09:00": 50 }, work: { "09:00": 50 } })[0]?.source,
    ).toBe("home");
  });

  it("evaluates the return trip on its own bucket", () => {
    const got = run({ home: { "19:00": 80 } });
    expect(got.map((a) => [a.trip, a.level])).toEqual([["return", "warning"]]);
  });

  it("null values and no rows give no advisory", () => {
    expect(run({ home: { "09:00": null } })).toEqual([]);
    expect(run({})).toEqual([]);
  });

  it("sorts after heavyRain and before heat", () => {
    const date = asLocalDate(DATE);
    const dep = analyzeTrip(
      mapWindow("departure", date, asLocalTime("08:20"), 60, TZ),
      [],
      [],
    );
    const ret = analyzeTrip(
      mapWindow("return", date, asLocalTime("18:00"), 60, TZ),
      [],
      [],
    );
    const hot = rows(
      "home",
      spread(DEP, { apparentTemperature: 34, precipitation: 12 }),
    );
    const got = computeAdvisories({
      departure: dep,
      returnTrip: ret,
      threshold: 50,
      home: hot,
      work: [],
      homeAir: air("home", { "09:00": 40 }),
      timeZone: TZ,
    });
    expect(got.map((a) => a.code)).toEqual(["heavyRain", "pm25", "heat"]);
  });
});

describe("pm25 in computeRecommendation: old air data is ignored (plan §23.5)", () => {
  const smoggy: HourlyAirQuality[] = [9, 10].map((h) => ({
    time: bkk(DATE, `${String(h).padStart(2, "0")}:00`),
    location: "home",
    pm25: 90,
    pm10: null,
  }));
  const labels = [...DEP, ...RET];
  const run = (airFetchedAt: Date | null) =>
    computeRecommendation({
      date: asLocalDate(DATE),
      settings,
      home: rows("home", spread(labels, { prob: 10 })),
      work: rows("work", spread(labels, { prob: 10 })),
      homeFetchedAt: bkk(DATE, "05:50"),
      workFetchedAt: bkk(DATE, "05:50"),
      homeAir: smoggy,
      homeAirFetchedAt: airFetchedAt,
      now: bkk(DATE, "12:00"),
    });

  it("uses air quality fetched within 6 hours (exactly 6 hours counts as fresh)", () => {
    expect(run(bkk(DATE, "06:00")).advisories.map((a) => a.code)).toEqual([
      "pm25",
    ]);
  });
  it("ignores air quality fetched more than 6 hours ago, or never", () => {
    expect(run(bkk(DATE, "05:59")).advisories).toEqual([]);
    expect(run(null).advisories).toEqual([]);
  });
  it("does not touch the vehicle, the risks or the freshness", () => {
    const a = run(bkk(DATE, "06:00"));
    const b = run(null);
    expect({ ...a, advisories: [] }).toEqual({ ...b, advisories: [] });
  });
});

describe("advisory settings (plan §23.6)", () => {
  const run = (
    p: { home?: Spec; work?: Spec },
    extra: {
      disabledGroups?: AdvisoryGroup[];
      temperatureOffset?: number;
    } = {},
  ) => {
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
      threshold: 50,
      home,
      work,
      timeZone: TZ,
      ...extra,
    });
  };

  // One trigger per group, all on the departure trip.
  const everything: Spec = spread(DEP, {
    apparentTemperature: 45,
    uvIndex: 12,
    windGusts: 70,
    visibility: 100,
    weatherCode: 95,
    precipitation: 12,
    prob: 10,
  });

  it("with nothing disabled every group shows", () => {
    const codes = new Set(run({ home: everything }).map((a) => a.code));
    for (const c of [
      "heat",
      "uv",
      "gust",
      "lowVisibility",
      "thunderstorm",
      "heavyRain",
    ]) {
      expect(codes.has(c as AdvisoryCode)).toBe(true);
    }
  });

  it.each([
    ["heatCold", ["heat", "cold"]],
    ["sun", ["uv"]],
    ["windVisibility", ["gust", "lowVisibility"]],
  ] as const)("disabling %s removes exactly its codes", (group, removed) => {
    const before = run({ home: everything }).map((a) => a.code);
    const after = run({ home: everything }, { disabledGroups: [group] }).map(
      (a) => a.code,
    );
    expect(after).toEqual(
      before.filter((c) => !(removed as readonly string[]).includes(c)),
    );
  });

  it("disabling rainExtras removes wetRoad, rainNearWindow and darkReturn", () => {
    const wet: Spec = {
      ...spread(DEP, { prob: 10 }),
      "08:00": { precipitation: 2, prob: 80 },
      "19:00": { prob: 30, isDay: false },
    };
    const calm: Spec = { ...spread(DEP, { prob: 10 }), "19:00": { prob: 30 } };
    const on = run({ home: wet, work: calm }).map((a) => a.code);
    expect(on).toEqual(
      expect.arrayContaining(["wetRoad", "rainNearWindow", "darkReturn"]),
    );
    expect(
      run({ home: wet, work: calm }, { disabledGroups: ["rainExtras"] }),
    ).toEqual([]);
  });

  it("disabling airQuality removes pm25", () => {
    // pm25 needs air rows; the engine drops the code whatever its source.
    const date = asLocalDate(DATE);
    const t = analyzeTrip(
      mapWindow("departure", date, asLocalTime("08:20"), 60, TZ),
      [],
      [],
    );
    const r = analyzeTrip(
      mapWindow("return", date, asLocalTime("18:00"), 60, TZ),
      [],
      [],
    );
    const air = [
      {
        time: bkk(DATE, "09:00"),
        location: "home" as const,
        pm25: 90,
        pm10: null,
      },
    ];
    const base = {
      departure: t,
      returnTrip: r,
      threshold: 50,
      home: [],
      work: [],
      homeAir: air,
      timeZone: TZ,
    };
    expect(computeAdvisories(base).map((a) => a.code)).toEqual(["pm25"]);
    expect(
      computeAdvisories({ ...base, disabledGroups: ["airQuality"] }),
    ).toEqual([]);
  });

  it("thunderstorm and heavyRain cannot be turned off, whatever is disabled", () => {
    const all: AdvisoryGroup[] = [
      "heatCold",
      "sun",
      "windVisibility",
      "rainExtras",
      "airQuality",
    ];
    const codes = run({ home: everything }, { disabledGroups: all }).map(
      (a) => a.code,
    );
    expect(codes).toEqual(["thunderstorm", "heavyRain"]);
  });

  describe("temperature offset moves the heat and cold thresholds exactly", () => {
    const at = (v: number, offset: number) =>
      run(
        { home: spread(DEP, { apparentTemperature: v }) },
        { temperatureOffset: offset },
      );
    const levelOf = (list: Advisory[], code: AdvisoryCode) =>
      list.find((a) => a.code === code)?.level ?? null;

    it.each([-3, -1, 0, 2, 3])("offset %s", (k) => {
      // heat: caution at 33+k, warning at 42+k
      expect(levelOf(at(33 + k - 0.1, k), "heat")).toBeNull();
      expect(levelOf(at(33 + k, k), "heat")).toBe("caution");
      expect(levelOf(at(42 + k - 0.1, k), "heat")).toBe("caution");
      expect(levelOf(at(42 + k, k), "heat")).toBe("warning");
      // cold: caution at 22+k, warning at 17+k
      expect(levelOf(at(22 + k + 0.1, k), "cold")).toBeNull();
      expect(levelOf(at(22 + k, k), "cold")).toBe("caution");
      expect(levelOf(at(17 + k + 0.1, k), "cold")).toBe("caution");
      expect(levelOf(at(17 + k, k), "cold")).toBe("warning");
    });

    it("does not touch the other thresholds", () => {
      const list = run(
        { home: spread(DEP, { uvIndex: 8, windGusts: 40 }) },
        { temperatureOffset: 3 },
      );
      expect(list.map((a) => [a.code, a.level])).toEqual([
        ["gust", "caution"],
        ["uv", "caution"],
      ]);
    });
  });
});
