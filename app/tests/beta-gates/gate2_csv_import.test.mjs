// Gate 2: statement (CSV) import accuracy and duplicates.
// Parsing uses the real app code (src/lib/statement.ts). Re-import runs against a local Postgres copy of the
// live schema + RLS, using importLikeServer() below, which mirrors importSubscriptions in
// src/app/app/actions.ts (lines 343-389): read tracked rows, skip alreadyTracked names, insert the rest.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readStatement, findSubscriptions, alreadyTracked, parseCsv } from "../../src/lib/statement.ts";
import { freshDb, asUser, makeUser, dropDb } from "./db.mjs";

const TODAY = "2026-11-09";
const fixture = (n) => readFileSync(new URL(`./fixtures/csv/${n}`, import.meta.url), "utf8");
const dataRows = (text) => parseCsv(text).length - 1; // minus header
const log = (...a) => console.log("  ", ...a);

/* ------------------------------- parsing ------------------------------- */

test("clean: every valid row is read with the right date and amount; 4 subscriptions found", () => {
  const text = fixture("clean.csv");
  const { charges, error } = readStatement(text);
  const expected = text.trim().split("\n").slice(1).map((l) => {
    const [date, description, amount] = l.split(",");
    return { date, description, amount: Number(amount) };
  });
  log(`rows in ${dataRows(text)}, charges out ${charges.length}, error ${error ?? "none"}`);
  assert.equal(error, undefined);
  assert.deepEqual(charges, expected);

  const subs = findSubscriptions(charges, TODAY);
  log("subscriptions:", subs.map((s) => `${s.name} ${s.billing_cycle} $${s.amount} next ${s.next_renewal} x${s.times}`).join(" | "));
  assert.deepEqual(
    subs.map((s) => [s.name, s.billing_cycle, s.amount, s.next_renewal, s.times]).sort(),
    [
      ["Acme Hosting", "monthly", 25, "2026-11-10", 3],
      ["Adobe Creative Cloud", "monthly", 54.99, "2026-11-15", 3],
      ["Ahrefs", "monthly", 129, "2026-11-20", 3],
      ["Canva", "monthly", 14.99, "2026-12-02", 3],
    ],
  );
});

test("malformed: valid rows still read; bad rows dropped", () => {
  const text = fixture("malformed.csv");
  const { charges, error } = readStatement(text);
  const kept = charges.map((c) => c.description);
  log(`rows in ${dataRows(text)}, charges out ${charges.length}, rejected ${dataRows(text) - charges.length}, error ${error ?? "none"}`);
  log("kept:", kept.join(" | "));
  assert.deepEqual(kept, ["ADOBE *CREATIVE CLD", "ADOBE *CREATIVE CLD", "ADOBE *CREATIVE CLD", "AHREFS.COM EXTRA COLUMNS", "BUFFER, INC"]);
  assert.equal(charges.find((c) => c.description === "BUFFER, INC").amount, 15);
});

test("GAP: rejected rows get no message (readStatement returns no per-row reasons)", () => {
  const { charges, error, ...rest } = readStatement(fixture("malformed.csv"));
  log(`error field: ${error ?? "undefined"}; other fields: ${JSON.stringify(Object.keys(rest))}`);
  assert.equal(error, undefined);
  assert.deepEqual(Object.keys(rest), []);
});

// What each mixed-format row really means (a US card export unless noted).
const MIXED_TRUTH = {
  "FMT ISO DATE": { date: "2026-10-01", amount: 10 },
  "FMT US SLASH THOUSANDS": { date: "2026-10-02", amount: 1234.56 },
  "FMT MONTH NAME POUND": { date: "2026-10-03", amount: 9.99 },
  "FMT DAY MONTH EURO": { date: "2026-10-04", amount: 19 },
  "FMT SHORT YEAR": { date: "2026-10-05", amount: 5.5 },
  "FMT CURRENCY CODE SUFFIX": { date: "2026-10-06", amount: 12 },
  "FMT DMY UNAMBIGUOUS": { date: "2026-10-25", amount: 7 },
  "FMT DMY AMBIGUOUS UK": { date: "2026-10-03", amount: 8 }, // UK bank: 3 October
  "FMT EU DECIMAL COMMA": { date: "2026-10-08", amount: 14.99 },
  "FMT EU THOUSANDS DOT": { date: "2026-10-09", amount: 1234.56 },
  "FMT REFUND PARENS": "credit",
  "FMT CREDIT CR": "credit",
  "FMT PLUS SIGN": { date: "2026-10-12", amount: 3 },
};

