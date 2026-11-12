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
  /**
   * PM2.5 µg/m³, above (not at). Thai PCD bands: 37.6-75 starts to affect health, above 75
   * affects health. The bands are 24-hour averages; here they are applied to hourly model
   * values as an indicator, and the copy says the value is an estimate.
   */
  pm25: { caution: 37.5, warning: 75 },
  /** mm over the two buckets before the window. */
  wetRoadMm: 0.5,
  /** The return trip needs at least this rain risk for the dark-return note. */
  darkReturnMinRisk: 20,
} as const;

/** Upper edges of the Thai PCD PM2.5 bands in µg/m³: very good, good, moderate, starts to affect. */
export const PM25_BAND_EDGES = [15, 25, 37.5, 75] as const;
