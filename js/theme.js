// Paletas (nombre, acento, acento 2, neutro: 1 = fondo teñido del acento, 0 = gris puro)
export const PALETTES = [
  ['Blanco y Negro', '#111114', '#F5F5F7', 0, 1],
  ['Amarillo y Negro', '#FFD60A', '#FFB300', 0], ['Google', '#4285F4', '#EA4335', 1], ['iOS Azul', '#0A84FF', '#5E5CE6', 1],
  ['iOS Verde', '#30D158', '#64D2FF', 1], ['iOS Naranja', '#FF9F0A', '#FF453A', 1], ['Medianoche', '#7C83FF', '#B07CFF', 1],
  ['Océano', '#0EA5E9', '#22D3EE', 1], ['Bosque', '#22C55E', '#84CC16', 1], ['Atardecer', '#FB7185', '#F59E0B', 1],
  ['Sakura', '#F472B6', '#FDA4AF', 1], ['Lavanda', '#A78BFA', '#C4B5FD', 1], ['Menta', '#2DD4BF', '#34D399', 1],
  ['Fuego', '#EF4444', '#F97316', 1], ['Café', '#B45309', '#D97706', 1], ['Grafito', '#94A3B8', '#CBD5E1', 0],
  ['Neón', '#39FF14', '#00E5FF', 0], ['Vaporwave', '#FF71CE', '#01CDFE', 1], ['Drácula', '#BD93F9', '#FF79C6', 1],
  ['Nord', '#88C0D0', '#81A1C1', 1], ['Solarized', '#B58900', '#268BD2', 1], ['Monokai', '#A6E22E', '#F92672', 0],
  ['Gruvbox', '#FABD2F', '#FB4934', 1], ['Tokyo Night', '#7AA2F7', '#BB9AF7', 1], ['Chicle Rosa', '#FF4DA6', '#FFB3D9', 1],
  ['Cielo', '#38BDF8', '#818CF8', 1], ['Lima', '#A3E635', '#FACC15', 1], ['Coral', '#FF7F50', '#FF4D6D', 1],
  ['Uva', '#9333EA', '#C026D3', 1], ['Esmeralda', '#10B981', '#059669', 1], ['Rubí', '#E11D48', '#BE123C', 1],
  ['Zafiro', '#2563EB', '#1D4ED8', 1], ['Ámbar', '#F59E0B', '#D97706', 1], ['Turquesa', '#14B8A6', '#06B6D4', 1],
  ['Oro Rosa', '#E8A598', '#D4A5A5', 1], ['Marte', '#FF5A36', '#FFB020', 1], ['Aurora', '#00F5A0', '#00D9F5', 1],
  ['Cereza', '#D6336C', '#FF8787', 1], ['Hielo', '#A5D8FF', '#D0EBFF', 1], ['Arena', '#D4A373', '#E9C46A', 1],
  ['Oliva', '#9CAF3C', '#C5D86D', 1], ['Vino', '#8E2DE2', '#4A00E0', 1], ['Cobre', '#CD7F32', '#E8A87C', 1],
  ['Jade', '#00A86B', '#7FFFD4', 1], ['Carbón', '#FF6B35', '#F7C59F', 0], ['Pastel', '#FFB5E8', '#B5DEFF', 1],
  ['Retro', '#FF9F1C', '#2EC4B6', 1], ['Cyber', '#FCEE0A', '#00F0FF', 0], ['Matcha', '#8DB580', '#C7E2A6', 1],
  ['Mora', '#7B2CBF', '#C77DFF', 1], ['Mandarina', '#FF8C00', '#FFB347', 1], ['Glaciar', '#00B4D8', '#90E0EF', 1],
  ['Rosa Antiguo', '#C06C84', '#F8B195', 1], ['Selva', '#2D6A4F', '#52B788', 1], ['Noche Índigo', '#5E60CE', '#64DFDF', 1],
  ['Limonada', '#FFE066', '#FF9F68', 1], ['Fresa', '#FF5C8A', '#FF8FA3', 1], ['Galaxia', '#6C5CE7', '#FD79A8', 1],
  ['Caribe', '#00CEC9', '#74B9FF', 1], ['Otoño', '#E17055', '#FDCB6E', 1], ['Primavera', '#55E6C1', '#F8EFBA', 1],
  ['Invierno', '#74B9FF', '#DFE6E9', 1], ['Bubblegum', '#FF9FF3', '#54A0FF', 1], ['Latte', '#C8A27A', '#8B5E3C', 1],
  ['Titanio', '#8E9AAF', '#CBC0D3', 0]
].map(([name, a, b, n, mono]) => ({ name, a, b, n, mono: !!mono }));

