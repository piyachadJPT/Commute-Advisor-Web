/*
 * Fills the History screen with past recommendations, so the app has something to show before it
 * has run for months. Run from the project folder:
 *
 *   npm run backfill                       show what would be added (writes nothing)
 *   npm run backfill -- --write            add it
 *   npm run backfill -- --undo             show how many backfilled rows exist
 *   npm run backfill -- --undo --write     delete them
 *   options: --months 6   --user-id <uuid>   --home lat,lon --work lat,lon
 *
 * WHAT THE ROWS ARE. For every past commute day, the real decision engine is run on that day's
 * actual hourly weather from Open-Meteo's archive, at the departure time, and the result is stored
 * as a locked recommendation. The archive has the rain that fell but no forecast probability, so the
 * chance of rain is estimated from the rain (see rainProbability in backfill-core.ts). The rows are
 * therefore "what the app would have said knowing how much rain was coming", NOT what it showed at
 * the time. Each carries `backfill: true` in reason_params, which is how --undo finds them.
 *
 * It never overwrites a real row (existing dates are left alone), skips skipped days and days whose
 * weather is missing, and writes only with --write. Credentials are read from .env by this script.
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import {
  addDays,
  asLocalTime,
  localDateOf,
} from "@/features/commute/domain/tz";
import type {
  CommuteSettings,
  LocalDate,
} from "@/features/commute/domain/types";
import {
  mapForecast,
  fetchForecast,
  type HourlyRow,
} from "@/features/forecast/data/openMeteoClient";
import { forecastResponseSchema } from "@/features/forecast/data/openMeteoSchema";
import {
  BACKFILL_MARKER,
  backfillRange,
  distanceKm,
  planBackfill,
  toDomainRows,
} from "./backfill-core";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const write = flag("write");
const undo = flag("undo");
const months = Number(option("months") ?? 6);
const coords = (value: string | undefined) => {
  if (!value) return null;
  const [lat, lon] = value.split(",").map(Number);
  return Number.isFinite(lat) && Number.isFinite(lon)
    ? { lat: lat!, lon: lon! }
    : null;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ARCHIVE = "https://archive-api.open-meteo.com/v1/archive";
const VARIABLES =
  "temperature_2m,relative_humidity_2m,precipitation,rain,weather_code,wind_speed_10m";

/** The archive in chunks of 90 days (plus one day of overlap for windows that cross midnight). */
async function fetchArchive(
  lat: number,
  lon: number,
  from: LocalDate,
  to: LocalDate,
) {
  const byTime = new Map<string, HourlyRow>();
  let grid: { lat: number; lon: number } | null = null;
  for (let start = from; start <= to; start = addDays(start, 90)) {
    const last = addDays(start, 89) < to ? addDays(start, 89) : to;
    const url = new URL(ARCHIVE);
    url.search = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lon),
      start_date: start,
      // one day of overlap, but never past `to`: the archive refuses dates in the future
      end_date: addDays(last, 1) <= to ? addDays(last, 1) : to,
      hourly: VARIABLES,
      timezone: "Asia/Bangkok",
    }).toString();

    let json: unknown;
    for (let attempt = 1; ; attempt++) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
        if (res.ok) {
          json = await res.json();
          break;
        }
        if (res.status !== 429 && res.status < 500)
          throw new Error(`Open-Meteo HTTP ${res.status}`);
      } catch (err) {
        if (attempt >= 3) throw err;
      }
      if (attempt >= 3)
        throw new Error("Open-Meteo did not answer after 3 attempts");
      await sleep(2000 * attempt);
    }
    // The archive answers for the nearest point of its weather model, which can be some km away.
    const g = json as { latitude?: unknown; longitude?: unknown };
    if (
      grid === null &&
      typeof g.latitude === "number" &&
      typeof g.longitude === "number"
    ) {
      grid = { lat: g.latitude, lon: g.longitude };
    }
    for (const row of mapForecast(forecastResponseSchema.parse(json))) {
      byTime.set(row.forecast_time, row);
    }
    await sleep(300); // be gentle with the free API
  }
  return { rows: [...byTime.values()], grid };
}

