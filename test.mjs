import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('pack, inspect, restore, reject corrupt trailers and preserve existing output',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'afm-'));
  const run=(...args)=>execFileSync(process.execPath,[fileURLToPath(new URL('afm.mjs',import.meta.url)),...args],{stdio:'pipe'});
  try {
    const input=join(dir,'source.mp4'), packed=join(dir,'source.afm'), restored=join(dir,'restored.mp4');
    const boxes=['ftyp','moov','mdat'].map(type=>{const b=Buffer.alloc(8); b.writeUInt32BE(8); b.write(type,4); return b;});
    const original=Buffer.concat(boxes);
    await writeFile(input,original);
    run('pack',input,packed,'asset','1','https://example.org/resolve');
    assert.equal(JSON.parse(run('inspect',packed)).manifest.assetId,'asset');
    run('extract',packed,restored);
    assert.deepEqual(await readFile(restored),original);
    assert.throws(()=>run('extract',packed,restored));
    const bytes=await readFile(packed);
    bytes.writeUInt32BE(0xffffffff,bytes.length-4);
    await writeFile(packed,bytes);
    assert.throws(()=>run('inspect',packed));
  } finally { await rm(dir,{recursive:true,force:true}); }
});

