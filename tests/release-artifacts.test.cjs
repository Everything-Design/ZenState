const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const crypto=require('node:crypto');const yaml=require('js-yaml');
const {verifyMetadata,verifyApp,run}=require('../scripts/verify-release.cjs');
const zlib=require('node:zlib');
test('release verifier rejects corrupt/missing files, wrong versions and missing Mac updater ZIP',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'zenstate-release-'));
  try{
    const name='ZenState-5.8.4-arm64.dmg',content=Buffer.from('test-artifact');fs.writeFileSync(path.join(dir,name),content);
    const entry={url:name,size:content.length,sha512:crypto.createHash('sha512').update(content).digest('base64')};
    const metadata={version:'5.8.4',files:[entry],path:name,sha512:entry.sha512};
    const write=()=>fs.writeFileSync(path.join(dir,'latest-mac.yml'),yaml.dump(metadata));write();
    assert.throws(()=>verifyMetadata(dir,'latest-mac.yml'),/requires .zip/);
    const zip={...entry,url:'ZenState-5.8.4-arm64.zip'};metadata.files.push(zip);fs.writeFileSync(path.join(dir,zip.url),content);fs.writeFileSync(path.join(dir,zip.url+'.blockmap'),zlib.gzipSync(JSON.stringify({version:'2',files:[{offset:0,sizes:[content.length],checksums:['fixture']}]})));write();
    assert.equal(verifyMetadata(dir,'latest-mac.yml').version,'5.8.4');
    fs.writeFileSync(path.join(dir,name),'test-artifacX');assert.throws(()=>verifyMetadata(dir,'latest-mac.yml'),/Wrong checksum/);
    fs.writeFileSync(path.join(dir,name),content);metadata.version='5.8.5';write();assert.throws(()=>verifyMetadata(dir,'latest-mac.yml'),/Mixed versions/);
    metadata.version='5.8.4';write();fs.unlinkSync(path.join(dir,name));assert.throws(()=>verifyMetadata(dir,'latest-mac.yml'),/ENOENT/);
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('release set rejects empty directories, missing packaged apps, mismatched versions and duplicate platforms',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'zenstate-release-set-'));
  function fixture(dir,manifest,version,names) {
    fs.mkdirSync(dir,{recursive:true});
    const content=Buffer.from('test-artifact');
    const files=names.map(name=>{
      const url=`ZenState-${version}-${name}`;
      fs.writeFileSync(path.join(dir,url),content);
      if(/\.(exe|zip)$/.test(url))fs.writeFileSync(path.join(dir,url+'.blockmap'),zlib.gzipSync(JSON.stringify({version:'2',files:[{offset:0,sizes:[content.length],checksums:['fixture']}]})));
      return {url,size:content.length,sha512:crypto.createHash('sha512').update(content).digest('base64')};
    });
    fs.writeFileSync(path.join(dir,manifest),yaml.dump({version,files,path:files[0].url,sha512:files[0].sha512}));
  }
  const version=require('../package.json').version==='5.8.4'?'5.8.5':'5.8.4';
  try {
    const win=path.join(root,'windows'),mac=path.join(root,'mac'),linux=path.join(root,'linux'),empty=path.join(root,'empty');
    fs.mkdirSync(empty);
    fixture(win,'latest.yml',version,['Setup.exe']);
    fixture(mac,'latest-mac.yml',version,['arm64.zip','x64.zip','arm64.dmg','x64.dmg']);
    fixture(linux,'latest-linux.yml',version,['x86_64.AppImage','amd64.deb']);
    assert.throws(()=>run([],true,true),/Provide artifact directories/);
    assert.throws(()=>run([win,empty],false,true),/No update manifest/);
    assert.throws(()=>run([win]),/Missing packaged app/);
    assert.throws(()=>run([win,win],false,true),/Duplicate platform/);
    assert.throws(()=>run([win,mac],true,true),/Missing latest-linux.yml/);
    assert.equal(run([win,mac,linux],true,true).manifests.length,3);
    const {execFileSync}=require('node:child_process');
    assert.throws(()=>execFileSync(process.execPath,['scripts/verify-release.cjs','--complete','--artifacts-only','--stable',win,mac,linux],{stdio:'pipe'}),error=>error.stderr.toString().includes('Release version must match package.json'));
    fixture(linux,'latest-linux.yml','0.0.0',['x86_64.AppImage','amd64.deb']);
    assert.throws(()=>run([win,mac,linux],true,true),/Platform versions must match/);
    fixture(mac,'latest-mac.yml',version,['arm64.zip','x64.zip','arm64.dmg']);
    assert.throws(()=>run([mac],false,true),/Missing Mac x64 dmg/);
    fixture(mac,'latest-mac.yml',version,['arm64.zip','arm64.dmg','x64.dmg']);
    assert.throws(()=>run([mac],false,true),/Missing Mac x64 zip/);
    const appSource=path.join(root,'app-source'),resources=path.join(root,'resources');
    fs.mkdirSync(path.join(appSource,'node_modules','zenstate-dependency-fixture'),{recursive:true});
    fs.mkdirSync(resources);
    fs.writeFileSync(path.join(appSource,'package.json'),JSON.stringify({version}));
    fs.writeFileSync(path.join(appSource,'node_modules','zenstate-dependency-fixture','package.json'),JSON.stringify({name:'zenstate-dependency-fixture',version:'999.0.0'}));
    await require('@electron/asar').createPackage(appSource,path.join(resources,'app.asar'));
    assert.throws(()=>verifyApp(resources,version),/Packaged dependency differs from lockfile/);
  }finally{fs.rmSync(root,{recursive:true,force:true})}
});
