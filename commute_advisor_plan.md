# Commute Advisor — Project Plan & Technical Specification

> Version: 2.0 (web rewrite; supersedes 1.1)
> Platform: Web app, installable as a PWA (Next.js)
> Hosting: Vercel (Hobby)
> Backend & database: Supabase (Postgres, Auth, pg_cron) — Free plan
> Weather provider: Open-Meteo (free API)
> Last updated: 2026-11-11 (visual direction changed to "Sky ambient")

### Changes from 1.1

- The Flutter iOS app is replaced by a **Next.js web app** that can be installed to the Home Screen as a PWA. It is mobile-first and also works on desktop.
- Data moves from on-device SQLite to **Supabase Postgres**, protected by Row Level Security (RLS). Sign-in is now required.
- Forecast refresh, recommendation locking and the morning notification now **run on the server on a schedule** (§13). The notification is built from a forecast fetched shortly before it is sent. This removes the main limitation of v1.1, where notification content was fixed when it was scheduled.
- Notifications use **Web Push**. On iPhone this requires adding the app to the Home Screen (iOS/iPadOS 16.4+).
- The free Apple ID 7-day expiry (v1.1 §14.2) no longer applies and is removed.
- The decision engine (§5) behaves exactly as before. It is ported to TypeScript as a pure module, and every v1.1 test case carries over.
- The v1.1 objective "no backend, no cloud database" is withdrawn. "Free tiers only, no paid API" remains.

---

## 1. Project Overview

Commute Advisor is a personal web app. It uses hourly weather forecasts for the user's commute to and from work to recommend whether to take a car or a motorcycle.

On a schedule, the server retrieves hourly forecasts for the user's home and workplace, evaluates rain risk for both commute windows, and stores forecasts and recommendation history in Supabase. Each commute-day morning it sends a Web Push notification. The installed app keeps showing the last data it loaded when the device is offline.

### Core objectives

- Recommend a vehicle based on forecast rain risk for both commute windows, at both locations.
- Show hourly weather details, including rain probability and precipitation.
- Send a push notification each commute-day morning, computed from a recent forecast.
- Store settings, forecasts and history in Supabase, with per-user access control (RLS).
- When offline, keep showing the last loaded data and clearly mark it as stale.
- Use free tiers only: Open-Meteo (non-commercial), Vercel Hobby, Supabase Free. Do not introduce a paid API or a paid plan.
- Ship a UI with a distinct, deliberate visual identity. It must not look like a template or like AI-generated output (§12).

### Usage scope

The app is built for one owner, for personal, non-commercial use. Vercel's Hobby plan requires this. Every table still carries `user_id`, so a few family members could be added later, but public sign-up is disabled (§14.3).

## 2. Initial App Configuration

| Setting | Initial value |
|---|---:|
| Departure time | 08:20 |
| Return time | 18:00 |
| Analysis duration | 60 minutes per trip |
| Rain probability threshold | 50% |
| Daily notification | 06:30 (arrives 06:30–06:40, §13.4) |
| Commute days | Monday–Friday (editable) |
| Analysis scope | Both departure and return |
| Forecast locations | Home + Workplace (both required) |
| Stale threshold | 6 hours since last successful fetch |
| Scheduler tick | Every 10 minutes (Supabase pg_cron) |
| Timezone | `Asia/Bangkok` |
| UI language | Thai + English (follows browser; overridable) |
| Date format | Thai: Buddhist Era (พ.ศ.); English: Gregorian. 24-hour time |
| Platform | Current Safari, Chrome, Edge, Firefox (last 2 versions). Push on iPhone needs iOS 16.4+ and Home Screen install |
| Weather API | Open-Meteo |
| Database | Supabase Postgres (region: Singapore, closest to Bangkok) |

The initial analysis windows are:

- Departure: 08:20–09:20
- Return: 18:00–19:00

All of these values except the scheduler tick must be editable in Settings.

## 3. Technology Stack

| Layer | Technology | Responsibility |
|---|---|---|
| Framework | Next.js 16 (App Router), latest stable patch | Pages, Server Actions, route handlers |
| Language | TypeScript (`strict`, `noUncheckedIndexedAccess`) | All application code |
| UI library | React 19 (as bundled with Next.js 16) | Components |
| Styling | Tailwind CSS v4 with CSS-variable design tokens | Styling. No prebuilt component theme |
| UI primitives | Radix UI primitives (headless) | Accessible dialog, switch, slider, segmented control |
| Database | Supabase Postgres | Persistent data |
| Auth | Supabase Auth, email OTP code, via `@supabase/ssr` | Sign-in and session cookies |
| Migrations | Supabase CLI (`supabase/migrations`) | Versioned SQL schema |
| DB types | `supabase gen types typescript` | Generated row types |
| Validation | Zod | API responses, Server Action input, env vars |
| Scheduler (primary) | Supabase `pg_cron` + `pg_net` | 10-minute tick calling the app |
| Scheduler (backup) | Vercel Cron, once a day | Backup run and Supabase keep-alive |
| Push | Web Push API + VAPID, `web-push` npm package | Morning notification |
| PWA / offline | Web App Manifest + Service Worker (Serwist, or a hand-written SW) | Install, app-shell cache, push handler |
| Offline snapshot | IndexedDB (`idb-keyval`) | Last dashboard data for offline display |
| Date / time | `date-fns` v4 + `@date-fns/tz`; `Intl.DateTimeFormat` | Timezone math; Buddhist Era via `th-TH-u-ca-buddhist` |
| Localization | `next-intl` (no locale prefix in URLs) | Thai / English messages |
| Charts | Custom SVG (optionally `d3-scale` for scales) | Rain-gauge chart |
| Animation | `@lottiefiles/dotlottie-react` | Hero illustration only |
| Font | IBM Plex Sans Thai via `next/font` | Self-hosted at build time |
| Testing | Vitest, Playwright, Supabase local stack | Unit, DB/RLS, E2E, visual |
| Hosting | Vercel Hobby | Deploys, previews, functions |

Pin package versions at implementation time and commit the lockfile. Keep Next.js on the latest patch, because Next.js now ships scheduled monthly security releases.

`next/font` downloads the font at build time and serves it from the app's own origin, so there is no runtime request to Google. The service worker precaches it, so the app still renders correctly offline.

Route handlers that send push or run jobs use the Node.js runtime, not the Edge runtime, because `web-push` needs Node crypto.

## 4. Weather API Specification

### 4.1 Forecast endpoint

`https://api.open-meteo.com/v1/forecast`

- No API key is required for the free non-commercial service.
- Use hourly forecast data.
- Set `timezone=Asia/Bangkok`.
- Fetch only the fields required by the app.
- Follow Open-Meteo's fair-use policy. Data is licensed CC BY 4.0, so show the attribution "Weather data by Open-Meteo.com" with a link in Settings → About.

### 4.2 Required hourly fields

| Field | Purpose |
|---|---|
| `temperature_2m` | Air temperature (instantaneous) |
| `relative_humidity_2m` | Relative humidity (instantaneous) |
| `precipitation_probability` | Probability of >0.1 mm precipitation in the **preceding hour** |
| `precipitation` | Total precipitation, **preceding hour** sum |
| `rain` | Rain, preceding hour sum |
| `showers` | Showers, preceding hour sum |
| `weather_code` | WMO weather condition code |
| `wind_speed_10m` | Wind speed (instantaneous) |

Re-verify the "preceding hour" semantics against the Open-Meteo docs at implementation time, and record the result in a code comment next to the window-mapping function.

### 4.3 Request template

One request per location, home and workplace:

```http
GET https://api.open-meteo.com/v1/forecast
  ?latitude={LATITUDE}
  &longitude={LONGITUDE}
  &hourly=temperature_2m,relative_humidity_2m,precipitation_probability,precipitation,rain,showers,weather_code,wind_speed_10m
  &forecast_days=3
  &timezone=Asia%2FBangkok
```

Open-Meteo accepts comma-separated multiple coordinates in one request. Using that is an allowed optimisation, but the parser must then handle the array response shape.

### 4.4 Geocoding endpoint

`https://geocoding-api.open-meteo.com/v1/search?name={QUERY}&count=10&language={th|en}`

This endpoint is used only in Settings and Onboarding for place-name search. Debounce input by 400 ms, and do not call it with fewer than 2 characters.

### 4.5 Where requests run

- Forecast requests run **only on the server**: in the scheduled tick (§13.1) and in the manual-refresh Server Action. Browsers never call the forecast endpoint directly.
- Geocoding goes through the authenticated route handler `/api/geocode`. The handler validates the response with Zod and sets `language` from the current locale. The debounce rule in §4.4 still applies on the client.

### 4.6 API handling requirements

- Use `fetch` with `AbortSignal.timeout(15000)`. `fetch` has no separate connect timeout.
- Validate every response with a Zod schema. Handle HTTP errors, malformed JSON, missing fields and null values.
- Record `fetched_at` separately from each forecast's `forecast_time`.
- Store instants as `timestamptz`, which holds UTC. Store local calendar dates as `date` and local clock times as `time`. Convert to `Asia/Bangkok` for commute-window calculations and display.
- **Refresh policy** (server):
  - Scheduled refresh for each location every 60 minutes between 05:00 and 20:00 local time, and every 3 hours outside that range.
  - A forced pre-notification refresh 20–30 minutes before the user's notification time (§13.2).
  - Manual refresh from the UI.
  - Skip any refresh if the last successful fetch for that location is less than 15 minutes old. This rule covers scheduled and manual refreshes alike.
