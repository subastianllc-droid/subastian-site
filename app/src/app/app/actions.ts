"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";
import { CATEGORIES, STATUSES, addMonths, isIsoDate, type Status } from "@/lib/subscriptions";
import { SAMPLE_STACK_NAME, sampleRows } from "@/lib/sample-stack";
import { checkEdit, checkPurchase, needsConfirmation, strongestMatch, type GuardResult } from "@/lib/purchase-guard";

/** `guard` is set when Purchase Guard found a match the user hasn't confirmed yet. */
export type FormState = { error?: string; ok?: boolean; guard?: boolean; guardFor?: string };

type SubInsert = Database["public"]["Tables"]["subscriptions"]["Insert"];
type SubUpdate = Database["public"]["Tables"]["subscriptions"]["Update"];

const GUARD_COLUMNS = "id, tool_name, category, status, monthly_cost, renewal_date, trial_ends_at";

function guardMessage(result: GuardResult, verb: string): string {
  const names = [...result.sameTool, ...result.similarName, ...result.sameCategory, ...result.cancelledBefore].map(
    (s) => s.tool_name,
  );
  return `Purchase Guard: you already track ${[...new Set(names)].join(", ")}. Choose ${verb}.`;
}

async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Not signed in");
  return { supabase, user: data.user };
}

function optionalDate(formData: FormData, key: string): string | null | "invalid" {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) return null;
  return isIsoDate(raw) ? raw : "invalid";
}

/** Validates the add/edit form. Returns the row to write, or an error message. */
async function parseSubscription(
  formData: FormData,
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<{ row: SubInsert } | { error: string }> {
  const toolName = String(formData.get("tool_name") ?? "").trim();
  if (!toolName) return { error: "Give the tool a name." };
  if (toolName.length > 80) return { error: "Keep the name under 80 characters." };

  const category = String(formData.get("category") ?? "");
  if (!(CATEGORIES as readonly string[]).includes(category)) return { error: "Pick a category." };

  const isTrial = formData.get("is_trial") === "on";
  const status = (isTrial ? "trial" : String(formData.get("status") ?? "active")) as Status;
  if (!STATUSES.includes(status)) return { error: "Pick a status." };

  const costRaw = String(formData.get("monthly_cost") ?? "").replace(/[$,\s]/g, "");
  const cost = costRaw === "" ? NaN : Number(costRaw);
  if (!Number.isFinite(cost) || cost < 0 || cost > 100_000) {
    return { error: isTrial ? "Enter what it will cost per month after the trial (0 if free)." : "Enter the monthly cost (0 if free)." };
  }

  const trialEnds = optionalDate(formData, "trial_ends_at");
  const renewal = optionalDate(formData, "renewal_date");
  const lastUsed = optionalDate(formData, "last_used_at");
  if (trialEnds === "invalid" || renewal === "invalid" || lastUsed === "invalid") {
    return { error: "One of the dates isn't valid." };
  }
  if (isTrial && !trialEnds) return { error: "Enter the day the free trial ends." };

  let stackId: string | null = String(formData.get("stack_id") ?? "") || null;
  if (stackId) {
    // RLS only returns the user's own stacks, so this also blocks foreign stack ids.
    const { data } = await supabase.from("stacks").select("id").eq("id", stackId).maybeSingle();
    if (!data) stackId = null;
  }

  return {
    row: {
      tool_name: toolName,
      category,
      status,
      monthly_cost: Math.round(cost * 100) / 100,
      trial_ends_at: isTrial ? trialEnds : null,
      trial_outcome: null,
      renewal_date: isTrial ? null : renewal,
      last_used_at: lastUsed,
      stack_id: stackId,
    },
  };
}

export async function createSubscription(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase, user } = await requireUser();
  const parsed = await parseSubscription(formData, supabase);
  if ("error" in parsed) return parsed;

  // Purchase Guard, server side. The form shows the same check live; this catches a stale form
  // (e.g. a tool added in another tab) so nothing slips past without the user seeing it.
  if (formData.get("guard_ack") !== "1") {
    const { data: existing } = await supabase.from("subscriptions").select(GUARD_COLUMNS);
    const result = checkPurchase(parsed.row, existing ?? []);
    if (needsConfirmation(result)) {
      return { guard: true, guardFor: parsed.row.tool_name, error: guardMessage(result, "Add anyway or Don't add") };
    }
  }

  const { error } = await supabase.from("subscriptions").insert({ ...parsed.row, user_id: user.id });
  if (error) return { error: "Couldn't save that subscription. Try again." };
  revalidatePath("/app");
  return { ok: true };
}

