const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const yaml = require('js-yaml');
const asar = require('@electron/asar');
const vm = require('node:vm');
const zlib = require('node:zlib');

function verifyMetadata(dir, name) {
  const metadata = yaml.load(fs.readFileSync(path.join(dir,name),'utf8'));
  assert.match(metadata.version,/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/);
  assert.ok(Array.isArray(metadata.files) && metadata.files.length,'Empty update manifest');
  const seen=new Set();
  for(const entry of metadata.files) {
    assert.equal(entry.url,path.basename(entry.url),'Update URL must be a local artifact filename');
    assert.ok(!seen.has(entry.url),'Duplicate artifact');seen.add(entry.url);
    assert.ok(entry.url.includes(metadata.version),'Mixed versions in update manifest');
    const file=path.join(dir,entry.url);
    assert.equal(fs.statSync(file).size,entry.size,`Wrong size: ${entry.url}`);
    assert.equal(crypto.createHash('sha512').update(fs.readFileSync(file)).digest('base64'),entry.sha512,`Wrong checksum: ${entry.url}`);
    if(/\.(exe|zip)$/.test(entry.url)) {
      const blocks=JSON.parse(zlib.gunzipSync(fs.readFileSync(file+'.blockmap')));
      assert.equal(blocks.version,'2');assert.ok(blocks.files.length>0);
      let end=0;
      for(const group of blocks.files) {
        assert.equal(group.sizes.length,group.checksums.length,'Invalid blockmap');
        assert.ok(group.sizes.every(size=>Number.isSafeInteger(size)&&size>0));
        end=Math.max(end,group.offset+group.sizes.reduce((a,b)=>a+b,0));
      }
      assert.equal(end,entry.size,`Blockmap does not cover ${entry.url}`);
    }
    if(entry.blockMapSize) {
      const bytes=fs.readFileSync(file),size=bytes.readUInt32BE(bytes.length-4);
      assert.equal(size,entry.blockMapSize,'Embedded blockmap size mismatch');
      const blocks=JSON.parse(zlib.inflateRawSync(bytes.subarray(bytes.length-size-4,bytes.length-4)));
      assert.equal(blocks.version,'2');assert.ok(blocks.files.length>0);
      for(const group of blocks.files)assert.equal(group.sizes.length,group.checksums.length);
      assert.equal(Math.max(...blocks.files.map(group=>group.offset+group.sizes.reduce((a,b)=>a+b,0))),bytes.length-size-4);
    }
  }
  const primary=metadata.files.find(f=>f.url===metadata.path);assert.ok(primary,'Primary update path missing');assert.equal(metadata.sha512,primary.sha512);
  const extensions=name==='latest-mac.yml'?['.zip','.dmg']:name==='latest.yml'?['.exe']:['.AppImage','.deb'];
  for(const extension of extensions)assert.ok(metadata.files.some(f=>f.url.endsWith(extension)),`${name} requires ${extension}`);
  return {manifest:name,version:metadata.version,artifacts:metadata.files.map(f=>f.url)};
}
function verifyApp(resources,version) {
  const file=path.join(resources,'app.asar');const files=asar.listPackage(file).map(entry=>entry.replaceAll('\\','/'));
  const extract=entry=>asar.extractFile(file,entry.replaceAll('/',path.sep));
  const pkg=JSON.parse(extract('package.json'));assert.equal(pkg.version,version);
  // Packaging may hoist dependencies differently; compare name + version to
  // the tested lockfile rather than assuming identical node_modules paths.
  const lock=JSON.parse(fs.readFileSync('package-lock.json','utf8'));
  const locked=new Set(Object.entries(lock.packages).filter(([key])=>key.includes('node_modules/')).map(([key,value])=>`${key.slice(key.lastIndexOf('node_modules/')+13)}@${value.version}`));
  for(const entry of files.filter(p=>/\/node_modules\/(?:@[^/]+\/)?[^/]+\/package\.json$/.test(p))) {
    const dependency=JSON.parse(extract(entry.slice(1)));
    if(dependency.name && dependency.version)assert.ok(locked.has(`${dependency.name}@${dependency.version}`),`Packaged dependency differs from lockfile: ${dependency.name}@${dependency.version}`);
  }
  for(const required of ['dist/main/index.js','dist/main/preload.js','dist/renderer/index.html','dist/renderer/dashboard.html','dist/renderer/mini-timer.html','dist/renderer/alert.html','dist/shared/types.js'])assert.ok(files.includes('/'+required),`Missing ${required}`);
  for(const entry of files.filter(p=>p.startsWith('/dist/main/')&&p.endsWith('.js')))new vm.Script(extract(entry.slice(1)).toString(),{filename:entry});
  for(const entry of files.filter(p=>p.startsWith('/dist/')&&!p.endsWith('/')&&fs.existsSync(p.slice(1))&&fs.statSync(p.slice(1)).isFile())) {
    assert.ok(extract(entry.slice(1)).equals(fs.readFileSync(entry.slice(1))),`Packaged source differs from tested build: ${entry}`);
  }
  for(const root of ['dist/main','dist/shared','dist/renderer'])for(const relative of fs.readdirSync(root,{recursive:true})) {
    const local=path.join(root,relative);if(path.basename(local)==='.DS_Store'||!fs.statSync(local).isFile())continue;
    const entry=local.split(path.sep).join('/');assert.ok(files.includes('/'+entry),`Tested build file missing: ${entry}`);
  }
  assert.ok(files.some(p=>/WeeklyAllocationsTab-.*\.js$/.test(p)),'Allocation tab missing');
  assert.ok(!files.some(p=>/(?:^|\/)\.env(?:\.|$)|\.pem$|\.p12$/i.test(p)),'Credential file packaged');
  for(const icon of ['tray-available.png','tray-occupied.png','tray-focused.png','tray-offline.png'])assert.ok(fs.statSync(path.join(resources,'icons',icon)).size>0);
  const feed=yaml.load(fs.readFileSync(path.join(resources,'app-update.yml'),'utf8'));
  assert.equal(feed.provider,'github');assert.equal(feed.owner,'Everything-Design');assert.equal(feed.repo,'ZenState');
  return {resources,version,packagedFiles:files.length};
}
function run(dirs,complete=false,artifactsOnly=false) {
  const manifests=[],apps=[];
  assert.ok(dirs.length,'Provide artifact directories');
  const resourcesByManifest={
    'latest.yml':['win-unpacked/resources'],
    'latest-linux.yml':['linux-unpacked/resources'],
    'latest-mac.yml':['mac-arm64/ZenState.app/Contents/Resources','mac/ZenState.app/Contents/Resources'],
  };
  for(const dir of dirs) {
    const local=[];
    for(const name of Object.keys(resourcesByManifest))if(fs.existsSync(path.join(dir,name)))local.push(verifyMetadata(dir,name));
    assert.ok(local.length,`No update manifest in ${dir}`);
    manifests.push(...local);
    for(const manifest of local) {
      if(manifest.manifest==='latest-mac.yml')for(const arch of ['arm64','x64'])for(const ext of ['zip','dmg']) {
        assert.ok(manifest.artifacts.some(f=>f.endsWith(`-${arch}.${ext}`)),`Missing Mac ${arch} ${ext}`);
      }
      if(!artifactsOnly)for(const relative of resourcesByManifest[manifest.manifest]) {
        const resources=path.join(dir,relative);
        assert.ok(fs.existsSync(resources),`Missing packaged app: ${resources}`);
        apps.push(verifyApp(resources,manifest.version));
      }
    }
  }
  assert.equal(new Set(manifests.map(m=>m.version)).size,1,'Platform versions must match');
  assert.equal(new Set(manifests.map(m=>m.manifest)).size,manifests.length,'Duplicate platform manifests');
  if(complete) {
    for(const name of ['latest.yml','latest-mac.yml','latest-linux.yml'])assert.ok(manifests.some(m=>m.manifest===name),`Missing ${name}`);
  }
  return {manifests,apps};
}
module.exports={verifyMetadata,verifyApp,run};
if(require.main===module) {
  const args=process.argv.slice(2);
  const flags=new Set(['--complete','--artifacts-only','--stable']);
  for(const arg of args)if(arg.startsWith('--'))assert.ok(flags.has(arg),`Unknown option: ${arg}`);
  const dirs=args.filter(a=>!flags.has(a));
  if(!dirs.length)dirs.push(...['windows','mac','linux'].map(platform=>path.join('dist',`release-${require('../package.json').version}`,platform)));
  const result=run(dirs,args.includes('--complete'),args.includes('--artifacts-only'));
  if(args.includes('--stable')) {
    assert.ok(args.includes('--complete'),'Stable validation requires --complete');
    const version=require('../package.json').version;
    assert.match(version,/^\d+\.\d+\.\d+$/,'Stable package version required');
    assert.equal(result.manifests[0].version,version,'Release version must match package.json');
  }
  console.log(JSON.stringify(result,null,2));
}
