// Static build for hosting without the server (GitHub Pages): npm run build → _site/
// The editor detects that there is no server and keeps decks in the browser.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const OUT = path.join(ROOT, '_site');
fs.rmSync(OUT, { recursive: true, force: true });
const copy = (from, to) => fs.cpSync(path.join(ROOT, from), path.join(OUT, to), { recursive: true });
copy('public', '.');
copy('template', 'template');
copy('template/figures', 'figures');
copy('shared', 'shared');
fs.rmSync(path.join(OUT, 'template', 'index.html'));      // the hand-written sample is not part of the site

// ?v=<content hash> on local scripts / styles, so a deploy never mixes old and new files
const LOCAL_REF = /((?:src|href)=")([\w\-/]+\.(?:js|css))"/g;
for (const page of fs.readdirSync(OUT).filter(f => f.endsWith('.html'))) {
  const file = path.join(OUT, page);
  const html = fs.readFileSync(file, 'utf8').replace(LOCAL_REF, (m, a, r) => {
    const f = path.join(OUT, r);
    if (!fs.existsSync(f)) return m;
    const v = crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex').slice(0, 8);
    return `${a}${r}?v=${v}"`;
  });
  fs.writeFileSync(file, html);
}
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
console.log('Static site written to _site/');
