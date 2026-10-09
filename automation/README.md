# Roster email sequence (free)

`email-drip.gs` sends the day-2 and day-5 roster emails from your own Gmail, straight from the
signup Google Sheet. No paid email tool needed. It skips people who unsubscribed or already
replied, never emails the same address twice, and puts an unsubscribe link and your postal
address on every email.

It was tested against a simulated Sheet and Gmail, not live Google. Do the dry run below first.

## Setup (about 10 minutes)

1. Open the **Subastian Waitlist** sheet, then **Extensions > Apps Script**.
2. Click **+ > Script**, name it `email-drip`, and paste in the contents of `email-drip.gs`.
   Your project can only have one `doGet`. If the existing script already has one, tell Claude and it will merge them.
3. At the top of the file, fill in `POSTAL_ADDRESS` (a PO box works). Type it **in the Apps Script editor only,
   never in this repo copy**: everything in this repo is served publicly on subastian.us.
   Leave `DRY_RUN: true` for now.
4. Check the sheet's header row has an email column and a signup-date column (`submittedAt`).
   The script adds its own three columns: `drip1_sent_at`, `drip2_sent_at`, `unsubscribed`.
5. **Deploy > Manage deployments**, click the pencil on your existing web app, set Version to
   **New version**, and Deploy. This keeps the same `/exec` URL your website forms already use.
   Paste that URL into `WEB_APP_URL`.
6. Pick `sendTestToMe` in the function menu and click Run (approve the permissions).
   You get both emails in your own inbox. Click the unsubscribe link in one to check it works.
7. Run `runDrip`. With `DRY_RUN: true` it only writes to the log what it would send. Read the log.
8. Set `DRY_RUN: false`, run `runDrip` once, then run `installTrigger` once. It now checks every hour.

## Good to know

- **Replies go to the Gmail that sends the emails.** That is on purpose: the script skips anyone who already replied, and it can only see that inbox. Don't set `REPLY_TO` to daniel@subastian.us unless a test email to it really arrives in the same Gmail.
- Emails come from the Google account that owns the script. Set `FROM_ALIAS` to send as daniel@subastian.us if that alias is set up in Gmail.
- `EARLIEST_SIGNUP: '2026-09-01'` leaves older signups alone. `MAX_PER_RUN` caps each hourly batch.
- To stop everything: Apps Script > Triggers (clock icon) > delete the `runDrip` trigger.
- Your replies are the survey. Paste them into one sheet with a "pain point" column and count the A/B/C/D/E answers.

## Keep the partner-form database awake (optional, free)

Supabase pauses free-tier projects after 7 days without activity. `supabase-keepalive.gs` makes one small
request every 2 days so the partner application form keeps working. Paste it into the same Apps Script project,
paste the public anon key from `partners/index.html` into `ANON_KEY`, and run `installKeepAliveTrigger` once.
