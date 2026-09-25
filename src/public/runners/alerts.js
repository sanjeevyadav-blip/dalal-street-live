/* Price alerts, checked in the background — @capacitor/background-runner.
 *
 * This file is NOT part of the web bundle. Vite copies it to dist/runners/alerts.js, and the
 * Android app's background runner loads it into a headless JavaScript engine every ~15
 * minutes (capacitor.config.json, plugins.BackgroundRunner). That engine has no DOM, no
 * modules, no localStorage and no window — only fetch, timers, and two Capacitor APIs:
 * CapacitorKV (a string key/value store) and CapacitorNotifications.
 *
 * So everything here is self-contained. The same checking logic lives in src/data/alerts.js
 * for the app while it is open, and tests/unit/alerts.test.js runs BOTH on the same cases so
 * the two copies cannot drift. Change one, change the other.
 *
 * THE HONEST LIMIT. Android runs background work at most every 15 minutes, and later if the
 * phone is saving battery; some manufacturers stop it entirely unless the user exempts the
 * app (https://dontkillmyapp.com). An alert therefore fires on the first check AFTER the
 * price crosses — not the instant it crosses — and a price that spikes through the level and
 * back between two checks is missed. The alerts screen says so.
 *
 * On the website this file is served but never run.
 */

/* The runner engine's own globals. There is no window here to reach them through. */
/* global CapacitorKV, CapacitorNotifications, addEventListener */

var WORKER = 'https://dalal-proxy.sanjeev-yadav.workers.dev/?url=';
var STORE_KEY = 'dsl.alerts.v1';

/* NSE cash market: Monday to Friday, 09:15 to 15:30 IST (UTC+05:30). Holidays are not known
 * here; checking on one costs a few requests and cannot fire an alert, since the price does
 * not move. */
function isMarketOpen(date) {
  var ist = new Date(date.getTime() + (5 * 60 + 30) * 60000);
  var day = ist.getUTCDay();
  if (day === 0 || day === 6) return false;
  var mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return mins >= 9 * 60 + 15 && mins <= 15 * 60 + 30;
}

/* "Above" fires at or above the level, "below" at or below. Anything that is not a finite
 * price fires nothing: a failed quote must never read as a crossing. */
function crossed(alert, price) {
  if (typeof price !== 'number' || !isFinite(price) || price <= 0) return false;
  if (alert.dir === 'above') return price >= alert.price;
  if (alert.dir === 'below') return price <= alert.price;
  return false;
}

/* One pass over every alert. Returns the updated list and the alerts that fired this pass.
 * One-shot: an alert that has fired is never fired again. */
function evaluate(alerts, prices, nowIso) {
  var fired = [];
  var updated = alerts.map(function (a) {
    if (a.firedAt) return a;
    var p = prices[a.sym];
    if (!crossed(a, p)) return a;
    var hit = {};
    for (var k in a) hit[k] = a[k];
    hit.firedAt = nowIso;
    hit.firedPrice = p;
    fired.push(hit);
    return hit;
  });
  return { alerts: updated, fired: fired };
}

/* Indian digit grouping without Intl, which this engine may not have: 123456.5 -> 1,23,456.50 */
function inr(n) {
  var parts = Math.abs(n).toFixed(2).split('.');
  var s = parts[0];
  var last3 = s.slice(-3);
  var rest = s.slice(0, -3);
  if (rest) last3 = ',' + last3;
  rest = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return (n < 0 ? '-' : '') + '₹' + rest + last3 + '.' + parts[1];
}

/* A stable 31-bit notification id per alert. Android requires a 32-bit int. */
function notifyId(id) {
  var h = 0;
  for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h) % 2147483647;
}

function notificationFor(a) {
  var ticker = a.sym.replace(/\.(NS|BO)$/, '');
  return {
    id: notifyId(a.id),
    title: ticker + ' is ' + (a.dir === 'above' ? 'above ' : 'below ') + inr(a.price),
    body: 'Last price ' + inr(a.firedPrice) + '. Your alert, set in Dalal Street Live. ' +
      'Prices are checked about every 15 minutes, so the move may have happened a little earlier.'
  };
}

function readAlerts() {
  try {
    var r = CapacitorKV.get(STORE_KEY);
    var list = r && r.value ? JSON.parse(r.value) : [];
    return Array.isArray(list) ? list : [];
  // A named binding rather than ES2019's bare `catch {`: the runner's engine is not a
  // browser, and this file must parse on whatever version of it the app ships with.
  } catch (e) { // eslint-disable-line no-unused-vars
    return [];
  }
}

function writeAlerts(list) {
  CapacitorKV.set(STORE_KEY, JSON.stringify(list));
}

function quote(sym) {
  var url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(sym) + '?range=1d&interval=1d';
  return fetch(WORKER + encodeURIComponent(url))
    .then(function (res) { return res.json(); })
    .then(function (j) {
      var m = j && j.chart && j.chart.result && j.chart.result[0] && j.chart.result[0].meta;
      return m ? m.regularMarketPrice : null;
    });
}

/* Guarded: this file is also loaded by the unit tests in a sandbox that has no runner. */
if (typeof addEventListener === 'function') {
  /* The app pushes its alert list here whenever it changes; this is the only way the
   * background check can see alerts the user made in the WebView. */
  addEventListener('syncAlerts', function (resolve, reject, args) {
    try {
      writeAlerts((args && Array.isArray(args.alerts)) ? args.alerts : []);
      resolve();
    } catch (e) { reject(e); }
  });

  /* The app reads this back on start, to learn which alerts fired while it was closed. */
  addEventListener('getAlerts', function (resolve, reject) {
    try { resolve({ alerts: readAlerts() }); } catch (e) { reject(e); }
  });

  /* The periodic check. resolve() or reject() on every path: a handler that never settles
   * is killed by the OS and counts against the app's background budget. */
  addEventListener('checkAlerts', function (resolve, reject, args) {
    try {
      if (!(args && args.force) && !isMarketOpen(new Date())) { resolve({ skipped: 'market closed' }); return; }
      var alerts = readAlerts();
      var active = alerts.filter(function (a) { return !a.firedAt; });
      if (!active.length) { resolve({ checked: 0 }); return; }

      var syms = [];
      active.forEach(function (a) { if (syms.indexOf(a.sym) < 0) syms.push(a.sym); });
      var prices = {};
      var jobs = syms.map(function (s) {
        return quote(s).then(function (p) { prices[s] = p; }, function () { /* leave unset: fires nothing */ });
      });

      Promise.all(jobs).then(function () {
        var out = evaluate(alerts, prices, new Date().toISOString());
        if (out.fired.length) {
          writeAlerts(out.alerts);
          CapacitorNotifications.schedule(out.fired.map(notificationFor));
        }
        resolve({ checked: syms.length, fired: out.fired.map(function (f) { return f.id; }) });
      }, reject);
    } catch (e) { reject(e); }
  });
}

/* For the unit tests, which evaluate this file in a sandbox and read these back. */
if (typeof globalThis !== 'undefined') {
  globalThis.__dslAlertsRunner = { isMarketOpen: isMarketOpen, crossed: crossed, evaluate: evaluate, inr: inr, notifyId: notifyId, notificationFor: notificationFor };
}
