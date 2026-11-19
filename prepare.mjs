import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createInterface } from 'node:readline';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

function fraction(value, base) {
  const [num,den] = base.split('/').map(BigInt);
  const n = BigInt(value)*num;
  let a = n < 0n ? -n : n, b = den;
  while (b) [a,b] = [b,a%b];
  return String(n/a)+'/'+String(den/a);
}
async function timeline(path) {
  const input = resolve(path);
  const {streams,format} = JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries',
    'format=start_time,duration:stream=codec_type,time_base,start_pts,duration_ts','-of','json',input]));
  const videos = streams.filter(s=>s.codec_type==='video');
  if (videos.length !== 1) throw Error('Expected one video track');
  const tracks = streams.filter(s=>['video','audio'].includes(s.codec_type)).map(s=>{
    if (![s.start_pts,s.duration_ts].every(Number.isSafeInteger)) throw Error('Missing exact track timing');
    return [s.codec_type,fraction(s.start_pts,s.time_base),fraction(s.duration_ts,s.time_base)].join(' ');
  }).sort();
  const proc = spawn('ffprobe',['-v','error','-select_streams','v:0','-show_frames',
    '-show_entries','frame=pts,duration','-of','compact=p=0',input],{stdio:['ignore','pipe','inherit']});
  const done = new Promise((ok,no)=>{proc.on('error',no);proc.on('close',code=>code===0?ok():no(Error('Frame probe failed')));});
  done.catch(()=>{});
  const hash = createHash('sha256');
  let count=0;
  try {
    for await (const line of createInterface({input:proc.stdout})) {
      if (!line.startsWith('pts=')) continue;
      const match=/^pts=(-?\d+)\|duration=(\d+)(?:\||$)/.exec(line);
      if (!match) throw Error('Missing exact frame timing');
      const base=videos[0].time_base;
      hash.update(fraction(match[1],base)+' '+fraction(match[2],base)+'\n');
      count++;
    }
    await done;
  } finally {proc.kill();await done.catch(()=>{});}
  if (!count) throw Error('Empty video timeline');
  return JSON.stringify([format.start_time,format.duration,tracks,count,hash.digest('hex')]);
}
export async function verifyPair(local,online) {
  if (await timeline(local) !== await timeline(online)) throw Error('Local and online timelines differ');
}
async function main([mode,source,...args]) {
  let local, online, output, asset, revision, endpoint;
  const temp=await mkdtemp(join(tmpdir(),'afm-prepare-'));
  try {
    if (mode==='pair' && args.length===5) {
      [online,output,asset,revision,endpoint]=args;
      local=source;
    } else if (mode==='encode' && args.length===6) {
      const [height,crf]=args;
      if (!/^\d+$/.test(height) || +height<2 || +height>16384 || +height%2 ||
          !/^\d+$/.test(crf) || +crf>51) throw Error('Use an even height and CRF from 0 through 51');
      [output,asset,revision,endpoint]=args.slice(2);
      online=source;
      local=join(temp,'proxy.mp4');
      execFileSync('ffmpeg',['-v','error','-nostdin','-i',resolve(source),'-map','0:v:0','-map','0:a?',
        '-vf','scale=-2:'+height,'-fps_mode','passthrough','-c:v','libx264','-pix_fmt','yuv420p',
        '-crf',crf,'-c:a','copy','-movflags','+faststart',local],{stdio:'inherit'});
    } else throw Error('Use pair LOCAL ONLINE OUTPUT ASSET REVISION RESOLVER or encode MASTER HEIGHT CRF OUTPUT ASSET REVISION RESOLVER');
    await verifyPair(local,online);
    execFileSync(process.execPath,[fileURLToPath(new URL('afm.mjs',import.meta.url)),'pack',local,output,asset,revision,endpoint],{stdio:'inherit'});
  } finally {await rm(temp,{recursive:true,force:true,maxRetries:8,retryDelay:150});}
}
if (process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
  main(process.argv.slice(2)).catch(e=>{console.error(e.message);process.exitCode=1;});
