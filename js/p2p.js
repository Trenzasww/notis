// Sincronización directa entre tus dispositivos (WebRTC). Sin nube, sin cuentas.
// Los datos viajan cifrados de un dispositivo al otro; el servidor público de PeerJS solo ayuda a que se encuentren.
import * as DB from './db.js';
import { settings, setSettings } from './theme.js';

const KEY = 'notis.p2p';
const SYNC_KEYS = ['palette', 'custom', 'custom2', 'name', 'bubble', 'radius', 'wallpaper', 'boldAll'];
const CHUNK = 16 * 1024, FLUSH = 8 * 1024 * 1024, ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const state = { status: 'off', msg: '', peers: {}, transfer: null };
const subs = new Set();
export const onState = f => subs.add(f);
const emit = () => subs.forEach(f => f(state));

export const cfg = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
const save = o => localStorage.setItem(KEY, JSON.stringify({ ...cfg(), ...o }));
export const isPaired = () => !!cfg().g;

const enc = s => new TextEncoder().encode(s);
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
const rnd = n => hex(crypto.getRandomValues(new Uint8Array(n)));
const sha = async s => hex(await crypto.subtle.digest('SHA-256', enc(s)));
async function hmac(key, msg) {
  const k = await crypto.subtle.importKey('raw', enc(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', k, enc(msg)));
}
export function deviceName() {
  const u = navigator.userAgent;
  const k = /iPhone/.test(u) ? 'iPhone' : /iPad/.test(u) ? 'iPad' : /Android/.test(u) ? 'Android' : /Windows/.test(u) ? 'PC Windows' : /Mac/.test(u) ? 'Mac' : /Linux/.test(u) ? 'PC Linux' : 'Dispositivo';
  return k;
}
function loadScript(src, test) {
  return new Promise((ok, no) => {
    if (test()) return ok();
    const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error('No se pudo cargar un componente. ¿Tenés internet?'));
    document.head.append(s);
  });
}
const loadPeerJS = () => loadScript('https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js', () => window.Peer);
export const loadQR = () => loadScript('https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js', () => window.qrcode);

function setStatus(msg) {
  const online = Object.values(state.peers).filter(p => p.authed).length;
  if (!isPaired()) state.status = 'off';
  else if (state.transfer) state.status = 'sync';
  else if (online) state.status = 'ok';
  else state.status = 'idle';
  state.msg = msg || (!isPaired() ? '' : online ? `${online} dispositivo${online > 1 ? 's' : ''} conectado${online > 1 ? 's' : ''}` : 'Esperando al otro dispositivo (abrí Notis ahí)');
  emit();
}

// ------------------------------------------------------------------ conexiones
let peer = null, gh = '', retry = 0, lockRef = null, hooked = false;
const links = new Map(); // deviceId -> link

export async function start() {
  const c = cfg(); if (!c.g) { setStatus(); return; }
  try { await loadPeerJS(); } catch (e) { setStatus(e.message); return; }
  gh = (await sha(c.g)).slice(0, 24);
  if (peer && !peer.destroyed) return;
  peer = new window.Peer(`n-${gh}-${c.deviceId}`, { debug: 0 });
  peer.on('open', () => { retry = 0; setStatus(); connectAll(); });
  peer.on('connection', conn => setup(conn));
  peer.on('disconnected', () => { try { peer.reconnect(); } catch {} });
  peer.on('error', e => {
    if (e.type === 'unavailable-id' && retry < 10) { retry++; peer.destroy(); peer = null; setTimeout(start, 4000); }
    else if (e.type !== 'peer-unavailable') setStatus('Sin conexión con el servicio de enlace. Reintentando…');
  });
  if (!hooked) {
    hooked = true;
    document.addEventListener('visibilitychange', () => { if (!document.hidden) connectAll(); });
    addEventListener('online', () => start().then(connectAll));
    setInterval(() => { if (!document.hidden) connectAll(); }, 25000);
    DB.onChange(() => schedule());
  }
}
function connectAll() {
  const c = cfg(); if (!peer || peer.disconnected || !peer.open) return;
  for (const d of c.devices || []) {
    if (d.id === c.deviceId) continue;
    const l = links.get(d.id); if (l && (l.conn.open || l.connecting)) continue;
    const conn = peer.connect(`n-${gh}-${d.id}`, { serialization: 'raw', reliable: true });
    setup(conn, d.id);
  }
}

function setup(conn, expectId) {
  const l = { conn, authed: false, myNonce: rnd(16), theirNonce: null, id: expectId || null, name: '', q: Promise.resolve(), rx: null, connecting: true };
  if (expectId) links.set(expectId, l);
  conn.on('open', () => { l.connecting = false; send(l, { t: 'hi', n: l.myNonce, id: cfg().deviceId, name: cfg().name || deviceName() }); });
  conn.on('data', d => onData(l, d));
  conn.on('close', () => drop(l));
  conn.on('error', () => drop(l));
}
function drop(l) {
  if (l.id && links.get(l.id) === l) links.delete(l.id);
  if (l.id) delete state.peers[l.id];
  l.rx = null; if (state.transfer && state.transfer.link === l) state.transfer = null;
  releaseLock(); setStatus();
}
const send = (l, obj) => l.conn.send(JSON.stringify(obj));
const enqueue = (l, fn) => (l.q = l.q.then(fn).catch(e => console.warn('p2p', e)));

async function onData(l, d) {
  if (typeof d !== 'string') return onChunk(l, d);
  let m; try { m = JSON.parse(d); } catch { return; }
  const c = cfg();
  if (m.t === 'hi') {
    l.theirNonce = m.n; l.id = m.id; l.name = m.name;
    if (!links.has(l.id) || links.get(l.id) !== l) { const old = links.get(l.id); links.set(l.id, l); if (old && old !== l) try { old.conn.close(); } catch {} }
    send(l, { t: 'proof', h: await hmac(c.g, `P|${l.theirNonce}|${l.myNonce}`) });
  } else if (m.t === 'proof') {
    const ok = m.h === await hmac(c.g, `P|${l.myNonce}|${l.theirNonce}`);
    if (!ok) { try { l.conn.close(); } catch {} return; }
    l.authed = true; state.peers[l.id] = { name: l.name, authed: true }; setStatus();
    send(l, { t: 'dev', list: c.devices || [] });
    await sendManifest(l);
    setTimeout(() => requestBlobs(l), 2500);
  } else if (!l.authed) return;
  else if (m.t === 'dev') mergeDevices(m.list);
  else if (m.t === 'man') enqueue(l, async () => { await pushDiff(l, m); if (!m.r) await sendManifest(l, true); });
  else if (m.t === 'rec') await applyRecords(l, m);
  else if (m.t === 'want') for (const id of m.ids) enqueue(l, () => serveFile(l, id));
  else if (m.t === 'set') applySettings(m);
  else if (m.t === 'fs') startFile(l, m);
  else if (m.t === 'fe') await endFile(l, m);
}
function mergeDevices(list) {
  const c = cfg(), map = new Map((c.devices || []).map(d => [d.id, d]));
  let changed = false;
  for (const d of list || []) if (!map.has(d.id)) { map.set(d.id, d); changed = true; }
  if (changed) { save({ devices: [...map.values()] }); connectAll(); }
}

// ------------------------------------------------------------------ sincronización
let timer;
function schedule() { clearTimeout(timer); timer = setTimeout(() => { for (const l of links.values()) if (l.authed) sendManifest(l); }, 1200); }
export function syncNow() { for (const l of links.values()) if (l.authed) sendManifest(l); }

async function sendManifest(l, reply = false) {
  const [chats, items, events] = await Promise.all([DB.all('chats'), DB.all('items'), DB.all('events')]);
  const m = x => x.map(o => [o.id, o.updated || 0]);
  send(l, { t: 'man', r: reply ? 1 : 0, chats: m(chats), items: m(items), events: m(events), set: settings.updated || 0 });
}
async function pushDiff(l, m) {
  for (const [store, theirs] of [['chats', m.chats], ['items', m.items], ['events', m.events]]) {
    const them = new Map(theirs), mine = await DB.all(store);
    const out = mine.filter(o => !them.has(o.id) || (o.updated || 0) > them.get(o.id));
    for (let i = 0; i < out.length; i += 100) send(l, { t: 'rec', store, list: out.slice(i, i + 100) });
  }
  if ((settings.updated || 0) > (m.set || 0)) { const data = {}; for (const k of SYNC_KEYS) data[k] = settings[k]; send(l, { t: 'set', data, u: settings.updated }); }
}
async function requestBlobs(l) {
  if (!l.conn.open || !l.authed) return;
  const have = new Set(await DB.keys('blobs')); l.wanted ||= new Set();
  const ids = (await DB.all('items')).filter(i => !i.deleted).flatMap(i => [i.file, ...(i.atts || [])]).filter(f => f && !have.has(f.id) && !l.wanted.has(f.id)).map(f => f.id);
  if (!ids.length) return;
  ids.forEach(x => l.wanted.add(x)); send(l, { t: 'want', ids });
}
async function serveFile(l, id) {
  const f = (await DB.all('items')).filter(i => !i.deleted).flatMap(i => [i.file, ...(i.atts || [])]).find(x => x && x.id === id);
  if (!f || !(await DB.get('blobs', id)) || !l.conn.open) return;
  await sendFile(l, f);
}
async function applyRecords(l, m) {
  let changed = false;
  for (const r of m.list) {
    const cur = await DB.get(m.store, r.id);
    if (!cur || (r.updated || 0) > (cur.updated || 0)) { await DB.put(m.store, r); changed = true; if (m.store === 'items' && r.deleted) for (const f of [r.file, ...(r.atts || [])]) if (f) await DB.del('blobs', f.id); }
  }
  if (changed) notify();
  clearTimeout(l.wt); l.wt = setTimeout(() => requestBlobs(l), 600);
}
function applySettings(m) { if ((m.u || 0) > (settings.updated || 0)) { setSettings({ ...m.data, updated: m.u }, true); notify(); } }

let nt;
function notify() { clearTimeout(nt); nt = setTimeout(() => dispatchEvent(new CustomEvent('notis:synced')), 350); }

// ------------------------------------------------------------------ archivos (calidad original, en trozos)
async function backpressure(dc) {
  if (dc.bufferedAmount < 4 * 1024 * 1024) return;
  dc.bufferedAmountLowThreshold = 1024 * 1024;
  await new Promise(ok => { const f = () => { dc.removeEventListener('bufferedamountlow', f); ok(); }; dc.addEventListener('bufferedamountlow', f); });
}
async function takeLock() { try { lockRef = await navigator.wakeLock?.request('screen'); } catch {} }
function releaseLock() { if (!state.transfer) { try { lockRef?.release(); } catch {} lockRef = null; } }
let lastEmit = 0;
function progress(l, dir, name, done, total) {
  state.transfer = { dir, name, done, total, link: l };
  const now = Date.now(); if (now - lastEmit > 250 || done >= total) { lastEmit = now; setStatus(); }
}
async function sendFile(l, meta) {
  const row = await DB.get('blobs', meta.id); if (!row) return;
  const blob = row.blob, dc = l.conn.dataChannel;
  await takeLock();
  send(l, { t: 'fs', id: meta.id, name: meta.name, type: blob.type || meta.mime || '', size: blob.size });
  for (let o = 0; o < blob.size; o += CHUNK) {
    if (!l.conn.open) { state.transfer = null; setStatus(); return; }
    await backpressure(dc);
    l.conn.send(await blob.slice(o, o + CHUNK).arrayBuffer());
    progress(l, 'send', meta.name, Math.min(o + CHUNK, blob.size), blob.size);
  }
  send(l, { t: 'fe', id: meta.id });
  state.transfer = null; releaseLock(); setStatus();
}
function startFile(l, m) { l.rx = { ...m, parts: [], batch: [], bytes: 0, flushed: 0 }; takeLock(); progress(l, 'recv', m.name, 0, m.size); }
function onChunk(l, ab) {
  const r = l.rx; if (!r) return;
  r.batch.push(ab); r.bytes += ab.byteLength; r.flushed += ab.byteLength;
  if (r.flushed >= FLUSH) { r.parts.push(new Blob(r.batch)); r.batch = []; r.flushed = 0; }
  progress(l, 'recv', r.name, r.bytes, r.size);
}
async function endFile(l, m) {
  const r = l.rx; if (!r || r.id !== m.id) return;
  l.rx = null; l.wanted?.delete(r.id);
  if (r.bytes !== r.size) { state.transfer = null; setStatus('Un archivo llegó incompleto; se reintenta solo.'); return; }
  const blob = new Blob([...r.parts, ...r.batch], { type: r.type });
  await DB.put('blobs', { id: r.id, blob });
  state.transfer = null; releaseLock(); setStatus(); notify();
  window.dispatchEvent(new CustomEvent('notis:file', { detail: { name: r.name } }));
}

// ------------------------------------------------------------------ vincular (código de un solo uso)
const makeCode = () => [...crypto.getRandomValues(new Uint8Array(8))].map(b => ALPHA[b % 32]).join('');
export const fmtCode = c => c.slice(0, 4) + '-' + c.slice(4);
export const cleanCode = s => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);

