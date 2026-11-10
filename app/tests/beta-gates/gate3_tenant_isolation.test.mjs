// Gate 3: tenant isolation. User A must not read, edit or delete user B's data.
// Runs as the same Postgres roles the Supabase Data API uses (anon / authenticated + JWT sub),
// against the live policies and grants copied into a local database.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { freshDb, asUser, asAnon, makeUser, dropDb } from "./db.mjs";

let db, dbName, A, B, subA, subB, stackB, alertB, skipB;

before(async () => {
  ({ db, dbName } = await freshDb("tenant"));
  A = await makeUser(db, { email: "user-a@example.test" });
  B = await makeUser(db, { email: "user-b@example.test" });
  stackB = (await db.query("insert into public.stacks (user_id, name) values ($1, 'B stack') returning id", [B])).rows[0].id;
  await db.query("insert into public.stacks (user_id, name) values ($1, 'A stack')", [A]);
  subA = (await db.query("insert into public.subscriptions (user_id, tool_name, category, monthly_cost, renewal_date) values ($1, 'A Tool', 'SEO', 10, '2026-12-01') returning id", [A])).rows[0].id;
  subB = (await db.query("insert into public.subscriptions (user_id, tool_name, category, monthly_cost, renewal_date, stack_id) values ($1, 'B Tool', 'SEO', 99, '2026-12-01', $2) returning id", [B, stackB])).rows[0].id;
  alertB = (await db.query("insert into public.alert_log (subscription_id, user_id, stage, renewal_date, kind) values ($1, $2, 7, '2026-12-01', 'renewal') returning id", [subB, B])).rows[0].id;
  skipB = (await db.query("insert into public.guard_skips (user_id, tool_name, category, matched) values ($1, 'B Skip', 'SEO', 'same_tool') returning id", [B])).rows[0].id;
});
after(async () => dropDb(dbName, db));

const count = async (sql, args = []) => Number((await db.query(sql, args)).rowCount);

// ---- READ --------------------------------------------------------------------------------
for (const [table, idCol] of [["profiles", "id"], ["subscriptions", "user_id"], ["stacks", "user_id"], ["alert_log", "user_id"], ["guard_skips", "user_id"]]) {
  test(`read: A sees none of B's ${table} rows`, async () => {
    const rows = await asUser(db, A, async (c) => (await c.query(`select ${idCol} as owner from public.${table}`)).rows);
    assert.equal(rows.filter((r) => r.owner === B).length, 0);
  });
  test(`read: logged-out visitor sees no ${table} rows`, async () => {
    const res = await asAnon(db, async (c) => c.query(`select 1 from public.${table}`).then((r) => r.rowCount).catch((e) => `denied: ${e.message}`));
    assert.ok(res === 0 || String(res).startsWith("denied"), `got ${res}`);
  });
}

test("read: A looking up B's subscription by its exact id gets nothing", async () => {
  const n = await asUser(db, A, (c) => c.query("select * from public.subscriptions where id = $1", [subB]).then((r) => r.rowCount));
  assert.equal(n, 0);
});

// ---- EDIT --------------------------------------------------------------------------------
test("edit: A updating B's subscription by id changes 0 rows, and B's row is unchanged", async () => {
  const n = await asUser(db, A, (c) => c.query("update public.subscriptions set monthly_cost = 0, tool_name = 'hacked' where id = $1", [subB]).then((r) => r.rowCount));
  assert.equal(n, 0);
  const row = (await db.query("select tool_name, monthly_cost from public.subscriptions where id = $1", [subB])).rows[0];
  assert.deepEqual(row, { tool_name: "B Tool", monthly_cost: "99" });
});
test("edit: A cannot move A's own subscription into B's account (user_id = B)", async () => {
  await assert.rejects(asUser(db, A, (c) => c.query("update public.subscriptions set user_id = $1 where id = $2", [B, subA])), /row-level security/);
});
test("edit: A updating B's profile changes 0 rows", async () => {
  const n = await asUser(db, A, (c) => c.query("update public.profiles set full_name = 'hacked' where id = $1", [B]).then((r) => r.rowCount));
  assert.equal(n, 0);
});
test("edit: A updating B's stack changes 0 rows", async () => {
  const n = await asUser(db, A, (c) => c.query("update public.stacks set name = 'hacked' where id = $1", [stackB]).then((r) => r.rowCount));
  assert.equal(n, 0);
});
test("edit: A cannot change billing fields on A's own profile (plan_tier, subscription_status, ls_*)", async () => {
  for (const col of ["plan_tier = 'maestro'", "subscription_status = 'active'", "ls_customer_id = 'x'", "customer_portal_url = 'https://evil.test'"]) {
    await assert.rejects(asUser(db, A, (c) => c.query(`update public.profiles set ${col} where id = $1`, [A])), /permission denied/, col);
  }
});
test("edit: A cannot write the alert log (even for A's own rows)", async () => {
  await assert.rejects(asUser(db, A, (c) => c.query("insert into public.alert_log (subscription_id, user_id, stage, renewal_date) values ($1, $2, 7, '2026-12-01')", [subA, A])), /permission denied/);
  await assert.rejects(asUser(db, A, (c) => c.query("delete from public.alert_log where id = $1", [alertB])), /permission denied/);
});

