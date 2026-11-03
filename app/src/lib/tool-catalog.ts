import type { Category } from "./subscriptions.ts";
import { normalizeToolName } from "./purchase-guard.ts";
import type { NicheData } from "./niche-stacks.ts";

/**
 * Common tools, so the Add form can fill in the category as you type, and the statement import can
 * name a charge like "ADOBE *CREATIVE CLD" as "Adobe Creative Cloud".
 *
 * Only names and categories live here. Prices and trial lengths come solely from the hand-checked
 * Niche Stacks data (vendor's own page, dated); everything else the user enters.
 * `match` holds extra words seen in card-statement descriptions for that tool.
 */
export type CatalogTool = { name: string; category: Category; match?: string[] };

export const CATALOG: CatalogTool[] = [
  { name: "Adobe Creative Cloud", category: "Design", match: ["adobe"] },
  { name: "Ahrefs", category: "SEO" },
  { name: "Airtable", category: "Project management" },
  { name: "Asana", category: "Project management" },
  { name: "Auphonic", category: "Other" },
  { name: "AgencyAnalytics", category: "Analytics" },
  { name: "Bluehost", category: "Hosting & domains" },
  { name: "Buffer", category: "Social scheduling" },
  { name: "Buzzsprout", category: "Hosting & domains" },
  { name: "Calendly", category: "Other" },
  { name: "Canva", category: "Design" },
  { name: "Capcut", category: "Video" },
  { name: "ChatGPT", category: "AI tools", match: ["openai", "chatgpt"] },
  { name: "Claude", category: "AI tools", match: ["anthropic"] },
  { name: "ClickFunnels", category: "Funnels & landing pages" },
  { name: "ClickUp", category: "Project management" },
  { name: "Cloudflare", category: "Hosting & domains" },
  { name: "Descript", category: "Video" },
  { name: "Dropbox", category: "Cloud storage" },
  { name: "ElevenLabs", category: "AI tools" },
  { name: "Figma", category: "Design" },
  { name: "Framer", category: "Funnels & landing pages" },
  { name: "GetResponse", category: "Email marketing" },
  { name: "GitHub", category: "Other" },
  { name: "GoDaddy", category: "Hosting & domains" },
  { name: "Google Workspace", category: "Communication", match: ["gsuite", "workspace"] },
  { name: "Google One", category: "Cloud storage" },
  { name: "Grammarly", category: "AI tools" },
  { name: "Hostinger", category: "Hosting & domains" },
  { name: "HubSpot", category: "CRM" },
  { name: "Hootsuite", category: "Social scheduling" },
  { name: "iCloud+", category: "Cloud storage", match: ["icloud"] },
  { name: "Jasper", category: "AI tools" },
  { name: "Kajabi", category: "Funnels & landing pages" },
  { name: "Kit", category: "Email marketing", match: ["convertkit"] },
  { name: "Later", category: "Social scheduling" },
  { name: "Leadpages", category: "Funnels & landing pages" },
  { name: "Loom", category: "Video" },
  { name: "Mailchimp", category: "Email marketing", match: ["intuit mailchimp", "mailchimp"] },
  { name: "Make", category: "Automation", match: ["integromat"] },
  { name: "Metricool", category: "Social scheduling" },
  { name: "Microsoft 365", category: "Communication", match: ["microsoft", "msft"] },
  { name: "Midjourney", category: "AI tools" },
  { name: "Monday.com", category: "Project management", match: ["monday"] },
  { name: "Namecheap", category: "Hosting & domains" },
  { name: "Notion", category: "Project management" },
  { name: "Perplexity", category: "AI tools" },
  { name: "Pipedrive", category: "CRM" },
  { name: "Pretty Links", category: "Other", match: ["prettylinks"] },
  { name: "Riverside", category: "Video" },
  { name: "Screaming Frog", category: "SEO" },
  { name: "Semrush", category: "SEO" },
  { name: "Shopify", category: "Funnels & landing pages" },
  { name: "SiteGround", category: "Hosting & domains" },
  { name: "Slack", category: "Communication" },
  { name: "Squarespace", category: "Funnels & landing pages" },
  { name: "Surfer", category: "SEO", match: ["surferseo"] },
  { name: "Systeme.io", category: "Funnels & landing pages", match: ["systeme"] },
  { name: "Trello", category: "Project management" },
  { name: "TubeBuddy", category: "SEO" },
  { name: "Vercel", category: "Hosting & domains" },
  { name: "vidIQ", category: "SEO" },
  { name: "Webflow", category: "Funnels & landing pages" },
  { name: "Wix", category: "Funnels & landing pages" },
  { name: "WP Engine", category: "Hosting & domains", match: ["wpengine"] },
  { name: "Zapier", category: "Automation" },
  { name: "Zoom", category: "Communication" },
];

/** The catalog entry for a typed or statement name, if any. Exact (normalized) match only. */
export function findCatalogTool(name: string): CatalogTool | null {
  const n = normalizeToolName(name);
  if (!n) return null;
  return CATALOG.find((t) => normalizeToolName(t.name) === n) ?? null;
}

/** Suggestions while typing: names that start with what's typed, then names containing it. */
export function suggestTools(typed: string, limit = 6): CatalogTool[] {
  const q = typed.trim().toLowerCase();
  if (q.length < 2) return [];
  const starts = CATALOG.filter((t) => t.name.toLowerCase().startsWith(q));
  const contains = CATALOG.filter((t) => !starts.includes(t) && t.name.toLowerCase().includes(q));
  return [...starts, ...contains].slice(0, limit);
}

export type PriceHint = { monthly_cost: number; trial_days: number; plan: string; price_text: string; src: string; checked_long: string };

/**
 * A checked price for this tool from the Niche Stacks data (vendor's own page, dated), when the
 * typed name matches one of those plans ("Semrush Pro", or just "Semrush" when only one plan is listed).
 */
export function priceHint(name: string, data: NicheData): PriceHint | null {
  const n = normalizeToolName(name);
  if (!n) return null;
  const plans = new Map<string, PriceHint>();
  for (const s of data.stacks) {
    for (const t of s.tools) {
      if (t.unit) continue; // per-client / per-seat totals aren't a single price
      const hint = { monthly_cost: t.monthly_cost, trial_days: t.trial_days, plan: t.name, price_text: t.price_text, src: t.src, checked_long: data.checked_long };
      plans.set(t.name, hint);
    }
  }
  const all = [...plans.values()];
  const brandOf = (plan: string) => plan.toLowerCase().split(/\s+/)[0].replace(/[^a-z0-9]/g, "");
  const typed = name.trim().toLowerCase().replace(/\s+/g, " ");
  const brand = all.filter((p) => brandOf(p.plan) === n || normalizeToolName(p.plan) === n || brandOf(p.plan) === brandOf(typed));
  const samePrice = brand.length > 0 && brand.every((p) => p.monthly_cost === brand[0].monthly_cost);
  // A named plan ("Semrush Pro", "Canva Pro"). A bare brand that is also a plan name ("Canva") is
  // ambiguous when the brand's plans cost different amounts.
  const exact = all.find((p) => p.plan.toLowerCase().replace(/\s+/g, " ") === typed);
  if (exact && (exact.plan.trim().includes(" ") || samePrice)) return exact;
  // Brand typed ("Riverside"): only when every listed plan of that brand costs the same.
  if (!exact && brand.length && samePrice && brand.every((p) => brandOf(p.plan) === n)) return brand[0];
  return null;
}
