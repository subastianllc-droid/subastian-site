# Subastian beta gates: evidence report (updated 2026-11-10)

All tests here ran **locally**, against a throwaway Postgres 16 copy of the live schema, RLS policies, grants and alert functions. On top of that copy go the migrations listed in `PENDING_MIGRATIONS` (`db.mjs`). The two `20261110` migrations were applied to the live database on Nov 10, 2026. `20261111_stripe_billing.sql` (Gate 5) is **not yet applied**.

Nothing was deployed and no emails were sent. No account, payment or processor settings were touched.

The thresholds in the brief are **proposed targets**. Every number below comes from the test output files listed.

**How to run.** Run `cd app/tests/beta-gates && npm install && npm test`. This needs a local Postgres at `/tmp:54329`; see `db.mjs`. To test only the live logic, without this branch's migrations, set `GATE_LIVE_ONLY=1`. The first evidence run, before the fixes, is in PR #57.

| Gate | Result | Tests | Evidence |
|---|---|---|---|
| 1. Sign-up and confirmation | **BLOCKED** (needs staging) | 4/4 code-level checks | `evidence/gate1_auth_static.txt` |
| 2. CSV import accuracy and duplicates | **PASS locally**, once the import migration is applied | 13/13 | `evidence/gate2_csv_import.txt`, `fixtures/csv/` |
| 3. Tenant isolation | **PASS** (1 low gap) | 26/26 | `evidence/gate3_tenant_isolation.txt` |
| 4. Trial and renewal alerts | **Logic PASS, delivery NOT TESTED** | 21/21 | `evidence/gate4_alerts.txt` |
| 5. Stripe billing state | **PASS locally** (Stripe calls not tested here) | 10/10 | `gate5_billing.test.mjs` |

The app's own unit tests also pass: `npm test` in `app/`, 41/41.

---

## Gate 1: Sign-up and confirmation: BLOCKED

The real flow needs Supabase Auth to send the email and a test inbox to receive it, so it can't run here.

**Checked in code:**
- A bad, expired or reused link goes to `/login?error=link`, which shows a clear message.
- Logging in before confirming says "Confirm your email first".
- The confirm link's `next` stays inside the app.

**Gaps:**
- There is no "resend confirmation email" button.
- Not verified: opening the confirmation link on a different device than the one used to sign up.

## Gate 2: CSV import: PASS locally

**Row counts in vs. out:**

| Fixture | Rows in | Out | Result |
|---|---|---|---|
| clean.csv | 14 | 14 charges | All exact. 4 subscriptions found with correct cycle, price and next date. |
| malformed.csv | 12 | 5 charges | 7 rejected, **each with a reason**: "Date not recognized", "No date", "No description" ×2, "No amount", "Amount not recognized: abc", "Amount is 0". |
| mixed_formats.csv | 12 | 10 charges | **12/12 correct**. Covers ISO and US dates, month names, `$ £ €`, `12.00 USD`, `USD 7.00`, `14,99` and `1.234,56`. The 2 refunds are left out and counted. |
| uk_dates.csv | 4 | 4 charges | Read as day/month, so 03/10 is 3 October. Netflix next renewal is 2026-12-03. |
| uk_dates_unclear.csv | 3 | 3 charges | Flagged as unclear, so the import screen asks. Choosing day/month finds 1 subscription; the US guess finds 0. |
| eu_semicolon.csv | 3 | 3 charges | Was 0 before the fix. Adobe $54.99, next 2026-11-15. |
| exact_duplicates.csv | 9 | 2 subscriptions | ×3 each, price not inflated. |
| near_duplicates.csv | 11 | 4 subscriptions | Spellings of the same merchant merged. A different merchant stays separate. |

**Re-import** (local DB, as a signed-in user):
- **Same file twice:** the first import adds 4. The second adds 0 and skips 4.
- **Then near_duplicates.csv:** adds 1, skips 3.
- **Two imports at the same moment:** 4 rows in total, where the first run had 8. The import migration makes the second import wait for the first, then skip what it added.
- **Another user's ID in the request:** A can't use the import function to write into B's list.

**Note:** the code checks first whether the import migration exists. Until it's applied, the app uses the old way of saving, so the race protection only starts once the migration is applied.

## Gate 3: Tenant isolation: PASS

No change since the first run. User A read, edited, created and deleted 0 of user B's rows, across 26 tests. The live policies are copied verbatim into `db/01_schema_from_live.sql`.

**Low gap:** through the API directly, A can point their own subscription at B's `stack_id`. A still sees nothing of B's, and the app's own form blocks it.

## Gate 4: Alerts: logic PASS, delivery NOT TESTED

**Still verified:**
- Alerts arrive at 8:00 local time in 6 zones, including daylight-saving changes.
- Only stages 30, 7, 3, 1 and 0 fire.
- 192 hourly runs produce 1 alert per stage.
- Overlapping runs claim an alert only once.

**Fixed in `20261110b` and the sender:**
- **Retry cap.** An always-failing send is tried 3 times: at 14:07, 15:07 and 18:07 UTC (now, +1h, +3h). Then it stops. Before: 16 tries per day.
- **Same idempotency key.** A retry reuses the same log row, so the Idempotency-Key Resend receives stays the same.
- **Crash recovery.** A crash mid-send is picked up again after 15 minutes.
- **Catch-up.** If the stage day is missed, the alert goes out the next day and says "6 days". It is never 2 or more days late, and never sent for a tool added after the stage day.
- **Month-end.** Jan 31 rolls to Feb 28, then to Mar 31. Before: it got stuck on the 28th. A yearly Feb 29, 2028 rolls to Feb 28, 2029.

**Not tested:** real delivery through Resend, and the Edge Function running in Deno. These need a staging project and a test inbox.

**New gap:** after 3 failed sends, the person isn't told. The error is kept in `alert_log.last_error`.

---

## What I need from you

1. **A staging Supabase project** (Gates 1 and 4) with email confirmation on, plus a Resend test key.
2. **A test inbox address** you choose.
3. **Review PR "beta-gate-fixes".** After you approve, the two migrations get applied to the database, then the code is merged. In that order: the alert sender calls `mail.alert_send_failed`, which only exists once the migration is in.
