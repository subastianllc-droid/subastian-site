import type { GuardResult, GuardTool } from "@/lib/purchase-guard";
import { daysBetween, formatDate, money, relativeDays } from "@/lib/subscriptions";

/** The Purchase Guard note inside the add form. Plain facts from the user's own list, no guesses. */
export function GuardNotice({
  result,
  newName,
  category,
  today,
}: {
  result: GuardResult;
  newName: string;
  category: string;
  today: string;
}) {
  const { sameTool, sameCategory, trackedBefore, activeMonthlyAtStake } = result;
  const warn = sameTool.length > 0 || sameCategory.length > 0;

  return (
    <section
      role="status"
      aria-live="polite"
      aria-labelledby="guard-h"
      className={`rounded-xl border p-4 ${warn ? "border-warn/50 bg-warn-tint" : "border-line bg-band"}`}
    >
      <h3 id="guard-h" className={`flex items-center gap-2 text-sm font-semibold ${warn ? "text-warn" : "text-ink-soft"}`}>
        <ShieldIcon />
        Purchase Guard
      </h3>

      {sameTool.length > 0 && (
        <p className="mt-2 text-sm text-ink">
          <span className="font-semibold">You already track {sameTool[0].tool_name}</span>
          {" "}({describe(sameTool[0], today)}).
          {sameTool.length > 1 ? ` You have ${sameTool.length} entries for it.` : ""} Adding it again could mean paying twice.
        </p>
      )}

      {sameCategory.length > 0 && (
        <div className="mt-2 text-sm text-ink">
          <p>
            {sameTool.length > 0 ? "Also in " : "You already have "}
            <span className="font-semibold">
              {sameCategory.length} {sameCategory.length === 1 ? "tool" : "tools"} in {category}
            </span>
            {sameTool.length > 0 ? ":" : `. Check that ${newName || "this one"} does something they don't:`}
          </p>
          <ul className="mt-2 space-y-1">
            {sameCategory.map((s) => (
              <li key={s.id} className="flex items-baseline justify-between gap-3 rounded-lg bg-surface/70 px-3 py-1.5">
                <span className="truncate font-medium">{s.tool_name}</span>
                <span className="num shrink-0 text-xs text-ink-soft">{describe(s, today)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {warn && activeMonthlyAtStake > 0 && (
        <p className="mt-2 text-xs text-ink-soft">
          You pay <span className="num font-semibold text-ink">{money(activeMonthlyAtStake)}/mo</span> for the active ones above.
        </p>
      )}

      {trackedBefore.length > 0 && (
        <p className={`text-sm text-ink-soft ${warn ? "mt-2" : "mt-1.5"}`}>
          You tracked {trackedBefore[0].tool_name} before and it&apos;s marked {trackedBefore[0].status}.
        </p>
      )}
    </section>
  );
}

function describe(s: GuardTool, today: string): string {
  if (s.status === "trial") {
    if (!s.trial_ends_at) return "free trial";
    const d = daysBetween(today, s.trial_ends_at);
    return d < 0 ? `trial ended ${formatDate(s.trial_ends_at)}` : `free trial, ends ${relativeDays(d)}`;
  }
  const cost = `${money(Number(s.monthly_cost))}/mo`;
  return s.renewal_date ? `${cost}, renews ${formatDate(s.renewal_date)}` : cost;
}

function ShieldIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M10 2.5 4 4.8v4.6c0 3.7 2.5 6.6 6 8.1 3.5-1.5 6-4.4 6-8.1V4.8L10 2.5Z" strokeLinejoin="round" />
      <path d="m7.4 10 1.8 1.8 3.5-3.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
