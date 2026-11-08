-- Applied to "Subastian's Big Project" on 2026-11-07 (migration name: partner_referral_tracking).
--
-- Founding Partner tracking for roster signups, before Lemon Squeezy is approved.
--   * Partner links: https://subastian.us/?ref=CODE (also accepts ?via= and ?aff=).
--   * A visit counts once per browser session per code (partner_visits).
--   * A NEW roster signup within 30 days of the visit is credited to that partner
--     (waitlist.partner_id / partner_code). Existing members are never re-credited.
--   * Only codes in affiliate_links that are active and belong to an approved partner count.
--   * Daniel's view of results: partner_stats (admins only).
--   * approve_partner(application_id, code) turns an application into a partner + link.
--     It is NOT callable from the website (no anon/authenticated execute).

-- 1. Signup attribution ---------------------------------------------------------
alter table public.waitlist
  add column if not exists partner_id uuid references public.partners(id) on delete set null,
  add column if not exists partner_code text;
create index if not exists waitlist_partner_id_idx on public.waitlist (partner_id);

-- Case-insensitive code lookups.
create unique index if not exists affiliate_links_code_lower_idx on public.affiliate_links (lower(code));

-- 2. Visits from partner links -------------------------------------------------
create table if not exists public.partner_visits (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  affiliate_link_id uuid not null references public.affiliate_links(id) on delete cascade,
  landing_path text
);
create index if not exists partner_visits_partner_idx on public.partner_visits (partner_id, created_at);
alter table public.partner_visits enable row level security;
revoke all on public.partner_visits from anon;
grant select on public.partner_visits to authenticated;
grant select, insert, delete on public.partner_visits to service_role;

drop policy if exists "Admins can view partner visits" on public.partner_visits;
create policy "Admins can view partner visits" on public.partner_visits
  for select to authenticated
  using (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())));
drop policy if exists "Partners can view their own visits" on public.partner_visits;
create policy "Partners can view their own visits" on public.partner_visits
  for select to authenticated
  using (exists (select 1 from public.partners p
                 where p.id = partner_visits.partner_id and p.auth_user_id = (select auth.uid())));

-- Shared lookup: active link of an approved partner.
create or replace function public.partner_link_for(p_code text)
returns table (link_id uuid, partner_id uuid, code text)
language sql stable security definer set search_path = ''
as $$
  select l.id, l.partner_id, l.code
    from public.affiliate_links l
    join public.partners p on p.id = l.partner_id
   where lower(l.code) = lower(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9_-]', '', 'g'))
     and l.is_active and p.status = 'approved'
   limit 1
$$;
revoke all on function public.partner_link_for(text) from public, anon, authenticated;

-- Called by roster.js when someone lands on a partner link.
-- Returns the canonical code if valid (so the browser only remembers real codes), else null.
create or replace function public.log_partner_visit(p_code text, p_path text default null)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v record;
begin
  select * into v from public.partner_link_for(p_code);
  if v.link_id is null then return null; end if;
  -- Light abuse cap: at most 500 counted visits per partner per hour.
  if (select count(*) from public.partner_visits pv
       where pv.partner_id = v.partner_id and pv.created_at > now() - interval '1 hour') < 500 then
    insert into public.partner_visits (partner_id, affiliate_link_id, landing_path)
    values (v.partner_id, v.link_id, left(p_path, 300));
  end if;
  return v.code;
end $$;
revoke all on function public.log_partner_visit(text, text) from public;
grant execute on function public.log_partner_visit(text, text) to anon, authenticated;

-- 3. join_roster: same as before, plus partner credit on NEW signups ------------
create or replace function public.join_roster(p jsonb)
 returns text
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_email text := lower(trim(regexp_replace(trim(coalesce(p->>'email', '')), '^mailto:', '', 'i')));
  v_ref text := lower(nullif(regexp_replace(coalesce(p->>'referred_by', ''), '[^A-Za-z0-9]', '', 'g'), ''));
  v_work text := nullif(p->>'work_type', '');
  v_report jsonb := case when jsonb_typeof(p->'leak_report') = 'object' then p->'leak_report' end;
  v_pid uuid;
  v_pcode text;
  v_code text;
  v_inserted boolean;
  v_name text;
  v_first text;
