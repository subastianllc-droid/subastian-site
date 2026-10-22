-- Applied to "Subastian's Big Project" on 2026-10-22 (migration name: explicit_data_api_grants).
-- Supabase change (Oct 30, 2026): new tables in "public" no longer get Data API
-- grants automatically, including when migrations are replayed (new project,
-- preview branch, `supabase db reset`). guard_skips was the only table whose
-- migration relied on the old default for service_role (used by Edge Functions
-- such as the upcoming Lemon Squeezy webhook). No-op on the live database.
grant select, insert, update, delete on public.guard_skips to service_role;
