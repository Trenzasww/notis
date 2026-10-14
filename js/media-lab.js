// Laboratorio de medios: AUMENTAR CALIDAD, CAMBIAR RELACIÓN DE ASPECTO y COMPRIMIR.
// Todo corre en tu dispositivo (gratis, sin subir nada). El original nunca se modifica: el resultado es una copia nueva.
import { h, ic, overlay, toast, kindOf, fmtSize, saveFile } from './util.js';
import { loadImage } from './media.js';

const MAXPX = 16.7e6; // límite de píxeles de un canvas en iOS
const even = n => Math.max(2, Math.round(n / 2) * 2);
export const RATIOS = [['Original', null], ['1:1', 1], ['4:5', 4 / 5], ['5:4', 5 / 4], ['3:4', 3 / 4], ['4:3', 4 / 3], ['2:3', 2 / 3], ['3:2', 3 / 2], ['9:16', 9 / 16], ['16:9', 16 / 9], ['21:9', 21 / 9]];

// ---------------------------------------------------------------- geometría
// Calcula el tamaño de salida y la región de origen para la relación de aspecto pedida.
export function plan(sw, sh, o) {
  let cw = sw, ch = sh, ow = sw, oh = sh;
  const ar = o.aspect, mode = o.fit || 'crop';
  if (ar && mode === 'crop') { if (sw / sh > ar) { cw = Math.round(sh * ar); ch = sh; } else { cw = sw; ch = Math.round(sw / ar); } ow = cw; oh = ch; }
  else if (ar && mode === 'bars') { if (sw / sh > ar) { ow = sw; oh = Math.round(sw / ar); } else { oh = sh; ow = Math.round(sh * ar); } }
  const s = o.scale || 1; ow *= s; oh *= s;
  if (o.maxSide) { const k = Math.min(1, o.maxSide / Math.max(ow, oh)); ow *= k; oh *= k; }
  let limited = false;
  if (ow * oh > (o.maxPx || MAXPX)) { const k = Math.sqrt((o.maxPx || MAXPX) / (ow * oh)); ow *= k; oh *= k; limited = true; }
  return { ow: even(ow), oh: even(oh), cw, ch, sx: (sw - cw) * (o.fx ?? .5), sy: (sh - ch) * (o.fy ?? .5), mode, limited };
}
let tiny;
function paint(ctx, src, sw, sh, p, o) {
  const { ow, oh, cw, ch, sx, sy, mode } = p;
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  if (mode === 'bars' && o.aspect) {
    if (o.bars === 'black' || o.bars === 'white') { ctx.fillStyle = o.bars === 'white' ? '#fff' : '#000'; ctx.fillRect(0, 0, ow, oh); }
    else { // fondo desenfocado (copia muy chica estirada)
      tiny ||= document.createElement('canvas'); tiny.width = 40; tiny.height = Math.max(8, Math.round(40 * oh / ow));
      const tx = tiny.getContext('2d'); tx.drawImage(src, 0, 0, tiny.width, tiny.height);
      ctx.drawImage(tiny, 0, 0, ow, oh); ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fillRect(0, 0, ow, oh);
    }
    const k = Math.min(ow / sw, oh / sh), dw = sw * k, dh = sh * k;
    ctx.drawImage(src, (ow - dw) / 2, (oh - dh) / 2, dw, dh);
  } else ctx.drawImage(src, sx, sy, cw, ch, 0, 0, ow, oh);
}

