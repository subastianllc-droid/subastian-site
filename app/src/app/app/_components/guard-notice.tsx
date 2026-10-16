import { guardLevel, type GuardResult, type GuardTool } from "@/lib/purchase-guard";
import { daysBetween, formatDate, money, relativeDays } from "@/lib/subscriptions";

/** The Purchase Guard panel inside the add form. Plain facts from the user's own list, no guesses. */
export function GuardNotice({
  result,
  newName,
  category,
  today,
  editing = false,
}: {
  result: GuardResult;
  newName: string;
  category: string;
  today: string;
  /** Editing an existing row: the warning is about the change, not a new purchase. */
  editing?: boolean;
}) {
  const { sameTool, similarName, sameCategory, cancelledBefore, resumable, activeMonthlyAtStake } = result;
  const level = guardLevel(result);
  if (level === "none") return null;

  const tone =
    level === "stop"
      ? "border-danger/60 bg-danger-tint"
      : level === "check"
        ? "border-warn/60 bg-warn-tint"
        : "border-line bg-band";
  const titleTone = level === "stop" ? "text-danger" : level === "check" ? "text-warn" : "text-ink-soft";
  const title =
    level === "stop"
      ? "Purchase Guard: you may already have this"
      : level === "check"
        ? "Purchase Guard: check for overlap"
        : "Purchase Guard: you cancelled this before";
  const name = newName || "this tool";

  return (
    <section role="alert" aria-labelledby="guard-h" className={`rounded-xl border-2 p-4 ${tone}`}>
      <h3 id="guard-h" className={`flex items-center gap-2 font-semibold ${titleTone}`}>
        <ShieldIcon />
        {title}
      </h3>

      {sameTool.length > 0 && (
        <p className="mt-2 text-sm text-ink">
          <span className="font-semibold">
            You already track {sameTool[0].tool_name}
          </span>{" "}
          ({describe(sameTool[0], today)}).
          {sameTool.length > 1 ? ` You have ${sameTool.length} entries for it.` : ""}{" "}
          {resumable
            ? "It's marked paused, so you may still have that account. Resuming it avoids paying for a second one."
            : editing
              ? "Keeping both could mean paying twice."
              : "Adding it again could mean paying twice."}
        </p>
      )}

      {similarName.length > 0 && (
        <div className="mt-2 text-sm text-ink">
          <p>
            <span className="font-semibold">{name}</span> looks like {similarName.length === 1 ? "a tool" : "tools"} you
            already track:
          </p>
          <ToolList tools={similarName} today={today} />
        </div>
      )}

      {sameCategory.length > 0 && (
        <div className="mt-2 text-sm text-ink">
          <p>
            {level === "stop" ? "Also in " : "You already have "}
            <span className="font-semibold">
              {sameCategory.length} {sameCategory.length === 1 ? "tool" : "tools"} in {category}
            </span>
            {level === "stop" ? ":" : `. Make sure ${name} does something they don't:`}
          </p>
          <ToolList tools={sameCategory} today={today} />
        </div>
      )}

      {activeMonthlyAtStake > 0 && (
        <p className="mt-2 text-xs text-ink-soft">
          You already pay <span className="num font-semibold text-ink">{money(activeMonthlyAtStake)}/mo</span> for
          the active ones above.
        </p>
      )}

      {cancelledBefore.length > 0 && (
        <p className="mt-2 text-sm text-ink-soft">
          You cancelled {cancelledBefore[0].tool_name} before. Worth remembering why before you sign up again.
        </p>
      )}

      {resumable && (
        <p className="mt-2 text-xs text-ink-soft">
          &ldquo;Resume&rdquo; only updates your Subastian list. Turn it back on in your {resumable.tool_name} account too.
        </p>
      )}
    </section>
  );
}

function ToolList({ tools, today }: { tools: GuardTool[]; today: string }) {
  return (
    <ul className="mt-2 space-y-1">
      {tools.map((s) => (
        <li key={s.id} className="flex items-baseline justify-between gap-3 rounded-lg bg-surface/70 px-3 py-1.5">
          <span className="truncate font-medium">{s.tool_name}</span>
          <span className="num shrink-0 text-xs text-ink-soft">{describe(s, today)}</span>
        </li>
      ))}
    </ul>
  );
}

function describe(s: GuardTool, today: string): string {
  if (s.status === "trial") {
    if (!s.trial_ends_at) return "free trial";
    const d = daysBetween(today, s.trial_ends_at);
    return d < 0 ? `trial ended ${formatDate(s.trial_ends_at)}` : `free trial, ends ${relativeDays(d)}`;
  }
  const cost = `${money(Number(s.monthly_cost))}/mo`;
  if (s.status === "paused") return `paused, ${cost}`;
  if (s.status === "cancelled") return "cancelled";
  return s.renewal_date ? `${cost}, renews ${formatDate(s.renewal_date)}` : cost;
}

function ShieldIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M10 2.5 4 4.8v4.6c0 3.7 2.5 6.6 6 8.1 3.5-1.5 6-4.4 6-8.1V4.8L10 2.5Z" strokeLinejoin="round" />
      <path d="m7.4 10 1.8 1.8 3.5-3.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
