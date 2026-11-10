import { test } from "node:test";
import assert from "node:assert/strict";
import { setupState } from "./getting-started.ts";

const row = (o: Partial<{ status: string; stack_id: string | null; renewal_date: string | null; trial_ends_at: string | null }>) => ({
  status: "active",
  stack_id: null,
  renewal_date: "2026-12-01",
  trial_ends_at: null,
  ...o,
});

test("new account: only alerts done", () => {
  const s = setupState([], null, true);
  assert.deepEqual(s.steps.map((x) => x.done), [false, false, true]);
  assert.equal(s.allDone, false);
});

test("sample rows don't count as the user's tools", () => {
  const s = setupState([row({ stack_id: "sample" }), row({ stack_id: "sample", renewal_date: null })], "sample", true);
  assert.equal(s.realCount, 0);
  assert.equal(s.missingDates, 0);
  assert.equal(s.steps[0].done, false);
});

test("missing renewal dates and trial end dates keep step 2 open", () => {
  const s = setupState(
    [row({}), row({ renewal_date: null }), row({ status: "trial", renewal_date: null, trial_ends_at: null })],
    null,
    true,
  );
  assert.equal(s.missingDates, 2);
  assert.equal(s.steps[1].done, false);
});

test("cancelled and paused rows don't need dates", () => {
  const s = setupState([row({}), row({ status: "cancelled", renewal_date: null }), row({ status: "paused", renewal_date: null })], null, true);
  assert.equal(s.missingDates, 0);
  assert.equal(s.allDone, true);
});

test("alerts off keeps the card showing", () => {
  const s = setupState([row({})], null, false);
  assert.equal(s.allDone, false);
  assert.equal(s.steps[2].done, false);
});
