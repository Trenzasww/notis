// Edición NO destructiva: el archivo original nunca se modifica. Las ediciones se guardan como instrucciones
// y se aplican al mostrar. Al exportar, la foto se procesa desde los píxeles originales (resolución nativa).
import { h, ic, overlay, toast, saveFile, fmtDur } from './util.js';

export const IDENT = { b: 1, c: 1, s: 1, sep: 0, g: 0, hue: 0 };
export const PRESETS = [
  ['Original', {}], ['Vívido', { c: 1.15, s: 1.45 }], ['Cálido', { b: 1.05, sep: .25, s: 1.15 }], ['Frío', { hue: -12, s: 1.05, b: 1.03 }],
  ['Dramático', { c: 1.35, b: .92, s: .9 }], ['Mate', { c: .88, b: 1.06, s: .85 }], ['B&N', { g: 1, c: 1.1 }], ['Noir', { g: 1, c: 1.45, b: .9 }],
  ['Sepia', { sep: 1 }], ['Fade', { c: .8, b: 1.12, s: .8 }], ['Pop', { c: 1.2, s: 1.7, b: 1.03 }], ['Cine', { c: 1.15, s: .8, hue: 8, b: .95 }]
];
export const ASPECTS = [['Libre', null], ['Original', 'orig'], ['1:1', 1], ['4:5', .8], ['5:4', 1.25], ['3:4', .75], ['4:3', 4 / 3], ['2:3', 2 / 3], ['3:2', 1.5], ['9:16', 9 / 16], ['16:9', 16 / 9], ['21:9', 21 / 9]];

export const isIdent = f => !f || Object.keys(IDENT).every(k => Math.abs((f[k] ?? IDENT[k]) - IDENT[k]) < 1e-3);
export const filterCSS = f => isIdent(f) ? 'none' : `brightness(${f.b}) contrast(${f.c}) saturate(${f.s}) sepia(${f.sep}) grayscale(${f.g}) hue-rotate(${f.hue}deg)`;
export const hasEdits = e => !!e && (e.rot || e.flip || e.crop || !isIdent(e.f) || e.trim || e.muted || e.zoom > 1 || e.aspect);

const mm = (A, B) => { const r = []; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j]; return r; };
function colorMatrix(f) {
  const s = f.s, a = f.sep, g = f.g, t = f.hue * Math.PI / 180, cs = Math.cos(t), sn = Math.sin(t);
  const sat = [.213 + .787 * s, .715 - .715 * s, .072 - .072 * s, .213 - .213 * s, .715 + .285 * s, .072 - .072 * s, .213 - .213 * s, .715 - .715 * s, .072 + .928 * s];
  const sep = [.393 + .607 * (1 - a), .769 - .769 * (1 - a), .189 - .189 * (1 - a), .349 - .349 * (1 - a), .686 + .314 * (1 - a), .168 - .168 * (1 - a), .272 - .272 * (1 - a), .534 - .534 * (1 - a), .131 + .869 * (1 - a)];
  const gr = [.2126 + .7874 * (1 - g), .7152 - .7152 * (1 - g), .0722 - .0722 * (1 - g), .2126 - .2126 * (1 - g), .7152 + .2848 * (1 - g), .0722 - .0722 * (1 - g), .2126 - .2126 * (1 - g), .7152 - .7152 * (1 - g), .0722 + .9278 * (1 - g)];
  const hu = [.213 + cs * .787 - sn * .213, .715 - cs * .715 - sn * .715, .072 - cs * .072 + sn * .928, .213 - cs * .213 + sn * .143, .715 + cs * .285 + sn * .14, .072 - cs * .072 - sn * .283, .213 - cs * .213 - sn * .787, .715 - cs * .715 + sn * .715, .072 + cs * .928 + sn * .072];
  return mm(hu, mm(gr, mm(sep, sat)));
}
function applyPixels(ctx, w, hgt, f) {
  const img = ctx.getImageData(0, 0, w, hgt), d = img.data, M = colorMatrix(f), b = f.b, c = f.c, n = d.length;
  for (let i = 0; i < n; i += 4) {
    let r = (d[i] * b - 128) * c + 128, g = (d[i + 1] * b - 128) * c + 128, bl = (d[i + 2] * b - 128) * c + 128;
    r = r < 0 ? 0 : r > 255 ? 255 : r; g = g < 0 ? 0 : g > 255 ? 255 : g; bl = bl < 0 ? 0 : bl > 255 ? 255 : bl;
    d[i] = M[0] * r + M[1] * g + M[2] * bl; d[i + 1] = M[3] * r + M[4] * g + M[5] * bl; d[i + 2] = M[6] * r + M[7] * g + M[8] * bl;
  }
  ctx.putImageData(img, 0, 0);
}

