#!/usr/bin/env python3
"""Builds the Niche Stack pages at /stacks/ from the data below.

To update prices: change the numbers here, set CHECKED to the day you checked them on each
vendor's own pricing page, and run:  python3 automation/build_stacks.py
Every price must come from the vendor's own page (the `src` link). No estimates, no third-party lists.
"""
import html
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHECKED = "2026-10-19"
CHECKED_LONG = "October 19, 2026"

# Sources: each vendor's own page, read on CHECKED.
SRC = {
    "semrush": "https://www.semrush.com/kb/1547-seo-toolkit-pricing-limits",
    "ahrefs": "https://ahrefs.com/pricing",
    "kit": "https://kit.com/pricing",
    "canva": "https://www.canva.com/pricing/",
    "chatgpt": "https://help.openai.com/en/articles/6950777-what-is-chatgpt-plus",
    "prettylinks": "https://prettylinks.com/pricing/plans/",
    "screamingfrog": "https://www.screamingfrog.co.uk/seo-spider/pricing/",
    "agencyanalytics": "https://agencyanalytics.com/pricing",
    "surfer": "https://surferseo.com/pricing/",
    "vidiq": "https://vidiq.com/compare/vidiq-vs-tubebuddy/",
    "tubebuddy": "https://www.tubebuddy.com/blog/vidiq-vs-tubebuddy/",
    "elevenlabs": "https://elevenlabs.io/pricing",
    "descript": "https://www.descript.com/pricing",
    "riverside": "https://riverside.com/pricing",
    "buzzsprout": "https://www.buzzsprout.com/pricing",
    "auphonic": "https://auphonic.com/pricing",
    "metricool": "https://metricool.com/metricool-premium/",
    "later": "https://later.com/pricing/",
    "buffer": "https://buffer.com/resources/buffer-vs-later/",
}

