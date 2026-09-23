import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchPassingSlate, normalizeEvents } from '../lib/odds.js';
import { createStatsProvider, playerStats, parseCSV } from '../lib/stats.js';
import { DATE,NOW,ENV,eventFixture,fixtureFetch } from './fixtures.js';
test('keeps both sides, alt lines and missing-stat players; rejects suspended/pickem',()=>{
  const s=normalizeEvents([eventFixture(),eventFixture()],DATE,ENV.SLATE_TIMEZONE,NOW);
  assert.equal(s.eventCount,1);assert.equal(s.players.length,2);assert.equal(s.players[0].quotes.length,7);
  assert.ok(!s.players[0].quotes.some(q=>q.bookmakerId==='prizepicks'||q.bookmakerId==='suspended'));
});
test('ignores live, wrong date, other periods and malformed bookmaker prices',()=>{
  const e=eventFixture();e.odds.over.byBookmaker.bad={available:true,odds:'-110'};
  e.odds.quarter={...e.odds.over,periodID:'1q'};
  const s=normalizeEvents([e],DATE,ENV.SLATE_TIMEZONE,NOW);assert.equal(s.players[0].quotes.length,7);assert.ok(s.warnings.some(w=>w.includes('malformed')));
  e.status.started=true;assert.equal(normalizeEvents([e],DATE,ENV.SLATE_TIMEZONE,NOW).players.length,0);
  e.status.started=false;e.status.startsAt='2026-09-28T20:00:00Z';assert.equal(normalizeEvents([e],DATE,ENV.SLATE_TIMEZONE,NOW).players.length,0);
});
test('pagination, documented market query, API key header and repeated-cursor guard',async()=>{
  const urls=[];const fetchImpl=async(url,options)=>{urls.push(String(url));assert.equal(options.headers['x-api-key'],ENV.SPORTSGAMEODDS_API_KEY);return new Response(JSON.stringify(urls.length===1?{data:[eventFixture()],nextCursor:'next'}:{data:[]}));};
  const result=await fetchPassingSlate(DATE,{env:ENV,now:NOW,fetchImpl});assert.equal(result.players.length,2);assert.equal(urls.length,2);
  const u=new URL(urls[0]);assert.equal(u.searchParams.get('oddID'),'passing_yards-PLAYER_ID-game-ou-over');assert.equal(u.searchParams.get('startsAfter'),'2026-09-27T06:00:00.000Z');assert.ok(!urls[0].includes(ENV.SPORTSGAMEODDS_API_KEY));
  await assert.rejects(fetchPassingSlate(DATE,{env:ENV,now:NOW,fetchImpl:async()=>new Response(JSON.stringify({data:[],nextCursor:'same'}))}),/repeated/);
});
test('provider failures are actionable and never echo API response secrets',async()=>{
  await assert.rejects(fetchPassingSlate(DATE,{env:{}}),/SPORTSGAMEODDS_API_KEY/);
  for(const status of [401,403,429,500]) {
    const f=fixtureFetch({oddsStatus:status});await assert.rejects(fetchPassingSlate(DATE,{env:ENV,now:NOW,fetchImpl:f.fetchImpl}),e=>e.message.includes(String(status))&&!e.message.includes('test-key-not-real'));
  }
});
test('automatic stats exclude future games, calculate defense and cache downloads',async()=>{
  const f=fixtureFetch(),provider=createStatsProvider({fetchImpl:f.fetchImpl,now:()=>NOW});const data=await provider.load(DATE);
  const p=normalizeEvents([eventFixture()],DATE,ENV.SLATE_TIMEZONE,NOW).players[0];const s=playerStats(p,data,DATE);
  assert.equal(s.last5,270);assert.equal(s.oppPassAllowed,270);assert.equal(s.spread,-3);assert.equal(s.stale,false);
  await provider.load(DATE);assert.equal(f.calls.length,5);
  assert.throws(()=>playerStats({...p,player:'Unknown'},data,DATE),/No NFL QB history/);
});
test('CSV parser accepts quoted comma, CRLF and escaped quote',()=>{
  assert.deepEqual(parseCSV(`name,value\r\n"QB, ""One""",2\r\n`)[0],{name:'QB, "One"',value:'2'});
});
