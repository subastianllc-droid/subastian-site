// Subastian renewal and free-trial alerts (Supabase Edge Function, sends through Resend).
//
// POST (header x-cron-secret)            hourly: send every alert due now, one email per person
// POST (header x-cron-secret) {test_to}  send one sample alert email to that address, marked [TEST]
// GET  ?a=<user id>&t=<token>            "Turn off alerts" link in every alert email
// POST ?a=<user id>&t=<token>            one-click unsubscribe from the mail app (RFC 8058)
//
// Who gets what is decided in SQL (mail.claim_due_alerts): alerts on, 8am or later in the
// person's time zone, an active renewal or trial ending exactly 30/7/3/1/0 days away.
// Nothing is sent while mail.settings.sending_enabled is false.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import postgres from "npm:postgres@3.4.5";
import { buildAlertEmail, type AlertItem, type AlertMail } from "./alert-email.ts";

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 2 });
const FN_URL = `${Deno.env.get("SUPABASE_URL")}/functions/v1/renewal-alerts`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type Settings = {
  sending_enabled: boolean; daily_cap: number; from_address: string; reply_to: string;
  postal_address: string; cron_secret: string; unsub_secret: string; app_url: string | null;
};

async function settings(): Promise<Settings> {
  const [s] = await sql<Settings[]>`
    select sending_enabled, daily_cap, from_address, reply_to, postal_address, cron_secret, unsub_secret, app_url
    from mail.settings`;
  return s;
}

async function token(userId: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`alerts:${userId.toLowerCase()}`)));
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

const FOOTER_WHY = "renewal alerts are on in your Subastian account";

function render(mail: AlertMail, offUrl: string, postal: string) {
  const text = [...mail.lines, "", "--", `You're getting this because ${FOOTER_WHY}.`, `Turn off alerts: ${offUrl}`, postal].join("\n");
  const linkify = (s: string) => escapeHtml(s).replace(/https:\/\/[^\s<)]+/g, (u) => `<a href="${u}" style="color:#6D28D9">${u}</a>`);
  const button = (u: string) =>
    `<div style="margin:4px 0 8px"><a href="${escapeHtml(u)}" style="display:inline-block;background:#6D28D9;color:#ffffff;` +
    `font-weight:600;text-decoration:none;padding:12px 20px;border-radius:8px">Open Subastian</a></div>`;
  const body = mail.lines
    .map((l) => {
      if (l === "") return "<br>";
      const open = /^Open Subastian: (https:\/\/\S+)$/.exec(l);
      return open ? button(open[1]) : `<div>${linkify(l)}</div>`;
    })
    .join("");
  const html = `<div style="font:16px/1.6 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f1d2b;max-width:560px">${body}` +
    `<div style="margin-top:28px;padding-top:12px;border-top:1px solid #e5e3ee;font-size:13px;color:#6b6880">` +
    `You're getting this because ${FOOTER_WHY}. <a href="${offUrl}" style="color:#6b6880">Turn off alerts</a>.<br>${escapeHtml(postal)}</div></div>`;
  return { text, html };
}

async function send(s: Settings, to: string, userId: string, mail: AlertMail, idempotencyKey: string, test = false) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) throw new Error("RESEND_API_KEY is not set");
  const offUrl = `${FN_URL}?a=${userId}&t=${await token(userId, s.unsub_secret)}`;
  const { text, html } = render(mail, offUrl, s.postal_address);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({
      from: s.from_address, to: [to], reply_to: s.reply_to,
      subject: (test ? "[TEST] " : "") + mail.subject, text, html,
      headers: { "List-Unsubscribe": `<${offUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Resend ${res.status}: ${JSON.stringify(out).slice(0, 300)}`);
  return out.id as string;
}

/* ------------------------------- handlers ------------------------------- */

async function turnOff(url: URL, s: Settings) {
  const a = (url.searchParams.get("a") || "").trim().toLowerCase();
  const t = url.searchParams.get("t") || "";
  if (!UUID.test(a) || !safeEqual(t, await token(a, s.unsub_secret))) {
    return new Response("That link isn't valid. You can turn alerts off from your Subastian dashboard, or reply to any alert and we'll do it for you.", { status: 400 });
  }
  await sql`update public.profiles set alerts_enabled = false where id = ${a}`;
  return new Response("Renewal alerts are off. You can turn them back on anytime from your Subastian dashboard.", {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

type Claimed = { user_id: string; email: string; full_name: string | null; items: (AlertItem & { log_id: string })[] };

async function processAlerts(s: Settings) {
  if (!s.sending_enabled) return { sent: 0, note: "sending is switched off in mail.settings" };
  if (!Deno.env.get("RESEND_API_KEY")) return { sent: 0, note: "RESEND_API_KEY not set yet" };

  // Share the daily cap with the roster emails so the Resend plan limit is never crossed.
  const [{ n }] = await sql`
    select (select count(*) from mail.outbox where status = 'sent' and sent_at > now() - interval '24 hours')
         + (select count(distinct resend_id) from public.alert_log where resend_id is not null and sent_at > now() - interval '24 hours') as n`;
  const room = Math.max(0, Math.min(20, s.daily_cap - Number(n)));
  if (!room) return { sent: 0, note: "daily cap reached; the rest wait for the next hourly run" };

  const people = await sql<Claimed[]>`select * from mail.claim_due_alerts(${room})`;
  let sent = 0;
  const errors: string[] = [];
  for (const p of people) {
    const ids = p.items.map((i) => i.log_id);
    let id: string;
    try {
      const mail = buildAlertEmail({ fullName: p.full_name, items: p.items, appUrl: s.app_url });
      id = await send(s, p.email, p.user_id, mail, `alerts-${[...ids].sort().join("-").slice(0, 200)}`);
    } catch (e) {
      // Not sent: release the claim so the next hourly run tries again.
      await sql`delete from public.alert_log where id = any(${ids}::uuid[]) and resend_id is null`;
      errors.push(String(e instanceof Error ? e.message : e).slice(0, 300));
      continue;
    }
    // Sent: keep the log rows (even if this update failed) so it is never sent twice.
    await sql`update public.alert_log set resend_id = ${id}, sent_at = now() where id = any(${ids}::uuid[])`.catch(console.error);
    sent++;
  }
  return { sent, people: people.length, errors };
}

async function sendTest(s: Settings, to: string) {
  const day = (n: number) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const mail = buildAlertEmail({
    fullName: "Daniel",
    appUrl: s.app_url,
    items: [
      { tool: "Canva Pro", kind: "trial", stage: 0, date: day(0), monthly_cost: 15 },
      { tool: "Ahrefs", kind: "renewal", stage: 3, date: day(3), monthly_cost: 129 },
      { tool: "Semrush", kind: "renewal", stage: 7, date: day(7), monthly_cost: 139.95 },
    ],
  });
  // The off-link in a test points at a made-up account, so clicking it changes nothing.
  return await send(s, to, "00000000-0000-0000-0000-000000000000", mail, `alerts-test-${to}-${Date.now()}`, true);
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const s = await settings();
    if (url.searchParams.has("a")) return await turnOff(url, s);
    if (req.method !== "POST") return new Response("Subastian", { status: 200 });

    if (!safeEqual(req.headers.get("x-cron-secret") || "", s.cron_secret)) return new Response("forbidden", { status: 403 });
    const body = await req.json().catch(() => ({}));
    if (body?.test_to) return Response.json({ test: await sendTest(s, String(body.test_to)) });
    return Response.json(await processAlerts(s));
  } catch (e) {
    console.error(e);
    return new Response("error", { status: 500 });
  }
});