- Each location syncs independently. If one location fails, the other's data is still saved, and the windows that depend on the failed location become `unknown` unless valid cached data for it exists.
- Never treat a cached forecast as current without showing its fetch time.
- **Rate-limit risk.** Vercel functions send requests from shared IP addresses, which Open-Meteo may rate-limit. Handle HTTP 429 with exponential backoff (at most 3 attempts per tick) and record it in `forecast_sync_logs`. If 429s keep occurring, move the forecast fetch into a Supabase Edge Function, which has different egress, and record the change in the Decision Log.

## 5. Commute Decision Engine

The decision engine must be deterministic, independently testable, and separate from UI code. It is a pure function of: forecasts for both locations, settings, the target date, and "now".

It is implemented as a pure TypeScript module (`src/features/commute/domain`) with no imports from Next.js, React, Supabase or browser APIs. The same code runs in the scheduled job, in Server Actions and in tests. Its behaviour is unchanged from v1.1.

### 5.1 Hour-bucket mapping

Open-Meteo labels each precipitation hour by its **end** time. The bucket labelled `T` covers the interval `(T − 1h, T]`.

For a commute window `[start, end)`, where `end = start + duration`, include every bucket `T` whose interval overlaps the window:

```text
include bucket T  ⇔  (T − 1h) < end  AND  T > start
```

| Window | Buckets used (labels) | Meaning |
|---|---|---|
| 08:20–09:20 | 09:00, 10:00 | 08–09 and 09–10 |
| 18:00–19:00 | 19:00 | 18–19 only |
| 07:00–07:30 | 08:00 | 07–08 |

These three rows are mandatory unit-test cases. The app does not imply minute-level precision.

### 5.2 Per-trip risk

For each trip, departure or return:

1. Select the buckets defined in §5.1 for **home** and for **workplace**.
2. The trip is **complete** only if every selected bucket exists at both locations and has a non-null `precipitation_probability`.
3. `tripRisk = max(precipitation_probability)` across all selected buckets at both locations.
4. `tripRainMm = max(homeSum, workSum)`, where each sum is the total `precipitation` of the selected buckets at that location. If any value is null, the sum is null. Null is never treated as 0.
5. Record which location produced `tripRisk`. The explanation text uses it.

### 5.3 Primary rule

```ts
export function decide(dep: TripAnalysis, ret: TripAnalysis, threshold: number): Vehicle {
  const depHigh = dep.isComplete && dep.risk !== null && dep.risk >= threshold;
  const retHigh = ret.isComplete && ret.risk !== null && ret.risk >= threshold;
  if (depHigh || retHigh) return 'car';                       // any known high risk wins
  if (!dep.isComplete || !ret.isComplete) return 'unknown';
  return 'motorcycle';                                        // both complete and below threshold
}
```

- If either trip has complete data and is at or above the threshold, recommend **car**, even if the other trip is incomplete. The explanation names the trip that triggered it.
- If both trips are complete and below the threshold, recommend **motorcycle**.
- Any other case is **unknown**. Missing data is never converted into a confident motorcycle recommendation.

### 5.4 Risk labels

Labels are fixed bands. They are independent of the configurable threshold.

| Probability | Enum | TH label | EN label |
|---:|---|---|---|
| 0–19% | `veryLow` | ต่ำมาก | Very low |
| 20–49% | `low` | ต่ำถึงปานกลาง | Low to moderate |
| 50–69% | `high` | สูง | High |
| 70–100% | `veryHigh` | สูงมาก | Very high |
| — | `unknown` | ไม่มีข้อมูล | No data |

If the user sets a threshold other than 50%, a label can disagree with the recommendation. For example, with a 40% threshold, 45% is labelled "Low to moderate" but the app recommends a car. In that case the explanation must state the threshold explicitly: "ขากลับ 45% ซึ่งเกินเกณฑ์ที่ตั้งไว้ 40%".

Never describe any forecast as "rain will definitely not happen".

### 5.5 Freshness

| Status | Condition |
|---|---|
| `fresh` | Last successful fetch for **both** locations ≤ 6 h ago |
| `stale` | Either location's last successful fetch > 6 h ago |
| `none` | No forecast data ever fetched for a location |

A stale result still shows the computed vehicle, but the UI marks it as stale with its fetch time (§11.4), and the notification text includes the fetch time.

### 5.6 Target date selection

The Dashboard and analysis target the **next relevant commute day**:

- If today is a commute day, is not skipped, and now is before the end of today's return window, the target is today.
- Otherwise the target is the next commute day that is not skipped. Forecast covers 3 days. A target day beyond the forecast horizon shows "ยังไม่มีพยากรณ์" with the date.

### 5.7 Recommendation locking

- When the departure window starts (e.g. 08:20) on a commute day, that day's recommendation is **locked**: `vehicle`, `departure_risk`, `return_risk` and `reason` are frozen and `locked_at` is set.
- If no recommendation exists at lock time, the first analysis after that moment creates the record and locks it immediately.
- The scheduled tick (§13.1) performs the lock. If a tick was missed, any server-side read after the departure start locks the record lazily. Locking is idempotent, and a database trigger enforces that frozen columns cannot change (§6.3).
- After locking, the return card on the Dashboard keeps updating from fresh forecasts. The live value is stored in `return_risk_latest`. If the locked vehicle is motorcycle and the live return risk reaches the threshold, show a warning: "ขากลับเสี่ยงฝนสูงขึ้นเป็น 70% — เตรียมชุดกันฝน".
- A settings change recomputes only unlocked days.
- History shows the locked snapshot, plus the latest return risk when it differs.

### 5.8 Additional risk signals

Precipitation amount, weather code, and wind speed are shown as supporting context only. Do not mix them into the primary rule until explicit thresholds and tests are defined.

Future enhancement: configurable heavy-rain and strong-wind safety overrides.

### 5.9 Recommendation output

Each daily result includes:

- The recommended vehicle: `car`, `motorcycle`, or `unknown`.
- Departure and return risk, plus the location that produced each risk.
- Expected precipitation for each window, when available.
- An explanation (§11.6 copy rules).
- Forecast fetch time and freshness status.
- Data completeness status.
- Lock status.

## 6. Database Design (Supabase Postgres)

### 6.0 Rules for every table

- Every table has `user_id uuid not null references auth.users(id) on delete cascade`. Deleting the account deletes all of the user's data.
- RLS is enabled on every table. Policies require `user_id = (select auth.uid())` and exist for exactly the operations the app performs with the user-scoped client (least privilege): e.g. `notification_logs` is read-only for users and `settings` is never deleted directly. Grants are explicit, `anon` has none, and `job_runs` is closed to every API role.
- The browser and Server Components use the user-scoped client (the anon/publishable key plus the session cookie), so RLS always applies.
- Only the job routes under `/api/jobs/*` use the service-role (secret) key, from a module marked `import 'server-only'`. That key is never exposed to the browser.
- Any operation that needs more than one statement in a transaction is written as a Postgres function and called with `supabase.rpc(...)`. The Supabase JS client cannot run multi-statement transactions.
- Coordinates are rounded to 3 decimal places (about 100 m) before they are stored. Open-Meteo's grid is coarser than that, so the forecast is unaffected, and less precise home and work positions are stored.

### 6.1 `settings` (one row per user)

| Column | Type | Notes |
|---|---|---|
| `user_id` | uuid | Primary key |
| `home_latitude` | double precision, null | Range −90..90 |
| `home_longitude` | double precision, null | Range −180..180 |
| `home_name` | text, null | User-facing name |
| `work_latitude` | double precision, null | |
| `work_longitude` | double precision, null | |
| `work_name` | text, null | |
| `departure_time` | time | default `08:20` |
| `return_time` | time | default `18:00` |
| `analysis_duration_minutes` | smallint | default `60`, check 15–180 |
| `rain_threshold` | smallint | default `50`, check 10–90 |
| `notification_time` | time | default `06:30` |
| `notifications_enabled` | boolean | default `false` until a push subscription exists |
| `commute_days` | smallint | Bitmask Mon=1, Tue=2, Wed=4 … Sun=64. Default `31` (Mon–Fri); check 0–127 |
| `timezone` | text | default `Asia/Bangkok` (fixed in v2.0, stored for future use) |
| `locale` | text, null | `th` / `en`; null = follow browser |
| `onboarding_completed` | boolean | default `false` |
| `updated_at` | timestamptz | default `now()` |

A check constraint requires each location's latitude and longitude to be both null or both set. A trigger on `auth.users` insert creates the default settings row.

### 6.2 `hourly_forecasts`

| Column | Type | Notes |
|---|---|---|
| `id` | bigint identity | Primary key |
| `user_id` | uuid | |
| `location_key` | text | check in (`home`, `work`) |
| `latitude` | double precision | The coordinates actually fetched |
| `longitude` | double precision | |
| `forecast_time` | timestamptz | Bucket label time |
| `temperature` | real, null | °C |
| `humidity` | smallint, null | % |
| `precipitation_probability` | smallint, null | % |
| `precipitation` | real, null | mm |
| `rain` | real, null | mm |
| `showers` | real, null | mm |
| `weather_code` | smallint, null | WMO code |
| `wind_speed` | real, null | km/h |
| `fetched_at` | timestamptz | |

