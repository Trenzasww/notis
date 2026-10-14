export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k.startsWith('data-') || k.startsWith('aria-') || k === 'role') el.setAttribute(k, v);
    else if (k in el) { try { el[k] = v; } catch { el.setAttribute(k, v); } }
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) { if (c == null || c === false) continue; el.append(c.nodeType ? c : document.createTextNode(c)); }
  return el;
}

const P = {
  plus: 'M12 5v14M5 12h14', send: 'M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z',
  clip: 'M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48',
  smile: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01',
  back: 'M15 18l-6-6 6-6', search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35',
  cal: 'M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM16 2v4M8 2v4M3 10h18',
  chat: 'M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z',
  cfg: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
  more: 'M12 12h.01M19 12h.01M5 12h.01', trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z',
  dl: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  share: 'M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13', x: 'M18 6L6 18M6 6l12 12', check: 'M20 6L9 17l-5-5',
  crop: 'M6 2v14a2 2 0 0 0 2 2h14M2 6h14a2 2 0 0 1 2 2v14', rot: 'M23 4v6h-6M20.5 15a9 9 0 1 1-2.1-9.4L23 10',
  pin: 'M12 17v5M9 3h6l-1 7 3 3v2H7v-2l3-3-1-7z', image: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM21 15l-5-5L5 21',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6',
  cam: 'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  mute: 'M11 5L6 9H2v6h4l5 4V5zM23 9l-6 6M17 9l6 6', vol: 'M11 5L6 9H2v6h4l5 4V5zM19 5a10 10 0 0 1 0 14M15.5 8.5a5 5 0 0 1 0 7',
  flip: 'M12 3v18M8 7L3 12l5 5V7zM16 7l5 5-5 5V7z', cloud: 'M18 10h-1.3A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z',
  copy: 'M11 9h11v13H11zM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1',
  wand: 'M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8L19 13M17.8 6.2L19 5M3 21l9-9M12.2 6.2L11 5', play: 'M5 3l14 9-14 9z',
  link: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7',
  note: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z', zoom: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35M11 8v6M8 11h6',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  lock: 'M5 11h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1zM8 11V7a4 4 0 0 1 8 0v4', unlock: 'M5 11h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1zM8 11V7a4 4 0 0 1 7.5-2',
  eye: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', faceid: 'M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M9 10v1.5M15 10v1.5M12 10v3.5h-1M9 16.5c1.7 1.2 4.3 1.2 6 0',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z', drop: 'M12 2.7l5.7 5.7a8 8 0 1 1-11.4 0z',
  home: 'M3 11l9-8 9 8v10a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2z', list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01', folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', up: 'M12 19V5M5 12l7-7 7 7',
  tag: 'M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8zM7 7h.01'
};
export function ic(name, size = 20) {
  const s = document.createElement('span');
  s.className = 'ic';
  s.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${P[name] || ''}"/></svg>`;
  return s;
}

