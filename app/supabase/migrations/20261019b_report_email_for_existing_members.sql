-- Leak Test report email for people already on the roster (Oct 19, 2026)
-- join_roster updates an existing row on conflict, and the Day 0 email trigger only fires on
-- INSERT, so a returning member who took the Leak Test got no report email. Queue it here.
-- (The outbox's once-per-kind index means each person gets the report email at most once.)

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
  v_inserted boolean;
  v_name text;
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
  returning w.referral_code, (xmax = 0), w.name into v_code, v_inserted, v_name;

  -- Existing member who just took the Leak Test: send the report (new rows get it from the insert trigger).
  if not v_inserted and v_report is not null and (select sending_enabled from mail.settings) then
    insert into mail.outbox (to_email, first_name, kind)
    values (v_email, nullif(split_part(trim(coalesce(v_name, '')), ' ', 1), ''), 'roster_welcome')
    on conflict do nothing;
  end if;
  return v_code;
end $$;

revoke all on function public.join_roster(jsonb) from public;
grant execute on function public.join_roster(jsonb) to anon, authenticated;

-- One-time catch-up: members who already took the new Leak Test but got no report email.
insert into mail.outbox (to_email, first_name, kind)
select lower(trim(w.email)), nullif(split_part(trim(coalesce(w.name, '')), ' ', 1), ''), 'roster_welcome'
from public.waitlist w
where w.leak_report is not null and not w.is_test
on conflict do nothing;
