// Run with: node scripts/check-popover-layout.cjs
// Real popup and Settings views, synthetic data, disposable profile, no network.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

if (!process.versions.electron) {
  const root = path.resolve(__dirname, '..');
  const dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'zenstate-popover-'));
  require('esbuild').buildSync({
    stdin: { resolveDir: root, loader: 'tsx', contents: `
      import React from 'react';
      import {createRoot} from 'react-dom/client';
      import App from './src/renderer/App';
      import SettingsTab from './src/renderer/views/dashboard/SettingsTab';
      import './src/renderer/styles/zenstate.css';
      const user = {id:'self',name:'Test person',username:'test',status:'available',lastSeen:new Date().toISOString(),totalFocusTime:0,focusSessionCount:0,isAdmin:false,canSendEmergency:false};
      const license = {isValid:true,isPro:true,isAdmin:false,payload:null};
      const peers = Array.from({length:24},(_,i)=>({...user,id:'peer-'+i,name:'Teammate '+(i+1),username:'person'+i}));
      const plan = {date:'2026-10-20',items:Array.from({length:24},(_,i)=>({todoId:i+1,projectId:1,todoListId:2,accountId:3,content:'Review design and development task '+(i+1),projectName:'Test project'}))};
      const events = new Map();
      window.emit = (name, value) => [...(events.get(name)||[])].forEach(fn=>fn(value));
      window.settings = {breakReminderEnabled:false,breakReminderIntervalSeconds:5400,idleDetectionEnabled:false,idleThresholdSeconds:300,requireTimesheetConfirmation:true,miniTimerEnabled:true,miniTimerAutoDim:false,notificationsEnabled:false};
      window.saved = []; window.quickStarts = [];
      window.zenstate = {
        on:(name,fn)=>{if(!events.has(name))events.set(name,new Set());events.get(name).add(fn);return()=>events.get(name).delete(fn);},
        getUser:async()=>user,getPeers:async()=>peers,getLicenseState:async()=>license,
        todayGet:async()=>({plan}),teamGetRecentPings:async()=>Array.from({length:5},(_,i)=>({id:String(i),fromName:'Teammate',message:'Please review this design when you have time.',receivedAt:new Date().toISOString()})),
        bcGetAuthState:async()=>({isConnected:false}),bcGetCredentials:async()=>null,
        getSettings:async()=>window.settings,
        saveSettings:async settings=>{window.settings=settings;window.saved.push(settings);window.emit('settings:updated',settings);return true;},
        quickRecordTime:note=>window.quickStarts.push(note),
        getLoginItemSettings:async()=>false,getAppVersion:async()=>'local test',getLocalInfo:async()=>({addresses:[],port:0}),
        openDashboard:tab=>{if(tab==='settings')window.showSettings();},
      };
      function Harness(){
        const [settings,setSettings]=React.useState(false);
        window.showSettings=()=>setSettings(true);window.showMenu=()=>setSettings(false);
        return settings?<SettingsTab currentUser={user} peers={[]} isPro={true} licenseState={license} onLicenseStateChange={()=>{}} onUserUpdate={()=>{}} onSignOut={()=>{}}/>:<App/>;
      }
      createRoot(document.getElementById('root')).render(<Harness/>);
    ` },
    bundle: true, format: 'esm', outfile: path.join(dir, 'app.js'),
    define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'warning',
  });
  fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="app.css"></head><body class="menu-popup" style="overflow:hidden"><div id="root"></div><script type="module" src="app.js"></script></body></html>');
  const result = require('node:child_process').spawnSync(require('electron'), [__filename, dir], {
    stdio: 'inherit', env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined },
  });
  process.exit(result.status ?? 1);
}

