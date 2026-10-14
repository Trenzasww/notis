import * as DB from './db.js';
import { settings, setSettings, PALETTES, DEFAULTS } from './theme.js';
import { $, h, ic, toast, overlay, sheet, ask, confirmBox, richText, dayLabel, shortWhen, fmtTime, fmtSize, fmtDur, ymd, kindOf, FILE_ICON, saveFile, debounce } from './util.js';
import { emojiPicker } from './emoji.js';
import { editedURL, openImageEditor, openVideoEditor, videoStyle, bindTrim, hasEdits, exportImage } from './media.js';
import { buildPreview, linkCard, urlsIn } from './links.js';
import * as Sync from './sync.js';

const COLORS = ['#FFD60A', '#FF453A', '#FF9F0A', '#30D158', '#64D2FF', '#0A84FF', '#BF5AF2', '#FF375F', '#8E8E93'];
const S = { view: 'home', lastChat: null, chatId: null, chats: [], events: [], items: new Map(), pending: [], drafts: {}, hl: null, sideQ: '', q: '', qChat: '', calMonth: new Date(), calSel: ymd(new Date()), palQ: '' };
const isTouch = matchMedia('(pointer:coarse)').matches;

const root = $('#app');
const side = h('aside', { id: 'side' }), main = h('main', { id: 'main' }), tabbar = h('nav', { id: 'tabbar' });
root.append(side, main, tabbar);

// ---------------------------------------------------------------- datos
const live = a => a.filter(x => !x.deleted);
const chatItems = id => live(S.items.get(id) || []).sort((a, b) => a.created - b.created);
const chatById = id => S.chats.find(c => c.id === id && !c.deleted);
const sortedChats = () => live(S.chats).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || lastTime(b) - lastTime(a));
const lastTime = c => { const it = chatItems(c.id); return it.length ? it[it.length - 1].created : c.created; };

async function loadAll() {
  S.chats = await DB.all('chats'); S.events = await DB.all('events');
  S.items = new Map();
  for (const it of await DB.all('items')) { if (!S.items.has(it.chatId)) S.items.set(it.chatId, []); S.items.get(it.chatId).push(it); }
}
async function seed() {
  if (S.chats.length) return;
  const base = [['📝', 'Mis notas', '#FFD60A'], ['📚', 'Parciales', '#0A84FF'], ['🖼️', 'Fotos y videos', '#FF375F'], ['🔗', 'Links', '#30D158']];
  for (let i = 0; i < base.length; i++) {
    const c = { id: DB.uid(), name: base[i][1], emoji: base[i][0], color: base[i][2], created: Date.now() + i, pinned: false };
    await DB.save('chats', c); S.chats.push(c);
  }
  const first = S.chats[0];
  await addItem(first.id, { type: 'text', text: '# ¡Bienvenido a Notis! 👋\nEste es tu espacio privado. Escribí notas, subí fotos, videos, PDF y links.\n\n- [x] Crear mi primer chat\n- [ ] Elegir mi paleta en **Ajustes**\n- [ ] Subir una foto 📸\n\nUsá #etiquetas para encontrar todo rápido.' });
}
async function addItem(chatId, data) {
  const it = { id: DB.uid(), chatId, type: 'text', text: '', created: Date.now(), pinned: false, ...data };
  await DB.save('items', it);
  if (!S.items.has(chatId)) S.items.set(chatId, []);
  S.items.get(chatId).push(it);
  return it;
}
const saveItem = async it => { await DB.save('items', it); };

// ---------------------------------------------------------------- navegación
function nav(view, chatId = null, { push = true, hl = null } = {}) {
  S.view = view; S.chatId = view === 'chats' ? chatId : null; S.hl = hl;
  if (push) history.pushState({ view, chatId }, '');
  renderAll();
}
addEventListener('popstate', e => { const s = e.state || { view: 'home', chatId: null }; nav(s.view, s.chatId, { push: false }); });

function renderAll() {
  document.body.dataset.view = S.view; document.body.dataset.chat = S.chatId ? '1' : '0';
  renderSide(); renderMain(); renderTabbar();
}

// ---------------------------------------------------------------- barra lateral / pestañas
function navBtn(v, icon, label) {
  return h('button', { class: 'nav-b' + (S.view === v ? ' on' : ''), onclick: () => nav(v, v === 'chats' ? S.chatId : null) }, ic(icon, 20), h('span', null, label));
}
function syncBadge() {
  const st = Sync.state.status, cls = { ok: 'ok', sync: 'spin', err: 'bad', idle: 'ok', off: 'off' }[st] || 'off';
  const title = { ok: 'Sincronizado', sync: 'Sincronizando…', err: 'Error de sincronización', idle: 'Conectado', off: 'Sin sincronizar (tocá para configurar)' }[st];
  return h('button', { class: 'icon-btn sync ' + cls, title, onclick: () => nav('settings') }, ic('cloud', 20));
}
function chatRow(c) {
  const items = chatItems(c.id), last = items[items.length - 1];
  const prev = last ? (last.file ? `${FILE_ICON[kindOf(last.file.mime, last.file.name)]} ${last.text || last.file.name}` : last.text.replace(/[#*`>]/g, '').split('\n').find(l => l.trim()) || '') : 'Sin mensajes';
  return h('button', { class: 'crow' + (S.chatId === c.id ? ' on' : ''), onclick: () => nav('chats', c.id) },
    h('span', { class: 'avatar', style: { background: `color-mix(in srgb, ${c.color} 22%, var(--surface2))` } }, c.emoji),
    h('span', { class: 'cinfo' }, h('span', { class: 'cname' }, c.name, c.pinned && h('i', { class: 'pinned-i' }, ic('pin', 12))), h('span', { class: 'cprev' }, prev)),
    h('span', { class: 'ctime' }, last ? shortWhen(last.created) : ''));
}
function syncCard() {
  const on = Sync.isConnected();
  return h('div', { class: 'syncard' },
    h('b', null, ic('cloud', 18), on ? 'Drive conectado' : 'Sincronizá tus dispositivos'),
    h('p', null, on ? (Sync.state.msg || 'Tus notas y archivos están al día.') : 'Usá tu Google Drive gratis para ver todo en tu PC y en tu iPhone.'),
    h('button', { class: 'btn', onclick: () => nav('settings') }, on ? 'Ver ajustes' : 'Configurar'));
}
function renderSide() {
  const q = S.sideQ.trim().toLowerCase();
  const list = sortedChats().filter(c => !q || c.name.toLowerCase().includes(q));
  const search = h('input', { type: 'search', placeholder: 'Buscar o filtrar chats', id: 'sideq', value: S.sideQ, enterKeyHint: 'search',
    oninput: e => { S.sideQ = e.target.value; const p = e.target.selectionStart; renderSide(); const i = $('#sideq'); i.focus(); i.setSelectionRange(p, p); },
    onkeydown: e => { if (e.key === 'Enter' && e.target.value.trim()) { S.q = e.target.value.trim(); S.qChat = ''; S.sideQ = ''; nav('search'); } } });
  side.replaceChildren(
    h('div', { class: 'side-head' },
      h('div', { class: 'brand' }, h('span', { class: 'logo' }, '📝'), h('div', { class: 'btxt' }, h('b', null, 'Notis'), h('small', null, settings.name || 'Espacio personal'))),
      h('div', { class: 'row gap6 m-only' }, syncBadge())),
    h('div', { class: 'm-title m-only' }, 'Chats'),
    h('label', { class: 'search-box' }, ic('search', 18), search, h('kbd', { class: 'd-only' }, '⌘K')),
    h('div', { class: 'd-only' }, h('div', { class: 'sec-l' }, 'Menú principal'),
      h('div', { class: 'navlist' }, navBtn('home', 'home', 'Inicio'), navBtn('chats', 'chat', 'Chats'), navBtn('calendar', 'cal', 'Calendario'), navBtn('search', 'search', 'Buscar'), navBtn('settings', 'cfg', 'Ajustes'))),
    h('div', { class: 'sec-l' }, h('span', null, 'Mis chats'), h('button', { class: 'icon-btn xs', title: 'Nuevo chat', onclick: () => chatDialog() }, ic('plus', 17))),
    h('div', { class: 'list' }, list.length ? list.map(chatRow) : h('p', { class: 'mute pad' }, 'No hay chats. Tocá + para crear uno.')),
    h('div', { class: 'side-foot d-only' }, syncCard()));
}
function renderTabbar() {
  const t = (v, i, l) => h('button', { class: 'tab' + (S.view === v ? ' on' : ''), onclick: () => nav(v, null) }, ic(i, 22), h('span', null, l));
  tabbar.replaceChildren(t('home', 'home', 'Inicio'), t('chats', 'chat', 'Chats'), t('calendar', 'cal', 'Calendario'), t('search', 'search', 'Buscar'), t('settings', 'cfg', 'Ajustes'));
}
const fab = h('button', { class: 'fab', title: 'Crear', 'aria-label': 'Crear', onclick: () => createMenu() }, ic('plus', 28));
root.append(fab);
function createMenu() {
  sheet('Crear', [
    { label: 'Nota rápida', icon: 'note', run: () => quickAdd('note') }, { label: 'Checklist', icon: 'list', run: () => quickAdd('check') },
    { label: 'Foto, video o archivo', icon: 'image', run: () => quickAdd('file') }, { label: 'Evento en el calendario', icon: 'cal', run: () => eventDialog(null, S.calSel) },
    { label: 'Nuevo chat', icon: 'chat', run: () => chatDialog() }]);
}
addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); S.q = ''; S.qChat = ''; nav('search'); } });
Sync.onState(() => { const b = $('.sync'); if (b) b.replaceWith(syncBadge()); const s = $('#syncstat'); if (s) renderSyncStat(s); const f = $('.side-foot'); if (f) f.replaceChildren(syncCard()); });
addEventListener('notis:synced', async () => { await loadAll(); renderSide(); if ((S.view === 'chats' && S.chatId) || S.view === 'calendar' || S.view === 'home') renderMain(); });

