/* CAI slide editor — vanilla JS, no build step. */
(() => {
  const R = window.CAIRender;
  const W = 1600, H = 900, HEADER = 103, FOOT = 850;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const deckName = new URLSearchParams(location.search).get('deck') || 'default';
  const deckPath = encodeURIComponent(deckName);

  const stage = $('#stage'), area = $('#canvasArea'), thumbs = $('#thumbs'), panel = $('#panel');
  let deck, cur = 0, selId = null, scale = 1, slidesDom = [];
  let undoStack = [], redoStack = [];

  /* ================= Helpers ================= */
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const curSlide = () => deck.slides[cur];
  const hasElements = s => Array.isArray(s.elements);
  const findEl = id => (curSlide().elements || []).find(e => e.id === id);
  const elNode = id => stage.querySelector(`.el[data-id="${CSS.escape(id)}"]`);
  const t = s => I18N.t(s);
  const plain = h => String(h || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ');
  const isFormField = a => !!a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName);
  // Section / subsection slides are generated, so they cannot hold elements
  function canHoldElements() {
    if (hasElements(curSlide())) return true;
    toast(t('章节 / 小节页不能放置元素，请换到内容页'));
    return false;
  }
  // Follow the pointer until release: onMove(ev) on every move, onUp() once at the end
  function trackPointer(onMove, onUp) {
    const up = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', up);
      onUp();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', up);
  }

  async function api(url, opt) {
    const r = await fetch(url, opt);
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.error || r.statusText);
    return body;
  }

  let toastTimer;
  function toast(msg, ms = 2600) {
    const t = $('#toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), ms);
  }
  function status(msg, err) {
    const s = $('#status');
    s.textContent = msg; s.classList.toggle('err', !!err);
  }

  /* ================= Persistence ================= */
  let saveTimer = null, dirty = false;
  const showSaveState = () => status(dirty ? t('未保存…') : t('已保存'));
  function scheduleSave() {
    dirty = true; showSaveState();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 600);
  }
  async function save() {
    clearTimeout(saveTimer);
    try {
      await api('/api/deck/' + deckPath, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(deck)
      });
      dirty = false; showSaveState();
    } catch (e) { status(t('保存失败：') + e.message, true); }
  }
  window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

  /* ================= Undo / change ================= */
  // Write the text of a focused editable straight into the data model
  function commitPendingEdits() {
    const a = document.activeElement;
    if (!a || !stage.contains(a) || !a.isContentEditable) return;
    if (a.matches('.el-inner')) {
      const el = findEl(a.closest('.el').dataset.id);
      if (el) el.html = a.innerHTML;
    } else if (a.dataset.field) {
      const obj = fieldTarget(a);
      if (obj) obj[a.dataset.field] = fieldValue(a);
    }
    a.dataset.orig = a.innerHTML;
  }
  function change(fn) {
    undoStack.push(JSON.stringify(deck));
    if (undoStack.length > 200) undoStack.shift();
    redoStack = [];
    commitPendingEdits();
    fn();
    refresh();
    scheduleSave();
  }
  // Move one snapshot from one history stack to the other
  function restore(from, to) {
    if (!from.length) return;
    to.push(JSON.stringify(deck));
    deck = JSON.parse(from.pop());
    refresh(); scheduleSave();
  }
  const undo = () => restore(undoStack, redoStack);
  const redo = () => restore(redoStack, undoStack);

  /* ================= Rendering ================= */
  function refresh() {
    cur = clamp(cur, 0, deck.slides.length - 1);
    if (selId && !findEl(selId)) selId = null;
    const root = document.createElement('div');
    root.className = 'deck';
    root.setAttribute('data-manual', '');
    Object.assign(root.dataset, R.deckData(deck));
    root.innerHTML = R.deckMarkup(deck, true);
    slidesDom = CAISlides.build(root);
    renderThumbs();
    renderCanvas();
    renderPanel();
    updateToolbar();
  }

  // Slide types in the same order and wording as the "New slide" menu in index.html
  const SLIDE_TYPES = [['title', '标题页'], ['section', '章节页'], ['subsection', '小节页'], ['content', '内容页'], ['standout', '感谢页']];
  const TYPE_LABEL = Object.fromEntries(SLIDE_TYPES.filter(([k]) => k !== 'content'));   // thumbnail badges

  function renderThumbs() {
    thumbs.replaceChildren(...slidesDom.map((sd, i) => {
      const s = deck.slides[i];
      const th = document.createElement('div');
      th.className = 'thumb' + (i === cur ? ' current' : '');
      th.draggable = true;
      th.dataset.index = i;
      th.innerHTML = `<div class="tnum">${i + 1}</div><div class="tbox"><div class="tscale"></div></div>` +
        '<div class="tacts"><button data-tact="dup" title="复制此页">⧉</button>' +
        '<button data-tact="del" title="删除此页">✕</button></div>';
      const clone = sd.cloneNode(true);
      clone.classList.add('active');
      clone.querySelectorAll('video').forEach(v => {
        const ph = document.createElement('div'); ph.className = 'video-ph'; v.replaceWith(ph);
      });
      clone.querySelectorAll('[data-field]').forEach(n => n.removeAttribute('data-field'));
      th.querySelector('.tscale').appendChild(clone);
      const label = TYPE_LABEL[s.type] || '';
      if (label) th.insertAdjacentHTML('beforeend', `<span class="badge">${label}</span>`);
      if (s.appendix) {
        th.insertAdjacentHTML('beforeend', `<span class="badge app" style="left:${label ? 78 : 30}px">不编号</span>`);
      }
      return th;
    }));
    I18N.apply(thumbs);
    const c = thumbs.querySelector('.current');
    if (c) c.scrollIntoView({ block: 'nearest' });
  }

  function renderCanvas() {
    const sd = slidesDom[cur];
    sd.classList.add('active');
    stage.replaceChildren(sd);
    hookGeneratedFields(sd, curSlide());
    sd.querySelectorAll('[data-field]').forEach(n => {
      n.contentEditable = 'true';
      n.spellcheck = false;
      n.dataset.orig = n.innerHTML;
    });
    sd.querySelectorAll('video').forEach(v => { v.autoplay = false; v.pause(); });
    sd.querySelectorAll('a').forEach(a => a.addEventListener('click', e => e.preventDefault()));
    markSelection();
    const s = curSlide();
    $('#canvasNote').textContent =
      s.type === 'section' ? '章节页：Outline 自动生成，点击标题或当前章节名即可编辑' :
      s.type === 'subsection' ? '小节页：点击章节 / 小节标题即可编辑' :
      '双击文本框编辑 · 拖拽移动 · 拖动控制点缩放 · 拖入图片/视频文件即可插入';
    I18N.apply($('#canvasNote'));
  }

  function fitStage() {
    const r = area.getBoundingClientRect(), pad = 28;
    scale = Math.max(0.05, Math.min((r.width - pad * 2) / W, (r.height - pad * 2 - 20) / H));
    stage.style.transform = `scale(${scale})`;
    stage.style.left = (r.width - W * scale) / 2 + 'px';
    stage.style.top = (r.height - 20 - H * scale) / 2 + 'px';
    stage.style.setProperty('--inv', 1 / scale);
  }
  new ResizeObserver(fitStage).observe(area);

  /* ================= Selection ================= */
  function markSelection() {
    $$('.el.selected', stage).forEach(n => {
      n.classList.remove('selected');
      n.querySelectorAll('.handle').forEach(h => h.remove());
    });
    const n = selId && elNode(selId);
    if (!n) return;
    n.classList.add('selected');
    for (const d of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']) {
      const h = document.createElement('div');
      h.className = 'handle ' + d; h.dataset.dir = d;
      n.appendChild(h);
    }
  }
  function select(id) {
    selId = id;
    markSelection(); renderPanel(); updateToolbar();
  }

  /* ================= Snapping ================= */
  function snapLines(exceptId) {
    const xs = [0, 100, W / 2, W - 100, W], ys = [0, HEADER, (HEADER + FOOT) / 2, H / 2, FOOT, H];
    for (const o of curSlide().elements || []) {
      if (o.id === exceptId) continue;
      xs.push(o.x, o.x + o.w / 2, o.x + o.w);
      ys.push(o.y, o.y + o.h / 2, o.y + o.h);
    }
    return { xs, ys };
  }
  function snapAxis(pos, size, lines, offsets) {
    const T = 7 / scale;
    let best = null;
    for (const off of offsets) for (const L of lines) {
      const d = L - (pos + off);
      if (Math.abs(d) <= T && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, L };
    }
    return best ? [pos + best.d, best.L] : [pos, null];
  }
  function showGuides(gx, gy) {
    clearGuides();
    if (gx != null) stage.insertAdjacentHTML('beforeend', `<div class="guide v" style="left:${gx}px"></div>`);
    if (gy != null) stage.insertAdjacentHTML('beforeend', `<div class="guide h" style="top:${gy}px"></div>`);
  }
  const clearGuides = () => $$('.guide', stage).forEach(g => g.remove());

  /* ================= Drag / resize ================= */
  function startDrag(e, id) {
    const el = findEl(id), node = elNode(id);
    const sx = e.clientX, sy = e.clientY, ox = el.x, oy = el.y;
    const lines = snapLines(id);
    let moved = false, nx = ox, ny = oy;
    const move = ev => {
      const dx = (ev.clientX - sx) / scale, dy = (ev.clientY - sy) / scale;
      if (!moved && Math.hypot(dx, dy) * scale < 3) return;
      moved = true;
      nx = ox + dx; ny = oy + dy;
      let gx = null, gy = null;
      if (!ev.altKey) {
        [nx, gx] = snapAxis(nx, el.w, lines.xs, [0, el.w / 2, el.w]);
        [ny, gy] = snapAxis(ny, el.h, lines.ys, [0, el.h / 2, el.h]);
      }
      nx = Math.round(nx); ny = Math.round(ny);
      showGuides(gx, gy);
      node.style.left = nx + 'px'; node.style.top = ny + 'px';
      updateGeomInputs(nx, ny, el.w, el.h);
    };
    trackPointer(move, () => {
      clearGuides();
      if (moved) change(() => { el.x = nx; el.y = ny; });
    });
  }

  function startResize(e, id, dir) {
    const el = findEl(id), node = elNode(id);
    const sx = e.clientX, sy = e.clientY;
    const o = { x: el.x, y: el.y, w: el.w, h: el.h }, ratio = o.w / o.h;
    const lines = snapLines(id);
    let g = { ...o };
    const move = ev => {
      const dx = (ev.clientX - sx) / scale, dy = (ev.clientY - sy) / scale;
      let { x, y, w, h } = o;
      let gx = null, gy = null;
      if (dir.includes('e')) { w = o.w + dx; if (!ev.altKey) { let r; [r, gx] = snapAxis(x + w, 0, lines.xs, [0]); w = r - x; } }
      if (dir.includes('w')) { x = o.x + dx; if (!ev.altKey) [x, gx] = snapAxis(x, 0, lines.xs, [0]); w = o.x + o.w - x; }
      if (dir.includes('s')) { h = o.h + dy; if (!ev.altKey) { let r; [r, gy] = snapAxis(y + h, 0, lines.ys, [0]); h = r - y; } }
      if (dir.includes('n')) { y = o.y + dy; if (!ev.altKey) [y, gy] = snapAxis(y, 0, lines.ys, [0]); h = o.y + o.h - y; }
      const keep = dir.length === 2 && ((el.type !== 'text') !== ev.shiftKey);
      if (keep) {
        if (w / o.w > h / o.h) h = w / ratio; else w = h * ratio;
        if (dir.includes('w')) x = o.x + o.w - w;
        if (dir.includes('n')) y = o.y + o.h - h;
        gx = gy = null;
      }
      w = Math.max(20, w); h = Math.max(20, h);
      g = { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
      showGuides(gx, gy);
      Object.assign(node.style, { left: g.x + 'px', top: g.y + 'px', width: g.w + 'px', height: g.h + 'px' });
      updateGeomInputs(g.x, g.y, g.w, g.h);
    };
    trackPointer(move, () => {
      clearGuides();
      if (g.x !== o.x || g.y !== o.y || g.w !== o.w || g.h !== o.h) change(() => Object.assign(el, g));
    });
  }

  stage.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    // A pending hex value must be applied before this click changes the selection
    // (pointerdown runs before the browser moves focus out of the field)
    const act = document.activeElement;
    if (act && act.matches('.colorpick .hex') && !e.target.closest('.el.editing')) act.blur();
    const handle = e.target.closest('.handle');
    const n = e.target.closest('.el');
    if (n && n.classList.contains('editing') && !handle) return;   // let the caret move
    if (n) {
      e.preventDefault();
      const id = n.dataset.id;
      const a = document.activeElement;
      if (a && stage.contains(a) && a.isContentEditable) a.blur();   // may re-render
      if (selId !== id) select(id);
      if (handle) startResize(e, id, handle.dataset.dir);
      else startDrag(e, id);
      return;
    }
    if (!e.target.closest('[data-field]') && selId) select(null);
  });

  /* ================= In-place text editing ================= */
  function startEdit(id, ev) {
    const n = elNode(id);
    if (!n || !n.classList.contains('el-text')) return;
    if (selId !== id) select(id);
    const inner = n.querySelector('.el-inner');
    n.classList.add('editing');
    inner.contentEditable = 'true';
    inner.spellcheck = false;
    inner.dataset.orig = inner.innerHTML;
    inner.focus();
    const sel = getSelection();
    const r = ev && document.caretRangeFromPoint && document.caretRangeFromPoint(ev.clientX, ev.clientY);
    sel.removeAllRanges();
    if (r && inner.contains(r.startContainer)) sel.addRange(r);
    else { const all = document.createRange(); all.selectNodeContents(inner); sel.addRange(all); }
    updateToolbar();
  }
  // Section / subsection / outline pages are generated by the runtime, so their
  // text gets edit hooks here. data-plain fields store text, not HTML.
  function hookGeneratedFields(sd, s) {
    const hook = (n, key, sid, meta) => {
      if (!n) return;
      n.dataset.field = key;
      n.setAttribute('data-plain', '');
      if (sid) n.dataset.fieldSid = sid;
      if (meta) n.dataset.scope = 'meta';
    };
    // wrap an <li>'s leading text so it can be edited without its nested list
    const textOf = li => {
      const tn = li && li.firstChild;
      if (!tn || tn.nodeType !== 3) return null;
      const span = document.createElement('span');
      li.insertBefore(span, tn);
      span.appendChild(tn);
      return span;
    };
    if (s.type === 'subsection') {
      hook(sd.querySelector('.section-page h3'), 'title');
      const parent = deck.slides.slice(0, cur).reverse().find(x => x.type === 'section');
      if (parent) hook(sd.querySelector('.section-page h2'), 'title', parent.id);
    } else if (s.type === 'section') {
      hook(sd.querySelector('.frametitle h2'), 'outlineTitle');   // per outline page
      const li = sd.querySelector('.toc > li:not(.shaded)');
      hook(textOf(li), 'toc');
      // subsection entries of this section, in slide order
      const subs = [];
      for (const x of deck.slides.slice(cur + 1)) {
        if (x.type === 'section') break;
        if (x.type === 'subsection') subs.push(x);
      }
      if (li) $$(':scope > ul > li', li).forEach((sub, i) => { if (subs[i]) hook(textOf(sub), 'toc', subs[i].id); });
    }
  }
  function fieldTarget(n) {
    if (n.dataset.scope === 'meta') return deck.meta;
    if (n.dataset.fieldSid) return deck.slides.find(x => x.id === n.dataset.fieldSid);
    return curSlide();
  }
  const fieldValue = n => (n.hasAttribute('data-plain') ? n.textContent.trim() : cleanField(n.innerHTML));
  function cleanField(html) {
    return html.replace(/(<br\s*\/?>|\s|&nbsp;)+$/i, '').trim();
  }

  stage.addEventListener('dblclick', e => {
    const n = e.target.closest('.el');
    if (!n) return;
    if (n.classList.contains('el-text')) startEdit(n.dataset.id, e);
    else replaceMedia();
  });

  stage.addEventListener('focusout', e => {
    const node = e.target;
    if (!stage.contains(node)) return;
    if (node.matches('.el-inner') && node.isContentEditable) {
      if (e.relatedTarget && e.relatedTarget.closest('.colorpick')) return;
      endEdit(node);
    } else if (node.dataset.field && node.innerHTML !== node.dataset.orig) {
      const obj = fieldTarget(node), key = node.dataset.field, v = fieldValue(node);
      if (obj) change(() => { obj[key] = v; });
    }
  });
  function endEdit(inner) {
    const n = inner.closest('.el');
    inner.contentEditable = 'false';
    n.classList.remove('editing');
    const html = inner.innerHTML;
    if (html !== inner.dataset.orig) {
      const el = findEl(n.dataset.id);
      change(() => { el.html = html; });
    } else updateToolbar();
  }
  stage.addEventListener('focusin', () => updateToolbar());

  /* ================= Elements ================= */
  function addElement(el) {
    if (!canHoldElements()) return;
    const s = curSlide();
    // cascade if something already sits at the same spot
    while (s.elements.some(o => o.x === el.x && o.y === el.y)) { el.x += 30; el.y += 30; }
    change(() => { s.elements.push(el); selId = el.id; });
  }
  function addText(html) {
    addElement(R.textEl({ x: 400, y: 380, w: 800, h: 140, valign: 'top', html: html || '<p>New text</p>' }));
  }

  async function upload(file) {
    status(`${t('上传')} ${file.name}…`);
    const r = await api('/api/upload', {
      method: 'POST', headers: { 'X-Filename': encodeURIComponent(file.name) }, body: file
    });
    status(t('已上传'));
    return r.src;
  }
  function mediaSize(src, type) {
    return new Promise(res => {
      const done = (w, h) => res(w && h ? [w, h] : (type === 'video' ? [1280, 720] : [800, 600]));
      if (type === 'image') {
        const img = new Image();
        img.onload = () => done(img.naturalWidth, img.naturalHeight);
        img.onerror = () => done();
        img.src = src;
      } else {
        const v = document.createElement('video');
        v.preload = 'metadata';
        v.onloadedmetadata = () => done(v.videoWidth, v.videoHeight);
        v.onerror = () => done();
        v.src = src;
      }
      setTimeout(() => done(), 5000);
    });
  }
  function fitBox(nw, nh, at) {
    const k = Math.min(1, 1000 / nw, 600 / nh);
    const w = Math.round(nw * k), h = Math.round(nh * k);
    let x = at ? at.x - w / 2 : (W - w) / 2;
    let y = at ? at.y - h / 2 : HEADER + (FOOT - HEADER - h) / 2;
    return { x: Math.round(clamp(x, 0, W - w)), y: Math.round(clamp(y, 0, H - h)), w, h };
  }
  async function insertMedia(src, type, at) {
    const [nw, nh] = await mediaSize(src, type);
    const box = fitBox(nw, nh, at);
    const el = { id: R.uid(), type, ...box, src, fit: 'contain', fragment: false };
    if (type === 'image') el.alt = '';
    else Object.assign(el, { controls: true, autoplay: false, loop: false, muted: false });
    addElement(el);
  }
  async function insertFiles(files, at) {
    if (!canHoldElements()) return;
    for (const f of files) {
      const type = f.type.startsWith('image/') ? 'image' : f.type.startsWith('video/') ? 'video' : null;
      if (!type) { toast(t('不支持的文件类型：') + f.name); continue; }
      try {
        const src = await upload(f);
        await insertMedia(src, type, at);
        if (at) { at = { x: at.x + 30, y: at.y + 30 }; }
      } catch (e) { status(t('上传失败：') + e.message, true); }
    }
  }
  function pickFiles(accept, multiple) {
    return new Promise(res => {
      const inp = $('#fileInput');
      inp.accept = accept; inp.multiple = multiple; inp.value = '';
      inp.onchange = () => res([...inp.files]);
      inp.click();
    });
  }
  async function replaceMedia() {
    const el = selId && findEl(selId);
    if (!el || el.type === 'text') return;
    const [f] = await pickFiles(el.type + '/*', false);
    if (!f) return;
    try {
      const src = await upload(f);
      change(() => { el.src = src; });
    } catch (e) { status(t('上传失败：') + e.message, true); }
  }

  function deleteEl() {
    const s = curSlide();
    change(() => { s.elements = s.elements.filter(e => e.id !== selId); selId = null; });
  }
  function duplicateEl(src) {
    const el = { ...JSON.parse(JSON.stringify(src)), id: R.uid(), x: src.x + 30, y: src.y + 30 };
    if (canHoldElements()) change(() => { curSlide().elements.push(el); selId = el.id; });
  }
  function reorderEl(where) {
    const s = curSlide(), i = s.elements.findIndex(e => e.id === selId);
    change(() => {
      const [el] = s.elements.splice(i, 1);
      if (where === 'front') s.elements.push(el);
      else if (where === 'back') s.elements.unshift(el);
      else if (where === 'up') s.elements.splice(Math.min(s.elements.length, i + 1), 0, el);
      else s.elements.splice(Math.max(0, i - 1), 0, el);
    });
  }

  /* ================= Slides ================= */
  function go(i) {
    const a = document.activeElement;
    if (a && stage.contains(a)) a.blur();
    cur = clamp(i, 0, deck.slides.length - 1);
    selId = null;
    refresh();
  }
  function cloneSlide(s) {
    const c = JSON.parse(JSON.stringify(s));
    c.id = R.uid();
    (c.elements || []).forEach(e => { e.id = R.uid(); });
    return c;
  }
  function addSlide(type) {
    change(() => { deck.slides.splice(cur + 1, 0, R.newSlide(type)); cur++; selId = null; });
  }
  function dupSlide(i) {
    change(() => { deck.slides.splice(i + 1, 0, cloneSlide(deck.slides[i])); cur = i + 1; selId = null; });
  }
  function delSlide(i) {
    if (deck.slides.length <= 1) return toast(t('至少保留一页'));
    change(() => {
      deck.slides.splice(i, 1);
      if (cur >= i && cur > 0) cur--;
      selId = null;
    });
  }
  function moveSlide(from, to) {
    if (to === from || to === from + 1) return;
    change(() => {
      const [s] = deck.slides.splice(from, 1);
      const dest = to > from ? to - 1 : to;
      deck.slides.splice(dest, 0, s);
      cur = dest;
    });
  }
  function setSlideType(type) {
    const s = curSlide();
    if (s.type === type) return;
    if ((type === 'section' || type === 'subsection') && (s.elements || []).length &&
        !confirm(t('章节 / 小节页不能放置元素，转换后本页元素将被删除。继续？'))) { renderPanel(); return; }
    const n = R.newSlide(type);
    n.id = s.id;
    if (hasElements(n) && hasElements(s)) n.elements = s.elements;
    if (s.title && 'title' in n && type !== 'title') n.title = plain(s.title);
    if (s.toc && 'toc' in n) n.toc = s.toc;
    change(() => { deck.slides[cur] = n; });
  }

  // Thumbnail interactions
  let dragFrom = null;
  thumbs.addEventListener('click', e => {
    const th = e.target.closest('.thumb');
    if (!th) return;
    const i = +th.dataset.index;
    const act = e.target.closest('[data-tact]');
    if (act) { act.dataset.tact === 'dup' ? dupSlide(i) : delSlide(i); return; }
    if (i !== cur) go(i);
  });
  thumbs.addEventListener('dragstart', e => {
    dragFrom = +e.target.closest('.thumb').dataset.index;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/x-slide', String(dragFrom));
  });
  const clearDropMarks = () => $$('.thumb', thumbs).forEach(th => th.classList.remove('drop-before', 'drop-after'));
  // drop in the lower half of a thumbnail = after it
  const dropsAfter = (th, e) => { const r = th.getBoundingClientRect(); return e.clientY > r.top + r.height / 2; };
  thumbs.addEventListener('dragover', e => {
    const th = dragFrom !== null && e.target.closest('.thumb');
    if (!th) return;
    e.preventDefault();
    clearDropMarks();
    th.classList.add(dropsAfter(th, e) ? 'drop-after' : 'drop-before');
  });
  thumbs.addEventListener('drop', e => {
    if (dragFrom === null) return;
    e.preventDefault();
    const th = e.target.closest('.thumb');
    if (th) moveSlide(dragFrom, +th.dataset.index + (dropsAfter(th, e) ? 1 : 0));
    clearDropMarks(); dragFrom = null;
  });
  thumbs.addEventListener('dragend', () => { clearDropMarks(); dragFrom = null; });

  /* ================= Right panel ================= */
  const KIND = { text: '文本框', image: '图片', video: '视频' };
  const val = v => R.esc(v == null ? '' : v);
  const options = (list, current) =>
    list.map(([v, l]) => `<option value="${v}" ${current === v ? 'selected' : ''}>${l}</option>`).join('');
  const seg = (key, cur, opts) => `<span class="seg">${opts.map(([v, l]) =>
    `<button data-set="${key}" data-val="${v}" class="${cur === v ? 'on' : ''}">${l}</button>`).join('')}</span>`;
  // Collapsible panel section; which sections are folded is remembered per browser
  const FOLD_KEY = 'cai-editor-folded';
  let folded = {};
  try { folded = JSON.parse(localStorage.getItem(FOLD_KEY)) || {}; } catch {}
  const group = (key, title, small, body) =>
    `<div class="pg${folded[key] ? ' folded' : ''}" data-group="${key}">
      <div class="pt" data-toggle><span class="pt-title"><span class="chev"></span>${title}</span>${small ? `<small>${small}</small>` : ''}</div>
      <div class="pbody">${body}</div></div>`;
  function toggleGroup(g) {
    const key = g.dataset.group;
    folded[key] = !folded[key];
    g.classList.toggle('folded', folded[key]);
    try { localStorage.setItem(FOLD_KEY, JSON.stringify(folded)); } catch {}
  }
  const chk = (bind, on, label) =>
    `<label class="chk"><input type="checkbox" data-bind="${bind}" ${on ? 'checked' : ''}> ${label}</label>`;

  function elementPanel(el) {
    let h = `<div class="grid4">
        <label>X<input type="number" data-bind="el.x" value="${el.x}"></label>
        <label>Y<input type="number" data-bind="el.y" value="${el.y}"></label>
        <label>宽<input type="number" data-bind="el.w" value="${el.w}"></label>
        <label>高<input type="number" data-bind="el.h" value="${el.h}"></label>
      </div>`;
    if (el.type === 'text') {
      h += `<div class="row"><label>字号</label><input type="number" min="8" max="200" data-bind="el.fontSize" value="${el.fontSize || 38}"></div>
        <div class="row"><label>水平对齐</label>${seg('align', el.align || 'left', [['left', '左'], ['center', '居中'], ['right', '右']])}</div>
        <div class="row"><label>垂直对齐</label>${seg('valign', el.valign || 'top', [['top', '上'], ['middle', '中'], ['bottom', '下']])}</div>
        <div class="row"><label>样式</label><select data-bind="el.variant">${options([['plain', '普通文本'],
          ['box', '灰色块 (block)'], ['example', '蓝色块 (example)'], ['alert', '橙色提示 (alert)'], ['caption', '注释 / 来源']], el.variant)}
        </select></div>
        ${colorPickerHTML()}`;
    } else {
      h += `<div class="row"><label>填充</label><select data-bind="el.fit">${options(
          [['contain', '完整显示'], ['cover', '裁切填满'], ['fill', '拉伸']], el.fit)}</select></div>
        <div class="row"><label>地址</label><input type="text" data-bind="el.src" value="${val(el.src)}"></div>`;
      if (el.type === 'image') h += `<div class="row"><label>替代文字</label><input type="text" data-bind="el.alt" value="${val(el.alt)}"></div>`;
      else h += chk('el.controls', el.controls !== false, '显示控制条') + chk('el.autoplay', el.autoplay, '进入此页自动播放（静音）') +
        chk('el.loop', el.loop, '循环播放') + chk('el.muted', el.muted, '静音');
      h += `<div class="btns"><button class="pbtn" data-act="replaceMedia">替换文件…</button>
        <button class="pbtn" data-act="naturalRatio">恢复原始比例</button></div>`;
    }
    h += `<div class="psub"><div class="psub-title">动画</div>` +
      chk('el.fragment', el.fragment, '逐步显示（点击后出现，按图层顺序）') + '</div>';
    h += `<div class="psub"><div class="psub-title">层级</div><div class="order-btns">
        <button class="pbtn" data-act="front">置顶</button><button class="pbtn" data-act="up">上移</button>
        <button class="pbtn" data-act="back">置底</button><button class="pbtn" data-act="down">下移</button>
      </div></div>`;
    return group('element', KIND[el.type], '', h);
  }

  function slidePanel(s) {
    let h = `<div class="row"><label>类型</label><select data-act="slideType">${options(SLIDE_TYPES, s.type)}</select></div>`;
    if (s.type === 'content') {
      h += `<div class="row"><label>标题</label><input type="text" data-bind="slide.title" value="${val(plain(s.title))}"></div>`;
    } else if (s.type === 'section' || s.type === 'subsection') {
      h += `<div class="row"><label>标题</label><input type="text" data-bind="slide.title" value="${val(s.title)}"></div>
        <div class="row"><label>目录名称</label><input type="text" data-bind="slide.toc" value="${val(s.toc)}"></div>
        ${s.type === 'section' ? `<div class="row"><label>页面标题</label><input type="text" data-bind="slide.outlineTitle" value="${val(s.outlineTitle || deck.meta.outlineTitle || 'Outline')}"></div>` : ''}
        <div class="hint">${s.type === 'section'
          ? '播放时显示为高亮当前章节的 Outline 页（同 \\AtBeginSection）。'
          : '播放时显示 “章节标题 + 小节标题” 的过渡页。'}</div>`;
    } else {
      h += '<div class="hint">直接点击画布上的文字即可编辑。标题页日期留空则自动显示当天日期。</div>';
    }
    h += chk('slide.appendix', s.appendix, '此页不编号');
    return group('slide', '幻灯片', `${cur + 1} / ${deck.slides.length}`, h);
  }

  function deckPanel() {
    const m = deck.meta;
    return group('deck', '演示文稿', R.esc(deckName),
      `<div class="row"><label>页脚</label><input type="text" data-bind="meta.footer" value="${val(m.footer)}"></div>
      <div class="row"><label>网页标题</label><input type="text" data-bind="meta.docTitle" value="${val(m.docTitle)}"></div>`);
  }

  function keysPanel() {
    return group('keys', '快捷键', '', `<div class="keys">
      <kbd>双击</kbd><span>编辑文本 / 替换图片</span>
      <kbd>Delete</kbd><span>删除元素</span>
      <kbd>方向键</kbd><span>微移（⇧ ×10）；未选中时切换页</span>
      <kbd>⌘D</kbd><span>复制元素 / 页面</span>
      <kbd>⌘C / ⌘V</kbd><span>复制粘贴元素（可跨页）</span>
      <kbd>⌘Z / ⇧⌘Z</kbd><span>撤销 / 重做</span>
      <kbd>Alt 拖拽</kbd><span>关闭吸附</span>
      <kbd>⇧ 缩放</kbd><span>切换锁定比例</span>
      <kbd>Esc</kbd><span>退出编辑 / 取消选择</span>
    </div>`);
  }

  function renderPanel() {
    const el = selId && findEl(selId);
    panel.innerHTML = (el ? elementPanel(el) : '') + deckPanel() + slidePanel(curSlide()) + keysPanel();
    I18N.apply(panel);
    syncPicker();
  }
  function updateGeomInputs(x, y, w, h) {
    const set = (k, v) => { const i = panel.querySelector(`[data-bind="el.${k}"]`); if (i) i.value = v; };
    set('x', x); set('y', y); set('w', w); set('h', h);
  }

  panel.addEventListener('change', e => {
    const input = e.target;
    if (input.dataset.act === 'slideType') return setSlideType(input.value);
    const bind = input.dataset.bind;
    if (!bind) return;
    const [scope, key] = bind.split('.');
    const target = scope === 'el' ? findEl(selId) : scope === 'slide' ? curSlide() : deck.meta;
    if (!target) return;
    let v = input.type === 'checkbox' ? input.checked : input.type === 'number' ? Number(input.value) : input.value;
    if (input.type === 'number' && !Number.isFinite(v)) return renderPanel();
    if (scope === 'slide' && key === 'title' && target.type === 'content') v = R.esc(v);   // content titles are HTML
    change(() => { target[key] = v; });
  });
  panel.addEventListener('click', e => {
    const header = e.target.closest('[data-toggle]');
    if (header) return toggleGroup(header.closest('.pg'));
    const b = e.target.closest('button');
    if (!b) return;
    const el = selId && findEl(selId);
    if (b.dataset.set) return change(() => { el[b.dataset.set] = b.dataset.val; });
    if (b.dataset.cpmode) {
      pickTarget = b.dataset.cpmode;
      if (pickTarget === 'bg' && el && el.bg) pick = hexToHsv(el.bg);   // start from the current background
      return renderPanel();
    }
    if (b.dataset.color) {
      pick = hexToHsv(b.dataset.color); syncPicker();
      return applyColor(b.dataset.color);
    }
    switch (b.dataset.act) {
      case 'front': case 'back': case 'up': case 'down': return reorderEl(b.dataset.act);
      case 'replaceMedia': return replaceMedia();
      case 'naturalRatio':
        return mediaSize(el.src, el.type).then(([nw, nh]) => change(() => { el.h = Math.round(el.w * nh / nw); }));
      case 'clearBg': return el && el.bg && change(() => { delete el.bg; });
    }
  });

  /* ================= Colour picker (text panel) ================= */
  const SWATCHES = [
    ['#23373B', '正文色'], ['#004191', 'PUI 蓝'], ['#657C9D', 'PUI 浅蓝'], ['#2BA0B0', 'CAI 青'], ['#EB811B', '强调橙'],
    ['#8A9396', '灰色'], ['#000000', '黑色'], ['#FFFFFF', '白色'], ['#C0392B', '红色'], ['#2E8B57', '绿色']
  ];
  let pick = { h: 190, s: 0.4, v: 0.23 };          // last used colour, kept across re-renders
  let pickTarget = 'text';                          // what the picker colours: 'text' or 'bg' (box background)
  let savedRange = null;                            // text selection while editing

  const hsvToHex = ({ h, s, v }) => {
    const f = n => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
    return '#' + [f(5), f(3), f(1)].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
  };
  function hexToHsv(hex) {
    const [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(1 + i, 3 + i), 16) / 255);
    const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
    let h = 0;
    if (d) h = 60 * (max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4);
    return { h: (h + 360) % 360, s: max ? d / max : 0, v: max };
  }
  function normHex(v) {
    let x = String(v).trim().replace(/^#/, '');
    if (/^[0-9a-f]{3}$/i.test(x)) x = x.replace(/./g, c => c + c);
    return /^[0-9a-f]{6}$/i.test(x) ? '#' + x.toUpperCase() : null;
  }

  function colorPickerHTML() {
    return `<div class="colorpick">
      <div class="row"><label>颜色</label><span class="seg">
        <button data-cpmode="text" class="${pickTarget === 'text' ? 'on' : ''}">文字</button>
        <button data-cpmode="bg" class="${pickTarget === 'bg' ? 'on' : ''}">背景</button></span></div>
      <div class="cp-swatches">${SWATCHES.map(([c, n]) =>
        `<button class="sw" data-color="${c}" style="background:${c}" title="${n}"></button>`).join('')}</div>
      <div class="sv"><div class="sv-knob"></div></div>
      <div class="hue"><div class="hue-knob"></div></div>
      <div class="cp-row"><span class="cp-preview"></span>
        <input class="hex" type="text" maxlength="7" spellcheck="false" title="点击别处或按 Enter 应用"></div>
      ${pickTarget === 'bg' ? '<div class="btns"><button class="pbtn" data-act="clearBg">无背景</button></div>' : ''}
    </div>`;
  }
  // Move knobs / preview to match `pick`; keepHex leaves the field alone while typing
  function syncPicker(keepHex) {
    const cp = panel.querySelector('.colorpick');
    if (!cp) return;
    const hex = hsvToHex(pick);
    cp.querySelector('.sv').style.backgroundColor = `hsl(${pick.h}, 100%, 50%)`;
    Object.assign(cp.querySelector('.sv-knob').style, { left: pick.s * 100 + '%', top: (1 - pick.v) * 100 + '%' });
    cp.querySelector('.hue-knob').style.left = pick.h / 360 * 100 + '%';
    cp.querySelector('.cp-preview').style.background = hex;
    if (!keepHex) cp.querySelector('.hex').value = hex;
  }
  function applyColor(hex) {
    if (pickTarget === 'bg') {
      const el = selId && findEl(selId);
      if (el) change(() => { el.bg = hex; });
      return;
    }
    // the hex field takes focus, so return to the text and restore its selection
    const inner = stage.querySelector('.el.editing .el-inner');
    if (inner && document.activeElement !== inner) {
      inner.focus();
      if (savedRange) { const s = getSelection(); s.removeAllRanges(); s.addRange(savedRange); }
    }
    applyFormat('foreColor', hex);
  }
  // Apply the hex field's value if it changed since the field was focused
  function commitHex(field) {
    const hex = normHex(field.value);
    if (!hex) {
      if (field.value.trim()) toast(t('无效的颜色值'));
      syncPicker();                                  // show the last valid colour again
      return;
    }
    if (hex === field.dataset.start) return;
    field.dataset.start = hex;
    pick = hexToHsv(hex); syncPicker();
    applyColor(hex);
  }

  document.addEventListener('selectionchange', () => {
    const s = getSelection();
    if (!s.rangeCount) return;
    const r = s.getRangeAt(0), node = r.startContainer;
    const inner = (node.nodeType === 1 ? node : node.parentElement)?.closest('.el-inner');
    if (inner && inner.isContentEditable) savedRange = r.cloneRange();
  });

  // mousedown must not move focus out of the text being edited
  panel.addEventListener('mousedown', e => {
    if (e.target.closest('.colorpick [data-color], .sv, .hue, [data-cpmode], [data-act="clearBg"]')) e.preventDefault();
  });
  panel.addEventListener('pointerdown', e => {
    const area = e.target.closest('.sv, .hue');
    if (!area || e.button !== 0) return;
    const isSV = area.classList.contains('sv');
    const update = ev => {
      const r = area.getBoundingClientRect();
      const x = clamp((ev.clientX - r.left) / r.width, 0, 1), y = clamp((ev.clientY - r.top) / r.height, 0, 1);
      if (isSV) { pick.s = x; pick.v = 1 - y; } else pick.h = x * 360;
      syncPicker();
      if (pickTarget === 'bg' && selId) {               // live preview while dragging
        const n = elNode(selId);
        if (n) n.style.background = hsvToHex(pick);
      }
    };
    update(e);
    trackPointer(update, () => applyColor(hsvToHex(pick)));
  });
  // Hex field: typing only previews; the colour is applied when the field
  // loses focus (click elsewhere) or on Enter
  panel.addEventListener('focusin', e => {
    if (e.target.matches('.colorpick .hex')) e.target.dataset.start = normHex(e.target.value) || '';
  });
  panel.addEventListener('input', e => {
    if (!e.target.matches('.colorpick .hex')) return;
    const hex = normHex(e.target.value);
    if (hex) { pick = hexToHsv(hex); syncPicker(true); }
  });
  panel.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.matches('.colorpick .hex')) {
      e.preventDefault();
      commitHex(e.target);
    }
  });
  panel.addEventListener('focusout', e => {
    const field = e.target;
    if (!field.matches('.colorpick .hex')) return;
    const to = e.relatedTarget;
    commitHex(field);                    // may focus the edited text to colour its saved selection
    if (to && to.matches('.el-inner')) return;          // clicked back into the text: keep editing
    // clicked anywhere else: finish the pending text edit, then let focus go where the user clicked
    const inner = stage.querySelector('.el.editing .el-inner');
    if (inner) { if (document.activeElement === inner) inner.blur(); else endEdit(inner); }
    if (to && to.isConnected) to.focus();
  });

  /* ================= Toolbar ================= */
  function editingTarget() {
    const a = document.activeElement;
    return a && stage.contains(a) && a.isContentEditable ? a : null;
  }
  function updateToolbar() {
    const s = curSlide();
    const el = selId && findEl(selId);
    const canFmt = !!editingTarget() || (el && el.type === 'text');
    $('#fmt').classList.toggle('disabled', !canFmt);
    $$('[data-insert]').forEach(b => { b.disabled = !hasElements(s); });
    $('#undoBtn').disabled = !undoStack.length;
    $('#redoBtn').disabled = !redoStack.length;
  }

  // Format the selection while editing, or the whole text box when only selected
  function applyFormat(cmd, value) {
    if (cmd === 'createLink') {
      value = prompt(t('链接地址'), 'https://');
      if (!value) return;
    }
    document.execCommand('styleWithCSS', false, cmd === 'foreColor');
    const ed = editingTarget();
    if (ed) { document.execCommand(cmd, false, value); return; }
    const el = selId && findEl(selId);
    if (!el || el.type !== 'text') return;
    const inner = elNode(selId).querySelector('.el-inner');
    inner.contentEditable = 'true';
    inner.focus();
    const r = document.createRange(); r.selectNodeContents(inner);
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
    document.execCommand(cmd, false, value);
    const html = inner.innerHTML;
    inner.contentEditable = 'false';
    inner.dataset.orig = html;     // the focusout that follows must not double-commit
    inner.blur();
    change(() => { el.html = html; });
  }

  document.querySelector('.topbar').addEventListener('mousedown', e => {
    // keep the text selection while clicking formatting buttons
    if (e.target.closest('[data-exec]')) e.preventDefault();
  });
  // Dropdown menus (top bar and sidebar): a [data-menu] button toggles its menu;
  // any other click closes open menus
  const closeMenus = () => $$('.menu.open').forEach(m => m.classList.remove('open'));
  document.addEventListener('click', e => {
    const opener = e.target.closest('[data-menu]');
    const menu = opener && opener.closest('.menu');
    const wasOpen = menu && menu.classList.contains('open');
    closeMenus();
    if (menu && !wasOpen) menu.classList.add('open');
  }, true);

  document.querySelector('.topbar').addEventListener('click', async e => {
    const b = e.target.closest('button');
    if (!b || b.hasAttribute('data-menu')) return;
    if (b.dataset.exec) return applyFormat(b.dataset.exec);
    switch (b.dataset.cmd) {
      case 'addText': return addText();
      case 'addImage': return insertFiles(await pickFiles('image/*', true));
      case 'addVideo': return insertFiles(await pickFiles('video/*', true));
      case 'addImageUrl': case 'addVideoUrl': {
        const url = prompt(t('文件网址（https://…）'));
        if (url) insertMedia(url.trim(), b.dataset.cmd === 'addImageUrl' ? 'image' : 'video');
        return;
      }
    }
    if (b.dataset.export) return doExport(b.dataset.export);
    if (b.dataset.lang) return setLang(b.dataset.lang);
  });
  $('.sidebar .menu').addEventListener('click', e => {
    const b = e.target.closest('[data-add-slide]');
    if (b) addSlide(b.dataset.addSlide);
  });

  $('#undoBtn').onclick = undo;
  $('#redoBtn').onclick = redo;

  async function flushAndSave() {
    const a = editingTarget();
    if (a) a.blur();
    await save();
  }
  $('#previewBtn').onclick = async () => {
    const w = window.open('about:blank', '_blank');
    await flushAndSave();
    w.location = `/preview/${deckPath}/#${cur + 1}`;
  };
  async function doExport(kind) {
    await flushAndSave();
    if (kind === 'single') {
      location.href = `/api/export/${deckPath}/single`;
      return;
    }
    try {
      const r = await api(`/api/export/${deckPath}`, { method: 'POST' });
      toast(t('已导出到：') + r.dir, 6000);
    } catch (e) { toast(t('导出失败：') + e.message); }
  }

  /* ================= Keyboard / clipboard / drop ================= */
  document.addEventListener('keydown', e => {
    const mod = e.metaKey || e.ctrlKey, k = e.key;
    const a = document.activeElement;
    const typing = a && (a.isContentEditable || isFormField(a));
    if (mod && k.toLowerCase() === 's') { e.preventDefault(); flushAndSave(); return; }
    if (typing) {
      if (k === 'Escape') { a.blur(); return; }
      if (a.isContentEditable && stage.contains(a)) {
        if (k === 'Enter' && a.matches('h1[data-field], h2[data-field], [data-plain], p.subtitle, p.author, p.date')) { e.preventDefault(); a.blur(); }
        else if (k === 'Enter' && !e.shiftKey && a.matches('[data-field]')) { e.preventDefault(); document.execCommand('insertLineBreak'); }
        else if (k === 'Tab' && a.matches('.el-inner')) { e.preventDefault(); document.execCommand(e.shiftKey ? 'outdent' : 'indent'); }
      }
      return;
    }
    if (mod && k.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && k.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    const el = selId && findEl(selId);
    if (mod && k.toLowerCase() === 'd') { e.preventDefault(); el ? duplicateEl(el) : dupSlide(cur); return; }
    if (mod) return;
    if (el) {
      const step = e.shiftKey ? 10 : 1;
      const mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[k];
      if (mv) { e.preventDefault(); change(() => { el.x += mv[0]; el.y += mv[1]; }); }
      else if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); deleteEl(); }
      else if (k === 'Enter' && el.type === 'text') { e.preventDefault(); startEdit(el.id); }
      else if (k === 'Escape') select(null);
    } else {
      if (k === 'ArrowUp' || k === 'ArrowLeft' || k === 'PageUp') { e.preventDefault(); go(cur - 1); }
      else if (k === 'ArrowDown' || k === 'ArrowRight' || k === 'PageDown') { e.preventDefault(); go(cur + 1); }
    }
  });

  // Elements travel through the clipboard as "cai-el:<json>" (works across slides and decks)
  const CLIP = 'cai-el:';
  function copySelected(e) {
    if (editingTarget() || isFormField(document.activeElement)) return null;
    const el = selId && findEl(selId);
    if (!el) return null;
    e.clipboardData.setData('text/plain', CLIP + JSON.stringify(el));
    e.preventDefault();
    return el;
  }
  document.addEventListener('copy', e => { if (copySelected(e)) toast(t('已复制元素')); });
  document.addEventListener('cut', e => { if (copySelected(e)) deleteEl(); });
  document.addEventListener('paste', e => {
    if (isFormField(document.activeElement)) return;
    const files = [...e.clipboardData.files];
    const text = e.clipboardData.getData('text/plain');
    if (editingTarget()) {
      // paste as plain text to keep the template's typography
      e.preventDefault();
      if (files.length && !text) insertFiles(files);
      else document.execCommand('insertText', false, text.startsWith(CLIP) ? '' : text);
      return;
    }
    e.preventDefault();
    if (files.length) return insertFiles(files);
    if (text.startsWith(CLIP)) {
      try { duplicateEl(JSON.parse(text.slice(CLIP.length))); } catch {}
    } else if (text.trim()) {
      addText(text.trim().split(/\n{2,}/).map(p => `<p>${R.esc(p).replace(/\n/g, '<br>')}</p>`).join(''));
    }
  });

  let dragDepth = 0;
  const hasFiles = e => [...(e.dataTransfer?.types || [])].includes('Files');
  area.addEventListener('dragenter', e => { if (hasFiles(e)) { dragDepth++; area.classList.add('dragging'); } });
  area.addEventListener('dragleave', e => { if (hasFiles(e) && --dragDepth <= 0) { dragDepth = 0; area.classList.remove('dragging'); } });
  area.addEventListener('dragover', e => { if (hasFiles(e)) e.preventDefault(); });
  area.addEventListener('drop', e => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth = 0; area.classList.remove('dragging');
    const r = stage.getBoundingClientRect();
    const at = { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
    insertFiles([...e.dataTransfer.files], at);
  });
  // stop the browser from opening files dropped elsewhere
  window.addEventListener('dragover', e => { if (hasFiles(e)) e.preventDefault(); });
  window.addEventListener('drop', e => { if (hasFiles(e)) e.preventDefault(); });

  /* ================= Decks ================= */
  const NAME_RE = /^[\w\-一-鿿]{1,64}$/;
  // Fill the deck dropdown; returns whether the current deck already existed on disk
  async function loadDeckList() {
    const names = await api('/api/decks');
    const existed = names.includes(deckName);
    if (!existed) names.push(deckName);
    $('#deckSel').innerHTML = names.sort().map(n =>
      `<option value="${R.esc(n)}" ${n === deckName ? 'selected' : ''}>${R.esc(n)}</option>`).join('');
    return existed;
  }
  $('#deckSel').onchange = async e => {
    await flushAndSave();
    location.search = '?deck=' + encodeURIComponent(e.target.value);
  };
  $('#newDeck').onclick = async () => {
    const name = (prompt(t('新演示文稿名称（字母、数字、中文、- 或 _）')) || '').trim();
    if (!name) return;
    if (!NAME_RE.test(name)) return toast(t('名称只能包含字母、数字、中文、- 或 _'));
    await flushAndSave();
    location.search = '?deck=' + encodeURIComponent(name);
  };

  /* ================= Language ================= */
  function renderLang() {
    $('#langLabel').textContent = I18N.lang === 'en' ? 'Language' : '中文';
    $$('#langMenu [data-lang]').forEach(b => b.classList.toggle('on', b.dataset.lang === I18N.lang));
    I18N.apply(document.body);
  }
  function setLang(l) {
    if (l === I18N.lang) return;
    I18N.set(l);
    renderLang();
    if (deck) { refresh(); showSaveState(); }
  }
  renderLang();

  /* ================= Boot ================= */
  (async () => {
    try {
      deck = await api('/api/deck/' + deckPath);
      deck.meta = deck.meta || {};
      refresh();
      fitStage();
      if (await loadDeckList()) showSaveState();
      else save();                            // persist a freshly created deck
    } catch (e) {
      status(t('加载失败：') + e.message, true);
    }
  })();
})();
