import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { fetchPassingSlate } from './lib/odds.js';
import { createStatsProvider, playerStats } from './lib/stats.js';
import { dateInZone, validDate } from './lib/time.js';
import { comparePlayer } from './public/model.js';
import { PublicError } from './lib/http.js';

const assets = {
  '/': ['index.html', 'text/html'], '/index.html': ['index.html', 'text/html'],
  '/app.js': ['public/app.js', 'text/javascript'], '/model.js': ['public/model.js', 'text/javascript'],
  '/style.css': ['public/style.css', 'text/css']
};
const seconds = (v, fallback, min, max) => Math.min(max, Math.max(min, Number(v) || fallback));

export function createApp({ env = process.env, fetchImpl = fetch, now = () => new Date() } = {}) {
  const timeZone = env.SLATE_TIMEZONE || 'America/Denver';
  dateInZone(now(), timeZone);
  const ttl = seconds(env.SLATE_CACHE_SECONDS, 120, 30, 900) * 1000;
  const stats = createStatsProvider({ fetchImpl, ttlMs: seconds(env.STATS_CACHE_SECONDS, 3600, 300, 86400) * 1000, now });
  const cache = new Map(), pending = new Map();
  let lastFailure = null;
  async function update(date) {
    const cached = cache.get(date);
    const present = (data, cacheHit) => ({ ...data, cached: cacheHit,
      players: data.players.filter(p => Date.parse(p.startTime) > now().getTime()) });
    if (cached && now().getTime() - cached.at < ttl) return present(cached.data, true);
    if (pending.has(date)) return pending.get(date);
    if (pending.size) throw new PublicError('Another slate is updating. Try again in a moment.', 429);
    if (lastFailure && now().getTime() - lastFailure.at < 30000) throw lastFailure.error;
    const promise = (async () => {
      const slate = await fetchPassingSlate(date, { env, fetchImpl, now: now() });
      let dataset = null, statsError = null;
      if (slate.players.length) {
        try { dataset = await stats.load(date); } catch (error) { statsError = error.message; }
      }
      const players = slate.players.map(p => {
        try {
          if (!dataset) throw new PublicError(statsError || 'Stats unavailable.');
          const inputs = playerStats(p, dataset, date);
          return comparePlayer({ ...p, team: inputs.team, opp: inputs.opp, warnings: inputs.warnings }, inputs);
        } catch (error) { return comparePlayer({ ...p, warnings: [error.message] }); }
      });
      const data = { ...slate, players, updatedAt: now().toISOString(), statsFetchedAt: dataset?.fetchedAt || null,
        cacheSeconds: ttl / 1000, modelVersion: '2.0-heuristic',
        warnings: [...slate.warnings, ...(dataset?.warnings || []), ...(statsError ? [statsError] : [])] };
      cache.set(date, { at: now().getTime(), data });
      if (cache.size > 8) cache.delete(cache.keys().next().value);
      return present(data, false);
    })();
    pending.set(date, promise);
    try { return await promise; }
    catch (error) { lastFailure = { at: now().getTime(), error }; throw error; }
    finally { pending.delete(date); }
  }
  return http.createServer(async (req, res) => {
    const json = (status, payload) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(JSON.stringify(payload));
    };
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/healthz' && req.method === 'GET') return json(200, { ok: true });
      if (url.pathname === '/api/config' && req.method === 'GET') return json(200, {
        today: dateInZone(now(), timeZone), timeZone, oddsConfigured: !!env.SPORTSGAMEODDS_API_KEY,
        provider: 'SportsGameOdds', cacheSeconds: ttl / 1000
      });
      if (url.pathname === '/api/slate' && req.method === 'POST') {
        if (req.headers['sec-fetch-site'] === 'cross-site') return json(403, { error: 'Use Update Today’s Slate from this site.' });
        const date = url.searchParams.get('date') || dateInZone(now(), timeZone), today = dateInZone(now(), timeZone);
        if (!validDate(date) || date < today || Date.parse(date) > Date.parse(today) + 7 * 86400000)
          return json(400, { error: 'Choose today or a date within the next 7 days. Historical odds are not supported.' });
        return json(200, await update(date));
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return json(405, { error: 'Method not allowed.' });
      const asset = assets[url.pathname];
      if (!asset) return json(404, { error: 'Not found.' });
      const body = await readFile(new URL(asset[0], import.meta.url));
      res.writeHead(200, { 'Content-Type': `${asset[1]}; charset=utf-8`, 'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
        'Referrer-Policy': 'no-referrer' });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch (error) {
      json(error instanceof PublicError ? error.status : 500, { error: error instanceof PublicError ? error.message : 'Unable to update the slate. Please retry or use manual entry.' });
    }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createApp();
  server.listen(Number(process.env.PORT) || 3000, '0.0.0.0', () => console.log(`NFL Passing Yards site running on port ${server.address().port}`));
}
