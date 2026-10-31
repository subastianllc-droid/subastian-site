/*
 * Subastian Founding Roster: saves each signup to Supabase through the join_roster
 * function, tagged with where the visitor came from, so signups can be counted per channel.
 *
 * - Loaded on every page so the FIRST page of a visit can record the source
 *   (UTM tags, referring site, landing page). Kept in sessionStorage only: no cookies.
 * - Two kinds of share links:
 *     ?ref= / ?via= / ?aff=  a Founding Partner (paid commission at launch, separate program)
 *     ?r=<8 letters/digits>  a roster member's personal link (3 signups = free Audit Kit)
 * - The key below is Supabase's public "publishable" key. It is safe to publish:
 *   it can only call join_roster / roster_count and add a waitlist row. It cannot read,
 *   change or delete anything. Never put a secret/service-role key here.
 * - The Google Sheet webhook keeps running alongside this. Weekly counts by channel:
 *   the waitlist_weekly_by_source view in Supabase.
 */
(function () {
  var SUPABASE_URL = 'https://yhasuhzqykikacwezwyu.supabase.co';
  var PUBLISHABLE_KEY = 'sb_publishable_8d2HnqEk0KNS3VdIEbGAFw_BE8EPYjx';
  var STORE = 'sub_first_touch';
  var RREF = 'sub_roster_ref';

  function clip(v, n) { return v ? String(v).slice(0, n) : null; }
  function q() {
    try { return new URLSearchParams(location.search); } catch (e) { return { get: function () { return null; } }; }
  }

  // Roster member's personal link (?r=). Latest one wins for this visit.
  try {
    var r = (q().get('r') || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (r.length === 8) sessionStorage.setItem(RREF, r);
  } catch (e) {}

  // First touch: record the source once per visit, on the first page that loads this file.
  var touch = null;
  try { touch = JSON.parse(sessionStorage.getItem(STORE) || 'null'); } catch (e) {}
  if (!touch) {
    var p = q();
    var ref = (p.get('ref') || p.get('via') || p.get('aff') || '').replace(/[^A-Za-z0-9_-]/g, '');
    var rr = (p.get('r') || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    var external = document.referrer && document.referrer.indexOf(location.origin) !== 0 ? document.referrer : '';
    touch = {
      utm_source: clip(p.get('utm_source') || p.get('src') || (ref ? 'partner:' + ref : rr ? 'roster-referral' : ''), 100),
      utm_medium: clip(p.get('utm_medium'), 100),
      utm_campaign: clip(p.get('utm_campaign'), 100),
      utm_content: clip(p.get('utm_content'), 100),
      referrer: clip(external, 500),
      landing_path: clip(location.pathname + location.search, 300)
    };
    try { sessionStorage.setItem(STORE, JSON.stringify(touch)); } catch (e) {}
  }

  /**
   * Save a roster signup. Never throws and never blocks the page.
   * fields: { name, email, role, form, work_type, leak_report }
   * Resolves to the member's personal referral code (8 characters), or null if it failed.
   */
  window.subRoster = function (fields) {
    try {
      var email = String((fields && fields.email) || '').trim();
      if (!email) return Promise.resolve(null);
      var referredBy = null;
      try { referredBy = sessionStorage.getItem(RREF); } catch (e) {}
      var p = {
        name: clip((fields.name || '').trim(), 120),
        email: clip(email, 254),
        role: clip(fields.role, 60),
        work_type: fields.work_type || null,
        leak_report: fields.leak_report || null,
        referred_by: referredBy,
        utm_source: touch.utm_source,
        utm_medium: touch.utm_medium,
        utm_campaign: touch.utm_campaign,
        utm_content: touch.utm_content,
        referrer: touch.referrer,
        landing_path: touch.landing_path,
        signup_form: clip(fields.form, 40)
      };
      return fetch(SUPABASE_URL + '/rest/v1/rpc/join_roster', {
        method: 'POST',
        headers: { apikey: PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p: p }),
        keepalive: true
      }).then(function (res) { return res.ok ? res.json() : null; })
        .then(function (code) { return typeof code === 'string' && /^[a-z0-9]{8}$/.test(code) ? code : null; })
        .catch(function () { return null; });
    } catch (e) {
      return Promise.resolve(null);
    }
  };

  /** Personal share link for a referral code. */
  window.subShareLink = function (code) { return 'https://subastian.us/?r=' + code; };

  /** Roster size, or null until it passes 100 (the database hides smaller numbers). */
  window.subRosterCount = function () {
    return fetch(SUPABASE_URL + '/rest/v1/rpc/roster_count', {
      method: 'POST',
      headers: { apikey: PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
      body: '{}'
    }).then(function (res) { return res.ok ? res.json() : null; })
      .then(function (n) { return typeof n === 'number' && n >= 100 ? n : null; })
      .catch(function () { return null; });
  };
})();
