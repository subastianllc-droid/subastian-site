// Subastian email sender (Supabase Edge Function, sends through Resend).
//
// POST  (header x-cron-secret)            send every due email in mail.outbox, within the daily cap
// POST  (header x-cron-secret) {test_to}  send one of each email to that address, marked [TEST]
// GET   ?u=<email>&t=<token>              unsubscribe link in every email
// POST  ?u=<email>&t=<token>              one-click unsubscribe from the mail app (RFC 8058)
//
// Nothing is sent from the queue while mail.settings.sending_enabled is false.
// Secrets: RESEND_API_KEY (set by Daniel in the dashboard). Everything else lives in mail.settings.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import postgres from "npm:postgres@3.4.5";
import { buildEmail, cleanReport, hasPlaceholder, type Ctx, type Kind, type Mail } from "./emails.ts";

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 2 });
const FN_URL = `${Deno.env.get("SUPABASE_URL")}/functions/v1/email-sender`;

type Settings = {
  sending_enabled: boolean; daily_cap: number; from_address: string; reply_to: string;
  postal_address: string; cron_secret: string; unsub_secret: string; referral_kit_url: string | null;
};

async function settings(): Promise<Settings> {
  const [s] = await sql<Settings[]>`select * from mail.settings`;
  return s;
}

async function token(email: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(email.toLowerCase())));
  return [...sig].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}

function render(mail: Mail, unsubUrl: string, postal: string) {
  const footer = ["--", `You're getting this because ${mail.footerWhy}.`, `Unsubscribe: ${unsubUrl}`, postal];
  const text = [...mail.lines, "", ...footer].join("\n");
  const linkify = (s: string) => escapeHtml(s).replace(/https:\/\/[^\s<)]+/g, (u) => `<a href="${u}" style="color:#6D28D9">${u}</a>`);
  const body = mail.lines.map((l) => (l === "" ? "<br>" : `<div>${linkify(l)}</div>`)).join("");
  const html = `<div style="font:15px/1.6 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f1d2b;max-width:560px">${body}` +
    `<div style="margin-top:28px;padding-top:12px;border-top:1px solid #e5e3ee;font-size:12px;color:#6b6880">` +
    `You're getting this because ${escapeHtml(mail.footerWhy)}. <a href="${unsubUrl}" style="color:#6b6880">Unsubscribe</a>.<br>${escapeHtml(postal)}</div></div>`;
  return { text, html };
}

