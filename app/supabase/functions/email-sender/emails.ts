// Subastian email copy. Plain text first; the sender turns it into simple HTML.
// Rules: no invented numbers, no countdown pressure, nothing we can't deliver.

export const SITE = "https://subastian.us";

export type Kind =
  | "roster_welcome"
  | "roster_day2"
  | "roster_day5"
  | "partner_kit"
  | "kit_followup"
  | "referral_reward"
  | "broadcast";

export type Mail = { subject: string; lines: string[]; footerWhy: string };

export type Fix = { title: string; step: string };
export type LeakReport = {
  score: number;
  band: string;
  monthly: number;
  yearly: number;
  leaks: number;
  avg: number;
  fixes: Fix[];
};

export type Ctx = {
  first: string | null;
  workType?: string | null;
  report?: LeakReport | null;
  referralCode?: string | null;
  kitBuyer?: boolean;
  referralKitUrl?: string | null;
  broadcast?: { subject: string; body: string } | null;
};

const ROSTER_WHY = "you joined the Subastian founding roster at subastian.us";
const SIGN = ["Thanks,", "Daniel", "Founder, Subastian"];

function hello(first: string | null) {
  const name = first && /^[\p{L}'\-]{1,40}$/u.test(first) ? first : "there";
  return `Hi ${name},`;
}

function usd(n: number) {
  return "$" + Math.round(n).toLocaleString("en-US");
}

/** Accepts only a well-formed report; anything else is treated as "no report". */
export function cleanReport(r: unknown): LeakReport | null {
  if (!r || typeof r !== "object") return null;
  const o = r as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 1e7 ? v : null);
  const score = num(o.score), monthly = num(o.monthly), yearly = num(o.yearly);
  if (score === null || score > 100 || monthly === null || yearly === null) return null;
  const band = typeof o.band === "string" && o.band.length <= 30 ? o.band : "";
  const fixes = Array.isArray(o.fixes)
    ? (o.fixes as unknown[])
        .filter((f): f is Fix => !!f && typeof (f as Fix).title === "string" && typeof (f as Fix).step === "string")
        .slice(0, 4)
        .map((f) => ({ title: f.title.slice(0, 120), step: f.step.slice(0, 300) }))
    : [];
  return { score, band, monthly, yearly, leaks: num(o.leaks) ?? 0, avg: num(o.avg) ?? 0, fixes };
}

function shareBlock(code: string | null | undefined): string[] {
  if (!code || !/^[a-z0-9]{8}$/.test(code)) return [];
  return [
    "",
    "Your share link (3 people join through it and the $9 Audit Kit is yours free):",
    `${SITE}/?r=${code}`,
  ];
}

/* ------------------------------ Day 2 by segment ------------------------------ */

const DAY2: Record<string, { subject: string; body: string[] }> = {
  agency: {
    subject: "The agency leak nobody budgets for",
    body: [
      "For agencies, the leak usually isn't one big tool. It's per-client tool creep.",
      "",
      "A client needs a reporting dashboard, a scheduling seat or an extra workspace, so you add one. The project ends. The seat doesn't. Nobody owns cancelling it, because the person who set it up has moved on to the next client.",
      "",
      "A 10-minute check:",
      "1. Open your billing page in each tool you pay per seat or per workspace for.",
      "2. Next to every seat or workspace, write the client it's for.",
      "3. Anything tied to a client you no longer work with gets cancelled or downgraded today.",
      "",
      "That's also exactly why Subastian groups tools by stack and flags anything that's gone quiet.",
    ],
  },
  affiliate: {
    subject: "The trial-to-renewal trap",
    body: [
      "If you're in affiliate marketing, the leak usually starts with a free trial.",
      "",
      "You test a tool to review it or to see if it's worth promoting. The trial ends on a Tuesday you're busy. It quietly becomes a monthly plan, and some of those plans offer a discount for switching to annual that's easy to click.",
      "",
      "Two habits that help:",
      "1. The minute you start a trial, put a reminder 2 days before it ends, not on the end date itself, in case it charges early that day.",
      "2. Before you click \"save with annual\", check the last 30 days. If you didn't open it weekly, stay monthly or cancel.",
      "",
      "Catching trials before they charge is the first thing I built into Subastian.",
    ],
  },
  creator: {
    subject: "Two tools, one job",
    body: [
      "For creators, the leak is usually overlap.",
      "",
      "An editor with built-in captions, plus a separate captions tool. A scheduler, plus the scheduler that came bundled in your design app. Stock music in two places. Each one was added for a good reason, and each one is small, so nobody notices the doubles.",
      "",
      "A 10-minute check:",
      "1. List every tool you pay for, with one line on the job it does.",
      "2. Wherever two lines describe the same job, keep the one you open most.",
      "3. Before you buy the next tool, check that list first.",
      "",
      "That last step is what Subastian's Purchase Guard does for you: it warns you before you pay for a job you already cover.",
    ],
  },
  default: {
    subject: "The renewal that's easiest to miss",
    body: [
      "The subscription that's easiest to forget is usually the annual one.",
      "",
      "Monthly charges show up every month, so you notice them. An annual plan charges once, then disappears from view for a year, and renews before you remember why you bought it.",
      "",
      "A 10-minute fix:",
      "1. Search your email for \"annual\", \"renews\" and \"your subscription\".",
      "2. For each annual plan, put a reminder 7 days before its renewal date.",
      "3. When the reminder fires, ask one question: did I use this in the last 30 days?",
      "",
      "Subastian's 5-stage renewal alerts are being built to send those reminders for you, at 30, 7, 3 and 1 days out and on the day.",
    ],
  },
};

