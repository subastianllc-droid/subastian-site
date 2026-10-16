/*
 * Subastian help tab: a "Help" tab pinned to the right edge, near the top of every page.
 * Opens a side panel with shortcut buttons. Answers come from the site's own pages and FAQ.
 *
 * To connect an AI customer-service agent later, put its chat link in AGENT_URL below.
 * "Ask a question" will then open the agent instead of the quick answers.
 */
(function () {
  var AGENT_URL = ''; // e.g. 'https://your-agent-chat-link' (leave empty until you have one)
  var MEMBER_URL = 'https://app.subastian.us/login';
  var EMAIL = 'daniel@subastian.us';

  var TOPICS = {
    ask: {
      title: 'Ask a question',
      intro: 'Quick answers about Subastian.',
      items: [
        ['What is Subastian?', 'Subscription management software for people whose work runs on a pile of tools. It builds a cost-efficient stack for your niche, flags duplicate purchases before you pay twice, spots tools you’ve stopped using, and warns you before every renewal.'],
        ['Is it available yet?', 'Not yet. It’s in active development. Joining the free Founding Roster gets you early access and today’s launch pricing locked in.'],
        ['What will it cost?', 'Planned launch pricing is $49/mo Starter, $99/mo Conductor Pro and $299/mo Agency Maestro. Monthly plans aren’t billing yet.'],
        ['Does joining the roster cost anything?', 'No. No charge and no credit card.']
      ],
      link: ['Join the Founding Roster', '/#waitlist']
    },
    kit: {
      title: 'Audit Kit help',
      intro: 'The $9 Audit Kit and the $49 done-for-you audit.',
      items: [
        ['What’s in the Audit Kit?', 'A spreadsheet and a one-page guide that help you find forgotten subscriptions, spot overlapping tools and see upcoming renewals, in about 15 minutes. $9 one time, instant download.'],
        ['Where’s my download?', 'The kit is sold and delivered by Gumroad. Check the email from Gumroad for your download link, including your spam folder.'],
        ['What’s the done-for-you audit?', 'Send your list and get a clear savings report within 3 business days. $49, one time.'],
        ['Can I get a refund on the kit?', 'Yes. Ask within 30 days for a refund, no questions asked. The refund policy has the details.']
      ],
      link: ['See the Audit Kit', '/audit-kit/'],
      extra: [['Done-for-you audit', '/audit-service/'], ['Refund policy', '/refund-policy/']]
    },
    partner: {
      title: 'Partner program',
      intro: 'For creators and agencies who want to refer Subastian.',
      items: [
        ['What do partners earn?', 'A planned 40% recurring commission on customers you refer, once Subastian is live. Nothing is paid out before launch.'],
        ['How do I join?', 'Apply on the partners page. It’s free. Approved partners get early access and ready-made promo material.'],
        ['How are payouts handled?', 'Through Subastian’s payment platform. Full payout terms go to approved partners before launch.']
      ],
      link: ['Apply to be a partner', '/partners/']
    }
  };

  var css = [
    '#sbh-tab{position:fixed;right:0;top:112px;z-index:9998;display:flex;align-items:center;gap:6px;',
    'writing-mode:vertical-rl;padding:14px 9px;border:0;border-radius:10px 0 0 10px;cursor:pointer;',
    'background:var(--accent-fill,#6D28D9);color:#fff;font:600 13px/1 Inter,system-ui,sans-serif;letter-spacing:.06em;',
    'box-shadow:-2px 4px 14px rgba(21,19,42,.18);transition:padding .15s}',
    '#sbh-tab:hover{padding-right:13px}',
    '#sbh-tab svg{width:15px;height:15px;transform:rotate(90deg)}',
    '#sbh-tab:focus-visible,#sbh-panel :focus-visible{outline:3px solid var(--focus,#6D28D9);outline-offset:2px}',
    '#sbh-scrim{position:fixed;inset:0;z-index:9998;background:rgba(11,10,20,.35);opacity:0;pointer-events:none;transition:opacity .2s}',
    '#sbh-scrim.on{opacity:1;pointer-events:auto}',
    '#sbh-panel{position:fixed;top:0;right:0;bottom:0;z-index:9999;width:min(380px,100vw);overflow-y:auto;',
    'background:var(--surface,#fff);color:var(--ink,#15132A);border-left:1px solid var(--line,#E2DCF2);',
    'box-shadow:-12px 0 40px rgba(21,19,42,.18);transform:translateX(100%);visibility:hidden;',
    'transition:transform .25s ease,visibility 0s .25s;font:15px/1.5 Inter,system-ui,sans-serif}',
    '#sbh-panel.on{transform:none;visibility:visible;transition:transform .25s ease}',
    '#sbh-panel *{box-sizing:border-box}',
    '.sbh-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:20px 20px 12px}',
    '.sbh-head h2{margin:0;font:800 20px/1.2 "Plus Jakarta Sans",Inter,sans-serif;letter-spacing:-.01em}',
    '.sbh-x,.sbh-back{border:0;background:none;color:var(--ink-soft,#5C5678);cursor:pointer;font:inherit;border-radius:8px;padding:6px 8px}',
    '.sbh-x:hover,.sbh-back:hover{color:var(--ink,#15132A);background:var(--bg-band,#F1EDFA)}',
    '.sbh-body{padding:4px 20px 24px}',
    '.sbh-sub{margin:0 0 14px;color:var(--ink-soft,#5C5678);font-size:14px}',
    '.sbh-list{display:grid;gap:8px;margin:0;padding:0;list-style:none}',
    '.sbh-btn{display:flex;align-items:center;gap:12px;width:100%;padding:13px 14px;text-align:left;text-decoration:none;cursor:pointer;',
    'border:1px solid var(--line,#E2DCF2);border-radius:12px;background:var(--surface,#fff);color:var(--ink,#15132A);font:inherit;transition:border-color .15s,background .15s}',
    '.sbh-btn:hover{border-color:var(--accent,#6D28D9);background:var(--accent-tint,#ECE3FB)}',
    '.sbh-ico{flex:none;display:grid;place-items:center;width:34px;height:34px;border-radius:9px;background:var(--accent-tint,#ECE3FB);color:var(--accent,#6D28D9)}',
    '.sbh-ico svg{width:18px;height:18px}',
    '.sbh-btn b{display:block;font-weight:600}',
    '.sbh-btn small{display:block;color:var(--ink-soft,#5C5678);font-size:13px}',
    '.sbh-btn .sbh-arr{margin-left:auto;color:var(--ink-faint,#8B84A8)}',
    '.sbh-qa details{border-bottom:1px solid var(--line,#E2DCF2)}',
    '.sbh-qa summary{cursor:pointer;padding:12px 0;font-weight:600;list-style:none;display:flex;justify-content:space-between;gap:10px}',
    '.sbh-qa summary::-webkit-details-marker{display:none}',
    '.sbh-qa summary::after{content:"+";color:var(--accent,#6D28D9);font-weight:700}',
    '.sbh-qa details[open] summary::after{content:"\\2212"}',
    '.sbh-qa p{margin:0 0 12px;color:var(--ink-soft,#5C5678);font-size:14px}',
    '.sbh-cta{display:block;margin-top:16px;padding:12px 16px;border-radius:10px;text-align:center;text-decoration:none;font-weight:600;',
    'background:var(--accent-fill,#6D28D9);color:#fff}',
    '.sbh-cta:hover{background:var(--accent-strong,#54169E)}',
    '.sbh-links{display:flex;flex-wrap:wrap;gap:6px 14px;margin-top:12px;font-size:14px}',
    '.sbh-links a,.sbh-foot a{color:var(--accent,#6D28D9);font-weight:500}',
    '.sbh-foot{margin-top:18px;padding-top:14px;border-top:1px solid var(--line,#E2DCF2);font-size:14px;color:var(--ink-soft,#5C5678)}',
    '@media (max-width:640px){#sbh-tab{top:132px;padding:12px 7px;font-size:12px}}',
    '@media (prefers-reduced-motion:reduce){#sbh-panel,#sbh-scrim,#sbh-tab{transition:none}}'
  ].join('');

  var ICONS = {
    help: '<path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/><circle cx="12" cy="12" r="10"/>',
    ask: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    kit: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
    partner: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
    mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/>',
    member: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>'
  };
  function icon(n) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[n] + '</svg>';
  }
  function esc(t) {
    return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }
  function track(e, p) { try { if (window.subTrack) window.subTrack(e, p); } catch (x) { /* analytics optional */ } }

  var mailHref = 'mailto:' + EMAIL + '?subject=' + encodeURIComponent('Question about Subastian');

  function menu() {
    var rows = [
      ['ask', 'ask', 'Ask a question', AGENT_URL ? 'Chat with our assistant' : 'Quick answers about Subastian'],
      ['kit', 'kit', 'Audit Kit help', 'Downloads, the $49 audit, refunds'],
      ['partner', 'partner', 'Partner program', 'Commissions and how to apply'],
      ['mail', 'mail', 'Email a human', 'Daniel replies personally'],
      ['member', 'member', 'Membership Area', 'Sign in to your account']
    ];
    return '<div class="sbh-head"><h2 id="sbh-title">How can we help?</h2>' +
      '<button type="button" class="sbh-x" data-sbh="close" aria-label="Close help">✕</button></div>' +
      '<div class="sbh-body"><ul class="sbh-list">' + rows.map(function (r) {
        var inner = '<span class="sbh-ico">' + icon(r[1]) + '</span><span><b>' + r[2] + '</b><small>' + r[3] + '</small></span><span class="sbh-arr" aria-hidden="true">›</span>';
        if (r[0] === 'mail') return '<li><a class="sbh-btn" href="' + mailHref + '" data-sbh-go="email">' + inner + '</a></li>';
        if (r[0] === 'member') return '<li><a class="sbh-btn" href="' + MEMBER_URL + '" data-sbh-go="member">' + inner + '</a></li>';
        if (r[0] === 'ask' && AGENT_URL) return '<li><a class="sbh-btn" href="' + esc(AGENT_URL) + '" target="_blank" rel="noopener" data-sbh-go="agent">' + inner + '</a></li>';
        return '<li><button type="button" class="sbh-btn" data-sbh="' + r[0] + '">' + inner + '</button></li>';
      }).join('') + '</ul></div>';
  }

  function topic(key) {
    var t = TOPICS[key];
    return '<div class="sbh-head"><button type="button" class="sbh-back" data-sbh="menu" aria-label="Back to help menu">‹ Back</button>' +
      '<button type="button" class="sbh-x" data-sbh="close" aria-label="Close help">✕</button></div>' +
      '<div class="sbh-body"><h2 id="sbh-title" style="margin:0 0 4px;font:800 20px/1.2 \'Plus Jakarta Sans\',Inter,sans-serif">' + t.title + '</h2>' +
      '<p class="sbh-sub">' + t.intro + '</p><div class="sbh-qa">' +
      t.items.map(function (q) { return '<details><summary>' + esc(q[0]) + '</summary><p>' + esc(q[1]) + '</p></details>'; }).join('') +
      '</div><a class="sbh-cta" href="' + t.link[1] + '">' + t.link[0] + '</a>' +
      (t.extra ? '<div class="sbh-links">' + t.extra.map(function (l) { return '<a href="' + l[1] + '">' + l[0] + '</a>'; }).join('') + '</div>' : '') +
      '<p class="sbh-foot">Still stuck? <a href="' + mailHref + '">Email Daniel</a> at ' + EMAIL + '.</p></div>';
  }

  function init() {
    if (document.getElementById('sbh-tab')) return;
    var style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    var tab = document.createElement('button');
    tab.id = 'sbh-tab';
    tab.type = 'button';
    tab.setAttribute('aria-controls', 'sbh-panel');
    tab.setAttribute('aria-expanded', 'false');
    tab.innerHTML = icon('help') + '<span>Help</span>';

    var scrim = document.createElement('div');
    scrim.id = 'sbh-scrim';

    var panel = document.createElement('aside');
    panel.id = 'sbh-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'sbh-title');

    document.body.appendChild(tab);
    document.body.appendChild(scrim);
    document.body.appendChild(panel);

    function show(html) {
      panel.innerHTML = html;
      var first = panel.querySelector('.sbh-back, .sbh-btn, .sbh-x');
      if (first) first.focus();
    }
    function open() {
      show(menu());
      panel.classList.add('on');
      scrim.classList.add('on');
      tab.setAttribute('aria-expanded', 'true');
      track('help_open', { page: location.pathname });
    }
    function close() {
      panel.classList.remove('on');
      scrim.classList.remove('on');
      tab.setAttribute('aria-expanded', 'false');
      tab.focus();
    }

    tab.addEventListener('click', function () { panel.classList.contains('on') ? close() : open(); });
    scrim.addEventListener('click', close);
    panel.addEventListener('click', function (e) {
      var go = e.target.closest('[data-sbh-go]');
      if (go) { track('help_click', { button: go.getAttribute('data-sbh-go') }); return; }
      var b = e.target.closest('[data-sbh]');
      if (!b) return;
      var k = b.getAttribute('data-sbh');
      if (k === 'close') close();
      else if (k === 'menu') show(menu());
      else if (TOPICS[k]) { show(topic(k)); track('help_click', { button: k }); }
    });
    document.addEventListener('keydown', function (e) {
      if (!panel.classList.contains('on')) return;
      if (e.key === 'Escape') close();
      if (e.key === 'Tab') { // keep focus inside the panel
        var f = panel.querySelectorAll('a[href],button,summary');
        if (!f.length) return;
        var a = f[0], z = f[f.length - 1];
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
        else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
