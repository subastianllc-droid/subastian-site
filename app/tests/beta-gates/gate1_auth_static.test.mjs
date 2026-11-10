// Gate 1 (partial): the parts of sign-up/confirmation that run without Supabase Auth or an inbox.
// The real flow (email sent, link clicked, expired/reused link, login before confirming) needs a staging
// Supabase project with email confirmation on and a test inbox. See REPORT.md.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { safeNext } from "../../src/lib/safe-next.ts";

const src = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

test("confirm link 'next' only redirects inside the app", () => {
  const cases = { "/app": "/app", "/app/import?x=1": "/app/import?x=1", "https://evil.example": "/app", "//evil.example": "/app", "/\\evil.example": "/app", "": "/app", null: "/app" };
  for (const [input, want] of Object.entries(cases)) {
    const got = safeNext(input === "null" ? null : input);
    console.log(`   safeNext(${JSON.stringify(input)}) -> ${got}`);
    assert.equal(got, want);
  }
});

test("bad, expired or reused link -> /login?error=link, which shows a clear message", () => {
  const route = src("src/app/auth/callback/route.ts");
  const page = src("src/app/login/page.tsx");
  assert.match(route, /redirect\(`\$\{origin\}\/login\?error=link`\)/);
  assert.match(page, /expired or was already used\. Request a new one below\./);
});

test("login before confirming shows 'Confirm your email first'", () => {
  const actions = src("src/app/login/actions.ts");
  assert.match(actions, /error\.code === "email_not_confirmed"[\s\S]{0,80}Confirm your email first/);
});

test("'Resend confirmation email' exists, is offered when needed, and doesn't reveal who has an account", () => {
  const actions = src("src/app/login/actions.ts");
  const form = src("src/app/login/login-form.tsx");
  const page = src("src/app/login/page.tsx");
  assert.match(actions, /auth\.resend\(\{\s*type: "signup"/);
  assert.match(actions, /email_not_confirmed"[\s\S]{0,120}unconfirmed: true/); // offered after "Confirm your email first"
  assert.match(form, /Resend confirmation email/);
  assert.match(page, /offerResend=\{linkError\}/); // offered after an expired or used link
  // One reply for every address, so the button can't be used to check who's signed up.
  assert.match(actions, /If \$\{email\} has an account waiting to be confirmed/);
  console.log("   resend: present; shown after unconfirmed login, after sign-up, and after an expired link; same reply for any address");
});
