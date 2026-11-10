-- Renewal alerts: capped retries, a one-day catch-up, and month-end renewals that keep their day.
--
-- 1. Retries. A failed send used to delete its alert_log rows, so the next hourly run tried again,
--    every hour until the stage day ended (16 tries for an address that always bounces). Now the
--    rows stay and count attempts: retry after 1 hour, then 3 hours, then give up (3 attempts).
--    The rows keep their ids, so the Resend Idempotency-Key is the same on every retry and an email
--    Resend accepted (but whose reply was lost) isn't sent twice.
--    A claim is a 15-minute lease: if the sender dies mid-run, the next run picks the rows up again.
-- 2. Catch-up. If no run reaches someone on a stage day (an outage, or 8am local in a DST gap),
--    the alert goes out the next day instead, saying the real number of days left. Only one day
--    late, and only for subscriptions that already existed on the stage day.
-- 3. Month-end. A renewal on the 31st became the 28th after February and stayed there. Each
--    subscription now remembers its day of the month (renewal_anchor_day) and rolls onto it,
--    or onto the month's last day when the month is shorter.

-- 1. alert_log: send attempts -----------------------------------------------------------------
alter table public.alert_log
  add column if not exists attempts smallint not null default 0,
  add column if not exists retry_after timestamptz,
  add column if not exists last_error text;