async function main() {
  if (!Number.isFinite(months) || months < 1 || months > 24) {
    throw new Error("--months must be between 1 and 24");
  }
  const homeOverride = coords(option("home"));
  const workOverride = coords(option("work"));
  // Preview with explicit places needs no database and no credentials at all.
  const offline = homeOverride && workOverride && !write && !undo;

  const defaults: CommuteSettings = {
    departureTime: asLocalTime("08:20"),
    returnTime: asLocalTime("18:00"),
    durationMinutes: 60,
    threshold: 50,
    commuteDays: 31,
    timeZone: "Asia/Bangkok",
  };

  let settings = defaults;
  let home = homeOverride;
  let work = workOverride;
  let skipped = new Set<string>();
  let db: ReturnType<typeof createClient<Database>> | null = null;
  let userId = "";

  if (!offline) {
    try {
      process.loadEnvFile(".env");
    } catch {
      // Variables may already be in the environment.
    }
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key)
      throw new Error(
        "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env",
      );
    db = createClient<Database>(url, key, { auth: { persistSession: false } });

    const { data: rows, error } = await db
      .from("settings")
      .select(
        "user_id, departure_time, return_time, analysis_duration_minutes, rain_threshold, commute_days, timezone, home_latitude, home_longitude, work_latitude, work_longitude",
      );
    if (error) throw new Error(`settings read failed: ${error.message}`);
    const wanted = option("user-id");
    const candidates = wanted ? rows.filter((r) => r.user_id === wanted) : rows;
    if (candidates.length !== 1) {
      throw new Error(
        candidates.length === 0
          ? "No matching user in settings."
          : `${candidates.length} users found; pick one with --user-id <uuid>.`,
      );
    }
    const s = candidates[0]!;
    userId = s.user_id;

    if (undo) {
      const marked = db
        .from("daily_recommendations")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq(`reason_params->>${BACKFILL_MARKER}`, "true");
      const { count, error: countError } = await marked;
      if (countError) throw new Error(`count failed: ${countError.message}`);
      console.log(`พบแถวที่สร้างจากสคริปต์นี้ ${count ?? 0} แถว`);
      if (write && (count ?? 0) > 0) {
        const { error: delError } = await db
          .from("daily_recommendations")
          .delete()
          .eq("user_id", userId)
          .eq(`reason_params->>${BACKFILL_MARKER}`, "true");
        if (delError) throw new Error(`delete failed: ${delError.message}`);
        console.log("ลบแล้ว");
      } else if (!write) {
        console.log("ยังไม่ได้ลบอะไร (เพิ่ม --write เพื่อลบจริง)");
      }
      return;
    }

    settings = {
      departureTime: asLocalTime(s.departure_time),
      returnTime: asLocalTime(s.return_time),
      durationMinutes: s.analysis_duration_minutes,
      threshold: s.rain_threshold,
      commuteDays: s.commute_days,
      timeZone: s.timezone,
    };
    home ??=
      s.home_latitude !== null && s.home_longitude !== null
        ? { lat: s.home_latitude, lon: s.home_longitude }
        : null;
    work ??=
      s.work_latitude !== null && s.work_longitude !== null
        ? { lat: s.work_latitude, lon: s.work_longitude }
        : null;
  }

  if (!home || !work)
    throw new Error(
      "Both home and work locations are needed (set them in Settings, or pass --home and --work).",
    );

  const { from, to } = backfillRange(new Date(), months, settings.timeZone);
  if (db) {
    const { data, error } = await db
      .from("skipped_days")
      .select("date")
      .eq("user_id", userId)
      .gte("date", from)
      .lte("date", to);
    if (error) throw new Error(`skipped_days read failed: ${error.message}`);
    skipped = new Set(data.map((r) => r.date));
  }

  console.log(`ช่วงวันที่ ${from} ถึง ${to} (${months} เดือน)`);
  console.log("กำลังดึงสภาพอากาศย้อนหลังจาก Open-Meteo ...");
  const homeData = await fetchArchive(home.lat, home.lon, from, to);
  const workData = await fetchArchive(work.lat, work.lon, from, to);
  const homeRows = toDomainRows(homeData.rows, "home");
  const workRows = toDomainRows(workData.rows, "work");

  // Today: the archive has no rain for it yet, but the live forecast covers today's hours and
  // carries a real chance of rain, so today comes from there (and replaces any archive rows).
  const now = new Date();
  const today = localDateOf(now, settings.timeZone);
  for (const [place, rows, location] of [
    [home, homeRows, "home"],
    [work, workRows, "work"],
  ] as const) {
    try {
      const forecast = (
        await fetchForecast({ latitude: place.lat, longitude: place.lon })
      ).filter(
        (r) =>
          localDateOf(new Date(r.forecast_time), settings.timeZone) === today,
      );
      const todays = toDomainRows(forecast, location, {
        keepProvidedProbability: true,
      });
      const times = new Set(todays.map((r) => r.time.getTime()));
      rows.splice(
        0,
        rows.length,
        ...rows.filter((r) => !times.has(r.time.getTime())),
        ...todays,
      );
    } catch {
      console.log(
        `  (ดึงพยากรณ์ของวันนี้ที่${location === "home" ? "บ้าน" : "ที่ทำงาน"}ไม่ได้ จะข้ามวันนี้ถ้าข้อมูลไม่ครบ)`,
      );
    }
  }

  // Say exactly where the data is from, so it can be checked before anything is written.
  console.log(
    offline
      ? "พิกัดที่ใช้ (จากที่ระบุในคำสั่ง ไม่ใช่จากบัญชีของคุณ):"
      : "พิกัดที่ใช้ (อ่านจากการตั้งค่าของบัญชีคุณ):",
  );
  for (const [label, place, data] of [
    ["บ้าน", home, homeData],
    ["ที่ทำงาน", work, workData],
  ] as const) {
    const where = `${place.lat.toFixed(4)}, ${place.lon.toFixed(4)}`;
    const km = data.grid ? distanceKm(place, data.grid) : null;
    console.log(
      `  ${label}: ${where}` +
        (data.grid
          ? ` → จุดข้อมูลของ Open-Meteo ${data.grid.lat.toFixed(4)}, ${data.grid.lon.toFixed(4)} (ห่าง ${km!.toFixed(1)} กม.)`
          : ""),
    );
  }
  console.log(
    "  หมายเหตุ: เป็นข้อมูลแบบจำลองของจุดกริดที่ใกล้ที่สุด ไม่ใช่เครื่องวัดที่จุดนั้น",
  );

  const { records, commuteDays, incompleteDays } = planBackfill({
    from,
    to,
    settings,
    home: homeRows,
    work: workRows,
    skipped,
    now,
  });
  const count = (v: string) => records.filter((r) => r.vehicle === v).length;
  console.log(
    `วันเดินทางในช่วงนี้ ${commuteDays} วัน | ข้อมูลครบและสร้างได้ ${records.length} วัน | ข้ามเพราะข้อมูลไม่ครบ ${incompleteDays} วัน`,
  );
  console.log(
    `รถยนต์ ${count("car")} วัน | มอเตอร์ไซค์ ${count("motorcycle")} วัน`,
  );
  for (const r of records.slice(-5)) {
    console.log(
      `  ${r.recommendation_date}  ${r.vehicle.padEnd(10)} ไป ${r.departure_risk}%  กลับ ${r.return_risk}%`,
    );
  }

  if (!write) {
    console.log(
      "\nยังไม่ได้เขียนอะไรลงฐานข้อมูล (เพิ่ม --write เพื่อเขียนจริง)",
    );
    return;
  }
  if (!db)
    throw new Error(
      "--write needs the database (do not combine it with --home/--work only)",
    );

  let inserted = 0;
  for (let i = 0; i < records.length; i += 200) {
    const batch = records.slice(i, i + 200).map((r) => ({
      ...r,
      user_id: userId,
      reason_params: r.reason_params as never,
    }));
    const { data, error } = await db
      .from("daily_recommendations")
      .upsert(batch, {
        onConflict: "user_id,recommendation_date",
        ignoreDuplicates: true,
      })
      .select("id");
    if (error) throw new Error(`insert failed: ${error.message}`);
    inserted += data.length;
  }
  console.log(
    `\nเขียนแล้ว ${inserted} แถว (วันที่มีข้อมูลอยู่แล้ว ${records.length - inserted} วัน ถูกเว้นไว้ ไม่ทับ)`,
  );
  console.log("ลบทั้งหมดได้ด้วย: npm run backfill -- --undo --write");
}

main().catch((err) => {
  console.error(
    `\nผิดพลาด: ${err instanceof Error ? err.message : String(err)}`,
  );
  process.exit(1);
});
