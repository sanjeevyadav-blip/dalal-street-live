// Number, date and clock formatting.
//
// fmtNum, fmtCr and fmtPct all return an em dash for null or NaN rather than "0" or
// "NaN" — CLAUDE.md invariant 3. That is the single most important thing in this file:
// a zero where a number is missing is indistinguishable from a real zero on screen, and
// someone will act on it.
//
// Everything is formatted en-IN, so large numbers group as 1,23,456 (lakh/crore), not
// 123,456. fmtCr renders in crore because that is how Indian financials are quoted.

export function istParts(){
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone:'Asia/Kolkata', hour12:false, weekday:'short', hour:'2-digit', minute:'2-digit', second:'2-digit' });
  const parts = fmt.formatToParts(new Date());
  const get = t => parts.find(p => p.type===t).value;
  return { weekday: get('weekday'), hour: parseInt(get('hour'),10), minute: parseInt(get('minute'),10), second: get('second') };
}

export function updateClock(){
  const p = istParts();
  document.getElementById('istClock').textContent = p.weekday + ' ' + String(p.hour).padStart(2,'0') + ':' + String(p.minute).padStart(2,'0') + ':' + p.second + ' IST';
  const isWeekday = !['Sat','Sun'].includes(p.weekday);
  const minutesNow = p.hour*60 + p.minute;
  const open = isWeekday && minutesNow >= (9*60+15) && minutesNow <= (15*60+30);
  document.getElementById('statusDot').className = 'dot ' + (open ? 'open':'closed');
  document.getElementById('statusText').textContent = open ? 'Market open' : 'Market closed';
}

export function fmtNum(n, decimals){ if (n==null || isNaN(n)) return '—'; return n.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }); }

export function fmtCr(n){
  if (n==null || isNaN(n)) return '—';
  const cr = n/1e7;
  if (cr >= 1e5) return '₹' + fmtNum(cr/1e5,2) + ' L Cr';
  return '₹' + fmtNum(cr,0) + ' Cr';
}

export function fmtPct(n, decimals){ if (n==null || isNaN(n)) return '—'; return fmtNum(n, decimals==null?2:decimals) + '%'; }

export function fmtDate(ts){
  if (!ts) return null;
  try { return new Date(ts*1000).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}); }
  catch { return null; }
}

export function ageLabel(ts){
  if (!ts) return null;
  const days = Math.floor((Date.now() - ts*1000)/86400000);
  if (days < 0) return 'scheduled';
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 32) return days + 'd old';
  const m = Math.round(days/30);
  return m + 'mo old';
}
