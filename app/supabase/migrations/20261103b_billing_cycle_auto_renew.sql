-- Automatic renewal dates: each subscription knows how often it bills, and the day after a
-- renewal date passes (in the user's own time zone), the date moves to the next billing date.
-- No more clicking "Mark renewed" every month.

alter table public.subscriptions
  add column if not exists billing_cycle text not null default 'monthly'
  check (billing_cycle in ('monthly', 'yearly'));

-- Table-level insert/update grants for authenticated already cover the new column; RLS limits
-- users to their own rows.

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
    select s.id, s.renewal_date, s.billing_cycle, (now() at time zone p.time_zone)::date as today
    from public.subscriptions s
    join public.profiles p on p.id = s.user_id
    where s.status = 'active'
      and s.renewal_date is not null
      and s.renewal_date < (now() at time zone p.time_zone)::date
  loop
    step := case r.billing_cycle when 'yearly' then interval '1 year' else interval '1 month' end;
    -- Count whole cycles from the stored date, so Jan 31 + 2 months is Mar 31, not Mar 28.
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

-- Hourly, a couple of minutes before the renewal alerts run (:07).
select cron.unschedule('subastian-roll-renewals')
where exists (select 1 from cron.job where jobname = 'subastian-roll-renewals');
select cron.schedule('subastian-roll-renewals', '5 * * * *', 'select mail.roll_renewals()');
