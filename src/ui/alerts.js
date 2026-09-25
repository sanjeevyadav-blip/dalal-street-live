// Price alerts, on screen: the form on a stock's page, the list on the Top 20 tab, the check
// that runs while the app is open, and the banner when one fires.
//
// Two checkers, because neither covers everything alone:
//
//   in the app, while it is open   every 60 seconds, here. Prompt, but stops when the app is
//                                  closed or the screen is off.
//   in the background              every ~15 minutes at best, in src/public/runners/alerts.js,
//                                  Android app only. Keeps working when the app is closed,
//                                  but late and at the mercy of battery optimisation.
//
// On the website there is only the first. The copy says which applies, because "alert"
// implies a promise, and the reader should know exactly how much of one this is.

import { fetchQuote } from '../data/yahoo.js';
import {
  listAlerts, addAlert, removeAlert, applyFired, evaluate, isMarketOpen, validateNewAlert,
  onAlertsChanged, pullFromRunner, requestNotificationPermission, inNativeApp
} from '../data/alerts.js';
import { fmtNum } from './format.js';
import { openStock } from './navigate.js';
import { suppressed } from '../suppressed.js';

const CHECK_MS = 60000;

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}
const ticker = (sym) => sym.replace(/\.(NS|BO)$/, '');
const when = (iso) => {
  try { return new Date(iso).toLocaleString('en-IN', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit', hour12:false }); }
  catch { return iso; }
};

function limitNote(){
  return inNativeApp()
    ? 'Checked every minute while the app is open, and about every 15 minutes in the background when it is closed — later if your phone is saving battery, and some phones stop background checks entirely unless you exempt the app. A price that spikes through your level and back between two checks is missed.'
    : 'On the website, alerts are only checked while this page is open. Install the Android app to be alerted when it is closed.';
}

function alertLine(a, withTicker){
  const head = (withTicker ? '<b>' + escapeHtml(ticker(a.sym)) + '</b> ' : '') +
    (a.dir === 'above' ? 'above' : 'below') + ' ₹' + fmtNum(a.price, 2);
  const status = a.firedAt
    ? '<span class="al-status fired">Crossed at ₹' + fmtNum(a.firedPrice, 2) + ' · ' + escapeHtml(when(a.firedAt)) + '</span>'
    : '<span class="al-status">Watching</span>';
  return '<li class="al-row' + (a.firedAt ? ' is-fired' : '') + '" data-sym="' + escapeHtml(a.sym) + '">' +
    '<span class="al-what">' + head + status + '</span>' +
    '<button type="button" class="al-remove" data-remove-alert="' + escapeHtml(a.id) + '" aria-label="Remove this alert">Remove</button></li>';
}

// ---- on a stock's page -------------------------------------------------------------------

export function mountAlertForm(symbol, currentPrice){
  const block = document.getElementById('alertBlock');
  if (!block) return;

  function render(){
    const mine = listAlerts().filter(a => a.sym === symbol);
    block.innerHTML =
      '<form class="al-form" id="alertForm" novalidate>' +
        '<span class="al-lead">Alert me when ' + escapeHtml(ticker(symbol)) + ' is</span>' +
        '<select id="alertDir" aria-label="Direction"><option value="above">above</option><option value="below">below</option></select>' +
        '<span class="al-inr">₹</span><input id="alertPrice" type="number" inputmode="decimal" step="0.05" min="0" ' +
          'aria-label="Price level" placeholder="' + (currentPrice ? fmtNum(currentPrice, 2).replace(/,/g, '') : '') + '">' +
        '<button type="submit">Set alert</button>' +
      '</form>' +
      '<div class="al-msg" id="alertMsg" role="status"></div>' +
      (mine.length ? '<ul class="al-list">' + mine.map(a => alertLine(a, false)).join('') + '</ul>' : '') +
      '<div class="note-inline al-note">You choose the level; this app never suggests one. ' + limitNote() + '</div>';

    const form = document.getElementById('alertForm');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const dir = document.getElementById('alertDir').value;
      const price = parseFloat(document.getElementById('alertPrice').value);
      const msg = document.getElementById('alertMsg');
      const problem = validateNewAlert(dir, price, currentPrice);
      if (problem){ msg.textContent = problem; msg.className = 'al-msg bad'; return; }
      addAlert(symbol, dir, price);
      requestNotificationPermission();
      render();
      const after = document.getElementById('alertMsg');
      if (after){ after.textContent = 'Alert set.'; after.className = 'al-msg ok'; }
    });
  }

  render();
  // Re-render when an alert changes elsewhere (fired, or removed from the Top 20 list), but
  // only while this card is still the one for this symbol.
  const off = onAlertsChanged(() => {
    if (!document.body.contains(block) || !document.getElementById('alertForm')) { off(); return; }
    if (block.dataset.sym !== symbol) { off(); return; }
    // Keep a half-typed price: only re-render the list part if the form is focused.
    if (block.contains(document.activeElement)) return;
    render();
  });
  block.dataset.sym = symbol;
}