// ---------- fechas ----------
const dayFmt = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
const timeFmt = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
export const fmtTime = t => timeFmt.format(t);
export const ymd = d => { d = new Date(d); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export function dayLabel(t) {
  const d = new Date(t), today = new Date();
  if (ymd(d) === ymd(today)) return 'Hoy';
  if (ymd(d) === ymd(today.getTime() - 864e5)) return 'Ayer';
  const s = dayFmt.format(d); return s[0].toUpperCase() + s.slice(1);
}
export function shortWhen(t) {
  const d = new Date(t), today = new Date();
  if (ymd(d) === ymd(today)) return fmtTime(t);
  if (ymd(d) === ymd(today.getTime() - 864e5)) return 'Ayer';
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
}
export const fmtSize = n => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(0) + ' KB' : n < 1073741824 ? (n / 1048576).toFixed(1) + ' MB' : (n / 1073741824).toFixed(2) + ' GB';
export const fmtDur = s => { s = Math.round(s || 0); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

// ---------- texto con formato ----------
const INLINE = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(https?:\/\/[^\s<]+)|(#[\p{L}\d_]+)/gu;
function inline(text, onTag) {
  const out = []; let last = 0, m;
  INLINE.lastIndex = 0;
  while ((m = INLINE.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    if (m[1]) out.push(h('code', null, t.slice(1, -1)));
    else if (m[2]) out.push(h('strong', null, t.slice(2, -2)));
    else if (m[3]) out.push(h('em', null, t.slice(1, -1)));
    else if (m[4]) { const u = t.replace(/[).,;!?]+$/, ''); out.push(h('a', { href: u, target: '_blank', rel: 'noopener' }, u)); if (u.length < t.length) out.push(t.slice(u.length)); }
    else out.push(h('a', { class: 'tag', href: '#', onclick: e => { e.preventDefault(); onTag?.(t); } }, t));
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
export function richText(text, { onTag, onToggle } = {}) {
  const box = h('div', { class: 'rich' });
  text.split('\n').forEach((line, i) => {
    let m;
    if ((m = line.match(/^(#{1,3})\s+(.*)/))) box.append(h('div', { class: 'h' + m[1].length }, inline(m[2], onTag)));
    else if ((m = line.match(/^\s*[-*]\s+\[( |x|X)\]\s+(.*)/))) {
      const done = m[1] !== ' ';
      box.append(h('label', { class: 'task' + (done ? ' done' : '') },
        h('input', { type: 'checkbox', checked: done, onchange: () => onToggle?.(i, !done) }), h('span', null, inline(m[2], onTag))));
    }
    else if ((m = line.match(/^\s*[-*]\s+(.*)/))) box.append(h('div', { class: 'li' }, h('i', null, '•'), h('span', null, inline(m[1], onTag))));
    else if ((m = line.match(/^\s*(\d+)[.)]\s+(.*)/))) box.append(h('div', { class: 'li' }, h('i', null, m[1] + '.'), h('span', null, inline(m[2], onTag))));
    else if ((m = line.match(/^>\s?(.*)/))) box.append(h('blockquote', null, inline(m[1], onTag)));
    else if (line.trim() === '') box.append(h('div', { class: 'gap' }));
    else box.append(h('div', { class: 'p' }, inline(line, onTag)));
  });
  return box;
}

// ---------- UI helpers ----------
export function toast(msg, ms = 2200) {
  let box = $('#toasts'); if (!box) { box = h('div', { id: 'toasts' }); document.body.append(box); }
  const t = h('div', { class: 'toast' }, msg); box.append(t);
  requestAnimationFrame(() => t.classList.add('in'));
  setTimeout(() => { t.classList.remove('in'); setTimeout(() => t.remove(), 300); }, ms);
}
export function overlay(content, { onClose, cls = '' } = {}) {
  const ov = h('div', { class: 'overlay ' + cls }, content);
  const close = () => { ov.classList.remove('in'); setTimeout(() => ov.remove(), 200); onClose?.(); };
  ov.addEventListener('pointerdown', e => { if (e.target === ov) close(); });
  document.body.append(ov); requestAnimationFrame(() => ov.classList.add('in'));
  ov.close = close; return ov;
}
export function sheet(title, items) {
  const ov = overlay(null, { cls: 'sheet-ov' });
  const body = h('div', { class: 'sheet glass' },
    title && h('div', { class: 'sheet-t' }, title),
    items.filter(Boolean).map(it => h('button', { class: 'sheet-i' + (it.danger ? ' danger' : ''), onclick: () => { ov.close(); setTimeout(() => it.run?.(), 120); } }, it.icon && ic(it.icon, 20), it.label)),
    h('button', { class: 'sheet-i cancel', onclick: () => ov.close() }, 'Cancelar'));
  ov.append(body); return ov;
}
export function ask(title, { value = '', placeholder = '', ok = 'Guardar', text } = {}) {
  return new Promise(res => {
    const inp = h('input', { type: 'text', value, placeholder, class: 'field', onkeydown: e => { if (e.key === 'Enter') done(inp.value); } });
    const ov = overlay(h('div', { class: 'dlg glass' }, h('h3', null, title), text && h('p', { class: 'mute' }, text), inp,
      h('div', { class: 'row end' }, h('button', { class: 'btn ghost', onclick: () => done(null) }, 'Cancelar'), h('button', { class: 'btn', onclick: () => done(inp.value) }, ok))), { onClose: () => res(null) });
    const done = v => { ov.close(); res(v); };
    setTimeout(() => inp.focus(), 80);
  });
}
export function confirmBox(title, text, ok = 'Eliminar') {
  return new Promise(res => {
    const ov = overlay(h('div', { class: 'dlg glass' }, h('h3', null, title), h('p', { class: 'mute' }, text),
      h('div', { class: 'row end' }, h('button', { class: 'btn ghost', onclick: () => { ov.close(); res(false); } }, 'Cancelar'),
        h('button', { class: 'btn danger', onclick: () => { ov.close(); res(true); } }, ok))), { onClose: () => res(false) });
  });
}
// efecto onda en botones
document.addEventListener('pointerdown', e => {
  const b = e.target.closest?.('.btn,.fab,.chip,.tab,.sheet-i,.icon-btn,.send');
  if (!b || b.disabled) return;
  const r = b.getBoundingClientRect(), s = Math.max(r.width, r.height) * 2;
  const el = h('span', { class: 'ripple', style: { width: s + 'px', height: s + 'px', left: e.clientX - r.left - s / 2 + 'px', top: e.clientY - r.top - s / 2 + 'px' } });
  b.append(el); setTimeout(() => el.remove(), 600);
});

// ---------- archivos ----------
export function kindOf(mime = '', name = '') {
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (mime.startsWith('image/') || /^(jpe?g|png|gif|webp|avif|heic|heif|bmp|svg)$/.test(ext)) return 'image';
  if (mime.startsWith('video/') || /^(mp4|mov|m4v|webm|mkv|avi)$/.test(ext)) return 'video';
  if (mime.startsWith('audio/') || /^(mp3|m4a|wav|aac|ogg|flac)$/.test(ext)) return 'audio';
  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (ext === 'docx') return 'docx';
  if (/^(txt|md|csv|json|log|js|ts|py|html|css|xml|yml|yaml|java|c|cpp|sql)$/.test(ext) || mime.startsWith('text/')) return 'text';
  return 'other';
}
export const FILE_ICON = { pdf: '📕', docx: '📘', text: '📄', audio: '🎵', other: '📎', image: '🖼️', video: '🎬' };
export async function saveFile(blob, name) {
  const file = new File([blob], name, { type: blob.type || 'application/octet-stream' });
  try {
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file] }); return; }
  } catch (e) { if (e.name === 'AbortError') return; }
  const a = h('a', { href: URL.createObjectURL(blob), download: name }); document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}
export const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
