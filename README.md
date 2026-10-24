# CAI Slides Editor

A browser-based editor for 16:9 HTML presentations in the style of the CAI beamer template
(blue title bar, CAI logo, progress bar, auto-generated outline pages). Decks export to static HTML
that runs anywhere without a server.

**Online:** <https://marcwong.github.io/SlidesEditor/> — nothing to install; see
[Without a server](#without-a-server).

## Quick start

Run it locally to keep decks as files on disk. Requires Node.js 18+ (no `npm install` needed).

```bash
cd SlidesEditor
npm start          # PORT=8080 npm start for another port
```

Open the address printed in the terminal (normally <http://localhost:5173>). If the port is taken, the
next free one is used, so several editors can run side by side. Stop with `Ctrl+C`.

Changes save automatically (`⌘S` / `Ctrl+S` saves at once). Switch, create or **Import** decks in
the top bar (delete one in the right panel); the interface language is under **Language**.

## Editing

**Slides** (left sidebar): **＋ New slide** inserts after the current slide; drag thumbnails to reorder;
hover a thumbnail to duplicate (⧉) or delete (✕).

| Type | Purpose | Edit by clicking |
| --- | --- | --- |
| **Title** | Title page with CAI and University of Stuttgart logos | Title, subtitle, author, date (empty = today), institute |
| **Section** | Shown as an outline slide highlighting this section (like `\AtBeginSection`) | Heading, section and subsection names |
| **Subsection** | Divider with section and subsection title | Either title |
| **Content** | Normal slide with frame title | Title; add text, images, videos |
| **Thank you** | Teal closing slide | The text |

Section and subsection slides are generated, so they cannot hold elements. A section's *Title* (divider)
and *ToC name* (outline) can differ. Tick **Unnumbered** to drop a slide's page number and progress
bar; the other slides are numbered without it.

**Elements**: insert with **＋ Text / Image / Video**, drop image or video files onto the canvas, or paste
a screenshot or text.

| Action | How |
| --- | --- |
| Move / resize | Drag, or drag the handles. Snaps to margins, centres and other elements (hold **Alt** to disable). Media keep their aspect ratio on corners (**Shift** toggles) |
| Nudge | Arrow keys (1 px), **Shift** + arrows (10 px) |
| Duplicate / copy / paste / delete | `⌘D`, `⌘C` / `⌘V` (also across slides and decks), `Delete` |
| Undo / redo | `⌘Z` / `⇧⌘Z` |
| Edit text | Double-click (or `Enter`); `Esc` or click outside to finish; `Tab` indents lists |

The right panel holds the selected element, the deck (footer, page title), the current slide and a
shortcut list; click a header to fold a section. For text boxes it sets font size, alignment, style
(plain, grey / blue / orange block, caption) and **Colour**: switch **Text** / **Background**, then use a
swatch, the colour picker, or a hex value (applied when you click elsewhere or press `Enter`). While
editing, only the selected text is coloured. Images and videos have fit, alt text and playback options.
**Reveal step by step** hides an element until you advance (like `\pause`).

Maths between `$…$` or `$$…$$` is rendered in the preview and exports, not in the editor.

## Preview, export and present

- **▶ Preview** opens the deck in a new tab.
- **Export ▾**
  - **Download ZIP**: a folder with `index.html`, the runtime, logos and media. Unzip and open
    `index.html`, or share the ZIP.
  - **Download single HTML**: everything in one file; large videos make it large.
  - **Export as folder** (local server only): writes the same folder to `exports/<deck>-<date>-<time>/`.
- Exports are snapshots: export again after editing. Fonts and maths load from a CDN, so without
  internet a system font is used and `$…$` stays as text.
- Every export contains the deck data, so **Import** turns it back into an editable deck. Import also
  takes deck `.json` files with their media, or a whole folder (e.g. an export or `data/`). You can
  also drop these files onto the canvas.

| Key | Action |
| --- | --- |
| `→` `Space` `PageDown` / `←` `PageUp` | Next / previous step or slide |
| `Home` / `End` | First / last slide |
| `F` / `O` | Full screen / overview |
| `Shift+P` | Print |

**PDF:** print from Chrome or Edge, **Save as PDF**, margins **None**, **Background graphics** on;
each slide becomes one 16:9 page.

## Without a server

On GitHub Pages, or any static host, the editor finds no server and keeps decks and media in the
browser's storage (IndexedDB); a **Browser storage** badge shows this. That storage belongs to one
browser on one computer, and clearing site data deletes it, so **Download ZIP** regularly as a backup
and to move decks; **Import** brings them back. Decks move between the online and local editors the
same way.

`npm run build` writes the static site to `_site/`. Every push to `main` on GitHub publishes it through
`.github/workflows/pages.yml` (repository **Settings → Pages → Source: GitHub Actions**).

## Files

```
server.js          local server (storage, uploads, folder export)
build.js           static build for GitHub Pages (npm run build → _site/)
shared/render.js   deck → slide HTML (used by server and browser)
public/            editor, preview page, storage (store.js), import/export (io.js)
template/          slide template: cai-slides.css, cai-slides.js, logos, hand-written sample index.html
data/              your decks (decks/*.json) and uploads (media/), not tracked by git
exports/           exported folders, not tracked by git
```

Back up your work by copying `data/` (or download ZIPs). Editor, preview and exports all use `template/`, so changes there
affect all of them. To write a deck by hand, copy `template/` and edit `index.html`; its header comment
lists the available markup.

If the interface looks outdated after an update, restart `npm start` and reload the page.
