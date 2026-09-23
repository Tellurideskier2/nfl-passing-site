import { comparePlayer, finite, validOdds } from './model.js';
const $ = id => document.getElementById(id);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
const fixed = (n, d = 1) => Number.isFinite(n) ? n.toFixed(d) : '—';
const pct = n => Number.isFinite(n) ? `${fixed(n * 100)}%` : '—';
const edge = n => Number.isFinite(n) ? `${fixed(n * 100)} pp` : '—';
const money = n => Number.isFinite(n) ? `${n >= 0 ? '+' : '−'}$${Math.abs(n).toFixed(2)}` : '—';
const odds = n => Number.isFinite(n) ? `${n > 0 ? '+' : ''}${n}` : '—';
let config = null, slate = null, refreshing = false, failed = false;
let manual = [];
try {
  const saved = JSON.parse(localStorage.getItem('nflManualV2') || 'null');
  if (Array.isArray(saved)) manual = saved;
  else {
    const legacy = JSON.parse(localStorage.getItem('nflPassingProps') || '[]');
    manual = Array.isArray(legacy) ? legacy.map(p => manualPlayer(p)).filter(Boolean) : [];
  }
} catch { manual = []; }

function manualPlayer(p) {
  const quotes = ['over','under'].filter(side => validOdds(p[`${side}Odds`])).map(side => ({
    side, line: Number(p.line), odds: Number(p[`${side}Odds`]), bookmakerId: 'manual', bookmaker: p.bookmaker || 'Manual', updatedAt: null
  }));
  if (!p.player || !quotes.length || finite(p.line) === null || !(Number(p.projAtt) > 0 && Number(p.ypa) > 0)) return null;
  return { id: `manual-${crypto.randomUUID()}`, manual: true, player: p.player, team: p.team || '', opp: p.opp || '',
    date: p.date || '', matchup: `${p.team || '?'} vs ${p.opp || '?'}`, quotes,
    warnings: ['Manual inputs; verify date, price and starter.'],
    stats: { ...p, manual: true, sampleSize: 0, currentSeasonGames: 0, stale: false } };
}
function save() {
  try { localStorage.setItem('nflManualV2', JSON.stringify(manual)); }
  catch { $('manualError').textContent = 'Browser storage is unavailable. Your entries will last only for this session.'; }
}
function allRows() {
  const auto = (slate?.players || []).filter(p => Date.parse(p.startTime) > Date.now());
  const stale = failed || (slate && Date.now() - Date.parse(slate.updatedAt) > slate.cacheSeconds * 1000);
  const targetDate = slate?.date || $('date').value;
  return [...auto.map(p => stale ? { ...p, bestBet: null, confidence: p.projection ? 'Low' : 'Unavailable', warnings: [...p.warnings, 'Snapshot expired or refresh failed. Update before using these prices.'] } : p),
    ...manual.map(p => comparePlayer(p, { ...p.stats, stale: p.date !== targetDate }))];
}
function quoteCell(q) {
  if (!q) return '<span class="muted">Not offered</span>';
  return `<strong>${fixed(q.line)} · ${odds(q.odds)}</strong><small>${escape(q.bookmaker)}</small>
    <small>Win ${pct(q.probability)} · Push ${pct(q.pushProb)}</small>
    <small class="${q.ev > 0 ? 'positive' : ''}">EV ${money(q.ev)} · Edge ${edge(q.edge)}</small>`;
}
function detailHTML(p) {
  const s = p.stats;
  const stats = s ? `Recent 5: ${fixed(s.last5)} · Recent 10: ${fixed(s.last10)} · Baseline: ${fixed(s.seasonAvg)} · Attempts: ${fixed(s.projAtt)} · YPA: ${fixed(s.ypa,2)} · Opponent allowed: ${fixed(s.oppPassAllowed)} · Team pass yards: ${fixed(s.teamPassYards)} · Team attempts: ${fixed(s.teamAttempts)} · Spread: ${fixed(s.spread)} · Total: ${fixed(s.total)} · Weather: ${escape(s.weather)} · SD: ${fixed(p.projection?.sd)} · Games: ${s.sampleSize} · Latest: ${escape(s.latestGame || 'Manual')}` : 'No verified stats. Quotes are displayed without a model recommendation.';
  return `<h3>Model inputs</h3><p class="small">${stats}</p>${p.warnings.map(w=>`<p class="small">${escape(w)}</p>`).join('')}
    <h3>Best price at each line</h3><table><thead><tr><th>Line</th><th>Over</th><th>Under</th></tr></thead><tbody>${p.lines.map(l=>`<tr><td>${fixed(l.line)}</td><td>${l.over ? `${escape(l.over.bookmaker)} ${odds(l.over.odds)}` : '—'}</td><td>${l.under ? `${escape(l.under.bookmaker)} ${odds(l.under.odds)}` : '—'}</td></tr>`).join('')}</tbody></table>
    <h3>Every available quote</h3><table><thead><tr><th>Sportsbook</th><th>Side</th><th>Line</th><th>Odds</th><th>Over %</th><th>Under %</th><th>Push %</th><th>EV / $100</th><th>Edge</th><th>Book updated</th></tr></thead><tbody>${p.quotes.map(q=>`<tr><td>${escape(q.bookmaker)}</td><td>${q.side}</td><td>${fixed(q.line)}${q.alternate ? ' (alt)' : ''}</td><td>${odds(q.odds)}</td><td>${pct(q.overProb)}</td><td>${pct(q.underProb)}</td><td>${pct(q.pushProb)}</td><td>${money(q.ev)}</td><td>${edge(q.edge)}</td><td>${q.updatedAt ? escape(new Date(q.updatedAt).toLocaleString()) : 'Not supplied'}</td></tr>`).join('')}</tbody></table>`;
}
function render() {
  const all = allRows(), query = $('search').value.toLowerCase(), filter = $('filter').value;
  const rows = all.filter(p => `${p.player} ${p.team} ${p.opp}`.toLowerCase().includes(query) && (filter !== 'picks' || p.bestBet) && (filter !== 'manual' || p.manual))
    .sort((a,b)=>(b.bestBet?.ev ?? -Infinity)-(a.bestBet?.ev ?? -Infinity) || a.player.localeCompare(b.player));
  $('rows').replaceChildren();
  for (const p of rows) {
    const tr = document.createElement('tr'), detail = document.createElement('tr');
    tr.innerHTML = `<td><strong>${escape(p.player)}</strong><small>${escape(p.matchup)}</small><small>${p.manual ? `Manual · ${escape(p.date || 'Date unspecified')}` : escape(new Date(p.startTime).toLocaleString())}</small>${p.warnings.length ? '<small>See data notes ↓</small>' : ''}</td>
      <td><strong>${fixed(p.projection?.mean)} yd</strong><small>${p.booksCompared} books</small></td><td>${quoteCell(p.bestOver)}</td><td>${quoteCell(p.bestUnder)}</td>
      <td class="pick">${p.bestBet ? `<strong>${p.bestBet.side.toUpperCase()} ${fixed(p.bestBet.line)}</strong><small>${escape(p.bestBet.bookmaker)} ${odds(p.bestBet.odds)}</small>` : 'Pass'}</td><td>${escape(p.confidence)}</td><td></td>`;
    const button = document.createElement('button'); button.textContent = 'Details'; button.setAttribute('aria-expanded', 'false');
    detail.className = 'detail'; detail.hidden = true;
    const cell = document.createElement('td'); cell.colSpan = 7; cell.innerHTML = detailHTML(p); detail.append(cell);
    button.addEventListener('click', () => { detail.hidden = !detail.hidden; button.setAttribute('aria-expanded', String(!detail.hidden)); });
    tr.lastElementChild.append(button);
    if (p.manual) {
      const remove = document.createElement('button'); remove.textContent = 'Remove'; remove.addEventListener('click', () => { manual = manual.filter(m=>m.id!==p.id); save(); render(); });
      tr.lastElementChild.append(remove);
    }
    $('rows').append(tr, detail);
  }
  $('empty').hidden = rows.length > 0;
  $('empty').textContent = slate && !all.length ? `No available pregame QB props for ${slate.date}. Try a different date or manual entry.` : all.length ? 'No rows match your filters.' : "Click Update Today's Slate to load pregame props, or add a manual entry.";
  $('qbCount').textContent = all.length;
  $('bookCount').textContent = new Set(all.flatMap(p=>p.quotes.map(q=>q.bookmakerId))).size;
  $('betCount').textContent = all.filter(p=>p.bestBet).length;
  $('slateLabel').textContent = slate?.date || '—';
  $('asof').textContent = slate ? `${failed || Date.now()-Date.parse(slate.updatedAt)>slate.cacheSeconds*1000 ? 'OLD SNAPSHOT · ' : ''}Fetched ${new Date(slate.updatedAt).toLocaleTimeString()}` : 'No slate loaded';
}

