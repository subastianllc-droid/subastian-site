import { addMonths, daysBetween } from "./subscriptions.ts";
import { normalizeToolName } from "./purchase-guard.ts";
import { CATALOG, type CatalogTool } from "./tool-catalog.ts";

/**
 * Statement import: find subscriptions in a bank or card statement export (CSV).
 *
 * Runs entirely in the browser. The file is never uploaded; only the rows the user ticks are saved.
 * 1. parseCsv: rows and cells (commas, semicolons or tabs; quoted cells).
 * 2. readStatement: finds the date, description and amount columns and returns the charges.
 * 3. findSubscriptions: groups charges by merchant and keeps the ones that repeat about monthly
 *    or yearly at a similar price, plus known tools charged once (marked "seen once").
 */

export type Charge = { date: string; description: string; amount: number };

export type Candidate = {
  key: string;
  name: string;
  category: string;
  billing_cycle: "monthly" | "yearly";
  /** Price per charge (yearly price for yearly ones). */
  amount: number;
  monthly_cost: number;
  last_charge: string;
  next_renewal: string;
  times: number;
  confidence: "repeating" | "once";
  example: string;
};

/* ----------------------------------- CSV ----------------------------------- */

export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? "";
  const counts = [",", ";", "\t"].map((d) => [d, firstLine.split(d).length] as const);
  const delim = counts.sort((a, b) => b[1] - a[1])[0][0];

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (quoted) {
      if (c === '"' && clean[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) { row.push(cell.trim()); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && clean[i + 1] === "\n") i++;
      row.push(cell.trim()); cell = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell.trim());
  if (row.some((x) => x !== "")) rows.push(row);
  return rows;
}

/* ------------------------------ dates and money ----------------------------- */

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function iso(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return dt.toISOString().slice(0, 10);
}

/** US-style statement dates: 11/03/2026, 11/3/26, 2026-11-03, Nov 3, 2026, 03 Nov 2026. */
export function parseDate(s: string): string | null {
  const t = s.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(t);
  if (m) return iso(+m[3], +m[1], +m[2]) ?? iso(+m[3], +m[2], +m[1]);
  m = /^([A-Za-z]{3})[a-z]*\.? (\d{1,2}),? (\d{4})$/.exec(t);
  if (m && MONTHS.includes(m[1].toLowerCase())) return iso(+m[3], MONTHS.indexOf(m[1].toLowerCase()) + 1, +m[2]);
  m = /^(\d{1,2}) ([A-Za-z]{3})[a-z]* (\d{4})$/.exec(t);
  if (m && MONTHS.includes(m[2].toLowerCase())) return iso(+m[3], MONTHS.indexOf(m[2].toLowerCase()) + 1, +m[1]);
  return null;
}

/** "$1,234.56" → 1234.56, "(12.00)" and "-12.00" → -12, "12.00 CR" → -12. Blank → null. */
export function parseAmount(s: string): number | null {
  let t = s.trim();
  if (!t) return null;
  let neg = false;
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
  if (/\bcr$/i.test(t)) { neg = true; t = t.replace(/\s*cr$/i, ""); }
  t = t.replace(/[$€£\s]/g, "").replace(/,(?=\d{3}\b)/g, "");
  if (t.startsWith("-")) { neg = !neg; t = t.slice(1); }
  if (t.startsWith("+")) t = t.slice(1);
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return neg ? -n : n;
}

/* --------------------------------- columns --------------------------------- */

type Columns = { date: number; desc: number; amount?: number; debit?: number; credit?: number; header: boolean };

