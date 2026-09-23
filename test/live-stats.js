import assert from 'node:assert/strict';
import { createStatsProvider, playerStats } from '../lib/stats.js';
import { dateInZone } from '../lib/time.js';
const date = process.argv[2] || dateInZone(new Date(), 'America/Denver');
const data = await createStatsProvider().load(date);
assert.ok(data.players.length > 0, 'No player stats downloaded');
assert.ok(data.teams.length > 0, 'No team stats downloaded');
const game = data.schedule.find(g=>g.gameday>=date && g.home_qb_name && g.home_team);
console.log(JSON.stringify({ date, players:data.players.length, teams:data.teams.length, schedule:data.schedule.length, warnings:data.warnings }));
if(game) {
  const stats=playerStats({player:game.home_qb_name,home:game.home_team,away:game.away_team,team:game.home_team},data,game.gameday);
  assert.ok(stats.projAtt > 0 && stats.ypa > 0);
  console.log(JSON.stringify({ player:game.home_qb_name,date:game.gameday,last5:stats.last5,oppPassAllowed:stats.oppPassAllowed,sampleSize:stats.sampleSize }));
}
