/*
 * Lemon Squeezy affiliate tracking (store "subastian").
 * Loaded only for visitors who arrive on a partner link (?aff=...) or who already carry the
 * partner cookie from one. Lemon Squeezy then sets the ls_aff_ref cookie and tags checkout links
 * so a later purchase is credited to the partner. Everyone else never loads it.
 * Docs: https://docs.lemonsqueezy.com/help/affiliates-for-merchants/getting-referrals
 */
(function () {
  try {
    var fromLink = new URLSearchParams(location.search).has('aff');
    var hasCookie = /(?:^|;\s*)ls_aff_ref=/.test(document.cookie);
    if (!fromLink && !hasCookie) return;
    window.lemonSqueezyAffiliateConfig = { store: 'subastian' };
    var s = document.createElement('script');
    s.src = 'https://lmsqueezy.com/affiliate.js';
    s.defer = true;
    document.head.appendChild(s);
  } catch {
    // Storage or URL APIs unavailable; skip tracking.
  }
})();
