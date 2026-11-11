// Pure billing rules for the `billing` Edge Function. No Deno or Stripe imports, so `npm test`
// (Node) can test them.

export const PLANS = ["starter", "pro", "maestro"] as const;
export type Plan = (typeof PLANS)[number];

export const TRIAL_DAYS = 14;

/** Statuses that give access to the paid app. past_due keeps access while Stripe retries the card. */
export const ACCESS_STATUSES = ["trialing", "active", "past_due"] as const;

export const STRIPE_STATUSES = [
  "trialing", "active", "past_due", "unpaid", "canceled", "incomplete", "incomplete_expired", "paused",
] as const;

export function isPlan(v: unknown): v is Plan {
  return typeof v === "string" && (PLANS as readonly string[]).includes(v);
}

export function hasAccess(status: string | null | undefined): boolean {
  return !!status && (ACCESS_STATUSES as readonly string[]).includes(status);
}

/** Price ids come from env (STRIPE_PRICE_STARTER/PRO/MAESTRO). */
export type PriceMap = Record<Plan, string>;

export function readPriceMap(get: (k: string) => string | undefined): PriceMap {
  const map = {
    starter: get("STRIPE_PRICE_STARTER") ?? "",
    pro: get("STRIPE_PRICE_PRO") ?? "",
    maestro: get("STRIPE_PRICE_MAESTRO") ?? "",
  };
  for (const [plan, id] of Object.entries(map)) {
    if (!/^price_[A-Za-z0-9]+$/.test(id)) throw new Error(`STRIPE_PRICE_${plan.toUpperCase()} is missing or not a price id`);
  }
  return map;
}

export function planForPrice(priceId: string | null | undefined, prices: PriceMap): Plan | null {
  if (!priceId) return null;
  return (Object.keys(prices) as Plan[]).find((p) => prices[p] === priceId) ?? null;
}

/** The parts of a Stripe subscription the function uses. */
export type StripeSub = {
  id: string;
  status: string;
  customer: string | { id: string };
  cancel_at_period_end: boolean;
  current_period_end?: number | null; // older API versions
  metadata?: Record<string, string> | null;
  items: { data: Array<{ price: { id: string }; current_period_end?: number | null }> };
};

export type ProfilePatch = {
  plan_tier: Plan | null; // null = leave plan_tier as it is (unknown price)
  subscription_status: string;
  stripe_customer_id: string;
  stripe_subscription_id: string;
  stripe_price_id: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
};

/** Maps a subscription fetched fresh from Stripe to the profile columns. */
export function profilePatch(sub: StripeSub, prices: PriceMap): ProfilePatch {
  if (!(STRIPE_STATUSES as readonly string[]).includes(sub.status)) {
    throw new Error(`Unknown Stripe subscription status: ${sub.status}`);
  }
  const item = sub.items.data[0];
  const priceId = item?.price.id ?? null;
  const end = item?.current_period_end ?? sub.current_period_end ?? null;
  return {
    plan_tier: planForPrice(priceId, prices),
    subscription_status: sub.status,
    stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
    stripe_subscription_id: sub.id,
    stripe_price_id: priceId,
    current_period_end: end ? new Date(end * 1000).toISOString() : null,
    cancel_at_period_end: sub.cancel_at_period_end,
  };
}

/** Webhook events the function acts on; everything else is acknowledged and ignored. */
export const HANDLED_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
] as const;

export function isHandled(type: string): boolean {
  return (HANDLED_EVENTS as readonly string[]).includes(type);
}

/** Stripe metadata values must be short; PromoteKit referral ids are short tokens. */
export function cleanReferral(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return /^[A-Za-z0-9_-]{1,100}$/.test(s) ? s : null;
}

/**
 * One trial per person: no trial if they've had a Stripe subscription before.
 * Returns the trial length to send to Checkout, or null for none.
 */
export function trialDaysFor(previousSubscriptionId: string | null): number | null {
  return previousSubscriptionId ? null : TRIAL_DAYS;
}

/** Only redirect back into the app. */
export function safeAppUrl(appUrl: string, path: string): string {
  const base = new URL(appUrl);
  if (base.protocol !== "https:" && base.hostname !== "localhost") throw new Error("APP_URL must be https");
  if (!path.startsWith("/") || path.startsWith("//")) throw new Error("bad path");
  return new URL(path, base).toString();
}
