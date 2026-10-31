-- Pre-launch funnel (Oct 19, 2026)
-- Leak Test segments + report on the roster row, personal referral codes with the
-- refer-3 reward, Audit Kit buyers from Gumroad, broadcast emails (Friday build log,
-- launch sequence), and a roster count that only shows once it's real (100+).

-- 1. Roster columns -------------------------------------------------------------
alter table public.waitlist
  add column if not exists work_type text
    check (work_type is null or work_type in ('affiliate','agency','creator','solo','it','personal')),
  add column if not exists leak_report jsonb
    check (leak_report is null or (jsonb_typeof(leak_report) = 'object' and pg_column_size(leak_report) < 4000)),
  add column if not exists referral_code text
    default substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
  add column if not exists referred_by text
    check (referred_by is null or referred_by ~ '^[a-z0-9]{8}$'),
  add column if not exists kit_buyer boolean not null default false,
  add column if not exists reward_queued_at timestamptz;

update public.waitlist set referral_code = substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)
where referral_code is null;
alter table public.waitlist alter column referral_code set not null;
create unique index if not exists waitlist_referral_code_key on public.waitlist (referral_code);
create index if not exists waitlist_referred_by_idx on public.waitlist (referred_by) where referred_by is not null;

comment on column public.waitlist.work_type is 'Leak Test answer to "What kind of work do you do?" Used to segment the Day 2 email.';
comment on column public.waitlist.leak_report is 'Score, band, monthly/yearly estimate and top fixes from the Leak Test. Sent in the Day 0 email.';
comment on column public.waitlist.referral_code is 'Personal share code: subastian.us/?r=<code>. 3 signups through it earn the Audit Kit free.';

-- 2. Mail settings ---------------------------------------------------------------
alter table mail.settings
  add column if not exists gumroad_token text not null default encode(gen_random_bytes(24), 'hex'),
  add column if not exists gumroad_seller_id text,
  add column if not exists referral_kit_url text;

comment on column mail.settings.referral_kit_url is 'Gumroad link with a 100%-off code for the refer-3 reward. Reward emails wait until this is set.';

-- 3. Kit buyers (from the Gumroad ping) -------------------------------------------
create table if not exists mail.kit_buyers (
  email text primary key,
  sale_id text,
  purchased_at timestamptz not null default now(),
  refunded boolean not null default false,
  wants_roster boolean not null default false
);
alter table mail.kit_buyers enable row level security;

-- 4. Broadcasts (Friday build log, launch emails) ---------------------------------
create table if not exists mail.broadcasts (
  id bigint generated always as identity primary key,
  slug text not null unique,
  subject text not null check (char_length(subject) between 3 and 150),
  body text not null check (char_length(body) between 20 and 20000),
  approved_at timestamptz,
  send_at timestamptz,
  queued_at timestamptz,
  created_at timestamptz not null default now()
);
alter table mail.broadcasts enable row level security;
comment on table mail.broadcasts is 'One email to the whole roster. Nothing goes out until approved_at and send_at are set.';

alter table mail.outbox add column if not exists broadcast_id bigint references mail.broadcasts(id);
alter table mail.outbox drop constraint if exists outbox_kind_check;
alter table mail.outbox add constraint outbox_kind_check check (kind = any (array[
  'roster_welcome','roster_day2','roster_day5','partner_kit','partner_launch_link',
  'kit_followup','referral_reward','broadcast','test']));
drop index if exists mail.outbox_once_per_kind;
create unique index outbox_once_per_kind on mail.outbox (lower(to_email), kind, coalesce(broadcast_id, 0))
  where kind <> 'test';

-- 5. Join the roster (website forms call this) ---------------------------------
create or replace function public.join_roster(p jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(coalesce(p->>'email', '')));
  v_ref text := lower(nullif(regexp_replace(coalesce(p->>'referred_by', ''), '[^A-Za-z0-9]', '', 'g'), ''));
  v_work text := nullif(p->>'work_type', '');
  v_report jsonb := case when jsonb_typeof(p->'leak_report') = 'object' then p->'leak_report' end;
  v_code text;
begin
  if char_length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid email' using errcode = '22023';
  end if;
  if v_work is not null and v_work not in ('affiliate','agency','creator','solo','it','personal') then v_work := null; end if;
  if v_report is not null and pg_column_size(v_report) >= 4000 then v_report := null; end if;
  -- A referral only counts if the code belongs to someone else already on the roster.
  if v_ref is not null and not exists (
       select 1 from public.waitlist w where w.referral_code = v_ref and lower(w.email) <> v_email) then
    v_ref := null;
  end if;

  insert into public.waitlist as w (name, email, role, work_type, leak_report, referred_by,
      utm_source, utm_medium, utm_campaign, utm_content, referrer, landing_path, signup_form)
  values (
    left(nullif(trim(p->>'name'), ''), 120), v_email, left(p->>'role', 60), v_work, v_report, v_ref,
    left(p->>'utm_source', 100), left(p->>'utm_medium', 100), left(p->>'utm_campaign', 100),
    left(p->>'utm_content', 100), left(p->>'referrer', 500), left(p->>'landing_path', 300),
    left(p->>'signup_form', 40))
  on conflict ((lower(email))) do update set
    name = coalesce(w.name, excluded.name),
    work_type = coalesce(excluded.work_type, w.work_type),
    leak_report = coalesce(excluded.leak_report, w.leak_report)
  returning w.referral_code into v_code;
  return v_code;
