"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import type { Stack, Subscription } from "@/lib/database.types";
import { CATEGORIES, STATUSES, STATUS_LABEL } from "@/lib/subscriptions";
import { checkEdit, checkPurchase, needsConfirmation, type GuardTool } from "@/lib/purchase-guard";
import { CATALOG, findCatalogTool, priceHint } from "@/lib/tool-catalog";
import { NICHE_DATA } from "@/lib/niche-stacks-data";
import { addDays, isIsoDate } from "@/lib/subscriptions";
import {
  createSubscription,
  recordGuardSkip,
  resumeSubscription,
  updateSubscription,
  type FormState,
} from "../actions";
import { GuardNotice } from "./guard-notice";

const field =
  "w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-base outline-none focus:border-accent";

type Props = {
  stacks: Stack[];
  today: string;
  sub?: Subscription;
  /** Everything already tracked, for Purchase Guard (adding and editing). */
  existing?: GuardTool[];
  /** Pre-select "free trial" when opening from the trials section. */
  startAsTrial?: boolean;
  /** Prefill a new subscription (Niche Stacks). A trial_ends_at makes it a free trial. */
  preset?: { tool_name: string; category: string; monthly_cost: number; trial_ends_at?: string | null };
  trigger: React.ReactNode;
  triggerClassName?: string;
  triggerLabel?: string;
};

