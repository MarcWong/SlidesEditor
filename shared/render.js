/* Deck JSON → template markup. Shared by the server (export) and the browser
   (editor, preview, import / export). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CAIRender = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const uid = () => Math.random().toString(36).slice(2, 10);

  function elementHTML(e) {
    const pos = `left:${e.x}px;top:${e.y}px;width:${e.w}px;height:${e.h}px;`;
    const cls = e.fragment ? ' fragment' : '';
    const id = ` data-id="${esc(e.id)}"`;
    if (e.type === 'text') {
      const bg = /^#[0-9a-f]{6}$/i.test(e.bg || '') ? e.bg : '';   // optional box background
      const style = pos + `font-size:${e.fontSize || 38}px;text-align:${e.align || 'left'};` + (bg ? `background:${bg};` : '');
      return `<div class="el el-text v-${e.variant || 'plain'} va-${e.valign || 'top'}${bg ? ' has-bg' : ''}${cls}"${id} style="${style}">` +
        `<div class="el-inner">${e.html || ''}</div></div>`;
    }
    if (e.type === 'image') {
      return `<div class="el el-image${cls}"${id} style="${pos}">` +
        `<img src="${esc(e.src)}" alt="${esc(e.alt)}" style="object-fit:${e.fit || 'contain'}"></div>`;
    }
    if (e.type === 'video') {
      const attrs = [
        e.controls !== false && 'controls',
        e.autoplay && 'autoplay',
        (e.muted || e.autoplay) && 'muted',
        e.loop && 'loop',
        'playsinline', 'preload="metadata"'
      ].filter(Boolean).join(' ');
      return `<div class="el el-video${cls}"${id} style="${pos}">` +
        `<video src="${esc(e.src)}" ${attrs} style="object-fit:${e.fit || 'contain'}"></video></div>`;
    }
    return '';
  }

  // editor=true adds data-field hooks so fields can be edited in place
  function slideHTML(s, editor) {
    const els = (s.elements || []).map(elementHTML).join('');
    const f = name => (editor ? ` data-field="${name}"` : '');
    const sid = ` data-sid="${esc(s.id)}"`;
    const app = s.appendix ? ' appendix' : '';               // unnumbered slide
    const appAttr = s.appendix ? ' data-appendix' : '';
    switch (s.type) {
      case 'title':
        return `<section class="slide title-slide${app}"${sid}>` +
          '<div class="title-graphic"><img src="figures/cai_logo_light.svg" alt="CAI">' +
          '<img src="figures/USTUTT_logo.svg" alt="University of Stuttgart"></div>' +
          `<h1${f('title')}>${s.title || ''}</h1>` +
          `<p class="subtitle"${f('subtitle')}>${s.subtitle || ''}</p>` +
          '<div class="separator"></div>' +
          `<p class="author"${f('author')}>${s.author || ''}</p>` +
          `<p class="date"${f('date')}${s.date ? '' : ' data-today'}>${s.date || ''}</p>` +
          `<p class="institute"${f('institute')}>${s.institute || ''}</p>` +
          els + '</section>';
      case 'section':
        return `<div class="section"${appAttr}${s.outlineTitle ? ` data-outline-title="${esc(s.outlineTitle)}"` : ''} data-title="${esc(s.title)}" data-toc="${esc(s.toc || s.title)}"></div>`;
      case 'subsection':
        return `<div class="subsection"${appAttr} data-title="${esc(s.title)}" data-toc="${esc(s.toc || s.title)}"></div>`;
      case 'standout':
        return `<section class="slide standout${app}"${sid}><div${f('text')}>${s.text || ''}</div>${els}</section>`;
      default:
        return `<section class="slide${app}"${sid}><h2${f('title')}>${s.title || ''}</h2>` +
          `<div class="content free">${els}</div></section>`;
    }
  }

  // Older decks marked one "appendix start"; convert that to per-slide flags
  function normalize(deck) {
    if (deck.appendixStart !== undefined) {
      const i = deck.slides.findIndex(s => s.id === deck.appendixStart);
      if (i >= 0) deck.slides.slice(i).forEach(s => { s.appendix = true; });
      delete deck.appendixStart;
    }
    return deck;
  }

  function deckMarkup(deck, editor) {
    normalize(deck);
    return deck.slides.map(s => slideHTML(s, editor)).join('\n');
  }

  // Settings the runtime reads from the .deck element (as dataset keys)
  function deckData(deck) {
    const m = deck.meta || {};
    return { footer: m.footer || '', outlineTitle: m.outlineTitle || 'Outline', logo: 'figures/cai_logo_small_white.svg' };
  }
  function deckAttrs(deck) {
    const d = deckData(deck);
    return `data-footer="${esc(d.footer)}" data-outline-title="${esc(d.outlineTitle)}" data-logo="${esc(d.logo)}"`;
  }

  // figures/… and media/… paths a page references (data-logo is the title-bar
  // logo, which the runtime inserts later)
  const ASSET_REF = /(src|href|data-logo)="((?:figures|media)\/[^"]+)"/g;
  const assetRefs = html => [...new Set([...html.matchAll(ASSET_REF)].map(m => m[2]))];
  // Replace each referenced asset path with map(path), where it returns a value
  const mapAssets = (html, map) => html.replace(ASSET_REF, (m, a, rel) => {
    const to = map(rel);
    return to ? `${a}="${to}"` : m;
  });

  // The deck JSON travels inside every page, so an export can be imported again
  const DECK_JSON = /<script type="application\/json" id="cai-deck">([\s\S]*?)<\/script>/;
  function embeddedDeck(html) {
    const m = DECK_JSON.exec(html);
    if (!m) return null;
    try {
      const d = JSON.parse(m[1]);
      return d && Array.isArray(d.slides) ? d : null;
    } catch { return null; }
  }

  // Full standalone page. opt.css / opt.js inline the runtime instead of linking
  // it; opt.base is the folder that holds cai-slides.css/js when linked.
  function pageHTML(deck, opt) {
    opt = opt || {};
    const m = deck.meta || {};
    const base = opt.base || '';
    const css = opt.css ? `<style>\n${opt.css}\n</style>` : `<link rel="stylesheet" href="${base}cai-slides.css">`;
    const js = opt.js ? `<script>\n${opt.js}\n<\/script>` : `<script src="${base}cai-slides.js"><\/script>`;
    const data = JSON.stringify(deck).replace(/</g, '\\u003c');
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(m.docTitle || 'CAI Slides')}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fira+Mono&family=Fira+Sans:ital,wght@0,300;0,400;0,500;0,600;1,400&display=swap">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.css">
${css}
</head>
<body>
<main class="deck" ${deckAttrs(deck)}>
${deckMarkup(deck, false)}</main>
<script type="application/json" id="cai-deck">${data}<\/script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.js"><\/script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/contrib/auto-render.min.js"><\/script>
${js}
<script>
  if (window.renderMathInElement) renderMathInElement(document.body, {
    delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }],
    throwOnError: false
  });
<\/script>
</body>
</html>
`;
  }

  function textEl(props) {
    return Object.assign({
      id: uid(), type: 'text', x: 100, y: 180, w: 1400, h: 560,
      fontSize: 38, align: 'left', valign: 'middle', variant: 'plain', fragment: false,
      html: '<p>Double-click to edit</p>'
    }, props);
  }

  function newSlide(type) {
    switch (type) {
      case 'title':
        return {
          id: uid(), type, title: 'Title', subtitle: 'Subtitle', author: 'Author', date: '',
          institute: 'Collaborative Artificial Intelligence Group, University of Stuttgart<br>' +
            '<a class="ext" href="https://www.collaborative-ai.org/" target="_blank">www.collaborative-ai.org</a>',
          elements: []
        };
      case 'section': return { id: uid(), type, title: 'Section Title', toc: 'Section Title' };
      case 'subsection': return { id: uid(), type, title: 'Subsection Title', toc: 'Subsection Title' };
      case 'standout': return { id: uid(), type, text: 'Thank you!<br>Any Questions?', elements: [] };
      default:
        return {
          id: uid(), type: 'content', title: 'Frame Title',
          elements: [textEl({ html: '<ul><li>item 1</li><li>item 2</li><li>item 3</li></ul>' })]
        };
    }
  }

  function defaultDeck() {
    const s = t => newSlide(t);
    const sec1 = Object.assign(s('section'), { title: 'Section 1 Title Name', toc: 'Section ToC Name 1' });
    const sub1 = Object.assign(s('subsection'), { title: 'Subsection 1 Title Name', toc: 'Subsection ToC Name 1' });
    const twoCol = Object.assign(s('content'), {
      title: 'Two Columns',
      elements: [
        textEl({ x: 100, w: 680, html: '<ol><li>First step</li><li>Second step</li><li>Third step</li></ol>' }),
        textEl({ x: 820, w: 680, variant: 'box', valign: 'middle', y: 330, h: 260,
          html: '<p><b>Block</b></p><p>Use the style menu for box / example / alert.</p>' })
      ]
    });
    const sec2 = Object.assign(s('section'), { title: 'Section 2 Title Name', toc: 'Section ToC Name 2' });
    const thanks = Object.assign(s('standout'), { appendix: true });
    const backup = Object.assign(s('content'), {
      title: 'Backup slides', appendix: true,
      elements: [textEl({ html: '<p>Unnumbered slides have no page number or progress bar; the other slides are numbered without them.</p>' })]
    });
    return {
      meta: { docTitle: 'CAI Slides', footer: 'Author – Title', outlineTitle: 'Outline' },
      slides: [s('title'), sec1, s('content'), sub1, twoCol, sec2, s('content'), thanks, backup]
    };
  }

  return {
    esc, uid, normalize, elementHTML, slideHTML, deckMarkup, deckData, pageHTML, newSlide, textEl, defaultDeck,
    assetRefs, mapAssets, embeddedDeck
  };
});
