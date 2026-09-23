export const DATE = '2026-09-27';
export const NOW = new Date('2026-09-27T15:00:00Z');
export const ENV = { SPORTSGAMEODDS_API_KEY: 'test-key-not-real', SLATE_TIMEZONE: 'America/Denver' };
const book = (line, odds, extra = {}) => ({ available: true, overUnder: String(line), odds: String(odds), lastUpdatedAt: '2026-09-27T14:59:00Z', ...extra });
const market = (playerID, sideID, byBookmaker) => ({ playerID, statEntityID: playerID, statID: 'passing_yards', periodID: 'game', betTypeID: 'ou', sideID, byBookmaker });
export function eventFixture() {
  return {
    eventID: 'game-one', leagueID: 'NFL', status: { startsAt: '2026-09-27T20:25:00Z', started: false, cancelled: false },
    teams: { home: { teamID: 'KC_NFL', names: { short: 'KC', long: 'Kansas City Chiefs' } }, away: { teamID: 'DEN_NFL', names: { short: 'DEN', long: 'Denver Broncos' } } },
    players: { PATRICK: { name: 'Patrick Mahomes', teamID: 'KC_NFL' }, ROOKIE: { name: 'Rookie QB', teamID: 'DEN_NFL' } },
    odds: {
      over: market('PATRICK','over', { draftkings: book(245.5,-110,{altLines:[book(220.5,-150)]}), fanduel:book(245.5,100), betmgm:book(250.5,110), suspended:book(1,500,{available:false}), prizepicks:book(220,100) }),
      under: market('PATRICK','under', { draftkings:book(245.5,-110), fanduel:book(245.5,-120), betmgm:book(250.5,-110) }),
      rookie: market('ROOKIE','over', { fanduel:book(200.5,-110) })
    }
  };
}
const csv = (headers, rows) => [headers.join(','), ...rows.map(r=>headers.map(h=>r[h]??'').join(','))].join('\n');
export function statsFixtures() {
  const schedule = [], players = [], teams = [];
  for (let i = 1; i <= 3; i++) {
    const game_id = `2026_0${i}_KC_DEN`, gameday = `2026-09-${String(i*7-1).padStart(2,'0')}`;
    schedule.push({game_id,season:2026,game_type:'REG',week:i,gameday,home_team:'DEN',away_team:'KC',home_score:20,away_score:24,home_qb_id:'rookie',away_qb_id:'00-patrick'});
    players.push({game_id,season:2026,week:i,season_type:'REG',player_id:'00-patrick',player_display_name:'Patrick Mahomes',position:'QB',team:'KC',opponent_team:'DEN',attempts:36,passing_yards:260+i*5});
    teams.push({game_id,season:2026,week:i,season_type:'REG',team:'KC',opponent_team:'DEN',attempts:36,passing_yards:260+i*5});
    teams.push({game_id,season:2026,week:i,season_type:'REG',team:'DEN',opponent_team:'KC',attempts:31,passing_yards:215});
  }
  schedule.push({game_id:'2026_04_DEN_KC',season:2026,game_type:'REG',week:4,gameday:DATE,home_team:'KC',away_team:'DEN',home_qb_id:'00-patrick',away_qb_id:'rookie',spread_line:3,total_line:47,roof:'outdoors'});
  // A future boxscore must never enter the projection.
  players.push({...players[0],game_id:'2026_04_DEN_KC',week:4,passing_yards:999});
  return {
    schedule:csv(['game_id','season','game_type','week','gameday','home_team','away_team','home_score','away_score','home_qb_id','away_qb_id','spread_line','total_line','roof'],schedule),
    player:csv(['game_id','season','week','season_type','player_id','player_display_name','position','team','opponent_team','attempts','passing_yards'],players),
    team:csv(['game_id','season','week','season_type','team','opponent_team','attempts','passing_yards'],teams)
  };
}
export function fixtureFetch({ oddsStatus = 200, statsFail = false, empty = false } = {}) {
  const calls = [], f = statsFixtures();
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url:String(url), headers:options.headers });
    if (String(url).includes('sportsgameodds')) return new Response(JSON.stringify(oddsStatus === 200 ? {success:true,data:empty?[]:[eventFixture()]} : {error:'provider error test-key-not-real'}),{status:oddsStatus});
    if (statsFail) return new Response('unavailable',{status:503});
    let body = String(url).endsWith('games.csv') ? f.schedule : String(url).includes('stats_player') ? f.player : f.team;
    if (String(url).includes('_2025.csv')) body = body.replaceAll('2026','2025');
    return new Response(body);
  };
  return { fetchImpl, calls };
}