- Unique constraint on `(user_id, location_key, forecast_time)`. The constraint's index also serves queries. Refreshes upsert with `on conflict`.
- Changing a location goes through the function `update_location(key, lat, lon, name)`. In one transaction it rounds the coordinates, updates `settings`, and deletes that `location_key`'s forecast rows, so old-location data never mixes with new.

### 6.3 `daily_recommendations`

| Column | Type | Notes |
|---|---|---|
| `id` | bigint identity | Primary key |
| `user_id` | uuid | |
| `recommendation_date` | date | Local date; unique with `user_id` |
| `vehicle` | text | check in (`car`, `motorcycle`, `unknown`) |
| `departure_risk` | smallint, null | |
| `return_risk` | smallint, null | Value at lock or last computation |
| `return_risk_latest` | smallint, null | Live value after lock (§5.7) |
| `departure_risk_source` | text, null | `home` / `work` |
| `return_risk_source` | text, null | `home` / `work` |
| `departure_rain_mm` | real, null | |
| `return_rain_mm` | real, null | |
| `reason_code` | text | e.g. `returnHigh` |
| `reason_params` | jsonb | e.g. `{"risk":70,"source":"work","threshold":50}` |
| `data_complete` | boolean | |
| `forecast_fetched_at` | timestamptz, null | Older of the two locations' fetch times |
| `locked_at` | timestamptz, null | |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

- There is one row per user per date (upsert).
- **The lock invariant is enforced in the schema.** A `before update` trigger rejects any change to the frozen columns (`vehicle`, `departure_*`, `return_risk`, `return_risk_source`, `return_rain_mm`, `reason_*`, `data_complete`, `locked_at`) when `old.locked_at is not null`. Only `return_risk_latest` and `updated_at` may change.
- The reason is stored as a code plus params and rendered in the current locale. Do not store a pre-rendered sentence, because the user can switch language.

### 6.4 `skipped_days`

| Column | Type | Notes |
|---|---|---|
| `id` | bigint identity | Primary key |
| `user_id` | uuid | |
| `date` | date | Unique with `user_id` |
| `created_at` | timestamptz | |

### 6.5 `push_subscriptions` (new)

| Column | Type | Notes |
|---|---|---|
| `id` | bigint identity | Primary key |
| `user_id` | uuid | |
| `endpoint` | text | Unique |
| `p256dh` | text | Subscription key |
| `auth` | text | Subscription secret |
| `user_agent` | text, null | Shown in Settings as the device name |
| `created_at` | timestamptz | |
| `last_success_at` | timestamptz, null | |
| `failure_count` | smallint | default 0 |

A user can have several subscriptions (iPhone, laptop). A subscription is deleted when the push service answers 404 or 410.

### 6.6 `notification_logs`

| Column | Type | Notes |
|---|---|---|
| `id` | bigint identity | Primary key |
| `user_id` | uuid | |
| `recommendation_id` | bigint, null | FK; null for generic notifications |
| `target_date` | date | Unique with `user_id` |
| `kind` | text | `recommendation` / `stale` / `generic` |
| `status` | text | `sending` / `sent` / `failed` |
| `devices_sent` | smallint | Number of subscriptions that accepted the push |
| `sent_at` | timestamptz, null | |
| `error_message` | text, null | |
| `created_at` | timestamptz | |

The unique `(user_id, target_date)` constraint guarantees at most one morning notification per day. A tick first claims the day by inserting a `sending` row with `on conflict do nothing`, and sends only if the insert succeeded (§13.1). A `sent` status means the push service accepted the message, not that the device displayed it.

### 6.7 `forecast_sync_logs`

| Column | Type | Notes |
|---|---|---|
| `id` | bigint identity | Primary key |
| `user_id` | uuid | |
| `location_key` | text | |
| `trigger` | text | `scheduled` / `pre_notification` / `manual` |
| `status` | text | `success` / `failed` / `skipped` |
| `response_code` | smallint, null | |
| `records_count` | integer | |
| `error_message` | text, null | |
| `fetched_at` | timestamptz | |

### 6.8 `job_runs` (new, no `user_id`)

| Column | Type | Notes |
|---|---|---|
| `id` | bigint identity | Primary key |
| `job` | text | `tick` / `daily` |
| `started_at` | timestamptz | |
| `finished_at` | timestamptz, null | |
| `status` | text | `ok` / `error` |
| `details` | jsonb | Users processed, refreshes, pushes, errors |

This table is not user data. RLS denies all access to the anon and authenticated roles. Settings → About reads only the latest successful run time, through a `security definer` function.

### 6.9 Database requirements

- A forecast batch and its sync log are saved together by the function `save_forecast_batch(p_user_id, p_location_key, p_latitude, p_longitude, p_fetched_at, p_rows jsonb, p_log jsonb)`. It takes the user, coordinates and fetch time explicitly because jobs call it with the service role. It is `SECURITY INVOKER`, so a signed-in caller can only write their own rows, and it refuses a batch whose coordinates no longer match the configured location (`location_changed`). An empty `p_rows` writes only the log, which is how a failed or skipped sync is recorded.
- If the API response is invalid, do not call the function. Valid cached data is never overwritten.
- **Retention** is a pg_cron SQL job that runs daily at 03:00 Asia/Bangkok. pg_cron uses UTC, so the schedule is `0 20 * * *`.
  - `hourly_forecasts`, `forecast_sync_logs`, `notification_logs`, `job_runs`: delete rows older than 14 days.
  - `daily_recommendations` and `skipped_days`: keep forever (~250 rows per user per year).
- Migrations live in `supabase/migrations`, are tested against the local stack, and are applied to staging and then production with `supabase db push`.
- Keep instants (`timestamptz`) and local dates and times (`date`, `time`) distinct in the schema and in TypeScript (§7).
- Expected size is a few MB at most, far below the Free plan's 500 MB.

## 7. Domain Types

```ts
export type Vehicle = 'car' | 'motorcycle' | 'unknown';
export type RainRiskLevel = 'veryLow' | 'low' | 'high' | 'veryHigh' | 'unknown';
export type CommuteType = 'departure' | 'return';
export type LocationKey = 'home' | 'work';
export type DataFreshness = 'fresh' | 'stale' | 'none';

// Branded types keep instants and local calendar values apart.
export type LocalDate = string & { readonly __brand: 'LocalDate' }; // yyyy-MM-dd
export type LocalTime = string & { readonly __brand: 'LocalTime' }; // HH:mm
export type Instant = Date;                                          // always UTC-based
```

Domain models:

- `HourlyWeather`: `time`, `location`, `temperature`, `humidity`, `precipitationProbability`, `precipitation`, `rain`, `showers`, `weatherCode`, `windSpeed`
- `CommuteWindow`: `type`, `start` (local), `end` (local), `bucketTimes`
- `TripAnalysis`: `window`, `risk`, `riskSource`, `rainMm`, `riskLevel`, `isComplete`, `missingBuckets`
- `DailyRecommendation`: `date`, `vehicle`, `departure`, `returnTrip`, `reason`, `forecastFetchedAt`, `freshness`, `lockedAt`, `returnRiskLatest`
- `CommuteSchedule`: `commuteDays`, `skippedDays`, `nextCommuteDay(now)`

Keep the Open-Meteo DTOs (Zod schemas), the domain types, and the generated database row types separate. Mapping between them happens only in the `data/` layer of each feature.

## 8. Architecture and Responsibilities

### 8.1 System overview

```text
Browser / installed PWA
  ├─ React Server Components (reads)  ─┐
  ├─ Server Actions (writes)           ├─> Next.js on Vercel ──> Supabase Postgres (RLS)
  ├─ Client Components (interaction)   │        │                        ^
  └─ Service Worker (cache, push)  <───┼────────┼── Web Push services    │
                                       │        └──> Open-Meteo          │
pg_cron (every 10 min) ── pg_net ──> POST /api/jobs/tick ────────────────┘
Vercel Cron (once a day) ─────────> GET  /api/jobs/daily  (backup + keep-alive)
```

### 8.2 Data access modules

| Module | Responsibility |
|---|---|
| `settingsRepo` | Read/write settings; `update_location` RPC |
| `forecastRepo` | Query hourly forecasts; `save_forecast_batch` RPC |
| `recommendationRepo` | Upsert and read daily recommendations |
| `skipDayRepo` | Skip and unskip days |
| `pushSubscriptionRepo` | Save, list and prune push subscriptions |
| `notificationLogRepo` | Claim a day, record the send result |
| `jobRunRepo` | Record scheduler runs |

Each repo takes a Supabase client as a parameter. Pass the user-scoped client from pages and actions, and the service-role client from jobs. Repos contain no business rules.

### 8.3 Services

| Module | Responsibility |
|---|---|
| `openMeteoClient` | Forecast requests, Zod parsing, 429 backoff |
| `geocodingClient` | Place-name search |
| `commuteWindowMapper` | §5.1 bucket mapping (pure) |
| `commuteAnalyzer` | §5.2–5.4 analysis and decision (pure) |
| `commuteSchedule` | Commute days, skip days, target date §5.6 (pure) |
| `freshness` | §5.5 (pure) |
| `forecastSyncService` | Fetch both locations, apply the refresh policy, persist, log |
| `recommendationService` | Analyse, lock (§5.7), persist, recompute unlocked days after settings change |
| `notificationService` | Decide whether a notification is due, build the payload (§11.8), send, prune subscriptions |
| `tickService` | Orchestrate one scheduler tick for all users (§13.1) |
| `thaiDate` | Buddhist Era formatting through `Intl.DateTimeFormat('th-TH-u-ca-buddhist')` |
| `clock` | Injectable `now` |

