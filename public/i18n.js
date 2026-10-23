/* UI language toggle (中文 ⇄ English). The UI is written in Chinese; this maps
   each Chinese string to English. apply(root) translates text nodes and title
   attributes in place and can switch back, since originals are remembered. */
(() => {
  const EN = {
    // top bar
    '新建': 'New', '切换演示文稿': 'Switch deck', '新建演示文稿': 'New deck',
    '＋ 文本': '＋ Text', '插入文本框': 'Insert text box',
    '＋ 图片 ▾': '＋ Image ▾', '插入图片': 'Insert image',
    '＋ 视频 ▾': '＋ Video ▾', '插入视频': 'Insert video',
    '从文件上传…': 'Upload file…', '使用网址…': 'From URL…',
    '加粗 (⌘B)': 'Bold (⌘B)', '斜体 (⌘I)': 'Italic (⌘I)', '下划线 (⌘U)': 'Underline (⌘U)',
    '项目符号列表': 'Bulleted list', '编号列表': 'Numbered list',
    '减少缩进 (⇧Tab)': 'Outdent (⇧Tab)', '增加缩进 (Tab)': 'Indent (Tab)', '插入链接': 'Insert link',
    '正文色': 'Text colour', 'PUI 浅蓝': 'PUI light blue', '黑色': 'Black', '白色': 'White', '红色': 'Red', '绿色': 'Green',
    '颜色': 'Colour', '文字': 'Text', '背景': 'Background', '无背景': 'No background', '点击别处或按 Enter 应用': 'Applied when you click elsewhere or press Enter', '无效的颜色值': 'Invalid colour value',
    'PUI 蓝': 'PUI blue', 'CAI 青': 'CAI teal', '强调橙': 'Alert orange', '灰色': 'Grey',
    '清除格式': 'Clear formatting', '撤销 (⌘Z)': 'Undo (⌘Z)', '重做 (⇧⌘Z)': 'Redo (⇧⌘Z)',
    '▶ 预览': '▶ Preview', '在新标签页中播放': 'Present in a new tab',
    '导出 ▾': 'Export ▾', '导出为文件夹（exports/）': 'Export as folder (exports/)',
    '下载单文件 HTML（媒体内嵌）': 'Download single HTML (media inlined)',
    '切换语言': 'Switch language',
    // sidebar
    '幻灯片': 'Slides', '＋ 新建页 ▾': '＋ New slide ▾',
    '内容页': 'Content', '章节页': 'Section', '小节页': 'Subsection',
    '标题页': 'Title', '感谢页': 'Thank you',
    '不编号': 'Unnumbered',
    '复制此页': 'Duplicate slide', '删除此页': 'Delete slide',
    // canvas
    '松开以插入图片 / 视频': 'Drop to insert image / video',
    '双击文本框编辑 · 拖拽移动 · 拖动控制点缩放 · 拖入图片/视频文件即可插入':
      'Double-click text to edit · drag to move · drag handles to resize · drop image/video files to insert',
    '章节页：Outline 自动生成，点击标题或当前章节名即可编辑':
      'Section: the outline is generated — click the heading or the current section name to edit',
    '小节页：点击章节 / 小节标题即可编辑': 'Subsection: click the section / subsection title to edit',
    // element panel
    '文本框': 'Text box', '图片': 'Image', '视频': 'Video',
    '宽': 'W', '高': 'H', '字号': 'Font size', '水平对齐': 'Align', '垂直对齐': 'Vertical',
    '左': 'Left', '居中': 'Center', '中': 'Middle', '右': 'Right', '上': 'Top', '下': 'Bottom',
    '样式': 'Style', '普通文本': 'Plain text', '灰色块 (block)': 'Grey block', '蓝色块 (example)': 'Blue block (example)',
    '橙色提示 (alert)': 'Orange alert', '注释 / 来源': 'Caption / source',
    '填充': 'Fit', '完整显示': 'Contain', '裁切填满': 'Cover (crop)', '拉伸': 'Stretch',
    '地址': 'Source', '替代文字': 'Alt text',
    '显示控制条': 'Show controls', '进入此页自动播放（静音）': 'Autoplay on this slide (muted)',
    '循环播放': 'Loop', '静音': 'Muted',
    '替换文件…': 'Replace file…', '恢复原始比例': 'Reset aspect ratio',
    '逐步显示（点击后出现，按图层顺序）': 'Reveal step by step (appears on click, in layer order)',
    '层级': 'Order', '动画': 'Animation', '置顶': 'To front', '上移': 'Forward', '下移': 'Backward', '置底': 'To back',
    // slide panel
    '类型': 'Type', '标题': 'Title', '目录名称': 'ToC name', '页面标题': 'Heading',
    '播放时显示为高亮当前章节的 Outline 页（同 \\AtBeginSection）。':
      'Presented as an outline slide highlighting this section (like \\AtBeginSection).',
    '播放时显示 “章节标题 + 小节标题” 的过渡页。': 'Presented as a “section + subsection title” divider slide.',
    '直接点击画布上的文字即可编辑。标题页日期留空则自动显示当天日期。':
      'Click the text on the canvas to edit it. Leave the date empty to show today’s date.',
    '此页不编号': 'Unnumbered',
    // deck panel
    '演示文稿': 'Deck', '页脚': 'Footer', '网页标题': 'Page title',
    '快捷键': 'Shortcuts', '双击': 'Double-click', '编辑文本 / 替换图片': 'Edit text / replace media',
    '删除元素': 'Delete element', '方向键': 'Arrow keys',
    '微移（⇧ ×10）；未选中时切换页': 'Nudge (⇧ ×10); change slide when nothing is selected',
    '复制元素 / 页面': 'Duplicate element / slide', '复制粘贴元素（可跨页）': 'Copy / paste elements (across slides)',
    '撤销 / 重做': 'Undo / redo', 'Alt 拖拽': 'Alt + drag', '关闭吸附': 'Disable snapping',
    '⇧ 缩放': '⇧ + resize', '切换锁定比例': 'Toggle aspect lock',
    '退出编辑 / 取消选择': 'Stop editing / deselect',
    // messages
    '未保存…': 'Unsaved…', '已保存': 'Saved', '保存失败：': 'Save failed: ', '加载失败：': 'Load failed: ',
    '上传': 'Uploading', '已上传': 'Uploaded', '上传失败：': 'Upload failed: ',
    '不支持的文件类型：': 'Unsupported file type: ',
    '章节 / 小节页不能放置元素，请换到内容页': 'Section / subsection slides can’t hold elements — use a content slide',
    '章节 / 小节页不能放置元素，转换后本页元素将被删除。继续？':
      'Section / subsection slides can’t hold elements; this slide’s elements will be removed. Continue?',
    '至少保留一页': 'A deck needs at least one slide',
    '链接地址': 'Link URL', '文件网址（https://…）': 'File URL (https://…)',
    '已复制元素': 'Element copied', '已导出到：': 'Exported to: ', '导出失败：': 'Export failed: ',
    '新演示文稿名称（字母、数字、中文、- 或 _）': 'New deck name (letters, digits, Chinese, - or _)',
    '名称只能包含字母、数字、中文、- 或 _': 'Names may only contain letters, digits, Chinese, - or _'
  };

  const KEY = 'cai-editor-lang';
  let lang;
  try { lang = localStorage.getItem(KEY); } catch {}
  if (lang !== 'en' && lang !== 'zh') lang = /^zh/i.test(navigator.language) ? 'zh' : 'en';

  const t = s => (lang === 'en' && EN[s] != null ? EN[s] : s);
  const orig = new WeakMap();   // text node → original Chinese text

  function apply(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n.parentElement && n.parentElement.closest('#stage, script, style')) continue;
      if (!orig.has(n)) {
        const key = n.nodeValue.trim();
        if (!EN[key]) continue;
        orig.set(n, n.nodeValue);
      }
      const src = orig.get(n), key = src.trim();
      n.nodeValue = lang === 'en' ? src.replace(key, EN[key]) : src;
    }
    root.querySelectorAll('[title]').forEach(el => {
      if (el.closest('#stage')) return;
      if (!el.dataset.zhTitle) {
        if (!EN[el.title]) return;
        el.dataset.zhTitle = el.title;
      }
      el.title = t(el.dataset.zhTitle);
    });
  }

  function set(l) {
    lang = l;
    try { localStorage.setItem(KEY, l); } catch {}
    document.documentElement.lang = l === 'en' ? 'en' : 'zh-CN';
  }

  window.I18N = { t, apply, set, get lang() { return lang; } };
  document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN';
})();
