// Subastian billing (Supabase Edge Function, Stripe). Deploy with JWT verification off:
// Stripe's webhook carries no Supabase JWT, so each route checks its own credentials.
//
// POST {action:"checkout", plan, referral?}  (Authorization: the user's Supabase JWT)
//      -> {url} of a Stripe Checkout Session: monthly plan, 14-day trial (first time only),
//         card required, promo codes allowed, PromoteKit referral in metadata.
// POST {action:"portal"}                      (Authorization: the user's Supabase JWT)
//      -> {url} of the Stripe Customer Portal (change plan, card, cancel, invoices).
// POST with a Stripe-Signature header         Stripe webhook. Re-fetches the subscription from
//      Stripe (so out-of-order events can't leave stale state) and writes plan_tier,
//      subscription_status and the stripe_* columns on profiles. Each event id is recorded in
//      billing.stripe_events in the same transaction, so a repeated event changes nothing.
//
// Secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_STARTER, STRIPE_PRICE_PRO,
// STRIPE_PRICE_MAESTRO, APP_URL (e.g. https://app.subastian.us), BILLING_ENABLED ("true" to
// allow new checkouts; the webhook and portal work either way).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import postgres from "npm:postgres@3.4.5";
import Stripe from "npm:stripe@23.1.0";
import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import {
  cleanReferral, hasAccess, isHandled, isPlan, profilePatch, readPriceMap, safeAppUrl,
  trialDaysFor, type StripeSub,
} from "./logic.ts";

const env = (k: string) => Deno.env.get(k);
const sql = postgres(env("SUPABASE_DB_URL")!, { prepare: false, max: 2 });
const stripe = new Stripe(env("STRIPE_SECRET_KEY")!, { httpClient: Stripe.createFetchHttpClient() });
const crypto = Stripe.createSubtleCryptoProvider();
const auth = createClient(env("SUPABASE_URL")!, env("SUPABASE_ANON_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function signedInUser(req: Request) {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await auth.auth.getUser(token);
  return error || !data.user ? null : data.user;
}

type ProfileRow = {
  email: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: string | null;
};

async function checkout(userId: string, body: Record<string, unknown>) {
  if (env("BILLING_ENABLED") !== "true") return json({ error: "Plans open at launch." }, 403);
  if (!isPlan(body.plan)) return json({ error: "Pick a plan." }, 400);
  const prices = readPriceMap(env);
  const referral = cleanReferral(body.referral);

  // Lock the profile row so two clicks can't create two Stripe customers.
  const result = await sql.begin(async (tx) => {
    const [p] = await tx<ProfileRow[]>`
      select email, stripe_customer_id, stripe_subscription_id, subscription_status
      from public.profiles where id = ${userId} for update`;
    if (!p) return { error: "Profile not found." } as const;
    if (hasAccess(p.subscription_status)) return { error: "You already have a plan. Use Manage billing to change it." } as const;

    let customer = p.stripe_customer_id;
    if (!customer) {
      const c = await stripe.customers.create(
        { email: p.email, metadata: { user_id: userId } },
        { idempotencyKey: `customer:${userId}` },
      );
      customer = c.id;
      await tx`update public.profiles set stripe_customer_id = ${customer} where id = ${userId}`;
    }
    return { customer, previous: p.stripe_subscription_id } as const;
  });
  if ("error" in result) return json({ error: result.error }, 409);

  const metadata: Record<string, string> = { user_id: userId };
  if (referral) metadata.promotekit_referral = referral;
  const trial = trialDaysFor(result.previous);
  const appUrl = env("APP_URL")!;

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: result.customer,
    client_reference_id: userId,
    line_items: [{ price: prices[body.plan], quantity: 1 }],
    payment_method_collection: "always",
    allow_promotion_codes: true,
    metadata,
    subscription_data: { metadata, ...(trial ? { trial_period_days: trial } : {}) },
    success_url: safeAppUrl(appUrl, "/app/billing?checkout=success"),
    cancel_url: safeAppUrl(appUrl, "/app/billing?checkout=cancelled"),
  });
  return json({ url: session.url });
}

async function portal(userId: string) {
  const [p] = await sql<{ stripe_customer_id: string | null }[]>`
    select stripe_customer_id from public.profiles where id = ${userId}`;
  if (!p?.stripe_customer_id) return json({ error: "No billing account yet." }, 409);
  const s = await stripe.billingPortal.sessions.create({
    customer: p.stripe_customer_id,
    return_url: safeAppUrl(env("APP_URL")!, "/app/billing"),
  });
  return json({ url: s.url });
}

async function webhook(req: Request) {
  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      raw, req.headers.get("stripe-signature")!, env("STRIPE_WEBHOOK_SECRET")!, undefined, crypto,
    );
  } catch {
    return json({ error: "Bad signature" }, 400);
  }
  if (!isHandled(event.type)) return json({ ignored: event.type });

  let subId: string | null = null;
  let userId: string | null = null;
  if (event.type === "checkout.session.completed") {
    const s = event.data.object as Stripe.Checkout.Session;
    if (s.mode !== "subscription" || !s.subscription) return json({ ignored: "not a subscription checkout" });
    subId = typeof s.subscription === "string" ? s.subscription : s.subscription.id;
    userId = s.client_reference_id;
  } else {
    const s = event.data.object as Stripe.Subscription;
    subId = s.id;
    userId = s.metadata?.user_id ?? null;
  }

  const sub = (await stripe.subscriptions.retrieve(subId)) as unknown as StripeSub;
  const patch = profilePatch(sub, readPriceMap(env));
  userId ??= sub.metadata?.user_id ?? null;

  // One transaction in SQL: records the event id (repeats change nothing), then updates the profile.
  const [{ outcome }] = await sql<{ outcome: string }[]>`
    select billing.apply_subscription(
      ${event.id}, ${event.type}, ${userId}, ${patch.stripe_customer_id}, ${patch.stripe_subscription_id},
      ${patch.subscription_status}, ${patch.plan_tier}, ${patch.stripe_price_id}, ${patch.current_period_end},
      ${patch.cancel_at_period_end}
    ) as outcome`;

  if (patch.plan_tier === null) console.warn(`Unknown price ${patch.stripe_price_id} on ${sub.id}`);
  return json({ ok: true, outcome, plan: patch.plan_tier });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  try {
    if (req.headers.has("stripe-signature")) return await webhook(req);

    const user = await signedInUser(req);
    if (!user) return json({ error: "Sign in first." }, 401);
    const body = await req.json().catch(() => ({}));
    if (body.action === "checkout") return await checkout(user.id, body);
    if (body.action === "portal") return await portal(user.id);
    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error(e);
    // 500 makes Stripe retry the webhook later.
    return json({ error: "Billing is unavailable right now. Try again in a minute." }, 500);
  }
});
