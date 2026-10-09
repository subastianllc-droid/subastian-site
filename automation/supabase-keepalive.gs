/**
 * Keeps the free-tier Supabase project behind the partner application form from being
 * auto-paused for inactivity (Supabase pauses free projects after 7 days with no activity).
 *
 * Paste into the same Apps Script project as email-drip.gs, then run installKeepAliveTrigger once.
 * It makes one small read request every 2 days. The URL and key below are the same public values
 * already in partners/index.html (the anon key is meant to be public and is limited by row-level security).
 * Check the project's status any time at supabase.com/dashboard. Upgrading to Pro is the permanent fix.
 */
var KEEPALIVE = {
  SUPABASE_URL: 'https://yhasuhzqykikacwezwyu.supabase.co',
  ANON_KEY: ''  // paste the public anon key from partners/index.html (SUPABASE_ANON)
};

function keepAlive() {
  if (!KEEPALIVE.ANON_KEY) throw new Error('Paste the public anon key into KEEPALIVE.ANON_KEY first.');
  var res = UrlFetchApp.fetch(KEEPALIVE.SUPABASE_URL + '/rest/v1/affiliate_applications?select=id&limit=1', {
    method: 'get',
    headers: { apikey: KEEPALIVE.ANON_KEY, Authorization: 'Bearer ' + KEEPALIVE.ANON_KEY },
    muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  Logger.log('Supabase keep-alive: HTTP ' + code);
  // 200 and 401/403 (blocked by row-level security) both mean the project is awake. 5xx or a pause notice is not fine.
  if (code >= 500) throw new Error('Supabase did not answer (HTTP ' + code + '). The project may be paused: check the dashboard.');
  return code;
}

function installKeepAliveTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'keepAlive') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('keepAlive').timeBased().everyDays(2).create();
  Logger.log('Keep-alive trigger installed (every 2 days).');
}