// ---------------------------------------------------------------- diálogo de chat
function chatDialog(chat) {
  const c = chat || { name: '', emoji: '💬', color: COLORS[5] };
  let emoji = c.emoji, color = c.color;
  const name = h('input', { type: 'text', class: 'field', value: c.name, placeholder: 'Nombre del chat' });
  const eb = h('button', { class: 'avatar big', onclick: () => { pop.hidden = !pop.hidden; } }, emoji);
  const pop = h('div', { hidden: true }, emojiPicker(e => { emoji = e; eb.textContent = e; pop.hidden = true; }));
  const sw = h('div', { class: 'swatches' });
  const drawSw = () => sw.replaceChildren(...COLORS.map(k => h('button', { class: 'sw' + (k === color ? ' on' : ''), style: { background: k }, onclick: () => { color = k; drawSw(); } })));
  drawSw();
  const ov = overlay(h('div', { class: 'dlg glass' }, h('h3', null, chat ? 'Editar chat' : 'Nuevo chat'),
    h('div', { class: 'row gap' }, eb, name), pop, sw,
    h('div', { class: 'row end' }, h('button', { class: 'btn ghost', onclick: () => ov.close() }, 'Cancelar'),
      h('button', { class: 'btn', onclick: async () => {
        const n = name.value.trim() || 'Sin nombre';
        const o = chat || { id: DB.uid(), created: Date.now(), pinned: false };
        Object.assign(o, { name: n, emoji, color }); await DB.save('chats', o);
        if (!chat) S.chats.push(o);
        ov.close(); if (!chat) nav('chats', o.id); else renderAll();
      } }, 'Guardar'))));
  setTimeout(() => name.focus(), 100);
}

// ---------------------------------------------------------------- vista principal
function renderMain() {
  main.replaceChildren(); main.ondragover = main.ondragleave = main.ondrop = null; main.classList.remove('drop');
  ({ home: homeView, chats: chatView, calendar: calView, search: searchView, settings: settingsView }[S.view])();
}