export async function updateSubscription(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing subscription." };

  const parsed = await parseSubscription(formData, supabase);
  if ("error" in parsed) return parsed;

  const { row } = parsed;

  // Purchase Guard on edit: a rename into another tool's name, or reopening a cancelled tool you
  // already have open elsewhere, needs the same confirmation as adding it.
  if (formData.get("guard_ack") !== "1") {
    const { data: all } = await supabase.from("subscriptions").select(GUARD_COLUMNS);
    const before = (all ?? []).find((s) => s.id === id);
    if (!before) return { error: "Couldn't find that subscription. Refresh and try again." };
    const result = checkEdit(before, row as { tool_name: string; category: string; status: string }, all ?? []);
    if (result) {
      return { guard: true, guardFor: row.tool_name, error: guardMessage(result, "Save anyway or Don't save") };
    }
  }

  // Keep a recorded trial decision unless the user turned it back into a trial.
  const patch: SubUpdate = {
    tool_name: row.tool_name,
    category: row.category,
    status: row.status,
    monthly_cost: row.monthly_cost,
    trial_ends_at: row.trial_ends_at,
    renewal_date: row.renewal_date,
    last_used_at: row.last_used_at,
    stack_id: row.stack_id,
    ...(row.status === "trial" ? { trial_outcome: null } : {}),
  };

  const { error } = await supabase.from("subscriptions").update(patch).eq("id", id);
  if (error) return { error: "Couldn't save your changes. Try again." };
  revalidatePath("/app");
  return { ok: true };
}

export async function deleteSubscription(formData: FormData) {
  const { supabase } = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  // alert_log rows cascade-delete with the subscription (FK ON DELETE CASCADE).
  await supabase.from("subscriptions").delete().eq("id", id);
  revalidatePath("/app");
}

/**
 * Purchase Guard's "Don't add": records the tool the user chose not to add, so the dashboard can
 * show what Purchase Guard kept off their bill. The match is re-checked here against the user's own
 * rows, so only a real match is recorded. A missing or invalid cost is stored as unknown.
 */
export async function recordGuardSkip(formData: FormData) {
  const { supabase, user } = await requireUser();
  const toolName = String(formData.get("tool_name") ?? "").trim();
  const category = String(formData.get("category") ?? "");
  if (!toolName || toolName.length > 80 || !(CATEGORIES as readonly string[]).includes(category)) return;

  const { data: existing } = await supabase.from("subscriptions").select(GUARD_COLUMNS);
  const matched = strongestMatch(checkPurchase({ tool_name: toolName, category }, existing ?? []));
  if (!matched) return;

  const costRaw = String(formData.get("monthly_cost") ?? "").replace(/[$,\s]/g, "");
  const cost = costRaw === "" ? NaN : Number(costRaw);
  const monthly = Number.isFinite(cost) && cost >= 0 && cost <= 100_000 ? Math.round(cost * 100) / 100 : null;

  await supabase.from("guard_skips").insert({
    user_id: user.id,
    tool_name: toolName,
    category,
    monthly_cost: monthly,
    was_trial: formData.get("is_trial") === "on",
    matched,
  });
  revalidatePath("/app");
}

