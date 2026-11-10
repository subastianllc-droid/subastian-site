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

test("GAP: no 'resend confirmation email' action exists in the app", () => {
  const actions = src("src/app/login/actions.ts");
  const hasResend = /auth\.resend\(/.test(actions);
  console.log(`   auth.resend used: ${hasResend}`);
  assert.equal(hasResend, false);
});
