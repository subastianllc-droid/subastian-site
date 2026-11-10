# Subastian beta gates: evidence report (2026-11-09)

Everything here ran **locally**: a throwaway Postgres 16 built from the live schema, RLS policies, grants and alert functions. The live project was read once, read-only, to copy them. Nothing was deployed, no emails were sent, and no accounts, payment or processor settings were touched.

Thresholds in the brief are **proposed targets**. Every number below comes from the test output files listed.

Run everything: `cd app/tests/beta-gates && npm install && npm test`. This needs a local Postgres at `/tmp:54329`; see `db.mjs`.

| Gate | Result | Tests | Evidence |
|---|---|---|---|
| 1. Sign-up and confirmation | **BLOCKED** (not run end to end) | 4/4 code-level checks pass | `evidence/gate1_auth_static.txt` |
| 2. CSV import accuracy and duplicates | **FAIL** against the proposed target | 11/11 tests pass, and they record the failures | `evidence/gate2_csv_import.txt`, `fixtures/csv/` |
| 3. Tenant isolation | **PASS**, with 1 low gap | 26/26 | `evidence/gate3_tenant_isolation.txt` |
| 4. Trial and renewal alerts | **Logic PASS, delivery NOT TESTED** | 17/17 | `evidence/gate4_alerts.txt` |

"GAP" tests pass by confirming that the weakness exists. They will start failing once it is fixed, which is the intent.

---

## Gate 1: Sign-up and confirmation: BLOCKED

**Why blocked:**
- The real flow needs Supabase Auth to send the email and a test inbox to receive it.
- The test environment here has neither, and Docker isn't available to run a local Supabase.
- Testing on the live project would mean real sign-ups, which you ruled out.

**What was checked in code** (`gate1_auth_static.test.mjs`, 4/4 pass):
- A bad, expired or reused link goes to `/login?error=link`. That page says "That sign-in link has expired or was already used. Request a new one below."
- Logging in before confirming shows "Confirm your email first. Check your inbox for the link we sent."
- The `next` redirect on the confirm link stays inside the app. The test checked 7 inputs, including `https://evil.example` and `//evil.example`.

**Gaps:**
- There is no "resend confirmation email" button: `auth.resend` isn't used anywhere. Someone whose link expired has to use the email-link sign-in instead. It is not yet verified whether that confirms their account.
- Not verified: opening the link on a different device or browser than the one used to sign up. With the PKCE code flow this usually fails and shows the "expired" message, which would be misleading.

## Gate 2: CSV import: FAIL against the proposed target

**Row counts in vs. out** (from `evidence/gate2_csv_import.txt`):

| Fixture | Rows in | Charges out | Result |
|---|---|---|---|
| clean.csv | 14 | 14 | All 14 exact. Found 4 subscriptions with correct cycle, price and next date. The 2 one-off charges were correctly not listed. |
| malformed.csv | 12 | 5 | All 5 valid rows kept, including a quoted comma and extra columns. 7 bad rows dropped **with no message**. |
| mixed_formats.csv | 13 | 8 | 9/13 handled correctly. 3 valid rows were dropped and 1 was imported with **the wrong date**. |
| eu_semicolon.csv | 3 | 0 | The whole file was rejected with "We couldn't read any charges from that file." |
| exact_duplicates.csv | 9 | 9 | 2 subscriptions, price not inflated, ×3 each. |
| near_duplicates.csv | 11 | 11 | 3 spellings of Adobe merged, and 3 spellings of Acme Hosting merged. Acme Design stayed separate. Canva appears once. 4 subscriptions in total. |

**Re-import** (local DB, as a logged-in user):
- First import: added 4. The same file again: added 0, skipped 4, and the database still holds 4 rows.
- Importing near_duplicates.csv afterwards: added 1, skipped 3.
- A hand-added "Canva Pro" blocks an imported "Canva". A *cancelled* Ahrefs does not block a new one, which is by design.
- These tests copy `importSubscriptions`' logic step for step. They don't call the action itself, because it needs a Next.js request.

**Against the target:**
- **Not met: 100% of valid rows imported correctly.** In mixed_formats.csv:
  - `12.00 USD` was dropped.
  - `14,99` and `1.234,56` (European decimals) were dropped.
  - `03/10/2026` from a UK bank was read as March 10 instead of 3 October, and kept silently.
  - A fully European file (`54,99`) imports nothing.
