import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CATEGORIES } from "./subscriptions.ts";
import { CATALOG, findCatalogTool, priceHint, suggestTools } from "./tool-catalog.ts";
import { normalizeToolName } from "./purchase-guard.ts";
import type { NicheData } from "./niche-stacks.ts";

const data: NicheData = JSON.parse(readFileSync(new URL("./niche-stacks.data.json", import.meta.url), "utf8"));

test("catalog: valid categories, no duplicate tools", () => {
  const seen = new Set<string>();
  for (const t of CATALOG) {
    assert.ok((CATEGORIES as readonly string[]).includes(t.category), t.name);
    const n = normalizeToolName(t.name);
    assert.ok(!seen.has(n), `duplicate ${t.name}`);
    seen.add(n);
  }
});

test("finds tools ignoring case and plan words", () => {
  assert.equal(findCatalogTool("semrush pro")?.category, "SEO");
  assert.equal(findCatalogTool("Canva Pro")?.name, "Canva");
  assert.equal(findCatalogTool("My Own Tool"), null);
});

test("suggestions start with what's typed", () => {
  assert.deepEqual(suggestTools("ca").map((t) => t.name).slice(0, 3), ["Calendly", "Canva", "Capcut"]);
  assert.deepEqual(suggestTools("c"), []);
});

test("checked prices only when they're unambiguous", () => {
  assert.equal(priceHint("Semrush Pro", data)?.monthly_cost, 139.95);
  assert.equal(priceHint("Semrush Pro", data)?.trial_days, 7);
  assert.equal(priceHint("Semrush", data), null, "Pro and Guru differ");
  assert.equal(priceHint("Canva", data), null, "free and Pro differ");
  assert.equal(priceHint("canva pro", data)?.monthly_cost, 12);
  assert.equal(priceHint("AgencyAnalytics Core", data), null, "per-client totals aren't a single price");
  assert.equal(priceHint("Zoom", data), null);
});
