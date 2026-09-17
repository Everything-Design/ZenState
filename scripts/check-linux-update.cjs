// Uses a disposable Linux runner, a prerelease fixture, and actual draft assets.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const cp=require('node:child_process'),crypto=require('node:crypto'),asar=require('@electron/asar'),yaml=require('js-yaml');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function main(){
  assert.equal(process.platform,'linux');assert.equal(process.env.GITHUB_ACTIONS,'true');
  const candidate=path.resolve(process.argv[2]),deb=process.argv[3]==='deb';
  const image=path.resolve('dist/baseline/ZenState.AppImage');
  const resources=deb?path.dirname(cp.execFileSync('dpkg',['-L','zenstate'],{encoding:'utf8'}).split('\n').find(f=>f.endsWith('/resources/app.asar'))):path.resolve('dist/baseline/squashfs-root/resources');
  const exe=path.join(path.dirname(resources),'zenstate'),archive=path.join(resources,'app.asar');
  const evidence=path.resolve('update-evidence');fs.mkdirSync(evidence,{recursive:true});
  const events=path.join(evidence,'events.jsonl'),stage=path.join(evidence,'baseline-source');
  asar.extractAll(archive,stage);
  const pkg=JSON.parse(fs.readFileSync(path.join(stage,'package.json')));
  const originalMain=pkg.main;pkg.main='update-probe.cjs';
  const metadata=yaml.load(fs.readFileSync(path.join(candidate,'latest-linux.yml'),'utf8'));
  assert.equal(pkg.version,`${metadata.version}-update-test.1`);
  const imageInfo=metadata.files.find(file=>file.url.endsWith('.AppImage'));
  const files=new Set(fs.readdirSync(candidate));
  const server=http.createServer((req,res)=>{
    const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname.slice(1));
    if(!files.has(name)){res.writeHead(404);res.end();return;}
    const file=path.join(candidate,name);res.setHeader('Content-Length',fs.statSync(file).size);fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const feed=`http://127.0.0.1:${server.address().port}/`;
  fs.writeFileSync(path.join(stage,'package.json'),JSON.stringify(pkg));
  fs.writeFileSync(path.join(stage,'update-probe.cjs'),`
const {app,ipcMain}=require('electron'),fs=require('fs');
const record=(event,data={})=>fs.appendFileSync(${JSON.stringify(events)},JSON.stringify({event,version:app.getVersion(),...data})+'\\n');
record('started',{profile:app.getPath('userData')});
const updater=require('electron-updater').autoUpdater;
updater.setFeedURL({provider:'generic',url:${JSON.stringify(feed)}});updater.disableDifferentialDownload=true;
// The disposable runner has passwordless sudo but no desktop PolicyKit agent.
${deb ? "updater.determineSudoCommand=()=>'sudo';" : ''}
const install=updater.quitAndInstall.bind(updater);updater.quitAndInstall=()=>install(true,true);
updater.on('error',e=>record('error',{message:String(e.stack)}));
updater.on('update-downloaded',info=>{record('downloaded',{next:info.version});setTimeout(()=>ipcMain.emit('app:install-update'),500)});
require(${JSON.stringify('./'+originalMain)});
app.whenReady().then(()=>{
 const {PersistenceService}=require('./dist/main/services/persistence.js');const p=new PersistenceService();
 if(p.getUser()||p.getRecords().length)throw Error('Test profile is not empty');
 const {TimeTracker}=require('./dist/main/services/timeTracker.js');
 new TimeTracker(p).addSession({taskLabel:'Linux upgrade sentinel',duration:120,startTime:new Date().toISOString(),endTime:new Date().toISOString()});
 p.saveSettings({...p.getSettings(),miniTimerEnabled:false});record('seeded');
});`);
  const patched=path.join(evidence,'probe.asar');
  cp.execFileSync(process.execPath,['-e',"require('@electron/asar').createPackage(process.argv[1],process.argv[2]).catch(e=>{console.error(e);process.exitCode=1})",stage,patched]);
  if(deb)cp.execFileSync('sudo',['cp',patched,archive]);else fs.copyFileSync(patched,archive);
  const feedFile=path.join(evidence,'app-update.yml');fs.writeFileSync(feedFile,yaml.dump({provider:'generic',url:feed,updaterCacheDirName:'zenstate-linux-update-ci'}));
  if(deb)cp.execFileSync('sudo',['cp',feedFile,path.join(resources,'app-update.yml')]);else fs.copyFileSync(feedFile,path.join(resources,'app-update.yml'));
  const output=fs.openSync(path.join(evidence,'baseline-runtime.log'),'w');
  const child=cp.spawn(exe,[],{env:{...process.env,...(!deb?{APPIMAGE:image}:{})},stdio:['ignore',output,output]});
  const processes=()=>fs.readdirSync('/proc').filter(name=>/^\d+$/.test(name)).flatMap(pid=>{
    try{const args=fs.readFileSync(`/proc/${pid}/cmdline`,'utf8').split('\0');return /\/zenstate$/.test(args[0])&&!args.some(arg=>arg.startsWith('--type='))?[Number(pid)]:[];}catch{return [];}
  });
  try{
    let success=false;const deadline=Date.now()+6*60*1000;
    while(Date.now()<deadline){
      await sleep(2000);
      const rows=fs.existsSync(events)?fs.readFileSync(events,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[];
      const error=rows.find(row=>row.event==='error');assert.ok(!error,error?.message);
      if(child.exitCode===null)continue;
      if(deb){
        asar.uncache(archive);let installed;try{installed=JSON.parse(asar.extractFile(archive,'package.json'));}catch{continue;}
        if(installed.version!==metadata.version||installed.main==='update-probe.cjs')continue;
      }else{
        if(!fs.existsSync(image)||fs.statSync(image).size!==imageInfo.size)continue;
        if(crypto.createHash('sha512').update(fs.readFileSync(image)).digest('base64')!==imageInfo.sha512)continue;
      }
      const running=processes().filter(pid=>pid!==child.pid);if(!running.length)continue;
      const started=rows.find(row=>row.event==='started');assert.ok(started);
      const data=JSON.parse(fs.readFileSync(path.join(started.profile,'zenstate-data.json')));
      const sessions=data.dailyRecords.flatMap(row=>row.sessions);assert.equal(sessions.length,1);
      assert.equal(sessions[0].taskLabel,'Linux upgrade sentinel');assert.equal(sessions[0].duration,120);assert.equal(data.appSettings.miniTimerEnabled,false);
      const result={passed:true,package:deb?'deb':'AppImage',from:pkg.version,to:metadata.version,restartedPids:running,retainedSession:true,retainedSettings:true};
      fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify(result,null,2));console.log(result);success=true;break;
    }
    assert.ok(success,'Timed out waiting for the installed app to update and restart');
  }finally{
    server.close();server.closeAllConnections();for(const pid of processes())try{process.kill(pid)}catch{}
    fs.closeSync(output);fs.rmSync(stage,{recursive:true,force:true});
  }
}
main().catch(error=>{console.error(error);process.exitCode=1});
