import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cleanReferral, hasAccess, isHandled, isPlan, planForPrice, profilePatch, readPriceMap, safeAppUrl,
  trialDaysFor, type StripeSub,
} from "./logic.ts";

const env: Record<string, string> = {
  STRIPE_PRICE_STARTER: "price_Starter1",
  STRIPE_PRICE_PRO: "price_Pro1",
  STRIPE_PRICE_MAESTRO: "price_Maestro1",
};
const prices = readPriceMap((k) => env[k]);

function sub(over: Partial<StripeSub> = {}): StripeSub {
  return {
    id: "sub_1",
    status: "trialing",
    customer: "cus_1",
    cancel_at_period_end: false,
    metadata: { user_id: "u1" },
    items: { data: [{ price: { id: "price_Pro1" }, current_period_end: 1_800_000_000 }] },
    ...over,
  };
}

test("price ids map to plans, unknown prices to null", () => {
  assert.equal(planForPrice("price_Starter1", prices), "starter");
  assert.equal(planForPrice("price_Maestro1", prices), "maestro");
  assert.equal(planForPrice("price_Other", prices), null);
  assert.equal(planForPrice(null, prices), null);
});

test("missing or malformed price env is an error, not a silent wrong plan", () => {
  assert.throws(() => readPriceMap((k) => (k === "STRIPE_PRICE_PRO" ? undefined : env[k])), /STRIPE_PRICE_PRO/);
  assert.throws(() => readPriceMap((k) => (k === "STRIPE_PRICE_STARTER" ? "prod_123" : env[k])), /STARTER/);
});

test("profilePatch reads the item's period end (current API) and the plan", () => {
  const p = profilePatch(sub(), prices);
  assert.equal(p.plan_tier, "pro");
  assert.equal(p.subscription_status, "trialing");
  assert.equal(p.stripe_customer_id, "cus_1");
  assert.equal(p.stripe_price_id, "price_Pro1");
  assert.equal(p.current_period_end, new Date(1_800_000_000 * 1000).toISOString());
});

test("profilePatch falls back to the subscription's period end (older API) and expanded customer", () => {
  const p = profilePatch(
    sub({ customer: { id: "cus_2" }, current_period_end: 1_700_000_000, items: { data: [{ price: { id: "price_Starter1" } }] } }),
    prices,
  );
  assert.equal(p.stripe_customer_id, "cus_2");
  assert.equal(p.plan_tier, "starter");
  assert.equal(p.current_period_end, new Date(1_700_000_000 * 1000).toISOString());
});

test("cancelled and scheduled-to-cancel subscriptions", () => {
  assert.equal(profilePatch(sub({ status: "canceled" }), prices).subscription_status, "canceled");
  assert.equal(profilePatch(sub({ cancel_at_period_end: true }), prices).cancel_at_period_end, true);
  assert.throws(() => profilePatch(sub({ status: "weird" }), prices), /Unknown Stripe/);
});

test("access only while trialing, active or past_due", () => {
  for (const s of ["trialing", "active", "past_due"]) assert.equal(hasAccess(s), true, s);
  for (const s of ["canceled", "unpaid", "incomplete", "incomplete_expired", "paused", null, undefined]) {
    assert.equal(hasAccess(s), false, String(s));
  }
});

test("one free trial per person", () => {
  assert.equal(trialDaysFor(null), 14);
  assert.equal(trialDaysFor("sub_old"), null);
});

test("handled webhook events", () => {
  assert.equal(isHandled("checkout.session.completed"), true);
  assert.equal(isHandled("customer.subscription.deleted"), true);
  assert.equal(isHandled("invoice.paid"), false);
});

test("plans and referrals are validated", () => {
  assert.equal(isPlan("pro"), true);
  assert.equal(isPlan("enterprise"), false);
  assert.equal(cleanReferral(" abc_123 "), "abc_123");
  assert.equal(cleanReferral("<script>"), null);
  assert.equal(cleanReferral("x".repeat(101)), null);
  assert.equal(cleanReferral(undefined), null);
});

test("redirects stay inside the app", () => {
  assert.equal(safeAppUrl("https://app.subastian.us", "/app/billing"), "https://app.subastian.us/app/billing");
  assert.throws(() => safeAppUrl("https://app.subastian.us", "//evil.com"));
  assert.throws(() => safeAppUrl("http://app.subastian.us", "/app"));
  assert.equal(safeAppUrl("http://localhost:3000", "/app"), "http://localhost:3000/app");
});