Pure modules take every input as a parameter, including `now: Date`, and never call `Date.now()` or `new Date()` themselves.

## 9. Rendering and Data Flow

This section replaces the Riverpod provider tree of v1.1.

- **Reads.** Dashboard, Weather and History are Server Components. They read through the user-scoped client and render complete data on first paint, so there is no spinner-only screen. Personal pages are dynamic and never statically cached.
- **Writes.** Settings changes, skip/unskip, manual refresh and push subscription are Server Actions. Each validates its input with Zod, writes, recomputes the recommendation for unlocked days when relevant, and calls `revalidatePath`.
- **Interaction.** The chart tooltip, time inputs, threshold slider preview, pull-to-refresh, location search and the push toggle are Client Components. Keep them small and keep business rules out of them.
- **Optimistic UI.** Skip/unskip uses `useOptimistic`, so the undo snackbar responds instantly.
- **Offline snapshot.** After each successful Dashboard render, a small client component stores a JSON snapshot in IndexedDB: the recommendation, both trips, the target day's hourly rows, and `fetched_at`. When the device is offline, the service worker serves the cached app shell and the Dashboard renders from the snapshot with the offline banner (§11.4).
- **Clock.** Server code passes `new Date()` into services at the boundary. Tests pass a fixed time.

## 10. App Screens and Navigation

### 10.1 Routes

| Route | Screen / purpose |
|---|---|
| `/login` | Email OTP sign-in |
| `/onboarding` | 3-step onboarding (first sign-in only) |
| `/` | Dashboard |
| `/weather` | Hourly Weather |
| `/history` | Recommendation History |
| `/history/[date]` | Day detail. An intercepting route shows it as a sheet over the list. A direct visit shows a full page |
| `/settings` | Settings |
| `/settings/location/[key]` | Location picker (`home` / `work`) |
| `/settings/about` | About, Open-Meteo attribution, system health |
| `/api/geocode` | GET, signed-in users only |
| `/api/jobs/tick` | POST, called by pg_cron, protected by `JOB_SECRET` |
| `/api/jobs/daily` | GET, called by Vercel Cron, protected by `CRON_SECRET` |
| `/manifest.webmanifest`, `/sw.js` | PWA |

URLs carry no locale prefix. The locale comes from `settings.locale`, then from a cookie, then from `Accept-Language`.

### 10.2 Navigation and guards

- Mobile (< 1024 px): a **bottom tab bar with 4 tabs** (หน้าหลัก / อากาศ / ประวัติ / ตั้งค่า). In standalone PWA mode, pad it with `env(safe-area-inset-bottom)`.
- Desktop (≥ 1024 px): the same 4 destinations in a left rail (§11.12).
- The tabs live in a shared layout, so it persists across navigation. Restore each tab's scroll position when returning to it.
- `proxy.ts` (the Next.js 16 name for middleware) refreshes the Supabase session and redirects signed-out users to `/login`. The `(app)` layout redirects to `/onboarding` when `onboarding_completed` is false. Security-relevant checks are repeated in each Server Action and route handler, not only in the proxy.

## 11. UI/UX Specification

### 11.1 Design system foundation

- A custom token system in CSS variables (`src/styles/tokens.css`), exposed to Tailwind v4 through `@theme`. The palette is derived from a **sky-blue seed** and then hand-tuned (§12.3). Do not ship Tailwind's default palette or an unmodified shadcn/ui theme.
- Light and dark themes follow `prefers-color-scheme`.
- Font: **IBM Plex Sans Thai** for all text, through `next/font`. Use `font-variant-numeric: tabular-nums` for every number that updates or aligns (percentages, times).
- All tokens (color, type scale, spacing, radius, motion durations) live in `tokens.css`. Components never hard-code values.
- Size text in `rem`. The layout must work with browser text size and zoom up to 200% without clipping or horizontal scrolling. Test Thai text at large sizes, because Thai ascenders and descenders need extra line height (≥ 1.4).

### 11.2 Dashboard (`/`)

The page sits on a full-screen **sky backdrop** whose colour follows the verdict (§12.1). Content is laid out top to bottom on mobile and as a 12-column grid on desktop (§11.12):

1. **Header** (on the sky): target date (e.g. "พุธ 11 พ.ย. 2569", or "พรุ่งนี้ · พฤหัส 5 พ.ย." when the target is not today), the route "ลาดพร้าว → สีลม", and a frosted refresh button (plus pull-to-refresh in the installed PWA).
2. **Status banner** (conditional, §11.4).
3. **Hero** (directly on the sky, no card): a small verdict chip with the vehicle icon, the verdict in large type ("เอารถยนต์ไป"), a one-line reason ("ขากลับเสี่ยงฝน 70% ที่ทำงาน"), and a weather scene illustration (rain cloud / sun and cloud / mist).
4. **Trips card** (glass): departure and return side by side, separated by a dashed divider. Each shows the time window, risk % in large tabular figures, a meter with the threshold tick, the risk label with icon, precipitation in mm, and which location drove the risk. The card footer holds "อัปเดต 06:12" and the "ข้ามวันนี้" (skip today) action, with an undo snackbar.
5. **Hourly chart card** (glass): today's hourly rain probability with a segmented control สูงสุด / บ้าน / ที่ทำงาน, commute-window bands and the threshold line. On narrow screens the chart scrolls horizontally instead of shrinking its text.
6. **Now at each location** (two glass cards): temperature, condition, rain %, humidity and wind for บ้าน and ที่ทำงาน, taken from the stored hourly forecast nearest to now (no extra API call), labelled as forecast values.
7. **Next commute days** (glass): the next commute days within the 3-day forecast, each with its vehicle and both trip risks. A day beyond the horizon shows "ยังไม่มีพยากรณ์".
8. **This week** (glass): Mon–Fri cells showing the locked vehicle for past days, today highlighted, and the forecast max risk for future days, plus car / motorcycle / pending counts.

Hero states:

| State | Hero |
|---|---|
| Car | Rain-cloud scene; overcast sky with fine rain streaks |
| Motorcycle | Sun-and-cloud scene; clear morning sky |
| Unknown | Mist scene in neutral grey sky, with text explaining what is missing |
| Locked + return warning | Verdict unchanged; inline warning strip in the trips card |
| Skipped day | Calm state "วันนี้ข้ามแล้ว", with a button to undo, and a preview of the next commute day |
| No locations yet | Not reachable (onboarding), but render a fallback CTA to Settings |

### 11.3 Weather screen (`/weather`)

- Segmented control: **บ้าน | ที่ทำงาน**.
- Day selector: วันนี้ / พรุ่งนี้ / day 3.
- A **bar chart** of hourly precipitation probability, drawn as custom SVG. The commute windows are drawn as shaded bands labelled ขาไป / ขากลับ, and a dashed horizontal line marks the threshold.
- Below the chart, an hourly list with time, condition icon, %, mm, temperature and wind. Rows inside a commute window are visually grouped.
- Show the fetch time at the bottom.

### 11.4 Abnormal states

| Situation | Treatment |
|---|---|
| Stale (>6 h) | Amber banner at top: "ข้อมูลเมื่อ 21:10 เมื่อวาน · แตะเพื่ออัปเดต". The Hero is rendered at reduced emphasis (desaturated, ~60% opacity on the illustration). |
| Offline | The same banner with "ออฟไลน์". Cached data stays visible. |
| Sync failed | Banner with a short reason and a retry action. The cached result stays. |
| Unknown | Grey "?" hero. The trip card shows which buckets are missing. |
| Loading (first) | Skeleton matching the final layout. No spinner-only screens. |
| Notifications denied | Inline note in Settings explaining how to re-enable notifications for the site or Home Screen app. A web page cannot deep-link to system settings. |
| Push unavailable (iPhone Safari tab, app not installed) | Settings shows short Add to Home Screen steps in place of the toggle (§13.4). |
| Session expired | Redirect to `/login`, then return to the same page after sign-in. |
| Scheduler unhealthy | If the last successful tick is more than 1 h old, Settings → About shows "ระบบอัปเดตอัตโนมัติหยุดทำงานตั้งแต่ 05:40" (§13.5). |

### 11.5 History (`/history`)

- Month switcher (◀ พฤศจิกายน 2569 ▶).
- Summary: counts of car / motorcycle / unknown days, plus a proportional bar.
- A list of days, newest first. Each row shows the date, vehicle icon, and departure / return %. Skipped days appear as a muted row. Tapping a row opens the day detail, with the reason, lock time, fetch time, and latest return risk if it changed.
- Empty month: a short, specific message. No generic illustration.

### 11.6 Settings (`/settings`)

A grouped list (iOS Settings style on mobile, two columns on desktop):

