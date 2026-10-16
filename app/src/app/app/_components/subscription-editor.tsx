"use client";

import { useActionState, useRef, useState } from "react";
import type { Stack, Subscription } from "@/lib/database.types";
import { CATEGORIES, STATUSES, STATUS_LABEL } from "@/lib/subscriptions";
import { checkPurchase, needsConfirmation, type GuardTool } from "@/lib/purchase-guard";
import { createSubscription, updateSubscription, type FormState } from "../actions";
import { GuardNotice } from "./guard-notice";

const field =
  "w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-base outline-none focus:border-accent";

type Props = {
  stacks: Stack[];
  today: string;
  sub?: Subscription;
  /** Everything already tracked, for Purchase Guard. Only used when adding. */
  existing?: GuardTool[];
  /** Pre-select "free trial" when opening from the trials section. */
  startAsTrial?: boolean;
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
  trigger,
  triggerClassName,
  triggerLabel,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [isTrial, setIsTrial] = useState(sub ? sub.status === "trial" : Boolean(startAsTrial));
  const [toolName, setToolName] = useState(sub?.tool_name ?? "");
  const [category, setCategory] = useState(sub?.category ?? "");

  // Purchase Guard runs only when adding. Editing an existing row shouldn't warn about itself.
  const guard = sub ? null : checkPurchase({ tool_name: toolName, category }, existing);
  const guardHit = guard !== null && toolName.trim() !== "" && needsConfirmation(guard);

  function resetForm() {
    formRef.current?.reset();
    setIsTrial(Boolean(startAsTrial));
    setToolName("");
    setCategory("");
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

  function dontAdd() {
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
              onChange={(e) => setToolName(e.target.value)}
              placeholder="e.g. ClickFunnels"
              autoComplete="off"
              className={field}
            />
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
                {isTrial ? "Price after trial (/mo)" : "Monthly cost"}
              </span>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint">$</span>
                <input
                  name="monthly_cost"
                  inputMode="decimal"
                  required
                  defaultValue={sub ? String(sub.monthly_cost) : ""}
                  placeholder="0.00"
                  pattern="[0-9]*[.,]?[0-9]{0,2}"
                  className={`${field} pl-7 num`}
                />
              </div>
              <span className="mt-1 block text-xs text-ink-faint">Yearly plan? Divide by 12.</span>
            </label>
          </div>

          {isTrial ? (
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Trial ends</span>
              <input
                type="date"
                name="trial_ends_at"
                required
                defaultValue={sub?.trial_ends_at ?? ""}
                className={field}
              />
              <span className="mt-1 block text-xs text-ink-faint">The day you&apos;d be charged if you don&apos;t cancel.</span>
            </label>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-medium">Status</span>
                <select name="status" defaultValue={sub && sub.status !== "trial" ? sub.status : "active"} className={field}>
                  {STATUSES.filter((s) => s !== "trial").map((s) => (
                    <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                  ))}
                </select>
              </label>
              <label className="block">
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

          {guard && toolName.trim() !== "" && (guardHit || guard.trackedBefore.length > 0) && <GuardNotice result={guard} newName={toolName.trim()} category={category} today={today} />}
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
                  {pending ? "Saving…" : "Add anyway"}
                </button>
                <button
                  type="button"
                  onClick={dontAdd}
                  className="rounded-lg bg-accent-fill px-5 py-2.5 font-semibold text-white hover:opacity-90"
                >
                  Don&apos;t add
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
