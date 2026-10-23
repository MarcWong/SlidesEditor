/* CAI Slide Template (HTML) — runtime.
   Expands section/subsection/appendix markers, adds frame title bars, progress
   bars and footers, scales the 1600×900 canvas, and handles navigation.
   CAISlides.build(deckEl) only decorates (used by the editor); the page
   auto-initialises when it contains a .deck without data-manual. */
(function () {
  const W = 1600, H = 900;

  /* ---- Decorate a .deck element; returns its slides ---- */
  function build(deck) {
    const footerText = deck.dataset.footer || '';
    const logo = deck.dataset.logo || 'figures/cai_logo_small_white.svg';
    const outlineTitle = deck.dataset.outlineTitle || 'Outline';
    const autoOutline = deck.dataset.outline !== 'false';

    // 1. Collect sections (for the ToC)
    const sections = [];
    for (const el of deck.children) {
      if (el.matches('.section')) {
        sections.push({ title: el.dataset.title, toc: el.dataset.toc || el.dataset.title, subs: [] });
      } else if (el.matches('.subsection') && sections.length) {
        sections[sections.length - 1].subs.push(el.dataset.toc || el.dataset.title);
      }
    }

    function tocHTML(current) {
      return '<ul class="toc">' + sections.map((s, i) =>
        `<li class="${current >= 0 && i !== current ? 'shaded' : ''}">${s.toc}` +
        (s.subs.length ? '<ul>' + s.subs.map(t => `<li>${t}</li>`).join('') + '</ul>' : '') +
        '</li>').join('') + '</ul>';
    }

    // 2. Replace markers with generated slides
    let secIdx = -1, inAppendix = false;
    for (const el of [...deck.children]) {
      if (el.matches('.section')) {
        secIdx++;
        if (autoOutline) {
          const s = document.createElement('section');
          s.className = 'slide';
          s.innerHTML = `<h2>${el.dataset.outlineTitle || outlineTitle}</h2><div class="content">${tocHTML(secIdx)}</div>`;
          if (el.hasAttribute('data-appendix')) s.classList.add('appendix');
          el.replaceWith(s);
        } else el.remove();
      } else if (el.matches('.subsection')) {
        const s = document.createElement('section');
        s.className = 'slide section-page';
        const secTitle = secIdx >= 0 ? sections[secIdx].title : '';
        s.innerHTML = `<div class="box"><h2>${secTitle}</h2>` +
          `<div class="bar"><i></i></div><h3>${el.dataset.title}</h3></div>`;
        if (el.hasAttribute('data-appendix')) s.classList.add('appendix');
        el.replaceWith(s);
      } else if (el.matches('.appendix:not(.slide)')) {   // old-style marker: all later slides unnumbered
        inAppendix = true;
        el.remove();
      } else if (el.matches('.slide') && inAppendix) {
        el.classList.add('appendix');
      }
    }
    // <div class="toc-here"></div> inside a slide → full table of contents
    deck.querySelectorAll('.toc-here').forEach(el => { el.outerHTML = tocHTML(-1); });

    // 3. Decorate slides. Slides with .appendix are unnumbered: no page number,
    //    no progress bar, and the other slides are numbered as if they weren't there.
    const slides = [...deck.querySelectorAll(':scope > .slide')];
    const mainCount = slides.filter(s => !s.classList.contains('appendix')).length || 1;
    let pageNo = 0;

    slides.forEach(s => {
      if (!s.classList.contains('appendix')) pageNo++;
      const frac = Math.min(1, pageNo / mainCount) * 100 + '%';
      const special = s.matches('.title-slide, .standout, .section-page');
      const h2 = s.querySelector(':scope > h2');
      if (!special && h2) {
        const bar = document.createElement('div');
        bar.className = 'frametitle';
        bar.innerHTML = `<span></span><img src="${logo}" alt="">`;
        bar.firstChild.replaceWith(h2);
        const prog = document.createElement('div');
        prog.className = 'progress';
        prog.innerHTML = `<i style="width:${frac}"></i>`;
        s.prepend(bar, prog);
        // Wrap loose content in .content if the author didn't
        if (!s.querySelector(':scope > .content')) {
          const c = document.createElement('div');
          c.className = 'content';
          [...s.childNodes].slice(2).forEach(n => c.appendChild(n));
          s.appendChild(c);
        }
      }
      const sb = s.querySelector('.section-page .bar > i');
      if (sb) sb.style.width = frac;
      if (!special && !s.classList.contains('appendix')) {
        const f = document.createElement('div');
        f.className = 'footline';
        f.innerHTML = `<span>${footerText}</span><span class="pageno">${pageNo}</span>`;
        s.appendChild(f);
      }
    });

    deck.querySelectorAll('[data-today]').forEach(el => {
      el.textContent = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    });
    return slides;
  }

  /* ---- Presentation mode: scaling + navigation ---- */
  function init(deck) {
    const slides = build(deck);

    function fit() {
      const s = Math.min(window.innerWidth / W, window.innerHeight / H);
      deck.style.setProperty('--scale', s);
    }
    window.addEventListener('resize', fit);
    fit();

    const hud = document.createElement('div');
    hud.className = 'hud';
    document.body.appendChild(hud);

    let cur = 0;
    const frags = s => [...s.querySelectorAll('.fragment')];

    function show(i, fragState) {
      cur = Math.max(0, Math.min(slides.length - 1, i));
      slides.forEach((s, k) => {
        s.classList.toggle('active', k === cur);
        s.querySelectorAll('video').forEach(v => {
          if (k !== cur) v.pause();
          else if (v.autoplay) { v.currentTime = 0; v.play().catch(() => {}); }
        });
      });
      const f = frags(slides[cur]);
      f.forEach((el, k) => el.classList.toggle('visible', fragState === 'all' || k < (fragState || 0)));
      hud.textContent = `${cur + 1} / ${slides.length}  ·  ←/→ navigate · O overview · F fullscreen · Shift+P print`;
      if (location.hash !== '#' + (cur + 1)) history.replaceState(null, '', '#' + (cur + 1));
    }
    function next() {
      const hidden = frags(slides[cur]).filter(el => !el.classList.contains('visible'));
      if (hidden.length) hidden[0].classList.add('visible');
      else if (cur < slides.length - 1) show(cur + 1, 0);
    }
    function prev() {
      const shown = frags(slides[cur]).filter(el => el.classList.contains('visible'));
      if (shown.length) shown[shown.length - 1].classList.remove('visible');
      else if (cur > 0) show(cur - 1, 'all');
    }
    function toggleOverview(force) {
      const on = document.body.classList.toggle('overview', force);
      if (on) slides[cur].scrollIntoView({ block: 'center' });
    }

    document.addEventListener('keydown', e => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key;
      if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter', 'n'].includes(k)) { e.preventDefault(); next(); }
      else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(k)) { e.preventDefault(); prev(); }
      else if (k === 'Home') show(0, 0);
      else if (k === 'End') show(slides.length - 1, 0);
      else if (k === 'o' || k === 'O') toggleOverview();
      else if (k === 'Escape') toggleOverview(false);
      else if (k === 'f' || k === 'F') {
        document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
      } else if (k === 'P') window.print();
    });

    deck.addEventListener('click', e => {
      if (document.body.classList.contains('overview')) {
        const s = e.target.closest('.slide');
        if (s) { show(slides.indexOf(s), 'all'); toggleOverview(false); }
      }
    });

    let tx = null;
    document.addEventListener('touchstart', e => { tx = e.touches[0].clientX; }, { passive: true });
    document.addEventListener('touchend', e => {
      if (tx === null) return;
      const dx = e.changedTouches[0].clientX - tx;
      if (Math.abs(dx) > 50) (dx < 0 ? next : prev)();
      tx = null;
    });

    window.addEventListener('hashchange', () => {
      const n = parseInt(location.hash.slice(1), 10);
      if (n && n - 1 !== cur) show(n - 1, 0);
    });
    window.addEventListener('beforeprint', () => slides.forEach(s => s.classList.add('active')));
    window.addEventListener('afterprint', () => show(cur, 'all'));

    show((parseInt(location.hash.slice(1), 10) || 1) - 1, 0);
  }

  window.CAISlides = { build, init, W, H };
  const d = document.querySelector('.deck');
  if (d && !d.hasAttribute('data-manual')) init(d);
})();