# monthly = what it adds per month in the lean stack (yearly prices divided by 12). None = not in the lean stack.
STACKS = [
    {
        "slug": "affiliate-marketing",
        "niche": "Affiliate Marketing",
        "work_type": "affiliate",
        "who": "affiliate marketers running a content or review site",
        "intro": "A typical affiliate site needs five jobs covered: keyword research, an email list, link tracking, graphics and a writing assistant. Here's what each tool costs, which ones do the same job, and the leanest version of the stack.",
        "tools": [
            {"name": "Ahrefs Lite", "job": "Keyword and backlink research", "price": "$129/mo, billed monthly", "monthly": 129, "free": "No trial. Ahrefs Free gives limited Site Explorer and Site Audit.", "src": "ahrefs", "overlap": "Semrush Pro"},
            {"name": "Semrush Pro", "job": "Keyword and competitor research", "price": "$139.95/mo", "monthly": None, "free": "7-day free trial", "src": "semrush", "overlap": "Ahrefs Lite"},
            {"name": "Kit (formerly ConvertKit)", "job": "Email list and automations", "price": "Free up to 1,000 subscribers. Creator $390/yr", "monthly": 0, "free": "Free plan. 14-day trial on paid plans.", "src": "kit"},
            {"name": "Pretty Links Beginner", "job": "Cloak and track affiliate links (WordPress)", "price": "$99.60/yr first year, renews at full price ($249/yr)", "monthly": 8.30, "free": "14-day money-back guarantee", "src": "prettylinks"},
            {"name": "Canva", "job": "Graphics, pins and thumbnails", "price": "Free. Pro $144/yr", "monthly": 0, "free": "Free plan", "src": "canva"},
            {"name": "ChatGPT Plus", "job": "Outlines and first drafts", "price": "$20/mo, billed monthly", "monthly": 20, "free": "Free plan", "src": "chatgpt"},
        ],
        "cuts": [
            ("Semrush and Ahrefs do the same core job.", "Both are keyword and backlink research suites. Paying for both adds $139.95 a month for one job. Keep the one you open most; use Semrush's 7-day trial to compare before you commit, since Ahrefs has no trial."),
            ("Start Kit on the free plan.", "Kit is free up to 1,000 subscribers, so an early list doesn't need the $390/yr Creator plan yet."),
            ("Watch the Pretty Links renewal.", "The $99.60 price is first-year only. It renews at $249/yr, which is about $20.75 a month from year two."),
        ],
        "lean_note": "Ahrefs Lite, Kit free plan, Pretty Links (year one), Canva free plan and ChatGPT Plus.",
    },
    {
        "slug": "seo-agency",
        "niche": "SEO Agency",
        "work_type": "agency",
        "who": "SEO agencies and freelancers with around 10 clients",
        "intro": "An SEO agency stack covers research and rank tracking, technical crawls, client reporting, content optimization and design. Reporting is usually priced per client, so the numbers below assume 10 clients and 2 team members.",
        "tools": [
            {"name": "Semrush Guru", "job": "Research, rank tracking, site audits", "price": "$249.95/mo", "monthly": 249.95, "free": "7-day free trial", "src": "semrush", "overlap": "Ahrefs Standard"},
            {"name": "Ahrefs Standard", "job": "Research, backlinks, site audits", "price": "$249/mo, billed monthly", "monthly": None, "free": "No trial. Ahrefs Free gives limited access.", "src": "ahrefs", "overlap": "Semrush Guru"},
            {"name": "Screaming Frog SEO Spider", "job": "Technical site crawls", "price": "$279/yr per user", "monthly": 23.25, "free": "Free version up to 500 URLs", "src": "screamingfrog"},
            {"name": "AgencyAnalytics Core", "job": "Client reporting dashboards", "price": "$20 per client per month, billed annually", "monthly": 200, "free": "14-day free trial, no card", "src": "agencyanalytics", "unit": "10 clients"},
            {"name": "Surfer Standard", "job": "Content optimization", "price": "$99/mo, billed yearly", "monthly": 99, "free": "Trial terms not listed", "src": "surfer"},
            {"name": "Canva Business", "job": "Report covers, client graphics", "price": "$250/yr per person", "monthly": 41.67, "free": "Free plan", "src": "canva", "unit": "2 people"},
        ],
        "cuts": [
            ("Semrush Guru and Ahrefs Standard overlap almost entirely.", "Both handle keyword research, backlinks, rank tracking and site audits. Running both adds about $249 a month. Pick one as the agency's source of truth."),
            ("Check whether you need a separate crawler.", "Semrush and Ahrefs both include site audits. Screaming Frog is cheap at $279 a year, but if nobody runs deep crawls, the free 500-URL version may be enough."),
            ("Reporting grows with every client.", "AgencyAnalytics is $20 per client per month. Remove a client from it the day the contract ends. Finished clients left on per-seat tools are the classic agency leak."),
        ],
        "lean_note": "Semrush Guru, Screaming Frog, AgencyAnalytics for 10 clients, Surfer Standard and Canva Business for 2 people.",
    },
    {
        "slug": "youtube-automation",
        "niche": "YouTube Automation",
        "work_type": "creator",
        "who": "faceless and automation-style YouTube channels",
        "intro": "A YouTube automation channel usually pays for channel research, AI voiceover, editing, thumbnails and script help. Two of those jobs are covered twice in most stacks.",
        "tools": [
            {"name": "TubeBuddy Pro", "job": "Keyword research and channel tools", "price": "$144/yr ($12/mo billed annually)", "monthly": 12, "free": "Free plan", "src": "tubebuddy", "overlap": "vidIQ Boost"},
            {"name": "vidIQ Boost", "job": "Keyword research and channel tools", "price": "$19/mo, billed monthly", "monthly": None, "free": "Free plan", "src": "vidiq", "overlap": "TubeBuddy Pro"},
            {"name": "ElevenLabs Creator", "job": "AI voiceover", "price": "$22/mo ($11 the first month)", "monthly": 22, "free": "Free plan. Starter is $6/mo.", "src": "elevenlabs", "overlap": "Descript text-to-speech"},
            {"name": "Descript Creator", "job": "Editing, captions, text-to-speech", "price": "$35/mo billed monthly, or $24/mo billed annually", "monthly": 35, "free": "Free plan", "src": "descript", "overlap": "ElevenLabs (voice)"},
            {"name": "Canva Pro", "job": "Thumbnails", "price": "$144/yr", "monthly": 12, "free": "Free plan", "src": "canva"},
            {"name": "ChatGPT Plus", "job": "Scripts and outlines", "price": "$20/mo, billed monthly", "monthly": 20, "free": "Free plan", "src": "chatgpt"},
        ],
        "cuts": [
            ("vidIQ and TubeBuddy do the same job.", "Both are YouTube keyword and channel tools, and both have free plans. Paying for both adds $19 a month or more. Keep one."),
            ("Descript already has text-to-speech.", "Descript Creator includes text-to-speech, so check whether its voices are good enough for your channel before paying $22 a month for ElevenLabs as well."),
            ("Pay yearly only for what you'll keep.", "Descript is $24/mo billed annually versus $35 monthly. That only saves money if the channel is still running in 12 months."),
        ],
        "lean_note": "TubeBuddy Pro (yearly), ElevenLabs Creator, Descript Creator (monthly), Canva Pro and ChatGPT Plus.",
    },
    {
        "slug": "podcast-production",
        "niche": "Podcast Production",
        "work_type": "creator",
        "who": "independent podcasters and small podcast teams",
        "intro": "A podcast stack covers recording, editing and transcription, hosting, audio cleanup and cover art. Recording and editing tools now overlap heavily, which is where most podcast budgets double up.",
        "tools": [
            {"name": "Riverside Pro", "job": "Remote recording, text-based editing, transcription", "price": "$29/mo billed monthly, or $24/mo billed yearly", "monthly": 29, "free": "Free plan (2 hours). 14-day trial.", "src": "riverside", "overlap": "Descript Creator"},
            {"name": "Descript Creator", "job": "Editing, transcription, remote recording", "price": "$35/mo billed monthly, or $24/mo billed annually", "monthly": None, "free": "Free plan", "src": "descript", "overlap": "Riverside Pro"},
            {"name": "Buzzsprout Audio", "job": "Podcast hosting", "price": "$15/mo, billed annually", "monthly": 15, "free": "Free plan: 2 hours a month, episodes hosted 90 days", "src": "buzzsprout"},
            {"name": "Auphonic", "job": "Audio leveling and cleanup", "price": "Free for 2 hours of audio a month", "monthly": 0, "free": "Free plan", "src": "auphonic"},
            {"name": "Canva", "job": "Cover art and episode graphics", "price": "Free. Pro $144/yr", "monthly": 0, "free": "Free plan", "src": "canva"},
        ],
        "cuts": [
            ("Riverside and Descript overlap.", "Riverside Pro includes text-based editing and unlimited transcription. Descript Creator includes remote recording and transcription. Paying for both adds $35 a month for jobs one of them already does."),
            ("Auphonic's free tier covers a weekly show.", "Auphonic is free for 2 hours of processed audio a month, which covers about four 30-minute episodes."),
            ("Buzzsprout's free plan is for testing only.", "Free episodes come down after 90 days, so a show you're keeping needs a paid hosting plan."),
        ],
        "lean_note": "Riverside Pro (monthly), Buzzsprout Audio, Auphonic free and Canva free.",
    },
    {
        "slug": "social-media-agency",
        "niche": "Social Media Agency",
        "work_type": "agency",
        "who": "social media managers and small agencies running about 5 client brands",
        "intro": "A social media agency pays for scheduling and analytics, design, video editing and caption help. Scheduling is where agencies most often pay twice, because each client arrives with a favorite tool.",
        "tools": [
            {"name": "Metricool Starter", "job": "Scheduling and analytics", "price": "$20/mo for up to 5 brands, billed annually", "monthly": 20, "free": "Free plan (1 brand)", "src": "metricool", "overlap": "Later, Buffer"},
            {"name": "Later Growth", "job": "Scheduling and analytics", "price": "$37.50/mo billed yearly (2 social sets, 2 users)", "monthly": None, "free": "14-day free trial", "src": "later", "overlap": "Metricool, Buffer"},
            {"name": "Buffer Team", "job": "Scheduling", "price": "$12 per channel per month billed monthly ($10 billed yearly)", "monthly": None, "free": "Free for up to 3 channels. 14-day trial.", "src": "buffer", "overlap": "Metricool, Later"},
            {"name": "Canva Business", "job": "Post and story design", "price": "$250/yr per person", "monthly": 41.67, "free": "Free plan", "src": "canva", "unit": "2 people"},
            {"name": "Descript Creator", "job": "Short-form video edits and captions", "price": "$35/mo billed monthly, or $24/mo billed annually", "monthly": 35, "free": "Free plan", "src": "descript"},
            {"name": "ChatGPT Plus", "job": "Caption drafts", "price": "$20/mo, billed monthly", "monthly": 20, "free": "Free plan", "src": "chatgpt"},
        ],
        "cuts": [
            ("Pick one scheduler for every client.", "Metricool, Later and Buffer all schedule posts. Buffer Team for 5 brands on 3 channels each is 15 channels, or $180 a month billed monthly. Metricool Starter covers 5 brands for $20 a month billed annually."),
            ("Price per brand, not per tool.", "Metricool prices by brand count and Buffer by channel. Count both before you choose, because the cheaper tool flips as you add clients."),
            ("Remove offboarded clients the same week.", "Seats and brand slots for clients who have left keep billing until someone removes them."),
        ],
        "lean_note": "Metricool Starter, Canva Business for 2 people, Descript Creator (monthly) and ChatGPT Plus.",
    },
]

