import type { Subscription } from "@/lib/database.types";

/**
 * Purchase Guard: before a new tool is added, check it against everything the user already tracks.
 *
 * - Same tool: a row whose name matches after normalizing (case, spacing, domains, plan words like
 *   "Pro"). Active, trial and paused rows all count: a paused account usually still exists and can
 *   be resumed instead of paying for a second one.
 * - Similar name: a near match ("Manus" / "Manus AI" / "Manuss"), same statuses as above.
 * - Same category: other active, trial or paused tools in the category. "Other" is skipped because
 *   it groups unrelated tools.
 * - Cancelled before: a cancelled row with the same or a similar name.
 *
 * Any match asks the user to confirm. Pure and shared by the form (live) and the server action.
 */

export type GuardTool = Pick<
  Subscription,
  "id" | "tool_name" | "category" | "status" | "monthly_cost" | "renewal_date" | "trial_ends_at"
>;

export type GuardResult = {
  sameTool: GuardTool[];
  similarName: GuardTool[];
  sameCategory: GuardTool[];
  cancelledBefore: GuardTool[];
  /** A paused row of the same tool, which can be resumed instead of adding a new one. */
  resumable: GuardTool | null;
  /** Monthly cost of the active tools among the matches. Trials and paused tools aren't charging. */
  activeMonthlyAtStake: number;
};

export type GuardLevel = "none" | "stop" | "check" | "note";

/** "stop": likely the same tool. "check": overlaps by category. "note": only cancelled before. */
export function guardLevel(r: GuardResult): GuardLevel {
  if (r.sameTool.length || r.similarName.length) return "stop";
  if (r.sameCategory.length) return "check";
  if (r.cancelledBefore.length) return "note";
  return "none";
}

/** True when the user must choose before the tool is added. Every match counts. */
export function needsConfirmation(r: GuardResult): boolean {
  return guardLevel(r) !== "none";
}

const PLAN_WORDS = new Set([
  "pro",
  "plus",
  "premium",
  "business",
  "team",
  "teams",
  "basic",
  "starter",
  "standard",
  "enterprise",
  "personal",
  "app",
  "ai",
  "plan",
  "subscription",
  "monthly",
  "annual",
  "yearly",
]);

function words(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/\.(com|io|ai|app|co|so|net|org)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

/** "ClickUp Business" → "clickup", "Canva Pro" → "canva", "notion.so" → "notion", "Manus AI" → "manus". */
export function normalizeToolName(name: string): string {
  const w = words(name);
  // Drop trailing plan words, but never the whole name ("Basic" stays "basic").
  while (w.length > 1 && PLAN_WORDS.has(w[w.length - 1])) w.pop();
  return w.join("");
}

function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Near match on normalized names: one starts with the other (5+ letters), or a typo away. */
export function isSimilarName(a: string, b: string): boolean {
  if (!a || !b || a === b) return false;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length >= 5 && long.startsWith(short)) return true;
  if (short.length >= 5 && editDistance(a, b) <= (short.length >= 8 ? 2 : 1)) return true;
  return false;
}

export function checkPurchase(
  candidate: { tool_name: string; category: string },
  existing: GuardTool[],
  opts: { excludeId?: string } = {},
): GuardResult {
  const key = normalizeToolName(candidate.tool_name);
  const others = existing.filter((s) => s.id !== opts.excludeId);
  const open = others.filter((s) => s.status !== "cancelled");
  const cancelled = others.filter((s) => s.status === "cancelled");

  const sameTool = key ? open.filter((s) => normalizeToolName(s.tool_name) === key) : [];
  const similarName = key
    ? open.filter((s) => !sameTool.includes(s) && isSimilarName(key, normalizeToolName(s.tool_name)))
    : [];
  const named = new Set([...sameTool, ...similarName].map((s) => s.id));

  const sameCategory =
    candidate.category && candidate.category !== "Other"
      ? open.filter((s) => s.category === candidate.category && !named.has(s.id))
      : [];

  const cancelledBefore = key
    ? cancelled.filter((s) => {
        const k = normalizeToolName(s.tool_name);
        return k === key || isSimilarName(key, k);
      })
    : [];

  const resumable = sameTool.find((s) => s.status === "paused") ?? null;

  const activeMonthlyAtStake = [...sameTool, ...similarName, ...sameCategory]
    .filter((s) => s.status === "active")
    .reduce((sum, s) => sum + Number(s.monthly_cost), 0);

  return { sameTool, similarName, sameCategory, cancelledBefore, resumable, activeMonthlyAtStake };
}

/**
 * Purchase Guard on edit. Only the changes that could create a duplicate are checked:
 * - the name changed so it now matches (or nearly matches) another tracked tool, or
 * - a cancelled row is being reopened while another open copy of that tool exists.
 * Category overlap isn't raised again on edit; the dashboard's "Possible overlap" already lists it.
 * Returns null when there's nothing to confirm.
 */
export function checkEdit(
  before: { id: string; tool_name: string; status: string },
  after: { tool_name: string; category: string; status: string },
  existing: GuardTool[],
): GuardResult | null {
  if (after.status === "cancelled") return null;
  const renamed = normalizeToolName(before.tool_name) !== normalizeToolName(after.tool_name);
  const reopened = before.status === "cancelled";
  if (!renamed && !reopened) return null;

  const r = checkPurchase(after, existing, { excludeId: before.id });
  const result: GuardResult = {
    sameTool: r.sameTool,
    similarName: r.similarName,
    sameCategory: [],
    cancelledBefore: [],
    resumable: null,
    activeMonthlyAtStake: [...r.sameTool, ...r.similarName]
      .filter((s) => s.status === "active")
      .reduce((sum, s) => sum + Number(s.monthly_cost), 0),
  };
  return needsConfirmation(result) ? result : null;
}

export type GuardMatch = "same_tool" | "similar_name" | "same_category" | "cancelled_before";

/** The strongest reason Purchase Guard stopped a tool, as stored in `guard_skips.matched`. */
export function strongestMatch(r: GuardResult): GuardMatch | null {
  if (r.sameTool.length) return "same_tool";
  if (r.similarName.length) return "similar_name";
  if (r.sameCategory.length) return "same_category";
  if (r.cancelledBefore.length) return "cancelled_before";
  return null;
}

/**
 * What the user chose not to add after a Purchase Guard match. Counted once per tool (the latest
 * skip), and not at all if that tool is tracked again (trial, active or paused), since then it
 * wasn't really skipped. Costs are what the user typed into the form, not vendor prices.
 */
export function guardSavings(
  skips: { tool_name: string; monthly_cost: number | null; created_at: string }[],
  subs: { tool_name: string; status: string }[],
): { count: number; monthly: number } {
  const tracked = new Set(subs.filter((s) => s.status !== "cancelled").map((s) => normalizeToolName(s.tool_name)));
  const latest = new Map<string, number>();
  for (const s of [...skips].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    const key = normalizeToolName(s.tool_name);
    if (!key || tracked.has(key)) continue;
    latest.set(key, Number(s.monthly_cost ?? 0));
  }
  let monthly = 0;
  for (const v of latest.values()) monthly += v;
  return { count: latest.size, monthly: Math.round(monthly * 100) / 100 };
}
