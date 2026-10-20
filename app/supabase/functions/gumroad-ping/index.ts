// Gumroad "Ping" receiver for the $9 Subscription Audit Kit.
//
// Gumroad -> Settings -> Advanced -> Ping:
//   https://yhasuhzqykikacwezwyu.supabase.co/functions/v1/gumroad-ping?t=<mail.settings.gumroad_token>
//
// Each sale: records the buyer (so the Day 5 Kit email skips them), queues the Kit how-to email
// (which carries the $49 done-for-you audit offer), and adds the buyer to the Founding Roster
// only if they ticked the roster checkbox at checkout (a Gumroad custom field with "roster" in its name).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import postgres from "npm:postgres@3.4.5";

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 1 });
const KIT_PERMALINKS = new Set(["subscription-audit-kit"]);

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

const yes = (v: string | null) => v !== null && /^(true|on|yes|1|checked)$/i.test(v.trim());

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return new Response("ok");
    const [s] = await sql<{ gumroad_token: string; gumroad_seller_id: string | null }[]>`
      select gumroad_token, gumroad_seller_id from mail.settings`;
    const t = new URL(req.url).searchParams.get("t") || "";
    if (!safeEqual(t, s.gumroad_token)) return new Response("forbidden", { status: 403 });

    const form = await req.formData();
    const get = (k: string) => {
      const v = form.get(k);
      return typeof v === "string" ? v : null;
    };

    if (s.gumroad_seller_id && get("seller_id") !== s.gumroad_seller_id) return new Response("wrong seller", { status: 403 });
    if (!KIT_PERMALINKS.has(get("product_permalink") ?? "") && !KIT_PERMALINKS.has(get("permalink") ?? "")) {
      return new Response("ignored: not the Audit Kit");
    }
    if (yes(get("refunded"))) {
      await sql`update mail.kit_buyers set refunded = true where email = ${(get("email") ?? "").trim().toLowerCase()}`;
      return new Response("refund noted");
    }

    let wantsRoster = false;
    for (const [k, v] of form.entries()) {
      if (/roster/i.test(k) && typeof v === "string" && yes(v)) wantsRoster = true;
    }

    const email = (get("email") ?? "").trim().toLowerCase();
    const isTest = yes(get("test"));
    if (!email) return new Response("no email", { status: 400 });
    if (isTest) return Response.json({ ok: true, test: true, email, wantsRoster });

    await sql`select mail.record_kit_sale(${email}, ${get("sale_id")}, ${wantsRoster}, ${get("full_name")})`;
    return Response.json({ ok: true });
  } catch (e) {
    console.error(e);
    return new Response("error", { status: 500 });
  }
});