CSS = """
  :root{--bg:#F8F7FC;--bg-band:#F1EDFA;--surface:#FFFFFF;--ink:#15132A;--ink-soft:#5C5678;--ink-faint:#7A7399;--line:#E2DCF2;--accent:#6D28D9;--accent-strong:#54169E;--accent-tint:#ECE3FB;--accent-fill:#6D28D9;--money:#0E9D6E;--warn-bg:#FFF4DE;--warn-ink:#8A5300;}
  @media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#0B0A14;--bg-band:#131024;--surface:#18142C;--ink:#F2EFFA;--ink-soft:#B4ADCF;--ink-faint:#8F88AE;--line:#2B2745;--accent:#B296F5;--accent-strong:#D2C0FA;--accent-tint:#241D3E;--accent-fill:#7C4DEB;--money:#3FDDA0;--warn-bg:#33240A;--warn-ink:#F5C46B;}}
  :root[data-theme="dark"]{--bg:#0B0A14;--bg-band:#131024;--surface:#18142C;--ink:#F2EFFA;--ink-soft:#B4ADCF;--ink-faint:#8F88AE;--line:#2B2745;--accent:#B296F5;--accent-strong:#D2C0FA;--accent-tint:#241D3E;--accent-fill:#7C4DEB;--money:#3FDDA0;--warn-bg:#33240A;--warn-ink:#F5C46B;}
  *{box-sizing:border-box;} html{color-scheme:light dark;}
  body{margin:0;background:var(--bg);color:var(--ink);font-family:'Inter',system-ui,sans-serif;line-height:1.65;-webkit-font-smoothing:antialiased;}
  a{color:var(--accent);} :focus-visible{outline:2px solid var(--accent);outline-offset:3px;border-radius:4px;}
  h1,h2,h3{font-family:'Plus Jakarta Sans','Inter',sans-serif;color:var(--ink);line-height:1.15;text-wrap:balance;margin:0;}
  .wrap{max-width:900px;margin:0 auto;padding:0 28px;}
  header.topbar{display:flex;align-items:center;justify-content:space-between;gap:16px;max-width:1040px;margin:0 auto;padding:22px 28px;}
  .brand{font-family:'Plus Jakarta Sans',sans-serif;font-weight:800;font-size:18px;text-decoration:none;color:var(--ink);display:flex;align-items:center;gap:8px;}
  .brand img{width:24px;height:24px;} .brand span span{color:var(--accent);}
  .btn-ghost{color:var(--ink-soft);border:1px solid var(--line);border-radius:8px;padding:9px 16px;font-weight:600;font-size:13.5px;text-decoration:none;}
  main{padding:20px 0 80px;}
  .crumbs{font-size:13px;color:var(--ink-faint);margin:0 0 14px;} .crumbs a{color:var(--ink-faint);}
  .eyebrow{font-family:'IBM Plex Mono',monospace;font-size:11.5px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);margin:0 0 10px;}
  h1{font-size:clamp(28px,4.4vw,42px);font-weight:800;letter-spacing:-.02em;max-width:22ch;}
  h2{font-size:clamp(20px,2.6vw,24px);font-weight:700;margin:44px 0 12px;}
  p{color:var(--ink-soft);font-size:15.5px;margin:0 0 14px;max-width:68ch;}
  .lead{font-size:17px;margin-top:16px;}
  .checked{display:inline-flex;align-items:center;gap:8px;font-family:'IBM Plex Mono',monospace;font-size:12px;color:var(--ink-soft);border:1px solid var(--line);border-radius:999px;padding:5px 12px;margin-top:6px;}
  .checked i{width:7px;height:7px;border-radius:50%;background:var(--money);display:inline-block;}
  .summary{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--line);border:1px solid var(--line);border-radius:14px;overflow:hidden;margin-top:26px;}
  .summary div{background:var(--surface);padding:20px 22px;}
  .summary dt{font-family:'IBM Plex Mono',monospace;font-size:11px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-faint);margin-bottom:6px;}
  .summary dd{margin:0;font-family:'IBM Plex Mono',monospace;font-size:clamp(24px,3.4vw,30px);font-weight:600;color:var(--ink);font-variant-numeric:tabular-nums;}
  .summary dd.leak{color:var(--warn-ink);}
  .summary p{font-size:13px;margin:6px 0 0;}
  .table-wrap{overflow-x:auto;border:1px solid var(--line);border-radius:14px;background:var(--surface);}
  table{border-collapse:collapse;width:100%;min-width:680px;font-size:14px;}
  th,td{text-align:left;padding:12px 14px;border-bottom:1px solid var(--line);vertical-align:top;}
  th{font-size:11px;font-family:'IBM Plex Mono',monospace;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-faint);background:var(--bg-band);}
  tr:last-child td{border-bottom:0;}
  td.tool b{color:var(--ink);} td.tool small{display:block;color:var(--ink-faint);font-size:12.5px;}
  td.num{font-family:'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums;white-space:nowrap;color:var(--ink);}
  td.price{color:var(--ink-soft);}
  .tag{display:inline-block;font-size:11.5px;font-weight:600;padding:2px 8px;border-radius:999px;background:var(--warn-bg);color:var(--warn-ink);white-space:nowrap;}
  .tag.keep{background:var(--accent-tint);color:var(--accent-strong);}
  .cuts{list-style:none;padding:0;margin:0;display:grid;gap:12px;}
  .cuts li{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:16px 18px;}
  .cuts b{display:block;color:var(--ink);margin-bottom:4px;font-family:'Plus Jakarta Sans',sans-serif;}
  .cuts span{color:var(--ink-soft);font-size:14.5px;}
  .cta{margin-top:44px;border:1px solid var(--accent);border-radius:16px;padding:26px;background:linear-gradient(120deg,var(--surface),var(--accent-tint));}
  .cta h2{margin:0 0 8px;}
  .cta form{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px;}
  .cta input{flex:1;min-width:180px;font:16px Inter,sans-serif;padding:11px 12px;border-radius:8px;border:1px solid var(--line);background:var(--surface);color:var(--ink);}
  .cta button{background:var(--accent-fill);color:#fff;border:0;border-radius:8px;padding:12px 18px;font:600 15px Inter,sans-serif;cursor:pointer;}
  .cta .hint{font-size:12.5px;color:var(--ink-faint);margin:10px 0 0;}
  .cta .msg{font-size:14px;color:var(--ink);margin:10px 0 0;font-weight:500;}
  .hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden;}
  .sources{font-size:13px;color:var(--ink-faint);} .sources li{margin-bottom:4px;word-break:break-word;}
  .stack-list{list-style:none;padding:0;margin:24px 0 0;display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:14px;}
  .stack-list a{display:block;height:100%;text-decoration:none;background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:20px;color:var(--ink);}
  .stack-list a:hover{border-color:var(--accent);}
  .stack-list b{font-family:'Plus Jakarta Sans',sans-serif;font-size:17px;display:block;}
  .stack-list span{font-size:13.5px;color:var(--ink-soft);display:block;margin-top:6px;}
  .stack-list em{font-style:normal;font-family:'IBM Plex Mono',monospace;font-size:13px;color:var(--accent);display:block;margin-top:10px;}
  footer{border-top:1px solid var(--line);margin-top:40px;padding:28px 0 40px;}
  .foot-row{display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px;font-size:12.5px;color:var(--ink-faint);}
  @media (max-width:600px){.wrap{padding:0 16px;} header.topbar{padding:18px 16px;} .summary{grid-template-columns:1fr;} .cta{padding:20px;}}
"""

