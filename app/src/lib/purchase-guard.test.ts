// Run with: npm test  (Node's built-in test runner, no extra dependencies)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkEdit,
  checkPurchase,
  guardLevel,
  guardSavings,
  isSimilarName,
  normalizeToolName,
  strongestMatch,
  type GuardTool,
} from "./purchase-guard.ts";

function tool(id: string, tool_name: string, category: string, status = "active", monthly_cost = 10): GuardTool {
  return { id, tool_name, category, status, monthly_cost, renewal_date: null, trial_ends_at: null };
}

const list: GuardTool[] = [
  tool("1", "Canva Pro", "Design", "active", 15),
  tool("2", "ClickUp Business", "Project management", "paused", 12),
  tool("3", "Jasper", "AI tools", "cancelled", 49),
  tool("4", "Notion", "Project management", "trial", 10),
  tool("5", "Zapier", "Other", "active", 30),
];

test("normalizes plan words, domains and spacing", () => {
  assert.equal(normalizeToolName("Canva Pro"), "canva");
  assert.equal(normalizeToolName("notion.so"), "notion");
  assert.equal(normalizeToolName("Manus AI"), "manus");
  assert.equal(normalizeToolName("Click-Up  Business Plan"), "clickup");
  assert.equal(normalizeToolName("Basic"), "basic");
});

test("similar names: prefixes and small typos, but not short or unrelated names", () => {
  assert.ok(isSimilarName("manus", "manuss"));
  assert.ok(isSimilarName("clickfunnels", "clickfunnel"));
  assert.ok(!isSimilarName("zoom", "loom"));
  assert.ok(!isSimilarName("canva", "notion"));
});

test("same tool is a stop, even when paused, and offers resume", () => {
  const r = checkPurchase({ tool_name: "ClickUp", category: "Project management" }, list);
  assert.equal(guardLevel(r), "stop");
  assert.deepEqual(r.sameTool.map((s) => s.id), ["2"]);
  assert.equal(r.resumable?.id, "2");
  assert.equal(strongestMatch(r), "same_tool");
});

test("same category is a check; trials and paused don't count toward money at stake", () => {
  const r = checkPurchase({ tool_name: "Asana", category: "Project management" }, list);
  assert.equal(guardLevel(r), "check");
  assert.deepEqual(r.sameCategory.map((s) => s.id).sort(), ["2", "4"]);
  assert.equal(r.activeMonthlyAtStake, 0);
});

test("'Other' never counts as overlap", () => {
  const r = checkPurchase({ tool_name: "Make", category: "Other" }, list);
  assert.equal(guardLevel(r), "none");
});

test("cancelled before is a note", () => {
  const r = checkPurchase({ tool_name: "Jasper AI", category: "Video" }, list);
  assert.equal(guardLevel(r), "note");
  assert.equal(strongestMatch(r), "cancelled_before");
});

test("edit: changing cost or dates on a tool doesn't warn about itself", () => {
  assert.equal(checkEdit(list[0], { tool_name: "Canva Pro", category: "Design", status: "active" }, list), null);
});

test("edit: renaming into another tracked tool warns", () => {
  const r = checkEdit(list[4], { tool_name: "Canva", category: "Other", status: "active" }, list);
  assert.ok(r);
  assert.deepEqual(r.sameTool.map((s) => s.id), ["1"]);
  assert.equal(r.sameCategory.length, 0);
  assert.equal(r.activeMonthlyAtStake, 15);
});

test("edit: reopening a cancelled tool warns only if another copy is open", () => {
  const withCopy = [...list, tool("6", "Jasper", "AI tools", "active", 49)];
  assert.ok(checkEdit(list[2], { tool_name: "Jasper", category: "AI tools", status: "active" }, withCopy));
  assert.equal(checkEdit(list[2], { tool_name: "Jasper", category: "AI tools", status: "active" }, list), null);
});

test("edit: cancelling never warns", () => {
  assert.equal(checkEdit(list[4], { tool_name: "Canva", category: "Other", status: "cancelled" }, list), null);
});

test("savings: once per tool, latest cost, and not if the tool is tracked again", () => {
  const skips = [
    { tool_name: "Loom", monthly_cost: 12, created_at: "2026-10-01T00:00:00Z" },
    { tool_name: "Loom Business", monthly_cost: 15, created_at: "2026-10-05T00:00:00Z" },
    { tool_name: "Canva", monthly_cost: 15, created_at: "2026-10-02T00:00:00Z" },
    { tool_name: "Descript", monthly_cost: null, created_at: "2026-10-03T00:00:00Z" },
  ];
  const r = guardSavings(skips, list);
  assert.equal(r.count, 2); // Loom (latest $15) + Descript (unknown cost); Canva is tracked again
  assert.equal(r.monthly, 15);
});