1. **ตำแหน่ง** (Locations): บ้าน ›, ที่ทำงาน ›. The picker offers place search (Open-Meteo Geocoding), "ใช้ตำแหน่งปัจจุบัน", and manual lat/lon entry.
2. **การเดินทาง** (Commute): ขาไป (native `<input type="time">`, which shows the iOS wheel), ขากลับ, ระยะเวลา (15–180 min), วันเดินทาง (weekday chips).
3. **การวิเคราะห์** (Analysis): rain threshold slider (10–90%, step 5) with live preview text "ถ้าโอกาสฝน ≥ 50% จะแนะนำรถยนต์".
4. **แจ้งเตือน** (Notifications): toggle plus time. The permission request happens on the first toggle-on, inside the click handler, because browsers require a user gesture. Show the expected arrival window, "ประมาณ 06:30–06:40" (§13.4).
5. **ทั่วไป** (General): ภาษา (system / ไทย / English), About (attribution and system health).
6. **บัญชี** (Account): email, sign out, and "ลบข้อมูลทั้งหมดของฉัน" (delete all my data) with a confirmation step.

### 11.7 Onboarding (3 steps, skippable)

1. **ตำแหน่ง**: set home and workplace (same picker as Settings).
2. **การเดินทาง**: departure / return times and days, prefilled with the defaults.
3. **แจ้งเตือน**: explain what the 06:30 notification contains. On iPhone, if the app is not installed to the Home Screen, show the install steps first, because push is unavailable in a Safari tab. Then request permission. Declining is a valid path.

Skipping step 1 leaves the Dashboard on the fallback CTA.

### 11.8 Copy rules (Thai and English)

- Be specific, not generic. Use "ขากลับเสี่ยงฝน 70% ที่ทำงาน (18:00–19:00)", not "อาจมีฝนตก".
- Do not use filler greetings ("สวัสดี! 👋", "Welcome back!"), exclamation marks, or emoji in UI text.
- Always state uncertainty honestly. Use "โอกาสฝน", never "ฝนจะไม่ตก".
- Keep the Thai and English text equivalent in meaning, not word-for-word.
- Notification format (TH):
  - Fresh: `แนะนำรถยนต์ · ขากลับเสี่ยงฝน 70%`
  - Stale: `แนะนำรถยนต์ (ข้อมูล 21:10 เมื่อวาน) · เปิดแอปเพื่ออัปเดต`
  - Generic: `เปิดแอปเพื่อดูคำแนะนำการเดินทางวันนี้`

### 11.9 Motion

- Pull-to-refresh in the installed PWA.
- Percentages count up when values change (≤ 400 ms).
- The Hero cross-fades when the verdict changes.
- No haptics. The Vibration API is not available in iOS Safari, so do not imitate it.
- With `prefers-reduced-motion: reduce`, disable count-up, cross-fade and Lottie playback, and show the static first frame.
- Do not use parallax or decorative looping motion outside the Hero. The Lottie player is lazy-loaded so it does not delay the first render.

### 11.10 Accessibility

- Every risk color is paired with a label and an icon. Color is never the only signal.
- Contrast is at least WCAG 2.2 AA, including the amber/yellow tokens in both themes (yellow surfaces use dark text).
- Charts are `role="img"` with a text summary, e.g. "โอกาสฝนสูงสุดช่วงขากลับ 70 เปอร์เซ็นต์". The hourly list below the chart is the accessible data table.
- Touch targets are at least 44×44 CSS px.
- Everything is reachable by keyboard, with a visible focus ring that matches the palette. Test with VoiceOver (iOS, macOS) and NVDA or TalkBack.

### 11.11 App icon and manifest

- A simple custom mark: a rain cloud combined with a wheel, on the sky-blue palette. It must not be a stock clip-art glyph (§12).
- Ship 192 px and 512 px PNGs, a maskable 512 px variant, a 180 px `apple-touch-icon`, and an SVG favicon.
- The manifest sets `display: "standalone"`, `start_url: "/"`, a Thai `name` and `short_name`, and `theme_color`/`background_color` taken from the tokens.

### 11.12 Responsive layout

| Width | Layout |
|---|---|
| < 640 px | Single column: hero, trips card, chart card (horizontally scrollable chart), the two location cards, next days, this week. Floating glass tab bar at the bottom |
| 640–1023 px | Single column with a wider max width; the two location cards sit side by side. Floating glass tab bar |
| ≥ 1024 px | Floating glass rail on the left. A 12-column grid, max width 1240 px: row 1 hero (7) + trips card (5); row 2 hourly chart (8) + the two location cards stacked (4); row 3 next commute days (6) + this week (6). The screen is filled with useful data, not a stretched phone column |

## 12. Visual Identity & Anti-Generic Design Rules

> **Requirement:** The UI must not look templated, repetitive, or recognisably AI-generated. This section is **binding**. Treat a violation as a defect, not a style preference.

### 12.1 Design concept: "Sky ambient"

The app gives one decision each morning. The visual language is a **living sky**: the whole background reflects today's verdict, and the data sits on frosted-glass cards above it. It should feel calm, modern and immediately readable.

- The sky backdrop changes with the verdict: overcast slate with fine rain streaks for car, a clear morning sky warming toward the horizon for motorcycle, and a misty grey for unknown. Dark mode uses night-sky equivalents.
- The hero sits directly on the sky, not in a card: chip, very large verdict, reason, and a weather scene illustration.
- Data lives on **frosted-glass cards** (translucent surface, background blur, hairline light border, soft shadow).
- Numbers are the protagonists: risk % in large tabular figures.
- The two trips stay together in one card with a dashed divider, so they read as one journey.

The concept was approved from an HTML preview on 2026-11-11 (supersedes the "morning departure board" concept).

### 12.2 Do not ship (anti-patterns)

| Anti-pattern | Why it reads as generic/AI | Instead |
|---|---|---|
| Default Tailwind palette, an unmodified shadcn/ui theme, or Material purple | Instantly recognisable template | Hand-tuned sky and risk palette (§12.3) |
| Decorative gradients with no meaning (purple-to-blue, glow blobs) | AI landing-page cliché | The only gradient is the sky backdrop, and it encodes the verdict. No purple, no glow blobs |
| Glass on everything, including text on low-contrast glass | Unreadable, trendy for its own sake | Glass only for data cards and navigation; every text pair meets AA on the composited card colour; solid fallback when `backdrop-filter` is unsupported or reduced transparency is requested |
| Emoji as icons | Low-craft placeholder look | Material Symbols, one weight |
| Centered everything, equal spacing everywhere | No rhythm | Left-aligned type, a deliberate spacing scale with contrasting gaps |
| Stock illustrations in mismatched styles | Clip-art feel | One coherent set of weather scenes in the palette |
| Generic copy ("Stay safe!", "Have a great day! ☀️") | Chatbot voice | Specific, data-bearing copy (§11.8) |
| Spinner-only loading screens | Unfinished feel | Layout-matching glass skeletons |
| Every icon in a tinted circle | Template tic | Icons sit inline with text; tinted badges only where they encode the vehicle |
| Desktop as a stretched phone column | Empty, unfinished | The 12-column grid in §11.12 |

### 12.3 Color

- Sky backdrops: one gradient per verdict state (car, motorcycle, unknown) per theme. Text placed directly on the sky uses a per-state "hero ink" that meets AA against the darkest part of the sky behind it.
- Glass cards: a translucent surface (light: white at about 70%, dark: deep navy at about 60%) with blur. Contrast is checked against the card colour composited over the darkest sky.
- Risk colors: custom green → amber → orange → red, tuned for both glass surfaces. Unknown is a cool grey.
- Verdict colors (car blue, motorcycle teal) are distinct from the risk colors, so "car" is not read as "danger".
- Every token is defined for both themes and contrast-checked.

### 12.4 Typography

- IBM Plex Sans Thai. Roles: Display (verdict), Title (card headings), Body, Label, Caption, plus a numeric style with tabular figures.
- Use weight contrast deliberately (Bold verdict, SemiBold numbers, Regular body).
- Tune Thai line height separately so that tone marks and vowels are not clipped. A single Thai word in the verdict must never break across lines.

### 12.5 Design review gate

Before Phase 5 is closed, check every screen in light, dark, Thai, English, and at 200% text size against this checklist:

- [ ] Could this screen be mistaken for a generic template or AI demo? (If yes → redesign.)
- [ ] Is there one clear focal point, with a deliberate secondary hierarchy?
- [ ] Do the containers vary by role, rather than repeating one card style?
- [ ] Are there no emoji in the UI, no decorative gradients beyond the sky backdrop, and no default purple?
- [ ] Do the hero scenes match each other and the palette, and is every glass text pair AA?
- [ ] Is every string specific and data-bearing?
- [ ] Do the abnormal states (§11.4) look designed, not like afterthoughts?

Capture screenshots of every state in `docs/screenshots/` with Playwright, at mobile (390×844) and desktop (1280×800), for the review.

## 13. Scheduler, Notifications and PWA

### 13.1 Scheduler tick

- The pg_cron job `commute-tick` runs every 10 minutes (`*/10 * * * *`). It uses `pg_net` to call `POST {APP_URL}/api/jobs/tick` with the header `Authorization: Bearer {JOB_SECRET}`. The secret is read from Supabase Vault and is never written into the migration.
- The tick handler verifies the secret with a constant-time compare, records a `job_runs` row, then processes each user whose onboarding is complete:
  1. Refresh forecasts if the policy in §4.6 says a refresh is due.
  2. Analyse the target day (§5.6), lock it if the departure window has started (§5.7), and persist the result.
  3. If today is a commute day that is not skipped, and now is within `[notification_time, notification_time + 20 min)`, claim the day in `notification_logs` (§6.6). If the claim succeeds, send the notification (§13.3).
