"use client";

import Image from "next/image";
import Link from "next/link";
import { useActionState, useState } from "react";
import { CATEGORIES, formatDate, money } from "@/lib/subscriptions";
import { alreadyTracked, findSubscriptions, readStatement, type Candidate, type DateOrder, type SkippedRow } from "@/lib/statement";
import { importSubscriptions, type ImportState } from "../actions";

type Row = Candidate & { checked: boolean; tracked: boolean };

const field = "w-full rounded-lg border border-line bg-surface px-2.5 py-2 text-sm outline-none focus:border-accent";

/** A made-up card statement so people can see how import works before using their own file. */
const SAMPLE = [
  "Transaction Date,Description,Amount",
  "08/14/2026,SEMRUSH,139.95",
  "09/14/2026,SEMRUSH,139.95",
  "10/14/2026,SEMRUSH,139.95",
  "08/22/2026,ADOBE *CREATIVE CLD 800-833-6687 CA,59.99",
  "09/22/2026,ADOBE *CREATIVE CLD 800-833-6687 CA,59.99",
  "10/22/2026,ADOBE *CREATIVE CLD 800-833-6687 CA,59.99",
  "09/03/2026,OPENAI *CHATGPT SUBSCR,20.00",
  "10/03/2026,OPENAI *CHATGPT SUBSCR,20.00",
  "10/09/2026,CORNER COFFEE DENVER CO,4.75",
  "10/18/2026,ZOOM.US 888-799-9666,15.99",
  "10/20/2026,PAYMENT THANK YOU,-500.00",
].join("\n");