export async function loadImage(blob) {
  const url = URL.createObjectURL(blob), img = new Image();
  img.src = url;
  try { await img.decode(); } catch { URL.revokeObjectURL(url); throw new Error('No se pudo leer la imagen'); }
  return { img, url };
}

// Dibuja (recorta, gira, filtra). maxSide=null => resolución nativa (con tope de 16,7 MP por límite de iOS)
export function renderImage(src, e, maxSide, { nocrop = false } = {}) {
  const bw = src.naturalWidth || src.width, bh = src.naturalHeight || src.height, rot = e.rot || 0, swap = rot % 180 !== 0;
  const rw = swap ? bh : bw, rh = swap ? bw : bh, c = nocrop || !e.crop ? { x: 0, y: 0, w: 1, h: 1 } : e.crop;
  const sw = c.w * rw, sh = c.h * rh;
  let k = maxSide ? Math.min(1, maxSide / Math.max(sw, sh)) : 1;
  if (sw * sh * k * k > 16.7e6) k = Math.sqrt(16.7e6 / (sw * sh));
  const ow = Math.max(1, Math.round(sw * k)), oh = Math.max(1, Math.round(sh * k));
  const cv = document.createElement('canvas'); cv.width = ow; cv.height = oh;
  const ctx = cv.getContext('2d'); ctx.imageSmoothingQuality = 'high';
  ctx.scale(ow / sw, oh / sh); ctx.translate(-c.x * rw, -c.y * rh);
  ctx.translate(rw / 2, rh / 2); if (e.flip) ctx.scale(-1, 1); ctx.rotate(rot * Math.PI / 180);
  ctx.drawImage(src, -bw / 2, -bh / 2);
  if (!isIdent(e.f)) applyPixels(ctx, ow, oh, { ...IDENT, ...e.f });
  return cv;
}
const toBlob = (cv, type, q) => new Promise(r => cv.toBlob(r, type, q));
export async function editedURL(blob, e, maxSide = 1400) {
  const { img, url } = await loadImage(blob);
  try { const cv = renderImage(img, e, maxSide); return URL.createObjectURL(await toBlob(cv, 'image/jpeg', .92)); }
  finally { URL.revokeObjectURL(url); }
}
export async function exportImage(blob, e, name, fmt = 'png') {
  const { img, url } = await loadImage(blob);
  try {
    const cv = renderImage(img, e, null);
    const out = await toBlob(cv, fmt === 'png' ? 'image/png' : 'image/jpeg', .98);
    if (!out) throw new Error('El navegador no pudo exportar una imagen tan grande');
    const base = name.replace(/\.[^.]+$/, '');
    await saveFile(out, `${base}-editada.${fmt === 'png' ? 'png' : 'jpg'}`);
    return { w: cv.width, h: cv.height };
  } finally { URL.revokeObjectURL(url); }
}

// ---------- video (se aplica al reproducir) ----------
export function videoStyle(v, frame, e, meta) {
  const ratio = typeof e?.aspect === 'number' ? e.aspect : (meta?.w && meta?.h ? meta.w / meta.h : 16 / 9);
  frame.style.aspectRatio = String(ratio); frame.style.setProperty('--r', String(ratio));
  const px = (e?.px ?? .5) * 100, py = (e?.py ?? .5) * 100;
  Object.assign(v.style, { objectFit: 'cover', objectPosition: `${px}% ${py}%`, transformOrigin: `${px}% ${py}%`, transform: `scale(${e?.zoom || 1})`, filter: filterCSS(e?.f) });
  v.muted = !!e?.muted;
}
export function bindTrim(v, e) {
  const s = e?.trim?.s || 0, en = e?.trim?.e || 0;
  if (!s && !en) return;
  let raf;
  const clamp = () => { if (en && v.currentTime >= en - .04) { v.pause(); v.currentTime = s; } else if (v.currentTime < s - .05) v.currentTime = s; if (!v.paused) raf = requestAnimationFrame(clamp); };
  v.addEventListener('play', () => { if (v.currentTime < s || (en && v.currentTime >= en - .04)) v.currentTime = s; cancelAnimationFrame(raf); raf = requestAnimationFrame(clamp); });
  v.addEventListener('seeked', () => { if (v.currentTime < s - .05) v.currentTime = s; });
  v.addEventListener('loadedmetadata', () => { if (s) v.currentTime = s; });
}

