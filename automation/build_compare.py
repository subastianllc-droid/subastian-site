#!/usr/bin/env python3
"""Builds /compare/ : Subastian vs SpendHound, Cledara, Zylo, Torii and a spreadsheet.

Every statement about another company comes from that company's own website, read on CHECKED.
Only say what each tool is built for and how it works; never claim a rival lacks a feature
unless its own site says so. Re-check before changing anything: python3 automation/build_compare.py
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_stacks import CSS, HEAD, FOOT, FORM_JS, e  # same look as the stack pages

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHECKED = "2026-10-19"
CHECKED_LONG = "October 19, 2026"

ROWS = [
    {
        "name": "A spreadsheet",
        "for": "Anyone",
        "data": "You type in every subscription yourself",
        "price": "Free",
        "note": "Totals are easy. Reminders and overlap checks only exist if you build them.",
        "src": None,
    },
    {
        "name": "SpendHound",
        "for": "Finance, operations, procurement and IT teams",
        "data": "Syncs your ERP or billing systems (it names NetSuite, QuickBooks and Brex) and your SSO for usage",
        "price": "“100% free” per its homepage, paid for with de-identified data",
        "note": "Also has purchase approvals and intake for new vendors, plus 30/60/90-day renewal alerts.",
        "src": "https://www.spendhound.com/",
    },
    {
        "name": "Cledara",
        "for": "Companies of roughly 25+ staff (Basic is described for 25–50)",
        "data": "Software is paid through Cledara virtual cards; Xero and QuickBooks integrations",
        "price": "Basic is free if you pay 10 apps through its cards in the first month, otherwise £100/month. Higher plans by demo",
        "note": "Approval workflows on Premium and up. Duplicate-tool alerts are in a £150/month add-on.",
        "src": "https://www.cledara.com/pricing",
    },
    {
        "name": "Zylo",
        "for": "Enterprises (it calls itself an enterprise SaaS spend management platform)",
        "data": "A guided implementation project",
        "price": "Not listed",
        "note": "Its own guide says most implementations run 8–14 weeks from kickoff to go-live.",
        "src": "https://zylo.com/blog/zylo-implementation",
    },
    {
        "name": "Torii",
        "for": "Mid-market companies of 100–1,000 employees (IT, finance, security, HR)",
        "data": "App discovery, including a Chrome extension, plus finance feeds",
        "price": "Custom, quote-based",
        "note": "Strong on IT automation like onboarding and offboarding.",
        "src": "https://www.toriihq.com/articles/saas-management",
    },
    {
        "name": "Subastian (in development)",
        "for": "Solo operators, affiliate marketers and small agencies",
        "data": "You list your tools; no ERP, SSO or company card needed",
        "price": "Planned $49 / $99 / $299 a month, 14-day trial, 60-day refund",
        "note": "Purchase Guard checks a new tool against what you already pay for when you add it (working in the early build).",
        "src": None,
        "us": True,
    },
]


def build():
    path = "/compare/"
    title = "SpendHound, Cledara, Zylo & Torii Alternative for Small Agencies | Subastian"
    desc = ("How Subastian compares with SpendHound, Cledara, Zylo, Torii and a spreadsheet: who each is built for, "
            "how it gets your data and what it costs, checked on each company's own site.")
    ld = json.dumps({"@context": "https://schema.org", "@type": "WebPage", "name": title, "description": desc,
                     "url": "https://subastian.us/compare/", "dateModified": CHECKED}, ensure_ascii=False)
    rows = "".join(
        f'<tr{" class=us" if r.get("us") else ""}><td class="tool"><b>{e(r["name"])}</b></td><td>{e(r["for"])}</td>'
        f'<td>{e(r["data"])}</td><td class="price">{e(r["price"])}</td><td>{e(r["note"])}</td></tr>'
        for r in ROWS)
    sources = "".join(f'<li>{e(r["name"])}: <a href="{r["src"]}" rel="nofollow noopener">{e(r["src"])}</a></li>'
                      for r in ROWS if r["src"])
    out = HEAD.format(title=e(title), desc=e(desc), path=path, css=CSS + COMPARE_CSS, ld=ld)
    out = out.replace('<a href="/stacks/" class="btn-ghost">All tool stacks</a>', '<a href="/" class="btn-ghost">&larr; Back to home</a>')
    out += f"""