export function SubscriptionEditor({
  stacks,
  today,
  sub,
  existing = [],
  startAsTrial,
  preset,
  trigger,
  triggerClassName,
  triggerLabel,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const costRef = useRef<HTMLInputElement>(null);
  const trialEndRef = useRef<HTMLInputElement>(null);
  const initialTrial = sub ? sub.status === "trial" : Boolean(startAsTrial || preset?.trial_ends_at);
  const [isTrial, setIsTrial] = useState(initialTrial);
  const [toolName, setToolName] = useState(sub?.tool_name ?? preset?.tool_name ?? "");
  const [category, setCategory] = useState(sub?.category ?? preset?.category ?? "");
  const [status, setStatus] = useState(sub && sub.status !== "trial" ? sub.status : "active");
  const [billing, setBilling] = useState(sub?.billing_cycle === "yearly" ? "yearly" : "monthly");
  const effectiveStatus = isTrial ? "trial" : status;

  // Switching monthly/yearly converts the price already typed, so $15/mo doesn't become $15/yr.
  function changeBilling(next: string) {
    const input = costRef.current;
    const n = input ? Number(input.value.replace(/[$,\s]/g, "")) : NaN;
    if (input && input.value.trim() !== "" && Number.isFinite(n) && next !== billing) {
      const v = next === "yearly" ? n * 12 : n / 12;
      input.value = String(Math.round(v * 100) / 100);
    }
    setBilling(next);
  }

  // Fill-in as you type (adding only): category from the tool list, and a checked price when we have one.
  const hint = !sub ? priceHint(toolName, NICHE_DATA) : null;
  function onToolName(value: string) {
    setToolName(value);
    if (sub) return;
    const known = findCatalogTool(value);
    if (known && !category) setCategory(known.category);
    const h = priceHint(value, NICHE_DATA);
    if (!h) return;
    if (!known && !category) {
      const cat = NICHE_DATA.stacks.flatMap((st) => st.tools).find((t) => t.name === h.plan)?.category;
      if (cat) setCategory(cat);
    }
    if (costRef.current && costRef.current.value.trim() === "") costRef.current.value = String(h.monthly_cost);
    if (h.trial_days && isTrial && trialEndRef.current && !isIsoDate(trialEndRef.current.value)) {
      trialEndRef.current.value = addDays(today, h.trial_days);
    }
  }

  // Purchase Guard. Adding: every match. Editing: only a rename into another tool, or reopening a
  // cancelled tool you already have open (checkEdit skips the row itself).
  const guard = sub
    ? checkEdit(sub, { tool_name: toolName, category, status: effectiveStatus }, existing)
    : checkPurchase({ tool_name: toolName, category }, existing);
  const guardHit = guard !== null && toolName.trim() !== "" && needsConfirmation(guard);

  function resetForm() {
    formRef.current?.reset();
    setIsTrial(initialTrial);
    setToolName(sub?.tool_name ?? preset?.tool_name ?? "");
    setCategory(sub?.category ?? preset?.category ?? "");
    setStatus(sub && sub.status !== "trial" ? sub.status : "active");
    setBilling(sub?.billing_cycle === "yearly" ? "yearly" : "monthly");
  }

  const [state, action, pending] = useActionState<FormState, FormData>(async (prev, formData) => {
    const result = await (sub ? updateSubscription : createSubscription)(prev, formData);
    if (result.ok) {
      dialogRef.current?.close();
      if (!sub) resetForm();
    }
    return result;
  }, {});

  // The server can flag a match the live check missed (stale list). Then the next submit confirms it.
  // That flag only counts while the form still holds the tool the server checked.
  const mustConfirm = guardHit || (Boolean(state.guard) && state.guardFor === toolName.trim());

  const [resuming, startResume] = useTransition();
  function resume(id: string) {
    const fd = new FormData();
    fd.set("id", id);
    startResume(async () => {
      await resumeSubscription(fd);
      dialogRef.current?.close();
      resetForm();
    });
  }

  const [skipping, startSkip] = useTransition();
  function dontAdd() {
    // Adding: record what Purchase Guard kept off the bill (the server re-checks the match).
    // Editing: just drop the changes.
    if (!sub && formRef.current) {
      const fd = new FormData(formRef.current);
      startSkip(async () => {
        await recordGuardSkip(fd);
      });
    }
    dialogRef.current?.close();
    resetForm();
  }

  return (
    <>
      <button
        type="button"
        aria-label={triggerLabel}
        className={triggerClassName}
        onClick={() => dialogRef.current?.showModal()}
      >
        {trigger}
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby={sub ? `edit-title-${sub.id}` : "add-title"}
        className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-line bg-surface p-0 text-ink backdrop:bg-black/40"
      >
        <form ref={formRef} action={action} className="space-y-4 p-6">
          <div className="flex items-start justify-between gap-4">
            <h2 id={sub ? `edit-title-${sub.id}` : "add-title"} className="font-display text-xl font-bold">
              {sub ? `Edit ${sub.tool_name}` : "Add a subscription"}
            </h2>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="-mr-2 -mt-1 rounded-md px-2 py-1 text-ink-faint hover:text-ink"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          {sub && <input type="hidden" name="id" value={sub.id} />}

          <label className="block">
            <span className="mb-1 block text-sm font-medium">Tool name</span>
            <input
              name="tool_name"
              required
              maxLength={80}
              value={toolName}
              onChange={(e) => onToolName(e.target.value)}
              list={sub ? undefined : "tool-catalog"}
              placeholder="e.g. ClickFunnels"
              autoComplete="off"
              className={field}
            />
            {!sub && (
              <datalist id="tool-catalog">
                {CATALOG.map((t) => (
                  <option key={t.name} value={t.name} />
                ))}
              </datalist>
            )}
            {hint && (
              <span className="mt-1 block text-xs text-ink-faint">
                {hint.plan}: <a href={hint.src} target="_blank" rel="noopener noreferrer nofollow" className="underline underline-offset-2 hover:text-accent">{hint.price_text}</a>
                {hint.trial_days ? `, ${hint.trial_days}-day free trial` : ""} (checked {hint.checked_long}). Change it if your plan differs.
              </span>
            )}
          </label>

          <label className="flex items-center gap-3 rounded-lg bg-band px-3 py-2.5">
            <input
              type="checkbox"
              name="is_trial"
              checked={isTrial}
              onChange={(e) => setIsTrial(e.target.checked)}
              className="size-4 accent-[var(--accent-fill)]"
            />
            <span className="text-sm font-medium">This is a free trial</span>
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Category</span>
              <select name="category" required value={category} onChange={(e) => setCategory(e.target.value)} className={field}>
                <option value="" disabled>Choose…</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium">
                {isTrial ? "Price after trial (/mo)" : billing === "yearly" ? "Yearly price" : "Monthly cost"}
              </span>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint">$</span>
                <input
                  ref={costRef}
                  name="monthly_cost"
                  inputMode="decimal"
                  required
                  defaultValue={
                    sub
                      ? String(sub.billing_cycle === "yearly" && sub.status !== "trial" ? Math.round(sub.monthly_cost * 12 * 100) / 100 : sub.monthly_cost)
                      : preset
                        ? String(preset.monthly_cost)
                        : ""
                  }
                  placeholder="0.00"
                  pattern="[0-9]*[.,]?[0-9]{0,2}"
                  className={`${field} pl-7 num`}
                />
              </div>
              <span className="mt-1 block text-xs text-ink-faint">
                {isTrial ? "What it costs per month once the trial ends." : billing === "yearly" ? "We count 1/12 of it each month." : "Billed yearly? Pick Yearly below."}
              </span>
            </label>
          </div>

          {isTrial ? (
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Trial ends</span>
              <input
                ref={trialEndRef}
                type="date"
                name="trial_ends_at"
                required
                defaultValue={sub?.trial_ends_at ?? preset?.trial_ends_at ?? ""}
                className={field}
              />
              <span className="mt-1 block text-xs text-ink-faint">The day you&apos;d be charged if you don&apos;t cancel.</span>
            </label>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-medium">Status</span>
                <select name="status" value={status} onChange={(e) => setStatus(e.target.value)} className={field}>
                  {STATUSES.filter((s) => s !== "trial").map((s) => (
                    <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium">Billed</span>
                <select name="billing_cycle" value={billing} onChange={(e) => changeBilling(e.target.value)} className={field}>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-sm font-medium">Next renewal</span>
                <input type="date" name="renewal_date" defaultValue={sub?.renewal_date ?? ""} className={field} />
              </label>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Stack</span>
              <select name="stack_id" defaultValue={sub?.stack_id ?? ""} className={field}>
                <option value="">No stack</option>
                {stacks.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Last used</span>
              <input type="date" name="last_used_at" max={today} defaultValue={sub?.last_used_at ?? ""} className={field} />
            </label>
          </div>

          {guard && guardHit && (
            <GuardNotice result={guard} newName={toolName.trim()} category={category} today={today} editing={Boolean(sub)} />
          )}
          {mustConfirm && <input type="hidden" name="guard_ack" value="1" />}

          {state.error && (
            <p role="alert" className="rounded-lg bg-danger-tint px-3 py-2 text-sm text-danger">{state.error}</p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            {mustConfirm ? (
              <>
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-lg border border-line px-4 py-2.5 font-medium text-ink-soft hover:border-ink-faint hover:text-ink disabled:opacity-60"
                >
                  {pending ? "Saving…" : sub ? "Save anyway" : "Add anyway"}
                </button>
                {guard?.resumable && (
                  <button
                    type="button"
                    disabled={resuming}
                    onClick={() => resume(guard.resumable!.id)}
                    className="rounded-lg border border-accent px-4 py-2.5 font-semibold text-accent hover:bg-band disabled:opacity-60"
                  >
                    {resuming ? "Resuming…" : `Resume ${guard.resumable.tool_name} instead`}
                  </button>
                )}
                <button
                  type="button"
                  onClick={dontAdd}
                  disabled={skipping}
                  className="rounded-lg bg-accent-fill px-5 py-2.5 font-semibold text-white hover:opacity-90 disabled:opacity-60"
                >
                  {sub ? "Don't save" : "Don't add"}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => dialogRef.current?.close()}
                  className="rounded-lg px-4 py-2.5 font-medium text-ink-soft hover:text-ink"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-lg bg-accent-fill px-5 py-2.5 font-semibold text-white hover:opacity-90 disabled:opacity-60"
                >
                  {pending ? "Saving…" : sub ? "Save changes" : "Add"}
                </button>
              </>
            )}
          </div>
        </form>
      </dialog>
    </>
  );
}