function findColumns(rows: string[][]): Columns | null {
  const head = rows[0].map((h) => h.toLowerCase());
  const pick = (re: RegExp, not?: RegExp) => head.findIndex((h) => re.test(h) && !(not && not.test(h)));
  const date = pick(/date|posted/);
  const desc = pick(/description|merchant|payee|name|memo|details|narrative|transaction/, /date|amount|type|id\b|number/);
  const amount = pick(/^amount|amount$|amount \(|transaction amount/);
  const debit = pick(/debit|withdraw|charge|money out|paid out/);
  const credit = pick(/credit|deposit|money in|paid in/);
  if (date >= 0 && desc >= 0 && (amount >= 0 || debit >= 0)) {
    return { date, desc, amount: amount >= 0 ? amount : undefined, debit: debit >= 0 ? debit : undefined, credit: credit >= 0 ? credit : undefined, header: true };
  }
  // No usable header: guess from the first rows' contents.
  const sample = rows.slice(0, 10);
  const width = Math.max(...sample.map((r) => r.length));
  const share = (col: number, test: (v: string) => boolean) => sample.filter((r) => r[col] !== undefined && test(r[col])).length / sample.length;
  let d = -1, a = -1, t = -1;
  for (let c = 0; c < width; c++) {
    if (d < 0 && share(c, (v) => parseDate(v) !== null) > 0.7) d = c;
    else if (a < 0 && share(c, (v) => parseAmount(v) !== null) > 0.7) a = c;
    else if (t < 0 && share(c, (v) => /[a-z]{3}/i.test(v) && parseDate(v) === null) > 0.7) t = c;
  }
  return d >= 0 && a >= 0 && t >= 0 ? { date: d, desc: t, amount: a, header: false } : null;
}

/**
 * The charges (money going out) in a statement, as positive amounts. Banks differ on signs: with one
 * amount column, whichever sign most rows have is treated as "charges" (cards list purchases as
 * positive, checking accounts as negative).
 */
export function readStatement(text: string): { charges: Charge[]; error?: string } {
  const rows = parseCsv(text);
  if (rows.length < 2) return { charges: [], error: "That file doesn't have any rows we can read." };
  const cols = findColumns(rows);
  if (!cols) return { charges: [], error: "We couldn't find the date, description and amount columns. Try your bank's CSV download (not PDF)." };

  const body = cols.header ? rows.slice(1) : rows;
  const raw: Charge[] = [];
  for (const r of body) {
    const date = parseDate(r[cols.date] ?? "");
    const description = (r[cols.desc] ?? "").trim();
    if (!date || !description) continue;
    let amount: number | null = null;
    if (cols.debit !== undefined && cols.debit !== cols.amount) {
      const d = parseAmount(r[cols.debit] ?? "");
      if (d !== null && d !== 0) amount = Math.abs(d);
      else continue; // credit row
    } else if (cols.amount !== undefined) {
      amount = parseAmount(r[cols.amount] ?? "");
    }
    if (amount === null || amount === 0) continue;
    raw.push({ date, description, amount });
  }
  if (!raw.length) return { charges: [], error: "We couldn't read any charges from that file." };

  const usesDebitColumn = cols.debit !== undefined && cols.debit !== cols.amount;
  const negatives = raw.filter((c) => c.amount < 0).length;
  const chargesAreNegative = !usesDebitColumn && negatives > raw.length / 2;
  const charges = raw
    .filter((c) => (usesDebitColumn ? true : chargesAreNegative ? c.amount < 0 : c.amount > 0))
    .map((c) => ({ ...c, amount: Math.round(Math.abs(c.amount) * 100) / 100 }));
  return { charges };
}

/* ------------------------------ merchants ------------------------------ */

const NOISE = new Set([
  "pos", "debit", "credit", "card", "purchase", "recurring", "payment", "pmt", "ach", "online", "www", "com", "net",
  "inc", "llc", "ltd", "co", "corp", "the", "sq", "tst", "paypal", "pp", "visa", "mc", "checkcard", "dbt", "sub",
  "subscription", "bill", "billing", "auto", "autopay", "monthly", "annual", "us", "usa", "help", "ref",
]);

/** A short key for grouping one merchant's charges: "ADOBE *CREATIVE CLD 800-833 CA" → "adobe creative cld". */
export function merchantKey(description: string): string {
  const tokens = description
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t.length > 1 && !/\d/.test(t) && !NOISE.has(t) && !/^[a-z]{2}$/.test(t));
  return tokens.slice(0, 3).join(" ");
}

/**
 * The known tool a statement description refers to, if any. Single words must appear as whole
 * words ("LATER.COM" yes, "PLATERIA" no); multi-word names may appear squashed ("SCREAMINGFROG").
 */