/* --------------------------------- the emails --------------------------------- */

export function buildEmail(kind: Kind, c: Ctx): Mail {
  switch (kind) {
    case "roster_welcome": {
      const r = c.report;
      if (r) {
        const lines = [
          hello(c.first),
          "",
          "Here's your full Subscription Leak Report, as promised.",
          "",
          `Leak Score: ${r.score}/100${r.band ? ` (${r.band})` : ""}`,
          r.monthly > 0
            ? `Estimated leak: about ${usd(r.monthly)} a month, ${usd(r.yearly)} a year.`
            : "Estimated leak: nothing obvious from your answers.",
          r.monthly > 0 && r.leaks > 0
            ? `That's roughly ${r.leaks} ${r.leaks === 1 ? "subscription" : "subscriptions"} you may not be getting value from, at about ${usd(r.avg)} each.`
            : "",
          "This is an estimate built only from your answers. Your real number depends on what you actually pay for.",
          "",
          "Every leak in your answers, biggest first:",
          ...r.fixes.map((f, i) => `${i + 1}. ${f.title}. ${f.step}`),
          "",
          `If you saved or printed your 14-day Fix-It Plan, start with Days 1 to 2. Closed the page? Retake the test (about a minute) to get it back: ${SITE}/leak-test/?src=day0email`,
          ...shareBlock(c.referralCode),
          "",
          "One question, and a one-line answer is plenty: which subscription do you regret paying for most? Just hit reply. I read every answer.",
          "",
          ...SIGN,
        ].filter((l, i, a) => !(l === "" && a[i - 1] === ""));
        return { subject: `Your Subscription Leak Report: ${r.score}/100`, footerWhy: ROSTER_WHY, lines };
      }
      return {
        subject: "You're on the Subastian founding roster",
        footerWhy: ROSTER_WHY,
        lines: [
          hello(c.first),
          "",
          "Thanks for joining the Subastian founding roster. You're in.",
          "",
          `Your free bonus is ready: the Free Trial Tracker and the Cancel & Refund Scripts. ${SITE}/bonus/`,
          "",
          `If you haven't yet, the 60-second Leak Test gives you a score and a rough estimate of what your subscriptions may be wasting: ${SITE}/leak-test/?src=day0email`,
          ...shareBlock(c.referralCode),
          "",
          "What happens next: Subastian is still in development. On launch day you'll get a private checkout link that keeps the launch rate on any plan for as long as you stay subscribed.",
          "",
          "One question, and a one-line answer is plenty: which subscription do you regret paying for most? Just hit reply. I read every answer.",
          "",
          ...SIGN,
        ],
      };
    }

    case "roster_day2": {
      const seg = DAY2[c.workType ?? ""] ?? DAY2.default;
      return {
        subject: seg.subject,
        footerWhy: ROSTER_WHY,
        lines: [
          hello(c.first),
          "",
          ...seg.body,
          "",
          "If you try the check, reply and tell me what you found. I read every answer and it shapes what I build next.",
          "",
          ...SIGN,
        ],
      };
    }

    case "roster_day5":
      return {
        subject: "Fix it today instead of waiting for launch",
        footerWhy: ROSTER_WHY,
        lines: [
          hello(c.first),
          "",
          "Subastian isn't live yet. If you'd rather not wait to find your leaks, there's something you can use today.",
          "",
          "The Subscription Audit Kit is a spreadsheet and a one-page guide. You list what you pay for once, and it flags overlapping tools, subscriptions idle for 14+ days and renewals in the next 30 days, and totals your monthly and yearly spend. It takes about 15 minutes.",
          "",
          `It's $9, one time, works in Excel and Google Sheets, with a full refund within 30 days: ${SITE}/audit-kit/?src=day5email`,
          "",
          "Totally optional. You'll keep getting the Friday build updates either way.",
          ...(c.referralCode && /^[a-z0-9]{8}$/.test(c.referralCode)
            ? ["", "Or get it free: when 3 people join the roster through your share link, it's yours.", `${SITE}/?r=${c.referralCode}`]
            : []),
          "",
          ...SIGN,
        ],
      };

    case "kit_followup":
      return {
        subject: "Getting the most out of your Audit Kit",
        footerWhy: "you bought the Subastian Subscription Audit Kit",
        lines: [
          hello(c.first),
          "",
          "Thanks for buying the Subscription Audit Kit. Your files came in the Gumroad receipt. Here's the fastest way through it:",
          "",
          "1. Start with your phone's subscription settings (App Store or Google Play) and PayPal's automatic payments. They're easy to miss.",
          "2. Then scan the last two months of card statements for anything that repeats.",
          "3. Fill in a row for each. The flags show up on their own.",
          "4. Cancel what's flagged and you don't need, then put the remaining renewal dates in your calendar.",
          "",
          "Rather have it done for you? Send me your list and within 3 business days I'll send back the finished audit spreadsheet, a one-page summary of what to cut and a renewal calendar. It's a flat $49, and if I can't find any savings you get a full refund:",
          `${SITE}/audit-service/?src=kitemail`,
          "",
          "Not what you expected? Reply within 30 days of purchase for a full refund, no questions asked.",
          "",
          ...SIGN,
        ],
      };

    case "referral_reward":
      return {
        subject: "3 people joined through your link: your Audit Kit is free",
        footerWhy: ROSTER_WHY,
        lines: [
          hello(c.first),
          "",
          "Three people joined the Subastian founding roster through your share link. Thank you. As promised, the Subscription Audit Kit is yours at no charge:",
          "",
          c.referralKitUrl ?? "",
          "",
          "The link takes you to the checkout with the price already at $0. No card needed.",
          "",
          ...SIGN,
        ],
      };

    case "broadcast":
      return {
        subject: c.broadcast!.subject,
        footerWhy: ROSTER_WHY,
        lines: c.broadcast!.body.replaceAll("{{first_greeting}}", hello(c.first)).split("\n"),
      };

    case "partner_kit":
      return {
        subject: "Your Subastian Partner Launch Kit",
        footerWhy: "you applied to the Subastian Founding Partner program at subastian.us",
        lines: [
          hello(c.first),
          "",
          "Thanks for applying to be a Subastian Founding Partner. Here's your Partner Launch Kit: swipe emails, social posts and banners you can use right away.",
          "",
          `Your kit: ${SITE}/partners/kit/`,
          "(Please keep that link to yourself. It's for partners only.)",
          "",
          "The short version of the rules:",
          "- Say it's in development. Point people to the free founding roster, not to a purchase.",
          `- Always disclose, e.g. "I'm a Subastian partner and may earn a commission."`,
          "- No made-up results, user numbers or launch dates.",
          '- No paid search ads on "Subastian".',
          "",
          `Your link for now: ${SITE}/?ref=YOURNAME (use your name or brand, no spaces). Signups through it are noted as coming from you.`,
          "",
          "At launch you'll get your personal affiliate link by email. That's the one that tracks the planned 40% recurring commission on paid plans, so swap it in everywhere once you have it.",
          "",
          "Questions? Just reply. I read every email.",
          "",
          ...SIGN,
        ],
      };
  }
}

/** Placeholders like [LAUNCH DATE] mean a draft isn't finished. Never send those. */
export function hasPlaceholder(text: string) {
  return /\[[A-Z][A-Z0-9 _-]{2,}\]/.test(text);
}
