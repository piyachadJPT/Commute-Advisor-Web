-- Weather advisories, phase B (plan §23.5): PM2.5 from the Open-Meteo Air Quality API.
--
--   * hourly_air_quality: its own table, because it is a separate source that fails on its own.
--     Sharing the forecast upsert would overwrite one source's values with nulls from the other.
--   * save_air_quality_batch: rows and sync log in one transaction, like save_forecast_batch.
--   * forecast_sync_logs.source: tells forecast syncs from air-quality syncs. Existing rows are
--     forecast rows (the default).
--   * update_location and run_retention also cover the new table.

-- ---------------------------------------------------------------------------
-- hourly_air_quality
-- ---------------------------------------------------------------------------
create table public.hourly_air_quality (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  location_key text not null check (location_key in ('home', 'work')),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  forecast_time timestamptz not null,
  pm2_5 real check (pm2_5 >= 0),
  pm10 real check (pm10 >= 0),
  fetched_at timestamptz not null,
  constraint hourly_air_quality_unique unique (user_id, location_key, forecast_time)
);

alter table public.hourly_air_quality enable row level security;
revoke all on table public.hourly_air_quality from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.hourly_air_quality to service_role;

-- Same grants and policies as hourly_forecasts: manual refresh upserts, update_location purges.
grant select, insert, update, delete on public.hourly_air_quality to authenticated;
create policy hourly_air_quality_select_own on public.hourly_air_quality for select to authenticated
  using ((select auth.uid()) = user_id);
create policy hourly_air_quality_insert_own on public.hourly_air_quality for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy hourly_air_quality_update_own on public.hourly_air_quality for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy hourly_air_quality_delete_own on public.hourly_air_quality for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- forecast_sync_logs.source
-- ---------------------------------------------------------------------------
alter table public.forecast_sync_logs
  add column source text not null default 'forecast'
    check (source in ('forecast', 'air_quality'));

-- "Last successful fetch for this location and source" (§4.6, §5.5).
drop index public.forecast_sync_logs_last_fetch_idx;
create index forecast_sync_logs_last_fetch_idx
  on public.forecast_sync_logs (user_id, location_key, source, fetched_at desc);

