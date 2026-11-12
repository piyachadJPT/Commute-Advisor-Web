-- Weather advisories, phase A (plan §23.4). Additive only: nothing existing changes meaning.
--
--   * hourly_forecasts gets five nullable supporting columns.
--   * save_forecast_batch reads them from p_rows. A missing key becomes null, so an app version
--     deployed before this migration and one deployed after it both keep working.
--   * daily_recommendations gets `advisories`. The lock trigger compares the whole row except
--     return_risk_latest and updated_at, so this column is frozen at lock with no trigger change.

alter table public.hourly_forecasts
  add column apparent_temperature real,
  add column uv_index real check (uv_index >= 0),
  add column wind_gusts real check (wind_gusts >= 0),
  add column visibility real check (visibility >= 0),
  add column is_day boolean;

alter table public.daily_recommendations
  add column advisories jsonb not null default '[]'::jsonb
    check (jsonb_typeof(advisories) = 'array');

-- Same signature as before, so existing grants stay in place.
create or replace function public.save_forecast_batch(
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
      precipitation_probability, precipitation, rain, showers, weather_code, wind_speed,
      apparent_temperature, uv_index, wind_gusts, visibility, is_day, fetched_at
    )
    select
      p_user_id, p_location_key, p_latitude, p_longitude, r.forecast_time, r.temperature, r.humidity,
      r.precipitation_probability, r.precipitation, r.rain, r.showers, r.weather_code, r.wind_speed,
      r.apparent_temperature, r.uv_index, r.wind_gusts, r.visibility, r.is_day,
      p_fetched_at
    from jsonb_to_recordset(p_rows) as r (
      forecast_time timestamptz, temperature real, humidity smallint,
      precipitation_probability smallint, precipitation real, rain real, showers real,
      weather_code smallint, wind_speed real,
      apparent_temperature real, uv_index real, wind_gusts real, visibility real, is_day boolean
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
      apparent_temperature = excluded.apparent_temperature,
      uv_index = excluded.uv_index,
      wind_gusts = excluded.wind_gusts,
      visibility = excluded.visibility,
      is_day = excluded.is_day,
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
