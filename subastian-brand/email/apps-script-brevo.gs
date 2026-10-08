/**
 * Brevo hand-off for the Subastian Signups Apps Script.
 *
 * Paste this into the existing Apps Script project (next to doPost) and call
 *   addToBrevo_(data);
 * from doPost once you've parsed the JSON body into `data`. `data` is the
 * payload the site forms send: { type: 'roster' | 'partner', email, firstName,
 * lastName, ... }.
 *
 * Setup (Apps Script > Project Settings > Script properties). Never paste the
 * API key into this file or into any file in the repo:
 *   BREVO_API_KEY       Brevo > SMTP & API > API Keys > Generate a new API key
 *   BREVO_LIST_ROSTER   numeric id of the "Founding Roster" list
 *   BREVO_LIST_PARTNER  numeric id of the "Partner Applicants" list
 *
 * Once the Brevo automations are live, remove the old MailApp / GmailApp
 * kit-sending lines from doPost, or people get the kit twice.
 */
function addToBrevo_(data) {
  var props = PropertiesService.getScriptProperties();
  var key = props.getProperty('BREVO_API_KEY');
  var listId = parseInt(
    props.getProperty(data.type === 'partner' ? 'BREVO_LIST_PARTNER' : 'BREVO_LIST_ROSTER'),
    10
  );
  if (!key || !listId || !data.email) {
    console.error('Brevo not configured or email missing');
    return false;
  }

  var res = UrlFetchApp.fetch('https://api.brevo.com/v3/contacts', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'api-key': key, accept: 'application/json' },
    muteHttpExceptions: true,
    payload: JSON.stringify({
      email: String(data.email).trim().toLowerCase(),
      attributes: {
        FIRSTNAME: data.firstName || '',
        LASTNAME: data.lastName || ''
      },
      listIds: [listId],
      updateEnabled: true // existing contact: update and add to the list instead of erroring
    })
  });

  var code = res.getResponseCode(); // 201 = created, 204 = updated
  if (code !== 201 && code !== 204) {
    console.error('Brevo ' + code + ': ' + res.getContentText());
    return false;
  }
  return true;
}
