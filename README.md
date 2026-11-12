# Commute Advisor

Personal web app (PWA) that recommends a car or a motorcycle for the day's commute, from the
hourly chance of rain at home and at work. Next.js 16 on Vercel, Supabase (Postgres, Auth,
pg_cron), Open-Meteo for weather. Single owner, non-commercial, free tiers only.

Design and behaviour: [commute_advisor_plan.md](commute_advisor_plan.md). Build history and
decisions: [PROGRESS.md](PROGRESS.md).

## Run locally

Needs Node 22, Docker and the Supabase CLI.

```bash
npm ci
supabase start                          # local stack; first run pulls images
cp .env.example .env.local              # fill the two NEXT_PUBLIC_SUPABASE_* values from `supabase status -o env`
npm run dev:user -- you@example.test    # public sign-up is off, so create the local user here
npm run dev                             # http://localhost:3000/login, the code arrives in Mailpit http://127.0.0.1:54324
```

| Command                                | Purpose                                                                |
| -------------------------------------- | ---------------------------------------------------------------------- |
| `npm run test:tz`                      | Unit tests under `TZ=UTC` and `TZ=Asia/Bangkok` (no Docker)            |
| `npm run test:db`                      | Database and RLS tests. Local stack only: they create and delete users |
| `npm run typecheck` / `lint` / `build` | Checks before a deploy                                                 |
| `npm run db:reset` / `db:types`        | Re-apply migrations locally / regenerate `src/lib/database.types.ts`   |
| `npm run backfill`                     | Fill History with past recommendations (dry run; see PROGRESS.md)      |

Never run `test:db` against the hosted project.

## Environment variables

See [.env.example](.env.example). Set the same names in Vercel (Project Settings → Environment
Variables). Only `NEXT_PUBLIC_*` values reach the browser.

| Variable                                                             | Where it is used                         |
| -------------------------------------------------------------------- | ---------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`   | App (build fails without them)           |
| `SUPABASE_SERVICE_ROLE_KEY`                                          | Scheduler jobs, backfill                 |
| `JOB_SECRET`                                                         | `/api/jobs/tick`, called by pg_cron      |
| `CRON_SECRET`                                                        | `/api/jobs/daily`, called by Vercel Cron |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Web Push                                 |

## Set up a hosted project (once)

1. **Database.** `supabase link` the project, then `supabase db push --remote`. Without `--remote`
   the CLI (v3) targets the local stack.
2. **Auth, in the Supabase dashboard** (none of this is applied by migrations):
   - Turn **off** "Allow new users to sign up", then invite the owner.
   - Email OTP expiration 600 seconds. Leave the code length at the default; the form accepts 6–8 digits.
   - Custom SMTP, then paste `supabase/templates/magic_link.html` as the Magic Link template so the
     email shows `{{ .Token }}`. With Gmail use an **App password**, not the account password, and
     check that the browser did not autofill the Subject or Password fields.
   - Site URL and the redirect allow-list: the production URL.
3. **Vercel.** Deploy in the Singapore region and set the environment variables above.
4. **Scheduler secrets.** In the Supabase SQL editor (the values are not stored in any file):

   ```sql
   select vault.create_secret('https://<your-app>.vercel.app', 'app_url');
   select vault.create_secret('<same value as JOB_SECRET>', 'job_secret');
   ```

   pg_cron then calls `/api/jobs/tick` every 10 minutes. Check that `job_runs` gets a new row
   every 10 minutes, or open Settings → About, which shows the last tick.

## Operating it

- **Rotate a secret.** `JOB_SECRET`: create a new value, update the Vercel variable and the Vault
  secret (`vault.update_secret(<secret id>, '<new value>')`) together, then redeploy. `CRON_SECRET`: update Vercel and redeploy.
  VAPID keys: generating new ones invalidates every push subscription, so each device has to turn
  notifications off and on again. Service-role key: roll it in the Supabase dashboard, then update Vercel.
- **Project paused.** Supabase Free pauses a project after about a week of low activity, and a
  paused project stops pg_cron. Restore it from the dashboard. The daily Vercel Cron job and normal
  use normally keep it awake. If Settings → About says automatic updates have stopped, this is the
  first thing to check.
- **Backup.** The Free plan has no backups. To keep the history, run
  `supabase db dump --remote --data-only -f backup.sql` now and then. The file contains your home
  and work coordinates, so store it privately.
- **iPhone.** Push works only for the app added to the Home Screen (iOS 16.4+). Sign in inside the
  installed app, because it does not share cookies with Safari.

## Data

Weather data by [Open-Meteo.com](https://open-meteo.com/), licensed CC BY 4.0, free for
non-commercial use. The attribution is shown in Settings → About.