// ---------------------------------------------------------------- mejora (WebGL)
const VS = 'attribute vec2 p;varying vec2 uv;void main(){uv=p*.5+.5;gl_Position=vec4(p,0.,1.);}';
const FS = `precision highp float;varying vec2 uv;uniform sampler2D t;uniform vec2 px;uniform float sharp,dn,lo,hi,sat,con;
vec3 S(vec2 o){return texture2D(t,uv+o*px).rgb;}
void main(){
  vec3 c=S(vec2(0.));
  vec3 b=(S(vec2(0.,-1.))+S(vec2(0.,1.))+S(vec2(1.,0.))+S(vec2(-1.,0.))+c*4.)/8.;
  float e=length(c-b);
  c=mix(c,b,dn*(1.-smoothstep(.02,.12,e)));
  c+=(c-b)*sharp*2.2;
  c=(c-lo)/max(hi-lo,.05);
  c=(c-.5)*con+.5;
  float l=dot(c,vec3(.299,.587,.114));
  c=mix(vec3(l),c,sat);
  gl_FragColor=vec4(clamp(c,0.,1.),1.);
}`;
export function makeGL(w, hgt) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = hgt;
  const gl = cv.getContext('webgl', { preserveDrawingBuffer: true, premultipliedAlpha: false, antialias: false });
  if (!gl) return null;
  const mt = gl.getParameter(gl.MAX_TEXTURE_SIZE); if (w > mt || hgt > mt) return null;
  const sh = (type, s) => { const x = gl.createShader(type); gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x; };
  const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr); gl.useProgram(pr);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
  [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]].forEach(([k, v]) => gl.texParameteri(gl.TEXTURE_2D, k, v));
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); gl.viewport(0, 0, w, hgt);
  const U = {}; ['px', 'sharp', 'dn', 'lo', 'hi', 'sat', 'con'].forEach(n => U[n] = gl.getUniformLocation(pr, n));
  gl.uniform2f(U.px, 1 / w, 1 / hgt);
  return { canvas: cv, render(src, e) {
    gl.bindTexture(gl.TEXTURE_2D, tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.uniform1f(U.sharp, e.sharp); gl.uniform1f(U.dn, e.dn); gl.uniform1f(U.lo, e.lo); gl.uniform1f(U.hi, e.hi); gl.uniform1f(U.sat, e.sat); gl.uniform1f(U.con, e.con);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  } };
}
// niveles automáticos: estira luces y sombras sin pasarse
function levels(src, sw, sh) {
  const c = document.createElement('canvas'); c.width = 96; c.height = Math.max(8, Math.round(96 * sh / sw));
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(src, 0, 0, c.width, c.height);
  const d = x.getImageData(0, 0, c.width, c.height).data, hist = new Uint32Array(256), total = c.width * c.height;
  for (let i = 0; i < d.length; i += 4) hist[Math.round(.299 * d[i] + .587 * d[i + 1] + .114 * d[i + 2])]++;
  let acc = 0, lo = 0, hi = 255; for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= total * .005) { lo = i; break; } }
  acc = 0; for (let i = 255; i >= 0; i--) { acc += hist[i]; if (acc >= total * .005) { hi = i; break; } }
  return { lo: Math.min(lo / 255, .14) * .85, hi: 1 - (1 - Math.max(hi / 255, .86)) * .85 };
}
const enhParams = (e, lv) => ({ sharp: e.sharp / 100, dn: e.denoise / 100 * .8, lo: e.auto ? lv.lo : 0, hi: e.auto ? lv.hi : 1, con: e.auto ? 1.05 : 1, sat: e.auto ? 1.08 : 1 });
// respaldo sin WebGL (solo fotos): afinado por convolución
function jsSharpen(cv, amount) {
  const ctx = cv.getContext('2d', { willReadFrequently: true }), w = cv.width, hh = cv.height, img = ctx.getImageData(0, 0, w, hh), s = img.data, out = new Uint8ClampedArray(s);
  const a = amount * 2.2;
  for (let y = 1; y < hh - 1; y++) for (let x = 1; x < w - 1; x++) { const i = (y * w + x) * 4;
    for (let c = 0; c < 3; c++) { const b = (s[i + c - 4] + s[i + c + 4] + s[i + c - w * 4] + s[i + c + w * 4] + s[i + c] * 4) / 8; out[i + c] = s[i + c] + (s[i + c] - b) * a; } }
  img.data.set(out); ctx.putImageData(img, 0, 0); return cv;
}

const toBlob = (cv, type, q) => new Promise(r => cv.toBlob(r, type, q));
const TYPES = { jpeg: ['image/jpeg', 'jpg'], webp: ['image/webp', 'webp'], png: ['image/png', 'png'] };

