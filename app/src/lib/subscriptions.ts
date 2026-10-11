import type { Subscription } from "@/lib/database.types";

// Must match the CHECK constraints on public.subscriptions.
export const CATEGORIES = [
  "AI tools",
  "Analytics",
  "Automation",
  "Cloud storage",
  "Communication",
  "CRM",
  "Design",
  "Email marketing",
  "Funnels & landing pages",
  "Hosting & domains",
  "Project management",
  "SEO",
  "Social scheduling",
  "Video",
  "Other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const STATUSES = ["trial", "active", "paused", "cancelled"] as const;
export type Status = (typeof STATUSES)[number];

export const STATUS_LABEL: Record<Status, string> = {
  trial: "Free trial",
  active: "Active",
  paused: "Paused",
  cancelled: "Cancelled",
};

/** A tool not opened in this many days is flagged as possibly neglected. */
export const NEGLECT_DAYS = 30;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Today's calendar date (YYYY-MM-DD) in the given IANA time zone. */
export function todayIn(timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
      new Date(),
    );
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/** Whole days from `from` to `to`, both YYYY-MM-DD. Positive when `to` is later. */
export function daysBetween(from: string, to: string): number {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

/** Adds whole days to a YYYY-MM-DD date. */
export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Adds months to a YYYY-MM-DD date, clamping to the month's last day (Jan 31 → Feb 28). */
export function addMonths(iso: string, months: number): string {
  const y = +iso.slice(0, 4);
  const m = +iso.slice(5, 7) - 1 + months;
  const day = +iso.slice(8, 10);
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(day, lastDay))).toISOString().slice(0, 10);
}

export function formatDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function relativeDays(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}

export function money(amount: number, opts: { cents?: boolean } = {}): string {
  const cents = opts.cents ?? amount % 1 !== 0;
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  });
}

export type Summary = {
  monthlySpend: number;
  activeCount: number;
  trialsEndingSoon: number;
  openTrials: number;
  renewalsNext30: number;
  renewalsNext30Cost: number;
  savedMonthly: number;
  overlapCategories: { category: string; tools: string[] }[];
  neglected: number;
};

export function summarize(subs: Subscription[], today: string): Summary {
  const active = subs.filter((s) => s.status === "active");
  const trials = subs.filter((s) => s.status === "trial");

  const renewing = active.filter(
    (s) => s.renewal_date && daysBetween(today, s.renewal_date) >= 0 && daysBetween(today, s.renewal_date) <= 30,
  );

  // Active + trial tools that share a category: candidates for doing the same job.
  const byCategory = new Map<string, string[]>();
  for (const s of [...active, ...trials]) {
    if (s.category === "Other") continue;
    byCategory.set(s.category, [...(byCategory.get(s.category) ?? []), s.tool_name]);
  }

  return {
    monthlySpend: active.reduce((sum, s) => sum + Number(s.monthly_cost), 0),
    activeCount: active.length,
    openTrials: trials.length,
    trialsEndingSoon: trials.filter((s) => s.trial_ends_at && daysBetween(today, s.trial_ends_at) <= 7).length,
    renewalsNext30: renewing.length,
    renewalsNext30Cost: renewing.reduce((sum, s) => sum + Number(s.monthly_cost), 0),
    savedMonthly: subs
      .filter((s) => s.trial_outcome === "cancelled")
      .reduce((sum, s) => sum + Number(s.monthly_cost), 0),
    overlapCategories: [...byCategory.entries()]
      .filter(([, tools]) => tools.length > 1)
      .map(([category, tools]) => ({ category, tools })),
    neglected: active.filter((s) => isNeglected(s, today)).length,
  };
}

export function isNeglected(s: Subscription, today: string): boolean {
  if (s.status !== "active") return false;
  const since = s.last_used_at ?? s.created_at.slice(0, 10);
  return daysBetween(since, today) > NEGLECT_DAYS;
}

/** Trials first by end date, then active by renewal date, then the rest. */
export function sortForList(subs: Subscription[]): Subscription[] {
  const rank: Record<string, number> = { trial: 0, active: 1, paused: 2, cancelled: 3 };
  return [...subs].sort((a, b) => {
    const r = (rank[a.status] ?? 9) - (rank[b.status] ?? 9);
    if (r !== 0) return r;
    const da = (a.status === "trial" ? a.trial_ends_at : a.renewal_date) ?? "9999-12-31";
    const db = (b.status === "trial" ? b.trial_ends_at : b.renewal_date) ?? "9999-12-31";
    return da.localeCompare(db) || a.tool_name.localeCompare(b.tool_name);
  });
}
