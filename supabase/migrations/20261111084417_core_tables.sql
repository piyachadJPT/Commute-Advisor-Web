-- Core tables (plan §6).
--
-- Rules for every table (§6.0):
--   * user_id references auth.users on delete cascade, so deleting the account deletes the data.
--   * RLS is enabled; policies require user_id = (select auth.uid()).
--   * Grants are explicit. Since 2026 new public tables are not exposed to the Data API
--     automatically, and `anon` must read nothing.
--
-- Deviation from §6.0, on purpose: policies exist for exactly the operations the app performs
-- with the user-scoped client (least privilege). Writes made only by scheduled jobs use the
-- service-role client, which bypasses RLS but is still limited by the triggers below.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- settings (one row per user) §6.1
-- ---------------------------------------------------------------------------
create table public.settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  home_latitude double precision check (home_latitude between -90 and 90),
  home_longitude double precision check (home_longitude between -180 and 180),
  home_name text check (char_length(home_name) <= 200),
  work_latitude double precision check (work_latitude between -90 and 90),
  work_longitude double precision check (work_longitude between -180 and 180),
  work_name text check (char_length(work_name) <= 200),
  departure_time time not null default '08:20',
  return_time time not null default '18:00',
  analysis_duration_minutes smallint not null default 60
    check (analysis_duration_minutes between 15 and 180),
  rain_threshold smallint not null default 50 check (rain_threshold between 10 and 90),
  notification_time time not null default '06:30',
  notifications_enabled boolean not null default false,
  -- Bitmask: Mon=1, Tue=2, Wed=4 ... Sun=64. 31 = Mon–Fri.
  commute_days smallint not null default 31 check (commute_days between 0 and 127),
  -- Fixed to Asia/Bangkok in v2.0; stored for future use. Relax this check to add timezones.
  timezone text not null default 'Asia/Bangkok' check (timezone = 'Asia/Bangkok'),
  locale text check (locale in ('th', 'en')),
  onboarding_completed boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint settings_home_pair check ((home_latitude is null) = (home_longitude is null)),
  constraint settings_work_pair check ((work_latitude is null) = (work_longitude is null))
);

-- ---------------------------------------------------------------------------
-- hourly_forecasts §6.2
-- ---------------------------------------------------------------------------
create table public.hourly_forecasts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  location_key text not null check (location_key in ('home', 'work')),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  forecast_time timestamptz not null,
  temperature real,
  humidity smallint check (humidity between 0 and 100),
  precipitation_probability smallint check (precipitation_probability between 0 and 100),
  precipitation real check (precipitation >= 0),
  rain real check (rain >= 0),
  showers real check (showers >= 0),
  weather_code smallint,
  wind_speed real check (wind_speed >= 0),
  fetched_at timestamptz not null,
  -- The unique index also serves lookups by (user, location, time) and the upsert.
  constraint hourly_forecasts_unique unique (user_id, location_key, forecast_time)
);

-- ---------------------------------------------------------------------------
-- daily_recommendations §6.3
-- ---------------------------------------------------------------------------
create table public.daily_recommendations (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  recommendation_date date not null,
  vehicle text not null check (vehicle in ('car', 'motorcycle', 'unknown')),
  departure_risk smallint check (departure_risk between 0 and 100),
  return_risk smallint check (return_risk between 0 and 100),
  -- Live value after the lock (§5.7). The only risk column that may change once locked.
  return_risk_latest smallint check (return_risk_latest between 0 and 100),
  departure_risk_source text check (departure_risk_source in ('home', 'work')),
  return_risk_source text check (return_risk_source in ('home', 'work')),
  departure_rain_mm real check (departure_rain_mm >= 0),
  return_rain_mm real check (return_rain_mm >= 0),
  -- Stored as a code plus params and rendered in the current locale, never as a sentence.
  reason_code text not null,
  reason_params jsonb not null default '{}'::jsonb,
  data_complete boolean not null,
  forecast_fetched_at timestamptz,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_recommendations_unique unique (user_id, recommendation_date)
);

-- ---------------------------------------------------------------------------
-- skipped_days §6.4
-- ---------------------------------------------------------------------------
create table public.skipped_days (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  created_at timestamptz not null default now(),
  constraint skipped_days_unique unique (user_id, date)
);

-- ---------------------------------------------------------------------------
-- push_subscriptions §6.5
-- ---------------------------------------------------------------------------
create table public.push_subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The server sends a request to this URL. https only; the sender also allow-lists the
  -- known push-service hosts (Phase 6) so a stored endpoint can never reach internal hosts.
  endpoint text not null unique check (endpoint like 'https://%' and char_length(endpoint) <= 2048),
  p256dh text not null check (char_length(p256dh) <= 512),
  auth text not null check (char_length(auth) <= 512),
  user_agent text check (char_length(user_agent) <= 512),
  created_at timestamptz not null default now(),
  last_success_at timestamptz,
  failure_count smallint not null default 0
);
create index push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

-- ---------------------------------------------------------------------------
-- notification_logs §6.6
-- ---------------------------------------------------------------------------
create table public.notification_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  recommendation_id bigint references public.daily_recommendations (id) on delete set null,
  target_date date not null,
  kind text not null check (kind in ('recommendation', 'stale', 'generic')),
  status text not null check (status in ('sending', 'sent', 'failed')),
  devices_sent smallint not null default 0,
  sent_at timestamptz,
  error_message text check (char_length(error_message) <= 500),
  created_at timestamptz not null default now(),
  -- At most one morning notification per user per day (§6.6, §13.1).
  constraint notification_logs_unique unique (user_id, target_date)
);
create index notification_logs_recommendation_id_idx
  on public.notification_logs (recommendation_id)
  where recommendation_id is not null;

