import test from 'node:test';
import assert from 'node:assert/strict';
import { probabilities, evaluate, comparePlayer, project, validOdds } from '../public/model.js';
import { dayBounds, seasonForDate } from '../lib/time.js';
const stats={projAtt:35,ypa:8,last5:280,last10:280,seasonAvg:280,sampleSize:10,currentSeasonGames:4};
test('half-yard thresholds have no continuity shift or push',()=>{
  const p=probabilities(250.5,250.5,50); assert.ok(Math.abs(p.over-.5)<1e-7); assert.ok(p.push<1e-7);
});
test('integer line separates win, loss, push and refunds stake',()=>{
  const p=probabilities(250,250,50); assert.ok(p.push>0); assert.ok(Math.abs(p.over-p.under)<1e-7);
  const q=evaluate({side:'over',line:250,odds:100},{mean:250,sd:50}); assert.ok(Math.abs(q.ev)<1e-7);
  assert.ok(Math.abs(p.over+p.under+p.push-1)<1e-7);
});
test('negative/positive odds and invalid prices',()=>{
  assert.equal(evaluate({side:'over',line:250.5,odds:200},{mean:250.5,sd:50}).ev.toFixed(1),'50.0');
  assert.equal(validOdds(0),false);assert.equal(validOdds(null),false);assert.equal(validOdds(-99),false);
});
test('compares every line by EV and same-line quotes by payout',()=>{
  const player={quotes:[{side:'over',line:240.5,odds:-110,bookmakerId:'a'},{side:'over',line:240.5,odds:100,bookmakerId:'b'},{side:'under',line:260.5,odds:-110,bookmakerId:'a'}]};
  const p=comparePlayer(player,stats);assert.equal(p.bestOver.bookmakerId,'b');assert.equal(p.lines[0].over.bookmakerId,'b');assert.equal(p.bestBet.side,'over');assert.equal(p.confidence,'Medium');
  assert.deepEqual(project({...stats,line:100}),project({...stats,line:500}));
});
test('missing and sparse/stale stats cannot create confident picks',()=>{
  const p={quotes:[{side:'over',line:100,odds:100,bookmakerId:'a'}]};
  assert.equal(comparePlayer(p).bestBet,null);assert.equal(comparePlayer(p).confidence,'Unavailable');
  assert.equal(comparePlayer(p,{...stats,sampleSize:2}).bestBet,null);
  assert.equal(comparePlayer(p,{...stats,stale:true}).bestBet,null);
});
test('date bounds handle Denver DST and NFL season rollover',()=>{
  let b=dayBounds('2026-03-08','America/Denver');assert.equal((Date.parse(b.end)-Date.parse(b.start))/3600000,23);
  b=dayBounds('2026-11-01','America/Denver');assert.equal((Date.parse(b.end)-Date.parse(b.start))/3600000,25);
  assert.equal(seasonForDate('2027-01-05'),2026);assert.throws(()=>dayBounds('2026-02-30','America/Denver'));
});