// ---------------------------------------------------------------- procesar foto
export async function processImage(blob, o) {
  const { img, url } = await loadImage(blob);
  try {
    const sw = img.naturalWidth, sh = img.naturalHeight, p = plan(sw, sh, o);
    const cv = document.createElement('canvas'); cv.width = p.ow; cv.height = p.oh;
    paint(cv.getContext('2d'), img, sw, sh, p, o);
    let out = cv;
    if (o.enhance) {
      const gl = makeGL(p.ow, p.oh);
      if (gl) { gl.render(cv, enhParams(o.enhance, levels(cv, p.ow, p.oh))); out = gl.canvas; }
      else jsSharpen(cv, o.enhance.sharp / 100);
    }
    const [type] = TYPES[o.fmt || 'jpeg'];
    const res = await toBlob(out, type, (o.q ?? 92) / 100);
    if (!res) throw new Error('El navegador no pudo generar una imagen tan grande');
    return { blob: res, w: p.ow, h: p.oh, limited: p.limited };
  } finally { URL.revokeObjectURL(url); }
}

// ---------------------------------------------------------------- procesar video (en tiempo real, en tu dispositivo)
const pickMime = () => ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find(m => window.MediaRecorder?.isTypeSupported(m));
export async function processVideo(blob, o, onProgress, ctl) {
  if (!window.MediaRecorder) throw new Error('Este navegador no puede procesar videos');
  const url = URL.createObjectURL(blob), v = document.createElement('video');
  v.src = url; v.playsInline = true; v.preload = 'auto';
  await new Promise((ok, no) => { v.onloadedmetadata = ok; v.onerror = () => no(new Error('No se pudo leer el video')); });
  const sw = v.videoWidth, sh = v.videoHeight, dur = v.duration, p = plan(sw, sh, { ...o, maxPx: 3840 * 2160 });
  const cv = document.createElement('canvas'); cv.width = p.ow; cv.height = p.oh;
  const ctx = cv.getContext('2d'); let final = cv, gl = null, lv = null;
  if (o.enhance) { gl = makeGL(p.ow, p.oh); if (gl) { final = gl.canvas; } }
  await new Promise(ok => { v.onloadeddata = ok; if (v.readyState >= 2) ok(); });
  if (gl) { paint(ctx, v, sw, sh, p, o); lv = levels(cv, p.ow, p.oh); }
  const ep = o.enhance ? enhParams(o.enhance, lv || { lo: 0, hi: 1 }) : null;
  const draw = () => { paint(ctx, v, sw, sh, p, o); if (gl) gl.render(cv, ep); };

  const stream = final.captureStream();
  let ac = null, note = '';
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    const node = ac.createMediaElementSource(v), dest = ac.createMediaStreamDestination(); node.connect(dest);
    dest.stream.getAudioTracks().forEach(t => stream.addTrack(t)); await ac.resume();
  } catch { note = 'sin audio'; }
  const mime = pickMime(), chunks = [];
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: o.bitrate || 8e6, audioBitsPerSecond: 128000 });
  rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  const stopped = new Promise(ok => rec.onstop = ok);
  let last = 0, ended = false;
  const tick = () => { last = performance.now(); draw(); onProgress?.(Math.min(1, v.currentTime / dur)); if (!v.ended && !ended && !ctl?.cancelled && 'requestVideoFrameCallback' in v) v.requestVideoFrameCallback(tick); };
  const fallback = setInterval(() => { if (performance.now() - last > 250) { last = performance.now(); draw(); onProgress?.(Math.min(1, v.currentTime / dur)); } }, 100);
  draw(); rec.start(1000);
  const finish = () => { if (ended) return; ended = true; clearInterval(fallback); setTimeout(() => { try { rec.stop(); } catch {} }, 300); };
  v.onended = finish; ctl && (ctl.stop = finish);
  try { await v.play(); } catch { v.muted = true; await v.play(); note = 'sin audio'; }
  if ('requestVideoFrameCallback' in v) v.requestVideoFrameCallback(tick);
  await stopped;
  try { ac?.close(); } catch {} URL.revokeObjectURL(url); v.removeAttribute('src');
  if (ctl?.cancelled) throw new Error('Cancelado');
  return { blob: new Blob(chunks, { type: mime.split(';')[0] }), w: p.ow, h: p.oh, limited: p.limited, note, dur };
}

