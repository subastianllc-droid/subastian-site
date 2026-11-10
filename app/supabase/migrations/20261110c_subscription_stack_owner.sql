-- A subscription can only be filed under one of its owner's own stacks.
--
-- RLS already stops anyone reading or changing another account's rows, but through the API a
-- user could save their OWN subscription with someone else's stack_id (found in the beta gate
-- tests; the app's form already re-checks it). This closes that at the database.
-- security invoker on purpose: under RLS the other account's stack isn't visible at all.

create or replace function public.check_subscription_stack_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.stack_id is not null and not exists (
    select 1 from public.stacks s where s.id = new.stack_id and s.user_id = new.user_id
  ) then
    raise exception 'That stack belongs to another account' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists check_subscription_stack_owner on public.subscriptions;
create trigger check_subscription_stack_owner
  before insert or update of stack_id, user_id on public.subscriptions
  for each row execute function public.check_subscription_stack_owner();
