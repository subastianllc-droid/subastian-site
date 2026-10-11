import type { Metadata } from "next";
import { Suspense } from "react";
import Image from "next/image";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { todayIn } from "@/lib/subscriptions";
import { DashboardView } from "./_components/dashboard-view";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Dashboard />
    </Suspense>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-1 flex-col" aria-busy="true" aria-label="Loading your dashboard">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl items-center gap-2.5 px-4 py-3">
          <Image src="/emblem.png" alt="" width={32} height={32} priority />
          <span className="font-display text-lg font-extrabold tracking-tight">Subastian</span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <div className="h-9 w-64 animate-pulse rounded-lg bg-band" />
        <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-band" />
          ))}
        </div>
        <div className="mt-8 h-48 animate-pulse rounded-2xl bg-band" />
      </main>
    </div>
  );
}

async function Dashboard() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const [{ data: profile }, { data: subsData, error: subsError }, { data: stacksData }] = await Promise.all([
    supabase.from("profiles").select("email, full_name, plan_tier").eq("id", auth.user.id).maybeSingle(),
    supabase.from("subscriptions").select("*").order("created_at"),
    supabase.from("stacks").select("*").order("name"),
  ]);

  const tzCookie = (await cookies()).get("tz")?.value ?? null;

  return (
    <DashboardView
      email={profile?.email ?? auth.user.email ?? ""}
      planTier={profile?.plan_tier ?? null}
      subs={(subsData ?? []).map((s) => ({ ...s, monthly_cost: Number(s.monthly_cost) }))}
      stacks={stacksData ?? []}
      today={todayIn(tzCookie ?? "America/Denver")}
      tzCookie={tzCookie}
      loadError={Boolean(subsError)}
    />
  );
}
