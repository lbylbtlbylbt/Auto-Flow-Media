import test from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import { spawn,execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('TLS workspace, paired media, membership, review and scoped playback', {
  skip:!process.env.AFM_TEST_CERT || !process.env.AFM_TEST_KEY, timeout:60000
},async()=>{
  const dir=await mkdtemp(join(tmpdir(),'afm-team-test-'));
  const origin='https://127.0.0.1:'+(process.env.AFM_TEST_PORT || 18443);
  const env={...process.env,AFM_ORIGIN:origin,AFM_DATA:dir,AFM_CERT:process.env.AFM_TEST_CERT,AFM_KEY:process.env.AFM_TEST_KEY};
  const run=(script,...args)=>execFileSync(process.execPath,[script,...args],{env,encoding:'utf8',stdio:['ignore','pipe','pipe']});
  const team=(...args)=>run('team.mjs',...args);
  const sample=join(dir,'master.mp4'), packed=join(dir,'custom.afm');
  const ca=await readFile(env.AFM_CERT);
  let server;
  try{
    execFileSync('ffmpeg',['-loglevel','error','-f','lavfi','-i','testsrc2=size=320x180:rate=24','-t','2','-c:v','libx264',sample]);
    run('prepare.mjs','encode',sample,'120','28',packed,'shot','1',origin+'/v1/resolve');
    const shorter=join(dir,'short.mp4');
    execFileSync('ffmpeg',['-loglevel','error','-i',sample,'-frames:v','47','-c:v','libx264',shorter]);
    assert.throws(()=>run('prepare.mjs','pair',shorter,sample,join(dir,'bad.afm'),'shot','1',origin+'/v1/resolve'),/timelines differ/);
    const adminKey=team('init','Editorial','Producer').trim().split(' ').pop();
    const otherKey=team('init','Games','Producer').trim().split(' ').pop();
    team('import','Editorial',packed,sample);
    server=spawn(process.execPath,['team.mjs','serve'],{env,stdio:['ignore','pipe','inherit']});
    await Promise.race([once(server.stdout,'data'),once(server,'exit').then(()=>{throw Error('Server exited before readiness');})]);
    function req(path,data,cookie,extra={}){
      return new Promise((ok,no)=>{
        const headers={origin,...extra};
        if(cookie)headers.cookie=cookie;
        if(data)headers['content-type']='application/json';
        const r=https.request(origin+path,{method:data?'POST':'GET',headers,ca},res=>{
          const parts=[];res.on('data',b=>parts.push(b));res.on('end',()=>{
            const bytes=Buffer.concat(parts);
            ok({status:res.statusCode,body:res.headers['content-type']==='application/json'?JSON.parse(bytes):bytes,cookie:res.headers['set-cookie']?.[0].split(';')[0]});
          });
        });r.on('error',no);r.end(data?JSON.stringify(data):undefined);
      });
    }
    const login=async key=>(await req('/login',{key})).cookie;
    const admin=await login(adminKey),other=await login(otherKey);
    assert.equal((await req('/')).status,200);
    assert.equal((await req('/state')).status,401);
    const viewer=await login((await req('/members',{name:'Reader',role:'viewer'},admin)).body.key);
    const editor=await login((await req('/members',{name:'Cutter',role:'editor'},admin)).body.key);
    const state=(await req('/state',null,admin)).body;
    const asset=state.assets[0].id;
    assert.equal((await req('/notes',{asset,text:'Frame checked'},editor)).status,201);
    assert.equal((await req('/notes',{asset,text:'Write'},viewer)).status,403);
    assert.equal((await req('/state',null,viewer)).body.notes[0].body,'Frame checked');
    const query={assetId:'shot',revision:'1'};
    assert.equal((await req('/v1/resolve',query,other)).status,404);
    const path=new URL((await req('/v1/resolve',query,viewer)).body.playback).pathname;
    assert.equal((await req(path,null,other)).status,403);
    const range=await req(path,null,viewer,{range:'bytes=4-7'});
    assert.equal(range.status,206);assert.equal(range.body.toString(),'ftyp');
    assert.equal((await req('/availability',{id:asset,available:false},editor)).status,200);
    assert.equal((await req(path,null,viewer)).status,403);
    assert.equal((await req('/v1/resolve',query,viewer)).status,404);
    const id=state.members.find(m=>m.name==='Reader').id;
    assert.equal((await req('/revoke',{id},admin)).status,200);
    assert.equal((await req('/state',null,viewer)).status,401);
  }finally{
    if(server&&server.exitCode===null){const exit=once(server,'exit');server.kill();await exit;}
    await rm(dir,{recursive:true,force:true});
  }
});
