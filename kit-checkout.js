/*
 * $9 Audit Kit buy links go straight to Gumroad's checkout (?wanted=true skips the product page).
 * Any <a data-kit-buy="where-it-is"> is pointed at checkout and its clicks are counted as
 * auditkit_checkout_click in PostHog, same event the Kit page uses.
 * Plain "Audit Kit" links without a price still go to /audit-kit/ for people who want details.
 */
(function () {
  var CHECKOUT = 'https://subastian.gumroad.com/l/subscription-audit-kit?wanted=true';
  var PRICE = 9;
  window.SUB_KIT_CHECKOUT = CHECKOUT;
  function ref() { try { return (sessionStorage.getItem('sub_ref') || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) || null; } catch (e) { return null; } }
  function wire() {
    document.querySelectorAll('a[data-kit-buy]').forEach(function (a) {
      a.href = CHECKOUT;
      if (a.dataset.kitWired) return;
      a.dataset.kitWired = '1';
      a.addEventListener('click', function () {
        if (window.subTrack) subTrack('auditkit_checkout_click', {
          price: PRICE, position: a.getAttribute('data-kit-buy'), page: location.pathname, referral_code: ref()
        });
      });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
})();
