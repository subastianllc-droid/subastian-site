/**
 * Subastian roster email sequence: a free stand-in for a paid email tool.
 *
 * Runs inside the Google Apps Script project that backs the "Subastian Waitlist" sheet.
 * Every hour it looks for roster signups that are due an email and sends it from your Gmail:
 *   Email 1: 2 days after signup. Asks for a one-sentence reply.
 *   Email 2: 3 days after Email 1. Asks for a one-letter reply.
 *   Email 3 (only if OFFER_EMAILS is on and they signed up on/after OFFERS_SIGNUP_FROM): 5 days after Email 2. Offers the done-for-you audit, with the $9 Kit as the cheaper option.
 *   Email 4 (same condition): 7 days after Email 3. Last in the series: every offer in one place, plus share and partner links.
 * It skips anyone who unsubscribed, anyone who already replied, bad addresses and duplicates.
 * Every email carries an unsubscribe link and your postal address (both are required for
 * commercial email). Nothing here is a secret; the unsubscribe signing key is generated and
 * kept in Script Properties, never in this file.
 *
 * Setup is in automation/README.md. It starts in DRY_RUN mode and only logs what it would send.
 */

var CONFIG = {
  SPREADSHEET_ID: '',       // blank = the sheet this script is attached to
  SHEET_NAME: '',           // blank = the first tab
  FROM_NAME: 'Daniel at Subastian',
  FROM_ALIAS: '',           // optional: a "send mail as" alias, e.g. daniel@subastian.us
  REPLY_TO: '',             // leave blank so replies land in the Gmail that sends these emails (the "skip if they
                            // replied" check can only see that inbox). Set it only if that address forwards into it.
  POSTAL_ADDRESS: '',       // REQUIRED to send, e.g. 'Subastian, LLC, PO Box 123, Denver, CO 80202'
  WEB_APP_URL: '',          // REQUIRED to send: the deployed web app URL ending in /exec
  EARLIEST_SIGNUP: '',      // optional 'YYYY-MM-DD'; older signups are left alone
  DAYS_AFTER_SIGNUP: 2,     // Email 1 timing
  DAYS_AFTER_EMAIL_1: 3,    // Email 2 timing
  OFFER_EMAILS: false,      // false = only Emails 1 and 2, exactly as before. true = also send Emails 3 and 4 (the offer emails),
                            // but only to people on or after OFFERS_SIGNUP_FROM (below).
  OFFERS_SIGNUP_FROM: '',   // REQUIRED for Emails 3 and 4, 'YYYY-MM-DD'. Only people who signed up on or after this date get them.
                            // Set it to the day your signup forms began telling people they'll get offers for the Audit Kit and
                            // the audit service. Blank = no offer emails are sent, even with OFFER_EMAILS on. Set it earlier only
                            // if you're sure everyone after that date was told.
  DAYS_AFTER_EMAIL_2: 5,    // Email 3 timing
  DAYS_AFTER_EMAIL_3: 7,    // Email 4 timing
  AUDIT_PRICE_LINE: 'Founding client price: $49 for my first 5 clients, then $149.',
                            // Used in Emails 3 and 4. Keep it identical to the /audit-service/ page, and change both
                            // together when the founding-client spots are used up.
  MAX_PER_RUN: 30,          // keeps you far inside Gmail's daily limit
  DRY_RUN: true             // set to false once the test emails look right
};

var HEADER_NAMES = {
  email: ['email', 'emailaddress'],
  name: ['firstname', 'name', 'fullname'],
  time: ['submittedat', 'timestamp', 'date', 'createdat']
};
var TRACK_COLS = ['drip1_sent_at', 'drip2_sent_at', 'unsubscribed', 'drip3_sent_at', 'drip4_sent_at'];
var DAY_MS = 86400000;

/* ------------------------------ entry points ------------------------------ */

