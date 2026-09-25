// Price alerts: "tell me when RELIANCE crosses ₹1,300".
//
// The user chooses every level. The app never suggests one — no "+5%" presets, no levels
// derived from support and resistance — because a level the app picked would be a target
// price by another name (hard rule 2).
//
// Stored on this device only, in localStorage, and never sent anywhere. Inside the Android
// app the list is also mirrored into the background runner's own key/value store, because
// the runner (src/public/runners/alerts.js) runs in a separate engine that cannot read the
// WebView's storage. That is a copy on the same phone, not an upload.
//
// isMarketOpen, crossed and evaluate are duplicated in the runner, which cannot import
// modules. tests/unit/alerts.test.js runs both copies on the same cases.

const STORE_KEY = 'dsl.alerts.v1';
const RUNNER_LABEL = 'dev.dalalstreet.live.alerts';
export const MAX_ALERTS = 30;

// ---- the logic the runner shares ---------------------------------------------------------

export function isMarketOpen(date){
  const ist = new Date(date.getTime() + (5 * 60 + 30) * 60000);
  const day = ist.getUTCDay();
  if (day === 0 || day === 6) return false;
  const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return mins >= 9 * 60 + 15 && mins <= 15 * 60 + 30;
}

export function crossed(alert, price){
  if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) return false;
  if (alert.dir === 'above') return price >= alert.price;
  if (alert.dir === 'below') return price <= alert.price;
  return false;
}

export function evaluate(alerts, prices, nowIso){
  const fired = [];
  const updated = alerts.map(a => {
    if (a.firedAt) return a;
    const p = prices[a.sym];
    if (!crossed(a, p)) return a;
    const hit = { ...a, firedAt: nowIso, firedPrice: p };
    fired.push(hit);
    return hit;
  });
  return { alerts: updated, fired };
}

// ---- storage -----------------------------------------------------------------------------

function isValidAlert(a){
  return a && typeof a.id === 'string' && typeof a.sym === 'string' && /\.(NS|BO)$/.test(a.sym) &&
    (a.dir === 'above' || a.dir === 'below') && typeof a.price === 'number' && Number.isFinite(a.price) && a.price > 0;
}

export function listAlerts(){
  try {
    const list = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
    // Storage outlives code and can be edited by hand; anything malformed is dropped rather
    // than trusted, so a bad record can never become an alert that fires on nothing.
    return Array.isArray(list) ? list.filter(isValidAlert) : [];
  } catch { return []; }
}

function save(list){
  try { localStorage.setItem(STORE_KEY, JSON.stringify(list)); } catch { /* storage unavailable */ }
  syncToRunner(list);
  for (const fn of listeners) { try { fn(list); } catch { /* a listener must not break saving */ } }
}

const listeners = new Set();
export function onAlertsChanged(fn){ listeners.add(fn); return () => listeners.delete(fn); }

/**
 * Why a new alert would be pointless, or null if it is fine. An "above" level at or under
 * the current price would fire on the very next check, which is a mistake, not an alert.
 */
export function validateNewAlert(dir, price, current){
  if (dir !== 'above' && dir !== 'below') return 'Choose above or below.';
  if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) return 'Enter a price greater than zero.';
  if (typeof current === 'number' && Number.isFinite(current) && current > 0){
    if (dir === 'above' && price <= current) return 'That is already at or below the current price, so it would fire at once. Pick a level above it.';
    if (dir === 'below' && price >= current) return 'That is already at or above the current price, so it would fire at once. Pick a level below it.';
  }
  if (listAlerts().filter(a => !a.firedAt).length >= MAX_ALERTS) {
    // Each active alert is a request on every background check; the runner has ~30 seconds.
    return 'You have ' + MAX_ALERTS + ' active alerts, the most this app checks. Remove one first.';
  }
  return null;
}

export function addAlert(sym, dir, price){
  const list = listAlerts();
  const alert = {
    id: 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    sym, dir, price, createdAt: new Date().toISOString(), firedAt: null, firedPrice: null
  };
  list.push(alert);
  save(list);
  return alert;
}

export function removeAlert(id){
  save(listAlerts().filter(a => a.id !== id));
}

/** Apply fired results from a check, from either the app or the runner. */
export function applyFired(fired){
  if (!fired.length) return;
  const byId = new Map(fired.map(f => [f.id, f]));
  save(listAlerts().map(a => (byId.has(a.id) && !a.firedAt) ? { ...a, firedAt: byId.get(a.id).firedAt, firedPrice: byId.get(a.id).firedPrice } : a));
}

// ---- the background runner, inside the Android app only ----------------------------------

function runner(){
  const cap = typeof window !== 'undefined' && window.Capacitor;
  return cap && cap.isNativePlatform && cap.isNativePlatform() && cap.Plugins && cap.Plugins.BackgroundRunner || null;
}

export function inNativeApp(){ return !!runner(); }

function syncToRunner(list){
  const br = runner();
  if (!br) return;
  br.dispatchEvent({ label: RUNNER_LABEL, event: 'syncAlerts', details: { alerts: list } }).catch(() => {});
}

/**
 * On start: learn which alerts fired in the background while the app was closed, so they
 * are shown as fired here and are not fired a second time by the in-app check.
 */
export async function pullFromRunner(){
  const br = runner();
  if (!br) return [];
  try {
    const res = await br.dispatchEvent({ label: RUNNER_LABEL, event: 'getAlerts', details: {} });
    const remote = (res && Array.isArray(res.alerts)) ? res.alerts : [];
    const firedRemotely = remote.filter(r => r.firedAt);
    const local = listAlerts();
    const newly = firedRemotely.filter(r => local.some(l => l.id === r.id && !l.firedAt));
    if (newly.length) applyFired(newly);
    else syncToRunner(local);
    return newly;
  } catch { return []; }
}

export async function requestNotificationPermission(){
  const br = runner();
  if (br){
    try { await br.requestPermissions({ apis: ['notifications'] }); } catch { /* denied or unavailable */ }
    return;
  }
  if (typeof window !== 'undefined' && window.Notification && window.Notification.permission === 'default'){
    try { await window.Notification.requestPermission(); } catch { /* unsupported */ }
  }
}