// ---- CREATE in someone else's account ------------------------------------------------------
test("create: A cannot insert a subscription owned by B", async () => {
  await assert.rejects(asUser(db, A, (c) => c.query("insert into public.subscriptions (user_id, tool_name, category, monthly_cost) values ($1, 'planted', 'SEO', 1)", [B])), /row-level security/);
});
test("create: A cannot insert a stack or guard skip owned by B", async () => {
  await assert.rejects(asUser(db, A, (c) => c.query("insert into public.stacks (user_id, name) values ($1, 'planted')", [B])), /row-level security/);
  await assert.rejects(asUser(db, A, (c) => c.query("insert into public.guard_skips (user_id, tool_name, category, matched) values ($1, 'x', 'SEO', 'same_tool')", [B])), /row-level security/);
});
test("create: A cannot create a second profile (for B or anyone)", async () => {
  await assert.rejects(asUser(db, A, (c) => c.query("insert into public.profiles (id, email) values ($1, 'x@example.test')", [B])), /row-level security|duplicate key/);
});
test("create: logged-out visitor cannot insert into A's account", async () => {
  await assert.rejects(asAnon(db, (c) => c.query("insert into public.subscriptions (user_id, tool_name, category, monthly_cost) values ($1, 'planted', 'SEO', 1)", [A])), /row-level security/);
});

// ---- DELETE -------------------------------------------------------------------------------
test("delete: A deleting B's subscription, stack, guard skip deletes 0 rows", async () => {
  const n1 = await asUser(db, A, (c) => c.query("delete from public.subscriptions where id = $1", [subB]).then((r) => r.rowCount));
  const n2 = await asUser(db, A, (c) => c.query("delete from public.stacks where id = $1", [stackB]).then((r) => r.rowCount));
  const n3 = await asUser(db, A, (c) => c.query("delete from public.guard_skips where id = $1", [skipB]).then((r) => r.rowCount));
  assert.deepEqual([n1, n2, n3], [0, 0, 0]);
  assert.equal(await count("select 1 from public.subscriptions where id = $1", [subB]), 1);
});
test("delete: A cannot delete B's profile (no delete policy)", async () => {
  const n = await asUser(db, A, (c) => c.query("delete from public.profiles where id = $1", [B]).then((r) => r.rowCount));
  assert.equal(n, 0);
});
test("delete: logged-out visitor deletes 0 subscriptions", async () => {
  const n = await asAnon(db, (c) => c.query("delete from public.subscriptions").then((r) => r.rowCount));
  assert.equal(n, 0);
});

// ---- Server-only functions ------------------------------------------------------------------
test("functions: users cannot run the alert or renewal jobs directly", async () => {
  await assert.rejects(asUser(db, A, (c) => c.query("select * from mail.claim_due_alerts(20)")), /permission denied/);
  await assert.rejects(asUser(db, A, (c) => c.query("select mail.roll_renewals()")), /permission denied/);
});

// ---- Known gap (documents current behavior, does not fail the gate) -------------------------
test("GAP (low): A can attach A's own subscription to B's stack id; B still can't see A's row", async () => {
  const res = await asUser(db, A, (c) =>
    c.query("insert into public.subscriptions (user_id, tool_name, category, monthly_cost, stack_id) values ($1, 'linked', 'SEO', 1, $2) returning id", [A, stackB])
      .then((r) => `inserted ${r.rowCount}`).catch((e) => `rejected: ${e.message}`));
  const bSees = await asUser(db, B, (c) => c.query("select 1 from public.subscriptions where user_id = $1", [A]).then((r) => r.rowCount));
  console.log(`  GAP evidence: A attaching to B's stack -> ${res}; rows of A visible to B -> ${bSees}`);
  assert.equal(bSees, 0);
});