const defaults = () => ({ rot: 0, flip: false, crop: null, aspect: null, zoom: 1, f: { ...IDENT }, p: 'Original' });
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// ---------- EDITOR DE FOTO ----------
export async function openImageEditor({ blob, name, edits, onSave }) {
  const E = Object.assign(defaults(), structuredClone(edits || {})); E.f = { ...IDENT, ...E.f };
  let tab = 'crop', base, rw, rh;
  const { img: full, url: fullUrl } = await loadImage(blob);
  base = renderImage(full, defaults(), 1600);  // copia liviana para previsualizar
  const dims = () => { const sw = (E.rot || 0) % 180 !== 0; rw = sw ? base.height : base.width; rh = sw ? base.width : base.height; };
  const ratioPx = () => E.aspect === 'orig' ? rw / rh : E.aspect;
  const fit = (keepCenter) => {
    dims(); const r = ratioPx(), z = E.zoom || 1;
    let cx = .5, cy = .5; if (keepCenter && E.crop) { cx = E.crop.x + E.crop.w / 2; cy = E.crop.y + E.crop.h / 2; }
    let w = 1, hh = 1;
    if (r) { if (rw / rh > r) { w = r * rh / rw; } else { hh = rw / (r * rh); } }
    w /= z; hh /= z;
    E.crop = { x: clamp(cx - w / 2, 0, 1 - w), y: clamp(cy - hh / 2, 0, 1 - hh), w, h: hh };
  };
  dims(); if (!E.crop) E.crop = { x: 0, y: 0, w: 1, h: 1 };

  const cv = h('canvas', { class: 'ed-canvas' });
  const box = h('div', { class: 'crop-box' }, ['move', 'nw', 'ne', 'sw', 'se'].map(k => h('i', { class: 'hd ' + k, 'data-h': k })));
  const wrap = h('div', { class: 'cropwrap' }, cv, box);
  const stage = h('div', { class: 'ed-stage' }, wrap);
  const panel = h('div', { class: 'ed-panel' });
  const tabs = h('div', { class: 'ed-tabs' });

  function paint() {
    dims();
    const out = renderImage(base, E, 1400, { nocrop: tab === 'crop' });
    cv.width = out.width; cv.height = out.height; cv.getContext('2d').drawImage(out, 0, 0);
    box.style.display = tab === 'crop' ? '' : 'none';
    if (tab === 'crop') { const c = E.crop; Object.assign(box.style, { left: c.x * 100 + '%', top: c.y * 100 + '%', width: c.w * 100 + '%', height: c.h * 100 + '%' }); }
  }
  let pend; const paintSoon = () => { cancelAnimationFrame(pend); pend = requestAnimationFrame(paint); };

  // arrastrar el recorte
  let drag;
  box.addEventListener('pointerdown', ev => { const k = ev.target.dataset.h || 'move'; drag = { k, px: ev.clientX, py: ev.clientY, c: { ...E.crop } }; box.setPointerCapture(ev.pointerId); ev.preventDefault(); });
  box.addEventListener('pointermove', ev => {
    if (!drag) return;
    const r = cv.getBoundingClientRect(), c = drag.c;
    if (drag.k === 'move') {
      E.crop = { ...c, x: clamp(c.x + (ev.clientX - drag.px) / r.width, 0, 1 - c.w), y: clamp(c.y + (ev.clientY - drag.py) / r.height, 0, 1 - c.h) };
    } else {
      const west = drag.k.includes('w'), north = drag.k.includes('n');
      const ax = west ? c.x + c.w : c.x, ay = north ? c.y + c.h : c.y;
      const px = clamp((ev.clientX - r.left) / r.width, 0, 1), py = clamp((ev.clientY - r.top) / r.height, 0, 1);
      let w = Math.abs(px - ax), hh = Math.abs(py - ay);
      const rp = ratioPx();
      if (rp) {
        const rn = rp * rh / rw;
        if (w / rn > hh) hh = w / rn; else w = hh * rn;
        const mw = west ? ax : 1 - ax, mh = north ? ay : 1 - ay;
        if (w > mw) { w = mw; hh = w / rn; } if (hh > mh) { hh = mh; w = hh * rn; }
      }
      w = Math.max(w, .04); hh = Math.max(hh, .04);
      E.crop = { x: west ? ax - w : ax, y: north ? ay - hh : ay, w, h: hh };
    }
    const c2 = E.crop; Object.assign(box.style, { left: c2.x * 100 + '%', top: c2.y * 100 + '%', width: c2.w * 100 + '%', height: c2.h * 100 + '%' });
  });
  const end = () => { drag = null; };
  box.addEventListener('pointerup', end); box.addEventListener('pointercancel', end);

  const slider = (label, key, min, max, step) => {
    const val = h('b', null, ''), inp = h('input', { type: 'range', min, max, step, value: E.f[key], oninput: () => { E.f[key] = +inp.value; E.p = 'Personalizado'; val.textContent = (+inp.value).toFixed(2); paintSoon(); } });
    val.textContent = (+E.f[key]).toFixed(2);
    return h('label', { class: 'sl' }, h('span', null, label, val), inp);
  };
  function renderPanel() {
    [...tabs.children].forEach(t => t.classList.toggle('on', t.dataset.t === tab));
    panel.replaceChildren();
    if (tab === 'crop') {
      panel.append(
        h('div', { class: 'chips' }, ASPECTS.map(([n, v]) => h('button', { class: 'chip' + (E.aspect === v ? ' on' : ''), onclick: () => { E.aspect = v; E.crop = null; fit(false); renderPanel(); paint(); } }, n))),
        h('div', { class: 'row gap' },
          h('button', { class: 'btn ghost', onclick: () => { E.rot = ((E.rot || 0) + 270) % 360; E.crop = null; fit(false); paint(); } }, ic('rot', 18), 'Girar'),
          h('button', { class: 'btn ghost', onclick: () => { E.flip = !E.flip; paint(); } }, ic('flip', 18), 'Espejo'),
          h('button', { class: 'btn ghost', onclick: () => { E.crop = null; E.zoom = 1; E.aspect = null; fit(false); renderPanel(); paint(); } }, 'Sin recorte')),
        h('label', { class: 'sl' }, h('span', null, 'Zoom'), h('input', { type: 'range', min: 1, max: 4, step: .01, value: E.zoom, oninput: ev => { E.zoom = +ev.target.value; fit(true); paintSoon(); } })));
    } else if (tab === 'adjust') {
      panel.append(slider('Brillo', 'b', .5, 1.5, .01), slider('Contraste', 'c', .5, 1.5, .01), slider('Saturación', 's', 0, 2, .01), slider('Tono', 'hue', -180, 180, 1), slider('Sepia', 'sep', 0, 1, .01), slider('Blanco y negro', 'g', 0, 1, .01));
    } else {
      const thumbBase = renderImage(base, { ...E, f: { ...IDENT } }, 140);
      panel.append(h('div', { class: 'presets' }, PRESETS.map(([n, p]) => {
        const c = renderImage(thumbBase, { rot: 0, flip: false, crop: null, f: { ...IDENT, ...p } }, 140);
        return h('button', { class: 'preset' + (E.p === n ? ' on' : ''), onclick: () => { E.f = { ...IDENT, ...p }; E.p = n; renderPanel(); paint(); } }, c, h('span', null, n));
      })));
    }
  }
  [['crop', 'Recortar'], ['adjust', 'Ajustes'], ['filters', 'Filtros']].forEach(([k, n]) => tabs.append(h('button', { class: 'chip tab', 'data-t': k, onclick: () => { tab = k; renderPanel(); paint(); } }, n)));

  const close = () => { URL.revokeObjectURL(fullUrl); ov.close(); };
  const isDefault = () => !E.rot && !E.flip && isIdent(E.f) && (!E.crop || (E.crop.w > .999 && E.crop.h > .999));
  const ov = overlay(h('div', { class: 'editor' },
    h('div', { class: 'ed-top' },
      h('button', { class: 'btn ghost', onclick: close }, ic('x', 18), 'Cerrar'),
      h('b', null, 'Editar foto'),
      h('button', { class: 'btn', onclick: () => { onSave(isDefault() ? null : { rot: E.rot, flip: E.flip, crop: E.crop && (E.crop.w > .999 && E.crop.h > .999 ? null : E.crop), aspect: E.aspect, zoom: E.zoom, f: E.f, p: E.p }); close(); toast('Edición guardada'); } }, ic('check', 18), 'Guardar')),
    stage, tabs, panel,
    h('div', { class: 'ed-foot' },
      h('span', { class: 'mute small' }, 'El original no se modifica.'),
      h('button', { class: 'btn ghost', onclick: () => { Object.assign(E, defaults()); E.f = { ...IDENT }; dims(); E.crop = { x: 0, y: 0, w: 1, h: 1 }; renderPanel(); paint(); } }, 'Restablecer'),
      h('button', { class: 'btn ghost', onclick: () => exportDialog() }, ic('share', 18), 'Exportar'))), { cls: 'full' });

  function exportDialog() {
    const go = async fmt => {
      x.close(); toast('Exportando en resolución nativa…');
      try {
        const e2 = { rot: E.rot, flip: E.flip, crop: E.crop, f: E.f };
        const r = await exportImage(blob, e2, name, fmt); toast(`Listo · ${r.w}×${r.h}px`);
      } catch (err) { toast(err.message, 3500); }
    };
    const x = overlay(h('div', { class: 'dlg glass' }, h('h3', null, 'Exportar foto'),
      h('p', { class: 'mute' }, 'Se genera desde los píxeles originales, sin bajar la calidad. En iPhone podés guardarla en Fotos desde el menú Compartir.'),
      h('div', { class: 'stack' }, h('button', { class: 'btn', onclick: () => go('png') }, 'PNG (sin pérdida)'), h('button', { class: 'btn ghost', onclick: () => go('jpg') }, 'JPG (calidad máxima)'))));
  }

  renderPanel(); paint();
}

