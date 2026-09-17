const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { createRequire } = require('node:module');

function load(file, mocks = {}, globals = {}) {
  const filename = path.resolve('dist', file);
  const originalRequire = createRequire(filename);
  const exports = {};
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    exports, module: { exports }, require: name => name in mocks ? mocks[name] : originalRequire(name),
    console: { log() {}, warn() {}, error() {} }, process, Buffer, URL, Date, setTimeout, clearTimeout,
    ...globals,
  }, { filename });
  return exports;
}
function updater(platform = 'win32') {
  const events = [], timers = [], native = new EventEmitter(), updater = new EventEmitter();
  let installs = 0, quits = 0;
  updater.checkForUpdatesAndNotify = async () => null;
  updater.checkForUpdates = async () => ({isUpdateAvailable:false, updateInfo:{version:'5.8.3'}});
  updater.quitAndInstall = () => { installs++; };
  const api = load('main/updater.js', {
    'electron-updater': {autoUpdater:updater},
    electron: {autoUpdater:native,dialog:{showMessageBox:async()=>({response:0})},BrowserWindow:{getAllWindows:()=>[
      {isDestroyed:()=>true},
      {isDestroyed:()=>false,webContents:{send:(...event)=>events.push(event)}},
    ]}},
  }, {process:{platform},setInterval:(fn,ms)=>timers.push({fn,ms})});
  api.setupUpdater(()=>quits++);
  return {api,updater,native,events,timers,get installs(){return installs},get quits(){return quits}};
}

test('all platforms use stable updates, never downgrade, and schedule background checks',()=>{
  for(const platform of ['win32','darwin','linux']) {
    const h=updater(platform);
    assert.equal(h.updater.channel,'latest'); assert.equal(h.updater.allowPrerelease,false);
    assert.equal(h.updater.allowDowngrade,false); assert.equal(h.updater.autoDownload,true);
    assert.equal(h.timers[0].ms,4*60*60*1000);
  }
});
test('manual update result follows real updater decision, including prerelease/staged-rollout cases',async()=>{
  const h=updater();
  for(const [version,available] of [['5.8.4-test.7',true],['5.8.4',true],['5.9.0',false],['5.8.3',false]]) {
    h.updater.checkForUpdates=async()=>({isUpdateAvailable:available,updateInfo:{version}});
    const r=await h.api.checkForUpdate(); assert.equal(r.updateAvailable,available);assert.equal(r.version,version);
  }
});
test('failed checks stay errors and rejected downloads are consumed without claiming success',async()=>{
  const h=updater();h.updater.checkForUpdates=async()=>{throw Error('Network unavailable')};
  const r=await h.api.checkForUpdate();assert.match(r.error,/Could not reach the update server/);assert.equal(h.events.at(-1)[0],'update:error');
  h.updater.checkForUpdates=async()=>({isUpdateAvailable:true,updateInfo:{version:'5.8.4'},downloadPromise:Promise.reject(Error('download failed'))});
  await h.api.checkForUpdate(); await new Promise(resolve=>setImmediate(resolve));
});
test('restart requires a downloaded update and an idle recorder; failed install never starts quitting',()=>{
  const h=updater();h.api.installUpdate(null);assert.equal(h.installs,0);
  h.updater.emit('update-downloaded',{version:'5.8.4'});h.api.installUpdate('Time is being posted');assert.equal(h.installs,0);
  h.api.installUpdate(null);assert.equal(h.installs,1);assert.equal(h.quits,0);
  h.native.emit('before-quit-for-update');assert.equal(h.quits,1);
  const f=updater();f.updater.emit('update-downloaded',{version:'5.8.4'});f.updater.quitAndInstall=()=>{throw Error('Installer failed')};
  f.api.installUpdate(null);assert.equal(f.quits,0);assert.match(f.events.at(-1)[1].message,/could not be completed/);
});
test('macOS waits for native Squirrel readiness, not just the first ZIP download',()=>{
  const h=updater('darwin');h.updater.emit('update-downloaded',{version:'5.8.4'});
  assert.equal(h.events.some(e=>e[0]==='update:downloaded'),false);h.api.installUpdate(null);assert.equal(h.installs,0);
  h.native.emit('update-downloaded');h.api.installUpdate(null);assert.equal(h.installs,1);
});
test('update progress and error events reach renderers',()=>{
  const h=updater();h.updater.emit('download-progress',{percent:43.6});assert.equal(h.events.at(-1)[1].percent,44);
  h.updater.emit('error',Error('Checksum mismatch'));assert.match(h.events.at(-1)[1].message,/could not be verified/);
});

