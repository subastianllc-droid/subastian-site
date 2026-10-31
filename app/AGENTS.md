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
- **New tables need explicit grants (Supabase change, Oct 30 2026):** tables created in `public` no longer get Data API access automatically, so the API returns "permission denied" until granted. In the same migration that creates a table: enable RLS, add policies, then `grant` only what the app needs: `authenticated` for per-user data, `service_role` (select/insert/update/delete) for Edge Functions, and `anon` only for deliberately public actions (most public writes go through a `security definer` RPC like `join_roster` instead). Add `revoke all on <table> from anon;` when logged-out visitors should have no access. See `supabase/migrations/20261016_purchase_guard_skips.sql` for the pattern.
- **Copy:** plain and truthful. No invented stats, no "AI magic" claims, no countdown pressure.

## Build phases

1. **Done.** Auth, core schema, free-trial tracker, subscriptions CRUD, stacks, spend summary, overlap and neglect flags.
2. **Next.** Lemon Squeezy checkout and webhook (Supabase Edge Function) that sets `plan_tier` / `subscription_status`; plan limits.
3. **Alerts.** 5-stage renewal and trial emails (30/7/3/1/0 days) logged in `alert_log`, run by a scheduled job.
4. **Niche Stacks.** Pick a niche and get a recommended tool stack, with chained free trials of same-type tools.
5. **Done (built ahead of 2–4).** Purchase Guard: `src/lib/purchase-guard.ts` checks a new tool against every tracked row: same name (ignoring plan words like "Pro" or "AI") or a near match, other active/trial/paused tools in the same category (except "Other"), and cancelled rows with that name. Any match makes the user choose Don't add / Add anyway (`guard_ack`), plus "Resume instead" for a paused copy (`resumeSubscription`). `createSubscription` re-checks on the server. Editing is guarded too (`checkEdit`): only a rename into another tracked tool, or reopening a cancelled row while another copy is open; `updateSubscription` re-checks. "Don't add" calls `recordGuardSkip`, which re-checks the match and writes `guard_skips`; `guardSavings` adds those (once per tool, dropped if the tool is tracked again) to the "Not paying for" tile. Tests: `npm test`.
