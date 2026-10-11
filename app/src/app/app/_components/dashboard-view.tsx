import Image from "next/image";
import type { Stack, Subscription } from "@/lib/database.types";
import {
  NEGLECT_DAYS,
  STATUS_LABEL,
  daysBetween,
  formatDate,
  isNeglected,
  money,
  relativeDays,
  sortForList,
  summarize,
  type Status,
} from "@/lib/subscriptions";
import { signOut } from "../../login/actions";
import { SAMPLE_STACK_NAME } from "@/lib/sample-stack";
import {
  decideTrial,
  deleteStack,
  deleteSubscription,
  loadSampleStack,
  markRenewed,
  markUsedToday,
  removeSampleStack,
} from "../actions";
import { ConfirmButton } from "./confirm-button";
import { StackForm } from "./stack-form";
import { SubscriptionEditor } from "./subscription-editor";
import { TzSync } from "./tz-sync";

const PLAN_LABEL: Record<string, string> = { starter: "Starter", pro: "Pro", maestro: "Agency Maestro" };

export function DashboardView({
  email,
  planTier,
  subs,
  stacks,
  today,
  tzCookie,
  loadError,
}: {
  email: string;
  planTier: string | null;
  subs: Subscription[];
  stacks: Stack[];
  today: string;
  tzCookie: string | null;
  loadError: boolean;
}) {
  const summary = summarize(subs, today);
  const trials = sortForList(subs.filter((s) => s.status === "trial"));
  const others = sortForList(subs.filter((s) => s.status !== "trial"));
  const stackName = new Map(stacks.map((s) => [s.id, s.name]));
  const sampleStack = stacks.find((s) => s.name === SAMPLE_STACK_NAME);

  return (
    <div className="flex flex-1 flex-col">
      <TzSync current={tzCookie} />

      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <Image src="/emblem.png" alt="" width={32} height={32} priority />
            <span className="font-display text-lg font-extrabold tracking-tight">Subastian</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-ink-soft sm:inline" title={email}>{email}</span>
            {planTier && (
              <span className="rounded-full bg-accent-tint px-2.5 py-0.5 text-xs font-semibold text-accent-strong">
                {PLAN_LABEL[planTier] ?? planTier}
              </span>
            )}
            <form action={signOut}>
              <button className="rounded-lg px-2 py-1.5 font-medium text-ink-soft hover:text-ink">Sign out</button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">Your subscriptions</h1>
            <p className="mt-1 text-sm text-ink-soft">Every tool you pay for or are trying, in one place.</p>
          </div>
          <div className="flex items-center gap-2">
            {subs.length > 0 && (
              <a
                href="/app/export"
                download
                className="rounded-lg border border-line bg-surface px-4 py-2.5 font-medium text-ink-soft hover:border-accent hover:text-accent"
              >
                Export CSV
              </a>
            )}
            <SubscriptionEditor
              stacks={stacks}
              today={today}
              trigger="+ Add subscription"
              triggerClassName="rounded-lg bg-accent-fill px-4 py-2.5 font-semibold text-white hover:opacity-90"
            />
          </div>
        </div>

        {sampleStack && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent/40 bg-accent-tint px-4 py-3">
            <p className="text-sm text-accent-strong">
              <span className="font-semibold">You&apos;re looking at sample data.</span> The tools in &ldquo;{SAMPLE_STACK_NAME}&rdquo; use
              rough sample budgets, not vendor quotes.
            </p>
            <form action={removeSampleStack}>
              <ConfirmButton
                message="Remove all sample tools? Anything you added yourself stays."
                className="rounded-lg bg-surface px-3 py-1.5 text-sm font-semibold text-accent-strong hover:opacity-90"
              >
                Remove sample
              </ConfirmButton>
            </form>
          </div>
        )}

        {subs.length === 0 && !loadError && (
          <section aria-labelledby="start-h" className="mb-6 rounded-2xl border border-line bg-surface p-6 sm:p-8">
            <h2 id="start-h" className="font-display text-xl font-bold">Start with your own tools, or explore a sample</h2>
            <p className="mt-2 max-w-2xl text-sm text-ink-soft">
              Add the subscriptions you pay for to see your real spend. Want to see how Subastian works first? Load a sample
              stack for a small agency, with trials, overlapping tools and a couple of tools nobody&apos;s opened in weeks.
              It&apos;s labeled as a sample and removes in one click.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <SubscriptionEditor
                stacks={stacks}
                today={today}
                trigger="Add my first subscription"
                triggerClassName="rounded-lg bg-accent-fill px-4 py-2.5 font-semibold text-white hover:opacity-90"
              />
              <form action={loadSampleStack}>
                <input type="hidden" name="today" value={today} />
                <button className="rounded-lg border border-line px-4 py-2.5 font-medium hover:border-accent hover:text-accent">
                  Load sample agency stack
                </button>
              </form>
            </div>
          </section>
        )}

        {loadError && (
          <p role="alert" className="mb-6 rounded-lg bg-danger-tint px-4 py-3 text-sm text-danger">
            We couldn&apos;t load your subscriptions. Refresh to try again.
          </p>
        )}

        <section aria-label="Summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile label="Monthly spend" value={money(summary.monthlySpend)} sub={`${summary.activeCount} active · ${money(summary.monthlySpend * 12)}/yr`} />
          <Tile
            label="Free trials"
            value={String(summary.openTrials)}
            sub={summary.trialsEndingSoon ? `${summary.trialsEndingSoon} ending within 7 days` : "None ending this week"}
            tone={summary.trialsEndingSoon ? "warn" : undefined}
          />
          <Tile
            label="Renewing in 30 days"
            value={money(summary.renewalsNext30Cost)}
            sub={`${summary.renewalsNext30} renewal${summary.renewalsNext30 === 1 ? "" : "s"}`}
          />
          <Tile
            label="Not paying for"
            value={`${money(summary.savedMonthly)}/mo`}
            sub="Trials you cancelled before being charged"
            tone="money"
          />
        </section>

        {summary.overlapCategories.length > 0 && (
          <section aria-labelledby="overlap-h" className="mt-6 rounded-2xl border border-line bg-band p-4">
            <h2 id="overlap-h" className="text-sm font-semibold">Possible overlap</h2>
            <p className="mt-0.5 text-sm text-ink-soft">These tools are in the same category. Check whether you need all of them.</p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {summary.overlapCategories.map((o) => (
                <li key={o.category} className="rounded-lg bg-surface px-3 py-1.5 text-sm">
                  <span className="font-medium">{o.category}:</span> {o.tools.join(", ")}
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_280px]">
          <div className="min-w-0 space-y-8">
            {/* Free-trial tracker */}
            <section aria-labelledby="trials-h">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 id="trials-h" className="font-display text-lg font-bold">Free trials</h2>
                <SubscriptionEditor
                  stacks={stacks}
                  today={today}
                  startAsTrial
                  trigger="+ Track a trial"
                  triggerClassName="text-sm font-medium text-accent hover:underline"
                />
              </div>

              {trials.length === 0 ? (
                <Empty>
                  Starting a free trial? Track it here and you&apos;ll see exactly how many days you have left
                  before you&apos;re charged.
                </Empty>
              ) : (
                <ul className="space-y-3">
                  {trials.map((t) => (
                    <TrialCard key={t.id} sub={t} today={today} stacks={stacks} stackName={stackName.get(t.stack_id ?? "")} />
                  ))}
                </ul>
              )}
            </section>

            {/* All other subscriptions */}
            <section aria-labelledby="subs-h">
              <h2 id="subs-h" className="mb-3 font-display text-lg font-bold">Subscriptions</h2>
              {others.length === 0 ? (
                <Empty>
                  Add the tools you pay for each month. Subastian totals your spend, shows what renews next, and
                  flags tools you haven&apos;t opened in a while.
                </Empty>
              ) : (
                <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
                  {others.map((s) => (
                    <SubscriptionRow key={s.id} sub={s} today={today} stacks={stacks} stackName={stackName.get(s.stack_id ?? "")} />
                  ))}
                </ul>
              )}
            </section>
          </div>

          <aside aria-labelledby="stacks-h" className="h-fit rounded-2xl border border-line bg-surface p-5">
            <h2 id="stacks-h" className="font-display text-lg font-bold">Stacks</h2>
            <p className="mt-1 text-sm text-ink-soft">Group tools by client, project or workflow.</p>
            {stacks.length > 0 && (
              <ul className="mt-4 space-y-2">
                {stacks.map((st) => {
                  const inStack = subs.filter((s) => s.stack_id === st.id && s.status === "active");
                  const cost = inStack.reduce((sum, s) => sum + s.monthly_cost, 0);
                  return (
                    <li key={st.id} className="flex items-center justify-between gap-2 rounded-lg bg-band px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{st.name}</p>
                        <p className="num text-xs text-ink-soft">
                          {inStack.length} active · {money(cost)}/mo
                        </p>
                      </div>
                      {st.id !== sampleStack?.id && (
                      <form action={deleteStack}>
                        <input type="hidden" name="id" value={st.id} />
                        <ConfirmButton
                          message={`Delete the "${st.name}" stack? Its tools stay tracked, just ungrouped.`}
                          label={`Delete stack ${st.name}`}
                          className="rounded-md px-1.5 py-1 text-ink-faint hover:text-danger"
                        >
                          ✕
                        </ConfirmButton>
                      </form>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            <StackForm />
          </aside>
        </div>
      </main>
    </div>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: "warn" | "money" }) {
  const valueColor = tone === "money" ? "text-money" : tone === "warn" ? "text-warn" : "text-ink";
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">{label}</p>
      <p className={`num mt-1.5 text-2xl font-semibold ${valueColor}`}>{value}</p>
      <p className="mt-1 text-xs text-ink-soft">{sub}</p>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-2xl border border-dashed border-line px-5 py-8 text-center text-sm text-ink-soft">{children}</p>
  );
}

function TrialCard({ sub, today, stacks, stackName }: { sub: Subscription; today: string; stacks: Stack[]; stackName?: string }) {
  const days = sub.trial_ends_at ? daysBetween(today, sub.trial_ends_at) : null;
  const urgent = days !== null && days <= 3;
  const ended = days !== null && days < 0;
  const badge =
    days === null
      ? "No end date"
      : ended
        ? `Ended ${relativeDays(days)}`
        : days === 0
          ? "Ends today"
          : `${days} day${days === 1 ? "" : "s"} left`;

  return (
    <li
      className={`rounded-2xl border bg-surface p-4 ${urgent ? "border-warn/60" : "border-line"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">{sub.tool_name}</p>
          <p className="mt-0.5 text-sm text-ink-soft">
            {sub.category}
            {stackName ? ` · ${stackName}` : ""}
            {sub.trial_ends_at ? ` · ends ${formatDate(sub.trial_ends_at)}` : ""}
          </p>
          <p className="mt-1 text-sm">
            Then <span className="num font-semibold">{money(sub.monthly_cost)}</span>/mo if you keep it
          </p>
        </div>
        <span
          className={`num shrink-0 rounded-full px-3 py-1 text-sm font-semibold ${
            urgent ? "bg-warn-tint text-warn" : "bg-accent-tint text-accent-strong"
          }`}
        >
          {badge}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <form action={decideTrial}>
          <input type="hidden" name="id" value={sub.id} />
          <input type="hidden" name="decision" value="kept" />
          <button className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium hover:border-accent hover:text-accent">
            Keep it
          </button>
        </form>
        <form action={decideTrial}>
          <input type="hidden" name="id" value={sub.id} />
          <input type="hidden" name="decision" value="cancelled" />
          <button className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium hover:border-money hover:text-money">
            I cancelled it
          </button>
        </form>
        <SubscriptionEditor
          stacks={stacks}
          today={today}
          sub={sub}
          trigger="Edit"
          triggerLabel={`Edit ${sub.tool_name}`}
          triggerClassName="rounded-lg px-3 py-1.5 text-sm font-medium text-ink-soft hover:text-ink"
        />
        <form action={deleteSubscription} className="ml-auto">
          <input type="hidden" name="id" value={sub.id} />
          <ConfirmButton
            message={`Remove ${sub.tool_name}? This can't be undone.`}
            className="rounded-lg px-3 py-1.5 text-sm text-ink-faint hover:text-danger"
          >
            Remove
          </ConfirmButton>
        </form>
      </div>
    </li>
  );
}

function SubscriptionRow({ sub, today, stacks, stackName }: { sub: Subscription; today: string; stacks: Stack[]; stackName?: string }) {
  const status = sub.status as Status;
  const inactive = status === "paused" || status === "cancelled";
  const neglected = isNeglected(sub, today);
  const renewIn = sub.renewal_date ? daysBetween(today, sub.renewal_date) : null;

  return (
    <li className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 ${inactive ? "opacity-60" : ""}`}>
      <div className="min-w-0 flex-1 basis-48">
        <p className="flex flex-wrap items-center gap-2 font-medium">
          {sub.tool_name}
          {status !== "active" && (
            <span className="rounded-full bg-band px-2 py-0.5 text-xs font-medium text-ink-soft">{STATUS_LABEL[status]}</span>
          )}
          {sub.trial_outcome === "cancelled" && (
            <span className="rounded-full bg-band px-2 py-0.5 text-xs font-medium text-money">Cancelled in trial</span>
          )}
          {neglected && (
            <span className="rounded-full bg-warn-tint px-2 py-0.5 text-xs font-medium text-warn">
              Unused {NEGLECT_DAYS}+ days
            </span>
          )}
        </p>
        <p className="mt-0.5 text-sm text-ink-soft">
          {sub.category}
          {stackName ? ` · ${stackName}` : ""}
          {!inactive && sub.renewal_date && renewIn !== null
            ? renewIn < 0
              ? ` · renewal date ${formatDate(sub.renewal_date)} has passed`
              : ` · renews ${formatDate(sub.renewal_date)}${renewIn <= 14 ? ` (${relativeDays(renewIn)})` : ""}`
            : ""}
        </p>
      </div>

      <p className="num w-24 text-right font-semibold">
        {money(sub.monthly_cost)}
        <span className="text-xs font-normal text-ink-faint">/mo</span>
      </p>

      <div className="flex items-center gap-1">
        {status === "active" && renewIn !== null && renewIn <= 3 && (
          <form action={markRenewed}>
            <input type="hidden" name="id" value={sub.id} />
            <ConfirmButton
              message={`Move ${sub.tool_name}'s renewal date forward one month? This only updates your tracker. It doesn't check or change anything with the vendor.`}
              className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-accent hover:underline"
            >
              Mark renewed
            </ConfirmButton>
          </form>
        )}
        {status === "active" && (
          <form action={markUsedToday}>
            <input type="hidden" name="id" value={sub.id} />
            <input type="hidden" name="today" value={today} />
            <button
              className="rounded-lg px-2.5 py-1.5 text-sm text-ink-soft hover:text-accent"
              title="Mark as used today"
            >
              Used today
            </button>
          </form>
        )}
        <SubscriptionEditor
          stacks={stacks}
          today={today}
          sub={sub}
          trigger="Edit"
          triggerLabel={`Edit ${sub.tool_name}`}
          triggerClassName="rounded-lg px-2.5 py-1.5 text-sm font-medium text-ink-soft hover:text-ink"
        />
        <form action={deleteSubscription}>
          <input type="hidden" name="id" value={sub.id} />
          <ConfirmButton
            message={`Remove ${sub.tool_name}? This can't be undone.`}
            label={`Remove ${sub.tool_name}`}
            className="rounded-lg px-2.5 py-1.5 text-sm text-ink-faint hover:text-danger"
          >
            Remove
          </ConfirmButton>
        </form>
      </div>
    </li>
  );
}
