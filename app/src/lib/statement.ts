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

export type DateOrder = "mdy" | "dmy";

/**
 * Statement dates: 11/03/2026, 11/3/26, 2026-11-03, Nov 3, 2026, 03 Nov 2026, 03.11.2026.
 * `order` decides numeric dates like 03/11/2026: "mdy" (US, the default) or "dmy" (UK, EU and most others).
 * A date that's impossible one way (25/10/2026) is read the other way.
 */
export function parseDate(s: string, order: DateOrder = "mdy"): string | null {
  const t = s.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(t);
  if (m) {
    const [a, b, y] = [+m[1], +m[2], +m[3]];
    return order === "dmy" ? iso(y, b, a) ?? iso(y, a, b) : iso(y, a, b) ?? iso(y, b, a);
  }
  m = /^([A-Za-z]{3})[a-z]*\.? (\d{1,2}),? (\d{4})$/.exec(t);
  if (m && MONTHS.includes(m[1].toLowerCase())) return iso(+m[3], MONTHS.indexOf(m[1].toLowerCase()) + 1, +m[2]);
  m = /^(\d{1,2}) ([A-Za-z]{3})[a-z]* (\d{4})$/.exec(t);
  if (m && MONTHS.includes(m[2].toLowerCase())) return iso(+m[3], MONTHS.indexOf(m[2].toLowerCase()) + 1, +m[1]);
  return null;
}

/**
 * "$1,234.56" → 1234.56, "(12.00)" and "-12.00" → -12, "12.00 CR" → -12, "12.00 USD" → 12.
 * European decimals too: "14,99" → 14.99, "1.234,56" → 1234.56. ("1,234" stays one thousand two hundred thirty-four.)
 * Blank → null.
 */
export function parseAmount(s: string): number | null {
  let t = s.trim();
  if (!t) return null;
  let neg = false;
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
  if (/\bcr$/i.test(t)) { neg = true; t = t.replace(/\s*cr$/i, ""); }
  t = t.replace(/\b(usd|eur|gbp|cad|aud|nzd|chf)\b/gi, "").replace(/[$€£\s]/g, "");
  if (t.startsWith("-")) { neg = !neg; t = t.slice(1); }
  if (t.startsWith("+")) t = t.slice(1);
  if (/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(t)) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d+,\d{1,2}$/.test(t)) t = t.replace(",", ".");
  else t = t.replace(/,(?=\d{3}\b)/g, "");
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

/** A row we couldn't use, and why (row 1 is the header when there is one). */
export type SkippedRow = { row: number; reason: string; text: string };

export type StatementResult = {
  charges: Charge[];
  error?: string;
  /** Rows that weren't read, each with a plain reason. Refunds and payments aren't listed here. */
  skipped: SkippedRow[];
  /** Money coming in (refunds, payments, deposits), left out on purpose. */
  credits: number;
  /** How numeric dates like 03/10/2026 were read. */
  dateOrder: DateOrder;
  /** True when the file's dates fit both ways and nothing in it says which: ask the person. */
  dateOrderUnclear: boolean;
};

/** Month/day or day/month? Any date with a first number over 12 means day/month, and vice versa. */
function detectDateOrder(values: string[]): { order: DateOrder; unclear: boolean } {
  let dmy = false, mdy = false, ambiguous = false, dots = false;
  for (const v of values) {
    const m = /^(\d{1,2})([/.-])(\d{1,2})[/.-](\d{2,4})$/.exec(v.trim());
    if (!m) continue;
    const a = +m[1], b = +m[3];
    if (m[2] === ".") dots = true;
    if (a > 12 && b <= 12) dmy = true;
    else if (b > 12 && a <= 12) mdy = true;
    else if (a !== b) ambiguous = true;
  }
  if (dmy && !mdy) return { order: "dmy", unclear: false };
  if (mdy && !dmy) return { order: "mdy", unclear: false };
  // 15.08.2026-style dates are a European habit; slashes default to US.
  return { order: dots ? "dmy" : "mdy", unclear: ambiguous };
}

/**
 * The charges (money going out) in a statement, as positive amounts. Banks differ on signs: with one
 * amount column, whichever sign most rows have is treated as "charges" (cards list purchases as
 * positive, checking accounts as negative).
 */
export function readStatement(text: string, opts: { dateOrder?: DateOrder } = {}): StatementResult {
  const empty = { charges: [], skipped: [], credits: 0, dateOrder: "mdy" as DateOrder, dateOrderUnclear: false };
  const rows = parseCsv(text);
  if (rows.length < 2) return { ...empty, error: "That file doesn't have any rows we can read." };
  const cols = findColumns(rows);
  if (!cols) return { ...empty, error: "We couldn't find the date, description and amount columns. Try your bank's CSV download (not PDF)." };

  const body = cols.header ? rows.slice(1) : rows;
  const first = cols.header ? 2 : 1;
  const detected = detectDateOrder(body.map((r) => r[cols.date] ?? ""));
  const dateOrder = opts.dateOrder ?? detected.order;
  const dateOrderUnclear = !opts.dateOrder && detected.unclear;
  const usesDebitColumn = cols.debit !== undefined && cols.debit !== cols.amount;

  const raw: (Charge & { row: number })[] = [];
  const skipped: SkippedRow[] = [];
  let credits = 0;
  body.forEach((r, i) => {
    const row = first + i;
    const skip = (reason: string) => skipped.push({ row, reason, text: r.join(", ").slice(0, 120) });
    const rawDate = (r[cols.date] ?? "").trim();
    const date = parseDate(rawDate, dateOrder);
    const description = (r[cols.desc] ?? "").trim();
    if (!rawDate) return skip("No date");
    if (!date) return skip(`Date not recognized: "${rawDate.slice(0, 30)}"`);
    if (!description) return skip("No description");
    let amount: number | null = null;
    if (usesDebitColumn) {
      const cell = (r[cols.debit!] ?? "").trim();
      const d = parseAmount(cell);
      if (d !== null && d !== 0) amount = Math.abs(d);
      else if (!cell && cols.credit !== undefined && parseAmount(r[cols.credit] ?? "")) { credits++; return; }
      else if (!cell) return skip("No amount");
      else if (d === null) return skip(`Amount not recognized: "${cell.slice(0, 30)}"`);
      else return skip("Amount is 0");
    } else {
      const cell = (r[cols.amount!] ?? "").trim();
      amount = parseAmount(cell);
      if (!cell) return skip("No amount");
      if (amount === null) return skip(`Amount not recognized: "${cell.slice(0, 30)}"`);
      if (amount === 0) return skip("Amount is 0");
    }
    raw.push({ date, description, amount, row });
  });
  if (!raw.length) {
    return { ...empty, skipped, credits, dateOrder, dateOrderUnclear, error: "We couldn't read any charges from that file." };
  }

  const negatives = raw.filter((c) => c.amount < 0).length;
  const chargesAreNegative = !usesDebitColumn && negatives > raw.length / 2;
  const isCharge = (c: Charge) => (usesDebitColumn ? true : chargesAreNegative ? c.amount < 0 : c.amount > 0);
  credits += raw.filter((c) => !isCharge(c)).length;
  const charges = raw
    .filter(isCharge)
    .map(({ date, description, amount }) => ({ date, description, amount: Math.round(Math.abs(amount) * 100) / 100 }));
  return { charges, skipped, credits, dateOrder, dateOrderUnclear };
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

