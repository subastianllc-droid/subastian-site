# Roster email sequence (free)

`email-drip.gs` sends the day-2 and day-5 roster emails from your own Gmail, straight from the
signup Google Sheet. No paid email tool needed. It skips people who unsubscribed or already
replied, never emails the same address twice, and puts an unsubscribe link and your postal
address on every email. Two more emails, a done-for-you audit offer around day 10 and a last
call around day 17, are built in but stay off until you turn them on (see **Offer emails** below).

It was tested against a simulated Sheet and Gmail, not live Google. Do the dry run below first.

## Setup (about 10 minutes)

1. Open the **Subastian Waitlist** sheet, then **Extensions > Apps Script**.
2. Click **+ > Script**, name it `email-drip`, and paste in the contents of `email-drip.gs`.
   Your project can only have one `doGet`. If the existing script already has one, tell Claude and it will merge them.
3. At the top of the file, fill in `POSTAL_ADDRESS` (a PO box works). Type it **in the Apps Script editor only,
   never in this repo copy**: everything in this repo is served publicly on subastian.us.
   Leave `DRY_RUN: true` for now.
4. Check the sheet's header row has an email column and a signup-date column (`submittedAt`).
   The script adds its own five columns: `drip1_sent_at`, `drip2_sent_at`, `drip3_sent_at`, `drip4_sent_at`, `unsubscribed`.
5. **Deploy > Manage deployments**, click the pencil on your existing web app, set Version to
   **New version**, and Deploy. This keeps the same `/exec` URL your website forms already use.
   Paste that URL into `WEB_APP_URL`.
6. Pick `sendTestToMe` in the function menu and click Run (approve the permissions).
   You get all four emails in your own inbox, even while the offer emails are off, so you can read them
   first. Click the unsubscribe link in one to check it works.
7. Run `runDrip`. With `DRY_RUN: true` it only writes to the log what it would send. Read the log.
8. Set `DRY_RUN: false`, run `runDrip` once, then run `installTrigger` once. It now checks every hour.

## Offer emails (Emails 3 and 4, off by default)

Emails 1 and 2 ask questions. Emails 3 and 4 are the first ones that make an offer:

- **Email 3**, 5 days after Email 2 (about day 10): the done-for-you audit, with the $9 Kit as the cheaper option.
- **Email 4**, 7 days after Email 3 (about day 17): every offer in one place, plus the Leak Test to share and the partner program.

To turn them on you set **two** things in the Apps Script editor: `OFFER_EMAILS: true` and `OFFERS_SIGNUP_FROM: 'YYYY-MM-DD'`.
With the date blank, no offer emails go out even with the switch on, and the log says why.

**Why the date.** The signup forms say "No spam", and the privacy policy lists "founding-member offers", but nothing on the forms
tells people they may be offered a paid service. Offer emails should only reach people who were told. So:

1. Update the signup wording first (the roster form on the home page, the Leak Test unlock form and the calculator form) to say
   subscribers may get occasional offers for the Audit Kit and the audit service, and make sure the privacy policy and terms match.
2. Set `OFFERS_SIGNUP_FROM` to the day that wording went live. Only people who signed up on or after it get Emails 3 and 4.
   Everyone, including people from before that date, still gets Emails 1 and 2 as before.
3. Move the date earlier only if you are sure everyone after it was told.

Then:

4. Read both emails with `sendTestToMe`. Nothing in them is a testimonial or a statistic, and the price line comes from `AUDIT_PRICE_LINE`.
5. **Keep `AUDIT_PRICE_LINE` true.** It says "$49 for my first 5 clients, then $149". When the 5 founding spots are gone, change that line here, on `/audit-service/` and in `AUDIT_PRICE_TEXT` on `/leak-test/` together. Check how many have actually been taken before you turn offers on.
6. Only send what you can deliver. The audit promises a report within 3 business days. If requests outrun your time, turn `OFFER_EMAILS` off, and set `AUDIT_MIN_MONTHLY` on `/leak-test/` very high so the page stops leading with the audit.
7. Run `runDrip` with `DRY_RUN: true` once and read the log (`would send email 3 to ...`) before sending for real. `MAX_PER_RUN` caps each batch, and anyone who replied is skipped, because those are conversations to answer yourself.

Each email links with its own tag (`?src=day10email`, `?src=day17email`) so PostHog shows which one drives visits to the audit and Kit pages.

## Updating a script you already run

Pasting a new `email-drip.gs` over the old one also overwrites the `CONFIG` block you filled in. Copy your
`POSTAL_ADDRESS`, `WEB_APP_URL`, `FROM_ALIAS`, `EARLIEST_SIGNUP` and `DRY_RUN` values across, keep the new
settings (`OFFER_EMAILS`, `OFFERS_SIGNUP_FROM`, `DAYS_AFTER_EMAIL_2`, `DAYS_AFTER_EMAIL_3`, `AUDIT_PRICE_LINE`), then deploy a new version
as in step 5. The hourly trigger keeps running, and the two new sheet columns are added on the next run.

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
