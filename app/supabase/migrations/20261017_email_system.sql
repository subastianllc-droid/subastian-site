-- Applied to "Subastian's Big Project" on 2026-10-17 as migrations email_system + email_sender_schedule.
-- Private schema "mail" (not exposed to the website's API): outbox queue, unsubscribes, settings.
-- Kept here for the record; see app/supabase/functions/email-sender for the sender.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create schema if not exists mail;
revoke all on schema mail from public, anon, authenticated;

create table mail.settings (
  id boolean primary key default true check (id),
  sending_enabled boolean not null default false,
  daily_cap int not null default 90,
  from_address text not null default 'Daniel at Subastian <daniel@subastian.us>',
  reply_to text not null default 'daniel@subastian.us',
  postal_address text not null default 'Subastian, LLC, 4400 S Quebec St, Unit A204, Denver, CO 80237',
  cron_secret text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  unsub_secret text not null default encode(extensions.gen_random_bytes(24), 'hex')
);
insert into mail.settings default values;

create table mail.outbox (
  id bigint generated always as identity primary key,
  to_email text not null,
  first_name text,
  kind text not null check (kind in ('roster_welcome','roster_day2','roster_day5','partner_kit','partner_launch_link','test')),
  send_after timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending','sent','skipped','failed')),
  attempts int not null default 0,
  last_error text,
  resend_id text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index outbox_once_per_kind on mail.outbox (lower(to_email), kind) where kind <> 'test';
create index outbox_due on mail.outbox (send_after) where status = 'pending';

create table mail.unsubscribes (email text primary key, created_at timestamptz not null default now());

alter table mail.settings enable row level security;
alter table mail.outbox enable row level security;
alter table mail.unsubscribes enable row level security;
revoke all on all tables in schema mail from public, anon, authenticated;

create or replace function mail.enqueue_roster() returns trigger
language plpgsql security definer set search_path = '' as $$
declare first text := nullif(split_part(trim(coalesce(new.name,'')), ' ', 1), '');
begin
  if new.is_test or not (select sending_enabled from mail.settings) then return new; end if;
  insert into mail.outbox (to_email, first_name, kind, send_after) values
    (lower(trim(new.email)), first, 'roster_welcome', now()),
    (lower(trim(new.email)), first, 'roster_day2', now() + interval '2 days'),
    (lower(trim(new.email)), first, 'roster_day5', now() + interval '5 days')
  on conflict do nothing;
  return new;
end $$;

create or replace function mail.enqueue_partner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not (select sending_enabled from mail.settings) then return new; end if;
  insert into mail.outbox (to_email, first_name, kind)
  values (lower(trim(new.email)), nullif(split_part(trim(coalesce(new.full_name,'')), ' ', 1), ''), 'partner_kit')
  on conflict do nothing;
  return new;
end $$;

revoke all on function mail.enqueue_roster() from public, anon, authenticated;
revoke all on function mail.enqueue_partner() from public, anon, authenticated;
create trigger waitlist_enqueue_emails after insert on public.waitlist for each row execute function mail.enqueue_roster();
create trigger affiliate_application_enqueue_email after insert on public.affiliate_applications for each row execute function mail.enqueue_partner();

-- Every 5 minutes, ask the email-sender function to send whatever is due.
create or replace function mail.run_sender(body jsonb default '{}'::jsonb) returns bigint
language sql security definer set search_path = '' as $$
  select net.http_post(
    url := 'https://yhasuhzqykikacwezwyu.supabase.co/functions/v1/email-sender',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select cron_secret from mail.settings)),
    body := body,
    timeout_milliseconds := 60000);
$$;
revoke all on function mail.run_sender(jsonb) from public, anon, authenticated;
select cron.schedule('subastian-email-sender', '*/5 * * * *', $$select mail.run_sender()$$);
