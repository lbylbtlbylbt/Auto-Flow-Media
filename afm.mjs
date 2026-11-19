import { open, stat, link, unlink, copyFile, constants } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const uuid = '473100a249014ff5a73cd10e0ddf44ef';
const limit = 65536;

export async function metadata(file) {
  const { size } = await file.stat();
  const tail = Buffer.alloc(Math.min(size, limit + 28));
  const start = size - tail.length;
  const { bytesRead } = await file.read(tail, 0, tail.length, start);
  if (bytesRead !== tail.length || tail.length < 28) throw Error('Incomplete AFM file');
  const length = tail.readUInt32BE(tail.length - 4);
  const offset = tail.length - length - 28;
  if (offset < 0 || tail.readUInt32BE(offset) !== length + 28 ||
      tail.toString('ascii', offset + 4, offset + 8) !== 'uuid' ||
      tail.toString('hex', offset + 8, offset + 24) !== uuid) throw Error('AFM metadata missing');
  const manifest = JSON.parse(tail.toString('utf8', offset + 24, tail.length - 4));
  validate(manifest);
  return { manifest, mediaBytes: start + offset };
}

function validate(m) {
  if (m.version !== 1 || ![m.assetId, m.revision, m.resolverUrl].every(v => typeof v === 'string' && v.length))
    throw Error('Invalid AFM v1 manifest');
  if (!['https:', 'http:'].includes(new URL(m.resolverUrl).protocol)) throw Error('Expected an HTTP resolver');
}

async function run([command, input, output, assetId, revision, resolverUrl]) {
  if (!input || !['inspect','pack','extract'].includes(command) || (command !== 'inspect' && !output))
    throw Error('Usage: node afm.mjs pack INPUT OUTPUT ASSET REVISION RESOLVER | inspect INPUT | extract INPUT OUTPUT');
  const source = await open(input);
  try {
    if (command === 'inspect') return console.log(JSON.stringify(await metadata(source), null, 2));
    let end = (await stat(input)).size;
    let trailer;
    if (command === 'pack') {
      const head = Buffer.alloc(8);
      await source.read(head, 0, 8, 0);
      if (head.toString('ascii', 4) !== 'ftyp') throw Error('Expected MP4 with a leading ftyp box');
      const manifest = { version: 1, assetId, revision, resolverUrl };
      validate(manifest);
      const json = Buffer.from(JSON.stringify(manifest));
      if (json.length > limit) throw Error('Manifest exceeds 64 KiB');
      trailer = Buffer.alloc(json.length + 28);
      trailer.writeUInt32BE(trailer.length);
      trailer.write('uuid', 4);
      Buffer.from(uuid,'hex').copy(trailer,8);
      json.copy(trailer,24);
      trailer.writeUInt32BE(json.length,trailer.length-4);
      // A size-zero box would consume the appended metadata.
      let position = 0;
      let hasMovie = false, hasData = false;
      const header = Buffer.alloc(16);
      while (position < end) {
        const { bytesRead } = await source.read(header,0,16,position);
        if (bytesRead < 8) throw Error('Truncated MP4 box');
        let size = header.readUInt32BE();
        const extended = size === 1;
        if (extended && bytesRead >= 16) size = Number(header.readBigUInt64BE(8));
        if (size < (extended ? 16 : 8) || size > end-position) throw Error('Invalid or open-ended MP4 box');
        const type = header.toString('ascii',4,8);
        hasMovie ||= type === 'moov';
        hasData ||= type === 'mdat';
        position += size;
      }
      if (!hasMovie || !hasData) throw Error('Expected self-contained MP4 media');
    } else end = (await metadata(source)).mediaBytes;
    const temp = output + '.' + randomUUID() + '.tmp';
    const target = await open(temp,'wx');
    try {
      const stream = createReadStream(input, { start:0, end:end-1 });
      await pipeline(stream, target.createWriteStream({autoClose:true}));
      if (trailer) {
        const append = await open(temp,'a');
        try { await append.writeFile(trailer); } finally { await append.close(); }
      }
      try { await link(temp, output); } catch (error) {
        if (!['EPERM','ENOTSUP','EOPNOTSUPP','ENOSYS'].includes(error.code)) throw error;
        await copyFile(temp, output, constants.COPYFILE_EXCL);
      }
    } finally { await target.close(); await unlink(temp); }
  } finally { await source.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  run(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