<p class="crumbs"><a href="/">Subastian</a> / Compare</p>
<p class="eyebrow">Compare</p>
<h1>Subastian vs SpendHound, Cledara, Zylo, Torii and a spreadsheet</h1>
<p class="lead">Most subscription and SaaS spend tools are built for companies with a finance team, an accounting system and company cards. Subastian is being built for the people who don't have those: solo operators, affiliate marketers and small agencies running a lot of tools.</p>
<span class="checked"><i aria-hidden="true"></i>Checked {CHECKED_LONG} on each company's own website</span>

<h2>Who each one is built for</h2>
<div class="table-wrap" role="region" aria-label="Comparison table" tabindex="0">
<table>
<thead><tr><th scope="col">Tool</th><th scope="col">Built for</th><th scope="col">How it gets your data</th><th scope="col">Price</th><th scope="col">Worth knowing</th></tr></thead>
<tbody>{rows}</tbody>
</table>
</div>

<h2>Which one should you pick?</h2>
<ul class="cuts">
  <li><b>You have a finance team and an ERP or accounting system.</b><span>SpendHound, Cledara, Zylo and Torii are built for you. SpendHound is free; Zylo and Torii suit larger companies with IT teams.</span></li>
  <li><b>You're one person or a small team, and the card is yours.</b><span>That's who Subastian is for. There are no integrations to set up. In the early build you list what you pay for, and it groups tools by stack, flags overlap and unused tools, and checks a new tool against your list before you add it.</span></li>
  <li><b>You run an agency and buy tools per client.</b><span>Subastian's Agency Maestro plan is planned around per-client stacks, so a tool bought for a client who has left shows up as a leak.</span></li>
  <li><b>You only need a list today.</b><span>A spreadsheet is fine, and the $9 <a href="https://subastian.gumroad.com/l/subscription-audit-kit?wanted=true" data-kit-buy="compare">Subscription Audit Kit</a> gives you one with the overlap, idle and renewal flags already built in.</span></li>
</ul>

<section class="cta" aria-labelledby="cta-h">
  <h2 id="cta-h">See what your subscriptions may be leaking</h2>
  <p>Subastian isn't live yet. Take the free 60-second Leak Test, or join the free Founding Roster for early access and the launch rate.</p>
  <p style="margin:14px 0 0"><a href="/leak-test/?src=compare" style="display:inline-block;background:var(--accent-fill);color:#fff;border-radius:8px;padding:12px 18px;font-weight:600;text-decoration:none">Take the free Leak Test</a></p>
  <form id="stackForm" data-form="compare" data-work="" novalidate style="margin-top:16px">
    <label for="sf-email" class="hp">Email</label>
    <input id="sf-email" name="email" type="email" autocomplete="email" inputmode="email" placeholder="you@example.com" aria-label="Email" required>
    <div class="hp" aria-hidden="true"><input name="hp_trap" type="text" tabindex="-1" autocomplete="off"></div>
    <button type="submit">Join the Founding Roster</button>
  </form>
  <p class="hint">Free. No card. Unsubscribe anytime. <a href="/privacy/">Privacy</a>.</p>
  <p class="msg" id="stackMsg" role="status" aria-live="polite"></p>
</section>

<h2>Sources</h2>
<p>Everything above about other companies comes from their own websites on {CHECKED_LONG}. Plans and prices change, so check before you choose. Subastian has no relationship with any company listed.</p>
<ul class="sources">{sources}</ul>
"""
    out += FOOT.replace("</body>", FORM_JS.replace("form.getAttribute('data-work')", "(form.getAttribute('data-work') || null)") + "</body>")
    out = out.replace('<script src="/roster.js" defer></script>', '<script src="/roster.js" defer></script>\n<script src="/kit-checkout.js" defer></script>')
    os.makedirs(os.path.join(ROOT, "compare"), exist_ok=True)
    with open(os.path.join(ROOT, "compare", "index.html"), "w") as f:
        f.write(out)
    print("compare/index.html")


COMPARE_CSS = """
  tr.us td{background:var(--accent-tint);} tr.us td.tool b{color:var(--accent-strong);}
  table{min-width:820px;}
"""

if __name__ == "__main__":
    build()
