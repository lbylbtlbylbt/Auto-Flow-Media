const el = id => document.getElementById(id);
const local = el('local'), high = el('high'), cloud = el('cloud');
let manifest, localUrl, generation = 0, pending, retryAt = 0, remoteReady = false;
function fallback() {
  high.style.visibility = 'hidden';
  if (manifest) el('status').textContent = 'Playing from the local file';
}
function resetRemote() {
  generation++;
  pending?.abort();
  pending = null;
  remoteReady = false;
  high.pause();
  high.removeAttribute('src');
  high.load();
  retryAt = 0;
  fallback();
}
el('file').onchange = async event => {
  const file = event.target.files[0];
  if (!file) return;
  manifest = null;
  cloud.checked = false;
  resetRemote();
  const id = generation;
  local.pause();
  local.removeAttribute('src');
  local.load();
  if (localUrl) URL.revokeObjectURL(localUrl);
  el('origin').textContent = '';
  try {
    const tail = new Uint8Array(await file.slice(-65564).arrayBuffer());
    const view = new DataView(tail.buffer);
    const len = view.getUint32(tail.length-4), pos = tail.length-28-len;
    const hex = Array.from(tail.slice(pos+8,pos+24), b=>b.toString(16).padStart(2,'0')).join('');
    if (pos<0 || view.getUint32(pos)!==len+28 || view.getUint32(pos+4)!==0x75756964 || hex!=='473100a249014ff5a73cd10e0ddf44ef') throw Error('Invalid AFM trailer');
    const m = JSON.parse(new TextDecoder().decode(tail.slice(pos+24,-4)));
    if (m.version!==1 || !m.assetId || !m.revision || !/^https?:$/.test(new URL(m.resolverUrl).protocol)) throw Error('Unsupported manifest');
    if (id!==generation) return;
    manifest=m;
    el('origin').textContent='Remote resolver: '+new URL(m.resolverUrl).origin;
    localUrl=URL.createObjectURL(file.slice(0,file.size-len-28,'video/mp4'));
    local.src=localUrl;
    fallback();
    local.play().catch(()=>{});
  } catch (e) { if (generation===id) el('status').textContent=e.message; }
};
async function connect() {
  const id=generation, controller=new AbortController();
  pending=controller;
  const timeout=setTimeout(()=>controller.abort(),6000);
  try {
    const {assetId,revision,resolverUrl}=manifest;
    const response=await fetch(resolverUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({assetId,revision}),signal:controller.signal,credentials:'same-origin'});
    if (!response.ok) throw Error();
    const entry=await response.json();
    if (id!==generation) return;
    if (entry.assetId!==assetId || entry.revision!==revision || !/^https?:$/.test(new URL(entry.playback).protocol)) throw Error();
    high.src=entry.playback;
    high.load();
  } catch { retryAt=Date.now()+10000; } finally { clearTimeout(timeout); if (pending===controller) pending=null; }
}
cloud.onchange=resetRemote;
high.onloadedmetadata=()=>{ high.currentTime=local.currentTime; remoteReady=true; };
high.onerror=()=>{ if (!high.hasAttribute('src')) return; resetRemote(); retryAt=Date.now()+10000; };
high.onwaiting=fallback;
local.onseeking=()=>{ fallback(); if (remoteReady) high.currentTime=local.currentTime; };
local.onpause=()=>{ high.pause(); el('play').textContent='Play'; };
local.onplay=()=>{ el('play').textContent='Pause'; };
el('play').onclick=()=>{ if (local.paused) local.play().catch(()=>{}); else local.pause(); };
el('seek').oninput=e=>{ if (Number.isFinite(local.duration)) local.currentTime=local.duration*e.target.value/1000; };
setInterval(()=>{
  if (!manifest || local.paused) return;
  el('seek').value=1000*local.currentTime/local.duration || 0;
  if (!cloud.checked) return;
  if (!high.hasAttribute('src') && !pending && Date.now()>retryAt) void connect();
  if (!remoteReady || local.seeking || high.seeking) return fallback();
  const drift=high.currentTime-local.currentTime;
  if (Math.abs(drift)>.25) { high.currentTime=local.currentTime; return fallback(); }
  if (high.paused) high.play().catch(()=>{});
  high.playbackRate=Math.abs(drift)>.035 ? (drift>0?.96:1.04) : 1;
  const threshold=high.style.visibility==='visible' ? .3 : 2;
  for (let i=0;i<high.buffered.length;i++) {
    if (high.readyState>=3 && Math.abs(drift)<.1 && high.buffered.start(i)<=high.currentTime && high.buffered.end(i)-high.currentTime>=threshold) {
      high.style.visibility='visible'; el('status').textContent='Playing remote video with local audio'; return;
    }
  }
  fallback();
},100);
