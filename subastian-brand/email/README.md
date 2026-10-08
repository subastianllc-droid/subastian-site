# Subastian email (Brevo)

Branded, on-brand emails for the two free-kit signups, plus the glue that adds
each signup to Brevo so Brevo sends the email, handles the unsubscribe link and
keeps the sender reputation.

| File | What it is |
|---|---|
| `roster-welcome.html` | Sent when someone joins the founding roster (home page or stack audit). Links to `/bonus/`. |
| `partner-kit.html` | Sent when someone applies as a Founding Partner. Links to `/partners/kit/`. |
| `apps-script-brevo.gs` | Helper for the Apps Script webhook: adds the signup to the right Brevo list. |

Brand used: purple `#6D28D9`, ink `#15132A`, page `#F8F7FC`, border `#E2DCF2`,
the emblem from `https://subastian.us/emblem.png`, Plus Jakarta Sans / Inter with
system-font fallbacks (most inboxes ignore web fonts). Each email carries an
unsubscribe link and the LLC's street address, which marketing email requires.

## How it flows

```
site form -> Apps Script webhook -> Brevo API (add to list)
                                      -> Brevo automation (list trigger) -> branded email
```

## Setup in Brevo

1. **Lists.** Contacts > Lists > Add a list: `Founding Roster` and `Partner Applicants`.
   Note each list's numeric id.
2. **Templates.** Campaigns > Templates (or Automation > Templates) > Create a
   template > Email > Paste your code. Paste each `.html` file. Set:
   - Sender: `daniel@subastian.us` (the domain you already authenticated), name `Daniel at Subastian`
   - Subject (roster): `You're on the Subastian roster. Your free bonus is inside`
   - Subject (partner): `Your Subastian Partner Launch Kit`
   - Send a test to yourself and check it in Gmail and on your phone.
3. **Automations.** Automations > Create a workflow > start from scratch.
   - Trigger: *Contact is added to a list* > `Founding Roster`
   - Action: *Send an email* > the roster template
   - Activate. Repeat for `Partner Applicants` with the partner template.
   - Plan note: Starter limits automations to 2,000 contacts. If you outgrow that,
     send the kit with Brevo's transactional API instead (same templates).
4. **API key.** SMTP & API > API Keys > Generate. It goes only into Apps Script
   Script properties, never into the site code or this repo.
5. **Apps Script.** Add `apps-script-brevo.gs`, set the three Script properties
   (`BREVO_API_KEY`, `BREVO_LIST_ROSTER`, `BREVO_LIST_PARTNER`), call
   `addToBrevo_(data)` from `doPost`, and remove the old Gmail kit-sending
   lines. Redeploy as a new version of the web app.
6. **Test end to end** with a real address: submit the home-page form, confirm the
   contact lands in the list and the email arrives (inbox, not spam).
7. **Privacy page.** `privacy/index.html` still says the email provider "will be
   named once it is in use". Replace that row with Brevo once this is live.

## Merge tags used

`{{ contact.FIRSTNAME }}` (falls back to "friend"), `{{ mirror }}` (view in
browser), `{{ unsubscribe }}` (required unsubscribe link). If Brevo's editor
shows any of these differently, use the tag its "Personalize" menu inserts.
