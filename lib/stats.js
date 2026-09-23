import { getRemote, PublicError } from './http.js';
import { seasonForDate } from './time.js';
import { finite } from '../public/model.js';

export const SCHEDULE_URL = 'https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv';
export const statsURL = (type, year) => `https://github.com/nflverse/nflverse-data/releases/download/stats_${type}/stats_${type}_week_${year}.csv`;
export const normalizeName = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, '').replace(/[^a-z]/g, '');
const code = s => ({ LAR: 'LA', JAC: 'JAX', WSH: 'WAS', OAK: 'LV', SD: 'LAC' })[s] || s;
const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const sum = a => a.reduce((x, y) => x + y, 0);

export function parseCSV(text) {
  const rows = []; let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted;
    } else if (!quoted && (char === ',' || char === '\n')) {
      row.push(cell.replace(/\r$/, '')); cell = '';
      if (char === '\n') { rows.push(row); row = []; }
    } else cell += char;
  }
  if (quoted) throw new PublicError('NFL stats CSV is malformed.');
  if (cell || row.length) { row.push(cell.replace(/\r$/, '')); rows.push(row); }
  const headers = rows.shift()?.map(h => h.replace(/^\uFEFF/, '')) || [];
  return rows.filter(r => r.length === headers.length).map(r => Object.fromEntries(headers.map((h, i) => [h, r[i]])));
}

export function createStatsProvider({ fetchImpl = fetch, ttlMs = 3600000, now = () => new Date() } = {}) {
  const cache = new Map();
  async function csv(url) {
    const hit = cache.get(url);
    if (hit && now().getTime() - hit.at < ttlMs) return hit.promise;
    const promise = (async () => {
      const response = await getRemote(url, { fetchImpl, label: 'nflverse stats' });
      const rows = parseCSV(await response.text());
      if (!rows.length) throw new PublicError('nflverse returned an empty stats file.');
      return rows;
    })();
    cache.set(url, { at: now().getTime(), promise });
    try { return await promise; } catch (error) { cache.delete(url); throw error; }
  }
  return {
    async load(date) {
      const season = seasonForDate(date);
      const [schedule, ...files] = await Promise.all([
        csv(SCHEDULE_URL), ...[season, season - 1].flatMap(y => ['player', 'team'].map(type => csv(statsURL(type, y)).then(rows => ({ rows, type, year: y }), error => ({ rows: [], type, year: y, error: error.message }))))
      ]);
      if (!schedule[0]?.game_id || !schedule[0]?.gameday) throw new PublicError('nflverse schedule columns changed.');
      const warnings = files.filter(f => f.error).map(f => `${f.year} ${f.type} stats unavailable. ${f.error}`);
      const players = files.filter(f => f.type === 'player').flatMap(f => f.rows);
      const teams = files.filter(f => f.type === 'team').flatMap(f => f.rows);
      return { season, schedule, players, teams, warnings, fetchedAt: now().toISOString() };
    }
  };
}