// ---------------------------------------------------------------- INICIO
function homeView() {
  const now = new Date(), hr = now.getHours(), g = hr < 6 ? 'Buenas noches' : hr < 13 ? 'Buen día' : hr < 20 ? 'Buenas tardes' : 'Buenas noches';
  const items = live([...S.items.values()].flat()).filter(i => chatById(i.chatId));
  const notes = items.filter(i => !i.file).length, files = items.filter(i => i.file).length;
  const today = ymd(now), evs = live(S.events).filter(e => e.date >= today).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
  const recents = [...items].sort((a, b) => b.created - a.created).slice(0, 10);
  const pinned = sortedChats().filter(c => c.pinned);
  const dateStr = now.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
  const stat = (n, l) => h('div', { class: 'stat' }, h('b', null, n), h('small', null, l));
  const rcard = it => {
    const c = chatById(it.chatId), k = it.file ? kindOf(it.file.mime, it.file.name) : null;
    const head = h('div', { class: 'rh' }, h('span', { class: 'em', style: { background: `color-mix(in srgb, ${c.color} 25%, var(--surface2))` } }, c.emoji), h('span', null, shortWhen(it.created)));
    if (k === 'image') {
      const img = h('img', { alt: '' }); imageURL(it, 500).then(u => u && (img.src = u));
      return h('button', { class: 'rcard img', onclick: () => nav('chats', it.chatId, { hl: it.id }) }, img, head);
    }
    const txt = it.text ? it.text.replace(/[#*`>]|- \[[ x]\]/g, '').trim() : it.file ? `${FILE_ICON[k]} ${it.file.name}` : '';
    return h('button', { class: 'rcard', onclick: () => nav('chats', it.chatId, { hl: it.id }) }, head, h('p', null, txt));
  };
  const evRow = e => h('button', { class: 'ev', onclick: () => { S.calSel = e.date; S.calMonth = new Date(e.date + 'T12:00'); nav('calendar'); } }, h('i', { class: 'evbar', style: { background: e.color } }),
    h('span', { class: 'evinfo' }, h('b', null, e.title), h('small', { class: 'mute' }, [new Date(e.date + 'T12:00').toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' }), e.time || 'Todo el día'].join(' · '))));
  main.append(h('div', { class: 'page home' },
    h('div', { class: 'hello' }, h('div', null, h('small', { class: 'mute caps' }, dateStr), h('h1', null, g, settings.name ? ', ' : '', settings.name ? h('span', { class: 'acc' }, settings.name) : null))),
    h('button', { class: 'search-big', onclick: () => { S.q = ''; S.qChat = ''; nav('search'); } }, ic('search', 19), 'Buscar notas, archivos, links…'),
    h('div', { class: 'quick' }, [['note', 'Nota', () => quickAdd('note')], ['list', 'Checklist', () => quickAdd('check')], ['image', 'Archivo', () => quickAdd('file')], ['cal', 'Evento', () => eventDialog(null, today)]]
      .map(([i, l, f]) => h('button', { class: 'qtile', onclick: f }, h('span', { class: 'qic' }, ic(i, 22)), h('span', null, l)))),
    h('div', { class: 'stats' }, stat(notes, 'Notas'), stat(files, 'Archivos'), stat(evs.length, 'Eventos próximos')),
    recents.length ? [h('div', { class: 'sec' }, h('span', null, 'Recientes'), h('button', { onclick: () => nav('chats', null) }, 'Ver chats')), h('div', { class: 'rscroll' }, recents.map(rcard))] : null,
    evs.length ? [h('div', { class: 'sec' }, h('span', null, 'Próximos eventos'), h('button', { onclick: () => nav('calendar') }, 'Calendario')), h('div', { class: 'card glass evlist' }, evs.slice(0, 4).map(evRow))] : null,
    pinned.length ? [h('div', { class: 'sec' }, h('span', null, 'Chats fijados')), h('div', { class: 'card glass evlist' }, pinned.map(chatRow))] : null));
}
function quickAdd(kind = 'note') {
  let chat = (S.lastChat && chatById(S.lastChat)) || sortedChats()[0]; if (!chat) return chatDialog();
  const files = [];
  const chips = h('div', { class: 'chips' });
  const drawChips = () => chips.replaceChildren(...sortedChats().map(c => h('button', { class: 'chip' + (c.id === chat.id ? ' on' : ''), onclick: () => { chat = c; drawChips(); } }, `${c.emoji} ${c.name}`)));
  drawChips();
  const ta = h('textarea', { class: 'field big-ta', rows: 6, placeholder: kind === 'check' ? 'Tus tareas…' : 'Escribí tu nota… (podés usar #etiquetas)' }); ta.value = kind === 'check' ? '- [ ] ' : '';
  const list = h('div', { class: 'pending', hidden: true });
  const drawFiles = () => { list.hidden = !files.length; list.replaceChildren(...files.map((p, i) => h('div', { class: 'pchip' }, p.kind === 'image' ? h('img', { src: p.url, alt: '' }) : h('span', { class: 'ficon' }, FILE_ICON[p.kind]), h('small', null, p.file.name), h('button', { class: 'icon-btn', onclick: () => { files.splice(i, 1); drawFiles(); } }, ic('x', 14))))); };
  const add = fs => { for (const f of fs) { const k = kindOf(f.type, f.name); files.push({ file: f, kind: k, url: k === 'image' || k === 'video' ? URL.createObjectURL(f) : '' }); } drawFiles(); };
  const mk = accept => { const i = h('input', { type: 'file', multiple: true, accept, hidden: true, onchange: () => { add([...i.files]); i.value = ''; } }); return i; };
  const inM = mk('image/*,video/*'), inA = mk('*/*');
  const ov = overlay(h('div', { class: 'dlg glass wide' }, h('h3', null, kind === 'check' ? 'Nuevo checklist' : kind === 'file' ? 'Subir archivos' : 'Nota rápida'),
    h('div', { class: 'lbl' }, 'Guardar en'), chips, ta, list,
    h('div', { class: 'row between wrap gap' },
      h('div', { class: 'row gap6' }, h('button', { class: 'btn ghost', onclick: () => inM.click() }, ic('image', 18), 'Fotos'), h('button', { class: 'btn ghost', onclick: () => inA.click() }, ic('clip', 18), 'Archivos'), inM, inA),
      h('div', { class: 'row gap6' }, h('button', { class: 'btn ghost', onclick: () => ov.close() }, 'Cancelar'),
        h('button', { class: 'btn', onclick: async () => {
          const text = ta.value.trim().replace(/^- \[ \]\s*$/, ''); if (!text && !files.length) return toast('Escribí algo o elegí un archivo');
          try { await persistEntry(chat, text, files.splice(0)); S.lastChat = chat.id; ov.close(); toast(`Guardado en ${chat.emoji} ${chat.name}`); renderAll(); }
          catch (e) { toast('No se pudo guardar: ' + (e.message || e), 4500); }
        } }, 'Guardar')))));
  setTimeout(() => { if (kind !== 'file') ta.focus(); }, 120);
}
async function persistEntry(chat, text, files, onItem) {
  for (let i = 0; i < files.length; i++) {
    const { file, kind, url } = files[i]; if (url) URL.revokeObjectURL(url);
    const meta = await mediaMeta(file, kind);
    await DB.put('blobs', { id: meta.id, blob: file });
    const it = await addItem(chat.id, { type: 'file', file: meta, text: i === 0 ? text : '' });
    onItem?.(it); if (i === 0 && text) attachLinkPreview(it);
  }
  if (!files.length) { const it = await addItem(chat.id, { type: 'text', text }); onItem?.(it); attachLinkPreview(it); }
}

// ---------------------------------------------------------------- CHAT
const urlCache = new Map();
async function getBlob(it) {
  const b = await DB.get('blobs', it.file.id);
  if (b) return b.blob;
  if (Sync.isConnected()) { toast('Descargando desde tu Drive…', 4000); try { return await Sync.fetchBlob(it.file.id, it.file.mime); } catch (e) { toast(e.message, 4000); } }
  return null;
}
async function rawURL(it) {
  if (urlCache.has(it.file.id)) return urlCache.get(it.file.id);
  const b = await getBlob(it); if (!b) return null;
  const u = URL.createObjectURL(b); urlCache.set(it.file.id, u); return u;
}
const prevCache = new Map();
async function imageURL(it, max = 1400) {
  if (!hasEdits(it.edits)) return rawURL(it);
  const key = `${it.file.id}|${max}|${JSON.stringify(it.edits)}`;
  if (prevCache.has(key)) return prevCache.get(key);
  const b = await getBlob(it); if (!b) return null;
  const u = await editedURL(b, it.edits, max); prevCache.set(key, u); return u;
}

function fileCard(it, note) {
  const k = kindOf(it.file.mime, it.file.name);
  return h('button', { class: 'fcard', onclick: () => openViewer(it) },
    h('span', { class: 'ficon' }, FILE_ICON[k] || '📎'),
    h('span', { class: 'finfo' }, h('b', null, it.file.name), h('small', null, [fmtSize(it.file.size), note || k.toUpperCase()].join(' · '))));
}
function fileBody(it) {
  const k = kindOf(it.file.mime, it.file.name);
  if (k === 'image') {
    const img = h('img', { class: 'mimg', alt: it.file.name, loading: 'lazy', decoding: 'async' });
    const btn = h('button', { class: 'media', onclick: () => openViewer(it) }, h('div', { class: 'skeleton' }), img);
    imageURL(it).then(u => {
      if (!u) { btn.replaceWith(fileCard(it, 'Descargá desde otro dispositivo')); return; }
      img.onload = () => btn.querySelector('.skeleton')?.remove();
      img.onerror = () => btn.replaceWith(fileCard(it, 'Vista previa no disponible'));
      img.src = u;
    }).catch(() => btn.replaceWith(fileCard(it, 'Vista previa no disponible')));
    return btn;
  }
  if (k === 'video') {
    const v = h('video', { playsInline: true, controls: true, preload: 'metadata', class: 'mvid' }), frame = h('div', { class: 'vframe feed' }, v);
    videoStyle(v, frame, it.edits, it.file); bindTrim(v, it.edits);
    rawURL(it).then(u => { if (u) v.src = u + '#t=0.1'; else frame.replaceWith(fileCard(it, 'Descargá desde otro dispositivo')); });
    const tools = h('button', { class: 'vedit icon-btn', title: 'Editar video', onclick: () => openViewer(it) }, ic('wand', 18));
    return h('div', { class: 'vwrap' }, frame, tools, h('small', { class: 'vmeta' }, `${it.file.w && it.file.h ? it.file.w + '×' + it.file.h + ' · ' : ''}${it.file.dur ? fmtDur(it.file.dur) + ' · ' : ''}${fmtSize(it.file.size)}`));
  }
  if (k === 'audio') {
    const a = h('audio', { controls: true, preload: 'none' }); rawURL(it).then(u => u && (a.src = u));
    return h('div', { class: 'aud' }, h('b', null, '🎵 ' + it.file.name), a);
  }
  return fileCard(it);
}

function toggleTask(it, line, done) {
  const lines = it.text.split('\n');
  lines[line] = lines[line].replace(/\[( |x|X)\]/, done ? '[x]' : '[ ]');
  it.text = lines.join('\n'); saveItem(it); refreshNode(it);
}
function textBody(it) { return richText(it.text, { onTag: t => { S.q = t; nav('search'); }, onToggle: (i, d) => toggleTask(it, i, d) }); }

function itemNode(it) {
  const bubble = h('div', { class: 'bubble' + (it.pinned ? ' pinned' : '') });
  if (it.file) bubble.append(fileBody(it));
  if (it.text) bubble.append(textBody(it));
  if (it.link) bubble.append(linkCard(it.link));
  const row = h('div', { class: 'msg', 'data-id': it.id },
    h('div', { class: 'mwrap' }, bubble,
      h('div', { class: 'mmeta' }, it.pinned && ic('pin', 12), h('span', null, fmtTime(it.created)), it.edited && h('span', null, '· editado'))),
    h('button', { class: 'icon-btn mmenu', 'aria-label': 'Opciones', onclick: e => { e.stopPropagation(); itemMenu(it); } }, ic('more', 20)));
  let pressT;
  row.addEventListener('contextmenu', e => { if (e.target.closest('video,audio,a,input,iframe')) return; e.preventDefault(); itemMenu(it); });
  row.addEventListener('touchstart', e => { if (e.target.closest('video,audio,a,input,iframe,.mmenu')) return; pressT = setTimeout(() => { navigator.vibrate?.(15); itemMenu(it); }, 520); }, { passive: true });
  ['touchend', 'touchmove', 'touchcancel'].forEach(ev => row.addEventListener(ev, () => clearTimeout(pressT), { passive: true }));
  return row;
}
function refreshNode(it) { const n = $(`.msg[data-id="${it.id}"]`); if (n) n.replaceWith(itemNode(it)); }

async function attachLinkPreview(it) {
  if (it.link || it.file) return;
  const u = urlsIn(it.text)[0]; if (!u) return;
  it.link = await buildPreview(u); await saveItem(it); refreshNode(it);
}

function itemMenu(it) {
  const k = it.file ? kindOf(it.file.mime, it.file.name) : null;
  sheet(null, [
    (it.text || !it.file) && { label: it.file ? 'Editar descripción' : 'Editar texto', icon: 'edit', run: () => editText(it) },
    (k === 'image' || k === 'video') && { label: k === 'image' ? 'Editar foto' : 'Editar video', icon: 'wand', run: () => editMedia(it) },
    it.text && { label: 'Copiar texto', icon: 'copy', run: () => { navigator.clipboard?.writeText(it.text); toast('Texto copiado'); } },
    it.file && { label: 'Guardar / compartir archivo', icon: 'share', run: async () => { const b = await getBlob(it); if (b) saveFile(b, it.file.name); } },
    { label: it.pinned ? 'Quitar de fijados' : 'Fijar', icon: 'pin', run: async () => { it.pinned = !it.pinned; await saveItem(it); refreshNode(it); } },
    { label: 'Mover a otro chat', icon: 'chat', run: () => moveItem(it) },
    { label: 'Eliminar', icon: 'trash', danger: true, run: async () => { if (await confirmBox('¿Eliminar?', 'Se borra de este dispositivo y de tu Drive (si lo sincronizaste).')) { await DB.remove('items', it); $(`.msg[data-id="${it.id}"]`)?.remove(); renderSide(); } } }
  ]);
}
function moveItem(it) {
  sheet('Mover a…', sortedChats().filter(c => c.id !== it.chatId).map(c => ({ label: `${c.emoji}  ${c.name}`, run: async () => {
    const from = S.items.get(it.chatId); from.splice(from.indexOf(it), 1);
    it.chatId = c.id; await saveItem(it); if (!S.items.has(c.id)) S.items.set(c.id, []); S.items.get(c.id).push(it);
    $(`.msg[data-id="${it.id}"]`)?.remove(); renderSide(); toast('Movido a ' + c.name);
  } })));
}
async function editText(it) {
  const ta = h('textarea', { class: 'field big-ta', rows: 8 }); ta.value = it.text || '';
  const ov = overlay(h('div', { class: 'dlg glass wide' }, h('h3', null, 'Editar'), ta,
    h('div', { class: 'row end' }, h('button', { class: 'btn ghost', onclick: () => ov.close() }, 'Cancelar'),
      h('button', { class: 'btn', onclick: async () => { it.text = ta.value.trim(); it.edited = true; if (!it.text && !it.file) return toast('El texto no puede quedar vacío'); delete it.link; await saveItem(it); ov.close(); refreshNode(it); attachLinkPreview(it); } }, 'Guardar'))));
  setTimeout(() => ta.focus(), 100);
}
async function editMedia(it) {
  const blob = await getBlob(it); if (!blob) return;
  const k = kindOf(it.file.mime, it.file.name);
  const onSave = async e => { it.edits = e || undefined; if (!e) delete it.edits; await saveItem(it); refreshNode(it); };
  if (k === 'image') openImageEditor({ blob, name: it.file.name, edits: it.edits, onSave }).catch(e => toast(e.message || 'No se pudo abrir el editor'));
  else openVideoEditor({ blob, name: it.file.name, meta: it.file, edits: it.edits, onSave });
}

// visor
async function openViewer(it) {
  const k = kindOf(it.file.mime, it.file.name), stage = h('div', { class: 'vstage' }, h('div', { class: 'skeleton big' }));
  const actions = [];
  const blobP = getBlob(it);
  const bar = h('div', { class: 'ed-top' },
    h('button', { class: 'btn ghost', onclick: () => ov.close() }, ic('x', 18), 'Cerrar'),
    h('b', { class: 'vtitle' }, it.file.name),
    h('div', { class: 'row gap6' },
      (k === 'image' || k === 'video') && h('button', { class: 'btn', onclick: () => { ov.close(); editMedia(it); } }, ic('wand', 18), 'Editar'),
      h('button', { class: 'btn ghost', onclick: async () => { const b = await blobP; if (!b) return; if (k === 'image' && hasEdits(it.edits)) { try { await exportImage(b, it.edits, it.file.name, 'png'); } catch (e) { toast(e.message); } } else saveFile(b, it.file.name); } }, ic('share', 18), k === 'image' && hasEdits(it.edits) ? 'Exportar' : 'Guardar')));
  const ov = overlay(h('div', { class: 'viewer' }, bar, stage), { cls: 'full' });
  const blob = await blobP; if (!blob) { stage.replaceChildren(h('p', { class: 'mute pad' }, 'Este archivo todavía no está en este dispositivo. Conectá la sincronización y esperá a que termine en el otro.')); return; }
  const url = URL.createObjectURL(blob); ov.addEventListener('transitionend', () => {});
  const oc = ov.close; ov.close = () => { URL.revokeObjectURL(url); oc(); };
  if (k === 'image') {
    const u = hasEdits(it.edits) ? await imageURL(it, 2600) : url;
    stage.replaceChildren(h('img', { src: u, class: 'vimg', onerror: e => e.target.replaceWith(h('p', { class: 'mute pad' }, 'Tu navegador no puede mostrar este formato (por ejemplo HEIC). Podés guardarlo con el botón de arriba.')) }),
      h('small', { class: 'mute vinfo' }, `${it.file.name} · ${fmtSize(it.file.size)} · original sin modificar`));
  } else if (k === 'video') {
    const v = h('video', { src: url, controls: true, playsInline: true, autoplay: false, class: 'mvid' }), fr = h('div', { class: 'vframe big' }, v);
    videoStyle(v, fr, it.edits, it.file); bindTrim(v, it.edits); stage.replaceChildren(fr);
  } else if (k === 'audio') stage.replaceChildren(h('audio', { src: url, controls: true, autoplay: true }));
  else if (k === 'pdf') stage.replaceChildren(h('iframe', { src: url, class: 'vpdf' }), h('a', { class: 'btn ghost', href: url, target: '_blank', rel: 'noopener' }, 'Abrir en pestaña nueva'));
  else if (k === 'text') { const t = await blob.text(); stage.replaceChildren(h('pre', { class: 'vtext' }, t.slice(0, 200000))); }
  else if (k === 'docx') {
    stage.replaceChildren(h('p', { class: 'mute pad' }, 'Cargando documento…'));
    try {
      if (!window.mammoth) await new Promise((ok, no) => { const s = h('script', { src: 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js', onload: ok, onerror: no }); document.head.append(s); });
      const r = await window.mammoth.convertToHtml({ arrayBuffer: await blob.arrayBuffer() });
      stage.replaceChildren(h('div', { class: 'vdoc', html: r.value }));
    } catch { stage.replaceChildren(h('p', { class: 'mute pad' }, 'No pude previsualizar este Word. Usá Guardar para abrirlo en tu app.')); }
  } else stage.replaceChildren(h('p', { class: 'mute pad' }, 'No hay vista previa para este tipo de archivo. Usá Guardar.'));
}

// vista de chat + compositor
function chatView() {
  const chat = chatById(S.chatId);
  if (!chat) { main.append(h('div', { class: 'empty' }, h('div', { class: 'big-emoji' }, '📝'), h('h2', null, 'Notis'), h('p', { class: 'mute' }, 'Elegí un chat o creá uno nuevo.'), h('button', { class: 'btn', onclick: () => chatDialog() }, ic('plus', 18), 'Nuevo chat'))); return; }
  const feed = h('div', { class: 'feed', id: 'feed' });
  const items = chatItems(chat.id); let lastDay = '';
  const pinned = items.filter(i => i.pinned);
  for (const it of items) {
    const d = ymd(it.created);
    if (d !== lastDay) { feed.append(h('div', { class: 'dsep' }, h('span', null, dayLabel(it.created)))); lastDay = d; }
    feed.append(itemNode(it));
  }
  if (!items.length) feed.append(h('div', { class: 'empty small' }, h('div', { class: 'big-emoji' }, chat.emoji), h('p', { class: 'mute' }, 'Escribí algo o subí un archivo para empezar.')));

  const head = h('header', { class: 'chead' },
    h('button', { class: 'icon-btn back', onclick: () => history.length > 1 ? history.back() : nav('chats') }, ic('back', 24)),
    h('span', { class: 'avatar sm', style: { background: `linear-gradient(135deg, ${chat.color}, ${chat.color}99)` } }, chat.emoji),
    h('div', { class: 'ctitle' }, h('b', null, chat.name), h('small', { class: 'mute' }, `${items.length} elementos${pinned.length ? ' · ' + pinned.length + ' fijados' : ''}`)),
    pinned.length ? h('button', { class: 'icon-btn', title: 'Ir al último fijado', onclick: () => jumpTo(pinned[pinned.length - 1].id) }, ic('pin', 20)) : null,
    h('button', { class: 'icon-btn', title: 'Buscar', onclick: () => { S.qChat = chat.id; S.q = ''; nav('search'); } }, ic('search', 20)),
    h('button', { class: 'icon-btn', onclick: () => chatMenu(chat) }, ic('more', 22)));

  // compositor
  const pendBox = h('div', { class: 'pending', hidden: true });
  const ta = h('textarea', { rows: 1, placeholder: 'Escribí una nota…', class: 'ta', value: S.drafts[chat.id] || '' });
  ta.value = S.drafts[chat.id] || '';
  const fit = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 180) + 'px'; };
  ta.addEventListener('input', () => { S.drafts[chat.id] = ta.value; fit(); });
  ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && settings.enterSends && !isTouch) { e.preventDefault(); send(); } });
  const pop = h('div', { class: 'emo-wrap', hidden: true });
  const ins = e => { const s = ta.selectionStart ?? ta.value.length; ta.setRangeText(e, s, ta.selectionEnd ?? s, 'end'); S.drafts[chat.id] = ta.value; ta.focus(); fit(); };
  pop.append(emojiPicker(ins));
  const inFile = (accept, capture) => { const i = h('input', { type: 'file', multiple: true, accept, hidden: true, onchange: () => { addFiles([...i.files]); i.value = ''; } }); if (capture) i.setAttribute('capture', 'environment'); return i; };
  const inMedia = inFile('image/*,video/*'), inAny = inFile('*/*'), inCam = inFile('image/*,video/*', true);
  const wrapSel = (a, b = a) => { const s = ta.selectionStart, e = ta.selectionEnd; ta.setRangeText(a + (ta.value.slice(s, e) || 'texto') + b, s, e, 'select'); ta.focus(); S.drafts[chat.id] = ta.value; fit(); };
  const linePre = p => { const s = ta.selectionStart, st = ta.value.lastIndexOf('\n', s - 1) + 1; ta.setRangeText(p, st, st, 'end'); ta.focus(); S.drafts[chat.id] = ta.value; fit(); };
  const fmt = h('div', { class: 'fmtbar' }, [['T', 'Título', () => linePre('# ')], ['B', 'Negrita', () => wrapSel('**')], ['I', 'Cursiva', () => wrapSel('*')], ['•', 'Lista', () => linePre('- ')], ['☑', 'Checklist', () => linePre('- [ ] ')], ['❝', 'Cita', () => linePre('> ')], ['</>', 'Código', () => wrapSel('`')], ['#', 'Etiqueta', () => ins('#')]]
    .map(([l, t, f]) => h('button', { class: 'fmt', title: t, onmousedown: e => e.preventDefault(), onclick: f }, l)));
  const send = () => sendMessage(chat, ta, pendBox, feed, fit);
  const comp = h('div', { class: 'composer' }, pop, pendBox, fmt,
    h('div', { class: 'crow2' },
      h('button', { class: 'icon-btn', title: 'Adjuntar', onclick: () => sheet('Adjuntar', [
        { label: 'Fotos y videos', icon: 'image', run: () => inMedia.click() }, { label: 'Archivos (PDF, Word, etc.)', icon: 'file', run: () => inAny.click() }, { label: 'Cámara', icon: 'cam', run: () => inCam.click() }]) }, ic('clip', 22)),
      ta,
      h('button', { class: 'icon-btn', title: 'Emojis', onclick: () => { pop.hidden = !pop.hidden; } }, ic('smile', 22)),
      h('button', { class: 'send', title: 'Enviar', onclick: send }, ic('send', 20)), inMedia, inAny, inCam));

  S._renderPending = () => {
    pendBox.hidden = !S.pending.length;
    pendBox.replaceChildren(...S.pending.map((p, i) => h('div', { class: 'pchip' },
      p.kind === 'image' ? h('img', { src: p.url, alt: '' }) : h('span', { class: 'ficon' }, FILE_ICON[p.kind]),
      h('small', null, p.file.name), h('button', { class: 'icon-btn', onclick: () => { URL.revokeObjectURL(p.url); S.pending.splice(i, 1); S._renderPending(); } }, ic('x', 14)))));
  };
  const addFiles = fs => { for (const f of fs) { const k = kindOf(f.type, f.name); S.pending.push({ file: f, kind: k, url: k === 'image' || k === 'video' ? URL.createObjectURL(f) : '' }); } S._renderPending(); ta.focus(); };
  ta.addEventListener('paste', e => { const fs = [...(e.clipboardData?.files || [])]; if (fs.length) { e.preventDefault(); addFiles(fs); } });
  const dropT = e => e.dataTransfer?.types?.includes('Files');
  main.ondragover = e => { if (dropT(e)) { e.preventDefault(); main.classList.add('drop'); } };
  main.ondragleave = e => { if (e.target === main) main.classList.remove('drop'); };
  main.ondrop = e => { if (dropT(e)) { e.preventDefault(); main.classList.remove('drop'); addFiles([...e.dataTransfer.files]); } };

  main.append(head, feed, comp);
  S._renderPending(); fit();
  requestAnimationFrame(() => { if (S.hl) jumpTo(S.hl); else feed.scrollTop = feed.scrollHeight; });
}
function jumpTo(id) {
  const n = $(`.msg[data-id="${id}"]`); if (!n) return;
  n.scrollIntoView({ block: 'center', behavior: 'smooth' }); n.classList.add('flash'); setTimeout(() => n.classList.remove('flash'), 1800);
}
async function mediaMeta(file, k) {
  const m = { id: DB.uid(), name: file.name || 'archivo', mime: file.type || '', size: file.size };
  if (k === 'video') await new Promise(ok => { const v = document.createElement('video'), u = URL.createObjectURL(file); v.preload = 'metadata'; v.onloadedmetadata = () => { m.w = v.videoWidth; m.h = v.videoHeight; m.dur = v.duration; URL.revokeObjectURL(u); ok(); }; v.onerror = () => { URL.revokeObjectURL(u); ok(); }; v.src = u; setTimeout(ok, 4000); });
  return m;
}
async function sendMessage(chat, ta, pendBox, feed, fit) {
  const text = ta.value.trim(), files = S.pending.splice(0);
  if (!text && !files.length) return;
  ta.value = ''; S.drafts[chat.id] = ''; fit(); S._renderPending();
  $('.empty.small', feed)?.remove();
  const append = it => { feed.append(itemNode(it)); feed.scrollTop = feed.scrollHeight; };
  const lastNow = chatItems(chat.id).slice(-1)[0];
  if (!lastNow || ymd(lastNow.created) !== ymd(Date.now())) feed.append(h('div', { class: 'dsep' }, h('span', null, 'Hoy')));
  try {
    await persistEntry(chat, text, files, append);
    renderSide();
    const sm = $('.ctitle small'); if (sm) sm.textContent = `${chatItems(chat.id).length} elementos`;
  } catch (e) { toast('No se pudo guardar: ' + (e.message || e), 4500); }
}
function chatMenu(c) {
  sheet(`${c.emoji} ${c.name}`, [
    { label: 'Renombrar / cambiar emoji y color', icon: 'edit', run: () => chatDialog(c) },
    { label: c.pinned ? 'Quitar de fijados' : 'Fijar arriba', icon: 'pin', run: async () => { c.pinned = !c.pinned; await DB.save('chats', c); renderAll(); } },
    { label: 'Exportar este chat (texto)', icon: 'dl', run: () => { const t = chatItems(c.id).map(i => `[${new Date(i.created).toLocaleString('es-AR')}] ${i.file ? '📎 ' + i.file.name + (i.text ? ' — ' : '') : ''}${i.text || ''}`).join('\n'); saveFile(new Blob([t], { type: 'text/plain' }), c.name + '.txt'); } },
    { label: 'Eliminar chat', icon: 'trash', danger: true, run: async () => { if (await confirmBox('¿Eliminar chat?', `Se borra "${c.name}" con todo su contenido.`)) { for (const it of S.items.get(c.id) || []) if (!it.deleted) await DB.remove('items', it); await DB.remove('chats', c); nav('chats', null); } } }
  ]);
}

// ---------------------------------------------------------------- CALENDARIO
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
function calView() {
  const m = S.calMonth, y = m.getFullYear(), mo = m.getMonth();
  const first = new Date(y, mo, 1), startOff = (first.getDay() + 6) % 7, days = new Date(y, mo + 1, 0).getDate();
  const evs = live(S.events), by = {}; evs.forEach(e => (by[e.date] ||= []).push(e));
  const grid = h('div', { class: 'cal-grid' }, ['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(d => h('div', { class: 'dow' }, d)));
  for (let i = 0; i < startOff; i++) grid.append(h('div', { class: 'cell empty' }));
  for (let d = 1; d <= days; d++) {
    const key = ymd(new Date(y, mo, d)), es = by[key] || [];
    grid.append(h('button', { class: 'cell' + (key === ymd(new Date()) ? ' today' : '') + (key === S.calSel ? ' sel' : ''), onclick: () => { S.calSel = key; renderMain(); } },
      h('span', null, d), h('span', { class: 'dots' }, es.slice(0, 4).map(e => h('i', { style: { background: e.color } })))));
  }
  const sel = (by[S.calSel] || []).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  const selDate = new Date(S.calSel + 'T12:00');
  const upcoming = evs.filter(e => e.date > S.calSel).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || ''))).slice(0, 6);
  const evRow = (e, showDate) => h('button', { class: 'ev', onclick: () => eventDialog(e) }, h('i', { class: 'evbar', style: { background: e.color } }),
    h('span', { class: 'evinfo' }, h('b', null, e.title), h('small', { class: 'mute' }, [showDate && new Date(e.date + 'T12:00').toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' }), e.time || 'Todo el día', e.note].filter(Boolean).join(' · '))));
  main.append(h('div', { class: 'page' },
    h('div', { class: 'ph' }, h('h2', null, 'Calendario'), h('button', { class: 'btn', onclick: () => eventDialog(null, S.calSel) }, ic('plus', 18), 'Evento')),
    h('div', { class: 'card glass' },
      h('div', { class: 'cal-head' }, h('button', { class: 'icon-btn', onclick: () => { S.calMonth = new Date(y, mo - 1, 1); renderMain(); } }, ic('back', 22)),
        h('b', null, `${MESES[mo]} ${y}`),
        h('div', { class: 'row gap6' }, h('button', { class: 'chip', onclick: () => { S.calMonth = new Date(); S.calSel = ymd(new Date()); renderMain(); } }, 'Hoy'),
          h('button', { class: 'icon-btn flipx', onclick: () => { S.calMonth = new Date(y, mo + 1, 1); renderMain(); } }, ic('back', 22)))), grid),
    h('h3', { class: 'sec' }, selDate.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })),
    sel.length ? h('div', { class: 'card glass evlist' }, sel.map(e => evRow(e))) : h('p', { class: 'mute' }, 'No hay eventos este día.'),
    upcoming.length ? [h('h3', { class: 'sec' }, 'Próximos'), h('div', { class: 'card glass evlist' }, upcoming.map(e => evRow(e, true)))] : null));
}
function eventDialog(ev, date) {
  const e0 = ev || { id: DB.uid(), title: '', date: date || ymd(new Date()), time: '', color: COLORS[5], note: '' };
  let color = e0.color;
  const title = h('input', { type: 'text', class: 'field', placeholder: 'Título (ej: Parcial de Historia)', value: e0.title });
  const d = h('input', { type: 'date', class: 'field', value: e0.date }), t = h('input', { type: 'time', class: 'field', value: e0.time });
  const note = h('textarea', { class: 'field', rows: 3, placeholder: 'Nota (opcional)' }); note.value = e0.note || '';
  const sw = h('div', { class: 'swatches' }), drawSw = () => sw.replaceChildren(...COLORS.map(k => h('button', { class: 'sw' + (k === color ? ' on' : ''), style: { background: k }, onclick: () => { color = k; drawSw(); } }))); drawSw();
  const ov = overlay(h('div', { class: 'dlg glass' }, h('h3', null, ev ? 'Editar evento' : 'Nuevo evento'), title, h('div', { class: 'row gap' }, d, t), note, sw,
    h('div', { class: 'row between' }, ev ? h('button', { class: 'btn danger ghost', onclick: async () => { await DB.remove('events', ev); ov.close(); renderMain(); } }, ic('trash', 18)) : h('span'),
      h('div', { class: 'row gap' }, h('button', { class: 'btn ghost', onclick: () => ov.close() }, 'Cancelar'),
        h('button', { class: 'btn', onclick: async () => {
          if (!title.value.trim()) return toast('Poné un título');
          Object.assign(e0, { title: title.value.trim(), date: d.value, time: t.value, note: note.value.trim(), color }); await DB.save('events', e0);
          if (!ev) S.events.push(e0); S.calSel = e0.date; S.calMonth = new Date(e0.date + 'T12:00'); ov.close(); renderMain();
        } }, 'Guardar')))));
  setTimeout(() => title.focus(), 100);
}

// ---------------------------------------------------------------- BUSCADOR
function searchView() {
  const out = h('div', { class: 'results' });
  const inp = h('input', { type: 'search', class: 'field', placeholder: 'Buscar notas, archivos, links, eventos…', value: S.q, oninput: debounce(e => { S.q = e.target.value; run(); }, 120) });
  const scope = S.qChat && chatById(S.qChat);
  const run = () => {
    const q = S.q.trim().toLowerCase(); out.replaceChildren(); if (!q) return out.append(h('p', { class: 'mute pad' }, 'Escribí algo para buscar. Tip: tocá una #etiqueta en una nota.'));
    const hits = [];
    for (const c of live(S.chats)) { if (scope && c.id !== scope.id) continue;
      for (const it of chatItems(c.id)) {
        const hay = [it.text, it.file?.name, it.link?.title, it.link?.url].filter(Boolean).join(' ').toLowerCase();
        if (hay.includes(q)) hits.push({ c, it });
      } }
    const evs = scope ? [] : live(S.events).filter(e => (e.title + ' ' + (e.note || '')).toLowerCase().includes(q));
    const chats = scope ? [] : live(S.chats).filter(c => c.name.toLowerCase().includes(q));
    if (!hits.length && !evs.length && !chats.length) return out.append(h('p', { class: 'mute pad' }, 'Sin resultados.'));
    if (chats.length) out.append(h('h3', { class: 'sec' }, 'Chats'), ...chats.map(c => h('button', { class: 'crow', onclick: () => nav('chats', c.id) }, h('span', { class: 'avatar', style: { background: c.color } }, c.emoji), h('span', { class: 'cinfo' }, h('span', { class: 'cname' }, c.name)))));
    if (hits.length) out.append(h('h3', { class: 'sec' }, `Mensajes (${hits.length})`), ...hits.sort((a, b) => b.it.created - a.it.created).slice(0, 80).map(({ c, it }) => {
      const t = it.text || it.file?.name || it.link?.title || '', i = Math.max(0, t.toLowerCase().indexOf(q)), snip = t.slice(Math.max(0, i - 30), i + 90).replace(/\n/g, ' ');
      return h('button', { class: 'crow', onclick: () => nav('chats', c.id, { hl: it.id }) }, h('span', { class: 'avatar', style: { background: c.color } }, c.emoji),
        h('span', { class: 'cinfo' }, h('span', { class: 'cname' }, it.file ? FILE_ICON[kindOf(it.file.mime, it.file.name)] + ' ' + (it.file.name) : c.name), h('span', { class: 'cprev' }, snip)), h('span', { class: 'ctime' }, shortWhen(it.created)));
    }));
    if (evs.length) out.append(h('h3', { class: 'sec' }, 'Eventos'), ...evs.map(e => h('button', { class: 'ev', onclick: () => { S.calSel = e.date; S.calMonth = new Date(e.date + 'T12:00'); nav('calendar'); } }, h('i', { class: 'evbar', style: { background: e.color } }), h('span', { class: 'evinfo' }, h('b', null, e.title), h('small', { class: 'mute' }, e.date)))));
  };
  main.append(h('div', { class: 'page' }, h('div', { class: 'ph' }, h('h2', null, 'Buscar'), scope && h('button', { class: 'chip on', onclick: () => { S.qChat = ''; renderMain(); } }, `${scope.emoji} ${scope.name} ✕`)), inp, out));
  run(); if (!S.q) setTimeout(() => inp.focus(), 50);
}

// ---------------------------------------------------------------- AJUSTES
function seg(opts, cur, on) { return h('div', { class: 'seg' }, opts.map(([v, l]) => h('button', { class: 'chip' + (cur === v ? ' on' : ''), onclick: () => on(v) }, l))); }
function toggle(label, key, hint) {
  return h('label', { class: 'tog' }, h('span', null, h('b', null, label), hint && h('small', { class: 'mute' }, hint)), h('input', { type: 'checkbox', checked: !!settings[key], onchange: e => setSettings({ [key]: e.target.checked }) }), h('i'));
}
function renderSyncStat(el) {
  const st = Sync.state, cfg = Sync.getCfg();
  el.replaceChildren(h('span', { class: 'dotst ' + st.status }), h('span', null, !Sync.isConnected() ? 'Sin conectar' : (st.msg || 'Conectado') + (cfg.last ? ' · última vez ' + new Date(cfg.last).toLocaleString('es-AR') : '')));
}
function settingsView() {
  const re = () => { const y = main.scrollTop; renderMain(); main.scrollTop = y; };
  const grid = h('div', { class: 'pal-grid' });
  const drawPal = () => {
    const q = S.palQ.toLowerCase();
    grid.replaceChildren(...PALETTES.filter(p => p.name.toLowerCase().includes(q)).map(p => h('button', { class: 'pal' + (settings.palette === p.name ? ' on' : ''), title: p.name, onclick: () => { setSettings({ palette: p.name }); drawPal(); } },
      h('span', { class: 'pchip', style: { background: `linear-gradient(135deg, ${p.a}, ${p.b})` } }, settings.palette === p.name && ic('check', 16)), h('small', null, p.name))));
  };
  drawPal();
  const cfg = Sync.getCfg(); const cid = h('input', { type: 'text', class: 'field', placeholder: 'xxxxxxxx.apps.googleusercontent.com', value: cfg.clientId || '', inputMode: 'url', autocapitalize: 'off' });
  const stat = h('div', { class: 'syncstat', id: 'syncstat' }); renderSyncStat(stat);
  const storage = h('p', { class: 'mute' }, 'Calculando…');
  navigator.storage?.estimate?.().then(e => { storage.textContent = `Usado en este dispositivo: ${fmtSize(e.usage || 0)} de ${fmtSize(e.quota || 0)} disponibles.`; });
  const persistBtn = h('button', { class: 'btn ghost', onclick: async () => { const ok = await navigator.storage?.persist?.(); toast(ok ? 'Almacenamiento protegido ✓' : 'El navegador no lo permitió (instalá la app en pantalla de inicio)', 4000); } }, 'Proteger almacenamiento');

  main.append(h('div', { class: 'page' },
    h('div', { class: 'ph' }, h('h2', null, 'Ajustes')),
    h('section', { class: 'card glass' }, h('h3', null, '🎨 Apariencia'),
      h('label', { class: 'lbl' }, 'Tu nombre'), h('input', { type: 'text', class: 'field', placeholder: 'Para el saludo de Inicio', value: settings.name || '', oninput: e => setSettings({ name: e.target.value }) }),
      h('label', { class: 'lbl' }, 'Modo'), seg([['auto', 'Automático'], ['light', 'Claro'], ['dark', 'Oscuro']], settings.mode, v => { setSettings({ mode: v }); re(); }),
      h('label', { class: 'lbl' }, `Paletas (${PALETTES.length})`),
      h('input', { type: 'search', class: 'field', placeholder: 'Buscar paleta…', value: S.palQ, oninput: e => { S.palQ = e.target.value; drawPal(); } }), grid,
      h('div', { class: 'custom' }, h('button', { class: 'pal' + (settings.palette === '__custom' ? ' on' : ''), onclick: () => { setSettings({ palette: '__custom' }); re(); } }, h('span', { class: 'pchip', style: { background: `linear-gradient(135deg, ${settings.custom}, ${settings.custom2})` } }, settings.palette === '__custom' && ic('check', 16)), h('small', null, 'Personalizada')),
        h('label', { class: 'colorin' }, 'Color 1', h('input', { type: 'color', value: settings.custom, oninput: e => setSettings({ custom: e.target.value, palette: '__custom' }) })),
        h('label', { class: 'colorin' }, 'Color 2', h('input', { type: 'color', value: settings.custom2, oninput: e => setSettings({ custom2: e.target.value, palette: '__custom' }) }))),
      h('label', { class: 'lbl' }, 'Burbujas'), seg([['soft', 'Suave'], ['solid', 'Sólido'], ['gradient', 'Degradado']], settings.bubble, v => { setSettings({ bubble: v }); re(); }),
      toggle('Negro puro (OLED)', 'oled', 'Ahorra batería en pantallas OLED como la del iPhone'), toggle('Todo en negrita', 'boldAll', 'Tipografía SF Bold en todo el texto'), toggle('Fondo decorado', 'wallpaper'),
      h('label', { class: 'sl' }, h('span', null, 'Tamaño del texto'), h('input', { type: 'range', min: .85, max: 1.35, step: .01, value: settings.scale, oninput: e => setSettings({ scale: +e.target.value }) })),
      h('label', { class: 'sl' }, h('span', null, 'Redondeo'), h('input', { type: 'range', min: 4, max: 28, step: 1, value: settings.radius, oninput: e => setSettings({ radius: +e.target.value }) })),
      !isTouch && toggle('Enter envía el mensaje', 'enterSends', 'Shift+Enter hace un salto de línea')),

    h('section', { class: 'card glass' }, h('h3', null, '☁️ Sincronizar con tu Google Drive'),
      h('p', { class: 'mute' }, 'Gratis. Tus notas y archivos (en calidad original, 4K incluido) se guardan en una carpeta oculta de TU Drive y aparecen en todos tus dispositivos. Usa tus 15 GB gratuitos de Google.'),
      stat, h('label', { class: 'lbl' }, 'Client ID de Google'), cid,
      h('div', { class: 'row gap wrap' },
        h('button', { class: 'btn', onclick: async () => { const id = cid.value.trim(); if (!id) return toast('Pegá primero el Client ID'); try { await Sync.connect(id, true); Sync.start(); Sync.syncNow(); re(); } catch (e) { toast('No se pudo conectar: ' + e.message, 4500); } } }, Sync.isConnected() ? 'Reconectar' : 'Conectar con Google'),
        Sync.isConnected() && h('button', { class: 'btn ghost', onclick: () => Sync.syncNow() }, 'Sincronizar ahora'),
        Sync.isConnected() && h('button', { class: 'btn ghost danger', onclick: () => { Sync.disconnect(); re(); } }, 'Desconectar')),
      h('details', null, h('summary', null, 'Cómo obtener el Client ID (una sola vez, 3 minutos)'),
        h('ol', { class: 'guide' },
          h('li', null, 'Entrá a ', h('a', { href: 'https://console.cloud.google.com/projectcreate', target: '_blank', rel: 'noopener' }, 'console.cloud.google.com'), ' y creá un proyecto (nombre libre).'),
          h('li', null, 'Menú → "APIs y servicios" → "Biblioteca" → buscá ', h('b', null, 'Google Drive API'), ' → Habilitar.'),
          h('li', null, '"Pantalla de consentimiento OAuth" → Externo → completá nombre y tu mail → en "Usuarios de prueba" agregá tu Gmail.'),
          h('li', null, '"Credenciales" → Crear credenciales → ID de cliente OAuth → Tipo: ', h('b', null, 'Aplicación web'), '.'),
          h('li', null, 'En "Orígenes autorizados de JavaScript" poné la dirección donde publiques esta web (ej: ', h('code', null, location.origin), ').'),
          h('li', null, 'Copiá el Client ID, pegalo arriba y tocá Conectar. Repetí "Conectar" en cada dispositivo.')))),

    h('section', { class: 'card glass' }, h('h3', null, '💾 Almacenamiento y datos'), storage,
      h('div', { class: 'row gap wrap' }, persistBtn,
        h('button', { class: 'btn ghost', onclick: exportBackup }, ic('dl', 18), 'Copia de seguridad'),
        h('button', { class: 'btn ghost', onclick: () => { const i = h('input', { type: 'file', accept: '.json', onchange: () => importBackup(i.files[0]) }); i.click(); } }, 'Importar copia'),
        h('button', { class: 'btn ghost danger', onclick: async () => { if (await confirmBox('¿Borrar TODO?', 'Se eliminan todos los chats, archivos y eventos de este dispositivo. No se puede deshacer.', 'Borrar todo')) { await DB.clearAll(); localStorage.removeItem('notis.sync'); location.reload(); } } }, 'Borrar todo')),
      h('p', { class: 'mute small' }, 'iPhone: abrí esta página en Safari → Compartir → "Añadir a pantalla de inicio". Así iOS no borra tus datos por falta de uso y se ve como app.')),
    h('section', { class: 'card glass' }, h('h3', null, 'ℹ️ Notas sobre calidad'),
      h('p', { class: 'mute' }, 'Los archivos se guardan byte por byte, sin recomprimir. Las ediciones (recorte, filtros, encuadre) no tocan el original: se aplican al mostrar, y al exportar una foto se procesa desde los píxeles originales. Si elegís fotos desde la galería del iPhone, iOS puede convertirlas (HEIC→JPG); para conservar el original exacto subilas desde "Archivos".'))));
}
async function exportBackup() {
  const data = { v: 1, at: Date.now(), chats: S.chats, items: [...S.items.values()].flat(), events: S.events, settings };
  saveFile(new Blob([JSON.stringify(data)], { type: 'application/json' }), `notis-copia-${ymd(Date.now())}.json`);
  toast('La copia incluye notas y eventos. Los archivos se sincronizan por Drive o se bajan desde cada chat.', 5000);
}
async function importBackup(file) {
  if (!file) return;
  try {
    const d = JSON.parse(await file.text());
    for (const c of d.chats || []) await DB.put('chats', c); for (const i of d.items || []) await DB.put('items', i); for (const e of d.events || []) await DB.put('events', e);
    await loadAll(); renderAll(); toast('Copia importada ✓');
  } catch { toast('Ese archivo no es una copia válida'); }
}

// ---------------------------------------------------------------- arranque
async function boot() {
  try {
    await loadAll(); await seed();
    const s = history.state; if (s?.view) { S.view = s.view; S.chatId = s.chatId; } else history.replaceState({ view: 'home', chatId: null }, '');
    renderAll();
    navigator.storage?.persist?.();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
    Sync.start();
  } catch (e) {
    root.replaceChildren(h('div', { class: 'empty' }, h('h2', null, 'No pude abrir la base de datos'), h('p', { class: 'mute' }, 'Si usás una ventana privada, el navegador no permite guardar datos. Probá en una ventana normal. ' + e.message)));
  }
}
boot();
