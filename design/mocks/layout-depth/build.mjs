/* ─────────────────────────────────────────────────────────────
   「景深叠层」原型 · 生成器
   读 src/content/ 下的真实内容（只读），按醒面真值渲染成一份静态 index.html：
   index.src.html 里的 <!--STACK--> 换成全部薄片的标记。
   用法：node design/mocks/layout-depth/build.mjs
   只认本站 markdown 的一个子集（标题 / 段落 / 列表 / 任务 / 引文 / 代码 / 表格 / 分隔线 /
   :::wake 与 :::dream / [[醒|梦]] / ((浮起)) / {{流过}} / 行内 HTML 块），够原型用即可。
   ───────────────────────────────────────────────────────────── */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const C = (p) => fs.readFileSync(path.join(ROOT, 'src/content', p), 'utf8');

/* ── 极简 frontmatter ── */
function front(src) {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  const meta = {};
  const lines = m[1].split(/\r?\n/);
  let key = null;
  for (const line of lines) {
    let mm;
    if ((mm = line.match(/^(\w+):\s*(.*)$/))) {
      key = mm[1];
      const v = mm[2].trim();
      if (v === '') meta[key] = null;
      else if (v.startsWith('[')) meta[key] = v.slice(1, -1).split(',').map((s) => s.trim()).filter(Boolean);
      else meta[key] = v.replace(/^["']|["']$/g, '');
    } else if ((mm = line.match(/^\s*-\s*\{(.*)\}\s*$/))) {
      const o = {};
      mm[1].split(',').forEach((kv) => {
        const [k, ...r] = kv.split(':');
        o[k.trim()] = r.join(':').trim();
      });
      (meta[key] = Array.isArray(meta[key]) ? meta[key] : []).push(o);
    } else if ((mm = line.match(/^\s*-\s*(\w+):\s*(.*)$/))) {
      (meta[key] = Array.isArray(meta[key]) ? meta[key] : []).push({ [mm[1]]: mm[2].trim() });
    } else if ((mm = line.match(/^\s+(\w+):\s*(.*)$/))) {
      const v = mm[2].trim();
      if (Array.isArray(meta[key])) meta[key][meta[key].length - 1][mm[1]] = v;
      else (meta[key] = meta[key] || {})[mm[1]] = v;
    }
  }
  return { meta, body: m[2] };
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* 醒面真值：[[醒|梦]] 取醒，((…|参数)) / {{…|参数}} 退成正文 */
const wakeText = (s) =>
  s
    .replace(/\[\[([^|\]]*)\|[^\]]*\]\]/g, '$1')
    .replace(/\(\(([^)|]*)(\|[^)]*)?\)\)/g, '$1')
    .replace(/\{\{([^}|]*)(\|[^}]*)?\}\}/g, '$1');

function inline(s) {
  s = wakeText(s);
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
  s = esc(s);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[+i])}</code>`);
  return s;
}

/* ── 块级 ── */
function md(src) {
  const lines = wakeBlocks(src).split(/\r?\n/);
  const out = [];
  let i = 0;
  let h2 = 0;
  const isBlank = (l) => /^\s*$/.test(l);
  while (i < lines.length) {
    const l = lines[i];
    if (isBlank(l)) { i++; continue; }
    if (l.startsWith('```')) {
      const lang = l.slice(3).trim();
      const buf = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) buf.push(lines[i++]);
      i++;
      out.push(`<pre data-lang="${esc(lang)}"><code>${esc(buf.join('\n'))}</code></pre>`);
      continue;
    }
    let m;
    if ((m = l.match(/^(#{2,3})\s+(.*)$/))) {
      if (m[1].length === 2) {
        h2++;
        out.push(`<h2><span class="ord">${String(h2).padStart(2, '0')}</span>${inline(m[2])}</h2>`);
      } else out.push(`<h3>${inline(m[2])}</h3>`);
      i++;
      continue;
    }
    if (/^---\s*$/.test(l)) { out.push('<hr>'); i++; continue; }
    if (l.startsWith('<')) {
      const buf = [];
      while (i < lines.length && !isBlank(lines[i])) buf.push(lines[i++]);
      out.push(buf.join('\n').replace(/src="\/favicon\.svg"/, 'src="/favicon.svg"'));
      continue;
    }
    if (l.startsWith('>')) {
      const buf = [];
      while (i < lines.length && lines[i].startsWith('>')) buf.push(lines[i++].replace(/^>\s?/, ''));
      out.push(`<blockquote>${md(buf.join('\n'))}</blockquote>`);
      continue;
    }
    if (l.startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++]);
      const cells = (r) => r.replace(/^\||\|$/g, '').split('|').map((c) => inline(c.trim()));
      const head = cells(rows[0]);
      const body = rows.slice(2).map(cells);
      out.push(
        `<table><thead><tr>${head.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${body
          .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`)
          .join('')}</tbody></table>`,
      );
      continue;
    }
    if (/^(\s*)([-*]|\d+\.)\s/.test(l)) {
      const buf = [];
      while (i < lines.length && (/^(\s*)([-*]|\d+\.)\s/.test(lines[i]) || /^\s{2,}\S/.test(lines[i]))) buf.push(lines[i++]);
      out.push(list(buf));
      continue;
    }
    const buf = [];
    while (i < lines.length && !isBlank(lines[i]) && !/^(#{2,3}\s|```|>|\||---\s*$)/.test(lines[i])) buf.push(lines[i++].trim());
    out.push(`<p>${inline(buf.join(''))}</p>`);
  }
  return out.join('\n');
}