// ---------- EDITOR DE VIDEO ----------
export function openVideoEditor({ blob, name, meta, edits, onSave }) {
  const E = { trim: null, muted: false, aspect: null, zoom: 1, px: .5, py: .5, f: { ...IDENT }, p: 'Original', ...structuredClone(edits || {}) }; E.f = { ...IDENT, ...E.f };
  const url = URL.createObjectURL(blob);
  const v = h('video', { src: url, controls: true, playsInline: true, preload: 'metadata', class: 'ed-video' });
  const frame = h('div', { class: 'vframe' }, v);
  const stage = h('div', { class: 'ed-stage' }, frame);
  const panel = h('div', { class: 'ed-panel' });
  let dur = meta?.dur || 0, tab = 'trim';
  const tabs = h('div', { class: 'ed-tabs' });
  const refresh = () => videoStyle(v, frame, E, meta);

  v.addEventListener('loadedmetadata', () => { dur = v.duration; meta = { ...meta, w: v.videoWidth, h: v.videoHeight }; refresh(); renderPanel(); });
  let raf; const loop = () => { const s = E.trim?.s || 0, en = E.trim?.e || dur; if (v.currentTime >= en - .04) { v.pause(); v.currentTime = s; } if (!v.paused) raf = requestAnimationFrame(loop); };
  v.addEventListener('play', () => { const s = E.trim?.s || 0, en = E.trim?.e || dur; if (v.currentTime < s || v.currentTime >= en - .04) v.currentTime = s; cancelAnimationFrame(raf); raf = requestAnimationFrame(loop); });

  const slider = (label, key, min, max, step) => {
    const val = h('b', null, (+E.f[key]).toFixed(2));
    const inp = h('input', { type: 'range', min, max, step, value: E.f[key], oninput: () => { E.f[key] = +inp.value; E.p = 'Personalizado'; val.textContent = (+inp.value).toFixed(2); refresh(); } });
    return h('label', { class: 'sl' }, h('span', null, label, val), inp);
  };
  function renderPanel() {
    [...tabs.children].forEach(t => t.classList.toggle('on', t.dataset.t === tab));
    panel.replaceChildren();
    if (tab === 'trim') {
      const s = E.trim?.s || 0, en = E.trim?.e || dur;
      const lab = h('div', { class: 'row between' }, h('b', { id: 'ts' }, 'Inicio ' + fmtDur(s)), h('b', { id: 'te' }, 'Fin ' + fmtDur(en)));
      const mk = (key, val) => h('input', { type: 'range', min: 0, max: dur || 1, step: .05, value: val, oninput: ev => {
        const t = +ev.target.value; E.trim = E.trim || { s: 0, e: dur };
        E.trim[key] = t; if (E.trim.s >= E.trim.e - .2) { if (key === 's') E.trim.s = Math.max(0, E.trim.e - .2); else E.trim.e = Math.min(dur, E.trim.s + .2); }
        v.currentTime = E.trim[key]; lab.children[0].textContent = 'Inicio ' + fmtDur(E.trim.s); lab.children[1].textContent = 'Fin ' + fmtDur(E.trim.e);
      } });
      panel.append(lab, h('label', { class: 'sl' }, h('span', null, 'Inicio'), mk('s', s)), h('label', { class: 'sl' }, h('span', null, 'Fin'), mk('e', en)),
        h('div', { class: 'row gap' },
          h('button', { class: 'btn ghost', onclick: () => { E.trim = E.trim || { s: 0, e: dur }; E.trim.s = Math.min(v.currentTime, E.trim.e - .2); renderPanel(); } }, 'Inicio acá'),
          h('button', { class: 'btn ghost', onclick: () => { E.trim = E.trim || { s: 0, e: dur }; E.trim.e = Math.max(v.currentTime, E.trim.s + .2); renderPanel(); } }, 'Fin acá'),
          h('button', { class: 'btn ghost', onclick: () => { E.trim = null; renderPanel(); } }, 'Sin recorte')),
        h('p', { class: 'mute small' }, 'El recorte se aplica al reproducir. El archivo original 4K queda intacto.'));
    } else if (tab === 'frame') {
      panel.append(
        h('div', { class: 'chips' }, [['Original', null], ['1:1', 1], ['4:5', .8], ['9:16', 9 / 16], ['16:9', 16 / 9], ['4:3', 4 / 3]].map(([n, a]) => h('button', { class: 'chip' + (E.aspect === a ? ' on' : ''), onclick: () => { E.aspect = a; refresh(); renderPanel(); } }, n))),
        h('label', { class: 'sl' }, h('span', null, 'Zoom'), h('input', { type: 'range', min: 1, max: 4, step: .01, value: E.zoom, oninput: ev => { E.zoom = +ev.target.value; refresh(); } })),
        h('label', { class: 'sl' }, h('span', null, 'Mover horizontal'), h('input', { type: 'range', min: 0, max: 1, step: .01, value: E.px, oninput: ev => { E.px = +ev.target.value; refresh(); } })),
        h('label', { class: 'sl' }, h('span', null, 'Mover vertical'), h('input', { type: 'range', min: 0, max: 1, step: .01, value: E.py, oninput: ev => { E.py = +ev.target.value; refresh(); } })),
        h('button', { class: 'btn ghost', onclick: () => { E.muted = !E.muted; refresh(); renderPanel(); } }, ic(E.muted ? 'mute' : 'vol', 18), E.muted ? 'Sin sonido' : 'Con sonido'));
    } else {
      panel.append(h('div', { class: 'presets small' }, PRESETS.map(([n, p]) => h('button', { class: 'preset' + (E.p === n ? ' on' : ''), onclick: () => { E.f = { ...IDENT, ...p }; E.p = n; refresh(); renderPanel(); } }, h('span', null, n)))),
        slider('Brillo', 'b', .5, 1.5, .01), slider('Contraste', 'c', .5, 1.5, .01), slider('Saturación', 's', 0, 2, .01));
    }
  }
  [['trim', 'Recortar'], ['frame', 'Encuadre'], ['filters', 'Filtros']].forEach(([k, n]) => tabs.append(h('button', { class: 'chip tab', 'data-t': k, onclick: () => { tab = k; renderPanel(); } }, n)));
  const close = () => { cancelAnimationFrame(raf); v.pause(); URL.revokeObjectURL(url); ov.close(); };
  const ov = overlay(h('div', { class: 'editor' },
    h('div', { class: 'ed-top' }, h('button', { class: 'btn ghost', onclick: close }, ic('x', 18), 'Cerrar'), h('b', null, 'Editar video'),
      h('button', { class: 'btn', onclick: () => {
        const clean = { ...E }; if (E.trim && E.trim.s <= .05 && Math.abs(E.trim.e - dur) < .1) clean.trim = null;
        onSave(hasEdits(clean) ? clean : null); close(); toast('Edición guardada');
      } }, ic('check', 18), 'Guardar')),
    stage, tabs, panel,
    h('div', { class: 'ed-foot' }, h('span', { class: 'mute small' }, 'El original no se modifica.'),
      h('button', { class: 'btn ghost', onclick: () => { saveFile(blob, name); } }, ic('dl', 18), 'Guardar original'))), { cls: 'full' });
  refresh(); renderPanel();
}