async function send(s: Settings, to: string, mail: Mail, idempotencyKey: string, test = false) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) throw new Error("RESEND_API_KEY is not set");
  const unsubUrl = `${FN_URL}?u=${encodeURIComponent(to)}&t=${await token(to, s.unsub_secret)}`;
  const { text, html } = render(mail, unsubUrl, s.postal_address);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({
      from: s.from_address, to: [to], reply_to: s.reply_to,
      subject: (test ? "[TEST] " : "") + mail.subject, text, html,
      headers: { "List-Unsubscribe": `<${unsubUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Resend ${res.status}: ${JSON.stringify(out).slice(0, 300)}`);
  return out.id as string;
}

/* ------------------------------- per-email data ------------------------------- */

type Row = { id: number; to_email: string; first_name: string | null; kind: Kind; broadcast_id: number | null };
type Skip = { skip: string };

async function context(r: Row, s: Settings): Promise<Ctx | Skip> {
  const [w] = await sql<{ work_type: string | null; leak_report: unknown; referral_code: string | null; kit_buyer: boolean }[]>`
    select work_type, leak_report, referral_code, kit_buyer from public.waitlist
    where lower(email) = ${r.to_email.toLowerCase()} and not is_test limit 1`;
  const [k] = await sql`select 1 from mail.kit_buyers where email = ${r.to_email.toLowerCase()} and not refunded`;
  const kitBuyer = Boolean(w?.kit_buyer || k);

  const ctx: Ctx = {
    first: r.first_name,
    workType: w?.work_type ?? null,
    report: cleanReport(w?.leak_report),
    referralCode: w?.referral_code ?? null,
    kitBuyer,
    referralKitUrl: s.referral_kit_url,
  };

  if (r.kind === "roster_day5" && kitBuyer) return { skip: "already bought the Audit Kit" };
  if (r.kind === "referral_reward" && !/^https:\/\//.test(s.referral_kit_url ?? "")) return { skip: "WAIT referral_kit_url not set" };
  if (r.kind === "broadcast") {
    const [b] = await sql<{ subject: string; body: string; approved_at: string | null }[]>`
      select subject, body, approved_at from mail.broadcasts where id = ${r.broadcast_id}`;
    if (!b || !b.approved_at) return { skip: "broadcast not approved" };
    if (hasPlaceholder(b.subject + b.body)) return { skip: "broadcast still has [PLACEHOLDERS]" };
    ctx.broadcast = { subject: b.subject, body: b.body };
  }
  return ctx;
}

/* ------------------------------- handlers ------------------------------- */

async function unsubscribe(url: URL, s: Settings) {
  const u = (url.searchParams.get("u") || "").trim().toLowerCase();
  const t = url.searchParams.get("t") || "";
  if (!u || !safeEqual(t, await token(u, s.unsub_secret))) {
    return new Response("That unsubscribe link isn't valid. Reply to any Subastian email and we'll remove you by hand.", { status: 400 });
  }
  await sql`insert into mail.unsubscribes (email) values (${u}) on conflict do nothing`;
  await sql`update mail.outbox set status = 'skipped', last_error = 'unsubscribed' where lower(to_email) = ${u} and status = 'pending'`;
  return new Response("You're unsubscribed. You won't get any more emails from Subastian.", { headers: { "content-type": "text/plain; charset=utf-8" } });
}

async function processQueue(s: Settings) {
  if (!s.sending_enabled) return { sent: 0, note: "sending is switched off in mail.settings" };
  if (!Deno.env.get("RESEND_API_KEY")) return { sent: 0, note: "RESEND_API_KEY not set yet" };
  const [{ n }] = await sql`select count(*)::int n from mail.outbox where status = 'sent' and sent_at > now() - interval '24 hours'`;
  const room = Math.max(0, Math.min(25, s.daily_cap - n));
  if (!room) return { sent: 0, note: "daily cap reached; the rest wait" };

  // Claim due rows so two overlapping runs never send the same email.
  const rows = await sql<Row[]>`
    update mail.outbox o set attempts = attempts + 1, send_after = now() + interval '30 minutes'
    where o.id in (
      select id from mail.outbox where status = 'pending' and send_after <= now() and kind <> 'test'
      order by send_after limit ${room} for update skip locked)
    returning o.id, o.to_email, o.first_name, o.kind, o.broadcast_id`;

  let sent = 0;
  const errors: string[] = [];
  for (const r of rows) {
    const [unsub] = await sql`select 1 from mail.unsubscribes where email = ${r.to_email.toLowerCase()}`;
    if (unsub) { await sql`update mail.outbox set status = 'skipped', last_error = 'unsubscribed' where id = ${r.id}`; continue; }
    try {
      const ctx = await context(r, s);
      if ("skip" in ctx) {
        if (ctx.skip.startsWith("WAIT")) {
          // Not ready yet (e.g. the free-kit link isn't set). Try again in 6 hours; don't use up attempts.
          await sql`update mail.outbox set attempts = attempts - 1, send_after = now() + interval '6 hours', last_error = ${ctx.skip} where id = ${r.id}`;
        } else {
          await sql`update mail.outbox set status = 'skipped', last_error = ${ctx.skip} where id = ${r.id}`;
        }
        continue;
      }
      const id = await send(s, r.to_email, buildEmail(r.kind, ctx), `outbox-${r.id}`);
      await sql`update mail.outbox set status = 'sent', sent_at = now(), resend_id = ${id}, last_error = null where id = ${r.id}`;
      sent++;
    } catch (e) {
      const msg = String(e instanceof Error ? e.message : e).slice(0, 500);
      errors.push(msg);
      await sql`update mail.outbox set last_error = ${msg}, status = case when attempts >= 5 then 'failed' else 'pending' end where id = ${r.id}`;
    }
  }
  return { sent, claimed: rows.length, errors };
}

// One of each email to one address, filled with sample data, marked [TEST]. Works while sending is off.
async function sendTests(s: Settings, to: string) {
  const report = {
    score: 66, band: "Leaking", monthly: 90, yearly: 1080, leaks: 5, avg: 18,
    fixes: [
      { title: "Cancel or pause what you haven't used in 30 days", step: "List every subscription you didn't use in the last 30 days." },
      { title: "Keep one of each pair of overlapping tools", step: "Write one line next to each subscription saying what job it does." },
    ],
  };
  const base: Ctx = { first: "Daniel", referralCode: "ab12cd34", referralKitUrl: s.referral_kit_url ?? "https://subastian.gumroad.com/l/subscription-audit-kit/EXAMPLE" };
  const cases: [string, Kind, Ctx][] = [
    ["day0-with-report", "roster_welcome", { ...base, report }],
    ["day0-no-report", "roster_welcome", base],
    ["day2-agency", "roster_day2", { ...base, workType: "agency" }],
    ["day2-affiliate", "roster_day2", { ...base, workType: "affiliate" }],
    ["day2-creator", "roster_day2", { ...base, workType: "creator" }],
    ["day2-other", "roster_day2", base],
    ["day5", "roster_day5", base],
    ["kit-followup", "kit_followup", base],
    ["referral-reward", "referral_reward", base],
    ["partner-kit", "partner_kit", base],
  ];
  const results: Record<string, string> = {};
  for (const [label, kind, ctx] of cases) {
    try { results[label] = "sent " + (await send(s, to, buildEmail(kind, ctx), `test-${label}-${to}-${Date.now()}`, true)); }
    catch (e) { results[label] = "FAILED " + (e instanceof Error ? e.message : String(e)); }
  }
  return results;
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const s = await settings();
    if (url.searchParams.has("u")) return await unsubscribe(url, s);
    if (req.method !== "POST") return new Response("Subastian", { status: 200 });

    if (!safeEqual(req.headers.get("x-cron-secret") || "", s.cron_secret)) return new Response("forbidden", { status: 403 });
    const body = await req.json().catch(() => ({}));
    const result = body?.test_to ? await sendTests(s, String(body.test_to)) : await processQueue(s);
    return Response.json(result);
  } catch (e) {
    console.error(e);
    return new Response("error", { status: 500 });
  }
});
