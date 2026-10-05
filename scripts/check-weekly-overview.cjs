// Disposable Electron UI check; synthetic data only, no real profile or network.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
if(!process.versions.electron){
 const root=path.resolve(__dirname,'..'),dir=fs.mkdtempSync('/private/tmp/zenstate-overview-ui-');
 require('esbuild').buildSync({stdin:{resolveDir:root,loader:'tsx',contents:`
 import React from 'react';import {createRoot} from 'react-dom/client';import './src/renderer/styles/zenstate.css';
 import Weekly from './src/renderer/views/dashboard/WeeklyAllocationsTab';
 import fixture from './tests/fixtures/weekly-overview.json';
 import {shiftAllocationDate} from './src/shared/weeklyAllocations';
 window.mode='ok';window.calls=[];window.pending=[];window.timesheet=0;window.account=123;
 window.zenstate={on:(event,fn)=>{window.authChange=fn;return ()=>{};},bcGetAuthState:async()=>({isConnected:true,account:{id:window.account}}),openExternal:async url=>{window.opened=url;},
 getWeeklyOverview:week=>{window.calls.push(week);const d=structuredClone(fixture);d.week.startDate=week;d.week.endDate=shiftAllocationDate(week,6);d.capacity.forEach((c,i)=>c.weekStart=shiftAllocationDate(week,i*7));d.basecampAccountId=String(window.account);d.projects[0].projectName='Week '+week;d.basecampSync.lastSuccessfulAt=new Date().toISOString();
 const response={ok:true,data:d};if(window.mode==='defer')return new Promise(resolve=>window.pending.push({week,resolve:()=>resolve(response)}));return Promise.resolve(window.mode==='error'?{ok:false,error:'Ops unavailable. Time recording is unaffected.'}:response);}};
 const start=new Date().toISOString();
 createRoot(document.getElementById('root')).render(<div style={{padding:24}}><Weekly records={[{date:start.slice(0,10),sessions:[{id:'1',startTime:start,duration:300,basecamp:{accountId:123,synced:false}},{id:'2',startTime:start,duration:300,basecamp:{accountId:456,synced:false}},{id:'3',startTime:start,duration:300,basecamp:{accountId:123,synced:true}}]}]} timerState={{isRunning:true,isPaused:false,elapsed:900}} onOpenTimesheet={()=>window.timesheet++}/></div>);
 `},bundle:true,format:'esm',outfile:dir+'/app.js',define:{'process.env.NODE_ENV':'"production"'},logLevel:'warning'});
 fs.writeFileSync(dir+'/index.html','<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="app.css"></head><body><div id="root"></div><script type="module" src="app.js"></script></body></html>');
 const r=require('node:child_process').spawnSync(require('electron'),[__filename,dir],{stdio:'inherit',env:{...process.env,ELECTRON_RUN_AS_NODE:undefined}});process.exit(r.status??1);
}
const {app,BrowserWindow}=require('electron');const dir=process.argv[2];app.setPath('userData',path.join(dir,'profile'));
app.whenReady().then(async()=>{
 const win=new BrowserWindow({width:1100,height:1000,show:false,webPreferences:{contextIsolation:true,nodeIntegration:false}});
 const run=code=>win.webContents.executeJavaScript(code),delay=ms=>new Promise(r=>setTimeout(r,ms));
 const wait=async(code)=>{for(let i=0;i<80;i++){if(await run(code))return;await delay(50);}throw Error('Timed out: '+code);};
 const click=async(text)=>{await run(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(text)}).click()`);await delay(100);};
 const errors=[];win.webContents.on('console-message',(_e,d)=>{if(d.level==='error')errors.push(d.message);});
 try{
 await win.loadFile(dir+'/index.html');await wait(`!!document.querySelector('.weekly-overview-summary')`);
 let body=await run('document.body.innerText');for(const text of ['Your week','Growth time','4h over-allocated','My leave','Needs you','1 unposted sessions','Timer running','2h over'])assert.ok(body.includes(text),text);
 assert.ok(!body.includes('PRIVATE'));assert.equal(await run(`document.querySelector('.weekly-allocations-other').open`),false);
 await click('Open Timesheet');assert.equal(await run('window.timesheet'),1);await click('Open Ops ↗');assert.equal(await run('window.opened'),'https://ops.everythingflow.agency');
 fs.writeFileSync(dir+'/desktop.png',(await win.webContents.capturePage()).toPNG());
 win.setSize(650,850);await delay(150);assert.equal(await run('document.documentElement.scrollWidth <= innerWidth'),true, await run(`JSON.stringify({width:innerWidth,scroll:document.documentElement.scrollWidth,wide:[...document.querySelectorAll('*')].filter(e=>e.scrollWidth>e.clientWidth).map(e=>({tag:e.tagName,cls:e.className,right:e.getBoundingClientRect().right,scroll:e.scrollWidth,client:e.clientWidth})).slice(0,15)})`));fs.writeFileSync(dir+'/compact.png',(await win.webContents.capturePage()).toPNG());
 await run(`window.mode='error'`);await click('Refresh');await wait(`!!document.querySelector('[role="alert"]')`);assert.match(await run('document.body.innerText'),/Time recording is unaffected/);assert.equal(await run(`document.querySelectorAll('.weekly-overview-summary').length`),0);
 await run(`window.mode='ok'`);await click('Refresh');await wait(`!!document.querySelector('.weekly-overview-summary')`);
 await run(`window.mode='defer'`);await click('→');await click('→');await wait('window.pending.length===2');
 await run('window.pending[1].resolve()');await wait(`document.body.innerText.includes('Week '+window.pending[1].week)`);await run('window.pending[0].resolve()');await delay(100);assert.equal(await run(`document.body.innerText.includes('Week '+window.pending[0].week)`),false);
 await click('Refresh');await wait('window.pending.length===3');await run('window.account=456;window.authChange()');await wait('window.pending.length===4');assert.equal(await run(`document.querySelectorAll('.weekly-overview-summary').length`),0);
 await run('window.pending[2].resolve()');await delay(100);assert.equal(await run(`document.querySelectorAll('.weekly-overview-summary').length`),0);
 await run('window.pending[3].resolve()');await wait(`!!document.querySelector('.weekly-overview-summary')`);assert.equal(await run(`document.body.innerText.includes('Local test build') || document.body.innerText.includes('Preview sample data')`),false);assert.deepEqual(errors,[]);
 console.log('PASS: sections, account-scoped local time, collapsed projects, links, compact bounds, offline/retry, obsolete week and account responses. Screenshots: '+dir);app.exit(0);
 }catch(error){console.error(error);fs.writeFileSync(dir+'/failure.png',(await win.webContents.capturePage()).toPNG());console.error(dir);app.exit(1);}
});
