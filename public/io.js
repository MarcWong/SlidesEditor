/* Export and import in the browser, so they work with or without the server.
   - exportZip / exportSingle: a self-contained presentation (the deck JSON is
     embedded, so both can be imported again)
   - readProject: find decks and their media in .json / .html / .zip files or a folder */
(() => {
  const R = window.CAIRender;
  const MIME = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
    avif: 'image/avif', svg: 'image/svg+xml', mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm',
    ogv: 'video/ogg', mov: 'video/quicktime'
  };
  const ext = path => (/\.(\w+)$/.exec(path) || [])[1]?.toLowerCase() || '';
  const baseName = path => path.split('/').pop();
  const stem = path => baseName(path).replace(/\.[^.]*$/, '');

  /* ---------------- ZIP (stored, no compression: media is compressed already) ---------------- */
  const CRC = new Uint32Array(256).map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    return c;
  });
  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  // files: [{ path, blob }] → zip Blob
  async function zip(files) {
    const parts = [], central = [];
    const d = new Date();
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    let offset = 0;
    for (const { path, blob } of files) {
      const name = new TextEncoder().encode(path);
      const crc = crc32(new Uint8Array(await blob.arrayBuffer()));
      const head = (sig, size) => {
        const b = new DataView(new ArrayBuffer(size));
        b.setUint32(0, sig, true);
        return b;
      };
      // fields shared by the local header (from byte 4) and the central entry (from byte 6)
      const common = (v, at) => {
        v.setUint16(at, 20, true); v.setUint16(at + 2, 0x0800, true);   // version, UTF-8 names
        v.setUint16(at + 4, 0, true); v.setUint16(at + 6, time, true); v.setUint16(at + 8, date, true);
        v.setUint32(at + 10, crc, true); v.setUint32(at + 14, blob.size, true); v.setUint32(at + 18, blob.size, true);
        v.setUint16(at + 22, name.length, true);
      };
      const loc = head(0x04034b50, 30); common(loc, 4);
      const cen = head(0x02014b50, 46); cen.setUint16(4, 20, true); common(cen, 6); cen.setUint32(42, offset, true);
      parts.push(loc, name, blob);
      central.push(cen, name);
      offset += 30 + name.length + blob.size;
    }
    const cdSize = central.reduce((n, p) => n + p.byteLength, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, end], { type: 'application/zip' });
  }

  // zip Blob → [{ path, blob }] (stored and deflated entries)
  async function unzip(file) {
    const tail = new DataView(await file.slice(Math.max(0, file.size - 65557)).arrayBuffer());
    let e = tail.byteLength - 22;
    while (e >= 0 && tail.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error('Not a ZIP file');
    const count = tail.getUint16(e + 10, true);
    const cd = new DataView(await file.slice(tail.getUint32(e + 16, true), tail.getUint32(e + 16, true) + tail.getUint32(e + 12, true)).arrayBuffer());
    const out = [];
    for (let i = 0, p = 0; i < count; i++) {
      const method = cd.getUint16(p + 10, true), size = cd.getUint32(p + 20, true);
      const nLen = cd.getUint16(p + 28, true), xLen = cd.getUint16(p + 30, true), cLen = cd.getUint16(p + 32, true);
      const at = cd.getUint32(p + 42, true);
      const path = new TextDecoder().decode(new Uint8Array(cd.buffer, p + 46, nLen));
      p += 46 + nLen + xLen + cLen;
      if (path.endsWith('/') || /(^|\/)(__MACOSX|\.DS_Store)/.test(path)) continue;
      const lh = new DataView(await file.slice(at, at + 30).arrayBuffer());
      const start = at + 30 + lh.getUint16(26, true) + lh.getUint16(28, true);
      let blob = file.slice(start, start + size);
      if (method === 8) blob = await new Response(blob.stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob();
      else if (method !== 0) continue;
      out.push({ path, blob: new Blob([blob], { type: MIME[ext(path)] || '' }) });
    }
    return out;
  }

  /* ---------------- Export ---------------- */
  function download(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  }
  // A figures/… or media/… file as a Blob (figures come with the template)
  async function asset(Store, rel) {
    const r = await fetch(rel.startsWith('media/') ? Store.url(rel) : 'template/' + rel);
    if (!r.ok) throw new Error(`${rel}: ${r.status}`);
    return r.blob();
  }
  const text = async rel => (await fetch('template/' + rel)).text();
  const dataURL = blob => new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result); fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(blob);
  });

  // <name>.zip holding the folder <name>/ (index.html, runtime, logos, media)
  async function exportZip(Store, name, deck) {
    const html = R.pageHTML(deck);
    const files = [{ path: 'index.html', blob: new Blob([html], { type: 'text/html' }) }];
    for (const rel of ['cai-slides.css', 'cai-slides.js', ...R.assetRefs(html)]) {
      files.push({ path: rel, blob: await asset(Store, rel) });
    }
    download(await zip(files.map(f => ({ ...f, path: `${name}/${f.path}` }))), name + '.zip');
  }

  // One HTML file with the runtime, logos and media inlined
  async function exportSingle(Store, name, deck) {
    const html = R.pageHTML(deck, { css: await text('cai-slides.css'), js: await text('cai-slides.js') });
    const inlined = {};
    for (const rel of R.assetRefs(html)) inlined[rel] = await dataURL(await asset(Store, rel));
    download(new Blob([R.mapAssets(html, rel => inlined[rel])], { type: 'text/html' }), name + '.html');
  }

  /* ---------------- Import ---------------- */
  const IS_MEDIA = /\.(png|jpe?g|gif|webp|avif|svg|mp4|m4v|webm|ogv|mov)$/i;

  // files (from a picker, a folder picker or a drop) → [{ name, deck, media: Map(file name → Blob) }]
  async function readProject(files) {
    const entries = [];
    for (const f of files) {
      const path = f.webkitRelativePath || f.name;
      if (/\.zip$/i.test(f.name)) {
        for (const e of await unzip(f)) entries.push({ path: stem(f.name) + '/' + e.path, blob: e.blob });
      } else entries.push({ path, blob: f });
    }
    // media files anywhere except the template's own figures/
    const media = new Map();
    for (const e of entries) if (IS_MEDIA.test(e.path) && !/(^|\/)figures\//.test(e.path)) media.set(baseName(e.path), e.blob);

    const decks = [];
    for (const e of entries) {
      if (/\.json$/i.test(e.path)) {
        let d = null;
        try { d = JSON.parse(await e.blob.text()); } catch {}
        if (d && Array.isArray(d.slides)) decks.push({ name: stem(e.path), deck: d });
      } else if (/\.html?$/i.test(e.path)) {
        const html = await e.blob.text();
        const d = R.embeddedDeck(html);
        if (!d) continue;
        await mediaFromDataURLs(html, d, media);
        // an exported folder's index.html is named after its folder
        const parts = e.path.split('/');
        const name = /^index\.html?$/i.test(parts[parts.length - 1]) && parts.length > 1 ? parts[parts.length - 2] : stem(e.path);
        decks.push({ name, deck: d });
      }
    }
    return decks.map(d => ({ ...d, media }));
  }

  // A single-file export carries its media as data: URLs; map them back to the deck's media/… paths
  async function mediaFromDataURLs(html, deck, media) {
    if (!/src="data:/.test(html)) return;
    const doc = new DOMParser().parseFromString(html, 'text/html');
    for (const s of deck.slides) for (const el of s.elements || []) {
      if (typeof el.src !== 'string' || !el.src.startsWith('media/') || media.has(baseName(el.src))) continue;
      const node = doc.querySelector(`[data-id="${CSS.escape(el.id)}"] img, [data-id="${CSS.escape(el.id)}"] video`);
      const src = node && node.getAttribute('src');
      if (src && src.startsWith('data:')) media.set(baseName(el.src), await (await fetch(src)).blob());
    }
  }

  const isProjectFile = f => /\.(json|zip|html?)$/i.test(f.name);

  window.CAIIO = { exportZip, exportSingle, readProject, isProjectFile, baseName, MIME, ext };
})();
