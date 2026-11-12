# Billing (Stripe) — setup

Checkout, the Customer Portal and the Stripe webhook all run in this one Edge Function. The Stripe
secret key is stored only as a Supabase secret. Do everything in the Stripe **sandbox** first.

## 1. Stripe sandbox

1. **Product catalog → Add product**: "Subastian", with three **recurring monthly** prices in USD:
   Starter $49, Conductor Pro $99, Agency Maestro $299. Copy each price id (`price_...`).
2. **Settings → Billing → Customer portal**: turn on payment method updates, invoice history,
   cancel (at end of billing period) and switching plans between the three prices.
3. **Developers → Webhooks → Add endpoint**:
   - URL: `https://yhasuhzqykikacwezwyu.supabase.co/functions/v1/billing`
   - Events: `checkout.session.completed`, `customer.subscription.created`,
     `customer.subscription.updated`, `customer.subscription.deleted`,
     `customer.subscription.paused`, `customer.subscription.resumed`
   - Copy the signing secret (`whsec_...`).

## 2. Supabase

1. Apply `supabase/migrations/20261111_stripe_billing.sql`.
2. Deploy the function **with JWT verification off** (Stripe's webhook has no Supabase JWT; the
   function checks the user's JWT itself for checkout and portal):
   `supabase functions deploy billing --no-verify-jwt`
3. **Edge Functions → Secrets**: add

   | Secret | Value |
   | --- | --- |
   | `STRIPE_SECRET_KEY` | sandbox secret key (`sk_test_...`) |
   | `STRIPE_WEBHOOK_SECRET` | `whsec_...` from step 1.3 |
   | `STRIPE_PRICE_STARTER` / `_PRO` / `_MAESTRO` | the three price ids |
   | `APP_URL` | the app's public URL, no trailing slash |
   | `BILLING_ENABLED` | `true` to allow new checkouts |

## 3. Vercel

Set `BILLING_ENABLED=true` on the **Preview** environment only while testing. Leave Production
`false` until launch day: the plans page then shows "Opens at launch" and nothing can be bought.

## 4. Test

Sign in on the preview, open `/app/billing`, start a trial with card `4242 4242 4242 4242` (any
future date, any CVC). The page should show "Free trial · Trial ends ...". In Stripe, advance the
subscription with a test clock or cancel it from the portal and watch the status change.

## 5. Going live

Repeat steps 1–2 in live mode (live keys, live prices, live webhook secret), then set
`BILLING_ENABLED=true` in Vercel Production.

## PromoteKit

Connect the Stripe account in PromoteKit. Partner sales are tracked two ways: promo codes
(`allow_promotion_codes` is on), and the `promotekit_referral` cookie, which the app copies into
the Checkout Session and subscription metadata. The cookie is set by PromoteKit's script. If the app
runs on a different domain from subastian.us, the script must also load on the app (or set the
cookie for `.subastian.us`), or links won't be attributed.
