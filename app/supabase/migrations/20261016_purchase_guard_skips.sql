-- Applied to "Subastian's Big Project" on 2026-10-16 (migration name: purchase_guard_skips).
-- Purchase Guard: a row each time the user chose "Don't add" after a match.
create table public.guard_skips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tool_name text not null check (char_length(tool_name) between 1 and 80),
  category text not null check (category = any (array['AI tools','Analytics','Automation','Cloud storage','Communication','CRM','Design','Email marketing','Funnels & landing pages','Hosting & domains','Project management','SEO','Social scheduling','Video','Other'])),
  monthly_cost numeric(10,2) check (monthly_cost >= 0 and monthly_cost <= 100000),
  was_trial boolean not null default false,
  matched text not null check (matched in ('same_tool','similar_name','same_category','cancelled_before')),
  created_at timestamptz not null default now()
);

create index guard_skips_user_id_idx on public.guard_skips (user_id);

alter table public.guard_skips enable row level security;

create policy "Users can view their own guard skips" on public.guard_skips
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can insert their own guard skips" on public.guard_skips
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can delete their own guard skips" on public.guard_skips
  for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, delete on public.guard_skips to authenticated;
revoke all on public.guard_skips from anon;