test('missing platform metadata explains the release problem without exposing HTTP dumps',async()=>{
  for(const file of ['latest.yml','latest-mac.yml','latest-linux.yml']) {
    const h=updater();
    const error=Error(`Cannot find ${file} in the latest release artifacts: HttpError: 404 Headers: secret diagnostics`);
    h.updater.emit('error',error);
    const message=h.events.at(-1)[1].message;
    assert.match(message,/missing update files for your system/);
    assert.doesNotMatch(message,/Headers|secret|authentication token/);
    h.updater.checkForUpdates=async()=>{throw error};
    assert.equal((await h.api.checkForUpdate()).error,message);
  }
});

test('actual main-process quit handler keeps timers, confirmation and writes alive, then permits idle quit',async()=>{
  const source=fs.readFileSync('dist/main/index.js','utf8');
  const start=source.indexOf('function recordingBlockReason()');
  const end=source.indexOf('// v5.3.2',start);
  assert.ok(start>0 && end>start);
  for(const busy of ['running','paused','confirmation','write']) {
    let quit,prevented=0,notices=0,destroyed=0,stopped=0,unregistered=0;
    const window={isDestroyed:()=>false,setClosable:()=>{},destroy:()=>destroyed++};
    const context=vm.createContext({
      timerIsRunning:busy==='running',timerIsPaused:busy==='paused',
      pendingTimesheetEntry:busy==='confirmation'?{}:null,
      basecamp:{api:{hasPendingWrites:busy==='write'}},isQuitting:false,
      electron_1:{app:{on:(event,fn)=>{assert.equal(event,'before-quit');quit=fn}},
        dialog:{showMessageBox:async()=>{notices++;return {response:0}}},
        BrowserWindow:{getAllWindows:()=>[window]},globalShortcut:{unregisterAll:()=>unregistered++}},
      popoverWindow:window,miniTimerWindow:null,networking:{stop:()=>stopped++},console,
    });
    vm.runInContext(source.slice(start,end),context);
    const event={preventDefault:()=>prevented++};
    quit(event);quit(event);
    assert.equal(prevented,2);assert.equal(notices,1);
    assert.equal(context.isQuitting,false);assert.equal(destroyed+stopped+unregistered,0);
    await new Promise(resolve=>setImmediate(resolve));
    context.timerIsRunning=false;context.timerIsPaused=false;
    context.pendingTimesheetEntry=null;context.basecamp.api.hasPendingWrites=false;
    quit(event);
    assert.equal(prevented,2);assert.equal(context.isQuitting,true);
    assert.equal(destroyed,1);assert.equal(stopped,1);assert.equal(unregistered,1);
  }
});

test('Basecamp writes remain marked busy through response-body parsing and clear on success/failure',async()=>{
  let resolveResponse, resolveBody, count=0;
  const {BasecampApi}=load('main/services/basecamp/api.js',{'./oauth':{BC_USER_AGENT:'ZenState-Test'}}, {fetch:()=>{count++;return new Promise(resolve=>resolveResponse=resolve)}});
  const api=new BasecampApi({getAccessToken:async()=> 'fixture-token',getAccountHref:()=> 'https://example.test/123'});
  const pending=api.createTimesheetEntry({todoId:5,date:'2026-09-16',hours:'0.1'});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(api.hasPendingWrites,true);
  resolveResponse({ok:true,status:200,json:()=>new Promise(resolve=>resolveBody=resolve)});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(api.hasPendingWrites,true);
  resolveBody({id:1,date:'2026-09-16',hours:'0.1',parent:{id:5},person:{id:8}});
  await pending;assert.equal(api.hasPendingWrites,false);assert.equal(count,1);
  const failed=api.createTimesheetEntry({todoId:5,date:'2026-09-16',hours:'0.1'});
  await new Promise(resolve=>setImmediate(resolve));resolveResponse({ok:false,status:403,text:async()=> 'Forbidden'});
  await assert.rejects(failed,/403/);assert.equal(api.hasPendingWrites,false);assert.equal(count,2);
});

