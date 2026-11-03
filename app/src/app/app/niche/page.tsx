import type { Metadata } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { todayIn } from "@/lib/subscriptions";
import { getNicheStack } from "@/lib/niche-stacks-data";
import { NicheView } from "./niche-view";

export const metadata: Metadata = { title: "Niche Stacks" };

export default function NichePage() {
  return (
    <Suspense fallback={<div className="mx-auto h-64 w-full max-w-6xl animate-pulse px-4 py-8" aria-busy="true" />}>
      <Niche />
    </Suspense>
  );
}

async function Niche() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login?next=/app/niche");

  const [{ data: profile }, { data: subsData }, { data: stacksData }] = await Promise.all([
    supabase.from("profiles").select("niche").eq("id", auth.user.id).maybeSingle(),
    supabase.from("subscriptions").select("*").order("created_at"),
    supabase.from("stacks").select("*").order("name"),
  ]);

  const tz = (await cookies()).get("tz")?.value ?? "America/Denver";
  return (
    <NicheView
      stack={getNicheStack(profile?.niche)}
      subs={(subsData ?? []).map((s) => ({ ...s, monthly_cost: Number(s.monthly_cost) }))}
      stacks={stacksData ?? []}
      today={todayIn(tz)}
    />
  );
}
