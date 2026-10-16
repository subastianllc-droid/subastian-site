# Subastian app

The signed-in product for Subastian, the Subscription Conductor. It lives in this `app/` folder; everything outside it is the marketing site served at [subastian.us](https://subastian.us).

**Stack:** Next.js 16 (App Router) · Supabase (Postgres, Auth, Row Level Security) · Tailwind CSS 4 · hosted on Vercel.

## What works (Phase 1)

- **Sign-in:** email + password, or a one-time email link. Signed-out visitors are sent to `/login`.
- **Free-trial tracker:** days left before you're charged, the price after the trial, and "Keep it" / "I cancelled it" buttons. A kept trial becomes an active subscription that renews on the trial's end date.
- **Subscriptions:** add, edit and remove tools, with a monthly cost, category, status, next renewal date and last-used date.
- **Summary:**
  - Monthly and yearly spend
  - Trials ending within 7 days
  - Renewals in the next 30 days
  - Money not being spent because trials were cancelled
- **Possible overlap:** flags tools that share a category.
- **Neglect flag:** marks active tools not used in 30+ days. "Used today" records use with one click.
- **Stacks:** group tools by client, project or workflow, with a per-stack monthly cost.
- **Mark renewed:** moves a renewal date forward one month once the charge goes through. It only updates the tracker and doesn't check anything with the vendor.
- **Purchase Guard:** before you add a tool, the form checks it against everything you track: the same tool (ignoring plan words like "Pro"), a name that looks like one you have, other tools in the same category, and tools you cancelled before. Same-tool matches show in red, category overlaps in amber. You must choose **Don't add** or **Add anyway**, and if you already have the tool paused you can **Resume it instead**. The server repeats the check, so a stale form can't slip a duplicate through. Editing is checked too: renaming a tool into one you already track, or reopening a cancelled tool you already have, asks **Save anyway** / **Don't save**. Each **Don't add** is recorded, and the "Not paying for" tile adds the monthly cost you entered for those tools (counted once per tool, and dropped if you add the tool later).
- **Export CSV:** downloads every tracked subscription (`/app/export`).
- **Sample agency stack:** new users can load a clearly labeled sample with trials, overlaps and neglected tools, then remove it in one click. Its prices are sample budgets, not vendor quotes.

## Run it locally

```bash
cp .env.example .env.local   # fill in the publishable key
npm install
npm run dev                  # http://localhost:3000
```

## Deploy (Vercel)

Import the `subastian-site` repo in Vercel and set **Root Directory** to `app`. Then set these environment variables:

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://yhasuhzqykikacwezwyu.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | the `subastian1` publishable key from Supabase → Project Settings → API Keys |
| `NEXT_PUBLIC_SITE_URL` | the app's public URL, e.g. `https://app.subastian.us` |

In Supabase, go to **Authentication → URL Configuration**:

- Set **Site URL** to the app URL.
- Add `https://<app-url>/auth/callback` and `http://localhost:3000/auth/callback` to **Redirect URLs**.

Without that, sign-in emails link to the wrong place.

## Database

Tables live in the Supabase project "Subastian's Big Project":

- **Used by this app:** `profiles`, `subscriptions`, `stacks`, `alert_log`, `guard_skips`
- **Used by the website and affiliate flow:** `affiliate_*`, `partners`, `suggestions`

Every table has Row Level Security on, so users only ever see their own rows. Users can't change their own `plan_tier`; that should only be set by the Lemon Squeezy webhook (Phase 2).

Run the tests with `npm test`. SQL for schema changes made from here is kept in `supabase/migrations/`.

Regenerate types after schema changes:

```bash
npx supabase gen types typescript --project-id yhasuhzqykikacwezwyu > src/lib/database.types.ts
```
