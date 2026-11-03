/* offline cache: audio blobs in indexeddb, lru-evicted under a size cap */
const DB = "play-cache", STORE = "audio", META = "meta";
const MAX_BYTES = 300 * 1024 * 1024;

let dbp = null;
function db() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: "id" });
      if (!d.objectStoreNames.contains(META)) d.createObjectStore(META, { keyPath: "id" });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  dbp.catch(() => { dbp = null; });
  return dbp;
}
function tx(store, mode, fn) {
  return db().then((d) => new Promise((resolve, reject) => {
    const t = d.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => resolve(req && req.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}
/* sizes only, without pulling every blob into memory */
async function sizes() {
  const out = [];
  await db().then((d) => new Promise((resolve, reject) => {
    const t = d.transaction(STORE, "readonly");
    const c = t.objectStore(STORE).openCursor();
    c.onsuccess = () => {
      const cur = c.result;
      if (!cur) return;
      out.push({ id: cur.value.id, size: cur.value.size || 0, lastUsed: cur.value.lastUsed || 0 });
      cur.continue();
    };
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
  }));
  return out;
}

export const cache = {
  MAX_BYTES,
  async get(id) {
    try {
      const rec = await tx(STORE, "readonly", (s) => s.get(id));
      if (!rec || !rec.blob || !rec.blob.size) return null;
      rec.lastUsed = Date.now();
      tx(STORE, "readwrite", (s) => s.put(rec)).catch(() => {});
      return rec.blob;
    } catch (e) { return null; }
  },
  async has(id) {
    try { return !!(await tx(STORE, "readonly", (s) => s.getKey(id))); } catch (e) { return false; }
  },
  async put(id, blob) {
    const size = blob.size || 0;
    if (!size || size > MAX_BYTES / 2) return false;
    try {
      const all = await sizes();
      let total = all.reduce((a, x) => a + x.size, 0);
      all.sort((a, b) => a.lastUsed - b.lastUsed);
      for (const x of all) {
        if (total + size <= MAX_BYTES) break;
        await tx(STORE, "readwrite", (s) => s.delete(x.id));
        total -= x.size;
      }
      await tx(STORE, "readwrite", (s) => s.put({ id, blob, size, addedAt: Date.now(), lastUsed: Date.now() }));
      return true;
    } catch (e) { return false; }
  },
  async remove(id) {
    await tx(STORE, "readwrite", (s) => s.delete(id)).catch(() => {});
    await tx(META, "readwrite", (s) => s.delete(id)).catch(() => {});
  },
  async clear() {
    await tx(STORE, "readwrite", (s) => s.clear()).catch(() => {});
    await tx(META, "readwrite", (s) => s.clear()).catch(() => {});
  },
  async stats() {
    try {
      const all = await sizes();
      return { tracks: all.length, bytes: all.reduce((a, x) => a + x.size, 0), maxBytes: MAX_BYTES, ids: new Set(all.map((x) => x.id)) };
    } catch (e) { return { tracks: 0, bytes: 0, maxBytes: MAX_BYTES, ids: new Set() }; }
  },
};