HEAD = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="{desc}">
<link rel="canonical" href="https://subastian.us{path}">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta name="author" content="Subastian, LLC">
<meta name="theme-color" content="#6D28D9" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0B0A14" media="(prefers-color-scheme: dark)">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Subastian">
<meta property="og:url" content="https://subastian.us{path}">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:image" content="https://subastian.us/hero.jpg">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/emblem.png" type="image/png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@700;800&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@500;600&display=swap">
<style>{css}</style>
<script src="/ph.js" defer></script>
<script src="/aff.js" defer></script>
<script src="/roster.js" defer></script>
<script type="application/ld+json">{ld}</script>
</head>
<body>
<header class="topbar">
  <a class="brand" href="/" aria-label="Subastian home"><img src="/emblem.png" alt="" width="24" height="24"><span>SUBA<span>STIAN</span></span></a>
  <a href="/stacks/" class="btn-ghost">All tool stacks</a>
</header>
<main><div class="wrap">
"""

FOOT = """</div></main>
<footer><div class="wrap"><div class="foot-row">
  <div>Subastian, LLC &middot; Denver, CO</div>
  <div><a href="/stacks/">Tool stacks</a> &middot; <a href="/guides/">Guides</a> &middot; <a href="/leak-test/">Leak Test</a> &middot; <a href="/partners/">Partners</a> &middot; <a href="/terms/">Terms</a> &middot; <a href="/privacy/">Privacy</a></div>
