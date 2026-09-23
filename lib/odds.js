import { dayBounds, dateInZone } from './time.js';
import { remoteJSON, PublicError } from './http.js';
import { finite, validOdds } from '../public/model.js';

const BASE = 'https://api.sportsgameodds.com/v2/events';
const LABELS = { draftkings: 'DraftKings', fanduel: 'FanDuel', betmgm: 'BetMGM', caesars: 'Caesars', fanatics: 'Fanatics', bet365: 'bet365', espnbet: 'ESPN BET' };
// Pick'em payouts are not standalone straight-bet odds and cannot share this EV calculation.
const PICKEM = /prizepicks|underdog|pick6|sleeper|betr(_|$)|chalkboard|parlayplay|dabble/i;
export const teamCode = team => {
  const value = team?.names?.short || team?.abbreviation || '';
  return ({ LA: 'LA', LAR: 'LA', JAC: 'JAX', WSH: 'WAS', OAK: 'LV', SD: 'LAC', STL: 'LA' })[value] || value;
};

export function normalizeEvents(events, date, timeZone, now = new Date()) {
  const players = new Map(), warnings = new Set();
  let eventCount = 0, skippedQuotes = 0;
  const seen = new Set();
  for (const event of events) {
    const startTime = event.status?.startsAt || event.startTime;
    if (!event.eventID || seen.has(event.eventID)) continue;
    seen.add(event.eventID);
    if (!Number.isFinite(Date.parse(startTime))) { warnings.add('An event without a valid start time was excluded.'); continue; }
    if (dateInZone(new Date(startTime), timeZone) !== date || Date.parse(startTime) <= now.getTime() ||
        event.status?.started || event.status?.cancelled || event.status?.ended) continue;
    eventCount++;
    for (const odd of Object.values(event.odds || {})) {
      if (odd.statID !== 'passing_yards' || odd.betTypeID !== 'ou' || odd.periodID !== 'game' ||
          !['over', 'under'].includes(odd.sideID) || odd.cancelled || odd.ended || odd.started) continue;
      const playerId = odd.playerID || odd.statEntityID, p = event.players?.[playerId];
      const name = p?.name || p?.names?.display || [p?.firstName, p?.lastName].filter(Boolean).join(' ');
      if (!name) { warnings.add('A player market without a player name was excluded.'); continue; }
      const home = event.teams?.home, away = event.teams?.away;
      const side = p.teamID === home?.teamID ? 'home' : p.teamID === away?.teamID ? 'away' : null;
      const key = `${event.eventID}|${playerId}`;
      if (!players.has(key)) players.set(key, {
        id: key, playerId, player: name, eventId: event.eventID, startTime,
        team: side ? teamCode(event.teams[side]) : '', opp: side ? teamCode(event.teams[side === 'home' ? 'away' : 'home']) : '',
        home: teamCode(home), away: teamCode(away),
        matchup: `${away?.names?.long || teamCode(away)} @ ${home?.names?.long || teamCode(home)}`,
        quotes: [], warnings: []
      });
      const row = players.get(key);
      for (const [bookmakerId, book] of Object.entries(odd.byBookmaker || {})) {
        if (PICKEM.test(bookmakerId)) { warnings.add('Pick’em operators excluded: their payouts are not straight-bet prices.'); continue; }
        if (book.available !== true) continue;
        for (const [index, q] of [book, ...(book.altLines || [])].entries()) {
          if (q.available === false) continue;
          const line = finite(q.overUnder), price = finite(q.odds);
          // Never substitute consensus/fair lines for a bookmaker's missing line.
          if (line === null || line < 0 || line * 2 !== Math.round(line * 2) || !validOdds(price)) { skippedQuotes++; continue; }
          const updatedAt = q.lastUpdatedAt || book.lastUpdatedAt || null;
          const quote = { side: odd.sideID, line, odds: price, bookmakerId,
            bookmaker: LABELS[bookmakerId] || bookmakerId, updatedAt, alternate: index > 0 };
          const existing = row.quotes.findIndex(x => x.side === quote.side && x.line === line && x.bookmakerId === bookmakerId);
          if (existing < 0) row.quotes.push(quote);
          else if (Date.parse(updatedAt) > Date.parse(row.quotes[existing].updatedAt)) row.quotes[existing] = quote;
        }
      }
    }
  }
  if (skippedQuotes) warnings.add(`${skippedQuotes} malformed bookmaker quotes were excluded.`);
  return { eventCount, players: [...players.values()], warnings: [...warnings] };
}

export async function fetchPassingSlate(date, { env = process.env, fetchImpl = fetch, now = new Date() } = {}) {
  const key = env.SPORTSGAMEODDS_API_KEY;
  if (!key) throw new PublicError('Add SPORTSGAMEODDS_API_KEY to the Render environment. You can reuse the key from mlb-k-site.', 503);
  const timeZone = env.SLATE_TIMEZONE || 'America/Denver';
  const bounds = dayBounds(date, timeZone);
  const params = new URLSearchParams({ leagueID: 'NFL', oddsAvailable: 'true', started: 'false', cancelled: 'false',
    oddID: 'passing_yards-PLAYER_ID-game-ou-over', includeOpposingOdds: 'true', includeAltLines: 'true',
    startsAfter: bounds.start, startsBefore: bounds.end, limit: '100' });
  if (env.ODDS_BOOKMAKERS) params.set('bookmakerID', env.ODDS_BOOKMAKERS);
  const events = [], cursors = new Set();
  for (let page = 0; ; page++) {
    if (page >= 50) throw new PublicError('The odds provider returned too many pages. No incomplete slate was saved.');
    const data = await remoteJSON(`${BASE}?${params}`, { fetchImpl, headers: { 'x-api-key': key }, label: 'SportsGameOdds' });
    if (data.success === false || !Array.isArray(data.data)) throw new PublicError('SportsGameOdds returned an invalid event list.');
    events.push(...data.data);
    if (!data.nextCursor) break;
    if (cursors.has(data.nextCursor)) throw new PublicError('SportsGameOdds repeated a pagination cursor. Please retry.');
    cursors.add(data.nextCursor); params.set('cursor', data.nextCursor);
  }
  return { provider: 'SportsGameOdds', date, timeZone, ...normalizeEvents(events, date, timeZone, now) };
}