// ---- the list, on the Top 20 tab ---------------------------------------------------------

export function mountAlertsSection(){
  if (document.getElementById('alertsSection')) return;
  const watch = document.querySelector('section.watchlist');
  if (!watch || !watch.parentNode) return;
  const sec = document.createElement('section');
  sec.className = 'watchlist';
  sec.id = 'alertsSection';
  watch.parentNode.insertBefore(sec, watch.nextSibling);
  renderAlertsSection();
  onAlertsChanged(renderAlertsSection);
}

export function renderAlertsSection(){
  const sec = document.getElementById('alertsSection');
  if (!sec) return;
  const all = listAlerts();
  const active = all.filter(a => !a.firedAt);
  const fired = all.filter(a => a.firedAt).sort((a, b) => String(b.firedAt).localeCompare(String(a.firedAt)));
  sec.innerHTML =
    '<div class="section-head"><h2>Price alerts</h2>' +
    '<span class="hint">' + (all.length ? active.length + ' watching' + (fired.length ? ' · ' + fired.length + ' crossed' : '') : 'Open any stock and use + Alert to set one') + '</span></div>' +
    (all.length
      ? '<ul class="al-list">' + active.concat(fired).map(a => alertLine(a, true)).join('') + '</ul>'
      : '<div class="note-inline">No alerts yet.</div>') +
    '<div class="note-inline al-note">' + limitNote() + '</div>';
}

// Removing and opening, delegated once at document level: both lists are re-rendered often.
let delegated = false;
function installDelegation(){
  if (delegated) return;
  delegated = true;
  document.addEventListener('click', (e) => {
    const rm = e.target.closest('[data-remove-alert]');
    if (rm){ e.preventDefault(); removeAlert(rm.getAttribute('data-remove-alert')); return; }
    const row = e.target.closest('#alertsSection .al-row');
    if (row) openStock(row.getAttribute('data-sym'));
    const toast = e.target.closest('#alertToast [data-sym]');
    if (toast){ openStock(toast.getAttribute('data-sym')); hideToast(); }
  });
}

// ---- when one fires ----------------------------------------------------------------------

function showToast(fired){
  let t = document.getElementById('alertToast');
  if (!t){
    t = document.createElement('div');
    t.id = 'alertToast';
    t.setAttribute('role', 'alert');
    document.body.appendChild(t);
  }
  t.innerHTML = fired.map(f =>
    '<button type="button" class="al-toast-item" data-sym="' + escapeHtml(f.sym) + '">' +
    '<b>' + escapeHtml(ticker(f.sym)) + '</b> is ' + (f.dir === 'above' ? 'above' : 'below') +
    ' ₹' + fmtNum(f.price, 2) + ' — now ₹' + fmtNum(f.firedPrice, 2) + '</button>').join('') +
    '<button type="button" class="al-toast-close" aria-label="Dismiss">×</button>';
  t.querySelector('.al-toast-close').addEventListener('click', hideToast);
  t.hidden = false;
}
function hideToast(){ const t = document.getElementById('alertToast'); if (t) t.hidden = true; }

function notifyWeb(fired){
  // Inside the app the background runner owns system notifications; the banner is enough
  // while the app is on screen.
  if (inNativeApp() || !window.Notification || window.Notification.permission !== 'granted') return;
  for (const f of fired){
    try {
      new window.Notification(ticker(f.sym) + ' is ' + f.dir + ' ₹' + fmtNum(f.price, 2), {
        body: 'Last price ₹' + fmtNum(f.firedPrice, 2) + '. Your alert, set in Dalal Street Live.',
        tag: f.id
      });
    } catch { /* some browsers only allow notifications from a service worker */ }
  }
}

// ---- the in-app check --------------------------------------------------------------------

let checking = false;
export async function checkNow({ force = false } = {}){
  if (checking) return [];
  if (!force && !isMarketOpen(new Date())) return [];
  const active = listAlerts().filter(a => !a.firedAt);
  if (!active.length) return [];
  checking = true;
  try {
    const syms = [...new Set(active.map(a => a.sym))];
    const prices = {};
    await Promise.all(syms.map(s => fetchQuote(s)
      .then(q => { prices[s] = q && q.price; })
      .catch(err => suppressed('alerts: quote', err))));
    const { fired } = evaluate(listAlerts(), prices, new Date().toISOString());
    if (fired.length){
      applyFired(fired);
      showToast(fired);
      notifyWeb(fired);
    }
    return fired;
  } finally {
    checking = false;
  }
}

export async function startAlerts(){
  installDelegation();
  mountAlertsSection();
  // Alerts that fired in the background while the app was closed: shown as crossed, and
  // announced once, rather than fired again by the check below.
  const missed = await pullFromRunner();
  if (missed.length) showToast(missed);
  checkNow();
  setInterval(() => {
    if (document.visibilityState === 'visible') checkNow();
  }, CHECK_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkNow();
  });
}
