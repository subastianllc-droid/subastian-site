"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

/**
 * Submit button for a destructive or tracker-changing server action, with an in-page confirm step.
 * First click swaps the button for the question plus "Yes" / "No"; only "Yes" submits the form.
 * (No window.confirm: browsers can silently block those pop-ups, which made the button do nothing.)
 */
export function ConfirmButton({
  message,
  children,
  className,
  label,
  confirmLabel = "Yes",
  tone = "danger",
}: {
  message: string;
  children: React.ReactNode;
  className?: string;
  label?: string;
  confirmLabel?: string;
  /** "danger" for removals, "accent" for tracker updates like Mark renewed. */
  tone?: "danger" | "accent";
}) {
  const [asking, setAsking] = useState(false);
  const { pending } = useFormStatus();
  const yesRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (asking) yesRef.current?.focus();
  }, [asking]);

  if (!asking) {
    return (
      <button type="button" aria-label={label} className={className} onClick={() => setAsking(true)}>
        {children}
      </button>
    );
  }

  return (
    <span role="group" aria-label={message} className="inline-flex flex-wrap items-center gap-2 text-sm">
      <span className="text-ink">{message}</span>
      <button
        ref={yesRef}
        type="submit"
        disabled={pending}
        className={`rounded-lg px-3 py-1.5 font-semibold text-white hover:opacity-90 disabled:opacity-60 ${tone === "danger" ? "bg-danger" : "bg-accent-fill"}`}
      >
        {pending ? "Working…" : confirmLabel}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => setAsking(false)}
        className="rounded-lg px-3 py-1.5 font-medium text-ink-soft hover:text-ink"
      >
        No
      </button>
    </span>
  );
}
