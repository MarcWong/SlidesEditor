/* Where decks and media live. With the Node server (npm start) they are files
   under data/; without it (e.g. GitHub Pages) they live in this browser's
   IndexedDB. Both keep the same deck JSON with "media/<file>" paths, so decks
   move between the two through export / import.
   Usage: const Store = await CAIStore.ready; */
(() => {
  const enc = encodeURIComponent;

  async function api(url, opt) {
    const r = await fetch(url, opt);
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.error || r.statusText);
    return body;
  }

  const server = {
    mode: 'server',
    list: () => api('api/decks'),
    load: name => api('api/deck/' + enc(name)),
    save: (name, deck) => api('api/deck/' + enc(name), {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(deck)
    }),
    remove: name => api('api/deck/' + enc(name), { method: 'DELETE' }),
    upload: async file => (await api('api/upload', {
      method: 'POST', headers: { 'X-Filename': enc(file.name) }, body: file
    })).src,
    url: src => src
  };

  /* ---- Browser storage: IndexedDB stores "decks" {name, deck} and "media" {name, blob} ---- */
  let db;
  function open() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('cai-slides', 1);
      r.onupgradeneeded = () => {
        r.result.createObjectStore('decks', { keyPath: 'name' });
        r.result.createObjectStore('media', { keyPath: 'name' });
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  // Run one request on a store and resolve with its result
  function req(store, mode, fn) {
    return new Promise((res, rej) => {
      const tx = db.transaction(store, mode);
      const r = fn(tx.objectStore(store));
      tx.oncomplete = () => res(r.result);
      tx.onerror = tx.onabort = () => rej(tx.error || new Error('IndexedDB error'));
    });
  }

  const urls = new Map();   // "media/<file>" → blob: URL
  const mediaName = orig => {
    const dot = orig.lastIndexOf('.');
    const ext = dot > 0 ? orig.slice(dot).toLowerCase().replace(/[^.\w]/g, '') : '.bin';
    const base = (dot > 0 ? orig.slice(0, dot) : orig).replace(/[^\w\-]+/g, '_').slice(0, 40) || 'file';
    return `${base}-${Math.random().toString(16).slice(2, 8)}${ext}`;
  };
  const mediaSrcs = deck => (deck.slides || []).flatMap(s => (s.elements || []).map(e => e.src))
    .filter(src => typeof src === 'string' && src.startsWith('media/'));

  let persisted = false;
  const local = {
    mode: 'local',
    list: async () => (await req('decks', 'readonly', s => s.getAllKeys())).sort(),
    load: async name => {
      const rec = await req('decks', 'readonly', s => s.get(name));
      return rec ? rec.deck : null;
    },
    save: async (name, deck) => {
      // ask the browser not to evict this site's data when space runs low
      if (!persisted && navigator.storage && navigator.storage.persist) { persisted = true; navigator.storage.persist(); }
      await req('decks', 'readwrite', s => s.put({ name, deck, updated: Date.now() }));
    },
    // Delete a deck and every media file no other deck uses
    remove: async name => {
      await req('decks', 'readwrite', s => s.delete(name));
      const used = new Set((await req('decks', 'readonly', s => s.getAll())).flatMap(r => mediaSrcs(r.deck)));
      for (const key of await req('media', 'readonly', s => s.getAllKeys())) {
        if (used.has('media/' + key)) continue;
        await req('media', 'readwrite', s => s.delete(key));
        URL.revokeObjectURL(urls.get('media/' + key));
        urls.delete('media/' + key);
      }
    },
    upload: async file => {
      // the same file imported again reuses the stored copy
      const same = await req('media', 'readonly', s => s.get(file.name));
      if (same && same.blob.size === file.size) return 'media/' + file.name;
      // names that already carry a suffix (from an export) are kept when free
      const name = !same && /^[\w\-]+-[0-9a-f]{6}\.\w+$/.test(file.name) ? file.name : mediaName(file.name);
      const blob = new Blob([file], { type: file.type });
      await req('media', 'readwrite', s => s.put({ name, blob }));
      urls.set('media/' + name, URL.createObjectURL(blob));
      return 'media/' + name;
    },
    url: src => urls.get(src) || src
  };

  async function initLocal() {
    db = await open();
    for (const m of await req('media', 'readonly', s => s.getAll())) urls.set('media/' + m.name, URL.createObjectURL(m.blob));
    return local;
  }

  // The server answers api/decks with JSON; a static host (GitHub Pages) does not
  async function detect() {
    try {
      const r = await fetch('api/decks', { cache: 'no-store' });
      if (r.ok && /json/.test(r.headers.get('content-type') || '')) return server;
    } catch {}
    return initLocal();
  }

  // Point media/… references in page HTML at where the files really are
  const withMedia = (Store, html) => window.CAIRender.mapAssets(html, rel => {
    const u = Store.url(rel);
    return u !== rel && u;
  });

  window.CAIStore = { ready: detect(), withMedia, mediaSrcs };
})();
