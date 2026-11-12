/** Plans as shown in the app. Prices match subastian.us and the Terms; Stripe charges the real amount. */
export const PLAN_OPTIONS = [
  { id: "starter", name: "Starter", price: 49 },
  { id: "pro", name: "Conductor Pro", price: 99 },
  { id: "maestro", name: "Agency Maestro", price: 299 },
] as const;

export type PlanId = (typeof PLAN_OPTIONS)[number]["id"];

export const PLAN_LABEL: Record<string, string> = Object.fromEntries(PLAN_OPTIONS.map((p) => [p.id, p.name]));

export function isPlanId(v: unknown): v is PlanId {
  return PLAN_OPTIONS.some((p) => p.id === v);
}

/** Same rule as supabase/functions/billing/logic.ts: past_due keeps access while Stripe retries. */
export function hasAccess(status: string | null | undefined): boolean {
  return status === "trialing" || status === "active" || status === "past_due";
}

export const STATUS_TEXT: Record<string, string> = {
  trialing: "Free trial",
  active: "Active",
  past_due: "Payment failed, Stripe is retrying",
  unpaid: "Unpaid",
  canceled: "Cancelled",
  incomplete: "Checkout not finished",
  incomplete_expired: "Checkout expired",
  paused: "Paused",
};

export const BILLING_ERRORS: Record<string, string> = {
  closed: "Plans open at launch. Nothing has been charged.",
  plan: "Pick a plan.",
  active: "You already have a plan. Use Manage billing to change it.",
  none: "There's no billing account yet. Start a plan first.",
  failed: "Billing is unavailable right now. Try again in a minute.",
};

/** Billing is off until launch unless BILLING_ENABLED=true (server env). */
export function billingOpen(): boolean {
  return process.env.BILLING_ENABLED === "true";
}
