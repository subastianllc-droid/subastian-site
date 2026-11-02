-- Phase 3: renewal and free-trial alert emails at 30, 7, 3 and 1 days out, and on the day.
-- The renewal-alerts Edge Function runs hourly, calls mail.claim_due_alerts() and sends one
-- email per person listing everything due. Each (subscription, stage, date) is logged once in
-- public.alert_log, so nobody gets the same reminder twice.

-- 1. Per-user settings on profiles -------------------------------------------------------
alter table public.profiles
  add column if not exists time_zone text not null default 'America/Denver',
  add column if not exists alerts_enabled boolean not null default true;

-- Only real IANA zone names, so the hourly job can never fail on a bad value.
create or replace function public.check_profile_time_zone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.time_zone) then
    raise exception 'Unknown time zone: %', new.time_zone using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists check_profile_time_zone on public.profiles;
create trigger check_profile_time_zone
  before insert or update of time_zone on public.profiles
  for each row execute function public.check_profile_time_zone();

-- Users may change these two (the existing UPDATE policy limits them to their own row).
-- plan_tier, ls_* and subscription_status stay off limits.
grant update (time_zone, alerts_enabled) on public.profiles to authenticated;

-- 2. alert_log: what was sent and how ---------------------------------------------------
-- renewal_date holds the date the alert is about: the renewal date, or the trial end date.
alter table public.alert_log
  add column if not exists kind text check (kind in ('renewal', 'trial')),
  add column if not exists resend_id text;

create index if not exists alert_log_sent_at_idx on public.alert_log (sent_at);

-- Users read their own log; only the Edge Function (as postgres) writes it.
revoke all on public.alert_log from anon;
revoke insert, update, delete, truncate, references, trigger on public.alert_log from authenticated;
grant select on public.alert_log to authenticated;
grant select, insert, update, delete on public.alert_log to service_role;

-- 3. Where the "Open Subastian" link in alerts points ------------------------------------
alter table mail.settings add column if not exists app_url text
  check (app_url is null or app_url ~ '^https://[^\s]+$');

-- 4. Claim everything due right now ------------------------------------------------------
-- For each person with alerts on, where it's 8am or later in their time zone:
-- active subscriptions renewing, and free trials ending, exactly 30/7/3/1/0 days from their today.
-- Claimed rows are written to alert_log before sending; the sender deletes them again if the
-- email fails, so the next hourly run retries.
create or replace function mail.claim_due_alerts(p_max_people integer default 20)
returns table (user_id uuid, email text, full_name text, items jsonb)
language sql
security definer
set search_path = ''
as $$
  with people as (
    select p.id, p.email, p.full_name,
           (now() at time zone p.time_zone) as local_now
    from public.profiles p
    where p.alerts_enabled and p.email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  ),
  due as (
    select pe.id as uid, s.id as sid,
           case when s.status = 'trial' then 'trial' else 'renewal' end as kind,
           case when s.status = 'trial' then s.trial_ends_at else s.renewal_date end as due_date,
           pe.local_now::date as today
    from people pe
    join public.subscriptions s on s.user_id = pe.id
    where extract(hour from pe.local_now) >= 8
      and s.status in ('trial', 'active')
  ),
  pending as (
    select d.*, (d.due_date - d.today) as stage
    from due d
    where d.due_date is not null
      and (d.due_date - d.today) in (30, 7, 3, 1, 0)
      and not exists (
        select 1 from public.alert_log a
        where a.subscription_id = d.sid and a.stage = (d.due_date - d.today) and a.renewal_date = d.due_date)
  ),
  pick as (
    select distinct uid from pending order by uid limit greatest(p_max_people, 0)
  ),
  claimed as (
    insert into public.alert_log (subscription_id, user_id, stage, renewal_date, kind)
    select pe.sid, pe.uid, pe.stage, pe.due_date, pe.kind
    from pending pe
    where pe.uid in (select uid from pick)
    on conflict (subscription_id, stage, renewal_date) do nothing
    returning id, subscription_id, user_id, stage, renewal_date, kind
  )
  select c.user_id, p.email, p.full_name,
         jsonb_agg(jsonb_build_object(
           'log_id', c.id, 'tool', s.tool_name, 'category', s.category, 'kind', c.kind,
           'stage', c.stage, 'date', c.renewal_date, 'monthly_cost', s.monthly_cost)
           order by c.stage, s.tool_name) as items
  from claimed c
  join public.subscriptions s on s.id = c.subscription_id
  join public.profiles p on p.id = c.user_id
  group by c.user_id, p.email, p.full_name;
$$;

revoke all on function mail.claim_due_alerts(integer) from public, anon, authenticated;

-- 5. Run it every hour --------------------------------------------------------------------
create or replace function mail.run_alerts(body jsonb default '{}'::jsonb)
returns bigint
language sql
security definer
set search_path = ''
as $$
  select net.http_post(
    url := 'https://yhasuhzqykikacwezwyu.supabase.co/functions/v1/renewal-alerts',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select cron_secret from mail.settings)),
    body := body,
    timeout_milliseconds := 60000);
$$;

revoke all on function mail.run_alerts(jsonb) from public, anon, authenticated;

select cron.unschedule('subastian-renewal-alerts')
where exists (select 1 from cron.job where jobname = 'subastian-renewal-alerts');
select cron.schedule('subastian-renewal-alerts', '7 * * * *', 'select mail.run_alerts()');