- Every step is idempotent. Overlapping, retried or duplicated ticks never produce a second notification or a second lock.
- Process users sequentially, so a single user's failure is logged and does not stop the others. The handler must finish well inside the function time limit.

The notification window is 20 minutes, two ticks wide, so one missed tick does not lose the notification.

### 13.2 Pre-notification refresh

The tick that falls 20–30 minutes before `notification_time` forces a forecast refresh for both locations, unless the last successful fetch is under 15 minutes old. As a result, the 06:30 notification is normally based on a forecast fetched between about 06:00 and 06:10.

If that refresh fails, the notification uses the latest stored result with its fetch time (the stale format in §11.8). If there is no result at all, it uses the generic text.

### 13.3 Web Push

- VAPID keys are generated once. The public key is `NEXT_PUBLIC_VAPID_PUBLIC_KEY`. The private key is server-only.
- **Subscribe flow.** The user turns on the toggle. In the click handler, call `Notification.requestPermission()`, then `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`, then save the subscription with a Server Action and set `notifications_enabled = true`.
- **Payload.** A title and body following §11.8, plus `url: "/"`. Keep it under 4 KB, and never include coordinates.
- **Service worker.** The `push` handler must always call `showNotification`. iOS can revoke the subscription of a web app that receives pushes without showing a notification. The `notificationclick` handler focuses an existing window or opens `/`.
- **Sending.** Send to every subscription of the user, with `TTL` of 2 hours and `urgency: "high"`, so a morning notification that cannot be delivered in time is dropped instead of arriving at noon. Delete subscriptions that return 404 or 410. Increment `failure_count` on other errors.
- Turning the toggle off deletes this device's subscription. Settings lists the other devices so they can be removed.

### 13.4 Platform constraints

- **iPhone and iPad.** Web Push works only for a web app added to the Home Screen, on iOS/iPadOS 16.4 or later. In an ordinary Safari tab, `PushManager` is unavailable. Detect this and show Add to Home Screen instructions instead of the toggle.
- **Android Chrome and desktop browsers.** Push works in the browser. Installing is optional.
- **Timing.** The tick runs every 10 minutes and push services add their own delay, so the notification arrives between `notification_time` and about 10 minutes later. Settings says so: "แจ้งเตือนประมาณ 06:30–06:40". Never promise an exact minute.
- **Storage separation.** On iOS, an installed web app does not share storage or cookies with Safari. The user signs in once inside the installed app (§14.3).

### 13.5 Scheduler health

- If the Supabase project is paused or a job fails repeatedly, no notification is sent. This is the main remaining operational risk.
- The Vercel Cron job `/api/jobs/daily` runs once a day. On the Hobby plan that is the maximum, and its timing can drift by up to 59 minutes, so it is never used for notification timing. It performs a full tick as a backup and runs a database query, which keeps the Supabase Free project from looking inactive (§14.7).
- Settings → About shows the time of the last successful tick. If it is more than 1 hour old, the app shows the unhealthy state in §11.4.

## 14. Hosting, Security and Configuration

### 14.1 Environments

| Environment | App | Database |
|---|---|---|
| Local | `next dev` | Supabase local stack (`supabase start`, Docker) |
| Preview | Vercel preview deployments | Supabase **staging** project (the Free plan allows two projects) |
| Production | Vercel production | Supabase production project, Singapore region |

Only the production project has the pg_cron tick enabled. Staging gets a disabled copy that can be turned on for testing.

### 14.2 Environment variables

| Variable | Exposure | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public | Publishable key (RLS applies). Renamed from `..._ANON_KEY` to match Supabase's current key naming |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Service-role / secret key, used by jobs only |
| `JOB_SECRET` | Server only, also in Supabase Vault | Authenticates pg_cron calls |
| `CRON_SECRET` | Server only | Authenticates Vercel Cron calls |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Public | Push subscription |
| `VAPID_PRIVATE_KEY` | Server only | Push signing |
| `VAPID_SUBJECT` | Server only | `mailto:` contact for push services |
| `APP_URL` | Server only | Absolute URL for jobs and links |

Validate all of them with Zod at startup (`src/lib/env.ts`). The build fails if one is missing. Supabase now also issues "publishable" and "secret" keys. Either key style works, as long as the secret one never reaches the browser.

### 14.3 Authentication

- Supabase Auth with a **6-digit email OTP code** valid for **10 minutes**, not a magic link. On iOS a magic link opens in Safari, and Safari's session is not shared with the installed Home Screen app. A code typed inside the app avoids this.
- Public sign-up is disabled. The owner's account is created through an invite from the Supabase dashboard.
- Sessions use refresh tokens, so the user rarely needs to sign in again. Session cookies are set only by the server and are `HttpOnly`, `SameSite=Lax` and `Secure` in production. The app does not use the Supabase browser client.
- An unknown email gets the same "code sent" screen as a real one, so the form cannot be used to find out which emails have an account.
- **Hosted project checklist (staging and production), none of which `supabase db push` applies:**
  - Authentication → Sign In / Providers → turn **off** "Allow new users to sign up". If it stays on, anyone can create an account by calling the Auth API directly, because `shouldCreateUser: false` only protects this app's form.
  - Set the Email OTP expiration to 600 seconds.
  - Make the Magic Link email template show `{{ .Token }}` (copy `supabase/templates/magic_link.html`). Since June 2026 a Free project on the default SMTP cannot customise email templates, and the default email may contain only a link. Set up custom SMTP (Resend, Brevo or similar, free tiers exist) first. The default SMTP also sends only to organisation members and at a very low rate.
  - Set Site URL and the redirect allow-list to the production URL.
  - Invite the owner from the dashboard.

### 14.4 Security

- RLS on every table, covered by automated tests (§16.2).
- The service-role client lives only in `server-only` modules used by `/api/jobs/*`.
- Every Server Action checks the session and validates its input with Zod. Never trust a `user_id` sent by the client. Take it from the session.
- Security headers: a Content Security Policy that allows only the app's origin and the Supabase URL for `connect-src`, plus `Referrer-Policy`, `X-Content-Type-Options` and `Permissions-Policy` (geolocation=self).
- Apply Next.js security releases promptly. Enable Dependabot or Renovate.

### 14.5 Browser permissions

- **Notifications**: requested when the user enables alerts (onboarding step 3 or the Settings toggle), with an explanation first.
- **Geolocation**: requested only when the user taps "ใช้ตำแหน่งปัจจุบัน". It needs HTTPS, which Vercel provides.
- No background permissions are needed. All scheduled work runs on the server.

### 14.6 Privacy

- Home and work coordinates, settings and history are stored in the owner's Supabase project, in Singapore. This is a change from v1.1, where everything stayed on the device.
- Coordinates are rounded to about 100 m (§6.0). Push payloads never contain coordinates.
- "Delete all my data" in Settings deletes the account and cascades to every row.

### 14.7 Free-tier limits and mitigations

| Limit | Mitigation |
|---|---|
| Vercel Hobby is for personal, non-commercial use only | The app is a personal tool (§1) |
| Vercel Hobby cron runs at most once a day, with up to ±59 min drift | The 10-minute tick uses Supabase pg_cron. Vercel Cron is only a daily backup |
| Supabase Free pauses a project after about 7 days of low activity, and a paused project also stops pg_cron | The daily Vercel Cron and normal app use query the database. Watch the last-tick indicator (§13.5). Verify after the first week in production that the project stays active |
| Supabase Free has no daily backups | Weekly `supabase db dump` from a GitHub Action, stored as a private artifact |
| Open-Meteo is free for non-commercial use, with fair-use rate limits | Server-side fetching, the refresh policy in §4.6, and 429 backoff |

## 15. Error Handling and Offline Behaviour

| Situation | Required behaviour |
|---|---|
| API request fails | Keep cached data; log it; the UI shows the sync-failed banner on manual refresh |
| One location fails | Save the other; affected windows unknown unless cache valid |
| Open-Meteo returns 429 | Backoff, log, retry on the next tick (§4.6) |
| Device offline | Render the IndexedDB snapshot with its fetch time and the offline banner |
| Cached data is stale (> 6 h) | Stale banner; Hero de-emphasised; fetch time in the notification |
| Missing hourly probability | Affected trip marked incomplete |
| Forecast does not cover window | Trip incomplete → `unknown` unless the other trip is high |
| Target day beyond horizon | "ยังไม่มีพยากรณ์" state |
| Geolocation denied | Use search or manual coordinates |
| Notification permission denied | In-app recommendation still works; Settings shows the disabled state |
| Push unavailable (iOS Safari tab) | Show Add to Home Screen steps |
| Push subscription expired (404/410) | Delete it; Settings asks the user to re-enable on that device |
| Invalid API response | Do not overwrite valid cache |
| Location changed | `update_location` purges that location's forecasts transactionally, then refetches |
| Session expired | Redirect to `/login`, return afterwards |
| Scheduler stopped (no tick > 1 h) | Health warning in Settings → About (§13.5) |
| Supabase project paused | Manual resume from the dashboard; documented in the README |
| Timezone conversion | Explicit timezone-aware handling and tests, independent of the server's timezone (Vercel runs in UTC) |

