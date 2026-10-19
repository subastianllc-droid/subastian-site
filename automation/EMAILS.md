# Subastian emails (Resend, run from Supabase)

Every Subastian email now goes out through Resend from the `email-sender` function in
Supabase ("Subastian's Big Project"). The Gmail / Apps Script drip in this folder is the old setup.

**Nothing sends until `mail.settings.sending_enabled` is true.** Until then the queue just fills up.

## The sequence

| When | Email | Who gets it |
|---|---|---|
| Right away | Day 0: full Leak Report (score, $ estimate, every leak) + share link + "Which subscription do you regret most?" | Everyone who joins. Homepage signups (no test taken) get a welcome + bonus + Leak Test link instead. |
| Day 2 | One leak matched to their work: agencies = per-client tool creep, affiliates = trial-to-renewal traps, creators = overlapping tools, everyone else = annual renewals | Roster |
| Day 5 | The $9 Audit Kit (+ "or get it free with 3 referrals") | Roster members who haven't bought the Kit |
| After a Kit sale | How to use the Kit + the $49 done-for-you audit | Every Kit buyer (from the Gumroad ping) |
| 3rd referral joins | Free Audit Kit link | The member who referred them |
| Fridays | Build log (from the X / Indie Hackers log) | Roster, once you approve it |
| Launch | 3 emails: open, reminder, last day | Roster, once you fill in the blanks and approve them |

Copy lives in `app/supabase/functions/email-sender/emails.ts`.

## Before switching sending on (one time)

1. **Turn off the old Gmail drip** so nobody gets two Day 2 emails: Apps Script > Triggers (clock icon) > delete `runDrip`.
2. **Send yourself every email as a test** (they arrive marked [TEST]): ask Claude, or run in the Supabase SQL editor:
   `select mail.run_sender('{"test_to":"daniel@subastian.us"}');`
3. **Free Kit link for the refer-3 reward.** In Gumroad, make a 100%-off discount code for the Audit Kit, then:
   `update mail.settings set referral_kit_url = 'https://subastian.gumroad.com/l/subscription-audit-kit/YOURCODE';`
   Reward emails wait (they don't fail) until this is set.
4. **Switch on:** `update mail.settings set sending_enabled = true;`

## Gumroad ping (Kit buyers)

Gumroad > Settings > Advanced > Ping, paste:
`https://yhasuhzqykikacwezwyu.supabase.co/functions/v1/gumroad-ping?t=` + the token from
`select gumroad_token from mail.settings;`

Then on the Audit Kit product, add a checkbox custom field named **"Add me to the Subastian Founding Roster"**
(any name with "roster" in it works). Only buyers who tick it join the roster. Every buyer is skipped
by the Day 5 Kit email and gets the how-to email.

## Friday build log and launch emails

Broadcasts sit in `mail.broadcasts` and never send until approved **and** free of `[PLACEHOLDERS]`.
To send one: `update mail.broadcasts set approved_at = now(), send_at = '2026-10-23 16:00-06' where slug = '...';`
`{{first_greeting}}` becomes "Hi Jordan," per person.

The 3 launch drafts (`launch-1-open`, `launch-2-reminder`, `launch-3-last-day`) are waiting on
`[CHECKOUT LINK]`, `[WHAT SHIPPED]` and `[CLAIM DEADLINE]`.
