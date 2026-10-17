// Subastian email sender (Supabase Edge Function, sends through Resend).
//
// POST  (header x-cron-secret)            send every due email in mail.outbox, within the daily cap
// POST  (header x-cron-secret) {test_to}  send one of each email to that address, marked [TEST]
// GET   ?u=<email>&t=<token>              unsubscribe link in every email
// POST  ?u=<email>&t=<token>              one-click unsubscribe from the mail app (RFC 8058)
//
// Secrets: RESEND_API_KEY (set by Daniel in the dashboard). Everything else lives in mail.settings.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import postgres from "npm:postgres@3.4.5";

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 2 });
const SITE = "https://subastian.us";
const FN_URL = `${Deno.env.get("SUPABASE_URL")}/functions/v1/email-sender`;

type Settings = {
  sending_enabled: boolean; daily_cap: number; from_address: string; reply_to: string;
  postal_address: string; cron_secret: string; unsub_secret: string;
};
type Kind = "roster_welcome" | "roster_day2" | "roster_day5" | "partner_kit";
type Mail = { subject: string; lines: string[]; footerWhy: string };

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

/* ------------------------------- the emails ------------------------------- */

export function buildEmail(kind: Kind, first: string | null): Mail {
  const name = first && /^[\p{L}'\-]{1,40}$/u.test(first) ? first : "there";
  switch (kind) {
    case "roster_welcome":
      return {
        subject: "You're on the Subastian founding roster (your free bonus is inside)",
        footerWhy: "you joined the Subastian founding roster at subastian.us",
        lines: [
          `Hi ${name},`,
          "",
          "Thanks for joining the Subastian founding roster. You're in.",
          "",
          "Your free bonus is ready: the Free Trial Tracker and the Cancel & Refund Scripts.",
          `Get them here: ${SITE}/bonus/`,
          "",
          "What happens next: Subastian is still in development. You'll hear first when early access opens, with launch pricing locked in. I'll only email you about Subastian.",
          "",
          "One favor: hit reply and tell me the most annoying thing about keeping track of your subscriptions. A sentence is plenty. I read every answer.",
          "",
          "Thanks,",
          "Daniel",
          "Founder, Subastian",
        ],
      };
    case "roster_day2":
      return {
        subject: "What's the most annoying thing about your subscriptions?",
        footerWhy: "you joined the Subastian founding roster at subastian.us",
        lines: [
          `Hi ${name},`,
          "",
          "Daniel here from Subastian. Thanks again for joining the founding roster.",
          "",
          "I'm still building, and I'd rather build what people actually need than guess. So I have one question, and a sentence is plenty:",
          "",
          "What's the most annoying thing about keeping track of your subscriptions?",
          "",
          "Just hit reply. I read every answer and reply to most of them myself.",
          "",
          "In case they're useful while you're here:",
          `- Your free bonus, the Free Trial Tracker and Cancel & Refund Scripts: ${SITE}/bonus/`,
          `- The 60-second Leak Test: a score, a rough monthly estimate of what your subscriptions may be wasting, and a printable 14-day plan: ${SITE}/leak-test/?src=day2email`,
          "",
          `If you'd rather see your exact number than an estimate, there's also the $9 Subscription Audit Kit, a spreadsheet and one-page guide. It has a 30-day refund and is entirely optional: ${SITE}/audit-kit/?src=day2email`,
          "",
          "Thanks,",
          "Daniel",
          "Founder, Subastian",
          "",
          'P.S. If you\'d be up for a 15-minute call about how you handle subscriptions today, reply "call" and I\'ll send times.',
        ],
      };
    case "roster_day5":
      return {
        subject: "Pick one (takes 5 seconds)",
        footerWhy: "you joined the Subastian founding roster at subastian.us",
        lines: [
          `Hi ${name},`,
          "",
          "Daniel again. I asked a question earlier this week and I know inboxes get busy, so here's an easier version. Just reply with a letter:",
          "",
          "A) Free trials that turn into charges",
          "B) Not knowing what I pay for in total",
          "C) Paying for two tools that do the same job",
          "D) Renewals I didn't see coming",
          "E) Something else (tell me in a line)",
          "",
          "That's it. Whatever you pick tells me what to build first.",
          "",
          `If you want something useful in the meantime, the free Cancel & Refund Scripts are the fastest win. Copy, paste, send: ${SITE}/bonus/`,
          "",
          `Curious what your subscriptions might be costing you? The 60-second Leak Test gives you a score and a rough estimate: ${SITE}/leak-test/?src=day5email`,
          "",
          `Or skip the estimate and get your exact number with the $9 Audit Kit: ${SITE}/audit-kit/?src=day5email`,
          "",
          "Thanks,",
          "Daniel",
        ],
      };
    case "partner_kit":
      return {
        subject: "Your Subastian Partner Launch Kit",
        footerWhy: "you applied to the Subastian Founding Partner program at subastian.us",
        lines: [
          `Hi ${name},`,
          "",
          "Thanks for applying to be a Subastian Founding Partner. Here's your Partner Launch Kit: swipe emails, social posts and banners you can use right away.",
          "",
          `Your kit: ${SITE}/partners/kit/`,
          "(Please keep that link to yourself. It's for partners only.)",
          "",
          "The short version of the rules:",
          "- Say it's in development. Point people to the free founding roster, not to a purchase.",
          `- Always disclose, e.g. "I'm a Subastian partner and may earn a commission."`,
          "- No made-up results, user numbers or launch dates.",
          "- No paid search ads on \"Subastian\".",
          "",
          `Your link for now: ${SITE}/?ref=YOURNAME (use your name or brand, no spaces). Signups through it are noted as coming from you.`,
          "",
          "At launch you'll get your personal affiliate link by email. That's the one that tracks the planned 40% recurring commission on paid plans, so swap it in everywhere once you have it.",
          "",
          "Questions? Just reply. I read every email.",
          "",
          "Thanks,",
          "Daniel",
          "Founder, Subastian",
        ],
      };
  }
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

async function send(s: Settings, to: string, kind: Kind, first: string | null, idempotencyKey: string, test = false) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) throw new Error("RESEND_API_KEY is not set");
  const mail = buildEmail(kind, first);
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
  if (!Deno.env.get("RESEND_API_KEY")) return { sent: 0, note: "RESEND_API_KEY not set yet" };
  const [{ n }] = await sql`select count(*)::int n from mail.outbox where status = 'sent' and sent_at > now() - interval '24 hours'`;
  const room = Math.max(0, Math.min(25, s.daily_cap - n));
  if (!room) return { sent: 0, note: "daily cap reached; the rest wait" };

  // Claim due rows so two overlapping runs never send the same email.
  const rows = await sql<{ id: number; to_email: string; first_name: string | null; kind: Kind }[]>`
    update mail.outbox o set attempts = attempts + 1, send_after = now() + interval '30 minutes'
    where o.id in (
      select id from mail.outbox where status = 'pending' and send_after <= now() and kind <> 'test'
      order by send_after limit ${room} for update skip locked)
    returning o.id, o.to_email, o.first_name, o.kind`;

  let sent = 0;
  const errors: string[] = [];
  for (const r of rows) {
    const [unsub] = await sql`select 1 from mail.unsubscribes where email = ${r.to_email.toLowerCase()}`;
    if (unsub) { await sql`update mail.outbox set status = 'skipped', last_error = 'unsubscribed' where id = ${r.id}`; continue; }
    try {
      const id = await send(s, r.to_email, r.kind, r.first_name, `outbox-${r.id}`);
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

async function sendTests(s: Settings, to: string) {
  const kinds: Kind[] = ["roster_welcome", "roster_day2", "roster_day5", "partner_kit"];
  const results: Record<string, string> = {};
  for (const k of kinds) {
    try { results[k] = "sent " + (await send(s, to, k, "Daniel", `test-${k}-${to}-${Date.now()}`, true)); }
    catch (e) { results[k] = "FAILED " + (e instanceof Error ? e.message : String(e)); }
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
