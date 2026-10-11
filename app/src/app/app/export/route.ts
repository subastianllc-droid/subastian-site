import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const COLUMNS = [
  ["tool_name", "Tool"],
  ["category", "Category"],
  ["status", "Status"],
  ["monthly_cost", "Monthly cost (USD)"],
  ["renewal_date", "Next renewal"],
  ["trial_ends_at", "Trial ends"],
  ["trial_outcome", "Trial outcome"],
  ["last_used_at", "Last used"],
  ["stack", "Stack"],
  ["created_at", "Added"],
] as const;

/** Quotes a CSV cell and defuses spreadsheet formulas (cells starting with = + - @ tab or CR). */
function cell(value: unknown): string {
  let s = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

/** Downloads the signed-in user's subscriptions as CSV. RLS limits rows to their own. */
export async function GET() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return new NextResponse("Sign in first.", { status: 401 });

  const [{ data: subs, error }, { data: stacks }] = await Promise.all([
    supabase.from("subscriptions").select("*").order("tool_name"),
    supabase.from("stacks").select("id, name"),
  ]);
  if (error) return new NextResponse("Couldn't load your subscriptions.", { status: 500 });

  const stackName = new Map((stacks ?? []).map((s) => [s.id, s.name]));
  const rows = (subs ?? []).map((s) => {
    const record: Record<string, unknown> = {
      ...s,
      monthly_cost: Number(s.monthly_cost).toFixed(2),
      stack: s.stack_id ? stackName.get(s.stack_id) ?? "" : "",
      created_at: s.created_at.slice(0, 10),
    };
    return COLUMNS.map(([key]) => cell(record[key])).join(",");
  });

  const csv = [COLUMNS.map(([, label]) => cell(label)).join(","), ...rows].join("\r\n");
  // BOM so Excel opens UTF-8 names (accents, emoji) correctly.
  return new NextResponse(`﻿${csv}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="subastian-subscriptions.csv"',
      "Cache-Control": "private, no-store",
    },
  });
}
