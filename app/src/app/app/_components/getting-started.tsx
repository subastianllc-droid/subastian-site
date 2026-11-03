import type { Stack, Subscription } from "@/lib/database.types";
import type { SetupState } from "@/lib/getting-started";
import { loadSampleStack } from "../actions";
import { SubscriptionEditor } from "./subscription-editor";

export const FEEDBACK_HREF =
  "mailto:daniel@subastian.us?subject=" + encodeURIComponent("Subastian beta feedback");

/** First-run checklist. Shown until all three steps are done; see `setupState`. */
export function GettingStarted({
  state,
  subs,
  stacks,
  today,
  email,
}: {
  state: SetupState;
  subs: Subscription[];
  stacks: Stack[];
  today: string;
  email: string;
}) {
  const [tools, dates, alerts] = state.steps;
  const doneCount = state.steps.filter((s) => s.done).length;
  const brandNew = subs.length === 0;

  return (
    <section aria-labelledby="setup-h" className="mb-6 rounded-2xl border border-line bg-surface p-5 sm:p-7">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="setup-h" className="font-display text-xl font-bold">
          {brandNew ? "Welcome to the Subastian beta" : "Finish setting up"}
        </h2>
        <p className="num text-sm text-ink-soft">
          {doneCount} of 3 done
        </p>
      </div>
      <p className="mt-1 max-w-2xl text-sm text-ink-soft">
        Three steps, and Subastian starts watching your subscriptions for you.
      </p>

      <ol className="mt-5 space-y-3">
        <Step n={1} done={tools.done} title="Add the tools you pay for">
          {tools.done ? (
            <p className="text-sm text-ink-soft">
              {state.realCount} {state.realCount === 1 ? "tool" : "tools"} tracked. Add more any time.
            </p>
          ) : (
            <>
              <p className="text-sm text-ink-soft">
                The fastest way is a card or bank statement. Download it as a CSV from your bank, and Subastian
                picks out the charges that repeat. The file stays in your browser and is never uploaded.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <a href="/app/import" className="rounded-lg bg-accent-fill px-4 py-2.5 font-semibold text-white hover:opacity-90">
                  Import a statement
                </a>
                <a
                  href="/app/niche"
                  className="rounded-lg border border-line px-4 py-2.5 font-medium hover:border-accent hover:text-accent"
                >
                  Pick from my niche&apos;s tools
                </a>
                <SubscriptionEditor
                  stacks={stacks}
                  today={today}
                  existing={subs}
                  trigger="Add one by hand"
                  triggerClassName="rounded-lg border border-line px-4 py-2.5 font-medium hover:border-accent hover:text-accent"
                />
              </div>
            </>
          )}
        </Step>

        <Step n={2} done={dates.done} title="Give each tool its next charge date">
          <p className="text-sm text-ink-soft">
            {!tools.done
              ? "Once your tools are in, add when each one renews (or when a free trial ends). Subastian moves the date forward by itself after each charge."
              : dates.done
                ? "Every active tool and trial has a date."
                : `${state.missingDates} ${state.missingDates === 1 ? "tool is" : "tools are"} missing a date. Click Edit on the tool below to add it.`}
          </p>
        </Step>

        <Step n={3} done={alerts.done} title="Get an email before you're charged">
          <p className="text-sm text-ink-soft">
            {alerts.done
              ? `Alerts are on. Subastian emails ${email} 30, 7, 3 and 1 day before a renewal or trial charge.`
              : "Alerts are off. Turn them on in the Alerts box on this page so a charge never surprises you."}
          </p>
        </Step>
      </ol>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-sm">
        <p className="text-ink-soft">
          Something confusing or broken?{" "}
          <a href={FEEDBACK_HREF} className="font-medium text-accent hover:underline">
            Email Daniel, the founder
          </a>
          .
        </p>
        {brandNew && (
          <form action={loadSampleStack}>
            <input type="hidden" name="today" value={today} />
            <button className="font-medium text-ink-soft underline hover:text-accent">
              Just looking? Load a sample stack
            </button>
          </form>
        )}
      </div>
    </section>
  );
}

function Step({ n, done, title, children }: { n: number; done: boolean; title: string; children: React.ReactNode }) {
  return (
    <li className={`flex gap-3 rounded-xl p-3 sm:p-4 ${done ? "bg-band" : "border border-line"}`}>
      <span
        aria-hidden="true"
        className={`num mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
          done ? "bg-money text-surface" : "bg-accent-tint text-accent-strong"
        }`}
      >
        {done ? "✓" : n}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className={`font-semibold ${done ? "text-ink-soft" : ""}`}>
          {title}
          <span className="sr-only">{done ? " (done)" : " (to do)"}</span>
        </h3>
        <div className="mt-1">{children}</div>
      </div>
    </li>
  );
}