/** Hourly job. Safe to run by hand any time. */
function runDrip() {
  var sheet = getSheet_();
  var header = ensureTrackingColumns_(sheet);
  var cols = mapColumns_(header);
  var values = sheet.getDataRange().getValues();
  var now = new Date();
  var earliest = CONFIG.EARLIEST_SIGNUP ? new Date(CONFIG.EARLIEST_SIGNUP + 'T00:00:00') : null;
  var offersFrom = CONFIG.OFFERS_SIGNUP_FROM ? new Date(CONFIG.OFFERS_SIGNUP_FROM + 'T00:00:00') : null;

  if (!CONFIG.DRY_RUN) assertReadyToSend_();

  // Anyone already emailed (Email 1 sent) so a second row with the same address is not emailed again.
  var emailed = {};
  for (var i = 1; i < values.length; i++) {
    if (toDate_(values[i][cols.sent1])) emailed[key_(values[i][cols.email])] = true;
  }

  var sent = 0, log = [];
  if (CONFIG.OFFER_EMAILS && !offersFrom) {
    log.push('OFFER_EMAILS is on but OFFERS_SIGNUP_FROM is blank, so Emails 3 and 4 are NOT being sent. Set that date to choose who may receive them.');
  }
  for (var r = 1; r < values.length && sent < CONFIG.MAX_PER_RUN; r++) {
    var row = values[r];
    var rec = {
      email: String(row[cols.email] || '').trim(),
      signupAt: toDate_(row[cols.time]),
      sent1: row[cols.sent1],
      sent2: row[cols.sent2],
      sent3: row[cols.sent3],
      sent4: row[cols.sent4],
      unsub: row[cols.unsub]
    };
    var d = decide_(rec, now, {
      earliest: earliest, offers: CONFIG.OFFER_EMAILS, offersFrom: offersFrom,
      days1: CONFIG.DAYS_AFTER_SIGNUP, days2: CONFIG.DAYS_AFTER_EMAIL_1,
      days3: CONFIG.DAYS_AFTER_EMAIL_2, days4: CONFIG.DAYS_AFTER_EMAIL_3
    });
    if (d.note) log.push('row ' + (r + 1) + ': ' + d.note);
    if (!d.step) continue;

    var k = key_(rec.email);
    if (d.step === 1 && emailed[k]) { markCell_(sheet, r, cols.sent1, 'skipped-duplicate'); continue; }

    // "Replied" means a message from them since the previous email (or since signup, for Email 1).
    var since = d.step === 1 ? rec.signupAt : toDate_(rec['sent' + (d.step - 1)]);
    if (hasReplied_(rec.email, since)) {
      markCell_(sheet, r, cols['sent' + d.step], 'skipped-replied');
      log.push('row ' + (r + 1) + ': skipped, they already replied');
      continue;
    }

    var mail = buildEmail_(d.step, firstName_(row[cols.name]), rec.email);
    if (CONFIG.DRY_RUN) {
      log.push('DRY RUN: would send email ' + d.step + ' to ' + rec.email + ' (subject: ' + mail.subject + ')');
    } else {
      sendMail_(rec.email, mail);
      markCell_(sheet, r, cols['sent' + d.step], new Date());
      emailed[k] = true;
      log.push('sent email ' + d.step + ' to ' + rec.email);
    }
    sent++;
  }
  Logger.log(log.length ? log.join('\n') : 'Nothing due.');
  return log;
}

/** Sends all four emails to you so you can read them exactly as a subscriber would, even while OFFER_EMAILS is off. */
function sendTestToMe() {
  assertReadyToSend_();
  var to = Session.getEffectiveUser().getEmail() || CONFIG.REPLY_TO;
  [1, 2, 3, 4].forEach(function (step) {
    var mail = buildEmail_(step, 'Daniel', to);
    mail.subject = '[TEST] ' + mail.subject;
    sendMail_(to, mail);
  });
  Logger.log('Sent 4 test emails to ' + to);
}

/** Run once: makes runDrip fire every hour. */
function installTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'runDrip') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('runDrip').timeBased().everyHours(1).create();
  Logger.log('Hourly trigger installed.');
}