A recommendation must never silently turn missing data into 0% rain probability.

## 16. Testing Strategy

### 16.1 Unit tests (Vitest)

- Parse Open-Meteo forecast and geocoding responses with Zod, including nulls and missing keys.
- Map hourly arrays to records.
- **Window mapping (§5.1)**: 08:20–09:20 → {09:00, 10:00}; 18:00–19:00 → {19:00}; 07:00–07:30 → {08:00}; a duration that crosses midnight.
- Two-location max and risk-source attribution.
- Threshold application, including a custom threshold where the label and the decision disagree.
- Null probabilities and incomplete coverage.
- The decision table (§16.5).
- Freshness boundaries (exactly 6 h, 6 h + 1 min).
- Target-date selection: before departure, between trips, after return, weekend, skipped day, skipped day followed by weekend.
- Locking: before, at and after the departure start; a settings change after the lock does not alter the locked row; `return_risk_latest` updates.
- Refresh policy: 15-minute skip, hourly daytime cadence, pre-notification forcing.
- Notification due-window: exactly at `notification_time`, at +19 min, at +20 min, on a skipped day, on a non-commute day.
- Payload text for the recommendation, stale and generic kinds, in both locales.
- `thaiDate`: Buddhist Era year, Thai month and weekday names. Run the same assertions in Node and in Playwright's WebKit, because ICU output can differ.
- Every test runs with the process timezone set to `UTC` and again to `Asia/Bangkok` to prove there is no dependence on the host timezone.

### 16.2 Database tests (Supabase local stack)

- Migrations apply cleanly from an empty database.
- Upsert on `(user_id, location_key, forecast_time)`.
- Unique `(user_id, recommendation_date)`. The lock trigger rejects changes to frozen columns and allows `return_risk_latest`.
- `save_forecast_batch` is atomic: a failing row leaves no partial batch and no log.
- `update_location` rounds coordinates and purges forecasts in one transaction.
- Notification claim: two concurrent claims for the same day produce exactly one row.
- Retention job deletes the right rows.
- **RLS**: user A cannot read or write user B's rows in any table; the anon role reads nothing; authenticated users cannot read `job_runs`.

### 16.3 End-to-end and visual tests (Playwright)

- Dashboard states: car, motorcycle, unknown, stale, offline, sync failed, skipped, locked with return warning. Data is seeded through the local stack with a fixed clock.
- Onboarding flow, including skip paths.
- Settings changes trigger re-analysis.
- Manual refresh updates records (Open-Meteo is mocked at the network layer).
- Language switch re-renders the reasons.
- Offline mode with `context.setOffline(true)` renders the snapshot.
- Visual snapshots replace v1.1's golden tests: light and dark, TH and EN, 200% text, at 390×844 and 1280×800, in Chromium and WebKit.

### 16.4 Manual device checks

- iPhone, installed to the Home Screen: OTP sign-in, subscribe, receive the morning push in the 06:30–06:40 window, tap opens the Dashboard.
- iPhone Safari tab: the install guidance appears in place of the toggle.
- Android Chrome and a desktop browser: subscribe and receive.
- Pause the pg_cron job for over an hour and confirm the health warning appears.

### 16.5 Decision test cases

These cases carry over unchanged from v1.1.

| Departure | Return | Expected |
|---:|---:|---|
| 10% | 15% | Motorcycle |
| 20% | 50% | Car (return triggered) |
| 70% | 10% | Car (departure triggered) |
| 90% | 95% | Car (both) |
| Missing | 10% | Unknown |
| Missing | 60% | Car (return triggered, departure incomplete noted) |
| 49% | 49% | Motorcycle |
| Home 10% / Work 55% (dep) | 10% | Car (departure, workplace) |

## 17. Project Structure

```text
src/
├── app/
│   ├── layout.tsx                 // fonts, theme, next-intl provider
│   ├── manifest.ts
│   ├── (auth)/login/page.tsx
│   ├── onboarding/page.tsx
│   ├── (app)/
│   │   ├── layout.tsx             // tab bar / rail, onboarding guard
│   │   ├── page.tsx               // Dashboard
│   │   ├── weather/page.tsx
│   │   ├── history/page.tsx
│   │   ├── history/[date]/page.tsx
│   │   ├── @modal/(.)history/[date]/page.tsx   // sheet
│   │   └── settings/
│   │       ├── page.tsx
│   │       ├── location/[key]/page.tsx
│   │       └── about/page.tsx
│   └── api/
│       ├── geocode/route.ts
│       └── jobs/
│           ├── tick/route.ts
│           └── daily/route.ts
├── features/
│   ├── commute/          // domain only (pure): windowMapper, analyzer, schedule, labels, reasons, freshness
│   ├── forecast/         // openMeteo client, Zod DTOs, sync service, repo
│   ├── recommendations/  // service, repo, reason rendering
│   ├── notifications/    // payload builder, sender, subscription actions, tick due-logic
│   ├── settings/
│   ├── dashboard/
│   ├── weather/
│   ├── history/
│   └── onboarding/
│       (each as needed: domain/ data/ ui/ actions.ts)
├── lib/
│   ├── supabase/         // server.ts, proxy.ts, cookie-options.ts, service.ts (server-only, Phase 3/6)
│   ├── time/             // clock.ts, tz.ts, thaiDate.ts
│   ├── env.ts
│   └── database.types.ts // generated
├── i18n/request.ts
├── styles/               // tokens.css, globals.css
├── sw.ts                 // service worker source
└── proxy.ts
messages/
├── th.json
└── en.json
public/
├── lottie/               // recolored, license-checked .lottie files
└── icons/
supabase/
├── config.toml
├── migrations/
├── seed.sql
└── tests/
tests/
├── unit/
└── e2e/
docs/
├── commute_advisor_plan.md
└── screenshots/
vercel.json               // daily cron
```

An ESLint `no-restricted-imports` rule enforces that `src/features/commute` imports nothing from `next`, `react`, `@supabase/*` or browser globals.

## 18. Implementation Roadmap

### Phase 1 — Foundation & Visual Direction

- [ ] Create the Next.js 16 project with TypeScript strict, ESLint and Prettier.
- [ ] Link the Vercel project with preview deployments.
- [ ] Set up Tailwind v4 with the token file, `next/font` (IBM Plex Sans Thai) and `next-intl` (TH/EN).
- [ ] Build the shared layout with the bottom tab bar and the desktop rail.
- [ ] **Build one static Dashboard mockup in light and dark, at mobile and desktop width, following §12.1. Review it against §12.5 before continuing.**

**Exit criteria:** The app deploys to Vercel with routing, both themes, both languages, both layouts, and an approved visual direction.

### Phase 2 — Supabase & Auth

- [ ] Create the staging and production projects in the Singapore region.
- [x] Write migrations for every table in §6, with constraints, RLS policies, functions, the lock trigger and the retention job.
- [x] Generate TypeScript types (`npm run db:types`).
- [x] Implement OTP sign-in with `@supabase/ssr`, `proxy.ts` and sign-up disabled.
- [x] Add the database and RLS tests (§16.2). Run with `supabase start` then `npm test`.

**Exit criteria:** The owner can sign in, and settings, skip days and recommendations persist under RLS.

### Phase 3 — Weather Integration

- [ ] Open-Meteo client with Zod DTOs and 429 backoff.
- [ ] `forecastSyncService` with the refresh policy and sync logs.
- [ ] `/api/geocode` route and the location picker data flow.
- [ ] `update_location` with rounding and purge.
- [ ] Tests for null and missing fields and for API failures.

**Exit criteria:** The server fetches and stores forecasts for both configured locations.

### Phase 4 — Commute Engine

- [ ] Port every v1.1 test case to Vitest first (§16.1, §16.5). The expected behaviour is already defined.
- [ ] Window mapper (§5.1), two-location analysis (§5.2), decision (§5.3), labels and freshness.
- [ ] Commute schedule, target date (§5.6) and skip days.
- [ ] Locking (§5.7) with the database trigger.
- [ ] Structured reasons and localized rendering.

**Exit criteria:** The same inputs and clock always produce the same tested result, in either host timezone.

### Phase 5 — User Interface

- [ ] Login and onboarding.
- [ ] Dashboard, with every state in §11.2 and §11.4.
- [ ] Weather screen, with the rain-gauge chart and list.
- [ ] History, with monthly summary and day detail sheet.
- [ ] Settings, with the location picker, account section and About/attribution.
- [ ] Responsive layouts (§11.12), motion and reduced motion.
- [ ] Lottie assets: select, license-check, recolor.
- [ ] Icons and manifest.
- [ ] Playwright visual snapshots.
- [ ] **Design review gate (§12.5) passed, with screenshots in `docs/screenshots/`.**

**Exit criteria:** Every feature is usable from the UI on mobile and desktop and has passed the anti-generic review.

### Phase 6 — Scheduler, Push & PWA

- [ ] `/api/jobs/tick` and `tickService`, with `job_runs`.
- [ ] pg_cron + pg_net job, with the secret in Vault.
- [ ] `/api/jobs/daily` and the Vercel Cron entry in `vercel.json`.
- [ ] VAPID keys, the service worker `push` and `notificationclick` handlers, the subscription flow and device list.
- [ ] Install guidance for iPhone Safari.
- [ ] App-shell caching and the IndexedDB offline snapshot.
- [ ] Health indicator in Settings → About.
- [ ] Manual device checks (§16.4).

