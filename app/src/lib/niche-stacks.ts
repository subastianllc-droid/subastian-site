import type { Subscription } from "@/lib/database.types";
import { isSimilarName, normalizeToolName } from "./purchase-guard.ts";

/**
 * Niche Stacks: a hand-priced tool stack for a kind of work, compared with what the user tracks.
 *
 * The stacks come from automation/build_stacks.py (the same data as subastian.us/stacks/), written
 * to niche-stacks.data.json. Every price is from the vendor's own page on the `checked` date.
 * Pure functions only, shared by the page and the tests.
 */

export type NicheTool = {
  name: string;
  job: string;
  price_text: string;
  free_text: string;
  src: string;
  in_lean: boolean;
  lean_monthly: number;
  unit: string | null;
  category: string;
  /** Monthly cost to prefill when adding it (same plan as price_text). */
  monthly_cost: number;
  /** Free-trial length on that plan, only where the vendor says so. 0 = no trial. */
  trial_days: number;
  /** Tools sharing a group do the same job: try them one at a time and keep one. */
  group: string | null;
};

export type NicheStack = {
  slug: string;
  niche: string;
  who: string;
  intro: string;
  lean_note: string;
  cuts: { title: string; body: string }[];
  tools: NicheTool[];
};

export type NicheData = { checked: string; checked_long: string; stacks: NicheStack[] };

type Tracked = Pick<Subscription, "id" | "tool_name" | "category" | "status" | "monthly_cost" | "trial_ends_at" | "trial_outcome">;

/**
 * have: active or paused. trying: on a free trial now. dropped: cancelled (including a trial they
 * didn't keep). none: not tracked.
 */
export type ToolState = "have" | "trying" | "dropped" | "none";

export type ToolStatus = { tool: NicheTool; state: ToolState; match: Tracked | null };

const RANK: Record<string, number> = { active: 0, trial: 1, paused: 2, cancelled: 3 };

/** The user's row for this tool (same or near-same name), preferring the one that's live. */
export function findTracked(tool: NicheTool, subs: Tracked[]): Tracked | null {
  const want = normalizeToolName(tool.name);
  const hits = subs.filter((s) => {
    const have = normalizeToolName(s.tool_name);
    return have === want || isSimilarName(have, want);
  });
  hits.sort((a, b) => (RANK[a.status] ?? 9) - (RANK[b.status] ?? 9));
  return hits[0] ?? null;
}

export function toolStatus(tool: NicheTool, subs: Tracked[]): ToolStatus {
  const match = findTracked(tool, subs);
  if (!match) return { tool, state: "none", match };
  const state: ToolState =
    match.status === "trial" ? "trying" : match.status === "cancelled" ? "dropped" : "have";
  return { tool, state, match };
}

export type TrialPlan =
  | { kind: "kept"; tool: NicheTool; others: NicheTool[] }
  | { kind: "trying"; tool: NicheTool; endsAt: string | null; next: NicheTool | null }
  | { kind: "next"; tool: NicheTool; tried: NicheTool[] }
  | { kind: "done"; tried: NicheTool[] };

/**
 * One-at-a-time trials for tools that do the same job. Keep one → stop. A trial running → wait for
 * it, show what's next. Otherwise the next untried tool, ones with a free trial first.
 */
export function trialPlan(group: ToolStatus[]): TrialPlan {
  const kept = group.find((g) => g.state === "have");
  if (kept) return { kind: "kept", tool: kept.tool, others: group.filter((g) => g !== kept).map((g) => g.tool) };

  const untried = group
    .filter((g) => g.state === "none")
    .sort((a, b) => Number(b.tool.trial_days > 0) - Number(a.tool.trial_days > 0));
  const tried = group.filter((g) => g.state === "dropped").map((g) => g.tool);

  const trying = group.find((g) => g.state === "trying");
  if (trying) {
    return { kind: "trying", tool: trying.tool, endsAt: trying.match?.trial_ends_at ?? null, next: untried[0]?.tool ?? null };
  }
  if (untried.length) return { kind: "next", tool: untried[0].tool, tried };
  return { kind: "done", tried };
}

export type StackView = {
  stack: NicheStack;
  /** Tools with no same-job group, in page order. */
  singles: ToolStatus[];
  /** Same-job groups, in the order their first tool appears. */
  groups: { id: string; tools: ToolStatus[]; plan: TrialPlan }[];
  leanMonthly: number;
  /** What the user pays now for this stack's tools (active rows only; trials and paused aren't charging). */
  yourMonthly: number;
  covered: number;
  jobs: number;
};

export function viewStack(stack: NicheStack, subs: Tracked[]): StackView {
  const statuses = stack.tools.map((t) => toolStatus(t, subs));
  const groups: StackView["groups"] = [];
  for (const s of statuses) {
    if (!s.tool.group || groups.some((g) => g.id === s.tool.group)) continue;
    const tools = statuses.filter((x) => x.tool.group === s.tool.group);
    groups.push({ id: s.tool.group, tools, plan: trialPlan(tools) });
  }
  const singles = statuses.filter((s) => !s.tool.group);

  // A "job" is one single tool or one group. It's covered when the user has or is trying a tool for it.
  const jobs = singles.length + groups.length;
  const covered =
    singles.filter((s) => s.state === "have" || s.state === "trying").length +
    groups.filter((g) => g.tools.some((t) => t.state === "have" || t.state === "trying")).length;

  // Count each of the user's rows once, even if two recommended tools matched it.
  const counted = new Map<string, number>();
  for (const s of statuses) {
    if (s.match && s.match.status === "active") counted.set(s.match.id, Number(s.match.monthly_cost));
  }

  return {
    stack,
    singles,
    groups,
    leanMonthly: Math.round(stack.tools.reduce((sum, t) => sum + t.lean_monthly, 0) * 100) / 100,
    yourMonthly: Math.round([...counted.values()].reduce((a, b) => a + b, 0) * 100) / 100,
    covered,
    jobs,
  };
}
