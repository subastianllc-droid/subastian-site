-- Statement import: save ticked rows in one call that can't race with itself.
--
-- importSubscriptions (src/app/app/actions.ts) already skips tools the user tracks. Two imports at
-- the same moment (two tabs, a double submit, a retry) could still both pass that check and both
-- insert. This function takes a per-user lock for the rest of the transaction and re-checks each
-- name before inserting, so the second import skips what the first just added.
--
-- No unique index on purpose: Purchase Guard lets people "Add anyway" a second copy of a tool.
-- security invoker: RLS still applies (rows are inserted as the signed-in user).

create or replace function public.import_subscriptions(p_rows jsonb)
returns table (added integer, skipped integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  r jsonb;
  n_added integer := 0;
  n_skipped integer := 0;
begin
  if uid is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) > 100 then
    raise exception 'Send up to 100 rows' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('import_subscriptions:' || uid::text, 0));

  for r in select value from jsonb_array_elements(p_rows) loop
    if exists (
      select 1 from public.subscriptions s
      where s.user_id = uid and s.status <> 'cancelled'
        and lower(btrim(s.tool_name)) = lower(btrim(r->>'tool_name'))
    ) then
      n_skipped := n_skipped + 1;
    else
      insert into public.subscriptions (user_id, tool_name, category, status, billing_cycle, monthly_cost, renewal_date)
      values (uid, r->>'tool_name', r->>'category', 'active', coalesce(r->>'billing_cycle', 'monthly'),
              (r->>'monthly_cost')::numeric, (r->>'renewal_date')::date);
      n_added := n_added + 1;
    end if;
  end loop;

  return query select n_added, n_skipped;
end;
$$;

revoke all on function public.import_subscriptions(jsonb) from public, anon;
grant execute on function public.import_subscriptions(jsonb) to authenticated;