/** Unsubscribe link target. Add this web-app GET handler to your project (see README). */
function doGet(e) {
  var p = (e && e.parameter) || {};
  var page = function (msg) {
    return HtmlService.createHtmlOutput('<p style="font:16px system-ui,sans-serif;max-width:480px;margin:48px auto;padding:0 16px">' + msg + '</p>');
  };
  if (p.u && p.t) {
    if (p.t === token_(p.u)) {
      markUnsubscribed_(p.u);
      return page('You\'re unsubscribed. You won\'t get any more emails from Subastian.');
    }
    return page('That link isn\'t valid. Reply to any Subastian email and we\'ll remove you by hand.');
  }
  return page('Subastian');
}

/* ------------------------------ decisions (pure) ------------------------------ */

/** Which email, if any, is due for one row. Returns { step: 0|1|2|3|4, note? }.
 *  Each later email is due a set number of days after the previous one was actually SENT. A cell that holds
 *  'skipped-replied' or 'skipped-duplicate' is not a date, so it ends the sequence for that person. */
function decide_(rec, now, cfg) {
  if (!isEmail_(rec.email)) return { step: 0, note: rec.email ? 'bad email address: ' + rec.email : '' };
  if (rec.unsub) return { step: 0 };
  if (!rec.signupAt) return { step: 0, note: 'no readable signup date for ' + rec.email };
  if (cfg.earliest && rec.signupAt < cfg.earliest) return { step: 0 };
  if (!rec.sent1) return now - rec.signupAt >= cfg.days1 * DAY_MS ? { step: 1 } : { step: 0 };
  var due = function (prevSent, days, step) {
    var prev = toDate_(prevSent);
    return prev && now - prev >= days * DAY_MS ? { step: step } : { step: 0 };
  };
  if (!rec.sent2) return due(rec.sent1, cfg.days2, 2);
  // Offer emails need the switch on AND a cut-off date: only people who signed up after the forms said offers were coming.
  if (!cfg.offers || !cfg.offersFrom || rec.signupAt < cfg.offersFrom) return { step: 0 };
  if (!rec.sent3) return due(rec.sent2, cfg.days3, 3);
  if (!rec.sent4) return due(rec.sent3, cfg.days4, 4);
  return { step: 0 };
}