export function catalogFor(description: string): CatalogTool | null {
  const plain = description.toLowerCase().replace(/\.(com|io|ai|app|co|net|org|so)\b/g, " ");
  const words = " " + plain.replace(/[^a-z0-9+]+/g, " ") + " ";
  const squashed = plain.replace(/[^a-z0-9]/g, "");
  let best: CatalogTool | null = null;
  let bestLen = 0;
  for (const t of CATALOG) {
    for (const raw of [t.name, ...(t.match ?? [])]) {
      const n = raw.toLowerCase().replace(/\.(com|io|ai|app|co|net|org|so)\b/g, "").replace(/[^a-z0-9+ ]/g, " ").replace(/\s+/g, " ").trim();
      if (!n) continue;
      const hit = n.includes(" ") ? squashed.includes(n.replace(/[^a-z0-9]/g, "")) || words.includes(` ${n} `) : words.includes(` ${n} `);
      if (hit && n.length > bestLen) { best = t; bestLen = n.length; }
    }
  }
  return best;
}

function titleCase(key: string): string {
  return key.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/* ----------------------------- recurring charges ----------------------------- */

export function findSubscriptions(charges: Charge[], today: string): Candidate[] {
  const groups = new Map<string, { tool: CatalogTool | null; list: Charge[] }>();
  for (const c of charges) {
    const tool = catalogFor(c.description);
    const key = tool ? `tool:${tool.name}` : merchantKey(c.description);
    if (!key) continue;
    const g = groups.get(key) ?? { tool, list: [] };
    g.list.push(c);
    groups.set(key, g);
  }

  const out: Candidate[] = [];
  for (const [key, { tool, list }] of groups) {
    list.sort((a, b) => a.date.localeCompare(b.date));
    // Several charges the same day (e.g. split payments) count once.
    const byDay = list.filter((c, i) => i === 0 || c.date !== list[i - 1].date);
    const last = byDay[byDay.length - 1];
    const gaps = byDay.slice(1).map((c, i) => daysBetween(byDay[i].date, c.date));

    let cycle: "monthly" | "yearly" | null = null;
    if (gaps.length) {
      const g = median(gaps);
      if (g >= 26 && g <= 35) cycle = "monthly";
      else if (g >= 350 && g <= 380) cycle = "yearly";
    }
    // Recent charges at a similar price (within 25%): a price change mid-statement still counts.
    const recent = byDay.slice(-3).map((c) => c.amount);
    const steady = Math.max(...recent) <= Math.min(...recent) * 1.25;

    let confidence: Candidate["confidence"];
    if (cycle && steady) confidence = "repeating";
    else if (byDay.length === 1 && tool) { confidence = "once"; cycle = "monthly"; }
    else continue;
    const billing = cycle ?? "monthly";

    // Skip what's clearly stopped: last charge more than one cycle (+ a week) ago.
    const step = billing === "yearly" ? 372 : 38;
    if (daysBetween(last.date, today) > step) continue;

    let next = billing === "yearly" ? addMonths(last.date, 12) : addMonths(last.date, 1);
    while (next < today) next = billing === "yearly" ? addMonths(next, 12) : addMonths(next, 1);

    out.push({
      key,
      name: tool?.name ?? titleCase(key),
      category: tool?.category ?? "Other",
      billing_cycle: billing,
      amount: last.amount,
      monthly_cost: Math.round((billing === "yearly" ? last.amount / 12 : last.amount) * 100) / 100,
      last_charge: last.date,
      next_renewal: next,
      times: byDay.length,
      confidence,
      example: last.description.slice(0, 80),
    });
  }
  return out.sort((a, b) => Number(a.confidence === "once") - Number(b.confidence === "once") || b.monthly_cost - a.monthly_cost);
}

/** True when a candidate is already in the user's list (same or plan-word-stripped name). */
export function alreadyTracked(name: string, tracked: { tool_name: string; status: string }[]): boolean {
  const n = normalizeToolName(name);
  return tracked.some((t) => t.status !== "cancelled" && normalizeToolName(t.tool_name) === n);
}

