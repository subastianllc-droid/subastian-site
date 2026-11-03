import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAlertEmail, type AlertItem } from "./alert-email.ts";

const trial = (stage: number, cost: number | string | null = 15): AlertItem => ({
  tool: "Canva Pro", kind: "trial", stage, date: "2026-11-04", monthly_cost: cost,
});
const renewal = (stage: number, tool = "Ahrefs", cost: number | string | null = 129): AlertItem => ({
  tool, kind: "renewal", stage, date: "2026-11-04", monthly_cost: cost,
});

test("single trial: subject and line say when it ends and what it costs after", () => {
  const m = buildAlertEmail({ fullName: "Ann Lee", items: [trial(1)] });
  assert.equal(m.subject, "Your Canva Pro free trial ends tomorrow");
  assert.equal(m.lines[0], "Hi Ann,");
  assert.ok(m.lines.includes("- Canva Pro: free trial ends tomorrow (Nov 4). After that it's $15/mo unless you cancel."));
  assert.ok(m.lines.some((l) => l.startsWith("Free trial ending:")));
  assert.ok(!m.lines.some((l) => l.startsWith("Renewing:")));
});

test("single renewal today says the date moves on its own", () => {
  const m = buildAlertEmail({ items: [renewal(0)] });
  assert.equal(m.subject, "Ahrefs renews today");
  assert.equal(m.lines[0], "Hi there,");
  assert.ok(m.lines.includes("- Ahrefs: renews today (Nov 4). $129/mo."));
  assert.ok(m.lines.some((l) => l.includes("moves it to the next billing date on its own")));
});

test("several items: soonest first in subject and list", () => {
  const m = buildAlertEmail({ items: [renewal(7, "Semrush", "139.95"), renewal(3), trial(0)] });
  assert.equal(m.subject, "Your Canva Pro free trial ends today, plus 2 more reminders");
  const bullets = m.lines.filter((l) => l.startsWith("- "));
  assert.deepEqual(bullets.map((b) => b.split(":")[0]), ["- Canva Pro", "- Ahrefs", "- Semrush"]);
  assert.ok(bullets[2].endsWith("$139.95/mo."));
  assert.ok(m.subject.length < 80);
});

test("two items say 'reminder', 30 days says 'in 30 days'", () => {
  const m = buildAlertEmail({ items: [renewal(30), renewal(30, "Zoom", 0)] });
  assert.equal(m.subject, "Ahrefs renews in 30 days, plus 1 more reminder");
  assert.ok(m.lines.includes("- Zoom: renews in 30 days (Nov 4)."), "no price when cost is 0");
});

test("free-after-trial and odd names are handled safely", () => {
  const m = buildAlertEmail({ fullName: "<script>", items: [{ ...trial(3, 0), tool: "Tool\nwith newline" }] });
  assert.equal(m.lines[0], "Hi there,");
  assert.ok(m.lines.includes("- Tool with newline: free trial ends in 3 days (Nov 4)."));
});

test("app link only when it's an https URL", () => {
  assert.ok(buildAlertEmail({ items: [renewal(1)], appUrl: "https://app.example.com/" }).lines.includes("Open Subastian: https://app.example.com"));
  assert.ok(!buildAlertEmail({ items: [renewal(1)], appUrl: "javascript:alert(1)" }).lines.some((l) => l.startsWith("Open")));
  assert.ok(!buildAlertEmail({ items: [renewal(1)], appUrl: null }).lines.some((l) => l.startsWith("Open")));
});

test("never claims anything it can't know", () => {
  const text = buildAlertEmail({ items: [renewal(1), trial(1)] }).lines.join("\n");
  assert.match(text, /the ones you entered/);
  assert.doesNotMatch(text, /\b(save|saved|guarantee|hurry|last chance)\b/i);
});

test("no items is a bug, not an empty email", () => {
  assert.throws(() => buildAlertEmail({ items: [] }));
});