test("mixed formats: row-by-row result vs. what the row means", () => {
  const text = fixture("mixed_formats.csv");
  const { charges } = readStatement(text);
  const got = Object.fromEntries(charges.map((c) => [c.description, { date: c.date, amount: c.amount }]));
  let right = 0;
  const wrong = [];
  for (const [desc, truth] of Object.entries(MIXED_TRUTH)) {
    const g = got[desc];
    const ok = truth === "credit" ? g === undefined : g !== undefined && g.date === truth.date && g.amount === truth.amount;
    if (ok) right++;
    else wrong.push(`${desc}: expected ${JSON.stringify(truth)}, got ${g ? JSON.stringify(g) : "dropped"}`);
  }
  log(`rows in ${dataRows(text)}, charges out ${charges.length}, handled correctly ${right}/${Object.keys(MIXED_TRUTH).length}`);
  for (const w of wrong) log("WRONG", w);
  assert.equal(right, 9);
  assert.deepEqual(wrong.map((w) => w.split(":")[0]).sort(), [
    "FMT CURRENCY CODE SUFFIX", "FMT DMY AMBIGUOUS UK", "FMT EU DECIMAL COMMA", "FMT EU THOUSANDS DOT",
  ]);
});

test("GAP: ambiguous 03/10/2026 is read as March 10 (US), wrong for UK/EU statements, and is kept silently", () => {
  const { charges } = readStatement(fixture("mixed_formats.csv"));
  const c = charges.find((x) => x.description === "FMT DMY AMBIGUOUS UK");
  log(`03/10/2026 -> ${c?.date}`);
  assert.equal(c.date, "2026-03-10");
});

test("GAP: European file (semicolons, 54,99 decimal comma) reads 0 charges", () => {
  const text = fixture("eu_semicolon.csv");
  const { charges, error } = readStatement(text);
  log(`rows in ${dataRows(text)}, charges out ${charges.length}, message: "${error}"`);
  assert.equal(charges.length, 0);
  assert.equal(error, "We couldn't read any charges from that file.");
});

test("exact duplicates: repeated rows don't create extra subscriptions or inflate the price", () => {
  const text = fixture("exact_duplicates.csv");
  const { charges } = readStatement(text);
  const subs = findSubscriptions(charges, TODAY);
  log(`rows in ${dataRows(text)}, charges out ${charges.length}, subscriptions ${subs.length}:`, subs.map((s) => `${s.name} $${s.amount} x${s.times}`).join(" | "));
  assert.equal(charges.length, 9);
  assert.deepEqual(subs.map((s) => [s.name, s.amount, s.times]).sort(), [["Adobe Creative Cloud", 54.99, 3], ["Canva", 14.99, 3]]);
});

test("near duplicates: merchant spellings merge; a different merchant stays separate", () => {
  const text = fixture("near_duplicates.csv");
  const { charges } = readStatement(text);
  const subs = findSubscriptions(charges, TODAY);
  log(`rows in ${dataRows(text)}, charges out ${charges.length}, subscriptions ${subs.length}:`, subs.map((s) => `${s.name} (${s.confidence}) x${s.times}`).join(" | "));
  assert.deepEqual(subs.map((s) => [s.name, s.confidence, s.times]).sort(), [
    ["Acme Design Studio", "repeating", 3],
    ["Acme Hosting", "repeating", 3],
    ["Adobe Creative Cloud", "repeating", 3],
    ["Canva", "once", 1],
  ]);
});

/* ------------------------------ re-import (DB) ------------------------------ */

