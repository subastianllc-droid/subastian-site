import { addDays } from "@/lib/subscriptions";

/**
 * Sample data so a new user can see what Subastian does before entering their own tools.
 * Prices are rough sample budgets, not vendor quotes. The UI says so wherever the sample appears.
 * Every sample row lives in the stack named SAMPLE_STACK_NAME, which is how "Remove sample" finds them.
 */
export const SAMPLE_STACK_NAME = "Sample: small agency stack";

type SampleTool = {
  tool_name: string;
  category: string;
  monthly_cost: number;
  /** Days from today until renewal (active) or trial end (trial). */
  in_days: number;
  status?: "active" | "trial";
  /** Days since last use; omitted means used recently. */
  unused_days?: number;
};

const TOOLS: SampleTool[] = [
  { tool_name: "Google Workspace", category: "Other", monthly_cost: 168, in_days: 19 },
  { tool_name: "Slack", category: "Communication", monthly_cost: 105, in_days: 6 },
  { tool_name: "HubSpot", category: "CRM", monthly_cost: 50, in_days: 23 },
  { tool_name: "Asana", category: "Project management", monthly_cost: 132, in_days: 12 },
  { tool_name: "ClickUp", category: "Project management", monthly_cost: 84, in_days: 3, unused_days: 52 },
  { tool_name: "Adobe Creative Cloud", category: "Design", monthly_cost: 90, in_days: 27 },
  { tool_name: "Canva", category: "Design", monthly_cost: 30, in_days: 9 },
  { tool_name: "Semrush", category: "SEO", monthly_cost: 140, in_days: 15 },
  { tool_name: "Ahrefs", category: "SEO", monthly_cost: 129, in_days: 33, unused_days: 41 },
  { tool_name: "Zapier", category: "Automation", monthly_cost: 70, in_days: 21 },
  { tool_name: "Loom", category: "Video", monthly_cost: 75, in_days: 11 },
  { tool_name: "ChatGPT", category: "AI tools", monthly_cost: 60, in_days: 2 },
  { tool_name: "Descript", category: "Video", monthly_cost: 24, in_days: 4, status: "trial" },
  { tool_name: "Jasper", category: "AI tools", monthly_cost: 49, in_days: 13, status: "trial" },
];

export function sampleRows(today: string, stackId: string, userId: string) {
  return TOOLS.map((t) => {
    const trial = t.status === "trial";
    return {
      user_id: userId,
      stack_id: stackId,
      tool_name: t.tool_name,
      category: t.category,
      monthly_cost: t.monthly_cost,
      status: trial ? "trial" : "active",
      trial_ends_at: trial ? addDays(today, t.in_days) : null,
      renewal_date: trial ? null : addDays(today, t.in_days),
      last_used_at: addDays(today, -(t.unused_days ?? 2)),
    };
  });
}
