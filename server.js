// CAI slide editor — zero-dependency local server.
//   npm start            → http://localhost:5173
//   PORT=8080 npm start  → custom port
const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const R = require('./shared/render.js');

const PORT = Number(process.env.PORT) || 5173;
const HOST = process.env.HOST || '127.0.0.1';
const ROOT = __dirname;
const PUB = path.join(ROOT, 'public');
const SHARED = path.join(ROOT, 'shared');
const TPL = path.join(ROOT, 'template');             // cai-slides.css/js + figures
const DATA = path.join(ROOT, 'data');
const DECKS = path.join(DATA, 'decks');
const MEDIA = path.join(DATA, 'media');
const EXPORTS = path.join(ROOT, 'exports');
for (const d of [DECKS, MEDIA, EXPORTS]) fs.mkdirSync(d, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.ogv': 'video/ogg', '.mov': 'video/quicktime',
  '.m4v': 'video/mp4', '.pdf': 'application/pdf'
};
const mimeOf = f => MIME[path.extname(f).toLowerCase()] || 'application/octet-stream';
const NAME_RE = /^[\w\-一-鿿]{1,64}$/;

// Resolve rel inside base; null if it escapes base
function inside(base, rel) {
  const p = path.resolve(base, rel);
  return p === base || p.startsWith(base + path.sep) ? p : null;
}

function send(res, code, body, type = 'text/plain; charset=utf-8', extra = {}) {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', ...extra });
  res.end(body);
}
const json = (res, obj, code = 200) => send(res, code, JSON.stringify(obj), MIME['.json']);

// Static file with Range support (needed for video seeking, esp. Safari)
async function sendFile(req, res, file) {
  let st;
  try { st = await fsp.stat(file); } catch { return send(res, 404, 'Not found'); }
  if (!st.isFile()) return send(res, 404, 'Not found');
  const headers = { 'Content-Type': mimeOf(file), 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' };
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
  if (m) {
    const start = m[1] ? Number(m[1]) : Math.max(0, st.size - Number(m[2]));
    const end = m[1] && m[2] ? Math.min(Number(m[2]), st.size - 1) : st.size - 1;
    if (start >= st.size || start > end) return send(res, 416, '', 'text/plain', { 'Content-Range': `bytes */${st.size}` });
    res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 });
    fs.createReadStream(file, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { ...headers, 'Content-Length': st.size });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  }
}