</div></div></footer>
</body>
</html>
"""

FORM_JS = """<script>
(function(){
  var form = document.getElementById('stackForm'), msg = document.getElementById('stackMsg');
  if(!form) return;
  var busy = false;
  form.addEventListener('submit', function(e){
    e.preventDefault();
    if(busy) return;
    var email = form.email.value.trim();
    if(email.indexOf('@') < 1 || email.indexOf('.') < 0){ form.email.focus(); return; }
    if(form.hp_trap.value){ msg.textContent = 'Something went wrong. Email daniel@subastian.us and we\\u2019ll add you by hand.'; return; }
    busy = true; form.querySelector('button').disabled = true;
    var p = window.subRoster ? subRoster({ email: email, form: form.getAttribute('data-form'), work_type: form.getAttribute('data-work') }) : Promise.resolve(null);
    p.then(function(code){
      if(code){
        msg.innerHTML = 'You\\u2019re on the founding roster. Your share link: <code></code>';
        msg.querySelector('code').textContent = window.subShareLink(code);
        if(window.subTrack) subTrack('roster_signup', { form: form.getAttribute('data-form'), work_type: form.getAttribute('data-work'), has_share_code: true });
        form.reset();
      } else {
        msg.textContent = 'That didn\\u2019t go through. Email daniel@subastian.us and we\\u2019ll add you by hand.';
      }
      busy = false; form.querySelector('button').disabled = false;
    });
  });
})();
</script>
"""


def money(n):
    return "$0" if n == 0 else f"${n:,.2f}".replace(".00", "")


def e(s):
    return html.escape(str(s), quote=True)


def page(st):
    path = f"/stacks/{st['slug']}/"
    title = f"{st['niche']} Tool Stack: What It Costs in 2026 (and What to Cut)"
    lean = round(sum(t["monthly"] for t in st["tools"] if t["monthly"] is not None), 2)
    overlap_extra = round(sum(_extra(t) for t in st["tools"] if t["monthly"] is None), 2)
    desc = (f"What a {st['niche'].lower()} tool stack costs in 2026: {len(st['tools'])} tools, prices checked on each "
            f"vendor's own page, the overlaps to cut, and a lean stack for about {money(lean)} a month.")

    rows = []
    for t in st["tools"]:
        in_lean = t["monthly"] is not None
        status = '<span class="tag keep">In lean stack</span>' if in_lean else f'<span class="tag">Overlaps {e(t.get("overlap",""))}</span>'
        per = (money(t["monthly"]) + (f' <small>({e(t["unit"])})</small>' if t.get("unit") else "")) if in_lean else "&mdash;"
        rows.append(
            f'<tr><td class="tool"><b>{e(t["name"])}</b><small>{e(t["job"])}</small></td>'
            f'<td class="price">{e(t["price"])}</td><td class="num">{per}</td>'
            f'<td>{e(t["free"])}</td><td>{status}</td></tr>')

    cuts = "".join(f"<li><b>{e(a)}</b><span>{e(b)}</span></li>" for a, b in st["cuts"])
    srcs = sorted({t["src"] for t in st["tools"]})
    names = {t["src"]: t["name"].split(" ")[0] for t in st["tools"]}
    sources = "".join(f'<li>{e(names[s])}: <a href="{SRC[s]}" rel="nofollow noopener">{e(SRC[s])}</a></li>' for s in srcs)

    ld = json.dumps({
        "@context": "https://schema.org",
        "@graph": [
            {"@type": "Article", "headline": title, "description": desc, "dateModified": CHECKED, "datePublished": CHECKED,
             "author": {"@type": "Organization", "name": "Subastian, LLC", "url": "https://subastian.us/"},
             "publisher": {"@type": "Organization", "name": "Subastian, LLC", "logo": {"@type": "ImageObject", "url": "https://subastian.us/emblem.png"}},
             "mainEntityOfPage": f"https://subastian.us{path}"},
            {"@type": "BreadcrumbList", "itemListElement": [
                {"@type": "ListItem", "position": 1, "name": "Subastian", "item": "https://subastian.us/"},
                {"@type": "ListItem", "position": 2, "name": "Tool stacks", "item": "https://subastian.us/stacks/"},
                {"@type": "ListItem", "position": 3, "name": f"{st['niche']} tool stack", "item": f"https://subastian.us{path}"}]},
        ]}, ensure_ascii=False)

    out = HEAD.format(title=e(title), desc=e(desc), path=path, css=CSS, ld=ld)
    out += f"""