test('local records survive reload, edits preserve Basecamp identity, and old unposted records are retained',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'zenstate-records-'));
  try {
    const Conf=require('conf');
    class Store extends Conf {constructor(options){super({...options,configName:options.name,cwd:dir,projectName:'zenstate-test'})}}
    const mocks={electron:{app:{getPath:()=>dir}},'electron-store':Store};
    const {PersistenceService}=load('main/services/persistence.js',mocks);
    const p=new PersistenceService();const {TimeTracker}=load('main/services/timeTracker.js');const tracker=new TimeTracker(p);
    const start=new Date();start.setDate(start.getDate()-120);const end=new Date(start.getTime()+60000);
    const saved=tracker.addSession({taskLabel:'Offline test',duration:60,startTime:start.toISOString(),endTime:end.toISOString(),basecamp:{accountId:1,projectId:2,todoId:3,synced:false}});
    tracker.updateSession(saved.sessionId,saved.dateStr,{duration:120,notes:'Keep me'});
    const Reloaded=load('main/services/persistence.js',mocks).PersistenceService;
    const stored=new Reloaded().getRecords();assert.equal(stored.length,1);assert.equal(stored[0].totalFocusTime,120);
    assert.equal(stored[0].sessions[0].basecamp.todoId,3);assert.equal(stored[0].sessions[0].notes,'Keep me');
    tracker.deleteSession(saved.sessionId,saved.dateStr);assert.equal(tracker.findSession(saved.sessionId,saved.dateStr),null);
  } finally {fs.rmSync(dir,{recursive:true,force:true})}
});

test('sandbox preload exposes the bridge without imports and unsubscribes only its own listener',async()=>{
  const ipc=new EventEmitter(),invocations=[];let bridge;
  ipc.invoke=async(...args)=>{invocations.push(args);return {ok:true}};ipc.send=()=>{};
  load('main/preload.js',{electron:{contextBridge:{exposeInMainWorld:(name,value)=>{assert.equal(name,'zenstate');bridge=value}},ipcRenderer:ipc}});
  assert.ok(bridge);await bridge.getWeeklyAllocations('2026-09-14');assert.deepEqual(invocations[0],['planning:get-weekly-allocations','2026-09-14']);
  let first=0,second=0;const off=bridge.on('update:error',()=>first++);bridge.on('update:error',()=>second++);
  off();ipc.emit('update:error',{}, {message:'offline'});assert.equal(first,0);assert.equal(second,1);
  bridge.on('arbitrary:private',()=>{});assert.equal(ipc.listenerCount('arbitrary:private'),0);
});

test('Basecamp authentication retries once, while server errors never silently duplicate a time write',async()=>{
  let refreshes=0,calls=0;
  const row={id:1,date:'2026-09-16',hours:'0.1',parent:{id:5},person:{id:8}};
  const {BasecampApi}=load('main/services/basecamp/api.js',{'./oauth':{BC_USER_AGENT:'ZenState-Test'}},{fetch:async()=>{calls++;return calls===1?{ok:false,status:401}:{ok:true,status:200,json:async()=>row}}});
  const api=new BasecampApi({getAccessToken:async()=> 'fixture',getAccountHref:()=> 'https://example.test/123',forceExpire:()=>refreshes++});
  await api.createTimesheetEntry({todoId:5,date:'2026-09-16',hours:'0.1'});assert.equal(calls,2);assert.equal(refreshes,1);assert.equal(api.hasPendingWrites,false);
  let failures=0;
  const Broken=load('main/services/basecamp/api.js',{'./oauth':{BC_USER_AGENT:'ZenState-Test'}},{fetch:async()=>{failures++;return {ok:false,status:500,text:async()=> 'Server error'}}}).BasecampApi;
  const broken=new Broken({getAccessToken:async()=> 'fixture',getAccountHref:()=> 'https://example.test/123'});
  await assert.rejects(broken.createTimesheetEntry({todoId:5,date:'2026-09-16',hours:'0.1'}),/500/);assert.equal(failures,1);assert.equal(broken.hasPendingWrites,false);
});
