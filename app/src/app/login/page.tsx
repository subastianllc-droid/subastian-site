import type { Metadata } from "next";
import { Suspense } from "react";
import Image from "next/image";
import { safeNext } from "@/lib/safe-next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Image src="/emblem.png" alt="" width={56} height={56} priority />
          <h1 className="mt-4 font-display text-2xl font-extrabold tracking-tight">Subastian</h1>
          <p className="mt-1 text-sm text-ink-soft">The Subscription Conductor</p>
        </div>

        <Suspense fallback={<div className="h-80 animate-pulse rounded-2xl bg-band" />}>
          <LoginPanel searchParams={searchParams} />
        </Suspense>

        <p className="mt-6 text-center text-xs text-ink-faint">
          By continuing you agree to the{" "}
          <a className="underline hover:text-ink-soft" href="https://subastian.us/terms/">Terms</a> and{" "}
          <a className="underline hover:text-ink-soft" href="https://subastian.us/privacy/">Privacy Policy</a>.
        </p>
      </div>
    </main>
  );
}

async function LoginPanel({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const params = await searchParams;
  const next = safeNext(typeof params.next === "string" ? params.next : null);
  const linkError = params.error === "link";

  return (
    <>
      {linkError && (
        <p role="alert" className="mb-4 rounded-lg bg-danger-tint px-3 py-2 text-sm text-danger">
          That sign-in link has expired or was already used. Request a new one below.
        </p>
      )}
      <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
        <LoginForm next={next} />
      </div>
    </>
  );
}
