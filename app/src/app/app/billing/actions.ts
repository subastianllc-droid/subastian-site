"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { billingOpen, isPlanId } from "@/lib/billing";

/**
 * Asks the `billing` Edge Function for a Stripe URL and sends the user there. The Stripe secret
 * key lives only in the Edge Function; this app never sees it.
 */
async function stripeUrl(body: Record<string, unknown>): Promise<string> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login?next=/app/billing");

  const { data, error } = await supabase.functions.invoke<{ url?: string }>("billing", { body });
  if (error) {
    const status = error instanceof FunctionsHttpError ? (error.context as Response).status : 0;
    const code =
      status === 403 ? "closed" : status === 409 ? (body.action === "portal" ? "none" : "active") : status === 400 ? "plan" : "failed";
    redirect(`/app/billing?error=${code}`);
  }
  if (!data?.url?.startsWith("https://")) redirect("/app/billing?error=failed");
  return data.url;
}

export async function startCheckout(formData: FormData) {
  if (!billingOpen()) redirect("/app/billing?error=closed");
  const plan = formData.get("plan");
  if (!isPlanId(plan)) redirect("/app/billing?error=plan");
  // PromoteKit's script stores the partner's referral id in this cookie; Stripe gets it as metadata.
  const referral = (await cookies()).get("promotekit_referral")?.value ?? null;
  redirect(await stripeUrl({ action: "checkout", plan, referral }));
}

export async function openPortal() {
  redirect(await stripeUrl({ action: "portal" }));
}