async function gzip(blob) { return new Response(new Blob([blob]).stream().pipeThrough(new CompressionStream('gzip'))).blob(); }

// ---------------------------------------------------------------- pantalla
const slider = (label, key, o, min, max, step, fmt, on) => {
  const val = h('b', null, fmt(o[key]));
  const inp = h('input', { type: 'range', min, max, step, value: o[key], oninput: () => { o[key] = +inp.value; val.textContent = fmt(o[key]); on?.(); } });
  return h('label', { class: 'sl' }, h('span', null, label, val), inp);
};
const chips = (items, cur, pick) => h('div', { class: 'chips' }, items.map(([label, v]) => h('button', { class: 'chip' + (cur === v ? ' on' : ''), onclick: () => pick(v) }, label)));
const baseName = n => n.replace(/\.[^.]+$/, '');

export function openLab({ blob, name, tab: tab0, onSave }) {
  const kind = kindOf(blob.type, name), media = kind === 'image' || kind === 'video';
  let tab = media ? (tab0 || 'quality') : 'compress';
  const o = { aspect: null, fit: 'crop', bars: 'blur', fx: .5, fy: .5, scale: kind === 'image' ? 2 : 1, sharp: 55, denoise: 20, auto: true, maxSide: null, q: 82, fmt: 'jpeg', vres: null, vq: .06 };
  let src = null, result = null, running = false, view = 'after', ctl = null, pvT;
  const stage = h('div', { class: 'lab-stage' }), panel = h('div', { class: 'ed-panel lab-panel' }), tabs = h('div', { class: 'ed-tabs' });
  const info = h('div', { class: 'lab-info mute small' }), bar = h('i', { class: 'xbar', hidden: true }, h('s', { style: { width: '0%' } }));
  const actions = h('div', { class: 'row gap wrap lab-actions' });

  // ---- origen
  const ready = (async () => {
    if (kind === 'image') { const { img, url } = await loadImage(blob); src = { el: img, w: img.naturalWidth, h: img.naturalHeight, url }; }
    else if (kind === 'video') {
      const url = URL.createObjectURL(blob), v = document.createElement('video'); v.src = url; v.preload = 'metadata'; v.muted = true; v.playsInline = true;
      await new Promise((ok, no) => { v.onloadedmetadata = ok; v.onerror = () => no(new Error('No se pudo leer el video')); });
      src = { el: v, w: v.videoWidth, h: v.videoHeight, dur: v.duration, url };
    }
  })();

  const buildOpts = () => {
    const op = { aspect: null, fit: o.fit, bars: o.bars, fx: o.fx, fy: o.fy, scale: 1, maxSide: null, fmt: o.fmt, q: o.q };
    if (tab === 'quality') { op.scale = o.scale; op.enhance = { sharp: o.sharp, denoise: o.denoise, auto: o.auto }; op.fmt = /png/.test(blob.type) ? 'png' : 'jpeg'; op.q = 95; op.bitrate = Math.max(6e6, 8e6 * o.scale); }
    if (tab === 'aspect') { op.aspect = o.aspect; op.fmt = /png/.test(blob.type) ? 'png' : 'jpeg'; op.q = 95; op.bitrate = 10e6; }
    if (tab === 'compress') { op.maxSide = o.maxSide; op.bitrate = null; }
    return op;
  };
  const dimsText = (w, hh) => `${w}×${hh}`;
  const srcLine = () => src ? `Original: ${src.w ? dimsText(src.w, src.h) + ' · ' : ''}${src.dur ? Math.round(src.dur) + ' s · ' : ''}${fmtSize(blob.size)}` : `Original: ${fmtSize(blob.size)}`;

  // ---- vista previa
  function drawStage() {
    stage.replaceChildren();
    if (!media) { stage.append(h('div', { class: 'fcard' }, h('span', { class: 'ficon' }, '📄'), h('span', { class: 'finfo' }, h('b', null, name), h('small', null, fmtSize(blob.size))))); return; }
    if (result && view === 'after') {
      if (kind === 'image') stage.append(h('img', { class: 'lab-img', src: result.url })); else stage.append(h('video', { class: 'lab-vid', src: result.url, controls: true, playsInline: true }));
      return;
    }
    if (kind === 'image') {
      const cv = document.createElement('canvas'); cv.className = 'lab-img';
      const op = buildOpts(); const p = plan(src.w, src.h, { ...op, scale: 1, maxSide: 760, maxPx: 1e9 });
      cv.width = p.ow; cv.height = p.oh; paint(cv.getContext('2d'), src.el, src.w, src.h, p, op);
      if (tab === 'quality') { const gl = makeGL(p.ow, p.oh); if (gl) { gl.render(cv, enhParams(op.enhance, levels(cv, p.ow, p.oh))); const c2 = document.createElement('canvas'); c2.className = 'lab-img'; c2.width = p.ow; c2.height = p.oh; c2.getContext('2d').drawImage(gl.canvas, 0, 0); stage.append(c2); return; } }
      stage.append(cv);
    } else {
      const v = h('video', { class: 'lab-vid', src: src.url, controls: true, playsInline: true, muted: true });
      if (tab === 'aspect' && o.aspect) {
        const fr = h('div', { class: 'vframe lab-frame' }, v); fr.style.aspectRatio = String(o.aspect); fr.style.setProperty('--r', String(o.aspect));
        Object.assign(v.style, { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: o.fit === 'crop' ? 'cover' : 'contain', objectPosition: `${o.fx * 100}% ${o.fy * 100}%` });
        fr.style.background = o.bars === 'white' ? '#fff' : '#000'; stage.append(fr);
      } else stage.append(v);
    }
  }
  const refresh = () => { clearTimeout(pvT); pvT = setTimeout(() => { if (src && !running) drawStage(); }, 180); };
  const invalidate = () => { if (result) { URL.revokeObjectURL(result.url); result = null; } view = 'after'; renderActions(); renderCompare(); refresh(); };

  // ---- paneles
  function renderTabs() {
    tabs.replaceChildren(...(media ? [['quality', 'Aumentar calidad'], ['aspect', 'Relación de aspecto'], ['compress', 'Comprimir']] : [['compress', 'Comprimir']])
      .map(([k, l]) => h('button', { class: 'chip tab' + (tab === k ? ' on' : ''), onclick: () => { if (running) return; tab = k; invalidate(); renderTabs(); renderPanel(); } }, l)));
  }
  function renderPanel() {
    panel.replaceChildren();
    if (tab === 'quality') {
      const maxScale = src ? Math.max(1, Math.floor(Math.sqrt((kind === 'image' ? MAXPX : 3840 * 2160) / (src.w * src.h)) * 10) / 10) : 4;
      const scales = (kind === 'image' ? [1, 2, 3, 4] : [1, 1.5, 2]).filter(s => s <= maxScale + .01);
      panel.append(
        h('div', { class: 'lbl' }, 'Aumentar tamaño'), chips(scales.map(s => [s === 1 ? 'Mismo tamaño' : `×${s}`, s]), Math.min(o.scale, scales[scales.length - 1] || 1), v => { o.scale = v; invalidate(); renderPanel(); }),
        slider('Nitidez', 'sharp', o, 0, 100, 1, v => v + '%', invalidate), slider('Limpiar ruido', 'denoise', o, 0, 100, 1, v => v + '%', invalidate),
        h('label', { class: 'tog' }, h('span', null, h('b', null, 'Luz y color automáticos'), h('small', { class: 'mute' }, 'Ajusta sombras, luces y saturación')), h('input', { type: 'checkbox', checked: o.auto, onchange: e => { o.auto = e.target.checked; invalidate(); } }), h('i')),
        h('p', { class: 'mute small' }, 'Mejora con filtros avanzados que afinan, limpian y escalan tu archivo. No es inteligencia artificial: no inventa detalles que no existen. ' + (kind === 'video' ? 'El video se procesa en tiempo real: un video de 1 minuto tarda cerca de 1 minuto. Mantené esta pantalla abierta.' : '')));
    } else if (tab === 'aspect') {
      panel.append(...[
        chips(RATIOS, o.aspect, v => { o.aspect = v; invalidate(); renderPanel(); }),
        o.aspect ? chips([['Recortar para llenar', 'crop'], ['Agregar bordes', 'bars']], o.fit, v => { o.fit = v; invalidate(); renderPanel(); }) : null,
        o.aspect && o.fit === 'bars' ? chips([['Desenfocado', 'blur'], ['Negro', 'black'], ['Blanco', 'white']], o.bars, v => { o.bars = v; invalidate(); renderPanel(); }) : null,
        o.aspect && o.fit === 'crop' ? h('div', { class: 'stack' }, slider('Mover encuadre ↔', 'fx', o, 0, 1, .01, v => Math.round(v * 100) + '%', invalidate), slider('Mover encuadre ↕', 'fy', o, 0, 1, .01, v => Math.round(v * 100) + '%', invalidate)) : null,
        kind === 'video' ? h('p', { class: 'mute small' }, 'Se genera un video nuevo en tiempo real. Mantené esta pantalla abierta.') : null].filter(Boolean));
    } else {
      if (kind === 'image') panel.append(
        h('div', { class: 'lbl' }, 'Tamaño máximo'), chips([['Original', null], ['4K', 3840], ['Full HD', 1920], ['HD', 1280], ['Chica', 800]], o.maxSide, v => { o.maxSide = v; invalidate(); renderPanel(); }),
        slider('Calidad', 'q', o, 40, 100, 1, v => v + '%', invalidate),
        h('div', { class: 'lbl' }, 'Formato'), chips([['JPG', 'jpeg'], ['WebP (más liviano)', 'webp']], o.fmt === 'png' ? 'jpeg' : o.fmt, v => { o.fmt = v; invalidate(); renderPanel(); }));
      else if (kind === 'video') panel.append(
        h('div', { class: 'lbl' }, 'Resolución'), chips([['Original', null], ['1080p', 1920], ['720p', 1280], ['480p', 854]], o.vres, v => { o.vres = v; o.maxSide = v; invalidate(); renderPanel(); }),
        h('div', { class: 'lbl' }, 'Calidad'), chips([['Alta', .1], ['Media', .06], ['Baja (muy liviano)', .03]], o.vq, v => { o.vq = v; invalidate(); renderPanel(); }),
        h('p', { class: 'mute small' }, 'Se procesa en tiempo real. Mantené esta pantalla abierta.'));
      else panel.append(h('p', { class: 'mute' }, 'Se comprime en un archivo .gz (gzip). Funciona muy bien con texto, CSV, documentos sin comprimir y código. En PDF, Word y archivos ya comprimidos el ahorro suele ser chico.'));
    }
  }

  // ---- acciones
  function renderActions() {
    actions.replaceChildren();
    if (running) { actions.append(h('button', { class: 'btn ghost', onclick: () => { if (ctl) { ctl.cancelled = true; ctl.stop?.(); } } }, 'Cancelar')); return; }
    if (!result) { actions.append(h('button', { class: 'btn', onclick: run }, ic('wand', 18), kind === 'video' || kind === 'image' ? 'Procesar' : 'Comprimir')); return; }
    actions.append(
      h('button', { class: 'btn', onclick: () => save('copy') }, ic('check', 18), 'Guardar como copia'),
      h('button', { class: 'btn ghost', onclick: () => save('replace') }, 'Reemplazar el original'),
      h('button', { class: 'btn ghost', onclick: () => saveFile(result.blob, result.name) }, ic('share', 18), 'Descargar'));
  }
  const newName = (b, kindTag) => {
    const ext = b.type.includes('mp4') ? 'mp4' : b.type.includes('webm') ? 'webm' : b.type.includes('png') ? 'png' : b.type.includes('webp') ? 'webp' : b.type.includes('jpeg') ? 'jpg' : b.type.includes('gzip') ? 'gz' : (name.split('.').pop() || 'bin');
    return b.type.includes('gzip') ? name + '.gz' : `${baseName(name)} (${kindTag}).${ext}`;
  };
  async function run() {
    await ready.catch(() => {}); if (media && !src) return toast('No se puede leer este archivo en este navegador (por ejemplo HEIC).', 4500);
    running = true; ctl = { cancelled: false }; renderActions(); bar.hidden = false; bar.firstChild.style.width = '0%'; info.textContent = 'Procesando…';
    try {
      const op = buildOpts(); let r;
      if (kind === 'image') r = await processImage(blob, op);
      else if (kind === 'video') {
        const p = plan(src.w, src.h, { ...op, maxPx: 3840 * 2160 });
        const srcBr = blob.size * 8 / (src.dur || 1);
        op.bitrate = tab === 'compress' ? Math.max(3e5, p.ow * p.oh * 30 * o.vq) : Math.min(40e6, Math.max(op.bitrate, srcBr * 1.1));
        r = await processVideo(blob, op, f => { bar.firstChild.style.width = Math.round(f * 100) + '%'; info.textContent = `Procesando… ${Math.round(f * 100)}%`; }, ctl);
      } else { const g = await gzip(blob); r = { blob: new Blob([g], { type: 'application/gzip' }) }; }
      const tag = tab === 'quality' ? 'mejorada' : tab === 'aspect' ? `relación ${(RATIOS.find(x => x[1] === o.aspect) || ['original'])[0].replace(':', '-')}` : 'comprimida';
      result = { ...r, url: URL.createObjectURL(r.blob), name: newName(r.blob, tag) }; view = 'after';
      const pct = Math.round((1 - r.blob.size / blob.size) * 100);
      info.textContent = `${srcLine()}  →  Nuevo: ${r.w ? dimsText(r.w, r.h) + ' · ' : ''}${fmtSize(r.blob.size)} (${pct >= 0 ? '−' + pct : '+' + Math.abs(pct)}%)${r.limited ? ' · limitado por el navegador' : ''}${r.note ? ' · ' + r.note : ''}`;
      if (tab === 'compress' && pct < 3 && !media) toast('Este archivo ya estaba comprimido: casi no se redujo.', 4000);
    } catch (e) { info.textContent = srcLine(); if (e.message !== 'Cancelado') toast(e.message || 'No se pudo procesar', 4500); }
    running = false; ctl = null; bar.hidden = true; renderActions(); drawStage(); renderCompare();
  }
  const cmp = h('div', { class: 'seg', hidden: true });
  function renderCompare() {
    cmp.hidden = !(result && media);
    cmp.replaceChildren(...[['before', 'Antes'], ['after', 'Después']].map(([k, l]) => h('button', { class: 'chip' + (view === k ? ' on' : ''), onclick: () => { view = k; drawStage(); renderCompare(); } }, l)));
  }
  async function save(mode) { try { await onSave({ blob: result.blob, name: result.name, mode }); toast(mode === 'copy' ? 'Guardado como copia' : 'Original reemplazado'); close(); } catch (e) { toast(e.message || 'No se pudo guardar', 4000); } }
  const close = () => { if (running) { ctl && (ctl.cancelled = true, ctl.stop?.()); } if (result) URL.revokeObjectURL(result.url); if (src?.url) URL.revokeObjectURL(src.url); ov.close(); };

  const ov = overlay(h('div', { class: 'editor lab' },
    h('div', { class: 'ed-top' }, h('button', { class: 'btn ghost', onclick: close }, ic('x', 18), 'Cerrar'), h('b', null, 'Mejorar y convertir'), h('span', { style: { width: '80px' } })),
    stage, cmp, info, bar, tabs, panel, actions), { cls: 'full' });
  renderTabs(); renderPanel(); renderActions(); info.textContent = srcLine();
  ready.then(() => { info.textContent = srcLine(); renderPanel(); drawStage(); }).catch(e => { stage.replaceChildren(h('p', { class: 'mute pad' }, 'No se puede leer este archivo en este navegador (por ejemplo, fotos HEIC fuera de Safari). ' + (e.message || ''))); });
  if (!media) drawStage();
}