- **Not met: bad rows rejected with a clear message.** Bad rows are skipped silently. The user sees fewer results and isn't told why.
- **Met in normal use: no duplicates on re-import.** **Gap:** two imports submitted at the same moment both inserted, leaving 8 rows instead of 4. Nothing in the database prevents duplicate names. The import button is disabled while saving, so this needs two tabs or a retry to happen.

## Gate 3: Tenant isolation: PASS

**Results of the 26 tests**, with user A acting on user B's data through the same database roles and policies the API uses:
- **Read:** 0 of B's rows visible across 5 tables. A logged-out visitor sees 0.
- **Edit:** 0 of B's rows changed. Moving a row to B is refused by RLS.
- **Delete:** 0 of B's rows deleted.
- **Create:** inserting as B is refused, and a second profile is refused.
- **Own billing fields:** A cannot change `plan_tier`, `ls_*` or `subscription_status` on A's own profile ("permission denied").
- **Alert log and system jobs:** cannot be written or run by A.

**UI:** every page uses the logged-in user's key, never the service-role key. A search of `src/` found no service-role key, so the UI can't do more than the API allows.

**Live policies** (copied verbatim into `db/01_schema_from_live.sql`):
```
profiles       select, update      using (auth.uid() = id)        [update also with check]
stacks         select/insert/update/delete  auth.uid() = user_id  [update with check]
subscriptions  select/insert/update/delete  auth.uid() = user_id  [update with check]
alert_log      select              using (auth.uid() = user_id)   (no write grants for users)
guard_skips    select/insert/delete to authenticated, (select auth.uid()) = user_id
profiles column grants: users may update only alerts_enabled, full_name, niche, time_zone
```

**Gap (low):**
- Through the API directly, A can save their own subscription pointing at B's `stack_id`.
- A still can't see anything of B's, and B doesn't see A's row.
- The app's own form blocks this: it re-checks the stack.
- Fix later with a policy or trigger check.

## Gate 4: Alerts: logic PASS, delivery NOT TESTED

**Spec as implemented:**
- `mail.claim_due_alerts` runs hourly. It picks active renewals and trials exactly 30, 7, 3, 1 and 0 days out, in each user's time zone.
- It sends only from 8:00 local time and only if alerts are on. It sends one email per person.
- It writes `alert_log` first; a unique key on subscription, stage and date prevents a second send.
- If Resend fails, the sender deletes those rows so the next hour retries.

**Verified (17/17):**
- **8:00-local timing** across 6 zones, with exact before/after times:
  - Denver, across both US DST changes
  - New York, the day DST ends
  - London, the day UK clocks go back
  - Sydney, across its DST start
  - Tokyo, where "today" is ahead of UTC
- Only the 5 stages fire (offsets 0–31 checked), and trials are labeled as trials.
- 192 hourly runs produce exactly one alert per stage.
- Two overlapping runs claim it only once.
- A failed send is retried, then sent once.

**Not tested: real delivery, Resend retries, and the Edge Function code itself.** These need a staging project and a test inbox. That means no delivery logs yet.

**Gaps found:**
- A send that keeps failing is retried every hour, 16 times that day, with no backoff or cap.
- If the job misses a stage's whole day (an outage, or 8am local falls in a gap), that alert is skipped. There is no catch-up.
- Month-end drift: a renewal on Jan 31 rolls to Feb 28, then to Mar 28, and stays on the 28th.
- A possible duplicate: if Resend accepted the email but the call errored, the retry gets a new idempotency key.

---

## What I need from you

1. **A staging Supabase project** (Gates 1 and 4). Free plans allow 2 projects. It needs:
   - email confirmation turned on
   - your confirm template
   - Site URL set to a Vercel preview
   - a Resend test key with an address we control
2. **A test inbox you choose.** For example, a plus-address on your own Gmail, which I can read through your Gmail connection. I won't use any address until you name it.
3. **Decisions on Gate 2 fixes.** Each one is small:
   - list skipped rows with a reason
   - accept `12.00 USD` and European decimals
   - ask "day/month or month/day?" when a file is ambiguous
   - add a unique name index so two imports can't duplicate
4. **Decisions on Gate 4 fixes:**
   - cap retries (e.g. 3, then flag the user)
   - catch up on missed stages
   - keep the original day of the month
   - use a stable idempotency key