function list(lines) {
  const ordered = /^\s*\d+\./.test(lines[0]);
  const items = [];
  for (const l of lines) {
    const m = l.match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
    if (m && m[1].length === 0) items.push({ text: m[3], sub: [] });
    else items[items.length - 1].sub.push(l.replace(/^\s{2}/, ''));
  }
  const tag = ordered ? 'ol' : 'ul';
  return `<${tag}>${items
    .map((it) => {
      let t = it.text;
      let cls = '';
      const task = t.match(/^\[( |x)\]\s+(.*)$/);
      if (task) {
        cls = ` class="task${task[1] === 'x' ? ' done' : ''}"`;
        t = task[2];
      }
      return `<li${cls}>${inline(t)}${it.sub.length ? list(it.sub) : ''}</li>`;
    })
    .join('')}</${tag}>`;
}

/* :::wake 留下内容，:::dream 整块略去（醒面是唯一真值） */
function wakeBlocks(src) {
  return src.replace(/^:::(wake|dream)\s*\r?\n([\s\S]*?)^:::\s*$/gm, (_, k, inner) => (k === 'wake' ? inner : ''));
}

const ymd = (d) => String(d).slice(0, 10).replace(/-/g, ' · ');
const iso = (d) => String(d).slice(0, 10);
const hanCount = (html) => html.replace(/<[^>]+>/g, '').replace(/\s/g, '').length;
const roundLen = (n) => (n >= 1000 ? `约 ${(Math.round(n / 100) * 100).toLocaleString('en').replace(',', ' ')} 字` : `约 ${Math.round(n / 10) * 10} 字`);

/* ── 内容 ── */
const SECTIONS = [
  { key: 'articles', hour: 'shallow', tone: 'light', name: '随笔', dream: '断章', badge: '可言说的 · SAYABLE' },
  { key: 'projects', hour: 'deep', tone: 'dark', name: '项目', dream: '造物', badge: '可构造的 · BUILDABLE' },
  { key: 'moments', hour: 'rem', tone: 'dark', name: '瞬间', dream: '闪念', badge: '即逝的 · EPHEMERAL' },
  { key: 'about', hour: 'dawn', tone: 'light', name: '关于', dream: '此身', badge: '存在于此 · PRESENCE' },
];

const articles = ['co-creation-notes.md', 'style-specimen.md']
  .map((f) => ({ id: f.replace(/\.md$/, ''), ...front(C('articles/' + f)) }))
  .sort((a, b) => (a.meta.date < b.meta.date ? 1 : -1));
const projects = ['fancytext.md', 'personal-website.md']
  .map((f) => ({ id: f.replace(/\.md$/, ''), ...front(C('projects/' + f)) }))
  .sort((a, b) => (a.meta.date < b.meta.date ? 1 : -1));
const MOMENT_IMG = {
  '2026-10-04-lacuna-dream': ['lacuna-dream.jpg'],
  '2026-10-07-nexus-dev': ['nexus-1.jpg', 'nexus-2.jpg', 'nexus-3.jpg', 'nexus-4.jpg'],
};
const moments = [
  ['2026-10-07-nexus-dev', 'moments/2026-10-07-nexus-dev/index.md'],
  ['2026-10-04-lacuna-dream', 'moments/2026-10-04-lacuna-dream/index.md'],
  ['2026-10-03-hello-world', 'moments/2026-10-03-hello-world.md'],
].map(([id, f]) => ({ id: 'm-' + id.slice(11), slug: id, ...front(C(f)) }));

