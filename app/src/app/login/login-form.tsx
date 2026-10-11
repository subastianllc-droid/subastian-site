"use client";

import { useActionState, useState } from "react";
import { sendMagicLink, signIn, signUp, type AuthState } from "./actions";

type Mode = "signin" | "signup" | "link";

const COPY: Record<Mode, { button: string; pending: string }> = {
  signin: { button: "Sign in", pending: "Signing in…" },
  signup: { button: "Create account", pending: "Creating account…" },
  link: { button: "Email me a sign-in link", pending: "Sending link…" },
};

export function LoginForm({ next }: { next: string }) {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");

  const [signInState, signInAction, signingIn] = useActionState<AuthState, FormData>(signIn, {});
  const [signUpState, signUpAction, signingUp] = useActionState<AuthState, FormData>(signUp, {});
  const [linkState, linkAction, sendingLink] = useActionState<AuthState, FormData>(sendMagicLink, {});

  const { action, state, pending } = {
    signin: { action: signInAction, state: signInState, pending: signingIn },
    signup: { action: signUpAction, state: signUpState, pending: signingUp },
    link: { action: linkAction, state: linkState, pending: sendingLink },
  }[mode];

  return (
    <div>
      {mode !== "link" && (
        <div role="tablist" aria-label="Account" className="mb-5 grid grid-cols-2 rounded-lg bg-band p-1 text-sm font-medium">
          {(["signin", "signup"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={`rounded-md py-2 transition ${
                mode === m ? "bg-surface text-ink shadow-sm" : "text-ink-soft hover:text-ink"
              }`}
            >
              {m === "signin" ? "Sign in" : "Create account"}
            </button>
          ))}
        </div>
      )}

      {mode === "link" && (
        <p className="mb-4 text-sm text-ink-soft">
          We&apos;ll email you a one-time link. No password needed, and it creates your account if you&apos;re new.
        </p>
      )}

      <form action={action} className="space-y-4">
        <input type="hidden" name="next" value={next} />
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Email</span>
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-base outline-none focus:border-accent"
          />
        </label>

        {mode !== "link" && (
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Password</span>
            <input
              name="password"
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              required
              minLength={mode === "signup" ? 8 : undefined}
              className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-base outline-none focus:border-accent"
            />
            {mode === "signup" && <span className="mt-1 block text-xs text-ink-faint">At least 8 characters.</span>}
          </label>
        )}

        {state.error && (
          <p role="alert" className="rounded-lg bg-danger-tint px-3 py-2 text-sm text-danger">{state.error}</p>
        )}
        {state.message && (
          <p role="status" className="rounded-lg bg-accent-tint px-3 py-2 text-sm text-accent-strong">{state.message}</p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-accent-fill px-4 py-2.5 font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
        >
          {pending ? COPY[mode].pending : COPY[mode].button}
        </button>
      </form>

      <button
        type="button"
        onClick={() => setMode(mode === "link" ? "signin" : "link")}
        className="mt-4 w-full text-center text-sm text-accent hover:underline"
      >
        {mode === "link" ? "Use a password instead" : "Email me a sign-in link instead"}
      </button>
    </div>
  );
}