const { app, BrowserWindow } = require('electron');
const dir = process.argv[2];
app.setPath('userData', path.join(dir, 'profile'));
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 360, height: 640, frame: false, show: true, webPreferences: { contextIsolation: true, nodeIntegration: false } });
  const run = code => win.webContents.executeJavaScript(code);
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const wait = async code => {
    for (let i = 0; i < 80; i++) { if (await run(code)) return; await delay(50); }
    throw Error('Timed out: ' + code);
  };
  const click = async code => { await run(code + '.click()'); await delay(80); };
  const toggle = `document.querySelector('.popover-quick-toggle')`;
  const input = `document.querySelector('[aria-label="Quick Record Time note"]')`;
  const checkBounds = async (minListHeight = 80) => {
    const bounds = await run(`(()=>{
      const footer=document.querySelector('.footer').getBoundingClientRect(), list=document.querySelector('.popover-content');
      return {bottom:footer.bottom,height:innerHeight,list:list.clientHeight,scroll:document.documentElement.scrollWidth,width:innerWidth};
    })()`);
    assert.ok(bounds.bottom <= bounds.height + 1, JSON.stringify(bounds));
    assert.ok(bounds.list >= minListHeight, JSON.stringify(bounds));
    assert.ok(bounds.scroll <= bounds.width, JSON.stringify(bounds));
  };
  const screenshot = async name => {
    await delay(200);
    fs.writeFileSync(path.join(dir, name + '.png'), (await win.webContents.capturePage()).toPNG());
  };
  try {
    await win.loadFile(path.join(dir, 'index.html'));
    await wait(`!!document.querySelector('.popover-content') && document.body.innerText.includes('task 24')`);
    assert.equal(await run(input), null);
    await checkBounds(250);
    await screenshot('collapsed');
    await click(toggle);
    await wait(`document.activeElement === ${input}`);
    await run(`(()=>{const input=${input};Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Review revised wireframes');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await click(toggle);
    await click(toggle);
    assert.equal(await run(input + '.value'), 'Review revised wireframes');
    await checkBounds(170);
    await screenshot('expanded');
    await run(`window.emit('timer:update',{elapsed:600,isRunning:true,isPaused:false,taskLabel:'Current work'})`);
    await delay(80);
    win.setSize(360, 480);
    await delay(100);
    await checkBounds();
    await screenshot('short-screen');
    await click(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Start timer')`);
    assert.deepEqual(await run('window.quickStarts'), ['Review revised wireframes']);
    assert.equal(await run(input), null);
    await click(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.startsWith('Team'))`);
    await checkBounds();
    assert.equal(await run(`(()=>{const list=document.querySelector('.popover-content');list.scrollTop=list.scrollHeight;return list.scrollTop>0})()`), true);
    await screenshot('team-short-screen');
    await run(`window.emit('update:downloaded',{version:'local'})`);
    await delay(80);
    await checkBounds();
    await run(`window.emit('settings:updated',{...window.settings,quickRecordTimeEnabled:false})`);
    await wait(`!${toggle}`);
    await checkBounds();
    // Toggle in the real Settings view, then remount to prove it loads saved choice.
    win.setSize(900, 800);
    await run('window.showSettings()');
    const checkbox = `Array.from(document.querySelectorAll('label')).find(l=>l.textContent.includes('Show Quick Record Time')).querySelector('input')`;
    await wait(`!!document.querySelector('label') && document.body.innerText.includes('Show Quick Record Time')`);
    await click(checkbox);
    assert.equal(await run('window.saved.at(-1).quickRecordTimeEnabled'), false);
    assert.equal(await run('window.saved.at(-1).requireTimesheetConfirmation'), true);
    await run('window.showMenu()');
    await wait(`!!document.querySelector('.popover-content')`);
    assert.equal(await run(toggle), null);
    await run('window.showSettings()');
    await wait(`document.body.innerText.includes('Show Quick Record Time')`);
    await wait(`${checkbox}.checked === false`);
    await click(checkbox);
    assert.equal(await run('window.saved.at(-1).quickRecordTimeEnabled'), true);
    await run('window.showMenu()');
    await wait(`!!${toggle}`);
    assert.equal(await run(input), null);
    console.log('PASS: collapsed/expanded capture, focus, draft retention, quick start, small-screen scrolling, Team, update banner, live preference and saved Settings choice. Screenshots: ' + dir);
    app.exit(0);
  } catch (error) {
    console.error(error);
    await screenshot('failure').catch(console.error);
    console.error('Screenshots: ' + dir);
    app.exit(1);
  }
});
