-- v2.2: a second push per commute day, about an hour before the return trip, sent only when
-- the live return forecast disagrees with the morning one. Each message now has a slot, and
-- the once-per-day claim is per slot instead of per day.

alter table public.notification_logs
  add column slot text not null default 'morning'
    check (slot in ('morning', 'return'));

alter table public.notification_logs
  drop constraint notification_logs_unique;

-- At most one message per user, per day, per slot (§6.6, §13.1).
alter table public.notification_logs
  add constraint notification_logs_unique unique (user_id, target_date, slot);

alter table public.notification_logs
  drop constraint notification_logs_kind_check;

alter table public.notification_logs
  add constraint notification_logs_kind_check
    check (kind in ('recommendation', 'stale', 'generic', 'return_update'));
