import { createServer } from 'node:https';
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, open, copyFile, unlink, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { metadata } from './afm.mjs';
import { verifyPair } from './prepare.mjs';

const dir=resolve(process.env.AFM_DATA || '.afm-team');
await mkdir(dir,{recursive:true,mode:0o700});
const db=new DatabaseSync(join(dir,'workspace.sqlite'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS members(id INTEGER PRIMARY KEY AUTOINCREMENT,space TEXT,name TEXT,role TEXT,keyhash TEXT UNIQUE,UNIQUE(space,name));
CREATE TABLE IF NOT EXISTS assets(id INTEGER PRIMARY KEY,space TEXT,asset TEXT,revision TEXT,object TEXT,available INTEGER DEFAULT 1,UNIQUE(space,asset,revision));
CREATE TABLE IF NOT EXISTS notes(id INTEGER PRIMARY KEY,asset INTEGER,author TEXT,body TEXT);`);
const digest=s=>createHash('sha256').update(s).digest('hex');
const secret=()=>randomBytes(32).toString('base64url');
const reject=(status,message)=>{throw Object.assign(Error(message),{status});};
function label(s) {
  if(typeof s!=='string'||!s.trim()||s.length>128) reject(400,'Invalid name');
  return s.trim();
}
function addMember(space,name,role) {
  if(!['admin','editor','viewer'].includes(role)) reject(400,'Invalid role');
  const key=secret();
  try {db.prepare('INSERT INTO members(space,name,role,keyhash) VALUES(?,?,?,?)').run(label(space),label(name),role,digest(key));}
  catch(e){if(e.message.includes('UNIQUE'))reject(409,'Name already exists');throw e;}
  return key;
}
async function ingest(space,packed,online) {
  if (!db.prepare('SELECT id FROM members WHERE space=?').get(space)) throw Error('Unknown workspace');
  const file=await open(packed);
  let manifest;
  try {({manifest}=await metadata(file));} finally {await file.close();}
  const object=randomUUID(), target=join(dir,object);
  await copyFile(online,target);
  try {
    const source=await open(target);
    try {
      const header=Buffer.alloc(8);
      await source.read(header,0,8,0);
      if(header.toString('ascii',4)!=='ftyp')throw Error('Online delivery requires an MP4 file');
    } finally {await source.close();}
    await verifyPair(packed,target);
    db.prepare('INSERT INTO assets(space,asset,revision,object) VALUES(?,?,?,?)').run(space,manifest.assetId,manifest.revision,object);
  } catch(e){await unlink(target);throw e;}
}
const publicFiles=new Map([['/',['team.html','text/html']],['/team.js',['team.js','text/javascript']],
  ['/player',['player.html','text/html']],['/player.js',['player.js','text/javascript']]]);
async function serve() {
  const origin=new URL(process.env.AFM_ORIGIN);
  if(origin.protocol!=='https:'||origin.href!==origin.origin+'/') throw Error('AFM_ORIGIN must be an HTTPS origin');
  const sessions=new Map(), tickets=new Map();
  const timer=setInterval(()=>{
    for(const map of [sessions,tickets]) for(const [k,v] of map) if(v.until<=Date.now()) map.delete(k);
  },60000);
  timer.unref();
  const options={cert:await readFile(process.env.AFM_CERT),key:await readFile(process.env.AFM_KEY),minVersion:'TLSv1.2'};
  const server=createServer(options,async(req,res)=>{
    const json=(value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
    res.setHeader('Cache-Control','private, no-store');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; media-src 'self' blob: https:; connect-src 'self' https:; frame-ancestors 'none'; base-uri 'none'");
    try {
      const path=req.url, method=req.method;
      if(method==='GET' && publicFiles.has(path)){
        const [name,type]=publicFiles.get(path);res.setHeader('Content-Type',type);
        return res.end(await readFile(new URL(name,import.meta.url)));
      }
      let body={};
      if(method==='POST'){
        if(req.headers.origin!==origin.origin || req.headers['content-type']?.split(';')[0]!=='application/json') reject(403,'Same-origin JSON required');
        const parts=[];let total=0;
        for await(const chunk of req){total+=chunk.length;if(total>8192)reject(413,'Request too large');parts.push(chunk);}
        try{body=JSON.parse(Buffer.concat(parts));}catch{reject(400,'Invalid JSON');}
        if(!body || typeof body!=='object') reject(400,'Invalid request');
      }
      if(method==='POST' && path==='/login'){
        const member=db.prepare('SELECT id FROM members WHERE keyhash=?').get(digest(String(body.key)));
        if(!member)reject(401,'Invalid access key');
        const sid=secret();sessions.set(sid,{id:member.id,until:Date.now()+8*3600000});
        res.setHeader('Set-Cookie','__Host-afm='+sid+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800');
        return json({ok:true});
      }
      const sid=/(?:^|;\s*)__Host-afm=([A-Za-z0-9_-]+)/.exec(req.headers.cookie||'')?.[1];
      const session=sessions.get(sid);
      const user=session?.until>Date.now() && db.prepare('SELECT id,space,name,role FROM members WHERE id=?').get(session.id);
      if(!user)reject(401,'Sign in to your workspace');
      if(method==='POST'&&path==='/logout'){sessions.delete(sid);return json({ok:true});}
      if(method==='GET'&&path==='/state'){
        return json({user,assets:db.prepare('SELECT id,asset,revision,available FROM assets WHERE space=? ORDER BY asset').all(user.space),
          members:db.prepare('SELECT id,name,role FROM members WHERE space=? ORDER BY name').all(user.space),
          notes:db.prepare('SELECT n.* FROM notes n JOIN assets a ON a.id=n.asset WHERE a.space=? ORDER BY n.id DESC LIMIT 100').all(user.space)});
      }
      if(method==='POST'&&path==='/members'){
        if(user.role!=='admin')reject(403,'Administrator required');
        return json({key:addMember(user.space,body.name,body.role)},201);
      }
      if(method==='POST'&&path==='/revoke'){
        if(user.role!=='admin'||body.id===user.id)reject(403,'Cannot revoke this member');
        db.prepare('DELETE FROM members WHERE id=? AND space=?').run(body.id,user.space);return json({ok:true});
      }
      if(method==='POST'&&path==='/notes'){
        if(user.role==='viewer')reject(403,'Editor required');
        if(typeof body.text!=='string'||!body.text.trim()||body.text.length>2000)reject(400,'Invalid note');
        if(!db.prepare('SELECT id FROM assets WHERE id=? AND space=?').get(body.asset,user.space))reject(404,'Unknown asset');
        db.prepare('INSERT INTO notes(asset,author,body) VALUES(?,?,?)').run(body.asset,user.name,body.text.trim());return json({ok:true},201);
      }
      if(method==='POST'&&path==='/availability'){
        if(user.role==='viewer')reject(403,'Editor required');
        if(typeof body.available!=='boolean')reject(400,'Expected a boolean');
        const asset=db.prepare('SELECT object FROM assets WHERE space=? AND id=?').get(user.space,body.id);
        if(!asset)reject(404,'Unknown asset');
        db.prepare('UPDATE assets SET available=? WHERE space=? AND id=?').run(Number(body.available),user.space,body.id);
        if(!body.available)for(const [key,ticket] of tickets)if(ticket.object===asset.object)tickets.delete(key);
        return json({ok:true});
      }
      if(method==='POST'&&path==='/v1/resolve'){
        const asset=db.prepare('SELECT object FROM assets WHERE space=? AND asset=? AND revision=? AND available=1').get(user.space,label(body.assetId),label(body.revision));
        if(!asset)reject(404,'Unknown asset revision');
        const token=secret();tickets.set(token,{sid,object:asset.object,until:Date.now()+300000});
        return json({assetId:body.assetId,revision:body.revision,playback:origin.origin+'/media/'+token});
      }
      if(['HEAD','GET'].includes(method)&&path.startsWith('/media/')){
        const ticket=tickets.get(path.slice('/media/'.length));
        if(!ticket||ticket.sid!==sid||ticket.until<=Date.now())reject(403,'Invalid or expired media ticket');
        const file=join(dir,ticket.object), {size}=await stat(file);
        let start=0,end=size-1;
        if(req.headers.range){
          const m=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range);
          start=m?Number(m[1]):NaN;end=m?.[2]?Math.min(end,Number(m[2])):end;
          if(!Number.isSafeInteger(start)||start>end){res.setHeader('Content-Range','bytes */'+size);reject(416,'Invalid range');}
          res.setHeader('Content-Range','bytes '+start+'-'+end+'/'+size);
        }
        res.writeHead(req.headers.range?206:200,{'Content-Type':'video/mp4','Accept-Ranges':'bytes','Content-Length':end-start+1});
        if(method==='HEAD')return res.end();
        await pipeline(createReadStream(file,{start,end}),res);return;
      }
      reject(404,'Not found');
    }catch(e){if(!res.headersSent&&!res.destroyed)json({error:e.status?e.message:'Request failed'},e.status||500);}
  });
  server.listen(Number(origin.port||443),process.env.AFM_BIND||'127.0.0.1',()=>console.log('Team workspace: '+origin.origin));
}
try {
  const [cmd,space,name,online]=process.argv.slice(2);
  if(cmd==='init'){
    db.exec('BEGIN IMMEDIATE');
    try{if(db.prepare('SELECT id FROM members WHERE space=?').get(label(space)))throw Error('Workspace exists');
      const key=addMember(space,name,'admin');db.exec('COMMIT');console.log('Administrator access key (store privately): '+key);
    }catch(e){db.exec('ROLLBACK');throw e;}
  }else if(cmd==='import')await ingest(space,name,online);
  else if(cmd==='serve')await serve();
  else throw Error('Usage: team.mjs init SPACE ADMIN | import SPACE PACKED ONLINE_MP4 | serve');
}catch(e){console.error(e.message);process.exitCode=1;}
