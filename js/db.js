// Base de datos local (IndexedDB). Los archivos se guardan tal cual, sin tocar ni un byte.
const STORES = ['chats', 'items', 'events', 'blobs', 'meta'];
let _db;
export const db = () => _db ||= new Promise((ok, no) => {
  const r = indexedDB.open('notis', 1);
  r.onupgradeneeded = () => {
    for (const s of STORES) {
      const st = r.result.createObjectStore(s, { keyPath: 'id' });
      if (s === 'items') st.createIndex('chatId', 'chatId');
    }
  };
  r.onsuccess = () => ok(r.result);
  r.onerror = () => no(r.error);
});
async function tx(store, mode, fn) {
  const d = await db();
  return new Promise((ok, no) => {
    const t = d.transaction(store, mode);
    let out;
    const rq = fn(t.objectStore(store));
    if (rq) rq.onsuccess = () => out = rq.result;
    t.oncomplete = () => ok(out);
    t.onerror = t.onabort = () => no(t.error);
  });
}
export const get = (s, id) => tx(s, 'readonly', st => st.get(id));
export const put = (s, o) => tx(s, 'readwrite', st => st.put(o));
export const del = (s, id) => tx(s, 'readwrite', st => st.delete(id));
export const all = s => tx(s, 'readonly', st => st.getAll());
export const keys = s => tx(s, 'readonly', st => st.getAllKeys());
export const byChat = id => tx('items', 'readonly', st => st.index('chatId').getAll(id));
export const clearAll = async () => { for (const s of STORES) await tx(s, 'readwrite', st => st.clear()); };
export const uid = () => crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);

// Eventos de cambio (para sincronizar)
const subs = new Set();
export const onChange = f => subs.add(f);
export const touch = () => subs.forEach(f => f());

export async function save(store, obj) { obj.updated = Date.now(); await put(store, obj); touch(); return obj; }
export async function remove(store, obj) { obj.deleted = true; obj.updated = Date.now(); await put(store, obj); touch(); }