<p class="crumbs"><a href="/">Subastian</a> / <a href="/stacks/">Tool stacks</a> / {e(st['niche'])}</p>
<p class="eyebrow">Niche stack &middot; {e(st['niche'])}</p>
<h1>{e(title)}</h1>
<p class="lead">{e(st['intro'])}</p>
<span class="checked"><i aria-hidden="true"></i>Prices checked {CHECKED_LONG} on each vendor's own page</span>

<dl class="summary">
  <div><dt>Lean stack</dt><dd>&asymp; {money(lean)}<span style="font-size:.5em">/mo</span></dd><p>{e(st['lean_note'])} Yearly prices divided by 12.</p></div>
  <div><dt>Paying for the overlaps too</dt><dd class="leak">+ {money(overlap_extra)}<span style="font-size:.5em">/mo</span></dd><p>What the tools marked &ldquo;Overlaps&rdquo; add on top, for jobs the lean stack already covers.</p></div>
</dl>

<h2>The stack, tool by tool</h2>
<p>Prices are in USD before tax, exactly as each vendor listed them. Some only show yearly billing; the per-month column divides those by 12.</p>
<div class="table-wrap" role="region" aria-label="{e(st['niche'])} tools and prices" tabindex="0">
<table>
<thead><tr><th scope="col">Tool and job</th><th scope="col">Price as listed</th><th scope="col">&asymp; per month</th><th scope="col">Free plan or trial</th><th scope="col">Status</th></tr></thead>
<tbody>{''.join(rows)}</tbody>
</table>
</div>

