// The diagnostics panel — the visible half of EPIC-4 story E4-4.
//
// src/diagnostics.js keeps every suppressed failure in a bounded, PII-free ring buffer. This
// is what puts it on screen, so "the factor block was empty this morning" can be answered
// without a console, a repro, or a user report.
//
// The panel is opt-in and off by default: a page that greets everyone with a failure log
// reads as broken even when it is working. Switch it on with the toggle, or with `?diag=1`.
// The BUFFER fills either way — see the note in src/diagnostics.js about why a log you have
// to enable before the bug happens is a log you never have.
//
// Nothing here sends anything anywhere. There is no endpoint and no beacon; the dump is
// plain text for the reader to copy if they want to.

import {
  getFailures, clearFailures, formatFailures, isEnabled, setEnabled, onFailure, failureCount
} from '../diagnostics.js';

const SECTION_ID = 'diagnosticsSection';

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function rowsHtml(){
  const failures = getFailures().slice().reverse();   // newest first
  if (!failures.length){
    return '<div class="note-inline">Nothing has failed this session. That is the expected state — ' +
      'this panel fills in only when a feed is unavailable.</div>';
  }
  return '<table class="book"><thead><tr><th>When</th><th>Where</th><th>What</th><th>Detail</th></tr></thead><tbody>' +
    failures.map(function(f){
      const meta = Object.entries(f.meta).map(function(e){ return e[0] + '=' + e[1]; }).join(' · ');
      const time = f.at.slice(11, 19);
      return '<tr><td class="num">' + escapeHtml(time) + '</td>' +
        '<td class="sym">' + escapeHtml(f.context) + '</td>' +
        '<td>' + escapeHtml(f.message) + '</td>' +
        '<td style="color:var(--cream-dim)">' + escapeHtml(meta || '—') + '</td></tr>';
    }).join('') + '</tbody></table>';
}

function bodyHtml(){
  return '<div class="screener-group">' +
    '<div class="screener-head">' +
      '<h3>Recent failures <span style="color:var(--cream-dim);font-weight:400">(' + failureCount() + ')</span></h3>' +
      '<div><button id="diagCopy" type="button">Copy as text</button> ' +
      '<button id="diagClear" type="button">Clear</button></div>' +
    '</div>' +
    '<div id="diagRows">' + rowsHtml() + '</div>' +
    '<div class="note-inline" style="margin-top:10px">' +
      'These are upstream failures the page rode out — a feed that did not answer, not a ' +
      'number a company does not publish. Nothing here leaves your browser: there is no ' +
      'endpoint behind this panel, and the log deliberately records the upstream host rather ' +
      'than the full URL, so it carries no record of what you looked up or what you hold.' +
    '</div>' +
    '<textarea id="diagDump" readonly style="display:none;width:100%;min-height:150px;margin-top:10px;' +
      'background:var(--panel);border:1px solid var(--hair);color:var(--cream);border-radius:8px;' +
      'padding:10px;font-family:var(--mono);font-size:12px"></textarea>' +
  '</div>';
}

function refresh(){
  const rows = document.getElementById('diagRows');
  if (rows) rows.innerHTML = rowsHtml();
  const head = document.querySelector('#' + SECTION_ID + ' .screener-head h3 span');
  if (head) head.textContent = '(' + failureCount() + ')';
}

export function mountDiagnostics(){
  const wrap = document.querySelector('.wrap');
  if (!wrap) return null;
  if (document.getElementById(SECTION_ID)) return document.getElementById(SECTION_ID);

  const sec = document.createElement('section');
  sec.className = 'screener';
  sec.id = SECTION_ID;

  function render(){
    const on = isEnabled();
    sec.innerHTML =
      '<div class="section-head"><h2>Diagnostics</h2>' +
      '<span class="hint">Upstream failures this session — off by default, nothing is sent anywhere</span></div>' +
      '<div style="margin-bottom:10px">' +
        '<label style="font-size:12.5px;color:var(--cream-dim);display:inline-flex;align-items:center;gap:8px;cursor:pointer">' +
        '<input type="checkbox" id="diagToggle"' + (on ? ' checked' : '') + '> Show the failure log' +
        '</label></div>' +
      (on ? bodyHtml() : '');

    const toggle = sec.querySelector('#diagToggle');
    if (toggle) toggle.addEventListener('change', function(){ setEnabled(toggle.checked); render(); });

    const clear = sec.querySelector('#diagClear');
    if (clear) clear.addEventListener('click', function(){ clearFailures(); refresh(); });

    const copy = sec.querySelector('#diagCopy');
    if (copy) copy.addEventListener('click', function(){
      const dump = sec.querySelector('#diagDump');
      if (!dump) return;
      dump.value = formatFailures();
      dump.style.display = 'block';
      dump.select();
      // No clipboard permission prompt: the textarea is selected and the reader copies it.
      // A silent clipboard write on a page nobody asked to write to the clipboard is worse.
    });
  }

  render();
  wrap.appendChild(sec);

  // Re-render on every new failure, but only the rows — rebuilding the whole section would
  // drop the reader's selection mid-copy.
  onFailure(function(){ if (isEnabled()) refresh(); });

  return sec;
}
