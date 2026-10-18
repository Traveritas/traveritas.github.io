/* ─────────────────────────────────────────────────────────────
   无界平铺原型 · 取材脚本
   从 src/content/ 读真实的随笔、项目、瞬间，写成 data.js；
   瞬间配图用 sharp 出两档副本（m 720 宽 / l 1600 宽）到 assets/img/，原图不动。
   用法：node design/mocks/layout-plane/build-data.mjs
   ───────────────────────────────────────────────────────────── */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const require = createRequire(path.join(ROOT, 'package.json'));
const yaml = require('js-yaml');
const sharp = require('sharp');

const CONTENT = path.join(ROOT, 'src/content');
const IMG_OUT = path.join(HERE, 'assets/img');
fs.mkdirSync(IMG_OUT, { recursive: true });

function readMd(file) {
  const raw = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  return { fm: yaml.load(m[1]) || {}, body: m[2] };
}

/* ── 极简 markdown → HTML（只覆盖本站正文用到的写法） ── */
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function inline(s) {
  // 先把行内代码抠出来，免得里面的符号被当成语法
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(esc(c)) - 1}\u0000`);
  s = esc(s);
  s = s.replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, '<span class="dual"><span data-w>$1</span><span data-d>$2</span></span>');
  s = s.replace(/\(\(([^)|]+)(\|[^)]*)?\)\)/g, '<span class="float">$1</span>');
  s = s.replace(/\{\{([^}|]+)(\|[^}]*)?\}\}/g, '<span class="sheen">$1</span>');
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[+i]}</code>`);
  return s;
}

let ord = 0;
function blocks(md) {
  const lines = md.split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    if (l.startsWith('```')) {
      const lang = l.slice(3).trim();
      const buf = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) buf.push(lines[i++]);
      i++;
      out.push(`<pre data-lang="${lang}"><code>${esc(buf.join('\n'))}</code></pre>`);
      continue;
    }
    let h = l.match(/^(#{2,3})\s+(.*)$/);
    if (h) {
      if (h[1].length === 2) {
        ord++;
        out.push(`<h2><span class="ord">${String(ord).padStart(2, '0')}</span>${inline(h[2])}</h2>`);
      } else out.push(`<h3>${inline(h[2])}</h3>`);
      i++;
      continue;
    }
    if (l.startsWith('>')) {
      const buf = [];
      while (i < lines.length && lines[i].startsWith('>')) buf.push(lines[i++].replace(/^>\s?/, ''));
      out.push(`<blockquote>${blocks(buf.join('\n'))}</blockquote>`);
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s/.test(l)) {
      const ordered = /^\s*\d+\./.test(l);
      const items = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s/.test(lines[i])) {
        let t = lines[i++].replace(/^\s*([-*]|\d+\.)\s+/, '');
        const task = t.match(/^\[( |x)\]\s+/);
        if (task) t = `<span class="task${task[1] === 'x' ? ' done' : ''}"></span>` + inline(t.slice(task[0].length));
        else t = inline(t);
        items.push(`<li>${t}</li>`);
      }
      out.push(ordered ? `<ol>${items.join('')}</ol>` : `<ul>${items.join('')}</ul>`);
      continue;
    }
    if (l.startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++]);
      const cells = (r) => r.split('|').slice(1, -1).map((c) => inline(c.trim()));
      const head = cells(rows[0]);
      const body = rows.slice(2).map(cells);
      out.push(
        `<table><thead><tr>${head.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${body
          .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`)
          .join('')}</tbody></table>`,
      );
      continue;
    }
    const buf = [];
    while (i < lines.length && lines[i].trim() && !/^(#{2,3}\s|```|>|\||\s*([-*]|\d+\.)\s)/.test(lines[i])) buf.push(lines[i++].trim());
    out.push(`<p>${inline(buf.join(''))}</p>`);
  }
  return out.join('\n');
}

/* :::wake / :::dream 容器 → data-side 块；未标记的两面共读 */
function render(md) {
  ord = 0;
  const parts = [];
  const re = /^:::(wake|dream)\n([\s\S]*?)\n:::\s*$/gm;
  let last = 0;
  let m;
  while ((m = re.exec(md))) {
    if (m.index > last) parts.push(blocks(md.slice(last, m.index)));
    parts.push(`<div data-side="${m[1]}">${blocks(m[2])}</div>`);
    last = re.lastIndex;
  }
  parts.push(blocks(md.slice(last)));
  return parts.join('\n');
}

