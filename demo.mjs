import { mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
await mkdir('demo',{recursive:true});
const encode = args => execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-n',...args],{stdio:'inherit'});
encode(['-f','lavfi','-i','testsrc2=size=1280x720:rate=24','-f','lavfi','-i','sine=frequency=220:sample_rate=48000',
  '-t','24','-c:v','libx264','-preset','veryfast','-pix_fmt','yuv420p','-g','48','-sc_threshold','0','-c:a','aac','-movflags','+faststart','demo/high.mp4']);
encode(['-i','demo/high.mp4','-vf','scale=320:180','-c:v','libx264','-crf','31','-g','48','-sc_threshold','0','-c:a','copy','-movflags','+faststart','demo/proxy.mp4']);
execFileSync(process.execPath,['afm.mjs','pack','demo/proxy.mp4','demo/example.afm','demo','1','http://127.0.0.1:8080/v1/resolve'],{stdio:'inherit'});
console.log('Open demo/example.afm in the player.');