end $$;

revoke all on function public.join_roster(jsonb) from public;
grant execute on function public.join_roster(jsonb) to anon, authenticated;

-- 6. Refer-3 reward --------------------------------------------------------------
create or replace function mail.check_referral_reward()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare r record;
begin
  if new.referred_by is null or new.is_test then return new; end if;
  select w.id, w.email, w.name into r
  from public.waitlist w
  where w.referral_code = new.referred_by and w.reward_queued_at is null and not w.is_test
    and (select count(*) from public.waitlist x
         where x.referred_by = new.referred_by and not x.is_test) >= 3
  for update;
  if found then
    update public.waitlist set reward_queued_at = now() where id = r.id;
    insert into mail.outbox (to_email, first_name, kind)
    values (lower(trim(r.email)), nullif(split_part(trim(coalesce(r.name, '')), ' ', 1), ''), 'referral_reward')
    on conflict do nothing;
  end if;
  return new;
end $$;

drop trigger if exists waitlist_referral_reward on public.waitlist;
create trigger waitlist_referral_reward after insert on public.waitlist
  for each row execute function mail.check_referral_reward();

-- 7. Kit buyers join the roster when they tick the checkout box -------------------
create or replace function mail.record_kit_sale(p_email text, p_sale_id text, p_wants_roster boolean, p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_email text := lower(trim(p_email));
begin
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return; end if;
  insert into mail.kit_buyers (email, sale_id, wants_roster)
  values (v_email, p_sale_id, coalesce(p_wants_roster, false))
  on conflict (email) do update set sale_id = excluded.sale_id, refunded = false,
    wants_roster = mail.kit_buyers.wants_roster or excluded.wants_roster;
  update public.waitlist set kit_buyer = true where lower(email) = v_email;
  -- The how-to + $49 audit offer goes to every buyer; it's about the purchase they just made.
  insert into mail.outbox (to_email, first_name, kind)
  values (v_email, nullif(split_part(trim(coalesce(p_name, '')), ' ', 1), ''), 'kit_followup')
  on conflict do nothing;
  if p_wants_roster then
    insert into public.waitlist (name, email, signup_form, kit_buyer, utm_source)
    values (left(nullif(trim(p_name), ''), 120), v_email, 'kit_checkout', true, 'gumroad')
    on conflict ((lower(email))) do update set kit_buyer = true;
  end if;
end $$;
revoke all on function mail.record_kit_sale(text, text, boolean, text) from public;

-- 8. Queue approved broadcasts (called by cron every 5 minutes) -------------------
create or replace function mail.queue_broadcasts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare b record; n integer := 0; c integer;
begin
  for b in select id from mail.broadcasts
           where approved_at is not null and send_at <= now() and queued_at is null
           for update skip locked loop
    insert into mail.outbox (to_email, first_name, kind, broadcast_id, send_after)
    select lower(trim(w.email)), nullif(split_part(trim(coalesce(w.name, '')), ' ', 1), ''),
           'broadcast', b.id, now()
    from public.waitlist w
    where not w.is_test
      and not exists (select 1 from mail.unsubscribes u where u.email = lower(trim(w.email)))
    on conflict do nothing;
    get diagnostics c = row_count;
    n := n + c;
    update mail.broadcasts set queued_at = now() where id = b.id;
  end loop;
  return n;
end $$;
revoke all on function mail.queue_broadcasts() from public;

select cron.unschedule('subastian-queue-broadcasts')
where exists (select 1 from cron.job where jobname = 'subastian-queue-broadcasts');
select cron.schedule('subastian-queue-broadcasts', '*/5 * * * *', 'select mail.queue_broadcasts()');

-- 9. Public roster count, only once it's worth showing ----------------------------
create or replace function public.roster_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case when n >= 100 then n end
  from (select count(*)::int n from public.waitlist where not is_test) s;
$$;
revoke all on function public.roster_count() from public;
grant execute on function public.roster_count() to anon, authenticated;

-- 10. Direct inserts can't fake referrals or buyer status (forms use join_roster) --
drop policy if exists "anon can join waitlist" on public.waitlist;
create policy "anon can join waitlist" on public.waitlist for insert to anon, authenticated
  with check (is_test = false and imported_from is null and referred_by is null
              and kit_buyer = false and reward_queued_at is null and leak_report is null);