export function playerStats(player, data, date) {
  const { schedule, season } = data;
  const name = normalizeName(player.player);
  const upcoming = schedule.find(g => g.gameday === date && code(g.home_team) === player.home && code(g.away_team) === player.away);
  if (!upcoming) throw new PublicError('No matching nflverse matchup for this date. Manual entry is available.');
  let team = player.team;
  if (!team) {
    if (normalizeName(upcoming.home_qb_name) === name) team = code(upcoming.home_team);
    else if (normalizeName(upcoming.away_qb_name) === name) team = code(upcoming.away_team);
  }
  if (![player.home, player.away].includes(team)) throw new PublicError('Player team could not be verified.');
  const opp = team === player.home ? player.away : player.home;
  const gameById = new Map(schedule.map(g => [g.game_id, g]));
  const gameFor = r => gameById.get(r.game_id) || schedule.find(g => +g.season === +r.season && +g.week === +r.week && g.game_type === r.season_type && [g.home_team, g.away_team].includes(r.team || r.recent_team));
  const before = r => {
    const g = gameFor(r);
    return g && ['REG', 'POST', 'WC', 'DIV', 'CON', 'SB'].includes(g.game_type) && g.gameday < date && g.gameday >= new Date(Date.parse(date) - 400 * 86400000).toISOString().slice(0, 10);
  };
  const matches = data.players.filter(r => normalizeName(r.player_display_name) === name && r.position === 'QB');
  const ids = new Set(matches.map(r => r.player_id));
  if (ids.size !== 1) throw new PublicError(ids.size ? 'Ambiguous player match. Use manual entry.' : 'No NFL QB history found. Use manual entry for this player.');
  const history = matches.filter(r => before(r) && finite(r.passing_yards) !== null && +r.attempts >= 10).filter(r => {
    const g = gameFor(r), rTeam = code(r.team || r.recent_team);
    const starter = rTeam === code(g.home_team) ? g.home_qb_id : g.away_qb_id;
    return !starter || starter === r.player_id;
  }).sort((a, b) => gameFor(b).gameday.localeCompare(gameFor(a).gameday));
  if (!history.length) throw new PublicError('No qualifying QB starts before this slate. Use manual entry.');
  const last10 = history.slice(0, 10), last5 = history.slice(0, 5), current = history.filter(r => +r.season === season);
  const baseline = current.length >= 3 ? current : history.slice(0, 17);
  const projAtt = .65 * avg(last5.map(r => +r.attempts)) + .35 * avg(baseline.map(r => +r.attempts));
  const teamHistory = data.teams.filter(r => before(r));
  const offense = teamHistory.filter(r => code(r.team) === team).sort((a,b) => gameFor(b).gameday.localeCompare(gameFor(a).gameday)).slice(0,10);
  const defense = teamHistory.filter(r => code(r.opponent_team) === opp && finite(r.passing_yards) !== null).sort((a,b) => gameFor(b).gameday.localeCompare(gameFor(a).gameday)).slice(0,10);
  const yards = last10.map(r => +r.passing_yards), mean = avg(yards);
  const latestCompleted = schedule.filter(g => +g.season === season && g.gameday < date && g.home_score !== '' && g.away_score !== '' && [code(g.home_team), code(g.away_team)].includes(team) && g.game_type !== 'PRE').sort((a,b) => b.gameday.localeCompare(a.gameday))[0];
  const latestPlayerDate = gameFor(history[0]).gameday;
  const stale = !!latestCompleted && latestCompleted.gameday > latestPlayerDate;
  const warnings = [...data.warnings];
  if (current.length < 3) warnings.push('Limited current-season history; previous-season starts included.');
  if (history.length < 3) warnings.push('Fewer than 3 qualifying starts: no automatic pick.');
  if (!defense.length) warnings.push('Opponent stats unavailable; defense adjustment omitted.');
  if (stale) warnings.push('QB history trails the team’s latest completed game; no automatic pick.');
  const home = team === code(upcoming.home_team);
  const spread = finite(upcoming.spread_line);
  const weather = ['dome', 'closed'].includes(upcoming.roof) ? 'dome' : 'neutral';
  return { team, opp, last5: avg(last5.map(r=>+r.passing_yards)), last10: mean,
    seasonAvg: avg(baseline.map(r=>+r.passing_yards)), projAtt,
    ypa: sum(baseline.map(r=>+r.passing_yards)) / sum(baseline.map(r=>+r.attempts)),
    oppPassAllowed: avg(defense.map(r=>+r.passing_yards)),
    teamPassYards: avg(offense.map(r=>+r.passing_yards)), teamAttempts: avg(offense.map(r=>+r.attempts)),
    spread: spread === null ? null : (home ? -spread : spread), total: finite(upcoming.total_line),
    weather, manualAdj: 0, sd: yards.length > 1 ? Math.sqrt(sum(yards.map(y=>(y-mean)**2))/(yards.length-1)) : 65,
    sampleSize: last10.length, currentSeasonGames: current.length, baselineSeason: current.length >= 3 ? 'Current season' : 'Current + previous season',
    latestGame: latestPlayerDate, stale, warnings, source: 'nflverse',
    recentGames: last10.map(r=>({ date: gameFor(r).gameday, yards: +r.passing_yards, attempts: +r.attempts, opponent: r.opponent_team })) };
}
