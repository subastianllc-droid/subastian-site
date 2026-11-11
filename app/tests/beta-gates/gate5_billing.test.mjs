// Gate 5: Stripe billing state. Tests billing.apply_subscription (what the webhook runs) and that
// users can't touch billing columns or the event log. Local throwaway Postgres only.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { asAnon, asUser, dropDb, freshDb, makeUser } from "./db.mjs";

let db, dbName, a, b;

before(async () => {
  ({ db, dbName } = await freshDb("billing"));
  a = await makeUser(db, { email: "a@example.com" });
  b = await makeUser(db, { email: "b@example.com" });
});
after(() => dropDb(dbName, db));

let n = 0;
async function apply({ user = a, customer = "cus_A", sub = "sub_A1", status = "trialing", plan = "pro", price = "price_pro",
  end = "2026-11-25T18:00:00Z", cancel = false, eventId = `evt_${++n}`, type = "customer.subscription.updated" } = {}) {
  const { rows } = await db.query(
    "select billing.apply_subscription($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) as r",
    [eventId, type, user, customer, sub, status, plan, price, end, cancel],
  );
  return rows[0].r;
}
const profile = async (id) =>
  (await db.query("select plan_tier, subscription_status, stripe_customer_id, stripe_subscription_id, stripe_price_id, current_period_end, cancel_at_period_end from public.profiles where id=$1", [id])).rows[0];

test("checkout completes: trial on Pro is recorded", async () => {
  assert.equal(await apply({ type: "checkout.session.completed" }), "updated");
  const p = await profile(a);
  assert.equal(p.plan_tier, "pro");
  assert.equal(p.subscription_status, "trialing");
  assert.equal(p.stripe_customer_id, "cus_A");
  assert.equal(p.stripe_subscription_id, "sub_A1");
  assert.equal(p.current_period_end.toISOString(), "2026-11-25T18:00:00.000Z");
});

test("the same event twice changes nothing the second time", async () => {
  assert.equal(await apply({ eventId: "evt_dup", status: "active" }), "updated");
  await db.query("update public.profiles set subscription_status='past_due' where id=$1", [a]);
  assert.equal(await apply({ eventId: "evt_dup", status: "active" }), "duplicate");
  assert.equal((await profile(a)).subscription_status, "past_due");
  await apply({ status: "active" });
});

test("plan change, cancel at period end, then cancelled", async () => {
  await apply({ plan: "maestro", price: "price_maestro", status: "active" });
  assert.equal((await profile(a)).plan_tier, "maestro");
  await apply({ plan: "maestro", price: "price_maestro", status: "active", cancel: true });
  assert.equal((await profile(a)).cancel_at_period_end, true);
  await apply({ plan: "maestro", price: "price_maestro", status: "canceled", cancel: false, type: "customer.subscription.deleted" });
  const p = await profile(a);
  assert.equal(p.subscription_status, "canceled");
  assert.equal(p.plan_tier, "maestro", "plan_tier is kept; access comes from the status");
});

test("unknown price keeps the current plan_tier", async () => {
  await apply({ plan: null, price: "price_unknown", status: "active", sub: "sub_A2" });
  const p = await profile(a);
  assert.equal(p.plan_tier, "maestro");
  assert.equal(p.stripe_price_id, "price_unknown");
});

test("a late event about an old subscription can't cancel a newer active one", async () => {
  await apply({ sub: "sub_A3", status: "active", plan: "starter", price: "price_starter" });
  assert.equal(await apply({ sub: "sub_A1", status: "canceled", type: "customer.subscription.deleted" }), "kept_newer");
  const p = await profile(a);
  assert.equal(p.stripe_subscription_id, "sub_A3");
  assert.equal(p.subscription_status, "active");
});

test("event without a user id finds the person by Stripe customer", async () => {
  await db.query("update public.profiles set stripe_customer_id='cus_B' where id=$1", [b]);
  assert.equal(await apply({ user: null, customer: "cus_B", sub: "sub_B1", status: "trialing", plan: "starter" }), "updated");
  assert.equal((await profile(b)).subscription_status, "trialing");
  assert.equal(await apply({ user: null, customer: "cus_nobody", sub: "sub_X" }), "no_profile");
});

test("a bad status is rejected by the database", async () => {
  await assert.rejects(apply({ sub: "sub_A3", status: "free_forever" }), /profiles_subscription_status_check/);
});

test("users can't write their own plan or billing columns", async () => {
  for (const col of ["plan_tier = 'maestro'", "subscription_status = 'active'", "stripe_customer_id = 'cus_x'", "stripe_subscription_id = 'sub_x'", "cancel_at_period_end = true"]) {
    await assert.rejects(
      asUser(db, b, (c) => c.query(`update public.profiles set ${col} where id = '${b}'`)),
      /permission denied/, col,
    );
  }
});

test("users and visitors can't call the apply function or read the event log", async () => {
  await assert.rejects(
    asUser(db, b, (c) => c.query("select billing.apply_subscription('e','t',$1,'cus_B','sub_B9','active','maestro','p',now(),false)", [b])),
    /permission denied/,
  );
  await assert.rejects(asUser(db, b, (c) => c.query("select * from billing.stripe_events")), /permission denied/);
  await assert.rejects(asAnon(db, (c) => c.query("select * from billing.stripe_events")), /permission denied/);
});

test("users still see only their own billing state", async () => {
  const rows = await asUser(db, b, (c) => c.query("select id, subscription_status from public.profiles"));
  assert.deepEqual(rows.rows.map((r) => r.id), [b]);
});
