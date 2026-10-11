"use client";

import { useActionState, useRef } from "react";
import { createStack, type FormState } from "../actions";

export function StackForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<FormState, FormData>(async (prev, formData) => {
    const result = await createStack(prev, formData);
    if (result.ok) formRef.current?.reset();
    return result;
  }, {});

  return (
    <form ref={formRef} action={action} className="mt-4">
      <label htmlFor="stack-name" className="sr-only">New stack name</label>
      <div className="flex gap-2">
        <input
          id="stack-name"
          name="name"
          required
          maxLength={60}
          placeholder="New stack, e.g. Client funnels"
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 rounded-lg border border-line px-3 py-2 text-sm font-medium hover:border-accent hover:text-accent disabled:opacity-60"
        >
          {pending ? "Adding…" : "Add"}
        </button>
      </div>
      {state.error && <p role="alert" className="mt-2 text-sm text-danger">{state.error}</p>}
    </form>
  );
}
