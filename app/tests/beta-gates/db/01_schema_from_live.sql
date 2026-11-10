-- Copied from the LIVE Supabase project (yhasuhzqykikacwezwyu) on 2026-11-09 with read-only
-- catalog queries (pg_attribute, pg_constraint, pg_policies, information_schema grants,
-- pg_get_functiondef). No data was read. Only the tables that hold per-user data are included.

-- Tables -----------------------------------------------------------------------------------
create table public.profiles (
  id uuid not null,
  email text not null,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  plan_tier text not null default 'starter',
  ls_customer_id text,
  ls_subscription_id text,
  subscription_status text,
  current_period_end timestamptz,
  customer_portal_url text,
  time_zone text not null default 'America/Denver',
  alerts_enabled boolean not null default true,
  niche text,
  constraint profiles_pkey primary key (id),
  constraint profiles_id_fkey foreign key (id) references auth.users(id) on delete cascade,
  constraint profiles_niche_check check ((niche is null) or (niche = any (array['affiliate-marketing','seo-agency','youtube-automation','podcast-production','social-media-agency']))),
  constraint profiles_plan_tier_check check (plan_tier = any (array['starter','pro','maestro']))
);

create table public.stacks (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  name text not null,
  created_at timestamptz not null default now(),
  constraint stacks_pkey primary key (id),
  constraint stacks_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade
);

create table public.subscriptions (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  tool_name text not null,
  category text not null,
  monthly_cost numeric not null,
  status text not null default 'active',
  renewal_date date,
  last_used_at date,
  created_at timestamptz not null default now(),
  stack_id uuid,
  trial_ends_at date,
  trial_outcome text,
  stopped_at timestamptz,
  billing_cycle text not null default 'monthly',
  constraint subscriptions_pkey primary key (id),
  constraint subscriptions_stack_id_fkey foreign key (stack_id) references public.stacks(id) on delete set null,
  constraint subscriptions_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade,
  constraint subscriptions_billing_cycle_check check (billing_cycle = any (array['monthly','yearly'])),
  constraint subscriptions_category_check check (category = any (array['AI tools','Analytics','Automation','Cloud storage','Communication','CRM','Design','Email marketing','Funnels & landing pages','Hosting & domains','Project management','SEO','Social scheduling','Video','Other'])),
  constraint subscriptions_monthly_cost_check check (monthly_cost >= 0),
  constraint subscriptions_status_check check (status = any (array['trial','active','paused','cancelled'])),
  constraint subscriptions_trial_needs_end_check check ((status <> 'trial') or (trial_ends_at is not null)),
  constraint subscriptions_trial_outcome_check check ((trial_outcome is null) or (trial_outcome = any (array['kept','cancelled'])))
);

create table public.alert_log (
  id uuid not null default gen_random_uuid(),
  subscription_id uuid not null,
  user_id uuid not null default auth.uid(),
  stage smallint not null,
  renewal_date date not null,
  sent_at timestamptz not null default now(),
  kind text,
  resend_id text,
  constraint alert_log_subscription_id_stage_renewal_date_key unique (subscription_id, stage, renewal_date),
  constraint alert_log_pkey primary key (id),
  constraint alert_log_subscription_id_fkey foreign key (subscription_id) references public.subscriptions(id) on delete cascade,
  constraint alert_log_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade,
  constraint alert_log_kind_check check (kind = any (array['renewal','trial'])),
  constraint alert_log_stage_check check (stage = any (array[30, 7, 3, 1, 0]))
);

create table public.guard_skips (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  tool_name text not null,
  category text not null,
  monthly_cost numeric(10,2),
  was_trial boolean not null default false,
  matched text not null,
  created_at timestamptz not null default now(),
  constraint guard_skips_pkey primary key (id),
  constraint guard_skips_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade,
  constraint guard_skips_matched_check check (matched = any (array['same_tool','similar_name','same_category','cancelled_before']))
);

-- Trigger functions (live definitions) ------------------------------------------------------
create or replace function public.check_profile_time_zone() returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.time_zone) then
    raise exception 'Unknown time zone: %', new.time_zone using errcode = '22023';
  end if;
  return new;
end; $$;
create or replace function public.set_updated_at() returns trigger language plpgsql set search_path = public, pg_temp as $$
begin new.updated_at = now(); return new; end; $$;
create or replace function public.set_subscription_stopped_at() returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.status in ('paused', 'cancelled') then
    if tg_op = 'INSERT' then new.stopped_at = now();
    elsif old.status not in ('paused', 'cancelled') then new.stopped_at = now(); end if;
  else new.stopped_at = null; end if;
  return new;
end; $$;
create trigger check_profile_time_zone before insert or update of time_zone on public.profiles for each row execute function public.check_profile_time_zone();
create trigger set_profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger set_subscriptions_stopped_at before insert or update of status on public.subscriptions for each row execute function public.set_subscription_stopped_at();

-- Row level security and policies (verbatim from pg_policies) --------------------------------
alter table public.profiles enable row level security;
alter table public.stacks enable row level security;
alter table public.subscriptions enable row level security;
alter table public.alert_log enable row level security;
alter table public.guard_skips enable row level security;

create policy "Users can view their own profile" on public.profiles for select to public using (auth.uid() = id);
create policy "Users can update their own profile" on public.profiles for update to public using (auth.uid() = id) with check (auth.uid() = id);

create policy "Users can delete their own stacks" on public.stacks for delete to public using (auth.uid() = user_id);
create policy "Users can insert their own stacks" on public.stacks for insert to public with check (auth.uid() = user_id);
create policy "Users can view their own stacks" on public.stacks for select to public using (auth.uid() = user_id);
create policy "Users can update their own stacks" on public.stacks for update to public using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users can delete their own subscriptions" on public.subscriptions for delete to public using (auth.uid() = user_id);
create policy "Users can insert their own subscriptions" on public.subscriptions for insert to public with check (auth.uid() = user_id);
create policy "Users can view their own subscriptions" on public.subscriptions for select to public using (auth.uid() = user_id);
create policy "Users can update their own subscriptions" on public.subscriptions for update to public using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users can view their own alert log" on public.alert_log for select to public using (auth.uid() = user_id);

create policy "Users can delete their own guard skips" on public.guard_skips for delete to authenticated using ((select auth.uid()) = user_id);
create policy "Users can insert their own guard skips" on public.guard_skips for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can view their own guard skips" on public.guard_skips for select to authenticated using ((select auth.uid()) = user_id);

-- Grants (as live, from information_schema.role_table_grants / column_privileges) -------------
grant select, insert, delete, references, trigger, truncate on public.profiles to anon, authenticated;
grant update (alerts_enabled, full_name, niche, time_zone) on public.profiles to authenticated;
grant all on public.stacks to anon, authenticated;
grant all on public.subscriptions to anon, authenticated;
grant select on public.alert_log to authenticated;
grant all on public.guard_skips to authenticated;
grant all on all tables in schema public to service_role;
