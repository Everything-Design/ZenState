// Run only on a disposable Windows CI runner: it installs over its test app.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const http=require('node:http'),cp=require('node:child_process');
const asar=require('@electron/asar'),yaml=require('js-yaml');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function main(){
  assert.equal(process.platform,'win32');
  assert.equal(process.env.GITHUB_ACTIONS,'true','Use a disposable GitHub runner');
  const install=process.env.ZENSTATE_TEST_INSTALL;
  assert.ok(install && install.startsWith(process.env.RUNNER_TEMP));
  const exe=path.join(install,'ZenState.exe'),resources=path.join(install,'resources');
  assert.ok(fs.existsSync(exe),'Baseline installer did not create the expected app');
  const evidence=path.resolve('update-evidence');fs.mkdirSync(evidence,{recursive:true});
  const events=path.join(evidence,'events.jsonl'),candidate=path.resolve(process.argv[2]);
  const metadata=yaml.load(fs.readFileSync(path.join(candidate,'latest.yml'),'utf8'));
  const archive=path.join(resources,'app.asar'),stage=path.join(evidence,'baseline-source');
  asar.extractAll(archive,stage);
  const pkg=JSON.parse(fs.readFileSync(path.join(stage,'package.json')));
  assert.ok(require('semver').lt(pkg.version,metadata.version),'Baseline must precede the candidate');
  const originalMain=pkg.main;pkg.main='update-probe.cjs';
  const processes=()=>{
    const quoted=exe.replaceAll("'","''");
    const script=`@(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq '${quoted}' -and $_.CommandLine -notmatch '--type=' } | Select-Object -ExpandProperty ProcessId) | ConvertTo-Json -Compress`;
    const value=cp.execFileSync('pwsh',['-NoProfile','-Command',script],{encoding:'utf8'}).trim();
    return value?[JSON.parse(value)].flat():[];
  };
  for(const pid of processes())process.kill(pid);
  const files=new Set(fs.readdirSync(candidate).filter(name=>fs.statSync(path.join(candidate,name)).isFile()));
  const server=http.createServer((req,res)=>{
    const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname.slice(1));
    if(!files.has(name)){res.writeHead(404);res.end();return;}
    const file=path.join(candidate,name);res.setHeader('Content-Length',fs.statSync(file).size);
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const feed=`http://127.0.0.1:${server.address().port}/`;
  fs.writeFileSync(path.join(stage,'package.json'),JSON.stringify(pkg));
  const probe=`
const {app,ipcMain}=require('electron'),fs=require('fs'),path=require('path');
const events=${JSON.stringify(events)};
const record=(event,data={})=>fs.appendFileSync(events,JSON.stringify({event,version:app.getVersion(),...data})+'\\n');
record('started',{profile:app.getPath('userData')});
const updater=require('electron-updater').autoUpdater;
updater.setFeedURL({provider:'generic',url:${JSON.stringify(feed)}});
updater.disableDifferentialDownload=true;
const install=updater.quitAndInstall.bind(updater);
updater.quitAndInstall=()=>install(true,true);
updater.on('error',e=>record('error',{message:String(e.stack)}));
updater.on('update-downloaded',info=>{record('downloaded',{next:info.version});setTimeout(()=>ipcMain.emit('app:install-update'),500)});
require(${JSON.stringify('./'+originalMain)});
app.whenReady().then(()=>{
 const {PersistenceService}=require('./dist/main/services/persistence.js');const p=new PersistenceService();
 if(p.getUser()||p.getRecords().length)throw Error('Test profile is not empty');
 const {TimeTracker}=require('./dist/main/services/timeTracker.js');
 new TimeTracker(p).addSession({taskLabel:'Windows upgrade sentinel',duration:120,startTime:new Date().toISOString(),endTime:new Date().toISOString()});
 p.saveSettings({...p.getSettings(),miniTimerEnabled:false});record('seeded');
});`;
  fs.writeFileSync(path.join(stage,'update-probe.cjs'),probe);
  // Wait for ASAR writes to finish, including Windows output-stream flushing.
  cp.execFileSync(process.execPath,['-e',"require('@electron/asar').createPackage(process.argv[1],process.argv[2]).catch(e=>{console.error(e);process.exitCode=1})",stage,archive]);
  fs.writeFileSync(path.join(resources,'app-update.yml'),yaml.dump({provider:'generic',url:feed,updaterCacheDirName:'zenstate-native-update-ci'}));
  const output=fs.openSync(path.join(evidence,'baseline-runtime.log'),'w');
  const child=cp.spawn(exe,[],{stdio:['ignore',output,output]});
  let success=false;
  try{
    const deadline=Date.now()+6*60*1000;
    while(Date.now()<deadline){
      await sleep(2000);
      const rows=fs.existsSync(events)?fs.readFileSync(events,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[];
      const error=rows.find(row=>row.event==='error');assert.ok(!error,error?.message);
      asar.uncache(archive);
      let installed;
      try{installed=JSON.parse(asar.extractFile(archive,'package.json'));}catch{continue;}
      if(installed.version!==metadata.version||installed.main==='update-probe.cjs')continue;
      const running=processes().filter(pid=>pid!==child.pid);if(!running.length)continue;
      const started=rows.find(row=>row.event==='started');assert.ok(started);
      const data=JSON.parse(fs.readFileSync(path.join(started.profile,'zenstate-data.json')));
      const sessions=data.dailyRecords.flatMap(row=>row.sessions);
      assert.equal(sessions.length,1);assert.equal(sessions[0].taskLabel,'Windows upgrade sentinel');assert.equal(sessions[0].duration,120);
      assert.equal(data.appSettings.miniTimerEnabled,false);
      const feedConfig=yaml.load(fs.readFileSync(path.join(resources,'app-update.yml'),'utf8'));
      assert.equal(feedConfig.provider,'github');assert.equal(feedConfig.repo,'ZenState');
      const result={passed:true,from:pkg.version,to:installed.version,restartedPids:running,retainedSession:true,retainedSettings:true,productionFeedRestored:true};
      fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify(result,null,2));console.log(result);success=true;break;
    }
    assert.ok(success,'Timed out waiting for the installed app to update and restart');
  }finally{
    server.close();server.closeAllConnections();
    for(const pid of processes())try{process.kill(pid)}catch{}
    fs.closeSync(output);
    fs.rmSync(stage,{recursive:true,force:true});
  }
}
main().catch(error=>{console.error(error);process.exitCode=1});
