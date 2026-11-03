import Image from "next/image";
import Link from "next/link";
import type { Stack, Subscription } from "@/lib/database.types";
import { addDays, formatDate, money } from "@/lib/subscriptions";
import { viewStack, type NicheStack, type NicheTool, type ToolStatus, type TrialPlan } from "@/lib/niche-stacks";
import { NICHE_DATA } from "@/lib/niche-stacks-data";
import { setNiche } from "../actions";
import { SubscriptionEditor } from "../_components/subscription-editor";

type Props = { stack: NicheStack | null; subs: Subscription[]; stacks: Stack[]; today: string };

export function NicheView({ stack, subs, stacks, today }: Props) {
  const view = stack ? viewStack(stack, subs) : null;

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/app" className="flex items-center gap-2.5">
            <Image src="/emblem.png" alt="" width={32} height={32} priority />
            <span className="font-display text-lg font-extrabold tracking-tight">Subastian</span>
          </Link>
          <Link href="/app" className="rounded-lg px-2 py-1.5 text-sm font-medium text-ink-soft hover:text-ink">
            &larr; Dashboard
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <h1 className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">Niche Stacks</h1>
        <p className="mt-1 max-w-2xl text-ink-soft">
          Pick your kind of work. See the tools it usually needs, what each costs, which ones do the same job, and try
          those one at a time instead of paying for two.
        </p>

        <section aria-labelledby="pick-h" className="mt-6">
          <h2 id="pick-h" className="sr-only">Pick your niche</h2>
          <div className="flex flex-wrap gap-2">
            {NICHE_DATA.stacks.map((s) => {
              const on = s.slug === stack?.slug;
              return (
                <form key={s.slug} action={setNiche}>
                  <input type="hidden" name="niche" value={s.slug} />
                  <button
                    aria-pressed={on}
                    className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
                      on
                        ? "border-accent-fill bg-accent-fill text-white"
                        : "border-line bg-surface text-ink-soft hover:border-accent hover:text-accent"
                    }`}
                  >
                    {s.niche}
                  </button>
                </form>
              );
            })}
          </div>
        </section>

        {!view ? (
          <p className="mt-8 rounded-2xl border border-dashed border-line bg-surface p-6 text-ink-soft">
            Choose the niche closest to your work to see its stack. You can switch anytime.
          </p>
        ) : (
          <>
            <p className="mt-6 max-w-3xl text-ink-soft">{view.stack.intro}</p>

            <section aria-label="Summary" className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Tile label="Jobs covered" value={`${view.covered} of ${view.jobs}`} sub="Tools you have or are trying" />
              <Tile label="Lean stack" value={`${money(view.leanMonthly, { cents: true })}/mo`} sub={view.stack.lean_note} />
              <Tile
                label="You pay now"
                value={`${money(view.yourMonthly, { cents: view.yourMonthly % 1 !== 0 })}/mo`}
                sub="For the tools on this list you track as active"
              />
            </section>

            {view.groups.length > 0 && (
              <section aria-labelledby="groups-h" className="mt-10">
                <h2 id="groups-h" className="font-display text-xl font-bold">Same job, try one at a time</h2>
                <p className="mt-1 text-sm text-ink-soft">
                  These tools do the same job. Try one, decide, then try the next only if you need to. Keep one.
                </p>
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  {view.groups.map((g) => (
                    <div key={g.id} className="rounded-2xl border border-line bg-surface p-5">
                      <p className="text-sm font-medium text-ink-faint">{g.tools[0].tool.job}</p>
                      <PlanLine plan={g.plan} />
                      <ul className="mt-4 divide-y divide-line">
                        {g.tools.map((t) => (
                          <ToolRow
                            key={t.tool.name}
                            status={t}
                            subs={subs}
                            stacks={stacks}
                            today={today}
                            compact
                            // One at a time: only the tool that's next in line gets a button.
                            canAdd={g.plan.kind === "next" && g.plan.tool.name === t.tool.name}
                          />
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section aria-labelledby="rest-h" className="mt-10">
              <h2 id="rest-h" className="font-display text-xl font-bold">
                {view.groups.length ? "The rest of the stack" : "The stack"}
              </h2>
              <ul className="mt-4 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
                {view.singles.map((t) => (
                  <ToolRow key={t.tool.name} status={t} subs={subs} stacks={stacks} today={today} />
                ))}
              </ul>
            </section>

            <section aria-labelledby="cuts-h" className="mt-10 rounded-2xl border border-line bg-band p-5">
              <h2 id="cuts-h" className="font-display text-lg font-bold">Where this stack usually overspends</h2>
              <ul className="mt-3 space-y-3">
                {view.stack.cuts.map((c) => (
                  <li key={c.title}>
                    <p className="font-semibold">{c.title}</p>
                    <p className="text-sm text-ink-soft">{c.body}</p>
                  </li>
                ))}
              </ul>
            </section>

            <p className="mt-8 text-sm text-ink-faint">
              Prices checked {NICHE_DATA.checked_long} on each vendor&apos;s own page (tap a price to see it). Plans and
              prices change, so check before you buy. No affiliate links, and Subastian isn&apos;t paid by any tool listed.
            </p>
          </>
        )}
      </main>
    </div>
  );
}

function PlanLine({ plan }: { plan: TrialPlan }) {
  let text: string;
  if (plan.kind === "kept") {
    text = `You have ${plan.tool.name}. No need to pay for ${plan.others.map((o) => o.name).join(" or ")} too.`;
  } else if (plan.kind === "trying") {
    const ends = plan.endsAt ? ` Trial ends ${formatDate(plan.endsAt)}.` : "";
    const next = plan.next ? ` Not keeping it? ${plan.next.name} is next.` : "";
    text = `Trying ${plan.tool.name} now.${ends} Decide before it charges.${next}`;
  } else if (plan.kind === "next") {
    const tried = plan.tried.length ? `You've tried ${plan.tried.map((t) => t.name).join(", ")}. ` : "";
    text = plan.tool.trial_days
      ? `${tried}Next: start the ${plan.tool.trial_days}-day free trial of ${plan.tool.name} on its site, then track it here.`
      : `${tried}Next: ${plan.tool.name}. It has no free trial, so check its free plan or refund terms first.`;
  } else {
    text = "You've tried every tool for this job. Pick the one that worked best, or skip the job.";
  }
  return <p className="mt-1 font-semibold">{text}</p>;
}

const BADGE: Record<ToolStatus["state"], { label: string; cls: string }> = {
  have: { label: "You have it", cls: "bg-accent-tint text-accent-strong" },
  trying: { label: "On a trial", cls: "bg-warn-tint text-warn" },
  dropped: { label: "Cancelled before", cls: "bg-band text-ink-soft" },
  none: { label: "Not in your list", cls: "bg-band text-ink-faint" },
};

function ToolRow({
  status,
  subs,
  stacks,
  today,
  compact,
  canAdd = true,
}: {
  status: ToolStatus;
  subs: Subscription[];
  stacks: Stack[];
  today: string;
  compact?: boolean;
  canAdd?: boolean;
}) {
  const t = status.tool;
  const badge = BADGE[status.state];
  return (
    <li className={`flex flex-wrap items-start justify-between gap-3 ${compact ? "py-3" : "px-4 py-4"}`}>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">
          {t.name} <span className={`ml-1 rounded-full px-2 py-0.5 align-middle text-xs font-semibold ${badge.cls}`}>{badge.label}</span>
        </p>
        {!compact && <p className="text-sm text-ink-soft">{t.job}</p>}
        <p className="text-sm text-ink-soft">
          <a href={t.src} target="_blank" rel="noopener noreferrer nofollow" className="underline decoration-line underline-offset-2 hover:text-accent">
            {t.price_text}
          </a>
          {t.unit ? ` (${t.unit})` : ""} · {t.free_text}
        </p>
      </div>
      {status.state === "none" && canAdd && <AddButton tool={t} subs={subs} stacks={stacks} today={today} />}
    </li>
  );
}

function AddButton({ tool, subs, stacks, today }: { tool: NicheTool; subs: Subscription[]; stacks: Stack[]; today: string }) {
  const trial = tool.trial_days > 0;
  return (
    <SubscriptionEditor
      stacks={stacks}
      today={today}
      existing={subs}
      preset={{
        tool_name: tool.name,
        category: tool.category,
        monthly_cost: tool.monthly_cost,
        trial_ends_at: trial ? addDays(today, tool.trial_days) : null,
      }}
      trigger={trial ? `Track ${tool.trial_days}-day trial` : "Add"}
      triggerLabel={trial ? `Track a ${tool.trial_days}-day free trial of ${tool.name}` : `Add ${tool.name}`}
      triggerClassName={
        trial
          ? "shrink-0 rounded-lg bg-accent-fill px-3.5 py-2 text-sm font-semibold text-white hover:opacity-90"
          : "shrink-0 rounded-lg border border-line px-3.5 py-2 text-sm font-medium text-ink-soft hover:border-accent hover:text-accent"
      }
    />
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">{label}</p>
      <p className="num mt-1.5 text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-ink-soft">{sub}</p>
    </div>
  );
}
