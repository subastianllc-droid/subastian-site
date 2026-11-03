-- Phase 4: Niche Stacks. Remember which niche stack the user picked.
-- Values must match the stack slugs in app/src/lib/niche-stacks.data.json.
alter table public.profiles
  add column if not exists niche text
  check (niche is null or niche in ('affiliate-marketing', 'seo-agency', 'youtube-automation', 'podcast-production', 'social-media-agency'));

-- The existing UPDATE policy limits users to their own row.
grant update (niche) on public.profiles to authenticated;
