-- Minimal stand-in for the parts of Supabase the schema depends on, for local tests only.
-- Mirrors Supabase: roles anon / authenticated / service_role, auth.users, and auth.uid(),
-- which reads the user id from the request's JWT claims (request.jwt.claims ->> 'sub').
-- Roles are cluster-wide, so create them only once.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

create schema auth;
create table auth.users (id uuid primary key, email text);

create function auth.uid() returns uuid
language sql stable
as $$
  select nullif(
    coalesce(current_setting('request.jwt.claim.sub', true),
             (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')),
    '')::uuid
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

create schema mail;

-- Test clock: the live functions use now(); the test copies call mail.test_now() instead so
-- a test can set the time (set test.now = '2026-03-08 09:30:00+00').
create function mail.test_now() returns timestamptz
language sql stable
as $$ select coalesce(nullif(current_setting('test.now', true), '')::timestamptz, now()) $$;