export function ImportView({ tracked, today }: { tracked: { tool_name: string; status: string }[]; today: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileText, setFileText] = useState<string | null>(null);
  const [read, setRead] = useState<{ count: number; skipped: SkippedRow[]; credits: number; dateOrder: DateOrder; unclear: boolean } | null>(null);
  const [state, action, pending] = useActionState<ImportState, FormData>(importSubscriptions, {});

  function load(text: string, name: string, dateOrder?: DateOrder) {
    setFileName(name);
    setFileText(text);
    const { charges, error, skipped, credits, dateOrder: order, dateOrderUnclear } = readStatement(text, { dateOrder });
    setRead({ count: charges.length, skipped, credits, dateOrder: order, unclear: dateOrderUnclear || dateOrder !== undefined });
    if (error) {
      setFileError(error);
      setRows(null);
      return;
    }
    setFileError(null);
    setRows(
      findSubscriptions(charges, today).map((c) => {
        const isTracked = alreadyTracked(c.name, tracked);
        return { ...c, tracked: isTracked, checked: !isTracked && c.confidence === "repeating" };
      }),
    );
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5_000_000) {
      setFileError("That file is over 5 MB. Export a shorter date range (3 to 12 months is plenty).");
      return;
    }
    load(await f.text(), f.name);
  }

  function update(i: number, patch: Partial<Row>) {
    setRows((rs) => (rs ? rs.map((r, j) => (j === i ? { ...r, ...patch } : r)) : rs));
  }

  const picked = (rows ?? []).filter((r) => r.checked && !r.tracked);
  const payload = JSON.stringify(
    picked.map((r) => ({ name: r.name, category: r.category, billing_cycle: r.billing_cycle, amount: r.amount, next_renewal: r.next_renewal })),
  );
  const monthly = picked.reduce((s, r) => s + (r.billing_cycle === "yearly" ? r.amount / 12 : r.amount), 0);

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/app" className="flex items-center gap-2.5">
            <Image src="/emblem.png" alt="" width={32} height={32} priority />
            <span className="font-display text-lg font-extrabold tracking-tight">Subastian</span>
          </Link>
          <Link href="/app" className="rounded-lg px-2 py-1.5 text-sm font-medium text-ink-soft hover:text-ink">
            &larr; Dashboard
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
        <h1 className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">Import from a statement</h1>
        <p className="mt-1 max-w-2xl text-ink-soft">
          Download a CSV of your card or bank transactions (3 to 12 months works best) and drop it here. Subastian finds the
          charges that repeat and lists them for you to check.
        </p>
        <p className="mt-3 max-w-2xl rounded-lg bg-band px-3 py-2 text-sm text-ink-soft">
          <span className="font-semibold text-ink">Private by design:</span> the file is read here in your browser and never
          uploaded. Only the subscriptions you tick are saved. No bank login.
        </p>

        {state.added !== undefined ? (
          <section className="mt-8 rounded-2xl border border-line bg-surface p-6" role="status">
            <h2 className="font-display text-xl font-bold">
              Added {state.added} {state.added === 1 ? "subscription" : "subscriptions"}
            </h2>
            {state.skipped ? <p className="mt-1 text-sm text-ink-soft">{state.skipped} were already in your list, so we skipped them.</p> : null}
            <p className="mt-1 text-sm text-ink-soft">Renewal dates are set from your last charge and move forward on their own.</p>
            <Link href="/app" className="mt-4 inline-block rounded-lg bg-accent-fill px-4 py-2.5 font-semibold text-white hover:opacity-90">
              Go to your dashboard
            </Link>
          </section>
        ) : (
          <>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <label className="cursor-pointer rounded-lg bg-accent-fill px-4 py-2.5 font-semibold text-white hover:opacity-90">
                Choose a CSV file
                <input type="file" accept=".csv,text/csv,.txt" onChange={onFile} className="sr-only" />
              </label>
              <button
                type="button"
                onClick={() => load(SAMPLE, "sample statement (made up)")}
                className="rounded-lg border border-line px-4 py-2.5 font-medium text-ink-soft hover:border-accent hover:text-accent"
              >
                Try a sample statement
              </button>
              {fileName && <span className="text-sm text-ink-faint">Reading: {fileName}</span>}
            </div>

            {fileError && <p role="alert" className="mt-4 rounded-lg bg-danger-tint px-3 py-2 text-sm text-danger">{fileError}</p>}

            {read && fileText && read.unclear && (
              <fieldset className="mt-4 rounded-lg border border-line bg-surface px-4 py-3 text-sm">
                <legend className="px-1 font-semibold text-ink">How are the dates written in this file?</legend>
                <p className="text-ink-soft">A date like 03/10/2026 could be March 10 or 3 October. Pick the one your bank uses.</p>
                <div className="mt-2 flex flex-wrap gap-4">
                  {(["mdy", "dmy"] as const).map((o) => (
                    <label key={o} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="date-order"
                        checked={read.dateOrder === o}
                        onChange={() => load(fileText, fileName ?? "", o)}
                        className="accent-[var(--accent-fill)]"
                      />
                      {o === "mdy" ? "Month first (US): 03/10 = March 10" : "Day first (UK, EU and most others): 03/10 = 3 October"}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            {read && (read.count > 0 || read.skipped.length > 0) && (
              <div className="mt-4 text-sm text-ink-soft" role="status">
                <p>
                  Read {read.count} {read.count === 1 ? "charge" : "charges"}
                  {read.credits ? `; left out ${read.credits} refunds, payments or deposits` : ""}
                  {read.skipped.length ? `; skipped ${read.skipped.length} ${read.skipped.length === 1 ? "row" : "rows"} we couldn't read.` : "."}
                </p>
                {read.skipped.length > 0 && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-accent">See the skipped rows</summary>
                    <ul className="mt-2 space-y-1 rounded-lg bg-band px-3 py-2">
                      {read.skipped.slice(0, 50).map((k) => (
                        <li key={k.row}>
                          <span className="font-semibold text-ink">Row {k.row}:</span> {k.reason}
                          <span className="block truncate text-xs text-ink-faint" title={k.text}>{k.text}</span>
                        </li>
                      ))}
                      {read.skipped.length > 50 && <li>…and {read.skipped.length - 50} more.</li>}
                    </ul>
                  </details>
                )}
              </div>
            )}

            {rows && rows.length === 0 && (
              <p className="mt-6 rounded-2xl border border-dashed border-line bg-surface p-6 text-ink-soft">
                No repeating charges found. Try a longer date range: a subscription needs to show up at least twice, about a
                month (or a year) apart.
              </p>
            )}

            {rows && rows.length > 0 && (
              <form action={action} className="mt-6">
                <input type="hidden" name="rows" value={payload} />
                <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
                  {rows.map((r, i) => (
                    <li key={r.key} className={`grid grid-cols-[auto_1fr] items-start gap-3 px-4 py-4 sm:grid-cols-[auto_1fr_10rem_8rem] ${r.tracked ? "opacity-60" : ""}`}>
                      <input
                        type="checkbox"
                        aria-label={`Add ${r.name}`}
                        checked={r.checked && !r.tracked}
                        disabled={r.tracked}
                        onChange={(e) => update(i, { checked: e.target.checked })}
                        className="mt-2.5 size-4 accent-[var(--accent-fill)]"
                      />
                      <div className="min-w-0">
                        <label className="sr-only" htmlFor={`name-${i}`}>Name</label>
                        <input id={`name-${i}`} value={r.name} maxLength={80} onChange={(e) => update(i, { name: e.target.value })} className={`${field} font-semibold`} />
                        <p className="mt-1 text-xs text-ink-faint">
                          {r.tracked
                            ? "Already in your list"
                            : r.confidence === "repeating"
                              ? `Charged ${r.times} times, ${r.billing_cycle}. Last ${formatDate(r.last_charge)}, next about ${formatDate(r.next_renewal)}.`
                              : `Seen once (${formatDate(r.last_charge)}). Tick it if it's a subscription.`}
                          <span className="block truncate" title={r.example}>On the statement: {r.example}</span>
                        </p>
                      </div>
                      <div className="col-start-2 sm:col-start-auto">
                        <label className="sr-only" htmlFor={`cat-${i}`}>Category</label>
                        <select id={`cat-${i}`} value={r.category} onChange={(e) => update(i, { category: e.target.value })} className={field}>
                          {CATEGORIES.map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      </div>
                      <div className="col-start-2 sm:col-start-auto">
                        <label className="sr-only" htmlFor={`amt-${i}`}>Price per charge</label>
                        <div className="relative">
                          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-ink-faint">$</span>
                          <input
                            id={`amt-${i}`}
                            inputMode="decimal"
                            value={String(r.amount)}
                            onChange={(e) => {
                              const n = Number(e.target.value.replace(/[$,\s]/g, ""));
                              if (Number.isFinite(n)) update(i, { amount: n });
                            }}
                            className={`${field} num pl-6`}
                          />
                        </div>
                        <p className="mt-1 text-xs text-ink-faint">{r.billing_cycle === "yearly" ? "per year" : "per month"}</p>
                      </div>
                    </li>
                  ))}
                </ul>

                {state.error && <p role="alert" className="mt-4 rounded-lg bg-danger-tint px-3 py-2 text-sm text-danger">{state.error}</p>}

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-ink-soft">
                    {picked.length} selected · <span className="num font-semibold text-ink">{money(monthly, { cents: true })}/mo</span>
                  </p>
                  <button
                    type="submit"
                    disabled={pending || picked.length === 0}
                    className="rounded-lg bg-accent-fill px-5 py-2.5 font-semibold text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {pending ? "Adding…" : `Add ${picked.length} ${picked.length === 1 ? "subscription" : "subscriptions"}`}
                  </button>
                </div>
              </form>
            )}
          </>
        )}
      </main>
    </div>
  );
}
