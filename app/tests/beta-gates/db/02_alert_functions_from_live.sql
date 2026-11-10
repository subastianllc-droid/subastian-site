-- mail.claim_due_alerts and mail.roll_renewals, copied from the LIVE database (pg_get_functiondef,
-- 2026-11-09). The ONLY change: now() is replaced by mail.test_now() so tests can set the clock.
-- Everything else (time-zone math, 8am rule, stages, alert_log dedupe) is the live logic.

create or replace function mail.claim_due_alerts(p_max_people integer default 20)
returns table (user_id uuid, email text, full_name text, items jsonb)
language sql
security definer
set search_path = ''
as $$
  with people as (
    select p.id, p.email, p.full_name,
           (mail.test_now() at time zone p.time_zone) as local_now
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

create or replace function mail.roll_renewals()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  d date;
  step interval;
  n integer := 0;
  k integer;
begin
  for r in
    select s.id, s.renewal_date, s.billing_cycle, (mail.test_now() at time zone p.time_zone)::date as today
    from public.subscriptions s
    join public.profiles p on p.id = s.user_id
    where s.status = 'active'
      and s.renewal_date is not null
      and s.renewal_date < (mail.test_now() at time zone p.time_zone)::date
  loop
    step := case r.billing_cycle when 'yearly' then interval '1 year' else interval '1 month' end;
    k := 1;
    loop
      d := (r.renewal_date + k * step)::date;
      exit when d >= r.today;
      k := k + 1;
    end loop;
    update public.subscriptions set renewal_date = d where id = r.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function mail.roll_renewals() from public, anon, authenticated;
