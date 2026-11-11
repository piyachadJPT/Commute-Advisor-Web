-- Scheduler tick (plan §13.1).
-- pg_cron runs this every 10 minutes and pg_net calls the app's tick endpoint with a bearer
-- secret. Neither the app URL nor the secret is written here: both are read from Supabase
-- Vault, so the migration holds no credentials. Until they exist the job does nothing.
--
-- Create them once, in the SQL editor (not in a migration):
--   select vault.create_secret('https://your-app.vercel.app', 'app_url');
--   select vault.create_secret('<same value as JOB_SECRET>',   'job_secret');

create extension if not exists pg_net;

create function private.invoke_tick()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'app_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'job_secret';

  if v_url is null or v_secret is null then
    raise notice 'commute-tick skipped: Vault secrets app_url and job_secret are not both set';
    return;
  end if;

  perform net.http_post(
    url := rtrim(v_url, '/') || '/api/jobs/tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
end;
$$;
-- Only pg_cron (running as postgres) calls this. It reads secrets, so no API role may.
revoke execute on function private.invoke_tick() from public, anon, authenticated, service_role;

-- cron.schedule with a name replaces any job of that name, so this is safe to re-run.
select cron.schedule('commute-tick', '*/10 * * * *', 'select private.invoke_tick()');