function readBody(req, limit = 50 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on('data', c => {
      n += c.length;
      if (n > limit) { reject(new Error('Body too large')); req.destroy(); } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const deckFile = name => path.join(DECKS, name + '.json');
async function loadDeck(name) {
  try { return JSON.parse(await fsp.readFile(deckFile(name), 'utf8')); }
  catch { return R.defaultDeck(); }
}

// Files a page needs, relative to the exported index.html
function assetPath(rel) {
  if (rel.startsWith('media/')) return inside(MEDIA, rel.slice(6));
  return inside(TPL, rel);
}
// figures/… and media/… paths a page references (data-logo is the title-bar
// logo, which the runtime inserts later)
const ASSET_REF = /(src|href|data-logo)="((?:figures|media)\/[^"]+)"/g;
const assetRefs = html => [...new Set([...html.matchAll(ASSET_REF)].map(m => m[2]))];

async function exportFolder(name) {
  const deck = await loadDeck(name);
  const html = R.pageHTML(deck);
  const d = new Date(), p2 = n => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
  const dir = path.join(EXPORTS, `${name}-${stamp}`);
  // the runtime plus every logo / media file the page references
  for (const rel of ['cai-slides.css', 'cai-slides.js', ...assetRefs(html)]) {
    const src = assetPath(rel);
    if (!src) continue;
    await fsp.mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
    await fsp.copyFile(src, path.join(dir, rel)).catch(() => {});
  }
  await fsp.writeFile(path.join(dir, 'index.html'), html);
  return dir;
}

async function exportSingle(name) {
  const deck = await loadDeck(name);
  const css = await fsp.readFile(path.join(TPL, 'cai-slides.css'), 'utf8');
  const js = await fsp.readFile(path.join(TPL, 'cai-slides.js'), 'utf8');
  const html = R.pageHTML(deck, { css, js });
  const inlined = {};
  for (const rel of assetRefs(html)) {
    const file = assetPath(rel);
    if (!file) continue;
    try { inlined[rel] = `data:${mimeOf(file)};base64,` + (await fsp.readFile(file)).toString('base64'); } catch {}
  }
  return html.replace(ASSET_REF, (m, a, rel) => inlined[rel] ? `${a}="${inlined[rel]}"` : m);
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://x');
  const p = decodeURIComponent(url.pathname);
  let m;

  // every /api/deck/<name>, /api/export/<name>… and /preview/<name>… route
  const deckRoute = /^\/(?:api\/deck|api\/export|preview)\/([^/]+)/.exec(p);
  if (deckRoute && !NAME_RE.test(deckRoute[1])) return json(res, { error: 'Invalid deck name' }, 400);

  // ---- API ----
  if (p === '/api/decks' && req.method === 'GET') {
    const names = (await fsp.readdir(DECKS)).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5));
    return json(res, names.sort());
  }
  if ((m = /^\/api\/deck\/([^/]+)$/.exec(p))) {
    const name = m[1];
    if (req.method === 'GET') return json(res, await loadDeck(name));
    if (req.method === 'PUT') {
      const deck = JSON.parse((await readBody(req)).toString('utf8'));
      if (!deck || !Array.isArray(deck.slides)) return json(res, { error: 'Invalid deck' }, 400);
      const tmp = deckFile(name) + '.tmp';
      await fsp.writeFile(tmp, JSON.stringify(deck, null, 1));
      await fsp.rename(tmp, deckFile(name));
      return json(res, { ok: true });
    }
  }
  if (p === '/api/upload' && req.method === 'POST') {
    const orig = decodeURIComponent(req.headers['x-filename'] || 'file');
    const ext = path.extname(orig).toLowerCase().replace(/[^.\w]/g, '') || '.bin';
    const base = path.basename(orig, path.extname(orig)).replace(/[^\w\-]+/g, '_').slice(0, 40) || 'file';
    const fname = `${base}-${crypto.randomBytes(3).toString('hex')}${ext}`;
    const out = fs.createWriteStream(path.join(MEDIA, fname));
    req.pipe(out);
    out.on('finish', () => json(res, { src: 'media/' + fname }));
    out.on('error', e => json(res, { error: e.message }, 500));
    return;
  }
  if ((m = /^\/api\/export\/([^/]+)(\/single)?$/.exec(p))) {
    const name = m[1];
    if (m[2]) {
      const html = await exportSingle(name);
      return send(res, 200, html, MIME['.html'], {
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}.html`
      });
    }
    if (req.method === 'POST') return json(res, { dir: await exportFolder(name) });
  }

  // ---- Live preview: /preview/<deck>/ ----
  if ((m = /^\/preview\/([^/]+)\/(.*)$/.exec(p))) {
    const [, name, rest] = m;
    if (rest === '' || rest === 'index.html') return send(res, 200, R.pageHTML(await loadDeck(name)), MIME['.html']);
    const file = assetPath(rest);
    return file ? sendFile(req, res, file) : send(res, 404, 'Not found');
  }
  if ((m = /^\/preview\/([^/]+)$/.exec(p))) return send(res, 302, '', 'text/plain', { Location: p + '/' + url.search });

  // ---- Static ----
  if (p === '/' || p === '/index.html') return send(res, 200, await editorPage(), MIME['.html']);
  const file = staticFile(p);
  return file ? sendFile(req, res, file) : send(res, 404, 'Not found');
}

function staticFile(p) {
  if (p.startsWith('/media/')) return inside(MEDIA, p.slice(7));
  if (p.startsWith('/figures/')) return inside(path.join(TPL, 'figures'), p.slice(9));
  if (p.startsWith('/template/')) return inside(TPL, p.slice(10));
  if (p.startsWith('/shared/')) return inside(SHARED, p.slice(8));
  return inside(PUB, p.slice(1));
}

// Editor page with ?v=<mtime> on its scripts/styles, so a reload never mixes
// an old cached file with a new one (e.g. editor.js and i18n.js out of sync)
async function editorPage() {
  const html = await fsp.readFile(path.join(PUB, 'index.html'), 'utf8');
  const refs = [...new Set([...html.matchAll(/(?:src|href)="(\/[^"?]+\.(?:js|css))"/g)].map(m => m[1]))];
  const ver = {};
  for (const r of refs) {
    const f = staticFile(r);
    ver[r] = f ? await fsp.stat(f).then(s => Math.round(s.mtimeMs).toString(36), () => '') : '';
  }
  return html.replace(/((?:src|href)=")(\/[^"?]+\.(?:js|css))"/g, (m, a, r) => ver[r] ? `${a}${r}?v=${ver[r]}"` : m);
}

const server = http.createServer((req, res) => {
  handle(req, res).catch(e => {
    console.error(e);
    if (!res.headersSent) json(res, { error: e.message }, 500);
  });
});

// If the port is taken (e.g. another `npm start`), try the next ones
const MAX_TRIES = 50;
let port = PORT;
function onError(e) {
  if (e.code === 'EADDRINUSE' && port < PORT + MAX_TRIES) {
    console.log(`Port ${port} is in use, trying ${port + 1}…`);
    server.listen(++port, HOST);
  } else {
    console.error(e.message);
    process.exit(1);
  }
}
server.on('error', onError);
server.once('listening', () => {
  server.off('error', onError);
  console.log(`CAI slide editor running at http://localhost:${port}`);
});
server.listen(port, HOST);