create or replace function mail.alert_send_failed(p_ids uuid[], p_error text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.alert_log
  set attempts = attempts + 1,
      last_error = left(p_error, 500),
      retry_after = now() + case when attempts = 0 then interval '1 hour' else interval '3 hours' end
  where id = any(p_ids) and resend_id is null;
$$;
revoke all on function mail.alert_send_failed(uuid[], text) from public, anon, authenticated;

-- 3. subscriptions: day of the month a renewal belongs on -------------------------------------
alter table public.subscriptions
  add column if not exists renewal_anchor_day smallint check (renewal_anchor_day between 1 and 31);
update public.subscriptions
  set renewal_anchor_day = extract(day from renewal_date)
  where renewal_date is not null and renewal_anchor_day is null;

-- Any date set by a person (form, import) sets the anchor; mail.roll_renewals moving it does not.
create or replace function public.set_renewal_anchor_day()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.renewal_date is null then
    new.renewal_anchor_day := null;
  elsif coalesce(current_setting('mail.rolling', true), '') <> 'on' then
    new.renewal_anchor_day := extract(day from new.renewal_date);
  end if;
  return new;
end;
$$;
drop trigger if exists set_subscriptions_renewal_anchor on public.subscriptions;
create trigger set_subscriptions_renewal_anchor
  before insert or update of renewal_date on public.subscriptions
  for each row execute function public.set_renewal_anchor_day();

-- base + n months, landing on day `anchor` (or the month's last day when the month is shorter).
create or replace function mail.add_months_on_day(base date, months integer, anchor integer)
returns date
language sql
immutable
set search_path = ''
as $$
  select (date_trunc('month', base) + make_interval(months => months))::date
         + (least(anchor, extract(day from (date_trunc('month', base) + make_interval(months => months + 1) - interval '1 day'))::integer) - 1);
$$;

create or replace function mail.roll_renewals()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  d date;
  step integer;
  n integer := 0;
  k integer;
begin
  perform set_config('mail.rolling', 'on', true);
  for r in
    select s.id, s.renewal_date, s.billing_cycle,
           coalesce(s.renewal_anchor_day, extract(day from s.renewal_date)::integer) as anchor,
           (now() at time zone p.time_zone)::date as today
    from public.subscriptions s
    join public.profiles p on p.id = s.user_id
    where s.status = 'active'
      and s.renewal_date is not null
      and s.renewal_date < (now() at time zone p.time_zone)::date
  loop
    step := case r.billing_cycle when 'yearly' then 12 else 1 end;
    k := 1;
    loop
      d := mail.add_months_on_day(r.renewal_date, k * step, r.anchor);
      exit when d >= r.today;
      k := k + 1;
    end loop;
    update public.subscriptions set renewal_date = d where id = r.id;
    n := n + 1;
  end loop;
  perform set_config('mail.rolling', '', true);
  return n;
end;
$$;
revoke all on function mail.roll_renewals() from public, anon, authenticated;

-- 1 + 2. claim_due_alerts: leases, retries and the one-day catch-up -----------------------------
-- alert_log.stage stays the stage slot (30/7/3/1/0) so each slot is sent once; the email item's
-- "stage" is the real number of days left, which is what the email text uses.
create or replace function mail.claim_due_alerts(p_max_people integer default 20)
returns table (user_id uuid, email text, full_name text, items jsonb)
language sql
security definer
set search_path = ''
as $$
  with people as (
    select p.id, p.email, p.full_name, p.time_zone,
           (now() at time zone p.time_zone) as local_now
    from public.profiles p
    where p.alerts_enabled and p.email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  ),
  due as (
    select pe.id as uid, s.id as sid,
           case when s.status = 'trial' then 'trial' else 'renewal' end as kind,
           case when s.status = 'trial' then s.trial_ends_at else s.renewal_date end as due_date,
           pe.local_now::date as today,
           (s.created_at at time zone pe.time_zone)::date as created_on
    from people pe
    join public.subscriptions s on s.user_id = pe.id
    where extract(hour from pe.local_now) >= 8
      and s.status in ('trial', 'active')
  ),
  slotted as (
    select d.*, (d.due_date - d.today) as days_left,
           (select min(x) from unnest(array[30, 7, 3, 1, 0]) as x
            where x >= d.due_date - d.today and x - (d.due_date - d.today) <= 1) as slot
    from due d
    where d.due_date is not null and (d.due_date - d.today) between 0 and 30
  ),
  pending as (
    select sl.*
    from slotted sl
    where sl.slot is not null
      and (sl.slot = sl.days_left or sl.created_on <= sl.due_date - sl.slot)
      and not exists (
        select 1 from public.alert_log a
        where a.subscription_id = sl.sid and a.stage = sl.slot and a.renewal_date = sl.due_date
          and (a.resend_id is not null or a.attempts >= 3
               or coalesce(a.retry_after, a.sent_at + interval '15 minutes') > now()))
  ),
  pick as (
    select distinct uid from pending order by uid limit greatest(p_max_people, 0)
  ),
  claimed as (
    insert into public.alert_log as a (subscription_id, user_id, stage, renewal_date, kind, sent_at, retry_after)
    select pe.sid, pe.uid, pe.slot, pe.due_date, pe.kind, now(), now() + interval '15 minutes'
    from pending pe
    where pe.uid in (select uid from pick)
    on conflict (subscription_id, stage, renewal_date) do update
      set sent_at = now(), retry_after = now() + interval '15 minutes'
      where a.resend_id is null and a.attempts < 3
        and coalesce(a.retry_after, a.sent_at + interval '15 minutes') <= now()
    returning a.id, a.subscription_id, a.user_id, a.stage, a.renewal_date, a.kind
  )
  select c.user_id, p.email, p.full_name,
         jsonb_agg(jsonb_build_object(
           'log_id', c.id, 'tool', s.tool_name, 'category', s.category, 'kind', c.kind,
           'stage', pe.days_left, 'slot', c.stage, 'date', c.renewal_date, 'monthly_cost', s.monthly_cost)
           order by pe.days_left, s.tool_name) as items
  from claimed c
  join pending pe on pe.sid = c.subscription_id
  join public.subscriptions s on s.id = c.subscription_id
  join public.profiles p on p.id = c.user_id
  group by c.user_id, p.email, p.full_name;
$$;
revoke all on function mail.claim_due_alerts(integer) from public, anon, authenticated;
