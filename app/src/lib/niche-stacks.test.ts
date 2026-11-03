import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CATEGORIES } from "./subscriptions.ts";
import { findTracked, toolStatus, viewStack, type NicheData, type NicheStack } from "./niche-stacks.ts";

const data: NicheData = JSON.parse(readFileSync(new URL("./niche-stacks.data.json", import.meta.url), "utf8"));
const stack = (slug: string): NicheStack => data.stacks.find((s) => s.slug === slug)!;

let n = 0;
function row(tool_name: string, status: string, extra: Partial<{ category: string; monthly_cost: number; trial_ends_at: string | null; trial_outcome: string | null }> = {}) {
  return { id: String(++n), tool_name, category: extra.category ?? "SEO", status, monthly_cost: extra.monthly_cost ?? 10, trial_ends_at: extra.trial_ends_at ?? null, trial_outcome: extra.trial_outcome ?? null };
}

test("data: five stacks, valid categories, real sources, sane prices", () => {
  assert.equal(data.stacks.length, 5);
  assert.match(data.checked, /^\d{4}-\d{2}-\d{2}$/);
  for (const s of data.stacks) {
    for (const t of s.tools) {
      assert.ok((CATEGORIES as readonly string[]).includes(t.category), `${s.slug}/${t.name}: ${t.category}`);
      assert.match(t.src, /^https:\/\//);
      assert.ok(t.monthly_cost >= 0 && t.monthly_cost < 1000, t.name);
      assert.ok([0, 7, 14].includes(t.trial_days), `${t.name} trial ${t.trial_days}`);
      // A tool said to have a trial must say so in its own free-trial text from the vendor page.
      if (t.trial_days) assert.match(t.free_text, new RegExp(`${t.trial_days}-day`), t.name);
    }
    // Every same-job group has at least two tools.
    const groups = new Set(s.tools.map((t) => t.group).filter(Boolean));
    for (const g of groups) assert.ok(s.tools.filter((t) => t.group === g).length >= 2, `${s.slug} group ${g}`);
  }
});

test("matches the user's tools by name, ignoring plan words, preferring the live row", () => {
  const ahrefs = stack("affiliate-marketing").tools.find((t) => t.name === "Ahrefs Lite")!;
  assert.equal(findTracked(ahrefs, [row("ahrefs", "cancelled"), row("Ahrefs Standard", "active")])?.status, "active");
  assert.equal(findTracked(ahrefs, [row("Semrush", "active")]), null);
  assert.equal(toolStatus(ahrefs, [row("Ahrefs", "trial")]).state, "trying");
  assert.equal(toolStatus(ahrefs, [row("Ahrefs", "cancelled")]).state, "dropped");
  assert.equal(toolStatus(ahrefs, [row("Ahrefs", "paused")]).state, "have");
});

test("trial plan: start with the tool that has a free trial", () => {
  const v = viewStack(stack("affiliate-marketing"), []);
  const research = v.groups.find((g) => g.id === "research")!;
  assert.equal(research.plan.kind, "next");
  assert.equal(research.plan.kind === "next" && research.plan.tool.name, "Semrush Pro"); // 7-day trial; Ahrefs has none
});

test("trial plan: while one is running, the next one waits", () => {
  const v = viewStack(stack("affiliate-marketing"), [row("Semrush", "trial", { trial_ends_at: "2026-11-09" })]);
  const plan = v.groups[0].plan;
  assert.equal(plan.kind, "trying");
  if (plan.kind === "trying") {
    assert.equal(plan.tool.name, "Semrush Pro");
    assert.equal(plan.endsAt, "2026-11-09");
    assert.equal(plan.next?.name, "Ahrefs Lite");
  }
});

test("trial plan: after dropping one, suggest the next; keeping one ends the chain", () => {
  const dropped = viewStack(stack("affiliate-marketing"), [row("Semrush", "cancelled", { trial_outcome: "cancelled" })]);
  const p1 = dropped.groups[0].plan;
  assert.equal(p1.kind, "next");
  if (p1.kind === "next") assert.deepEqual([p1.tool.name, p1.tried.map((t) => t.name)], ["Ahrefs Lite", ["Semrush Pro"]]);

  const kept = viewStack(stack("affiliate-marketing"), [row("Ahrefs", "active")]).groups[0].plan;
  assert.equal(kept.kind, "kept");

  const both = viewStack(stack("affiliate-marketing"), [row("Semrush", "cancelled"), row("Ahrefs", "cancelled")]).groups[0].plan;
  assert.equal(both.kind, "done");
});

test("three-way group: social schedulers, trials first", () => {
  const v = viewStack(stack("social-media-agency"), []);
  const g = v.groups.find((x) => x.id === "scheduling")!;
  assert.equal(g.tools.length, 3);
  assert.equal(g.plan.kind === "next" && g.plan.tool.trial_days > 0, true);
});

test("totals: lean cost, what you pay now, jobs covered", () => {
  const s = stack("affiliate-marketing");
  const v = viewStack(s, [
    row("Ahrefs Lite", "active", { monthly_cost: 129 }),
    row("ChatGPT Plus", "active", { category: "AI tools", monthly_cost: 20 }),
    row("Canva", "trial", { category: "Design", monthly_cost: 15 }),
  ]);
  assert.equal(v.leanMonthly, 157.3);
  assert.equal(v.yourMonthly, 149); // trials don't count as charging
  assert.equal(v.jobs, 5); // research group + Kit, Pretty Links, Canva, ChatGPT
  assert.equal(v.covered, 3); // research (Ahrefs), Canva (trying), ChatGPT
});
