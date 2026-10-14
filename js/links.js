import { h, ic } from './util.js';

export const ytId = u => (u.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:[^#\s]*&)?v=|shorts\/|embed\/|live\/))([\w-]{11})/) || [])[1];
export const urlsIn = t => [...(t || '').matchAll(/https?:\/\/[^\s<]+/g)].map(m => m[0].replace(/[).,;!?]+$/, ''));

// Previsualización gratis (sin API key): miniatura de YouTube + título vía noembed.com
export async function buildPreview(url) {
  const id = ytId(url);
  let host = ''; try { host = new URL(url).hostname.replace(/^www\./, ''); } catch {}
  const p = { url, host, kind: id ? 'youtube' : 'web', id: id || null, title: '', thumb: id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : '', provider: id ? 'YouTube' : host };
  try {
    const r = await fetch('https://noembed.com/embed?url=' + encodeURIComponent(url));
    const j = await r.json();
    if (j.title) p.title = j.title;
    if (!p.thumb && j.thumbnail_url) p.thumb = j.thumbnail_url;
    if (j.provider_name) p.provider = j.provider_name;
    if (j.author_name) p.author = j.author_name;
  } catch {}
  return p;
}

export function linkCard(p) {
  if (p.kind === 'youtube') {
    const card = h('div', { class: 'lcard yt' });
    const play = () => {
      card.replaceChildren(h('iframe', { src: `https://www.youtube-nocookie.com/embed/${p.id}?autoplay=1&playsinline=1&rel=0`, allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen', allowFullscreen: true, loading: 'lazy' }));
      card.classList.add('playing');
    };
    card.append(
      h('button', { class: 'lthumb', onclick: play, 'aria-label': 'Reproducir' }, h('img', { src: p.thumb, alt: '', loading: 'lazy' }), h('span', { class: 'playbtn' }, ic('play', 26))),
      h('div', { class: 'lmeta' }, h('b', null, p.title || 'Video de YouTube'), h('small', null, [p.author, 'YouTube'].filter(Boolean).join(' · ')),
        h('a', { href: p.url, target: '_blank', rel: 'noopener', class: 'small' }, 'Abrir en YouTube')));
    return card;
  }
  return h('a', { class: 'lcard web', href: p.url, target: '_blank', rel: 'noopener' },
    p.thumb && h('img', { class: 'lthumb2', src: p.thumb, alt: '', loading: 'lazy', onerror: e => e.target.remove() }),
    h('div', { class: 'lmeta' },
      h('div', { class: 'row gap6' }, h('img', { class: 'fav', src: `https://www.google.com/s2/favicons?sz=64&domain=${p.host}`, alt: '', onerror: e => e.target.remove() }), h('small', null, p.provider || p.host)),
      h('b', null, p.title || p.host), h('small', { class: 'url' }, p.url)));
}
