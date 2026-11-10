// Gate 4: trial and renewal alert timing, retries and duplicate protection.
// Tests the LIVE mail.claim_due_alerts / mail.roll_renewals logic (copied verbatim except
// now() -> mail.test_now()) and the exact SQL the renewal-alerts sender runs after a send:
//   success: update alert_log set resend_id = ..., sent_at = now() where id = any(ids)
//   failure: delete from public.alert_log where id = any(ids) and resend_id is null
// 2026 DST changes used: US starts Mar 8 / ends Nov 1; UK ends Oct 25; Sydney starts Oct 4.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { freshDb, makeUser, dropDb } from "./db.mjs";

let db, dbName, connect;
before(async () => ({ db, dbName, connect } = await freshDb("alerts")));
after(async () => dropDb(dbName, db));

async function claim(at, client = db) {
  await client.query("select set_config('test.now', $1, false)", [at]);
  return (await client.query("select * from mail.claim_due_alerts(20)")).rows;
}
const logIds = (rows) => rows.flatMap((r) => r.items.map((i) => i.log_id));
const sendOk = (ids) => db.query("update public.alert_log set resend_id = 'test-' || id, sent_at = now() where id = any($1::uuid[])", [ids]);
const sendFail = (ids) => db.query("delete from public.alert_log where id = any($1::uuid[]) and resend_id is null", [ids]);
async function sub(uid, { name = "Tool", renewal = null, trialEnds = null, status = "active" } = {}) {
  return (await db.query(
    "insert into public.subscriptions (user_id, tool_name, category, monthly_cost, status, renewal_date, trial_ends_at) values ($1,$2,'SEO',10,$3,$4,$5) returning id",
    [uid, name, status, renewal, trialEnds])).rows[0].id;
}
const itemsFor = (rows, uid) => rows.filter((r) => r.user_id === uid).flatMap((r) => r.items);
const log = (...a) => console.log("  ", ...a);

// ---- Timing across time zones and DST ------------------------------------------------------
const cases = [
  { zone: "America/Denver", label: "US DST starts (Mar 8 2026, 2am -> 3am)", renewal: "2026-03-15", stage: 7, before: "2026-03-08T13:59:00Z", at: "2026-03-08T14:00:00Z", local: "08:00 MDT" },
  { zone: "America/Denver", label: "US DST ends (Nov 1 2026, 2am -> 1am)", renewal: "2026-11-08", stage: 7, before: "2026-11-01T14:59:00Z", at: "2026-11-01T15:00:00Z", local: "08:00 MST" },
  { zone: "America/New_York", label: "US DST ends, Eastern", renewal: "2026-11-04", stage: 3, before: "2026-11-01T12:59:00Z", at: "2026-11-01T13:00:00Z", local: "08:00 EST" },
  { zone: "Europe/London", label: "UK clocks go back (Oct 25 2026)", renewal: "2026-10-26", stage: 1, before: "2026-10-25T07:59:00Z", at: "2026-10-25T08:00:00Z", local: "08:00 GMT" },
  { zone: "Australia/Sydney", label: "Sydney DST starts (Oct 4 2026)", renewal: "2026-10-07", stage: 3, before: "2026-10-03T20:59:00Z", at: "2026-10-03T21:00:00Z", local: "08:00 AEDT" },
  { zone: "Asia/Tokyo", label: "No DST, date ahead of UTC", renewal: "2026-11-11", stage: 1, before: "2026-11-09T22:59:00Z", at: "2026-11-09T23:00:00Z", local: "08:00 JST Nov 10" },
];
for (const c of cases) {
  test(`timing: ${c.zone}, ${c.label}: nothing at 07:59 local, sent at ${c.local}`, async () => {
    const u = await makeUser(db, { email: `${c.zone.replace(/\W/g, "")}${c.stage}@example.test`, timeZone: c.zone });
    await sub(u, { renewal: c.renewal });
    const early = itemsFor(await claim(c.before), u);
    const due = itemsFor(await claim(c.at), u);
    log(`${c.zone}: ${c.before} -> ${early.length} item(s); ${c.at} -> ${due.length} item(s), stage ${due[0]?.stage}`);
    assert.equal(early.length, 0);
    assert.equal(due.length, 1);
    assert.equal(due[0].stage, c.stage);
    await sendOk(logIds(await Promise.resolve([{ items: due }])));
  });
}

