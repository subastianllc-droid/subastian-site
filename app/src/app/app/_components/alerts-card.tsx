"use client";

import { useOptimistic, useTransition } from "react";
import { setAlertsEnabled } from "../actions";

/** On/off switch for the 30/7/3/1/0-day renewal and free-trial emails. */
export function AlertsCard({ enabled, email, timeZone }: { enabled: boolean; email: string; timeZone: string }) {
  const [on, setOn] = useOptimistic(enabled);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !on;
    startTransition(async () => {
      setOn(next);
      const fd = new FormData();
      if (next) fd.set("enabled", "on");
      await setAlertsEnabled(fd);
    });
  }

  return (
    <section aria-labelledby="alerts-h" className="h-fit rounded-2xl border border-line bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="alerts-h" className="font-display text-lg font-bold">Email alerts</h2>
          <p className="mt-1 text-sm text-ink-soft">
            {on ? "On" : "Off"}
            {pending ? " · saving…" : ""}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby="alerts-h"
          onClick={toggle}
          disabled={pending}
          className={`relative mt-1 h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-60 ${on ? "bg-accent-fill" : "bg-line"}`}
        >
          <span
            aria-hidden="true"
            className={`absolute top-1 left-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? "translate-x-5" : ""}`}
          />
        </button>
      </div>
      <p className="mt-3 text-sm text-ink-soft">
        {on ? (
          <>
            We email <span className="font-medium text-ink break-all">{email}</span> 30, 7, 3 and 1 days before a renewal or
            free trial ends, and on the day.
          </>
        ) : (
          <>Turn on to get an email 30, 7, 3 and 1 days before a renewal or free trial ends, and on the day.</>
        )}
      </p>
      <p className="mt-2 text-sm text-ink-faint">
        One email per day at most, sent after 8am your time ({timeZone.replace(/_/g, " ")}).
      </p>
    </section>
  );
}
