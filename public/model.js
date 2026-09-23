export const finite = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
export const validOdds = value => finite(value) !== null && Math.abs(Number(value)) >= 100;
export const decimal = odds => odds > 0 ? 1 + odds / 100 : 1 + 100 / Math.abs(odds);
const clamp = (x, low, high) => Math.max(low, Math.min(high, x));

export function normalCDF(x) {
  const sign = x < 0 ? -1 : 1;
  const z = Math.abs(x) / Math.SQRT2, t = 1 / (1 + 0.3275911 * z);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t) * Math.exp(-z * z);
  return 0.5 * (1 + sign * erf);
}

export function probabilities(line, mean, sd) {
  // Integer-valued yards: 250.5 has no push; 250 has a separate mass at 250.
  const under = normalCDF((Math.ceil(line) - 0.5 - mean) / sd);
  const over = 1 - normalCDF((Math.floor(line) + 0.5 - mean) / sd);
  return { over, under, push: Math.max(0, 1 - over - under) };
}

export function project(s) {
  const attempts = finite(s.projAtt), ypa = finite(s.ypa);
  if (!(attempts > 0 && ypa > 0)) return null;
  const attemptYards = attempts * ypa;
  const season = finite(s.seasonAvg) ?? attemptYards;
  const recent = finite(s.last5) ?? season, ten = finite(s.last10) ?? season;
  const base = recent * .30 + ten * .20 + season * .20 + attemptYards * .30;
  const defense = finite(s.oppPassAllowed) === null ? 0 : clamp((s.oppPassAllowed - 220) * .18, -15, 15);
  const total = finite(s.total) === null ? 0 : clamp((s.total - 44) * 1.5, -15, 15);
  const spread = clamp((finite(s.spread) ?? 0) * 2, -14, 14);
  const weather = s.weather === 'dome' ? 5 : s.weather === 'bad' ? -12 : 0;
  const mean = Math.max(0, base + defense + total + spread + weather + (finite(s.manualAdj) ?? 0));
  // Same distribution for every book/line. Market line must not alter the projection or SD.
  const sd = Math.max(45, finite(s.sd) ?? (28 + attempts * .75 + mean * .035));
  return { mean, sd };
}

export function evaluate(quote, projection) {
  if (!projection || !validOdds(quote.odds)) return { ...quote, probability: null, ev: null, edge: null };
  const p = probabilities(quote.line, projection.mean, projection.sd);
  const win = p[quote.side], lose = p[quote.side === 'over' ? 'under' : 'over'];
  const ev = 100 * (win * (decimal(quote.odds) - 1) - lose);
  // Unconditional break-even probability allows for refunded pushes.
  const implied = (1 - p.push) / decimal(quote.odds);
  return { ...quote, probability: win, overProb: p.over, underProb: p.under, pushProb: p.push, ev, edge: win - implied };
}

export function comparePlayer(player, stats = null) {
  const projection = stats ? project(stats) : null;
  const quotes = player.quotes.map(q => evaluate(q, projection));
  const select = side => quotes.filter(q => q.side === side).sort((a, b) => {
    if (projection) return b.ev - a.ev || decimal(b.odds) - decimal(a.odds);
    return (side === 'over' ? a.line - b.line : b.line - a.line) || decimal(b.odds) - decimal(a.odds);
  })[0] || null;
  const bestOver = select('over'), bestUnder = select('under');
  const candidate = [bestOver, bestUnder].filter(q => q?.ev !== null && q?.ev !== undefined).sort((a, b) => b.ev - a.ev)[0];
  const eligible = stats && !stats.stale && (stats.manual || stats.sampleSize >= 3);
  const bestBet = eligible && candidate?.ev > 0 && candidate.edge >= .015 ? candidate : null;
  // Confidence describes data support, not a calibrated chance of winning.
  const confidence = !projection ? 'Unavailable' : !bestBet || stats.manual || stats.sampleSize < 8 || stats.currentSeasonGames < 3 || stats.warnings?.length ? 'Low' : 'Medium';
  const lines = [...new Set(quotes.map(q => q.line))].sort((a,b) => a-b).map(line => ({
    line,
    over: quotes.filter(q => q.line === line && q.side === 'over').sort((a,b) => decimal(b.odds)-decimal(a.odds))[0] || null,
    under: quotes.filter(q => q.line === line && q.side === 'under').sort((a,b) => decimal(b.odds)-decimal(a.odds))[0] || null
  }));
  return { ...player, quotes, stats, projection, bestOver, bestUnder, bestBet, confidence, lines,
    booksCompared: new Set(quotes.map(q => q.bookmakerId)).size };
}
