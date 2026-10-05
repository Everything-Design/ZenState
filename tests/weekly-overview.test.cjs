const test=require('node:test');const assert=require('node:assert/strict');
const {parseWeeklyOverview}=require('../.test-weekly/shared/weeklyOverview.js');
const {fetchWeeklyOverview}=require('../.test-weekly/main/services/weeklyOverview.js');
const fixture=()=>structuredClone(require('./fixtures/weekly-overview.json'));
const auth={accessToken:'secret',accountId:'123',identityKey:'10'};
test('personal schema allowlists every level, preserves growth, overruns, leave and targets',()=>{
 const f=fixture();f.salary=999999;f.projects[0].budget=999999;f.totals[0].revenue=999999;f.needsYou[0].otherPerson=999999;f.capacity[0].cost=999999;
 const d=parseWeeklyOverview(f,'123','2026-10-05');assert.equal(d.totals[1].category,'growth');assert.equal(d.projects[0].remainingHours,-2);assert.equal(d.leave[0].half,'second');assert.ok(!JSON.stringify(d).includes('999999'));
});
test('rejects wrong account/week, incomplete or malformed additions',()=>{
 assert.throws(()=>parseWeeklyOverview(fixture(),'999','2026-10-05'));assert.throws(()=>parseWeeklyOverview(fixture(),'123','2026-10-12'));
 for(const mutate of [f=>delete f.capacity,f=>f.projects[0].progress.percent=101,f=>f.totals[0].targetHours=-1,f=>f.leave[0].date='2026-02-30',f=>f.capacity[1].weekStart='2026-10-19',f=>f.needsYou[0].kind='team_summary',f=>f.projectScope='billable']){const f=fixture();mutate(f);assert.throws(()=>parseWeeklyOverview(f,'123','2026-10-05'));}
});
test('only fixed trusted endpoint receives credentials; redirect forbidden and unavailable stays safe',async()=>{
 const good=await fetchWeeklyOverview('2026-10-05',()=>auth,async(url,init)=>{assert.equal(url,'https://ops.everythingflow.agency/api/me/weekly-overview?weekStart=2026-10-05');assert.equal(init.redirect,'error');assert.equal(init.headers.Authorization,'Bearer secret');return Response.json(fixture());});assert.equal(good.ok,true);
 for(const fetcher of [async()=>new Response('',{status:401}),async()=>{throw Error('secret');},async()=>Response.json({}),async()=>new Response('x'.repeat(2000001))]){const r=await fetchWeeklyOverview('2026-10-05',()=>auth,fetcher);assert.equal(r.ok,false);assert.ok(!JSON.stringify(r).includes('secret'));}
});
test('discards account or token changes during headers and body; invalid input never fetches',async()=>{
 for(const duringBody of [false,true]){let current=auth;const r=await fetchWeeklyOverview('2026-10-05',()=>current,async()=>{if(!duringBody)current={...auth,identityKey:'11'};return {ok:true,text:async()=>{current={...auth,accessToken:'changed'};return JSON.stringify(fixture());}};});assert.equal(r.ok,false);}
 assert.equal((await fetchWeeklyOverview('bad',()=>auth,()=>{throw Error('never');})).ok,false);assert.equal((await fetchWeeklyOverview('2026-10-05',()=>null,()=>{throw Error('never');})).ok,false);
});