-- ---------------------------------------------------------------------------
-- forecast_sync_logs §6.7
-- ---------------------------------------------------------------------------
create table public.forecast_sync_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  location_key text not null check (location_key in ('home', 'work')),
  trigger text not null check (trigger in ('scheduled', 'pre_notification', 'manual')),
  status text not null check (status in ('success', 'failed', 'skipped')),
  response_code smallint,
  records_count integer not null default 0,
  error_message text check (char_length(error_message) <= 500),
  fetched_at timestamptz not null default now()
);
-- "Last successful fetch for this location" (§4.6, §5.5).
create index forecast_sync_logs_last_fetch_idx
  on public.forecast_sync_logs (user_id, location_key, fetched_at desc);

-- ---------------------------------------------------------------------------
-- job_runs §6.8 (not user data: no user_id)
-- ---------------------------------------------------------------------------
create table public.job_runs (
  id bigint generated always as identity primary key,
  job text not null check (job in ('tick', 'daily')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null check (status in ('ok', 'error')),
  details jsonb not null default '{}'::jsonb
);
create index job_runs_last_ok_idx on public.job_runs (finished_at desc) where status = 'ok';

-- ---------------------------------------------------------------------------
-- RLS: enable everywhere, then grant and add policies per operation.
-- ---------------------------------------------------------------------------
alter table public.settings enable row level security;
alter table public.hourly_forecasts enable row level security;
alter table public.daily_recommendations enable row level security;
alter table public.skipped_days enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notification_logs enable row level security;
alter table public.forecast_sync_logs enable row level security;
alter table public.job_runs enable row level security;

-- Start from nothing, then grant only what each role needs.
revoke all on table
  public.settings, public.hourly_forecasts, public.daily_recommendations, public.skipped_days,
  public.push_subscriptions, public.notification_logs, public.forecast_sync_logs, public.job_runs
  from public, anon, authenticated, service_role;

-- Jobs run as service_role (bypasses RLS, still subject to triggers and constraints).
grant select, insert, update, delete on table
  public.settings, public.hourly_forecasts, public.daily_recommendations, public.skipped_days,
  public.push_subscriptions, public.notification_logs, public.forecast_sync_logs, public.job_runs
  to service_role;

-- settings: read, create-if-missing, update. Never deleted directly (cascade only).
grant select, insert, update on public.settings to authenticated;
create policy settings_select_own on public.settings for select to authenticated
  using ((select auth.uid()) = user_id);
create policy settings_insert_own on public.settings for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy settings_update_own on public.settings for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- hourly_forecasts: manual refresh upserts; update_location purges.
grant select, insert, update, delete on public.hourly_forecasts to authenticated;
create policy hourly_forecasts_select_own on public.hourly_forecasts for select to authenticated
  using ((select auth.uid()) = user_id);
create policy hourly_forecasts_insert_own on public.hourly_forecasts for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy hourly_forecasts_update_own on public.hourly_forecasts for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy hourly_forecasts_delete_own on public.hourly_forecasts for delete to authenticated
  using ((select auth.uid()) = user_id);

-- daily_recommendations: recomputed from Server Actions. Frozen columns are protected by a trigger.
grant select, insert, update, delete on public.daily_recommendations to authenticated;
create policy daily_recommendations_select_own on public.daily_recommendations
  for select to authenticated using ((select auth.uid()) = user_id);
create policy daily_recommendations_insert_own on public.daily_recommendations
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy daily_recommendations_update_own on public.daily_recommendations
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy daily_recommendations_delete_own on public.daily_recommendations
  for delete to authenticated using ((select auth.uid()) = user_id);

-- skipped_days: skip and unskip.
grant select, insert, delete on public.skipped_days to authenticated;
create policy skipped_days_select_own on public.skipped_days for select to authenticated
  using ((select auth.uid()) = user_id);
create policy skipped_days_insert_own on public.skipped_days for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy skipped_days_delete_own on public.skipped_days for delete to authenticated
  using ((select auth.uid()) = user_id);

-- push_subscriptions: subscribe (upsert on endpoint), list devices, remove a device.
grant select, insert, update, delete on public.push_subscriptions to authenticated;
create policy push_subscriptions_select_own on public.push_subscriptions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy push_subscriptions_insert_own on public.push_subscriptions
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy push_subscriptions_update_own on public.push_subscriptions
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy push_subscriptions_delete_own on public.push_subscriptions
  for delete to authenticated using ((select auth.uid()) = user_id);

-- notification_logs: written by the tick only. The user can read their own history.
grant select on public.notification_logs to authenticated;
create policy notification_logs_select_own on public.notification_logs
  for select to authenticated using ((select auth.uid()) = user_id);

-- forecast_sync_logs: manual refresh logs its own result; the user can read them.
grant select, insert on public.forecast_sync_logs to authenticated;
create policy forecast_sync_logs_select_own on public.forecast_sync_logs
  for select to authenticated using ((select auth.uid()) = user_id);
create policy forecast_sync_logs_insert_own on public.forecast_sync_logs
  for insert to authenticated with check ((select auth.uid()) = user_id);

-- job_runs: RLS on, no policies and no grants for anon/authenticated. Only service_role
-- reads it; the app shows the last run time through public.get_scheduler_health().
