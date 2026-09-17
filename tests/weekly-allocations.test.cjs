const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const shared = require('../.test-weekly/shared/weeklyAllocations.js');
const service = require('../.test-weekly/main/services/weeklyAllocations.js');
const fixture = () => ({ schemaVersion:1,projectScope:'billable',basecampAccountId:'123',basecampPersonId:'10',week:{startDate:'2026-09-14',endDate:'2026-09-20',timezone:'Asia/Kolkata'},generatedAt:'2026-09-16T08:05:00Z',planningRevision:4,planningUpdatedAt:null,basecampSync:{lastSuccessfulAt:'2026-09-16T08:00:00Z',importedFrom:'2026-01-01',importedThrough:'2026-09-16',recordedFrom:'2026-09-14',recordedThrough:'2026-09-16',latestAttemptStatus:'succeeded',latestAttemptAt:null,freshness:'fresh',staleAfterSeconds:900,weekCoverage:'week_to_date',accessCoverage:'unverified'},projects:[{basecampProjectId:'201',projectName:'Project A',allocationStatus:'allocated',displayGroup:'allocated',context:[],plannedHours:8,recordedHours:9,remainingHours:-1,allocationUpdatedAt:null,balanceStatus:'provisional',reasons:['access_coverage_unverified']}] });
const auth = {accessToken:'secret',accountId:'123',identityKey:'person-10'};

test('progress colours compare recorded hours with plan and keep missing or unrecorded time neutral',()=>{
  assert.equal(shared.allocationProgress(20,12),'within');
  assert.equal(shared.allocationProgress(8,8),'matched');
  assert.equal(shared.allocationProgress(8,9),'over');
  assert.equal(shared.allocationProgress(0,1),'over');
  assert.equal(shared.allocationProgress(0.3,0.1+0.2),'matched');
  for(const pair of [[null,3],[8,null],[8,0],[0,0]]) assert.equal(shared.allocationProgress(...pair),null);
});

test('week labels use readable month names including month and year boundaries',()=>{
  assert.match(shared.allocationWeekLabel('2026-09-14'),/14.*20 Sept 2026/);
  assert.match(shared.allocationWeekLabel('2026-09-28'),/28 Sept.*4 Oct 2026/);
  assert.match(shared.allocationWeekLabel('2026-12-28'),/28 Dec 2026.*3 Jan 2027/);
});
test('requires billable scope and preserves server grouping without accepting unclassified responses',()=>{
  const value=fixture();
  value.projects[0].displayGroup='other_recorded';value.projects[0].context=['not_project_member','inactive_project'];
  const parsed=shared.parseWeeklyAllocations(value,'123','2026-09-14');
  assert.equal(parsed.projectScope,'billable');assert.equal(parsed.projects[0].displayGroup,'other_recorded');
  assert.deepEqual(parsed.projects[0].context,['not_project_member','inactive_project']);
  delete value.projectScope;
  assert.throws(()=>shared.parseWeeklyAllocations(value,'123','2026-09-14'));
  value.projectScope='billable';value.projects[0].displayGroup='non_billable';
  assert.throws(()=>shared.parseWeeklyAllocations(value,'123','2026-09-14'));
});
test('IST calendar weeks and response projection preserve overruns, omit extra fields',()=>{
  assert.equal(shared.currentAllocationWeek(new Date('2026-09-13T18:31:00Z')),'2026-09-14');
  assert.equal(shared.currentAllocationWeek(new Date('2026-09-13T18:29:00Z')),'2026-09-07');
  assert.equal(shared.validAllocationWeek('2026-02-30'),false);
  const value=fixture();value.salary=999;value.projects[0].costRate=999;
  const parsed=shared.parseWeeklyAllocations(value,'123','2026-09-14');
  assert.equal(parsed.projects[0].remainingHours,-1);
  assert.ok(!JSON.stringify(parsed).includes('999'));
  assert.throws(()=>shared.parseWeeklyAllocations(value,'456','2026-09-14'));
  assert.throws(()=>shared.parseWeeklyAllocations(value,'123','2026-09-21'));
});
test('fixed trusted HTTPS endpoint, no redirects, and no renderer token exposure',async()=>{
  const result=await service.fetchWeeklyAllocations('2026-09-14',()=>auth,async(url,init)=>{
    assert.equal(url,'https://everything-ops-workspace.vercel.app/api/me/weekly-allocations?weekStart=2026-09-14');
    assert.equal(init.headers.Authorization,'Bearer secret');assert.equal(init.redirect,'error');assert.equal(init.method,'GET');assert.ok(init.signal);
    return Response.json(fixture());
  });
  assert.equal(result.ok,true);assert.ok(!JSON.stringify(result).includes('secret'));
});
test('fails safely without credentials, on expiry, outage, malformed responses, and invalid weeks',async()=>{
  assert.equal((await service.fetchWeeklyAllocations('2026-09-14',()=>null,()=>{throw new Error('must not fetch');})).ok,false);
  assert.equal((await service.fetchWeeklyAllocations('../attack',()=>auth)).ok,false);
  for(const fetcher of [async()=>new Response('',{status:401}),async()=>new Response('',{status:503}),async()=>{throw new Error('Bearer secret');},async()=>Response.json({wrong:true})]){
    const result=await service.fetchWeeklyAllocations('2026-09-14',()=>auth,fetcher);
    assert.equal(result.ok,false);assert.ok(!JSON.stringify(result).includes('secret'));
  }
});
test('a response started for a previous account/person is discarded',async()=>{
  let current=auth;
  const result=await service.fetchWeeklyAllocations('2026-09-14',()=>current,async()=>{current={...auth,identityKey:'someone-else'};return Response.json(fixture());});
  assert.equal(result.ok,false);
});
test('planning credential lookup never refreshes, disconnects, emits, or persists auth',()=>{
  const source=fs.readFileSync('src/main/services/basecamp/oauth.ts','utf8');
  const getter=source.slice(source.indexOf('  getPlanningCredential()'),source.indexOf('  async getAccessToken()'));
  for(const mutation of ['refreshAccessToken','forceExpire','disconnect(','.emit(','.set('])assert.ok(!getter.includes(mutation));
  const integration=fs.readFileSync('src/main/services/weeklyAllocations.ts','utf8');
  for(const mutation of ['stopTimer','addSession','createTimesheetEntry','saveRecords','refreshAccessToken'])assert.ok(!integration.includes(mutation));
});
