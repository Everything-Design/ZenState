// Run with: node scripts/check-session-pickers.cjs
// Renders the real Plan/Timesheet views with a fake bridge and disposable profile.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
if (!process.versions.electron) {
  const root = path.resolve(__dirname, '..');
  const dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'zenstate-session-pickers-'));
require('esbuild').buildSync({
  stdin:{resolveDir:root,loader:'tsx',contents:`
import React from 'react';
import {createRoot} from 'react-dom/client';
import './src/renderer/styles/zenstate.css';
const date = new Date().toLocaleDateString('en-CA');
const item = {todoId:3,projectId:2,todoListId:4,accountId:1,content:'Review wireframes',projectName:'Test project'};
window.saved = [];
window.zenstate = {
  on:()=>()=>{}, todayGet:async()=>({plan:{date,items:[item]},recents:[]}),
  bcGetAuthState:async()=>({isConnected:true,account:{id:1}}), getSettings:async()=>({dailyHoursTarget:8}),
  addSession:async data=>{window.saved.push(data);return {ok:true,sessionId:'test',dateStr:date}},
};
const {default:PlanTab} = await import('./src/renderer/views/dashboard/PlanTab');
const {default:TimesheetTab} = await import('./src/renderer/views/dashboard/TimesheetTab');
function App(){
 const [tab,setTab]=React.useState('plan');
 const [records,setRecords]=React.useState([]);
 const refresh=()=>setRecords([{id:'test-day',date,totalFocusTime:window.saved.reduce((sum,s)=>sum+s.duration,0),sessions:window.saved.map((s,i)=>({...s,id:String(i),endTime:new Date(new Date(s.startTime).getTime()+s.duration*1000).toISOString()}))}]);
 return <div style={{padding:24}}><nav><button id="plan-tab" onClick={()=>setTab('plan')}>Plan</button><button id="timesheet-tab" onClick={()=>setTab('timesheet')}>Timesheet</button></nav>{tab==='plan'?<PlanTab records={records} timerState={{elapsed:0,isRunning:false,isPaused:false,taskLabel:''}} onOpenSettings={()=>{}} onRefreshRecords={refresh}/>:<TimesheetTab records={records} isPro={true} onRefreshRecords={refresh}/>}</div>
}
createRoot(document.getElementById('root')).render(<App/>);
`},bundle:true,format:'esm',outfile:dir+'/app.js',define:{'process.env.NODE_ENV':'"production"'},logLevel:'warning'
});
fs.writeFileSync(dir+'/index.html','<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="app.css"></head><body><div id="root"></div><script type="module" src="app.js"></script></body></html>');

  const result = require('node:child_process').spawnSync(require('electron'), [__filename, dir], {
    stdio: 'inherit', env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined },
  });
  process.exit(result.status ?? 1);
}
const { app, BrowserWindow } = require('electron');
const dir = process.argv[2];
app.setPath('userData', path.join(dir, 'profile'));
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1100, height: 850, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false } });
  const run = code => win.webContents.executeJavaScript(code);
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const wait = async selector => {
    for (let i = 0; i < 60; i++) {
      if (await run(`!!document.querySelector(${JSON.stringify(selector)})`)) return;
      await delay(100);
    }
    throw Error('Missing ' + selector);
  };
  const click = async selector => { await run(`document.querySelector(${JSON.stringify(selector)}).click()`); await delay(50); };
  const clickText = async text => { await run(`Array.from(document.querySelectorAll('button')).find(el=>el.textContent.trim()===${JSON.stringify(text)}).click()`); await delay(50); };
  const change = async (selector, value) => {
    await run(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await delay(50);
  };
  const capture = async (name, selector = '.session-picker-panel') => {
    await delay(300);
    const bounds = await run(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {top:r.top,left:r.left,right:r.right,bottom:r.bottom,width:innerWidth,height:innerHeight}})()`);
    assert.ok(bounds.top >= 0 && bounds.left >= 0 && bounds.right <= bounds.width && bounds.bottom <= bounds.height, JSON.stringify(bounds));
    fs.writeFileSync(path.join(dir, name + '.png'), (await win.webContents.capturePage()).toPNG());
  };
  const failures = [];
  win.webContents.on('render-process-gone', (_e, details) => failures.push(details.reason));
  win.webContents.on('console-message', (_e, details) => { if (details.level === 'error') failures.push(details.message); });
  try {
    await win.loadFile(path.join(dir, 'index.html'));
    for (const surface of ['plan', 'timesheet']) {
      const openedAt = await run('Date.now()');
      if (surface === 'plan') {
        await wait('[title="Log time spent on this task without starting the timer"]');
        await click('[title="Log time spent on this task without starting the timer"]');
      } else {
        await click('#timesheet-tab');
        await clickText('Add session');
        await change('input[placeholder="e.g. Reviewed L3 wireframes"]', 'Retrospective work');
        win.setSize(720, 650);
      }
      await wait('#session-date');
      const defaults = await run(`({time:document.querySelector('#session-hour').value+':'+document.querySelector('#session-minute').value+' '+document.querySelector('.session-period-options [aria-pressed="true"]').textContent,now:Date.now()})`);
      const clockLabel = ms => {
        const d = new Date(ms);
        return String(d.getHours() % 12 || 12).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0') + ' ' + (d.getHours() < 12 ? 'AM' : 'PM');
      };
      assert.ok([clockLabel(openedAt),clockLabel(defaults.now)].includes(defaults.time), 'New session must default to current local time: ' + defaults.time);
      await delay(300);
      assert.equal(await run(`document.querySelectorAll('input[type="date"],input[type="time"]').length`), 0);
      await click('#session-date');
      await wait('#session-date-panel');
      assert.equal(await run(`document.querySelector('[aria-label="Next month"]').disabled`), true);
      await capture(surface + '-calendar');
      await click('[aria-label="Previous month"]');
      await capture(surface + '-previous-month');
      await click('.session-picker-calendar button:not(:disabled)');
      assert.equal(await run(`document.activeElement.id`), 'session-date');
      // Reopen, return to today, then exercise custom time entry.
      await click('#session-date');
      await click('#session-date-panel .session-picker-footer button:last-child');
      await click('#session-date');
      win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
      win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
      await delay(50);
      assert.equal(await run(`document.querySelector('#session-date-panel') === null`), true);
      assert.equal(await run(`document.activeElement.id`), 'session-date');
      await change('#session-hour', surface === 'plan' ? '02' : '12');
      await change('#session-minute', surface === 'plan' ? '20' : '35');
      await clickText(surface === 'plan' ? 'PM' : 'AM');
      await run(`document.querySelector('#session-hour').focus()`);
      win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Tab' });
      win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Tab' });
      await delay(50);
      assert.equal(await run('document.activeElement.id'), 'session-minute');
      const beforeArrow = await run(`document.querySelector('#session-minute').value`);
      for (const keyCode of ['Up', 'Down']) {
        win.webContents.sendInputEvent({ type: 'keyDown', keyCode });
        win.webContents.sendInputEvent({ type: 'keyUp', keyCode });
        await delay(50);
      }
      assert.equal(await run(`document.querySelector('#session-minute').value`), beforeArrow);
      assert.equal(await run(`document.querySelector('#session-time-panel') === null`), true);
      await capture(surface + '-time', '#session-start-time');
      const timeSize = await run(`(()=>{const r=document.querySelector('#session-start-time').getBoundingClientRect();return {width:r.width,height:r.height}})()`);
      assert.ok(timeSize.width <= 220 && timeSize.height <= 40, JSON.stringify(timeSize));
      await change('#session-hour', '0');
      await clickText('Save session');
      assert.match(await run('document.body.innerText'), /Enter a valid date and start time/);
      assert.equal((await run('window.saved')).length, surface === 'plan' ? 0 : 1);
      await change('#session-hour', surface === 'plan' ? '02' : '12');
      await clickText('Save session');
      const saved = await run('window.saved');
      const session = saved.at(-1);
      assert.equal(new Date(session.startTime).getHours(), surface === 'plan' ? 14 : 0);
      assert.equal(new Date(session.startTime).getMinutes(), surface === 'plan' ? 20 : 35);
      assert.equal(session.duration, 1800);
      assert.equal(new Date(session.startTime).toLocaleDateString(), new Date().toLocaleDateString());
      assert.equal(session.basecamp?.todoId ?? null, surface === 'plan' ? 3 : null);
    }
    assert.equal((await run('window.saved')).length, 2);
    assert.match(await run('document.body.innerText'), /14:20|2:20/);
    assert.match(await run('document.body.innerText'), /00:35|12:35/);
    assert.deepEqual(failures, []);
    console.log('PASS: both entry points, current-time defaults, inline time entry, Tab/arrow keys, no clock popup, calendar navigation, future-date guard, AM/PM conversion, validation, Escape/focus, save/display, and picker bounds. Screenshots: ' + dir);
    app.exit(0);
  } catch (error) {
    console.error(error);
    fs.writeFileSync(path.join(dir, 'failure.png'), (await win.webContents.capturePage()).toPNG());
    console.error('Evidence: ' + dir);
    app.exit(1);
  }
});
