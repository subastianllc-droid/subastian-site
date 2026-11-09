/*
 * Subastian website analytics (PostHog, US cloud).
 * - Counts page views, clicks and signups so we can see the funnel.
 * - No cookies: data is kept in sessionStorage (cleared when the tab closes).
 * - Never sends names or email addresses. Form inputs are masked.
 * - No session recordings.
 * The project key below is PostHog's public "write-only" key; it is safe to publish.
 *
 * Owner opt-out: visit any page with ?internal=1 to stop analytics on that device
 * (so Daniel's own testing never shows up in the numbers). ?internal=0 turns it back on.
 * This stores one flag ("sub_internal") in localStorage on that device only. It is not
 * a tracking identifier and is never sent anywhere.
 */
(function () {
  var KEY = 'phc_rutrcQ4rwkUhnBtdprb9UouPJxcpgyZ7EeHw6SGTduGR';
  if (!KEY || KEY.indexOf('phc_') !== 0) return; // not configured yet

  // --- Owner opt-out (?internal=1 / ?internal=0) ---
  var internal = false;
  try {
    var qs = new URLSearchParams(location.search);
    var flag = qs.get('internal');
    if (flag === '1' || flag === '0') {
      if (flag === '1') localStorage.setItem('sub_internal', '1');
      else localStorage.removeItem('sub_internal');
      qs.delete('internal'); // keep the flag out of shared/bookmarked links
      var rest = qs.toString();
      history.replaceState(null, '', location.pathname + (rest ? '?' + rest : '') + location.hash);
      var showBadge = function () {
        var b = document.createElement('div');
        b.textContent = flag === '1'
          ? 'Analytics OFF on this device (owner mode)'
          : 'Analytics back ON on this device';
        b.setAttribute('role', 'status');
        b.style.cssText = 'position:fixed;left:16px;bottom:16px;z-index:2147483647;' +
          'background:#111;color:#fff;font:600 14px/1.3 system-ui,sans-serif;' +
          'padding:10px 14px;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.3)';
        document.body.appendChild(b);
        setTimeout(function () { b.remove(); }, 5000);
      };
      if (document.body) showBadge(); else document.addEventListener('DOMContentLoaded', showBadge);
    }
    internal = localStorage.getItem('sub_internal') === '1';
  } catch (e) {}
  if (internal) return; // owner device: load no analytics at all

  !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);

  window.posthog.init(KEY, {
    api_host: 'https://us.i.posthog.com',
    persistence: 'sessionStorage',   // no cookies, no cookie banner needed
    person_profiles: 'identified_only',
    disable_session_recording: true,
    mask_all_text: false,
    mask_all_element_attributes: false,
    autocapture: { dom_event_allowlist: ['click', 'submit'] },
    capture_pageview: true,
    capture_pageleave: true
  });

  // Tag the whole visit with the partner/referral code (?ref= / ?via= / ?aff=).
  try {
    var q = new URLSearchParams(location.search);
    var ref = (q.get('ref') || q.get('via') || q.get('aff') || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
    if (ref) window.posthog.register_for_session({ referral_code: ref });
  } catch (e) {}
})();

// Safe helper the pages call on successful signups. Never pass names or emails.
window.subTrack = function (event, props) {
  try { if (window.posthog && window.posthog.capture) window.posthog.capture(event, props || {}); } catch (e) {}
};