test("timing: the same UTC instant is a different 'today' per user (Tokyo due, Denver not)", async () => {
  const tokyo = await makeUser(db, { email: "tokyo2@example.test", timeZone: "Asia/Tokyo" });
  const denver = await makeUser(db, { email: "denver2@example.test", timeZone: "America/Denver" });
  await sub(tokyo, { renewal: "2026-12-11" });
  await sub(denver, { renewal: "2026-12-11" });
  const rows = await claim("2026-12-09T23:30:00Z"); // 08:30 Dec 10 Tokyo; 16:30 Dec 9 Denver
  log(`Tokyo items ${itemsFor(rows, tokyo).length} (stage ${itemsFor(rows, tokyo)[0]?.stage}); Denver items ${itemsFor(rows, denver).length}`);
  assert.equal(itemsFor(rows, tokyo).length, 1);
  assert.equal(itemsFor(rows, denver).length, 0, "Denver is 2 days out, not an alert stage");
  await sendOk(logIds(rows));
});

// ---- Which subscriptions qualify ------------------------------------------------------------
test("stages: only 30, 7, 3, 1 and 0 days out are alerted (checked offsets 0-31)", async () => {
  const u = await makeUser(db, { email: "stages@example.test", timeZone: "America/Denver" });
  const today = "2027-02-01";
  for (let d = 0; d <= 31; d++) {
    const date = new Date(Date.parse(today + "T00:00:00Z") + d * 864e5).toISOString().slice(0, 10);
    await sub(u, { name: `T${d}`, renewal: date });
  }
  const got = itemsFor(await claim("2027-02-01T16:00:00Z"), u).map((i) => i.stage).sort((a, b) => a - b);
  log(`offsets 0-31 -> alerted stages ${JSON.stringify(got)}`);
  assert.deepEqual(got, [0, 1, 3, 7, 30]);
});

test("stages: trials alert on trial_ends_at with kind 'trial'", async () => {
  const u = await makeUser(db, { email: "trial@example.test", timeZone: "America/New_York" });
  await sub(u, { status: "trial", trialEnds: "2027-03-04", renewal: "2027-05-01" });
  const items = itemsFor(await claim("2027-03-01T14:00:00Z"), u);
  log(`trial ending in 3 days -> ${JSON.stringify(items.map((i) => ({ kind: i.kind, stage: i.stage, date: i.date })))}`);
  assert.equal(items.length, 1);
  assert.equal(items[0].kind, "trial");
  assert.equal(items[0].date, "2027-03-04");
});

test("exclusions: paused, cancelled, alerts switched off, and invalid email get nothing", async () => {
  const on = await makeUser(db, { email: "excl@example.test" });
  const off = await makeUser(db, { email: "off@example.test", alerts: false });
  const bad = await makeUser(db, { email: "not-an-email" });
  await sub(on, { status: "paused", renewal: "2027-04-08" });
  await sub(on, { status: "cancelled", renewal: "2027-04-08" });
  await sub(off, { renewal: "2027-04-08" });
  await sub(bad, { renewal: "2027-04-08" });
  const rows = await claim("2027-04-01T16:00:00Z");
  const n = [on, off, bad].reduce((s, u) => s + itemsFor(rows, u).length, 0);
  log(`excluded cases -> ${n} items`);
  assert.equal(n, 0);
});

test("grouping: several items due for one person come back as ONE email row", async () => {
  const u = await makeUser(db, { email: "group@example.test" });
  await sub(u, { name: "A", renewal: "2027-05-08" });
  await sub(u, { name: "B", renewal: "2027-05-04" });
  await sub(u, { name: "C", status: "trial", trialEnds: "2027-05-01" });
  const rows = (await claim("2027-05-01T16:00:00Z")).filter((r) => r.user_id === u);
  log(`rows for person: ${rows.length}, items: ${rows[0]?.items.length}`);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].items.length, 3);
});

// ---- No duplicate sends ---------------------------------------------------------------------
test("no duplicates: hourly runs for 8 days (192 runs) claim each stage exactly once", async () => {
  const u = await makeUser(db, { email: "hourly@example.test", timeZone: "America/Denver" });
  const s = await sub(u, { renewal: "2027-06-08" });
  const claimed = [];
  let runs = 0;
  for (let h = 0; h < 192; h++) {
    const at = new Date(Date.parse("2027-06-01T07:07:00Z") + h * 36e5).toISOString();
    const items = itemsFor(await claim(at), u);
    runs++;
    for (const i of items) claimed.push(i.stage);
    await sendOk(items.map((i) => i.log_id));
  }
  const rows = (await db.query("select stage from public.alert_log where subscription_id = $1 order by stage desc", [s])).rows.map((r) => r.stage);
  log(`${runs} hourly runs -> stages claimed ${JSON.stringify(claimed)}; alert_log rows ${JSON.stringify(rows)}`);
  assert.deepEqual(claimed, [7, 3, 1, 0]);
  assert.deepEqual(rows, [7, 3, 1, 0]);
});

