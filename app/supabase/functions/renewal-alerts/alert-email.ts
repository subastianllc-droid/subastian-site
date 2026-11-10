// Renewal and free-trial alert email copy. Plain text first; index.ts turns it into simple HTML.
// Rules: only the dates and prices the user entered, nothing invented, no pressure language.

export type AlertItem = {
  tool: string;
  category?: string;
  kind: "renewal" | "trial";
  stage: number; // days until the date: 30, 7, 3, 1 or 0 (or one less, sent a day late after a missed run)
  date: string; // YYYY-MM-DD
  monthly_cost: number | string | null;
};

export type AlertMail = { subject: string; lines: string[] };

export const STAGES = [30, 7, 3, 1, 0] as const;

function hello(name: string | null | undefined) {
  const first = (name ?? "").trim().split(/\s+/)[0] ?? "";
  return /^[\p{L}'\-]{1,40}$/u.test(first) ? `Hi ${first},` : "Hi there,";
}

function when(stage: number) {
  if (stage === 0) return "today";
  if (stage === 1) return "tomorrow";
  return `in ${stage} days`;
}

export function shortDate(iso: string) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function cost(c: AlertItem["monthly_cost"]): number | null {
  const n = typeof c === "string" ? Number(c) : c;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
}

function usd(n: number) {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: n % 1 ? 2 : 0,
    maximumFractionDigits: 2,
  });
}

/** Tool names are typed by users: keep them on one line and a sane length. */
function name(tool: string) {
  const t = tool.replace(/[\r\n\t]+/g, " ").trim().slice(0, 80);
  return t || "A tool";
}

function line(i: AlertItem) {
  const c = cost(i.monthly_cost);
  const on = `${when(i.stage)} (${shortDate(i.date)})`;
  if (i.kind === "trial") {
    const after = c ? ` After that it's ${usd(c)}/mo unless you cancel.` : "";
    return `- ${name(i.tool)}: free trial ends ${on}.${after}`;
  }
  return `- ${name(i.tool)}: renews ${on}.${c ? ` ${usd(c)}/mo.` : ""}`;
}

function phrase(i: AlertItem) {
  return i.kind === "trial"
    ? `Your ${name(i.tool)} free trial ends ${when(i.stage)}`
    : `${name(i.tool)} renews ${when(i.stage)}`;
}

export function buildAlertEmail(input: { fullName?: string | null; items: AlertItem[]; appUrl?: string | null }): AlertMail {
  const items = [...input.items].sort((a, b) => a.stage - b.stage || a.tool.localeCompare(b.tool));
  if (items.length === 0) throw new Error("no alert items");
  const first = items[0];
  const subject =
    items.length === 1
      ? phrase(first)
      : `${phrase(first)}, plus ${items.length - 1} more ${items.length === 2 ? "reminder" : "reminders"}`;

  const hasTrial = items.some((i) => i.kind === "trial");
  const hasRenewal = items.some((i) => i.kind === "renewal");
  const renewsToday = items.some((i) => i.kind === "renewal" && i.stage === 0);
  const appUrl = input.appUrl && /^https:\/\/\S+$/.test(input.appUrl) ? input.appUrl.replace(/\/+$/, "") : null;

  const lines = [
    hello(input.fullName),
    "",
    items.length === 1 ? "A reminder about one of your subscriptions:" : "Here's what's coming up in your subscriptions:",
    "",
    ...items.map(line),
    "",
  ];
  if (hasTrial) {
    lines.push(
      "Free trial ending: if you're not keeping it, cancel with the vendor before the trial ends. If you are keeping it, click \"Keep it\" on the trial in Subastian so its renewals are tracked.",
      "",
    );
  }
  if (hasRenewal) {
    lines.push(
      "Renewing: still using it? There's nothing to do. If not, cancel or downgrade with the vendor before the renewal date.",
      "",
    );
  }
  if (renewsToday) {
    lines.push("The day after it renews, Subastian moves it to the next billing date on its own, so your next reminders line up.", "");
  }
  if (appUrl) lines.push(`Open Subastian: ${appUrl}`, "");
  lines.push(
    "These dates and prices are the ones you entered. Subastian doesn't see your card or cancel anything for you.",
    "",
    "Subastian",
  );
  return { subject, lines };
}