-- ---------------------------------------------------------------------------
-- save_air_quality_batch
-- p_rows: array of {forecast_time, pm2_5, pm10}.
-- p_log:  {trigger, status, response_code?, error_message?}. Written with source 'air_quality'.
-- An empty p_rows only writes the log (a failed or skipped sync).
-- ---------------------------------------------------------------------------
create function public.save_air_quality_batch(
  p_user_id uuid,
  p_location_key text,
  p_latitude double precision,
  p_longitude double precision,
  p_fetched_at timestamptz,
  p_rows jsonb,
  p_log jsonb
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count integer := 0;
  v_lat double precision;
  v_lon double precision;
begin
  if p_location_key is null or p_location_key not in ('home', 'work') then
    raise exception 'invalid location key' using errcode = '22023';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_typeof(p_log) is distinct from 'object' then
    raise exception 'p_rows must be an array and p_log an object' using errcode = '22023';
  end if;

  if jsonb_array_length(p_rows) > 0 then
    -- Refuse a batch for a location that changed while the fetch was in flight.
    select
      case when p_location_key = 'home' then home_latitude else work_latitude end,
      case when p_location_key = 'home' then home_longitude else work_longitude end
    into v_lat, v_lon
    from public.settings
    where user_id = p_user_id;

    if v_lat is null or v_lon is null
       or abs(v_lat - p_latitude) > 0.0005 or abs(v_lon - p_longitude) > 0.0005 then
      raise exception 'location_changed' using errcode = 'CA001';
    end if;

    insert into public.hourly_air_quality as a (
      user_id, location_key, latitude, longitude, forecast_time, pm2_5, pm10, fetched_at
    )
    select
      p_user_id, p_location_key, p_latitude, p_longitude, r.forecast_time, r.pm2_5, r.pm10,
      p_fetched_at
    from jsonb_to_recordset(p_rows) as r (forecast_time timestamptz, pm2_5 real, pm10 real)
    on conflict (user_id, location_key, forecast_time) do update set
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      pm2_5 = excluded.pm2_5,
      pm10 = excluded.pm10,
      fetched_at = excluded.fetched_at;
    get diagnostics v_count = row_count;
  end if;

  insert into public.forecast_sync_logs (
    user_id, location_key, source, trigger, status, response_code, records_count, error_message,
    fetched_at
  )
  values (
    p_user_id, p_location_key, 'air_quality', p_log ->> 'trigger', p_log ->> 'status',
    (p_log ->> 'response_code')::smallint, v_count,
    left(p_log ->> 'error_message', 500), p_fetched_at
  );

  return v_count;
end;
$$;
revoke execute on function public.save_air_quality_batch(uuid, text, double precision, double precision, timestamptz, jsonb, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.save_air_quality_batch(uuid, text, double precision, double precision, timestamptz, jsonb, jsonb)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- update_location: also purge that location's air quality, so old-place data never mixes in.
-- Same signature as before, so the grants stay.
-- ---------------------------------------------------------------------------
create or replace function public.update_location(
  p_key text,
  p_latitude double precision,
  p_longitude double precision,
  p_name text default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_lat double precision;
  v_lon double precision;
  v_name text := nullif(btrim(p_name), '');
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_key is null or p_key not in ('home', 'work') then
    raise exception 'invalid location key' using errcode = '22023';
  end if;
  -- NaN sorts above every number in Postgres, so it fails the range check too.
  if p_latitude is null or p_longitude is null
     or p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
    raise exception 'invalid coordinates' using errcode = '22023';
  end if;

  v_lat := round(p_latitude::numeric, 3)::double precision;
  v_lon := round(p_longitude::numeric, 3)::double precision;

  update public.settings set
    home_latitude  = case when p_key = 'home' then v_lat else home_latitude end,
    home_longitude = case when p_key = 'home' then v_lon else home_longitude end,
    home_name      = case when p_key = 'home' then v_name else home_name end,
    work_latitude  = case when p_key = 'work' then v_lat else work_latitude end,
    work_longitude = case when p_key = 'work' then v_lon else work_longitude end,
    work_name      = case when p_key = 'work' then v_name else work_name end
  where user_id = v_uid;

  if not found then
    raise exception 'settings not found' using errcode = 'P0002';
  end if;

  delete from public.hourly_forecasts
  where user_id = v_uid and location_key = p_key;
  delete from public.hourly_air_quality
  where user_id = v_uid and location_key = p_key;
end;
$$;

-- ---------------------------------------------------------------------------
-- run_retention: air quality is kept 14 days like forecasts (Decision Log #12).
-- ---------------------------------------------------------------------------
create or replace function public.run_retention()
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_cutoff timestamptz := now() - interval '14 days';
  v_forecasts integer;
  v_air integer;
  v_sync_logs integer;
  v_notifications integer;
  v_job_runs integer;
begin
  delete from public.hourly_forecasts where fetched_at < v_cutoff;
  get diagnostics v_forecasts = row_count;

  delete from public.hourly_air_quality where fetched_at < v_cutoff;
  get diagnostics v_air = row_count;

  delete from public.forecast_sync_logs where fetched_at < v_cutoff;
  get diagnostics v_sync_logs = row_count;

  delete from public.notification_logs where created_at < v_cutoff;
  get diagnostics v_notifications = row_count;

  delete from public.job_runs where started_at < v_cutoff;
  get diagnostics v_job_runs = row_count;

  return jsonb_build_object(
    'hourly_forecasts', v_forecasts,
    'hourly_air_quality', v_air,
    'forecast_sync_logs', v_sync_logs,
    'notification_logs', v_notifications,
    'job_runs', v_job_runs
  );
end;
$$;