test("no duplicates: two overlapping runs at the same moment claim the item once", async () => {
  const u = await makeUser(db, { email: "race@example.test" });
  await sub(u, { renewal: "2027-07-08" });
  const c1 = await connect();
  const c2 = await connect();
  await c1.query("begin");
  await c2.query("begin");
  const r1 = claim("2027-07-01T16:00:00Z", c1);
  const first = await r1;
  const r2 = claim("2027-07-01T16:00:00Z", c2); // blocks on the unique key until c1 commits
  await c1.query("commit");
  const second = await r2;
  await c2.query("commit");
  await c1.end();
  await c2.end();
  const a = itemsFor(first, u).length, b = itemsFor(second, u).length;
  log(`run 1 claimed ${a}, overlapping run 2 claimed ${b}`);
  assert.equal(a + b, 1);
});

// ---- Retry on send failure ------------------------------------------------------------------
test("retry: a failed send is released and retried on the next hourly run, then never again", async () => {
  const u = await makeUser(db, { email: "retry@example.test" });
  await sub(u, { renewal: "2027-08-04" });
  const t = (h) => `2027-08-01T${String(h).padStart(2, "0")}:07:00Z`; // Denver 08:07, 09:07, ...
  const r1 = itemsFor(await claim(t(15)), u);
  await sendFail(r1.map((i) => i.log_id)); // email provider error
  const r2 = itemsFor(await claim(t(16)), u);
  await sendOk(r2.map((i) => i.log_id)); // succeeds on retry
  const r3 = itemsFor(await claim(t(17)), u);
  log(`attempt 1 claimed ${r1.length} (failed), attempt 2 claimed ${r2.length} (sent), attempt 3 claimed ${r3.length}`);
  assert.deepEqual([r1.length, r2.length, r3.length], [1, 1, 0]);
});

// ---- Known gaps (document behavior; do not fail the gate) ----------------------------------
test("GAP: a permanently failing address is retried every hour until local midnight", async () => {
  const u = await makeUser(db, { email: "bounce@example.test" });
  await sub(u, { renewal: "2027-09-04" });
  let attempts = 0;
  for (let h = 0; h < 30; h++) {
    const at = new Date(Date.parse("2027-09-01T06:07:00Z") + h * 36e5).toISOString();
    const items = itemsFor(await claim(at), u);
    if (items.length) attempts++;
    await sendFail(items.map((i) => i.log_id));
  }
  log(`GAP evidence: always-failing send -> ${attempts} attempts for the 3-day stage, no backoff or give-up flag`);
  assert.ok(attempts > 1);
});

test("GAP: if no run succeeds on the stage day, that alert is skipped (no catch-up)", async () => {
  const u = await makeUser(db, { email: "outage@example.test" });
  await sub(u, { renewal: "2027-10-08" });
  const items = itemsFor(await claim("2027-10-02T16:00:00Z"), u); // the 7-day day (Oct 1) was missed
  log(`GAP evidence: first run one day after the 7-day stage -> ${items.length} items`);
  assert.equal(items.length, 0);
});

test("GAP: month-end renewals drift when rolled month by month (Jan 31 -> Feb 28 -> Mar 28)", async () => {
  const u = await makeUser(db, { email: "drift@example.test" });
  const s = await sub(u, { renewal: "2027-01-31" });
  await db.query("select set_config('test.now', '2027-02-01T18:00:00Z', false)");
  await db.query("select mail.roll_renewals()");
  const feb = (await db.query("select renewal_date::text d from public.subscriptions where id = $1", [s])).rows[0].d;
  await db.query("select set_config('test.now', '2027-03-01T18:00:00Z', false)");
  await db.query("select mail.roll_renewals()");
  const mar = (await db.query("select renewal_date::text d from public.subscriptions where id = $1", [s])).rows[0].d;
  log(`GAP evidence: stored Jan 31 -> rolled ${feb} -> rolled ${mar} (a card billed on the 31st renews Mar 31)`);
  assert.equal(feb, "2027-02-28");
});