function buildEmail_(step, first, email) {
  var site = 'https://subastian.us';
  var name = first || 'there';
  var body, subject;
  if (step === 1) {
    subject = 'What\'s the most annoying thing about your subscriptions?';
    body = [
      'Hi ' + name + ',',
      '',
      'Daniel here from Subastian. Thanks for joining the founding roster.',
      '',
      'I\'m still building, and I\'d rather build what people actually need than guess. So I have one question, and a sentence is plenty:',
      '',
      'What\'s the most annoying thing about keeping track of your subscriptions?',
      '',
      'Just hit reply. I read every answer and reply to most of them myself.',
      '',
      'In case they\'re useful while you\'re here:',
      '',
      '- Your free bonus: the Free Trial Tracker and Cancel & Refund Scripts: ' + site + '/bonus/',
      '- The 60-second Leak Test: a score, a rough monthly estimate of what your subscriptions may be wasting, and a printable 14-day plan: ' + site + '/leak-test/?src=day2email',
      '',
      'If you\'d rather see your exact number than an estimate, there\'s also the $9 Subscription Audit Kit, a spreadsheet and one-page guide. It has a 30-day refund and is entirely optional: ' + site + '/audit-kit/?src=day2email',
      '',
      'Thanks,',
      'Daniel',
      'Founder, Subastian',
      '',
      'P.S. If you\'d be up for a 15-minute call about how you handle subscriptions today, reply "call" and I\'ll send times.'
    ].join('\n');
  } else if (step === 2) {
    subject = 'Pick one (takes 5 seconds)';
    body = [
      'Hi ' + name + ',',
      '',
      'Daniel again. I asked a question earlier this week and I know inboxes get busy, so here\'s an easier version. Just reply with a letter:',
      '',
      'A) Free trials that turn into charges',
      'B) Not knowing what I pay for in total',
      'C) Paying for two tools that do the same job',
      'D) Renewals I didn\'t see coming',
      'E) Something else (tell me in a line)',
      '',
      'That\'s it. Whatever you pick tells me what to build first.',
      '',
      'If you want something useful in the meantime, the free Cancel & Refund Scripts are the fastest win. Copy, paste, send: ' + site + '/bonus/',
      '',
      'Curious what your subscriptions might be costing you? The 60-second Leak Test gives you a score and a rough estimate: ' + site + '/leak-test/?src=day5email',
      '',
      'Or skip the estimate and get your exact number with the $9 Audit Kit: ' + site + '/audit-kit/?src=day5email',
      '',
      'Thanks,',
      'Daniel'
    ].join('\n');
  } else if (step === 3) {
    subject = 'I can do your subscription audit for you';
    body = [
      'Hi ' + name + ',',
      '',
      'Daniel here. No question this time, just an offer in case it helps.',
      '',
      'If you\'ve been meaning to check what you pay for and never got around to it, I\'ll do it for you. You send me a list of your tools and subscriptions (never passwords or card numbers). Within 3 business days you get:',
      '',
      '- a spreadsheet of everything, with monthly and yearly cost and what to keep, review or cancel',
      '- a one-page savings summary with the top actions ranked by money saved',
      '- a renewal calendar, so nothing renews by surprise',
      '',
      CONFIG.AUDIT_PRICE_LINE + ' You pay nothing up front: you ask, I reply with what\'s included, and you pay only if you want to go ahead. There\'s a 30-day money-back guarantee, and if I can\'t find any savings I\'ll tell you and refund you in full. Savings figures are estimates, not guarantees.',
      '',
      'Details and how to request it: ' + site + '/audit-service/?src=day10email',
      '',
      'Prefer to do it yourself? The $9 Subscription Audit Kit is the same idea as a spreadsheet, with a 30-day refund: ' + site + '/audit-kit/?src=day10email',
      '',
      'Questions? Just reply. I read every one.',
      '',
      'Thanks,',
      'Daniel',
      'Founder, Subastian'
    ].join('\n');
  } else {
    subject = 'Last one in this series';
    body = [
      'Hi ' + name + ',',
      '',
      'Daniel again. This is the last email in this series, so here\'s everything in one place.',
      '',
      'Do it yourself, $9: the Subscription Audit Kit finds forgotten subscriptions, overlapping tools and upcoming renewals in about 15 minutes. 30-day refund. ' + site + '/audit-kit/?src=day17email',
      '',
      'Have me do it for you. ' + CONFIG.AUDIT_PRICE_LINE + ' Details: ' + site + '/audit-service/?src=day17email',
      '',
      'Free, if you haven\'t tried it: the 60-second Leak Test. ' + site + '/leak-test/?src=day17email',
      '',
      'Two small asks:',
      '- Know someone who pays for too many tools? Send them the Leak Test. It\'s free and takes a minute.',
      '- If you recommend software to an audience, the Founding Partner program is open for applications. Commissions are planned to start once Subastian launches: ' + site + '/partners/?src=day17email',
      '',
      'I\'ll email you when early access opens. Until then you can reply to this any time.',
      '',
      'Thanks,',
      'Daniel',
      'Founder, Subastian'
    ].join('\n');
  }
  body += '\n\n--\nYou\'re getting this because you joined the Subastian founding roster at subastian.us.' +
    '\nUnsubscribe: ' + unsubUrl_(email) +
    '\n' + CONFIG.POSTAL_ADDRESS;
  return { subject: subject, body: body };
}

/* ------------------------------ helpers ------------------------------ */