export const DEFAULTS = {
  palette: 'Blanco y Negro', mode: 'light', custom: '#FFD60A', custom2: '#FF9F0A', oled: false, boldAll: false,
  v: 3, scale: 1, radius: 18, bubble: 'soft', name: '', blur: 28, wallpaper: true, enterSends: true, updated: 0
};

const KEY = 'notis.settings';
export let settings = { ...DEFAULTS };
let stored = {};
try { stored = JSON.parse(localStorage.getItem(KEY) || '{}'); Object.assign(settings, stored); } catch {}
if (Object.keys(stored).length && (stored.v || 0) < 3) { settings.palette = DEFAULTS.palette; settings.mode = DEFAULTS.mode; settings.v = 3; settings.updated = Date.now(); try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch {} }

const listeners = new Set();
export const onSettings = fn => listeners.add(fn);
export function setSettings(patch, silent) {
  Object.assign(settings, patch);
  if (!silent) settings.updated = Date.now();
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch {}
  applyTheme();
  if (!silent) listeners.forEach(f => f(settings));
}

function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function hexToHsl(hex) {
  let [r, g, b] = hexToRgb(hex).map(v => v / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0;
  if (d) { h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h = Math.round(h * 60); if (h < 0) h += 360; }
  return h;
}
const lum = hex => { const [r, g, b] = hexToRgb(hex).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * b; };

export function currentPalette() {
  if (settings.palette === '__custom') return { name: 'Personalizada', a: settings.custom, b: settings.custom2, n: 1 };
  return PALETTES.find(p => p.name === settings.palette) || PALETTES[0];
}
export function resolvedMode() {
  return settings.mode === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : settings.mode;
}
export function applyTheme() {
  const p0 = currentPalette(), dark = resolvedMode() === 'dark', r = document.documentElement.style;
  const p = p0.mono ? { ...p0, a: dark ? '#F5F5F7' : '#111114', b: dark ? '#B9B9C2' : '#4A4A52' } : p0;
  const hue = hexToHsl(p.a), s = p.n ? 1 : 0;
  const hsl = (sat, l) => `hsl(${hue} ${sat * s}% ${l}%)`;
  const v = dark ? {
    bg: settings.oled ? '#000' : hsl(7, 9.5), side: settings.oled ? '#000' : hsl(7, 11.5), surface: settings.oled ? '#0e0e0f' : hsl(7, 13.5), surface2: settings.oled ? '#1a1a1c' : hsl(7, 18.5),
    text: '#f4f5f8', mute: hsl(8, 64), line: 'rgba(255,255,255,.09)'
  } : {
    bg: hsl(25, 97.5), side: hsl(14, 95), surface: '#ffffff', surface2: hsl(16, 94), text: hsl(30, 11), mute: hsl(8, 42), line: 'rgba(0,0,0,.08)'
  };
  const on = c => lum(c) > .5 ? '#111111' : '#ffffff';
  const set = (k, val) => r.setProperty('--' + k, val);
  Object.entries(v).forEach(([k, val]) => set(k, val));
  set('accent', p.a); set('accent2', p.b); set('on', on(p.a)); set('on2', on(p.b));
  const hb = hexToHsl(p.b);
  const aura = p0.mono ? (dark ? ['#5a5a68', '#34343f', '#7a7a88'] : ['#c4c4d0', '#e8e8f0', '#b0b0be']) : [p.a, `hsl(${(hb + 150) % 360} 68% ${dark ? 46 : 70}%)`, p.b];
  set('aura1', aura[0]); set('aura2', aura[1]); set('aura3', aura[2]); set('blur', (settings.blur ?? 28) + 'px'); set('blur-sm', Math.round((settings.blur ?? 28) * .55) + 'px');
  set('radius', settings.radius + 'px'); set('scale', settings.scale);
  set('wt', settings.boldAll ? 700 : 500);
  document.documentElement.dataset.mode = dark ? 'dark' : 'light';
  document.documentElement.dataset.bubble = settings.bubble;
  document.documentElement.dataset.wall = settings.wallpaper ? '1' : '0';
  const meta = document.querySelector('meta[name=theme-color]');
  if (meta) meta.content = v.bg;
}
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => settings.mode === 'auto' && applyTheme());
applyTheme();
