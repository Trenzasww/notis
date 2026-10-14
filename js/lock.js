// Bloqueo de la app (PIN + Face ID / huella) y contraseña numérica por nota (cifrado AES-GCM).
// El PIN de la app es de ESTE dispositivo y no se sincroniza. La contraseña de una nota cifra su contenido.
import { h, ic } from './util.js';

const KEY = 'notis.lock', ITER = 210000;
export const cfg = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
const save = o => localStorage.setItem(KEY, JSON.stringify({ ...cfg(), ...o }));
export const enabled = () => !!cfg().on;

const te = new TextEncoder(), td = new TextDecoder();
export const b64 = u8 => { const a = new Uint8Array(u8); let s = ''; for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode(...a.subarray(i, i + 0x8000)); return btoa(s); };
const un64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const rnd = n => crypto.getRandomValues(new Uint8Array(n));
const material = pin => crypto.subtle.importKey('raw', te.encode(pin), 'PBKDF2', false, ['deriveBits', 'deriveKey']);
const bits = async (pin, salt) => b64(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: un64(salt), iterations: ITER, hash: 'SHA-256' }, await material(pin), 256));

// ---------------- cifrado de notas
export const newSalt = () => b64(rnd(16));
export async function deriveKey(pin, salt) {
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: un64(salt), iterations: ITER, hash: 'SHA-256' }, await material(pin), { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function encryptText(key, text) {
  const iv = rnd(12);
  return { iv: b64(iv), ct: b64(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, te.encode(text))) };
}
export async function decryptText(key, lock) {
  return td.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: un64(lock.iv) }, key, un64(lock.ct)));
}

// ---------------- PIN de la app
export async function setPin(pin, len) { const salt = newSalt(); save({ on: true, len, salt, ver: await bits(pin, salt) }); }
export async function checkPin(pin) { const c = cfg(); return !!c.on && (await bits(pin, c.salt)) === c.ver; }
export const disable = () => localStorage.removeItem(KEY);
export const setAuto = a => save({ auto: a });

// ---------------- Face ID / huella (WebAuthn, autenticador del dispositivo)
export async function bioAvailable() {
  try { return !!(window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()); } catch { return false; }
}
export const bioLabel = () => /iPhone|iPad/.test(navigator.userAgent) ? 'Face ID' : /Android/.test(navigator.userAgent) ? 'Huella o rostro' : 'Windows Hello / huella';
export async function bioRegister() {
  const cred = await navigator.credentials.create({ publicKey: {
    challenge: rnd(32), rp: { name: 'Notis', id: location.hostname }, user: { id: rnd(16), name: 'notis', displayName: 'Notis' },
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
    authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' }, timeout: 60000, attestation: 'none' } });
  save({ bio: true, cred: b64(cred.rawId) });
}
export const bioOff = () => save({ bio: false, cred: null });
export async function bioAuth() {
  const c = cfg(); if (!c.bio || !c.cred) throw new Error('sin biometría');
  await navigator.credentials.get({ publicKey: { challenge: rnd(32), rpId: location.hostname, allowCredentials: [{ type: 'public-key', id: un64(c.cred) }], userVerification: 'required', timeout: 60000 } });
  return true;
}

// ---------------- teclado numérico (PIN de la app y contraseña de nota)
export function pinPad({ len, title, sub, onComplete, bioBtn }) {
  let val = '', busy = false;
  const dots = h('div', { class: 'pin-dots' }, Array.from({ length: len }, () => h('i')));
  const msg = h('div', { class: 'pin-msg' }, sub || '');
  const draw = () => [...dots.children].forEach((d, i) => d.classList.toggle('on', i < val.length));
  const shake = () => { dots.classList.remove('shake'); void dots.offsetWidth; dots.classList.add('shake'); navigator.vibrate?.([30, 40, 30]); };
  const push = d => {
    if (busy || val.length >= len) return;
    val += d; draw();
    if (val.length === len) {
      busy = true;
      setTimeout(async () => {
        let ok = false; try { ok = await onComplete(val); } catch { ok = false; }
        busy = false;
        if (ok === false) { shake(); val = ''; draw(); }
      }, 130);
    }
  };
  const back = () => { if (!busy) { val = val.slice(0, -1); draw(); } };
  const key = n => h('button', { class: 'pk', type: 'button', onclick: () => push(String(n)) }, String(n));
  const grid = h('div', { class: 'pin-grid' }, [1, 2, 3, 4, 5, 6, 7, 8, 9].map(key), bioBtn || h('span'), key(0),
    h('button', { class: 'pk ghost', type: 'button', 'aria-label': 'Borrar', onclick: back }, ic('back', 22)));
  const el = h('div', { class: 'pinpad' }, title && h('h3', null, title), msg, dots, grid);
  const onKey = e => {
    if (!el.isConnected) return removeEventListener('keydown', onKey);
    if (/^\d$/.test(e.key)) push(e.key); else if (e.key === 'Backspace') back();
  };
  addEventListener('keydown', onKey);
  el.say = t => { msg.textContent = t; };
  el.reset = () => { val = ''; draw(); };
  return el;
}

// ---------------- pantalla de bloqueo
let showing = null, fails = 0, until = 0;
export function showLock() {
  if (showing) return showing;
  const c = cfg(); if (!c.on) return Promise.resolve();
  document.body.classList.add('locked');
  showing = new Promise(done => {
    const el = h('div', { class: 'lockscreen' });
    let pad;
    const unlock = () => { el.classList.add('out'); setTimeout(() => el.remove(), 320); document.body.classList.remove('locked'); fails = 0; showing = null; done(); };
    const tryBio = async () => { try { await bioAuth(); unlock(); } catch { pad?.say('No se pudo verificar. Usá tu PIN.'); } };
    const bio = c.bio ? h('button', { class: 'pk ghost', type: 'button', title: bioLabel(), onclick: tryBio }, ic('faceid', 26)) : null;
    pad = pinPad({ len: c.len || 4, sub: 'Ingresá tu PIN', bioBtn: bio, onComplete: async pin => {
      if (Date.now() < until) { pad.say(`Demasiados intentos. Esperá ${Math.ceil((until - Date.now()) / 1000)} s.`); return false; }
      if (await checkPin(pin)) { unlock(); return true; }
      fails++; if (fails >= 5) { until = Date.now() + 30000 * Math.min(fails - 4, 10); pad.say('Demasiados intentos. Esperá 30 s o más.'); } else pad.say('PIN incorrecto');
      return false;
    } });
    el.append(h('div', { class: 'lock-in' }, h('span', { class: 'logo xl' }, ic('lock', 30)), h('h2', null, 'Notis bloqueado'), pad,
      c.bio ? h('button', { class: 'btn ghost', type: 'button', onclick: tryBio }, ic('faceid', 20), `Usar ${bioLabel()}`) : null));
    document.body.append(el);
    if (c.bio) setTimeout(tryBio, 400);
  });
  return showing;
}
export const lockNow = () => showLock();

// bloqueo automático al salir de la app
export function watch() {
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (!enabled()) return;
    const a = cfg().auto ?? '0';
    if (document.hidden) { hiddenAt = Date.now(); if (a === '0') showLock(); }
    else if (a !== 'never' && a !== '0' && hiddenAt && Date.now() - hiddenAt > (+a) * 60000) showLock();
  });
}
