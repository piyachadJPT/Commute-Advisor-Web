-- Functions and triggers (plan §5.7, §6).
--
-- Security notes:
--   * Everything is SECURITY INVOKER (RLS applies) except private.handle_new_user and
--     public.get_scheduler_health, which need to bypass RLS on purpose and are documented below.
--   * search_path is empty, so every reference is schema-qualified.
--   * EXECUTE is revoked from PUBLIC and granted to named roles only. Postgres grants EXECUTE to
--     PUBLIC by default, which would make any public function callable by `anon`.

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------
create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger settings_set_updated_at
  before update on public.settings
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- A default settings row for every new user (§6.1)
-- SECURITY DEFINER because it runs inside auth's insert, before any session exists.
-- It lives in the unexposed private schema and takes no input, so it is not callable via the API.
-- ---------------------------------------------------------------------------
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.settings (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;
revoke execute on function private.handle_new_user() from public, anon, authenticated, service_role;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Users that existed before this migration (e.g. the owner invited early).
insert into public.settings (user_id)
select id from auth.users
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------------
-- Lock invariant (§5.7, §6.3)
-- Once locked_at is set, only return_risk_latest (and updated_at) may change. Comparing the
-- whole row as jsonb freezes every other column, including ones added later, without listing
-- them. The service role is bound by this trigger too.
-- ---------------------------------------------------------------------------
create function private.protect_locked_recommendation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.locked_at is not null
     and (to_jsonb(new) - 'return_risk_latest' - 'updated_at')
         is distinct from (to_jsonb(old) - 'return_risk_latest' - 'updated_at')
  then
    raise exception 'recommendation % is locked', old.id
      using errcode = 'check_violation',
            hint = 'Only return_risk_latest may change after locked_at is set.';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger daily_recommendations_protect_locked
  before update on public.daily_recommendations
  for each row execute function private.protect_locked_recommendation();

-- ---------------------------------------------------------------------------
-- update_location(key, lat, lon, name) (§6.2)
-- One statement-level transaction: round coordinates to ~100 m, update settings, purge that
-- location's forecasts so old-location data never mixes with new.
-- ---------------------------------------------------------------------------
create function public.update_location(
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
end;
$$;
revoke execute on function public.update_location(text, double precision, double precision, text)
  from public, anon, authenticated, service_role;
grant execute on function public.update_location(text, double precision, double precision, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- save_forecast_batch (§6.9)
-- Saves one location's hourly rows and its sync log atomically: any failing row rolls back
-- the whole call, so there is never a partial batch or an orphan log.
--
-- Deviation from §6.9: takes p_user_id, the coordinates and fetch time explicitly because jobs
-- call it with the service role (no auth.uid()). It is SECURITY INVOKER, so a signed-in caller
-- can only ever write their own rows: RLS rejects any other p_user_id.
--
-- p_rows: array of {forecast_time, temperature, humidity, precipitation_probability,
--         precipitation, rain, showers, weather_code, wind_speed}.
-- p_log:  {trigger, status, response_code?, error_message?}. records_count is counted here.
-- An empty p_rows only writes the log (used to record a failed or skipped sync).
-- ---------------------------------------------------------------------------
create function public.save_forecast_batch(
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
    -- The batch must be for the location that is configured right now. If the user changed it
    -- while the fetch was in flight, refuse the batch instead of mixing old and new data.
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

    insert into public.hourly_forecasts as f (
      user_id, location_key, latitude, longitude, forecast_time, temperature, humidity,
      precipitation_probability, precipitation, rain, showers, weather_code, wind_speed, fetched_at
    )
    select
      p_user_id, p_location_key, p_latitude, p_longitude, r.forecast_time, r.temperature, r.humidity,
      r.precipitation_probability, r.precipitation, r.rain, r.showers, r.weather_code, r.wind_speed,
      p_fetched_at
    from jsonb_to_recordset(p_rows) as r (
      forecast_time timestamptz, temperature real, humidity smallint,
      precipitation_probability smallint, precipitation real, rain real, showers real,
      weather_code smallint, wind_speed real
    )
    on conflict (user_id, location_key, forecast_time) do update set
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      temperature = excluded.temperature,
      humidity = excluded.humidity,
      precipitation_probability = excluded.precipitation_probability,
      precipitation = excluded.precipitation,
      rain = excluded.rain,
      showers = excluded.showers,
      weather_code = excluded.weather_code,
      wind_speed = excluded.wind_speed,
      fetched_at = excluded.fetched_at;
    get diagnostics v_count = row_count;
  end if;

  insert into public.forecast_sync_logs (
    user_id, location_key, trigger, status, response_code, records_count, error_message, fetched_at
  )
  values (
    p_user_id, p_location_key, p_log ->> 'trigger', p_log ->> 'status',
    (p_log ->> 'response_code')::smallint, v_count,
    left(p_log ->> 'error_message', 500), p_fetched_at
  );

  return v_count;
end;
$$;
revoke execute on function public.save_forecast_batch(uuid, text, double precision, double precision, timestamptz, jsonb, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.save_forecast_batch(uuid, text, double precision, double precision, timestamptz, jsonb, jsonb)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- get_scheduler_health (§6.8, §13.5)
-- job_runs is not user data and is closed to the API. Settings → About needs only the time of
-- the last successful run, so this SECURITY DEFINER function returns exactly that and nothing
-- else. It checks the caller is signed in and is not executable by anon.
-- ---------------------------------------------------------------------------
create function public.get_scheduler_health()
returns timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  return (select max(finished_at) from public.job_runs where status = 'ok');
end;
$$;
revoke execute on function public.get_scheduler_health() from public, anon, authenticated, service_role;
grant execute on function public.get_scheduler_health() to authenticated;