/* ── 标记 ── */
const n2 = (i, n) => `${String(i + 1).padStart(2, '0')} / ${String(n).padStart(2, '0')}`;

function articleSheet(a, i, n) {
  const body = md(a.body);
  const tags = (a.meta.tags || []).map((t) => `<span>${esc(t)}</span>`).join('');
  const rel = (a.meta.related || []).map((r) => `<li><a href="${esc(r.href)}">${esc(r.label)}</a></li>`).join('');
  return `
      <article class="sheet k-article" id="${a.id}" data-title="${esc(a.meta.title)}" data-date="${iso(a.meta.date)}" aria-labelledby="t-${a.id}">
        <div class="glass" aria-hidden="true"></div>
        <div class="face">
          <div class="meta"><span class="kicker">随笔 <i>${n2(i, n)}</i></span><time datetime="${iso(a.meta.date)}">${ymd(a.meta.date)}</time></div>
          <h3 class="title" id="t-${a.id}"><a href="#${a.id}/read">${esc(a.meta.title)}</a></h3>
          <p class="desc">${esc(a.meta.description || '')}</p>
          <div class="foot"><span class="tags">${tags}</span><span class="len">${roundLen(hanCount(body))}</span></div>
        </div>
        <div class="body">
          <header class="r-head">
            <p class="r-kicker">随笔 · 可言说的</p>
            <h1>${esc(a.meta.title)}</h1>
            <p class="r-desc">${esc(a.meta.description || '')}</p>
            <p class="r-meta"><time datetime="${iso(a.meta.date)}">${ymd(a.meta.date)}</time><span>${roundLen(hanCount(body))}</span></p>
          </header>
          <div class="md">${body}</div>
          ${rel ? `<footer class="r-rel"><p>关联篇章</p><ul>${rel}</ul></footer>` : ''}
        </div>
      </article>`;
}

function projectSheet(p, i, n) {
  const body = md(p.body);
  const links = (p.meta.links || []).map((l) => `<a href="${esc(l.href)}" rel="noopener">${esc(l.label)} ↗</a>`).join('');
  const rel = (p.meta.related || []).map((r) => `<li><a href="${esc(r.href)}">${esc(r.label)}</a></li>`).join('');
  const note = p.meta.note ? p.meta.note.awake.replace(/^["“]|["”]$/g, '') : '';
  return `
      <article class="sheet k-project" id="${p.id}" data-title="${esc(p.meta.title)}" data-date="${iso(p.meta.date)}" aria-labelledby="t-${p.id}">
        <div class="glass" aria-hidden="true"></div>
        <div class="face">
          <div class="meta"><span class="kicker">项目 <i>${n2(i, n)}</i></span><span class="status">${esc(p.meta.status || '')}</span></div>
          <h3 class="title" id="t-${p.id}"><a href="#${p.id}/read">${esc(p.meta.title)}</a></h3>
          <p class="desc">${esc(p.meta.description || '')}</p>
          ${note ? `<p class="note">${esc(note)}</p>` : ''}
          <div class="foot"><span class="links">${links}</span><time datetime="${iso(p.meta.date)}">${ymd(p.meta.date)}</time></div>
        </div>
        <div class="body">
          <header class="r-head">
            <p class="r-kicker">项目 · 可构造的</p>
            <h1>${esc(p.meta.title)}</h1>
            <p class="r-desc">${esc(p.meta.description || '')}</p>
            <p class="r-meta"><time datetime="${iso(p.meta.date)}">${ymd(p.meta.date)}</time><span>${esc(p.meta.status || '')}</span></p>
          </header>
          <div class="md">${body}</div>
          ${note ? `<aside class="r-note">${esc(note)}</aside>` : ''}
          ${links ? `<p class="r-links">${links}</p>` : ''}
          ${rel ? `<footer class="r-rel"><p>关联记述</p><ul>${rel}</ul></footer>` : ''}
        </div>
      </article>`;
}

