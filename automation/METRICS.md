# Pre-launch funnel: what to measure each Friday

Record these in the Friday build log. Set targets after two weeks of real data, not before.

## PostHog (dashboard "Pre-launch funnel weekly", pinned)

https://us.posthog.com/project/627995/dashboard/2230234

| Metric | How it's calculated |
|---|---|
| Quiz start rate | Sessions that started the Leak Test ÷ sessions that viewed the homepage |
| Quiz → email rate | Leak Test sessions that left an email ÷ sessions that finished the test |
| Signups by form | Roster signups split by page (home, leak_test, stack_* pages) |
| Audit Kit interest | Kit clicks from the Leak Test and homepage, plus Gumroad checkout clicks |

Baseline before the new funnel (weeks of Oct 4 and Oct 11, 2026, may include your own visits):
28 and 53 homepage visits · 4 and 1 Leak Test starts · 4 and 0 completions · 2 and 1 roster signups · 4 and 5 Kit checkout clicks.

## Supabase (SQL editor, "Subastian's Big Project")

Signups by channel, last 7 days:
```sql
select coalesce(utm_source, 'direct / unknown') as channel, count(*)
from public.waitlist where not is_test and created_at > now() - interval '7 days'
group by 1 order by 2 desc;
```

Referral share (signups from roster share links ÷ all signups), last 7 days:
```sql
select count(*) filter (where referred_by is not null) as from_referrals, count(*) as all_signups,
  round(100.0 * count(*) filter (where referred_by is not null) / nullif(count(*), 0), 1) as pct
from public.waitlist where not is_test and created_at > now() - interval '7 days';
```

Kit conversion (Kit buyers ÷ new roster signups), last 7 days:
```sql
select (select count(*) from mail.kit_buyers where not refunded and purchased_at > now() - interval '7 days') as kit_sales,
  (select count(*) from public.waitlist where not is_test and created_at > now() - interval '7 days') as new_signups;
```
(Gumroad's own dashboard is the source of truth for revenue.)

Email reply rate: Day 0 emails sent this week (below) ÷ replies you count in the daniel@subastian.us inbox.
```sql
select count(*) from mail.outbox where kind = 'roster_welcome' and status = 'sent' and sent_at > now() - interval '7 days';
```