/** Purchase Guard's "Resume instead": marks a paused subscription active again. Tracker only. */
export async function resumeSubscription(formData: FormData) {
  const { supabase } = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await supabase.from("subscriptions").update({ status: "active" }).eq("id", id).eq("status", "paused");
  revalidatePath("/app");
}

/** Records the decision at the end of a free trial. */
export async function decideTrial(formData: FormData) {
  const { supabase } = await requireUser();
  const id = String(formData.get("id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  if (!id || (decision !== "kept" && decision !== "cancelled")) return;

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("trial_ends_at, renewal_date")
    .eq("id", id)
    .maybeSingle();
  if (!sub) return;

  await supabase
    .from("subscriptions")
    .update(
      decision === "kept"
        ? { status: "active", trial_outcome: "kept", renewal_date: sub.renewal_date ?? sub.trial_ends_at }
        : { status: "cancelled", trial_outcome: "cancelled" },
    )
    .eq("id", id);
  revalidatePath("/app");
}

export async function markUsedToday(formData: FormData) {
  const { supabase } = await requireUser();
  const id = String(formData.get("id") ?? "");
  const today = String(formData.get("today") ?? "");
  if (!id || !isIsoDate(today)) return;
  await supabase.from("subscriptions").update({ last_used_at: today }).eq("id", id);
  revalidatePath("/app");
}

export async function createStack(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase, user } = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Name the stack." };
  if (name.length > 60) return { error: "Keep the name under 60 characters." };
  if (name.toLowerCase() === SAMPLE_STACK_NAME.toLowerCase()) return { error: "That name is reserved for the sample stack." };
  const { error } = await supabase.from("stacks").insert({ name, user_id: user.id });
  if (error) return { error: "Couldn't create that stack. Try again." };
  revalidatePath("/app");
  return { ok: true };
}

export async function deleteStack(formData: FormData) {
  const { supabase } = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  // Tools in the stack stay tracked, just ungrouped (FK ON DELETE SET NULL).
  await supabase.from("stacks").delete().eq("id", id);
  revalidatePath("/app");
}

/** Loads the labeled sample stack. Only when the account has no sample yet. */
export async function loadSampleStack(formData: FormData) {
  const { supabase, user } = await requireUser();
  const today = String(formData.get("today") ?? "");
  if (!isIsoDate(today)) return;

  const { data: existing } = await supabase.from("stacks").select("id").eq("name", SAMPLE_STACK_NAME).maybeSingle();
  if (existing) return;

  const { data: stack, error } = await supabase
    .from("stacks")
    .insert({ name: SAMPLE_STACK_NAME, user_id: user.id })
    .select("id")
    .single();
  if (error || !stack) return;

  const { error: insertError } = await supabase.from("subscriptions").insert(sampleRows(today, stack.id, user.id));
  if (insertError) await supabase.from("stacks").delete().eq("id", stack.id);
  revalidatePath("/app");
}

/** Deletes every tool in the sample stack, then the stack. The user's own tools are untouched. */
export async function removeSampleStack() {
  const { supabase } = await requireUser();
  const { data: stack } = await supabase.from("stacks").select("id").eq("name", SAMPLE_STACK_NAME).maybeSingle();
  if (!stack) return;
  await supabase.from("subscriptions").delete().eq("stack_id", stack.id);
  await supabase.from("stacks").delete().eq("id", stack.id);
  revalidatePath("/app");
}

/** Moves the renewal date forward one month. Records the user's word only; it doesn't check any charge. */
export async function markRenewed(formData: FormData) {
  const { supabase } = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const { data: sub } = await supabase.from("subscriptions").select("renewal_date, status").eq("id", id).maybeSingle();
  if (!sub?.renewal_date || sub.status !== "active") return;
  await supabase.from("subscriptions").update({ renewal_date: addMonths(sub.renewal_date, 1) }).eq("id", id);
  revalidatePath("/app");
}
