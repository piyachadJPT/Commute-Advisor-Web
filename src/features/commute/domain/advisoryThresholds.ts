/**
 * Starting thresholds for advisories (plan §23.3). Tune after real use and record each change
 * in the Decision Log. Heat, UV, gust, rain: at or above. Cold: at or below. Visibility: below.
 */
export const ADVISORY_THRESHOLDS = {
  /** Feels-like °C. Thai Department of Health heat-index bands (33 alert, 42 danger). */
  heat: { caution: 33, warning: 42 },
  /** Feels-like °C, raised from the TMD bands because riding wind feels colder. */
  cold: { caution: 22, warning: 17 },
  /** WHO UV index: very high, extreme. */
  uv: { caution: 8, warning: 11 },
  /** km/h, motorcycle stability. */
  gust: { caution: 40, warning: 60 },
  /** Metres. */
  lowVisibility: { caution: 1000, warning: 200 },
  /** mm in one preceding-hour bucket. */
  heavyRain: { caution: 10, warning: 30 },
  /** WMO codes: thunderstorm, with slight/moderate hail, with heavy hail. */
  thunderstormCodes: [95, 96, 99],
  /** mm over the two buckets before the window. */
  wetRoadMm: 0.5,
  /** The return trip needs at least this rain risk for the dark-return note. */
  darkReturnMinRisk: 20,
} as const;