// Dispositivo que muestra el código. onRequest(nombre) => Promise<boolean>
export async function hostPairing(onRequest) {
  await loadPeerJS();
  const code = makeCode();
  const pp = new window.Peer(`notis-p-${code}`, { debug: 0 });
  let done = false;
  const out = { code, stop: () => { try { pp.destroy(); } catch {} }, finished: null };
  out.finished = new Promise((ok, no) => {
    pp.on('error', e => { if (!done) no(new Error(e.type === 'unavailable-id' ? 'Reintentá: el código ya estaba en uso' : 'No se pudo conectar con el servicio de enlace')); });
    pp.on('connection', conn => {
      conn.on('data', async d => {
        let m; try { m = JSON.parse(d); } catch { return; }
        if (m.t !== 'join' || done) return;
        const accepted = await onRequest(m.name || 'Dispositivo');
        if (!accepted) { conn.send(JSON.stringify({ t: 'no' })); return; }
        done = true;
        let c = cfg();
        if (!c.g) c = { g: rnd(24), deviceId: rnd(4), name: deviceName(), devices: [] };
        const devs = new Map((c.devices || []).map(x => [x.id, x]));
        devs.set(c.deviceId, { id: c.deviceId, name: c.name || deviceName() }); devs.set(m.id, { id: m.id, name: m.name });
        save({ ...c, devices: [...devs.values()] });
        conn.send(JSON.stringify({ t: 'paired', g: c.g, devices: [...devs.values()] }));
        setTimeout(() => { out.stop(); start().then(ok); }, 900);
      });
    });
  });
  return out;
}