function norm_(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
function key_(email) { return String(email || '').trim().toLowerCase(); }
function isEmail_(s) { return /^[^\s@"<>]+@[^\s@"<>]+\.[^\s@"<>]+$/.test(String(s || '')); }
function firstName_(v) { return String(v || '').trim().split(/\s+/)[0].replace(/[^A-Za-zÀ-ɏ'\-]/g, ''); }

function toDate_(v) {
  var d = null;
  if (Object.prototype.toString.call(v) === '[object Date]') d = v;
  else if (typeof v === 'string' && v.trim()) d = new Date(v);
  return d && !isNaN(d.getTime()) ? d : null;
}

function mapColumns_(header) {
  var names = header.map(norm_), cols = {};
  ['email', 'name', 'time'].forEach(function (field) {
    cols[field] = -1;
    HEADER_NAMES[field].forEach(function (n) { if (cols[field] < 0) cols[field] = names.indexOf(n); });
  });
  cols.sent1 = names.indexOf(norm_(TRACK_COLS[0]));
  cols.sent2 = names.indexOf(norm_(TRACK_COLS[1]));
  cols.unsub = names.indexOf(norm_(TRACK_COLS[2]));
  cols.sent3 = names.indexOf(norm_(TRACK_COLS[3]));
  cols.sent4 = names.indexOf(norm_(TRACK_COLS[4]));
  if (cols.email < 0 || cols.time < 0) {
    throw new Error('Could not find the email and signup-date columns. Headers found: ' + header.join(', ') +
      '. Rename them to "email" and "submittedAt", or add your header names to HEADER_NAMES.');
  }
  return cols;
}

function getSheet_() {
  var ss = CONFIG.SPREADSHEET_ID ? SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('No spreadsheet. Set CONFIG.SPREADSHEET_ID or attach this script to the sheet.');
  var sheet = CONFIG.SHEET_NAME ? ss.getSheetByName(CONFIG.SHEET_NAME) : ss.getSheets()[0];
  if (!sheet) throw new Error('Sheet tab not found: ' + CONFIG.SHEET_NAME);
  return sheet;
}

function ensureTrackingColumns_(sheet) {
  var header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  TRACK_COLS.forEach(function (name) {
    if (header.map(norm_).indexOf(norm_(name)) < 0) {
      sheet.getRange(1, header.length + 1).setValue(name);
      header.push(name);
    }
  });
  return header;
}

function markCell_(sheet, rowIdx, colIdx, value) { sheet.getRange(rowIdx + 1, colIdx + 1).setValue(value); }

function assertReadyToSend_() {
  if (!CONFIG.POSTAL_ADDRESS) throw new Error('Set CONFIG.POSTAL_ADDRESS first. Commercial email must include a postal address.');
  if (!CONFIG.WEB_APP_URL) throw new Error('Set CONFIG.WEB_APP_URL to your deployed web app URL so the unsubscribe link works.');
}

function hasReplied_(email, since) {
  if (!since) return false;
  var day = Utilities.formatDate(new Date(since.getTime() - DAY_MS), Session.getScriptTimeZone(), 'yyyy/MM/dd');
  return GmailApp.search('from:' + email + ' after:' + day, 0, 1).length > 0;
}

function sendMail_(to, mail) {
  if (MailApp.getRemainingDailyQuota() < 5) throw new Error('Daily email quota nearly used up. Try again tomorrow.');
  var opts = { name: CONFIG.FROM_NAME };
  if (CONFIG.REPLY_TO) opts.replyTo = CONFIG.REPLY_TO;
  if (CONFIG.FROM_ALIAS && GmailApp.getAliases().indexOf(CONFIG.FROM_ALIAS) > -1) opts.from = CONFIG.FROM_ALIAS;
  GmailApp.sendEmail(to, mail.subject, mail.body, opts);
}

/* ------------------------------ unsubscribe ------------------------------ */

function secret_() {
  var props = PropertiesService.getScriptProperties();
  var s = props.getProperty('DRIP_SECRET');
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); props.setProperty('DRIP_SECRET', s); }
  return s;
}

function token_(email) {
  var sig = Utilities.computeHmacSha256Signature(key_(email), secret_());
  return sig.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('').slice(0, 24);
}

function unsubUrl_(email) {
  return CONFIG.WEB_APP_URL + '?u=' + encodeURIComponent(email) + '&t=' + token_(email);
}

function markUnsubscribed_(email) {
  var sheet = getSheet_();
  var cols = mapColumns_(ensureTrackingColumns_(sheet));
  var values = sheet.getDataRange().getValues();
  for (var r = 1; r < values.length; r++) {
    if (key_(values[r][cols.email]) === key_(email)) markCell_(sheet, r, cols.unsub, 'yes ' + new Date().toISOString());
  }
}