async function refresh(today) {
  if (refreshing) return;
  refreshing = true; $('update').disabled = $('selectedUpdate').disabled = true;
  $('status').textContent = 'Fetching sportsbook quotes and NFL stats…';
  try {
    // Server resolves Today at request time, including across local midnight.
    const suffix = today ? '' : `?date=${encodeURIComponent($('date').value)}`;
    const response = await fetch(`/api/slate${suffix}`, { method: 'POST' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to load the slate.');
    slate = data; failed = false; $('date').value = data.date;
    $('status').textContent = `${data.players.length} QBs · ${data.eventCount} upcoming games · ${data.date} (${data.timeZone}). ${data.cached ? 'Using recent cached quotes.' : 'Update complete.'}`;
    $('warnings').textContent = data.warnings.join(' '); $('warnings').hidden = !data.warnings.length;
  } catch (error) {
    failed = true; $('status').textContent = `${error.message} Manual entry is available.${slate ? ' Previous snapshot retained; automatic picks disabled.' : ''}`;
  } finally { refreshing = false; $('update').disabled = $('selectedUpdate').disabled = false; render(); }
}
$('update').addEventListener('click', () => refresh(true));
$('selectedUpdate').addEventListener('click', () => refresh(false));
$('manualToggle').addEventListener('click', () => { $('manualPanel').hidden = !$('manualPanel').hidden; });
$('search').addEventListener('input', render); $('filter').addEventListener('change', render);
$('manualForm').addEventListener('submit', event => {
  event.preventDefault(); $('manualError').textContent = '';
  const p = Object.fromEntries(new FormData(event.target));
  for (const key of ['line','overOdds','underOdds','last5','last10','seasonAvg','projAtt','ypa','oppPassAllowed','spread','total','manualAdj']) p[key] = finite(p[key]);
  if ((!validOdds(p.overOdds) && !validOdds(p.underOdds)) || [p.overOdds,p.underOdds].some(o=>o!==null&&!validOdds(o))) {
    $('manualError').textContent = 'Enter at least one valid American price: +100 or higher, or −100 or lower.'; return;
  }
  p.date = $('date').value; p.player = p.player.trim();
  const row = manualPlayer(p);
  if (!row) { $('manualError').textContent = 'Enter a QB, line, projected attempts and yards per attempt.'; return; }
  manual.push(row); save(); render(); $('status').textContent = 'Manual prop added.';
});
$('export').addEventListener('click', () => {
  const rows = [['Date','Source','QB','Team','Opponent','Book','Side','Line','Odds','Projection','Over probability','Under probability','Push probability','EV per 100','Edge pp','Best bet','Confidence','Fetched at','Notes']];
  for (const p of allRows()) for (const q of p.quotes) rows.push([p.date||slate?.date, p.manual?'Manual':'SportsGameOdds',p.player,p.team,p.opp,q.bookmaker,q.side,q.line,q.odds,p.projection?.mean,q.overProb,q.underProb,q.pushProb,q.ev,q.edge==null?null:q.edge*100,p.bestBet?`${p.bestBet.side} ${p.bestBet.line} ${p.bestBet.bookmaker}`:'Pass',p.confidence,p.manual?'':slate?.updatedAt,p.warnings.join('; ')]);
  const csv = rows.map(row=>row.map(v=>{ let s=String(v??''); if(typeof v==='string'&&/^[=+\-@\t\r]/.test(s))s="'"+s; return '"'+s.replaceAll('"','""')+'"'; }).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})); const a=document.createElement('a');a.href=url;a.download=`nfl-passing-${slate?.date||$('date').value}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
try {
  const response = await fetch('/api/config'); if (!response.ok) throw new Error(); config = await response.json();
  $('date').value = $('date').min = config.today;
  $('date').max = new Date(Date.parse(config.today)+7*86400000).toISOString().slice(0,10);
  $('timezone').textContent = config.timeZone;
  $('status').textContent = config.oddsConfigured ? 'Ready. Update the slate to compare available pregame props.' : 'Automatic odds need SPORTSGAMEODDS_API_KEY in Render. Manual entry is ready.';
} catch { $('status').textContent = 'Server unavailable. Run the app through Node to use automatic updates. Manual entry remains available.'; }
render();
setInterval(render, 30000);