// Dispositivo que ingresa el código
export async function joinPairing(codeRaw, name) {
  await loadPeerJS();
  const code = cleanCode(codeRaw); if (code.length !== 8) throw new Error('El código tiene 8 letras y números');
  const id = rnd(4);
  const pp = new window.Peer(undefined, { debug: 0 });
  return new Promise((ok, no) => {
    const fail = msg => { try { pp.destroy(); } catch {} no(new Error(msg)); };
    const to = setTimeout(() => fail('No se pudo conectar. Revisá el código y que el otro dispositivo siga mostrándolo.'), 30000);
    pp.on('error', e => fail(e.type === 'peer-unavailable' ? 'Código incorrecto o vencido' : 'No se pudo conectar con el servicio de enlace'));
    pp.on('open', () => {
      const conn = pp.connect(`notis-p-${code}`, { serialization: 'raw', reliable: true });
      conn.on('open', () => conn.send(JSON.stringify({ t: 'join', name: name || deviceName(), id })));
      conn.on('data', d => {
        let m; try { m = JSON.parse(d); } catch { return; }
        if (m.t === 'no') return fail('El otro dispositivo rechazó la vinculación');
        if (m.t === 'paired') {
          clearTimeout(to);
          save({ g: m.g, deviceId: id, name: name || deviceName(), devices: m.devices });
          try { pp.destroy(); } catch {}
          start().then(ok);
        }
      });
    });
  });
}

export function unpair() {
  try { peer?.destroy(); } catch {} peer = null; links.clear(); state.peers = {}; state.transfer = null;
  localStorage.removeItem(KEY); setStatus();
}
