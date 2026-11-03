/**
 * First-run checklist for the dashboard. Every step is worked out from the user's own rows, so
 * nothing extra is stored: the card disappears by itself once all three are done.
 * Sample-stack rows never count, so loading the sample doesn't tick anything off.
 */
type Row = {
  status: string;
  stack_id: string | null;
  renewal_date: string | null;
  trial_ends_at: string | null;
};

export type SetupStep = { id: "tools" | "dates" | "alerts"; done: boolean };

export type SetupState = {
  steps: SetupStep[];
  /** Real (non-sample) rows tracked. */
  realCount: number;
  /** Active rows with no renewal date plus trials with no end date. */
  missingDates: number;
  allDone: boolean;
};

export function setupState(subs: Row[], sampleStackId: string | null, alertsEnabled: boolean): SetupState {
  const real = subs.filter((s) => !sampleStackId || s.stack_id !== sampleStackId);
  const missingDates = real.filter(
    (s) => (s.status === "active" && !s.renewal_date) || (s.status === "trial" && !s.trial_ends_at),
  ).length;

  const steps: SetupStep[] = [
    { id: "tools", done: real.length > 0 },
    { id: "dates", done: real.length > 0 && missingDates === 0 },
    { id: "alerts", done: alertsEnabled },
  ];
  return { steps, realCount: real.length, missingDates, allDone: steps.every((s) => s.done) };
}
