/* audio cache: indexeddb blob store with lru eviction. never localstorage. */
(function () {
"use strict";

const DB = "play-cache", STORE = "audio", META = "meta";
const MAX_BYTES = 300 * 1024 * 1024; /* 300mb cap */

let dbp = null;
function db() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore(STORE, { keyPath: "id" });
      d.createObjectStore(META, { keyPath: "id" });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  return dbp;
}
function tx(store, mode, fn) {
  return db().then((d) => new Promise((resolve, reject) => {
    const t = d.transaction(store, mode);
    const s = t.objectStore(store);
    const req = fn(s);
    t.oncomplete = () => resolve(req && req.result);
    t.onerror = () => reject(t.error);
  }));
}

async function usage() {
  try {
    const all = await tx(STORE, "readonly", (s) => s.getAll());
    return (all || []).reduce((a, x) => a + (x.size || 0), 0);
  } catch (e) { return 0; }
}

async function evictIfNeeded(needBytes) {
  const all = (await tx(STORE, "readonly", (s) => s.getAll())) || [];
  let total = all.reduce((a, x) => a + (x.size || 0), 0);
  if (total + needBytes <= MAX_BYTES) return;
  /* lru: oldest lastUsed first */
  all.sort((a, b) => (a.lastUsed || 0) - (b.lastUsed || 0));
  for (const x of all) {
    await tx(STORE, "readwrite", (s) => s.delete(x.id));
    await tx(META, "readwrite", (s) => s.delete(x.id)).catch(() => {});
    total -= x.size || 0;
    if (total + needBytes <= MAX_BYTES) break;
  }
}

const cache = {
  async get(id) {
    try {
      const rec = await tx(STORE, "readonly", (s) => s.get(id));
      if (!rec || !rec.blob) return null;
      /* touch */
      rec.lastUsed = Date.now();
      await tx(STORE, "readwrite", (s) => s.put(rec)).catch(() => {});
      return rec.blob;
    } catch (e) { return null; }
  },

  async put(id, blob, track) {
    const size = blob.size || 0;
    if (!size) return false;
    try {
      await evictIfNeeded(size);
      await tx(STORE, "readwrite", (s) =>
        s.put({ id, blob, size, addedAt: Date.now(), lastUsed: Date.now() }));
      if (track) {
        await tx(META, "readwrite", (s) =>
          s.put({ id, track, cachedAt: Date.now() })).catch(() => {});
      }
      return true;
    } catch (e) {
      /* quota or other failure: try one aggressive evict, then give up quietly */
      try {
        const all = (await tx(STORE, "readonly", (s) => s.getAll())) || [];
        all.sort((a, b) => (a.lastUsed || 0) - (b.lastUsed || 0));
        for (const x of all.slice(0, Math.ceil(all.length / 2))) {
          await tx(STORE, "readwrite", (s) => s.delete(x.id));
        }
        await tx(STORE, "readwrite", (s) =>
          s.put({ id, blob, size, addedAt: Date.now(), lastUsed: Date.now() }));
        return true;
      } catch (e2) { return false; }
    }
  },

  async has(id) {
    try {
      const rec = await tx(STORE, "readonly", (s) => s.get(id));
      return !!(rec && rec.blob);
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
    const all = (await tx(STORE, "readonly", (s) => s.getAll()).catch(() => [])) || [];
    return {
      tracks: all.length,
      bytes: all.reduce((a, x) => a + (x.size || 0), 0),
      maxBytes: MAX_BYTES,
    };
  },

  usage,
};

window.Play.cache = cache;
})();