<h2>What to cut</h2>
<ul class="cuts">{cuts}</ul>

<section class="cta" aria-labelledby="cta-h">
  <h2 id="cta-h">Track this stack automatically</h2>
  <p>Subastian is subscription management software in development. Its Niche Stacks feature is being built to put together a list like this for your work, then warn you before you pay for a job you already cover. Join the free Founding Roster for early access and the launch rate.</p>
  <form id="stackForm" data-form="stack_{st['slug'].replace('-', '_')[:30]}" data-work="{st['work_type']}" novalidate>
    <label for="sf-email" class="hp">Email</label>
    <input id="sf-email" name="email" type="email" autocomplete="email" inputmode="email" placeholder="you@example.com" aria-label="Email" required>
    <div class="hp" aria-hidden="true"><input name="hp_trap" type="text" tabindex="-1" autocomplete="off"></div>
    <button type="submit">Join the Founding Roster</button>
  </form>
  <p class="hint">Free. No card. Unsubscribe anytime. <a href="/privacy/">Privacy</a>.</p>
  <p class="msg" id="stackMsg" role="status" aria-live="polite"></p>
</section>

<h2>Sources</h2>
<p>Every price above was read on the vendor's own website on {CHECKED_LONG}. Plans and prices change, so check before you buy. This page has no affiliate links, and Subastian isn't paid by any tool listed.</p>
<ul class="sources">{sources}</ul>
"""
    out += FOOT.replace("</body>", FORM_JS + "</body>")
    return out, lean


def _extra(t):
    """Monthly cost an overlapping tool would add, from its listed price (monthly figure where shown)."""
    table = {"Semrush Pro": 139.95, "Ahrefs Standard": 249, "vidIQ Boost": 19, "Descript Creator": 35,
             "Later Growth": 37.50, "Buffer Team": 180}
    return table[t["name"]]


def index(leans):
    path = "/stacks/"
    title = "Software Tool Stacks by Niche: What They Cost in 2026 | Subastian"
    desc = "What the software stack for affiliate marketing, SEO agencies, YouTube automation, podcasting and social media agencies really costs, with prices checked on each vendor's page."
    ld = json.dumps({"@context": "https://schema.org", "@type": "CollectionPage", "name": title, "description": desc,
                     "url": "https://subastian.us/stacks/", "dateModified": CHECKED}, ensure_ascii=False)
    items = "".join(
        f'<li><a href="/stacks/{s["slug"]}/"><b>{e(s["niche"])}</b><span>For {e(s["who"])}.</span>'
        f'<em>Lean stack &asymp; {money(leans[s["slug"]])}/mo</em></a></li>' for s in STACKS)
    out = HEAD.format(title=e(title), desc=e(desc), path=path, css=CSS, ld=ld)
    out = out.replace('<a href="/stacks/" class="btn-ghost">All tool stacks</a>', '<a href="/" class="btn-ghost">&larr; Back to home</a>')
    out += f"""
<p class="eyebrow">Niche stacks</p>
<h1>What your software stack really costs</h1>
<p class="lead">The tools each kind of online business usually pays for, what they cost, which ones do the same job, and the leanest version that still covers everything.</p>
<span class="checked"><i aria-hidden="true"></i>Prices checked {CHECKED_LONG} on each vendor's own page</span>
<ul class="stack-list">{items}</ul>
<p style="margin-top:28px">Want your own number instead of a typical stack? The free <a href="/leak-test/?src=stacks">60-second Leak Test</a> estimates what your subscriptions may be wasting.</p>
"""
    return out + FOOT


if __name__ == "__main__":
    leans = {}
    for st in STACKS:
        d = os.path.join(ROOT, "stacks", st["slug"])
        os.makedirs(d, exist_ok=True)
        content, lean = page(st)
        leans[st["slug"]] = lean
        with open(os.path.join(d, "index.html"), "w") as f:
            f.write(content)
        print(f"{st['slug']}: lean ${lean:,.2f}/mo")
    with open(os.path.join(ROOT, "stacks", "index.html"), "w") as f:
        f.write(index(leans))
    print("stacks/index.html")
