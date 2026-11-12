import type { Metadata } from "next";
import { Suspense } from "react";
import Image from "next/image";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/subscriptions";
import { BILLING_ERRORS, PLAN_LABEL, PLAN_OPTIONS, STATUS_TEXT, billingOpen, hasAccess } from "@/lib/billing";
import { openPortal, startCheckout } from "./actions";

export const metadata: Metadata = { title: "Billing" };

export default function BillingPage({ searchParams }: PageProps<"/app/billing">) {
  return (
    <Suspense fallback={<div className="mx-auto h-64 w-full max-w-4xl animate-pulse px-4 py-8" aria-busy="true" />}>
      <Billing searchParams={searchParams} />
    </Suspense>
  );
}

async function Billing({ searchParams }: { searchParams: PageProps<"/app/billing">["searchParams"] }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login?next=/app/billing");

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan_tier, subscription_status, current_period_end, cancel_at_period_end, stripe_customer_id, stripe_subscription_id")
    .eq("id", auth.user.id)
    .maybeSingle();

  const params = await searchParams;
  const errorCode = typeof params.error === "string" ? params.error : null;
  const checkout = typeof params.checkout === "string" ? params.checkout : null;

  const status = profile?.subscription_status ?? null;
  const subscribed = hasAccess(status);
  const open = billingOpen();
  const hadTrial = Boolean(profile?.stripe_subscription_id);
  const periodEnd = profile?.current_period_end?.slice(0, 10) ?? null;

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-3">
          <a href="/app" className="flex items-center gap-2.5">
            <Image src="/emblem.png" alt="" width={32} height={32} priority />
            <span className="font-display text-lg font-extrabold tracking-tight">Subastian</span>
          </a>
          <a href="/app" className="text-sm font-medium text-ink-soft hover:text-ink">Back to dashboard</a>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
        <h1 className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">Billing</h1>

        {errorCode && (
          <p role="alert" className="mt-4 rounded-lg border border-line bg-band px-4 py-3 text-sm">
            {BILLING_ERRORS[errorCode] ?? BILLING_ERRORS.failed}
          </p>
        )}
        {checkout === "success" && !subscribed && (
          <p className="mt-4 rounded-lg border border-line bg-band px-4 py-3 text-sm">
            Checkout finished. Your plan shows here as soon as Stripe confirms it, usually within a few seconds. Refresh to check.
          </p>
        )}
        {checkout === "cancelled" && (
          <p className="mt-4 rounded-lg border border-line bg-band px-4 py-3 text-sm">Checkout was cancelled. Nothing was charged.</p>
        )}

        {subscribed ? (
          <section className="mt-6 rounded-2xl border border-line bg-surface p-6">
            <p className="text-sm text-ink-soft">Your plan</p>
            <p className="mt-1 font-display text-xl font-extrabold">{PLAN_LABEL[profile!.plan_tier] ?? profile!.plan_tier}</p>
            <p className="mt-2 text-sm">
              {STATUS_TEXT[status!]}
              {periodEnd &&
                (profile!.cancel_at_period_end
                  ? ` · Ends ${formatDate(periodEnd)}`
                  : status === "trialing"
                    ? ` · Trial ends ${formatDate(periodEnd)}, then your card is charged`
                    : ` · Renews ${formatDate(periodEnd)}`)}
            </p>
            <form action={openPortal} className="mt-5">
              <button className="rounded-lg bg-accent-fill px-4 py-2.5 font-semibold text-white hover:opacity-90">
                Manage billing
              </button>
            </form>
            <p className="mt-3 text-xs text-ink-soft">Change plan, update your card, see invoices or cancel, on Stripe&apos;s secure page.</p>
          </section>
        ) : (
          <>
            <p className="mt-2 text-sm text-ink-soft">
              {status && STATUS_TEXT[status] ? `Status: ${STATUS_TEXT[status]}. ` : ""}
              {open
                ? hadTrial
                  ? "Pick a plan. You've had your free trial, so billing starts right away."
                  : "Every plan starts with a 14-day free trial. A card is required; cancel before it ends and you're not charged. The first payment has a 60-day money-back guarantee."
                : "Plans open at launch. You can keep using everything here in the meantime, and nothing is charged."}
            </p>
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              {PLAN_OPTIONS.map((p) => (
                <form key={p.id} action={startCheckout} className="flex flex-col rounded-2xl border border-line bg-surface p-5">
                  <input type="hidden" name="plan" value={p.id} />
                  <p className="font-display text-lg font-extrabold">{p.name}</p>
                  <p className="mt-1 text-2xl font-extrabold">
                    ${p.price}
                    <span className="text-sm font-medium text-ink-soft">/month</span>
                  </p>
                  <button
                    disabled={!open}
                    className="mt-5 rounded-lg bg-accent-fill px-4 py-2.5 font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {!open ? "Opens at launch" : hadTrial ? "Choose plan" : "Start free trial"}
                  </button>
                </form>
              ))}
            </div>
            {profile?.stripe_customer_id && (
              <form action={openPortal} className="mt-6">
                <button className="text-sm font-medium text-ink-soft underline hover:text-ink">See past invoices</button>
              </form>
            )}
          </>
        )}
        <p className="mt-8 text-xs text-ink-soft">Payments are handled by Stripe. Subastian never sees your card number.</p>
      </main>
    </div>
  );
}