function momentSheet(m, i, n) {
  const imgs = MOMENT_IMG[m.slug] || [];
  const alts = (m.meta.images || []).map((o) => o.alt || '');
  const body = md(m.body);
  const title = m.meta.title || '';
  const tags = (m.meta.tags || []).map((t) => `<span>${esc(t)}</span>`).join('');
  const fig = imgs.length
    ? `<div class="media n${imgs.length}">${imgs
        .map((src, k) => `<img src="assets/${src}" alt="${esc(alts[k] || '')}" width="1000" height="${src.startsWith('nexus') ? 667 : 1000}" decoding="async">`)
        .join('')}</div>`
    : '';
  const dt = String(m.meta.date);
  return `
      <article class="sheet k-moment${imgs.length ? ' has-media' : ' no-media'}" id="${m.id}" data-title="${esc(title)}" data-date="${dt.slice(0, 10)}" aria-labelledby="t-${m.id}">
        <div class="glass" aria-hidden="true"></div>
        <div class="face">
          ${fig}
          <div class="m-text">
            <div class="meta"><span class="kicker">瞬间 <i>${n2(i, n)}</i></span><time datetime="${esc(dt)}">${ymd(dt)} · ${dt.slice(11, 16)}</time></div>
            <h3 class="title" id="t-${m.id}"><a href="#${m.id}/read">${esc(title)}</a></h3>
            ${body ? `<div class="m-body">${body}</div>` : ''}
            <div class="foot"><span class="tags">${tags}</span></div>
          </div>
        </div>
        <div class="body">
          ${fig}
          <header class="r-head">
            <p class="r-kicker">瞬间 · 即逝的</p>
            <h1>${esc(title)}</h1>
            <p class="r-meta"><time datetime="${esc(dt)}">${ymd(dt)} · ${dt.slice(11, 16)}</time></p>
          </header>
          ${body ? `<div class="md">${body}</div>` : ''}
          ${tags ? `<p class="r-tags">${tags}</p>` : ''}
        </div>
      </article>`;
}

const pw = projects.find((p) => p.id === 'personal-website');
const aboutLine = pw.meta.note.awake;
const aboutPara = wakeBlocks(pw.body).split(/\r?\n/).find((l) => l.startsWith('欢迎'));

const aboutSheet = `
      <article class="sheet k-about" id="about" data-title="Traveritas" data-date="" aria-labelledby="t-about">
        <div class="glass" aria-hidden="true"></div>
        <div class="face">
          <div class="meta"><span class="kicker">关于</span><span>存在于此 · PRESENCE</span></div>
          <h3 class="title" id="t-about"><a href="#about/read">Traveritas</a></h3>
          <p class="desc">${esc(aboutLine)}</p>
          <div class="foot"><span class="links"><a href="https://github.com/Traveritas" rel="noopener">GitHub ↗</a></span></div>
        </div>
        <div class="body">
          <header class="r-head">
            <p class="r-kicker">关于 · 存在于此</p>
            <h1>Traveritas</h1>
            <p class="r-desc">${esc(aboutLine)}</p>
          </header>
          <div class="md"><p>${inline(aboutPara)}</p></div>
          <p class="r-links"><a href="https://github.com/Traveritas" rel="noopener">GitHub ↗</a></p>
        </div>
      </article>`;

const threshold = `
    <section class="sec" data-hour="home" data-tone="light" aria-label="入口">
      <header class="sheet k-threshold" id="threshold" data-title="入口" data-date="">
        <div class="glass" aria-hidden="true"></div>
        <div class="face">
          <p class="t-mark">Traveritas</p>
          <h1 class="t-name">昼梦叙集</h1>
          <p class="t-q">在即将醒来的那一瞬，世界究竟是在成形，还是正在融化？</p>
          <ol class="t-toc">
            <li><a href="#${articles[0].id}">随笔<i>${articles.length}</i></a></li>
            <li><a href="#${projects[0].id}">项目<i>${projects.length}</i></a></li>
            <li><a href="#${moments[0].id}">瞬间<i>${moments.length}</i></a></li>
            <li><a href="#about">关于</a></li>
          </ol>
        </div>
      </header>
    </section>`;

const sec = (s, inner) => `
    <section class="sec" data-hour="${s.hour}" data-tone="${s.tone}" data-name="${s.name}" data-dream="${s.dream}" data-badge="${s.badge}" aria-labelledby="h-${s.key}">
      <h2 class="sec-h" id="h-${s.key}">${s.name}<small>${s.badge}</small></h2>${inner}
    </section>`;

const stack = [
  threshold,
  sec(SECTIONS[0], articles.map((a, i) => articleSheet(a, i, articles.length)).join('')),
  sec(SECTIONS[1], projects.map((p, i) => projectSheet(p, i, projects.length)).join('')),
  sec(SECTIONS[2], moments.map((m, i) => momentSheet(m, i, moments.length)).join('')),
  sec(SECTIONS[3], aboutSheet),
].join('\n');

const tpl = fs.readFileSync(path.join(HERE, 'index.src.html'), 'utf8');
fs.writeFileSync(path.join(HERE, 'index.html'), tpl.replace('<!--STACK-->', stack));
console.log('index.html written:', articles.length, 'articles,', projects.length, 'projects,', moments.length, 'moments');
