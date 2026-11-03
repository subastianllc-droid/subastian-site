import type { Metadata } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { todayIn } from "@/lib/subscriptions";
import { ImportView } from "./import-view";

export const metadata: Metadata = { title: "Import a statement" };

export default function ImportPage() {
  return (
    <Suspense fallback={<div className="mx-auto h-64 w-full max-w-4xl animate-pulse px-4 py-8" aria-busy="true" />}>
      <Import />
    </Suspense>
  );
}

async function Import() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login?next=/app/import");
  const { data } = await supabase.from("subscriptions").select("tool_name, status");
  const tz = (await cookies()).get("tz")?.value ?? "America/Denver";
  return <ImportView tracked={data ?? []} today={todayIn(tz)} />;
}
