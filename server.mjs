import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';

const port = Number(process.env.PORT || 8080);
const catalog = process.argv[2];
const files = new Map([['/', ['player.html','text/html']], ['/player.js',['player.js','text/javascript']], ['/demo/high.mp4',['demo/high.mp4','video/mp4']]]);
const server = createServer(async (req,res) => {
  function reply(code, body) { res.writeHead(code, {'Content-Type':'application/json'}); res.end(JSON.stringify(body)); }
  try {
    if (req.method === 'POST' && req.url === '/v1/resolve') {
      let body = '';
      for await (const part of req) {
        body += part.toString();
        if (Buffer.byteLength(body) > 8192) return reply(413,{error:'Request too large'});
      }
      let query;
      try { query = JSON.parse(body); } catch { return reply(400,{error:'Invalid JSON'}); }
      const entries = catalog ? JSON.parse(await readFile(catalog,'utf8')) : [{
        assetId:'demo',revision:'1',playback:'http://127.0.0.1:' + port + '/demo/high.mp4'
      }];
      const entry = entries.find(e => e.assetId === query?.assetId && e.revision === query?.revision);
      return entry ? reply(200,entry) : reply(404,{error:'Unknown asset revision'});
    }
    const route = files.get(req.url);
    if (!route || !['GET','HEAD'].includes(req.method)) return reply(404,{error:'Not found'});
    const [name,type] = route;
    const file = new URL(name,import.meta.url);
    const {size} = await stat(file);
    const range = req.headers.range;
    let start = 0, end = size-1;
    const headers = {'Content-Type':type,'Accept-Ranges':'bytes'};
    if (range) {
      const m = /^bytes=(\d+)-(\d*)$/.exec(range);
      start = m ? Number(m[1]) : NaN;
      end = m?.[2] ? Math.min(Number(m[2]),end) : end;
      if (!Number.isSafeInteger(start) || start > end) {
        res.writeHead(416,{'Content-Range':'bytes */'+size}); return res.end();
      }
      headers['Content-Range'] = 'bytes '+start+'-'+end+'/'+size;
    }
    res.writeHead(range ? 206 : 200,{...headers,'Content-Length':end-start+1});
    if (req.method === 'HEAD') return res.end();
    await pipeline(createReadStream(file,{start,end}),res);
  } catch (error) {
    if (!res.headersSent && !res.destroyed) reply(error.code === 'ENOENT' ? 404 : 500,{error:'Resource unavailable'});
  }
});
server.listen(port,'127.0.0.1',()=>console.log('Auto Flow Media: http://127.0.0.1:'+port));

