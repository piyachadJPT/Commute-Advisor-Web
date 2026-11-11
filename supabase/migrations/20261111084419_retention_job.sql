-- Retention (plan §6.9).
-- Forecasts, sync logs, notification logs and job runs are kept 14 days.
-- daily_recommendations and skipped_days are kept forever (~250 rows per user per year).

create function public.run_retention()
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_cutoff timestamptz := now() - interval '14 days';
  v_forecasts integer;
  v_sync_logs integer;
  v_notifications integer;
  v_job_runs integer;
begin
  delete from public.hourly_forecasts where fetched_at < v_cutoff;
  get diagnostics v_forecasts = row_count;

  delete from public.forecast_sync_logs where fetched_at < v_cutoff;
  get diagnostics v_sync_logs = row_count;

  delete from public.notification_logs where created_at < v_cutoff;
  get diagnostics v_notifications = row_count;

  delete from public.job_runs where started_at < v_cutoff;
  get diagnostics v_job_runs = row_count;

  return jsonb_build_object(
    'hourly_forecasts', v_forecasts,
    'forecast_sync_logs', v_sync_logs,
    'notification_logs', v_notifications,
    'job_runs', v_job_runs
  );
end;
$$;
-- Run by pg_cron (as postgres) and by service_role for manual runs and tests. Not by app users.
revoke execute on function public.run_retention() from public, anon, authenticated, service_role;
grant execute on function public.run_retention() to service_role;

-- pg_cron uses UTC: 20:00 UTC is 03:00 Asia/Bangkok. cron.schedule with a name replaces any
-- existing job of that name, so this migration is safe to re-run.
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('retention', '0 20 * * *', 'select public.run_retention()');
