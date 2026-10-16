<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Subastian: notes for AI coding agents

This repo is the source of truth for the Subastian app. Read this before changing anything.

- **Stack:** Next.js 16 App Router + Supabase (`@supabase/ssr`) + Tailwind 4. No other backend; do not add Python services, AWS, or PartnerStack integrations.
- **Payments:** Lemon Squeezy (merchant of record). Monthly plans (Starter $49 / Pro $99 / Agency Maestro $299) stay unpublished until beta.
- **Auth:**
  - Request-time session refresh lives in `src/proxy.ts` (Next 16 renamed middleware to proxy).
  - Server code uses `createClient()` from `src/lib/supabase/server.ts`.
  - Always check the user with `getUser()`/`getClaims()`, never `getSession()`.
- **Cache Components is on:** anything that reads cookies, the session or searchParams must render inside `<Suspense>`.
- **Security:**
  - RLS enforces per-user access on every table.
  - Never use the service-role key in this app.
  - Never let a user write `plan_tier`, `ls_*` or `subscription_status` on `profiles`.
- **Dates:** `trial_ends_at`, `renewal_date` and `last_used_at` are calendar dates. "Today" comes from the viewer's time zone (the `tz` cookie, see `TzSync`).
- **Schema rules:** category and status values must match the CHECK constraints listed in `src/lib/subscriptions.ts`.
- **Copy:** plain and truthful. No invented stats, no "AI magic" claims, no countdown pressure.

## Build phases

1. **Done.** Auth, core schema, free-trial tracker, subscriptions CRUD, stacks, spend summary, overlap and neglect flags.
2. **Next.** Lemon Squeezy checkout and webhook (Supabase Edge Function) that sets `plan_tier` / `subscription_status`; plan limits.
3. **Alerts.** 5-stage renewal and trial emails (30/7/3/1/0 days) logged in `alert_log`, run by a scheduled job.
4. **Niche Stacks.** Pick a niche and get a recommended tool stack, with chained free trials of same-type tools.
5. **Done (built ahead of 2–4).** Purchase Guard: `src/lib/purchase-guard.ts` checks a new tool against active and trial rows (same name, ignoring plan words like "Pro", or same category except "Other"). The add form shows the match live, and `createSubscription` re-checks on the server and asks for "Add anyway" (`guard_ack`).