begin
  if char_length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid email' using errcode = '22023';
  end if;
  if v_work is not null and v_work not in ('affiliate','agency','creator','solo','it','personal') then v_work := null; end if;
  if v_report is not null and pg_column_size(v_report) >= 4000 then v_report := null; end if;
  if v_ref is not null and not exists (
       select 1 from public.waitlist w where w.referral_code = v_ref and lower(w.email) <> v_email) then
    v_ref := null;
  end if;
  if nullif(p->>'partner_code', '') is not null then
    select l.partner_id, l.code into v_pid, v_pcode from public.partner_link_for(p->>'partner_code') l;
    -- A partner can't earn credit for signing themselves up.
    if v_pid is not null and exists (
         select 1 from public.partners pp where pp.id = v_pid and lower(pp.email) = v_email) then
      v_pid := null; v_pcode := null;
    end if;
  end if;

  insert into public.waitlist as w (name, email, role, work_type, leak_report, referred_by,
      utm_source, utm_medium, utm_campaign, utm_content, referrer, landing_path, signup_form,
      partner_id, partner_code)
  values (
    left(nullif(trim(p->>'name'), ''), 120), v_email, left(p->>'role', 60), v_work, v_report, v_ref,
    left(p->>'utm_source', 100), left(p->>'utm_medium', 100), left(p->>'utm_campaign', 100),
    left(p->>'utm_content', 100), left(p->>'referrer', 500), left(p->>'landing_path', 300),
    left(p->>'signup_form', 40), v_pid, v_pcode)
  on conflict ((lower(email))) do update set
    name = coalesce(w.name, excluded.name),
    work_type = coalesce(excluded.work_type, w.work_type),
    leak_report = coalesce(excluded.leak_report, w.leak_report)
  returning w.referral_code, (xmax = 0), w.name into v_code, v_inserted, v_name;

  -- Existing member signing up again (with or without a new Leak Test): resend the welcome,
  -- at most once every 24 hours, never to someone who unsubscribed.
  -- New rows get their welcome from the insert trigger.
  -- The outbox allows one roster_welcome row per address, so we re-queue that row.
  if not v_inserted and (select sending_enabled from mail.settings)
     and not exists (select 1 from mail.unsubscribes u where u.email = v_email) then
    v_first := nullif(split_part(trim(coalesce(v_name, '')), ' ', 1), '');
    update mail.outbox o
       set status = 'pending', send_after = now(), attempts = 0, last_error = null,
           first_name = coalesce(v_first, o.first_name)
     where lower(o.to_email) = v_email and o.kind = 'roster_welcome'
       and o.status in ('sent', 'failed', 'skipped')
       and coalesce(o.last_error, '') <> 'unsubscribed'
       and coalesce(o.sent_at, o.created_at) < now() - interval '24 hours';
    if not found then
      -- No welcome row yet (e.g. joined via Audit Kit checkout): queue one.
      insert into mail.outbox (to_email, first_name, kind)
      values (v_email, v_first, 'roster_welcome')
      on conflict do nothing;
    end if;
  end if;
  return v_code;
end $function$;

-- 4. Approving a partner (run by Claude/Daniel from the dashboard, not the website) ---
create or replace function public.approve_partner(p_application_id uuid, p_code text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  a public.affiliate_applications%rowtype;
  v_partner uuid;
  v_code text := lower(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9_-]', '', 'g'));
begin
  if char_length(v_code) < 3 or char_length(v_code) > 30 then
    raise exception 'code must be 3-30 letters, digits, - or _';
  end if;
  select * into a from public.affiliate_applications where id = p_application_id;
  if a.id is null then raise exception 'application not found'; end if;

  select id into v_partner from public.partners where application_id = a.id;
  if v_partner is null then
    insert into public.partners (application_id, display_name, email, partner_type, status, approved_at)
    values (a.id, coalesce(nullif(a.company_or_brand, ''), a.full_name), lower(a.email), a.partner_type, 'approved', now())
    returning id into v_partner;
  else
    update public.partners set status = 'approved', approved_at = coalesce(approved_at, now()) where id = v_partner;
  end if;

  insert into public.affiliate_links (partner_id, code, destination_path, is_active)
  values (v_partner, v_code, '/', true);

  update public.affiliate_applications set status = 'approved', reviewed_at = now() where id = a.id;
  return 'https://subastian.us/?ref=' || v_code;
end $$;
revoke all on function public.approve_partner(uuid, text) from public, anon, authenticated;

-- 5. Results per partner (admins only) ------------------------------------------
create or replace view public.partner_stats with (security_invoker = true) as
select p.id as partner_id,
       p.display_name,
       p.email,
       p.status,
       string_agg(distinct l.code, ', ') as codes,
       (select count(*) from public.partner_visits v where v.partner_id = p.id) as visits,
       (select count(*) from public.waitlist w where w.partner_id = p.id and not coalesce(w.is_test, false)) as roster_signups,
       (select max(w.created_at) from public.waitlist w where w.partner_id = p.id and not coalesce(w.is_test, false)) as last_signup_at
  from public.partners p
  left join public.affiliate_links l on l.partner_id = p.id
 group by p.id;
revoke all on public.partner_stats from anon;
grant select on public.partner_stats to authenticated;
