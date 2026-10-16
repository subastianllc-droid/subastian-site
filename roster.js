/*
 * Subastian Founding Roster: saves each signup to the Supabase "waitlist" table,
 * tagged with where the visitor came from, so signups can be counted per channel.
 *
 * - Loaded on every page so the FIRST page of a visit can record the source
 *   (UTM tags, referring site, landing page). Kept in sessionStorage only: no cookies.
 * - The key below is Supabase's public "publishable" key. It is safe to publish:
 *   Row Level Security only lets it ADD a row to the waitlist. It cannot read,
 *   change or delete anything. Never put a secret/service-role key here.
 * - The existing Google Sheet webhook keeps running alongside this, so nothing changes
 *   for the welcome email. Weekly counts: the waitlist_weekly_by_source view in Supabase.
 */
(function () {
  var SUPABASE_URL = 'https://yhasuhzqykikacwezwyu.supabase.co';
  var PUBLISHABLE_KEY = 'sb_publishable_8d2HnqEk0KNS3VdIEbGAFw_BE8EPYjx';
  var STORE = 'sub_first_touch';

  function clip(v, n) { return v ? String(v).slice(0, n) : null; }

  // First touch: record the source once per visit, on the first page that loads this file.
  var touch = null;
  try { touch = JSON.parse(sessionStorage.getItem(STORE) || 'null'); } catch (e) {}
  if (!touch) {
    var q;
    try { q = new URLSearchParams(location.search); } catch (e) { q = { get: function () { return null; } }; }
    var ref = (q.get('ref') || q.get('via') || q.get('aff') || '').replace(/[^A-Za-z0-9_-]/g, '');
    var external = document.referrer && document.referrer.indexOf(location.origin) !== 0 ? document.referrer : '';
    touch = {
      utm_source: clip(q.get('utm_source') || q.get('src') || (ref ? 'partner:' + ref : ''), 100),
      utm_medium: clip(q.get('utm_medium'), 100),
      utm_campaign: clip(q.get('utm_campaign'), 100),
      utm_content: clip(q.get('utm_content'), 100),
      referrer: clip(external, 500),
      landing_path: clip(location.pathname + location.search, 300)
    };
    try { sessionStorage.setItem(STORE, JSON.stringify(touch)); } catch (e) {}
  }

  /**
   * Save a roster signup. Never throws and never blocks the page: if Supabase is
   * unreachable the Google Sheet webhook still has the signup.
   * fields: { name, email, role, form }  (form = which page form, e.g. 'home')
   */
  window.subRoster = function (fields) {
    try {
      var email = String((fields && fields.email) || '').trim();
      if (!email) return Promise.resolve(false);
      var row = {
        name: clip((fields.name || '').trim(), 120),
        email: clip(email, 254),
        role: clip(fields.role, 60),
        utm_source: touch.utm_source,
        utm_medium: touch.utm_medium,
        utm_campaign: touch.utm_campaign,
        utm_content: touch.utm_content,
        referrer: touch.referrer,
        landing_path: touch.landing_path,
        signup_form: clip(fields.form, 40)
      };
      return fetch(SUPABASE_URL + '/rest/v1/waitlist', {
        method: 'POST',
        headers: {
          apikey: PUBLISHABLE_KEY,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal'
        },
        body: JSON.stringify(row),
        keepalive: true
      }).then(function (r) { return r.ok; }).catch(function () { return false; });
    } catch (e) {
      return Promise.resolve(false);
    }
  };
})();
