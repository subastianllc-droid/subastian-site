import type { Subscription } from "@/lib/database.types";

/**
 * Purchase Guard: before a new tool is added, check it against what the user already tracks.
 *
 * - Same tool: an active or trial row whose name matches (ignoring case, spacing and plan words
 *   like "Pro" or "Business"). Almost always a mistake or a forgotten second account.
 * - Same category: active or trial tools in the same category. A prompt to check the new tool
 *   does something the others don't. "Other" is skipped because it groups unrelated tools.
 * - Tracked before: a paused or cancelled row with the same name. Shown as a note, not a warning.
 *
 * Pure and shared by the form (live warning) and the server action (final check).
 */

export type GuardTool = Pick<
  Subscription,
  "id" | "tool_name" | "category" | "status" | "monthly_cost" | "renewal_date" | "trial_ends_at"
>;

export type GuardResult = {
  sameTool: GuardTool[];
  sameCategory: GuardTool[];
  trackedBefore: GuardTool[];
  /** Monthly cost of the active tools in sameTool + sameCategory. Trials aren't charged yet, so they're left out. */
  activeMonthlyAtStake: number;
};

/** True when the user should see the warning and confirm before adding. */
export function needsConfirmation(r: GuardResult): boolean {
  return r.sameTool.length > 0 || r.sameCategory.length > 0;
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
  "plan",
  "subscription",
]);

/** "ClickUp Business" → "clickup", "Canva Pro" → "canva", "notion.so" → "notion". */
export function normalizeToolName(name: string): string {
  const words = name
    .toLowerCase()
    .replace(/\.(com|io|ai|app|co|so|net|org)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  // Drop trailing plan words, but never the whole name ("Basic" stays "basic").
  while (words.length > 1 && PLAN_WORDS.has(words[words.length - 1])) words.pop();
  return words.join("");
}

export function checkPurchase(
  candidate: { tool_name: string; category: string },
  existing: GuardTool[],
  opts: { excludeId?: string } = {},
): GuardResult {
  const key = normalizeToolName(candidate.tool_name);
  const live = (s: GuardTool) => s.status === "active" || s.status === "trial";
  const others = existing.filter((s) => s.id !== opts.excludeId);

  const sameTool = key ? others.filter((s) => live(s) && normalizeToolName(s.tool_name) === key) : [];
  const sameToolIds = new Set(sameTool.map((s) => s.id));

  const sameCategory =
    candidate.category && candidate.category !== "Other"
      ? others.filter((s) => live(s) && s.category === candidate.category && !sameToolIds.has(s.id))
      : [];

  const trackedBefore = key
    ? others.filter((s) => !live(s) && normalizeToolName(s.tool_name) === key)
    : [];

  const activeMonthlyAtStake = [...sameTool, ...sameCategory]
    .filter((s) => s.status === "active")
    .reduce((sum, s) => sum + Number(s.monthly_cost), 0);

  return { sameTool, sameCategory, trackedBefore, activeMonthlyAtStake };
}