**Exit criteria:** The morning push arrives on an installed iPhone within the stated window, from a recent forecast, and failures are visible.

### Phase 7 — Final Testing and Release

- [ ] Run all unit, database, E2E and visual tests in CI on every pull request.
- [ ] Offline, date-boundary and timezone tests.
- [ ] Lighthouse check: performance, accessibility and installability.
- [ ] Verify Open-Meteo attribution and terms, and the Lottie asset licenses.
- [ ] Production deploy and the weekly backup Action.
- [ ] README: local setup, environment variables, key rotation, resuming a paused Supabase project.

**Exit criteria:** A stable personal web app on free tiers, with no paid API.

## 19. Non-functional Requirements

| Area | Requirement |
|---|---|
| Backend | Next.js Server Actions and route handlers on Vercel, plus Supabase |
| Database | Supabase Postgres with RLS on every table |
| Cost | Free tiers only: Open-Meteo (non-commercial), Vercel Hobby, Supabase Free |
| Weather API key | Not required |
| Secrets | Vercel environment variables and Supabase Vault; never in the repository |
| Offline | App shell and last Dashboard snapshot available offline; fonts self-hosted |
| Privacy | Data in the owner's Supabase project; coordinates rounded to ~100 m; account deletion removes everything |
| Notifications | Server-sent Web Push; arrives within ~10 minutes of the set time |
| Platform | Last 2 versions of Safari, Chrome, Edge and Firefox; push on iPhone needs iOS 16.4+ and Home Screen install |
| Performance | Dashboard LCP < 2.5 s on a mid-range phone over 4G; Dashboard route JS < 150 KB gzip, excluding the lazy-loaded Lottie player |
| Localization | Thai + English; Buddhist Era dates in Thai |
| Accessibility | WCAG 2.2 AA contrast, 200% text, screen readers, keyboard, reduced motion |
| Visual quality | Must pass §12.5; no templated or AI-generic look |
| Maintainability | Feature-first structure, pure engine with no framework imports, injectable clock |
| Data integrity | Missing values never interpreted as zero; lock invariant enforced by a database trigger |
| Freshness | Last successful fetch time always visible |
| Observability | Sync logs, notification logs and job runs; last-tick time visible in the app |

## 20. Out of Scope for v2.0

- Public sign-up, multiple households, or sharing.
- Paid weather APIs, and paid Vercel or Supabase plans.
- A native iOS app. The Flutter v1.1 is not maintained in parallel.
- A minute-exact notification time.
- Traffic, road closures, and route-aware radar.
- Automatic detection of which vehicle the user actually used.
- Machine-learning prediction.
- An automatic Thai public-holiday calendar (manual skip-day only).
- A Home Screen widget. Web apps cannot provide iOS widgets.
- **Future enhancements:** automatic holiday skips, heavy-rain and strong-wind overrides, an alternative notification channel such as the LINE Messaging API or email.

## 21. Decision Log

| # | Topic | Decision | Status in v2.0 |
|---|---|---|---|
| 1 | Forecast locations | Home + workplace; each trip uses the max of both | Kept |
| 2 | Partial-hour mapping | Include every overlapping bucket, using "preceding hour" semantics | Kept |
| 3 | Commute days | User-selectable; default Mon–Fri | Kept |
| 4 | Holidays / leave | Manual "skip today" | Kept |
| 5 | Stale threshold | > 6 hours | Kept |
| 6 | Risk labels | 4 fixed bands, independent of the threshold | Kept |
| 7 | Notification when stale/unknown | Latest result + fetch time; generic if none | Kept |
| 8 | Notification mechanism | Server-sent Web Push from a 10-minute tick, content built at send time | **Changed** (was a rolling 7-day local schedule) |
| 9 | Dashboard target | Next relevant commute day | Kept |
| 10 | Locking | Lock at departure start; return card keeps updating with a warning; enforced by DB trigger | Kept, strengthened |
| 11 | Recommendation storage | One row per user per date (upsert) | Kept |
| 12 | Retention | Forecasts/logs 14 days; recommendations forever; runs as a pg_cron job | Kept |
| 13 | Location input | Place search + current location + manual coordinates; stored rounded to ~100 m | Kept, rounding added |
| 14 | Platform | Next.js web app / PWA on Vercel | **Changed** (was Flutter iOS) |
| 15 | Language | Thai + English | Kept |
| 16 | Design system | Custom token system on Tailwind v4: sky backdrops per verdict, frosted-glass cards, system light/dark | **Changed** (was Material 3; "departure board" concept replaced 2026-11-11) |
| 17 | Dashboard layout | Hero on the sky + trips card + hourly chart + now at each location + next days + this week; 12-column grid on desktop | **Changed** 2026-11-11 |
| 18 | Navigation | Bottom nav with 4 tabs on mobile; left rail on desktop | Extended |
| 19 | Icons | Weather scene illustrations in the Hero (SVG; Lottie optional later); Material Symbols elsewhere | Changed |
| 20 | Risk colors | Custom green → amber → orange → red; grey unknown | Kept |
| 21 | Font | IBM Plex Sans Thai, self-hosted through `next/font` | Kept |
| 22 | Weather screen | Bar chart + hourly list, home/work switch | Kept |
| 23 | History | Monthly summary + day list | Kept |
| 24 | Settings | Grouped list; account section added | Kept, extended |
| 25 | Abnormal states | Top banner + de-emphasised Hero | Kept |
| 26 | Motion | Moderate; respects reduced motion; no haptics | Changed (haptics removed) |
| 27 | Onboarding | 3 skippable steps, after sign-in | Kept |
| 28 | Date format | Buddhist Era in Thai, Gregorian in English, 24-hour | Kept |
| 29 | App icon | Simple custom mark; PWA icon set | Kept |
| 30 | Widget | Not possible on web | Dropped |
| 31 | Visual identity | Must not look generic or AI-generated (§12, binding) | Kept |
| 32 | Database | Supabase Postgres with RLS on every table | **New** |
| 33 | Auth | Supabase email OTP code; public sign-up disabled | **New** |
| 34 | Scheduler | Supabase pg_cron every 10 min; Vercel Cron daily as backup and keep-alive | **New** |
| 35 | Forecast fetching | Server-side only; browsers never call Open-Meteo forecast | **New** |
| 36 | Offline | Service worker app shell + IndexedDB snapshot | **New** |
| 37 | Usage scope | Single owner, personal non-commercial; schema is per-user | **New** |

## 22. Definition of Done

The v2.0 release is complete when:

- [ ] The owner can sign in with an email code, complete onboarding, and configure home/work locations, commute times and days, threshold, notification time, and language.
- [ ] The server fetches free hourly forecasts for both locations from Open-Meteo on the defined policy.
- [ ] Forecasts and history are stored in Supabase under RLS, with retention, and RLS tests pass.
- [ ] Both commute windows are evaluated across both locations, with the defined hour mapping.
- [ ] The app recommends car, motorcycle, or unknown with a specific, localized explanation.
- [ ] Recommendations lock at departure, the database rejects changes to locked rows, and the return-trip warning works.
- [ ] Skip-day works and suppresses that day's notification.
- [ ] The Dashboard shows freshness, stale/offline/error banners, and incomplete-data warnings.
- [ ] The user can view hourly forecasts (chart and list) and the monthly history, on mobile and desktop.
- [ ] An installed iPhone receives the morning Web Push within the stated window, built from a forecast fetched shortly before, and never receives two for the same day.
- [ ] Offline mode shows the last snapshot without presenting it as current.
- [ ] The scheduler's health is visible in the app.
- [ ] The UI passes the anti-generic design review (§12.5) in both themes, both languages and both layouts.
- [ ] Core logic, database operations and RLS have automated tests running in CI.
- [ ] The app runs on Vercel Hobby and Supabase Free with no paid API, and the README documents setup and recovery.

---

## References

- Open-Meteo: https://open-meteo.com/
- Open-Meteo Forecast API: https://open-meteo.com/en/docs
- Open-Meteo Geocoding API: https://open-meteo.com/en/docs/geocoding-api
- Open-Meteo Terms: https://open-meteo.com/en/terms
- Next.js documentation: https://nextjs.org/docs
- Next.js blog (security releases): https://nextjs.org/blog
- Supabase documentation: https://supabase.com/docs
- Supabase Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase Cron (pg_cron): https://supabase.com/docs/guides/cron
- Supabase server-side auth for Next.js: https://supabase.com/docs/guides/auth/server-side/nextjs
- Supabase free project pausing: https://supabase.com/kb/faqs/platform/free-project-pausing
- Vercel Cron usage and limits: https://vercel.com/docs/cron-jobs/usage-and-pricing
- Vercel Hobby plan: https://vercel.com/docs/plans/hobby
- MDN Push API: https://developer.mozilla.org/en-US/docs/Web/API/Push_API
- WebKit, Web Push for Web Apps on iOS and iPadOS: https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
- next-intl: https://next-intl.dev/
- Serwist: https://serwist.pages.dev/
- IBM Plex: https://github.com/IBM/plex
- LottieFiles license: https://lottiefiles.com/page/license
- WCAG 2.2: https://www.w3.org/TR/WCAG22/
