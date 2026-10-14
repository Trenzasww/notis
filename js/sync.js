// Sincronización gratuita entre dispositivos usando TU Google Drive (carpeta oculta de la app, "appDataFolder").
// Los archivos se suben tal cual (sin recompresión). Usa los 15 GB gratis de tu cuenta de Google.
import * as DB from './db.js';
import { settings, setSettings } from './theme.js';

const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const API = 'https://www.googleapis.com/drive/v3', UP = 'https://www.googleapis.com/upload/drive/v3';
const CFG = 'notis.sync';
let token = null, tokenExp = 0, running = false, timer;
export const state = { status: 'off', msg: '', last: 0 };
const subs = new Set();
export const onState = f => subs.add(f);
const set = (status, msg = '') => { state.status = status; state.msg = msg; subs.forEach(f => f(state)); };

export const getCfg = () => { try { return JSON.parse(localStorage.getItem(CFG) || '{}'); } catch { return {}; } };
const setCfg = o => localStorage.setItem(CFG, JSON.stringify({ ...getCfg(), ...o }));
export const isConnected = () => !!(getCfg().clientId && getCfg().connected);

function loadGIS() {
  return new Promise((ok, no) => {
    if (window.google?.accounts?.oauth2) return ok();
    const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.onload = ok; s.onerror = () => no(new Error('No se pudo cargar Google'));
    document.head.append(s);
  });
}
export async function connect(clientId, interactive = true) {
  await loadGIS();
  return new Promise((ok, no) => {
    const c = google.accounts.oauth2.initTokenClient({
      client_id: clientId, scope: SCOPE,
      callback: r => { if (r.error) return no(new Error(r.error_description || r.error)); token = r.access_token; tokenExp = Date.now() + (r.expires_in - 90) * 1000; setCfg({ clientId, connected: true }); ok(token); },
      error_callback: e => no(new Error(e.type || 'cancelado'))
    });
    c.requestAccessToken({ prompt: interactive ? 'consent' : '' });
  });
}
export function disconnect() { token = null; localStorage.removeItem(CFG); set('off'); }
async function auth() {
  if (token && Date.now() < tokenExp) return token;
  const cfg = getCfg(); if (!cfg.clientId) throw new Error('Falta el Client ID');
  return connect(cfg.clientId, false);
}
async function api(path, opt = {}, base = API) {
  const t = await auth();
  const r = await fetch(base + path, { ...opt, headers: { Authorization: 'Bearer ' + t, ...(opt.headers || {}) } });
  if (!r.ok) throw new Error('Drive ' + r.status + ': ' + (await r.text()).slice(0, 120));
  return r;
}
async function listFiles() {
  const out = []; let page = '';
  do {
    const r = await (await api(`/files?spaces=appDataFolder&pageSize=1000&fields=nextPageToken,files(id,name,size)${page ? '&pageToken=' + page : ''}`)).json();
    out.push(...r.files); page = r.nextPageToken;
  } while (page);
  return new Map(out.map(f => [f.name, f]));
}
async function upload(name, blob, existingId) {
  const meta = existingId ? { name } : { name, parents: ['appDataFolder'] };
  const init = await api(`/files${existingId ? '/' + existingId : ''}?uploadType=resumable`, {
    method: existingId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': blob.type || 'application/octet-stream' }, body: JSON.stringify(meta)
  }, UP);
  const loc = init.headers.get('Location');
  const r = await fetch(loc, { method: 'PUT', headers: { 'Content-Type': blob.type || 'application/octet-stream' }, body: blob });
  if (!r.ok) throw new Error('Subida falló ' + r.status);
}
const jsonBlob = o => new Blob([JSON.stringify(o)], { type: 'application/json' });

function merge(local, remote) {
  const m = new Map(local.map(x => [x.id, x]));
  let changed = false;
  for (const r of remote) { const l = m.get(r.id); if (!l || (r.updated || 0) > (l.updated || 0)) { m.set(r.id, r); changed = true; } }
  return { list: [...m.values()], changed };
}

export async function syncNow({ quiet } = {}) {
  if (running || !isConnected()) return;
  running = true; set('sync', 'Sincronizando…');
  try {
    const files = await listFiles();
    let remote = { chats: [], items: [], events: [], settings: null };
    const dj = files.get('notis-data.json');
    if (dj) remote = await (await api(`/files/${dj.id}?alt=media`)).json();
    const [chats, items, events] = await Promise.all([DB.all('chats'), DB.all('items'), DB.all('events')]);
    for (const [store, loc, rem] of [['chats', chats, remote.chats], ['items', items, remote.items], ['events', events, remote.events]]) {
      const { list, changed } = merge(loc, rem || []);
      if (changed) for (const o of list) await DB.put(store, o);
      if (store === 'chats') remote._c = list; if (store === 'items') remote._i = list; if (store === 'events') remote._e = list;
    }
    if (remote.settings && (remote.settings.updated || 0) > (settings.updated || 0)) setSettings(remote.settings, true);
    const data = { v: 1, chats: remote._c, items: remote._i, events: remote._e, settings: { ...settings } };
    await upload('notis-data.json', jsonBlob(data), dj?.id);

    // archivos: subir los que faltan, borrar los de elementos eliminados
    const have = new Set(await DB.keys('blobs'));
    let up = 0;
    for (const it of data.items) {
      for (const fl of [it.file, ...(it.atts || [])]) {
        if (!fl) continue;
        const name = 'b_' + fl.id;
        if (it.deleted) { const f = files.get(name); if (f) { await api('/files/' + f.id, { method: 'DELETE' }).catch(() => {}); } await DB.del('blobs', fl.id); continue; }
        if (have.has(fl.id) && !files.has(name)) { const b = (await DB.get('blobs', fl.id)).blob; set('sync', `Subiendo ${fl.name}…`); await upload(name, b); up++; }
      }
    }
    setCfg({ last: Date.now() }); state.last = Date.now();
    set('ok', up ? `Sincronizado · ${up} archivo(s) subido(s)` : 'Sincronizado');
    window.dispatchEvent(new CustomEvent('notis:synced'));
  } catch (e) { set('err', e.message); if (!quiet) console.warn(e); }
  finally { running = false; }
}

// descarga bajo demanda de un archivo que está en Drive pero no en este dispositivo
export async function fetchBlob(fileId, type) {
  const files = await listFiles(), f = files.get('b_' + fileId);
  if (!f) throw new Error('El archivo todavía no se subió desde el otro dispositivo');
  const r = await api(`/files/${f.id}?alt=media`);
  const blob = new Blob([await r.arrayBuffer()], { type: type || 'application/octet-stream' });
  await DB.put('blobs', { id: fileId, blob });
  return blob;
}

let started = false, later = () => {};
export function start() {
  if (!isConnected()) { set('off'); return; }
  set('idle', 'Conectado');
  if (!started) {
    started = true;
    later = () => { clearTimeout(timer); timer = setTimeout(() => syncNow({ quiet: true }), 4000); };
    DB.onChange(() => later());
    window.addEventListener('online', () => later());
    document.addEventListener('visibilitychange', () => { if (!document.hidden) later(); });
  }
  later();
}