/** Mirrors importSubscriptions: read the user's rows, skip names alreadyTracked, insert the rest (one insert). */
async function importLikeServer(client, uid, candidates, afterRead = async () => {}) {
  return asUser(client, uid, async (c) => {
    const { rows: existing } = await c.query("select tool_name, status from subscriptions");
    await afterRead();
    const tracked = [...existing];
    const inserts = [];
    let skipped = 0;
    for (const r of candidates) {
      if (alreadyTracked(r.name, tracked)) { skipped++; continue; }
      tracked.push({ tool_name: r.name, status: "active" });
      inserts.push(r);
    }
    for (const r of inserts) {
      const monthly = Math.round((r.billing_cycle === "yearly" ? r.amount / 12 : r.amount) * 100) / 100;
      await c.query(
        "insert into subscriptions (user_id, tool_name, category, status, billing_cycle, monthly_cost, renewal_date) values ($1,$2,$3,'active',$4,$5,$6)",
        [uid, r.name, r.category, r.billing_cycle, monthly, r.next_renewal],
      );
    }
    return { added: inserts.length, skipped };
  });
}
const candidatesFrom = (n) => findSubscriptions(readStatement(fixture(n)).charges, TODAY);

let env;
before(async () => { env = await freshDb("gate2"); });
after(async () => { await dropDb(env.dbName, env.db); });

const countFor = async (uid) => (await env.db.query("select tool_name from subscriptions where user_id=$1 order by tool_name", [uid])).rows.map((r) => r.tool_name);

test("re-import: same file twice adds nothing the second time", async () => {
  const a = await makeUser(env.db, { email: "a@test.local" });
  const first = await importLikeServer(env.db, a, candidatesFrom("clean.csv"));
  const second = await importLikeServer(env.db, a, candidatesFrom("clean.csv"));
  const rows = await countFor(a);
  log(`first import ${JSON.stringify(first)}, second ${JSON.stringify(second)}, rows in DB ${rows.length}: ${rows.join(", ")}`);
  assert.deepEqual(first, { added: 4, skipped: 0 });
  assert.deepEqual(second, { added: 0, skipped: 4 });
  assert.equal(rows.length, 4);

  const third = await importLikeServer(env.db, a, candidatesFrom("near_duplicates.csv"));
  const after3 = await countFor(a);
  log(`then near_duplicates.csv ${JSON.stringify(third)}, rows in DB ${after3.length}: ${after3.join(", ")}`);
  assert.deepEqual(third, { added: 1, skipped: 3 });
  assert.deepEqual(after3, ["Acme Design Studio", "Acme Hosting", "Adobe Creative Cloud", "Ahrefs", "Canva"]);
});

test("re-import: a hand-added 'Canva Pro' blocks an imported 'Canva'; a cancelled row does not", async () => {
  const b = await makeUser(env.db, { email: "b@test.local" });
  await asUser(env.db, b, (c) => c.query("insert into subscriptions (user_id, tool_name, category, status, billing_cycle, monthly_cost, renewal_date) values ($1,'Canva Pro','Design','active','monthly',14.99,'2026-12-02'), ($1,'Ahrefs','SEO','cancelled','monthly',129,'2026-11-20')", [b]));
  const res = await importLikeServer(env.db, b, candidatesFrom("clean.csv"));
  const rows = await countFor(b);
  log(`import ${JSON.stringify(res)}, rows in DB ${rows.length}: ${rows.join(", ")}`);
  assert.deepEqual(res, { added: 3, skipped: 1 });
  assert.equal(rows.filter((n) => n === "Ahrefs").length, 2);
});

test("GAP: two imports at the same moment both insert (no unique constraint in the DB)", async () => {
  const c1 = await env.connect();
  const c2 = await env.connect();
  const u = await makeUser(env.db, { email: "race@test.local" });
  let release;
  const bothRead = new Promise((r) => (release = r));
  let reads = 0;
  const barrier = async () => { if (++reads === 2) release(); await bothRead; };
  const [r1, r2] = await Promise.all([
    importLikeServer(c1, u, candidatesFrom("clean.csv"), barrier),
    importLikeServer(c2, u, candidatesFrom("clean.csv"), barrier),
  ]);
  const rows = await countFor(u);
  log(`import 1 ${JSON.stringify(r1)}, import 2 ${JSON.stringify(r2)}, rows in DB ${rows.length} (expected 4 without duplicates)`);
  await c1.end(); await c2.end();
  assert.equal(rows.length, 8);
});
