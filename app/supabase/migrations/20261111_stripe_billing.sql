-- Phase 2: Stripe billing (replaces the planned Lemon Squeezy checkout).
--
-- The `billing` Edge Function creates Checkout and Customer Portal sessions for the signed-in
-- user and receives Stripe webhooks. Only that function (connecting as postgres) writes the
-- columns below; the app reads them through RLS like the rest of the profile.
-- The old ls_* columns stay (unused) so nothing that reads them breaks.

-- 1. Billing state on profiles ------------------------------------------------------------
alter table public.profiles
  add column if not exists stripe_customer_id text unique,
  add column if not exists stripe_subscription_id text,
  add column if not exists stripe_price_id text,
  add column if not exists cancel_at_period_end boolean not null default false;

-- Stripe's subscription statuses (null = never subscribed).
alter table public.profiles drop constraint if exists profiles_subscription_status_check;
alter table public.profiles add constraint profiles_subscription_status_check check (
  subscription_status is null or subscription_status in
    ('trialing', 'active', 'past_due', 'unpaid', 'canceled', 'incomplete', 'incomplete_expired', 'paused')
);

-- Users still update only their own settings columns (granted in earlier migrations).
-- Nothing here is granted to authenticated or anon, so plan and billing columns stay read-only.

-- 2. Webhook events already handled -----------------------------------------------------
-- Stripe retries and can send the same event twice; the function records each event id in the
-- same transaction as its profile update and skips ids it has seen.
create schema if not exists billing;
revoke all on schema billing from public, anon, authenticated;

create table if not exists billing.stripe_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now()
);

revoke all on billing.stripe_events from public, anon, authenticated;

-- 3. Apply one webhook event -----------------------------------------------------------
-- Called by the billing Edge Function with the subscription it just fetched from Stripe.
-- Returns what happened: duplicate | no_profile | updated | kept_newer.
-- p_plan null = unknown price: leave plan_tier as it is.
create or replace function billing.apply_subscription(
  p_event_id text,
  p_event_type text,
  p_user_id uuid,
  p_customer text,
  p_subscription text,
  p_status text,
  p_plan text,
  p_price text,
  p_period_end timestamptz,
  p_cancel_at_period_end boolean
) returns text
language plpgsql
set search_path = ''
as $$
declare
  target uuid;
  n integer;
begin
  insert into billing.stripe_events (id, type) values (p_event_id, p_event_type) on conflict (id) do nothing;
  if not found then
    return 'duplicate';
  end if;

  select id into target from public.profiles
  where (p_user_id is not null and id = p_user_id)
     or (p_user_id is null and stripe_customer_id = p_customer)
  limit 1;
  if target is null then
    return 'no_profile';
  end if;

  -- An event about an old subscription never overwrites a different one that still gives access.
  update public.profiles set
    plan_tier = coalesce(p_plan, plan_tier),
    subscription_status = p_status,
    stripe_customer_id = p_customer,
    stripe_subscription_id = p_subscription,
    stripe_price_id = p_price,
    current_period_end = p_period_end,
    cancel_at_period_end = p_cancel_at_period_end
  where id = target
    and not (
      stripe_subscription_id is not null
      and stripe_subscription_id <> p_subscription
      and subscription_status in ('trialing', 'active', 'past_due')
      and p_status not in ('trialing', 'active', 'past_due')
    );
  get diagnostics n = row_count;
  return case when n > 0 then 'updated' else 'kept_newer' end;
end;
$$;

revoke all on function billing.apply_subscription(text, text, uuid, text, text, text, text, text, timestamptz, boolean)
  from public, anon, authenticated;