const plain = (s) => s.replace(/\(\(([^)|]+)(\|[^)]*)?\)\)/g, '$1').replace(/\{\{([^}|]+)(\|[^}]*)?\}\}/g, '$1');
const iso = (d) => new Date(d).toISOString().slice(0, 10);
const words = (md) => md.replace(/:::\w*|[#>*`\-|\[\]()]/g, '').replace(/\s+/g, '').length;

const articles = fs
  .readdirSync(path.join(CONTENT, 'articles'))
  .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
  .map((f) => {
    const { fm, body } = readMd(path.join(CONTENT, 'articles', f));
    return { slug: f.replace(/\.md$/, ''), title: fm.title, desc: fm.description || '', date: iso(fm.date), tags: fm.tags || [], related: fm.related || [], chars: words(body), html: render(body) };
  })
  .sort((a, b) => b.date.localeCompare(a.date));

const projects = fs
  .readdirSync(path.join(CONTENT, 'projects'))
  .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
  .map((f) => {
    const { fm, body } = readMd(path.join(CONTENT, 'projects', f));
    return { slug: f.replace(/\.md$/, ''), title: fm.title, desc: fm.description || '', date: iso(fm.date), status: fm.status || '', links: fm.links || [], note: fm.note || null, html: render(body) };
  })
  .sort((a, b) => b.date.localeCompare(a.date));

const moments = [];
for (const entry of fs.readdirSync(path.join(CONTENT, 'moments'))) {
  const p = path.join(CONTENT, 'moments', entry);
  const isDir = fs.statSync(p).isDirectory();
  const file = isDir ? path.join(p, 'index.md') : p;
  if (!file.endsWith('.md') || !fs.existsSync(file)) continue;
  const { fm, body } = readMd(file);
  const slug = entry.replace(/\.md$/, '');
  const images = [];
  for (const [k, im] of (fm.images || []).entries()) {
    const src = typeof im === 'string' ? im : im.src;
    const alt = typeof im === 'string' ? '' : im.alt || '';
    const abs = path.join(p, src);
    const base = `${slug}-${k + 1}`;
    const meta = await sharp(abs).metadata();
    await sharp(abs).resize({ width: 720, withoutEnlargement: true }).webp({ quality: 82 }).toFile(path.join(IMG_OUT, `${base}-m.webp`));
    await sharp(abs).resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 86 }).toFile(path.join(IMG_OUT, `${base}-l.webp`));
    images.push({ m: `assets/img/${base}-m.webp`, l: `assets/img/${base}-l.webp`, alt, w: meta.width, h: meta.height });
  }
  moments.push({ slug, title: fm.title || '', date: new Date(new Date(fm.date).getTime() + 9 * 3600e3).toISOString().slice(0, 16), tags: fm.tags || [], text: plain(body).trim(), html: render(body), images });
}
moments.sort((a, b) => b.date.localeCompare(a.date));

const site = projects.find((p) => p.slug === 'personal-website');
const about = {
  title: 'Traveritas',
  question: '在即将醒来的那一瞬，世界究竟是在成形，还是正在融化？',
  line: site?.note?.awake || '',
  dreamLine: site?.note?.dream || '',
  links: [{ label: 'GitHub', href: 'https://github.com/Traveritas' }],
};

const data = { articles, projects, moments, about };
fs.writeFileSync(path.join(HERE, 'data.js'), `/* 由 build-data.mjs 生成，勿手改 */\nwindow.PLANE_DATA = ${JSON.stringify(data, null, 1)};\n`);
/* 线性目录写回 index.html（<!--toc--> 与 <!--/toc--> 之间）：无脚本时这就是整页 */
const dot = (d) => d.slice(0, 10).replace(/-/g, ' · ');
const li = (href, title, date, extra = '') => `      <li><a href="${href}"><span class="toc-t">${esc(title)}</span>${extra}<time>${dot(date)}</time></a></li>`;
const toc = [
  `    <h1 class="toc-h">Traveritas</h1>`,
  `    <section><h2><span data-w>随笔</span><span data-d>断章</span></h2><ul>`,
  ...articles.map((a) => li(`#/a/${a.slug}`, a.title, a.date)),
  `    </ul></section>`,
  `    <section><h2><span data-w>项目</span><span data-d>造物</span></h2><ul>`,
  ...projects.map((p) => li(`#/p/${p.slug}`, p.title, p.date)),
  `    </ul></section>`,
  `    <section><h2><span data-w>瞬间</span><span data-d>闪念</span></h2><ul>`,
  ...moments.flatMap((m) =>
    m.images.length
      ? m.images.map((im, k) => li(`#/m/${m.slug}/${k + 1}`, m.title, m.date, im.alt ? `<span class="toc-x">${esc(im.alt)}</span>` : ''))
      : [li(`#/m/${m.slug}`, m.title, m.date)],
  ),
  `    </ul></section>`,
  `    <section><h2><span data-w>关于</span><span data-d>此身</span></h2><ul>`,
  `      <li><a href="#/about"><span class="toc-t">Traveritas</span></a></li>`,
  `    </ul></section>`,
].join('\n');
const idx = path.join(HERE, 'index.html');
const html = fs.readFileSync(idx, 'utf8').replace(/<!--toc-->[\s\S]*?<!--\/toc-->/, `<!--toc-->\n${toc}\n<!--/toc-->`);
fs.writeFileSync(idx, html);

console.log(`articles ${articles.length} · projects ${projects.length} · moments ${moments.length} · images ${moments.reduce((n, m) => n + m.images.length, 0)}`);
