// Test helper: a fresh local Postgres database per test file, built from the live schema copy.
// Connects to a throwaway local server (PGHOST/PGPORT, default /tmp:54329). Never the live project.
import pg from "pg";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const HOST = process.env.PGHOST ?? "/tmp";
const PORT = Number(process.env.PGPORT ?? 54329);
const SQL_FILES = ["00_supabase_stub.sql", "01_schema_from_live.sql", "02_alert_functions_from_live.sql"];
// Migrations in this branch that aren't on the live database yet, applied on top of the live copy
// (now() -> mail.test_now() so tests can set the clock). GATE_LIVE_ONLY=1 tests the live logic alone.
// (The first two are applied to live as of 2026-11-10; the live snapshot above predates them.)
export const PENDING_MIGRATIONS = ["20261110_import_subscriptions_rpc.sql", "20261110b_alert_retries_catchup_anchor.sql", "20261110c_subscription_stack_owner.sql"];

export async function freshDb(name) {
  const dbName = `gate_${name}_${Date.now()}`;
  const admin = new pg.Client({ host: HOST, port: PORT, user: "postgres", database: "postgres" });
  await admin.connect();
  await admin.query(`create database ${dbName}`);
  await admin.end();
  const connect = async () => {
    const c = new pg.Client({ host: HOST, port: PORT, user: "postgres", database: dbName });
    await c.connect();
    return c;
  };
  const db = await connect();
  for (const f of SQL_FILES) await db.query(readFileSync(new URL(`./db/${f}`, import.meta.url), "utf8"));
  if (process.env.GATE_LIVE_ONLY !== "1") {
    for (const f of PENDING_MIGRATIONS) {
      const text = readFileSync(new URL(`../../supabase/migrations/${f}`, import.meta.url), "utf8");
      await db.query(text.replace(/\bnow\(\)/g, "mail.test_now()"));
    }
  }
  return { db, dbName, connect };
}

/** Run fn inside a transaction as a logged-in user (role authenticated, JWT sub = uid), like PostgREST does. */
export async function asUser(client, uid, fn) {
  await client.query("begin");
  try {
    await client.query("set local role authenticated");
    await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: uid, role: "authenticated" })]);
    const out = await fn(client);
    await client.query("commit");
    return out;
  } catch (e) {
    await client.query("rollback");
    throw e;
  }
}

/** Same, as a logged-out visitor (role anon, no user id). */
export async function asAnon(client, fn) {
  await client.query("begin");
  try {
    await client.query("set local role anon");
    await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "anon" })]);
    const out = await fn(client);
    await client.query("commit");
    return out;
  } catch (e) {
    await client.query("rollback");
    throw e;
  }
}

/** Create a test user (auth.users + profile, as the live handle_new_user trigger does). */
export async function makeUser(db, { email, timeZone = "America/Denver", alerts = true } = {}) {
  const id = randomUUID();
  await db.query("insert into auth.users (id, email) values ($1, $2)", [id, email]);
  await db.query("insert into public.profiles (id, email, time_zone, alerts_enabled) values ($1, $2, $3, $4)", [id, email, timeZone, alerts]);
  return id;
}

export async function dropDb(dbName, client) {
  await client.end();
  const admin = new pg.Client({ host: HOST, port: PORT, user: "postgres", database: "postgres" });
  await admin.connect();
  await admin.query(`drop database if exists ${dbName} with (force)`);
  await admin.end();
}
