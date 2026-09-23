import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server.js';
import {DATE,NOW,ENV,fixtureFetch} from './fixtures.js';
async function serve(t, options) { const server=createApp(options);await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));return `http://127.0.0.1:${server.address().port}`; }
test('full HTTP slate pipeline, caching, confidential file denial',async t=>{
  const f=fixtureFetch();const base=await serve(t,{env:ENV,fetchImpl:f.fetchImpl,now:()=>NOW});
  const [a,b]=await Promise.all([1,2].map(()=>fetch(`${base}/api/slate?date=${DATE}`,{method:'POST'}).then(r=>r.json())));
  assert.equal(a.players.length,2);assert.ok(a.players[0].projection.mean>250);assert.equal(a.players[1].projection,null);assert.equal(b.players.length,2);assert.equal(f.calls.length,6);
  const cached=await fetch(`${base}/api/slate`,{method:'POST'}).then(r=>r.json());assert.equal(cached.cached,true);assert.equal(f.calls.length,6);
  for(const path of ['/.env','/server.js','/package.json','/lib/odds.js','/nfl-passing-yards-site.zip'])assert.equal((await fetch(base+path)).status,404);
  const config=await fetch(base+'/api/config').then(r=>r.text());assert.ok(!config.includes(ENV.SPORTSGAMEODDS_API_KEY));
  assert.equal((await fetch(base+'/api/slate?date=2026-02-30',{method:'POST'})).status,400);
  assert.equal((await fetch(base+'/healthz')).status,200);
});
test('missing key and failed stats preserve manual app and odds rows',async t=>{
  const base=await serve(t,{env:{},now:()=>NOW});assert.equal((await fetch(base+'/')).status,200);assert.equal((await fetch(base+'/api/slate',{method:'POST'})).status,503);
  const f=fixtureFetch({statsFail:true});const other=await serve(t,{env:ENV,now:()=>NOW,fetchImpl:f.fetchImpl});
  const data=await fetch(other+'/api/slate',{method:'POST'}).then(r=>r.json());assert.equal(data.players.length,2);assert.equal(data.players[0].bestBet,null);assert.ok(data.warnings.length);
});
test('empty slate is success and does not request stats',async t=>{
  const f=fixtureFetch({empty:true});const base=await serve(t,{env:ENV,now:()=>NOW,fetchImpl:f.fetchImpl});
  const data=await fetch(base+'/api/slate',{method:'POST'}).then(r=>r.json());assert.deepEqual(data.players,[]);assert.equal(f.calls.length,1);
});
