/* ─────────────────────────────────────────────────────────────
   「命题体」原型的生成脚本：读 src/content/（只读），生成 index.html，
   并按页面实际用字从 .cache/fonts 的 Noto Serif SC 可变字体切出一份子集。
   用法：node design/mocks/layout-tractatus/build.mjs
   产物全部落在本目录：index.html、fonts/、media/
   ───────────────────────────────────────────────────────────── */
import { createRequire } from 'node:module';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..', '..');
const req = createRequire(join(ROOT, 'package.json'));
const yaml = req('js-yaml');

const C = (p) => join(ROOT, 'src', 'content', p);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function readMd(file) {
  const raw = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(raw);
  return { data: yaml.load(m[1]), body: m[2] };
}

/* ── 站内路径 → 命题编号（互链在一份文本里就是交叉引用） ── */
const LINKS = {
  '/articles/co-creation-notes/': '1.1',
  '/articles/style-specimen/': '1.2',
  '/projects/fancytext/': '2.1',
  '/projects/personal-website/': '2.2',
  '/articles/': '1',
  '/projects/': '2',
  '/moments/': '3',
  '/about/': '4',
};

/* ── 行内 ── */
function floatRun(text, params) {
  const map = { amp: '--amp', dur: '--dur', stagger: '--stg', tint: '--tint', sway: '--sway' };
  const style = parseParams(params, map);
  const chars = Array.from(text)
    .map((ch, i) => (ch === ' ' ? ' ' : `<span class="fc" style="--i:${i}">${ch}</span>`))
    .join('');
  return `<span class="fl"${style ? ` style="${style}"` : ''}>${chars}</span>`;
}
function sheenRun(text, params) {
  const style = parseParams(params, { dur: '--sh-dur', hue: '--sh-hue', span: '--sh-span' });
  return `<span class="shn"${style ? ` style="${style}"` : ''}>${text}</span>`;
}
function parseParams(params, map) {
  if (!params) return '';
  return params
    .split(',')
    .map((kv) => kv.split('=').map((s) => s.trim()))
    .filter(([k, v]) => map[k] && /^-?[\d.]+(px|em|rem|s|ms|%|deg)?$/.test(v))
    .map(([k, v]) => `${map[k]}:${v}`)
    .join(';');
}

function inl(s) {
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(esc(c)) - 1}\u0000`);
  s = esc(s);
  s = s.replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, (_, a, b) => `<span class="mw" data-w="${a}" data-d="${b}">${a}</span>`);
  s = s.replace(/\(\(([^|)]+?)(?:\|([^)]*))?\)\)/g, (_, t, p) => floatRun(t, p));
  s = s.replace(/\{\{([^|}]+?)(?:\|([^}]*))?\}\}/g, (_, t, p) => sheenRun(t, p));
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t, h) => {
    const n = LINKS[h];
    return n ? `<a class="xref" href="#${n}" data-ref="${n}">${t}</a>` : `<a href="${h}">${t}</a>`;
  });
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[+i]}</code>`);
}

/* ── 块 ── */
function md(src, ctx) {
  const L = src.split('\n');
  const out = [];
  let i = 0;
  const isList = (l) => /^\s*([-*]|\d+\.)\s+/.test(l);
  const blockStart = (l) => /^(#{2,3} |:::|```|> ?|\||---\s*$|<)/.test(l) || isList(l);
  while (i < L.length) {
    const l = L[i];
    if (!l.trim()) { i++; continue; }
    let m;
    if ((m = /^:::(wake|dream)\s*$/.exec(l))) {
      const buf = [];
      i++;
      while (i < L.length && L[i].trim() !== ':::') buf.push(L[i++]);
      i++;
      out.push(`<div class="side" data-side="${m[1]}">${md(buf.join('\n'), ctx)}</div>`);
      continue;
    }
    if ((m = /^```(\w*)/.exec(l))) {
      const buf = [];
      i++;
      while (i < L.length && !L[i].startsWith('```')) buf.push(L[i++]);
      i++;
      const code = esc(buf.join('\n'))
        .replace(/(\/\*[\s\S]*?\*\/|\/\/[^\n]*)/g, '<span class="cm">$1</span>');
      out.push(`<pre data-lang="${m[1]}"><code>${code}</code></pre>`);
      continue;
    }
    if ((m = /^(#{2,3}) (.+)$/.exec(l))) {
      let n;
      if (m[1] === '##') { ctx.h2++; ctx.h3 = 0; n = `${ctx.num}${ctx.h2}`; }
      else { ctx.h3++; n = `${ctx.num}${ctx.h2}${ctx.h3}`; }
      const tag = m[1] === '##' ? 'h4' : 'h5';
      ctx.subs.push({ n, t: m[2].replace(/\[\[([^|\]]+)\|[^\]]+\]\]/g, '$1'), depth: m[1].length });
      out.push(
        `<${tag} class="sub d${m[1].length}" id="${n}"><a class="sub-a" href="#${n}" tabindex="-1"><span class="num">${n}</span></a><span class="sub-t">${inl(m[2])}</span></${tag}>`,
      );
      i++;
      continue;
    }
    if (/^---\s*$/.test(l)) { out.push('<hr>'); i++; continue; }
    if (/^> ?/.test(l)) {
      const buf = [];
      while (i < L.length && /^>/.test(L[i])) buf.push(L[i++].replace(/^> ?/, ''));
      out.push(`<blockquote>${md(buf.join('\n'), ctx)}</blockquote>`);
      continue;
    }
    if (l.startsWith('|')) {
      const rows = [];
      while (i < L.length && L[i].startsWith('|')) rows.push(L[i++]);
      const cells = (r) => r.replace(/^\||\|$/g, '').split('|').map((c) => inl(c.trim()));
      const head = cells(rows[0]);
      const body = rows.slice(2).map(cells);
      out.push(
        `<table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${body
          .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`)
          .join('')}</tbody></table>`,
      );
      continue;
    }
    if (l.startsWith('<')) {
      const buf = [];
      while (i < L.length && L[i].trim()) buf.push(L[i++]);
      out.push(buf.join('\n').replace('src="/favicon.svg"', 'src="media/favicon.svg"').replace(/<figure>/, '<figure class="loose">'));
      continue;
    }
    if (isList(l)) {
      const buf = [];
      while (i < L.length && (isList(L[i]) || (/^\s+\S/.test(L[i]) && buf.length))) buf.push(L[i++]);
      out.push(list(buf));
      continue;
    }
    const buf = [];
    while (i < L.length && L[i].trim() && !blockStart(L[i])) buf.push(L[i++].trim());
    if (!buf.length) { out.push(`<p>${inl(l.trim())}</p>`); i++; continue; }
    out.push(`<p>${inl(buf.reduce((a, b) => (/[\x21-\x7e]$/.test(a) && /^[\x21-\x7e]/.test(b) ? `${a} ${b}` : a + b)))}</p>`);
  }
  return out.join('\n');
}

function list(lines) {
  const items = [];
  const base = lines[0].match(/^\s*/)[0].length;
  const ordered = /^\s*\d+\./.test(lines[0]);
  for (const l of lines) {
    const ind = l.match(/^\s*/)[0].length;
    if (ind === base && /^\s*([-*]|\d+\.)\s+/.test(l)) items.push({ head: l.replace(/^\s*([-*]|\d+\.)\s+/, ''), kids: [] });
    else items[items.length - 1].kids.push(l);
  }
  const tag = ordered ? 'ol' : 'ul';
  return `<${tag}>${items
    .map(({ head, kids }) => {
      let cls = '';
      let h = head;
      const t = /^\[( |x)\]\s+/.exec(h);
      if (t) { cls = ` class="task${t[1] === 'x' ? ' done' : ''}"`; h = h.slice(t[0].length); }
      return `<li${cls}>${inl(h)}${kids.length ? list(kids) : ''}</li>`;
    })
    .join('')}</${tag}>`;
}

/* ── 字数（醒面真值，与站内一致：梦面块不计） ── */
const countChars = (body) =>
  (body.replace(/:::dream[\s\S]*?\n:::/g, '').match(/[㐀-鿿豈-﫿]|[A-Za-z0-9]+/g) || []).length;

const pad = (n) => String(n).padStart(2, '0');
const md2 = (d) => `${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
const ymd = (d) => `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
/* 瞬间的时刻按作者写下的时区（+09:00）读 */
const hm = (d) => {
  const t = new Date(d.getTime() + 9 * 3600e3);
  return `${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`;
};
const mdOf = (d) => {
  const t = new Date(d.getTime() + 9 * 3600e3);
  return `${pad(t.getUTCMonth() + 1)}.${pad(t.getUTCDate())}`;
};

/* ── 读内容 ── */
const articles = readdirSync(C('articles'))
  .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
  .map((f) => ({ slug: f.replace(/\.md$/, ''), ...readMd(C(`articles/${f}`)) }))
  .filter((a) => !a.data.draft)
  .sort((a, b) => b.data.date - a.data.date);
const projects = readdirSync(C('projects'))
  .filter((f) => f.endsWith('.md'))
  .map((f) => ({ slug: f.replace(/\.md$/, ''), ...readMd(C(`projects/${f}`)) }))
  .filter((a) => !a.data.draft)
  .sort((a, b) => b.data.date - a.data.date);

mkdirSync(join(HERE, 'media'), { recursive: true });
const moments = readdirSync(C('moments'), { withFileTypes: true })
  .filter((d) => !d.name.startsWith('.'))
  .map((d) => {
    const dir = d.isDirectory() ? C(`moments/${d.name}`) : null;
    const file = dir ? join(dir, 'index.md') : C(`moments/${d.name}`);
    const m = readMd(file);
    const slug = d.name.replace(/\.md$/, '');
    const images = (m.data.images || []).map((im, k) => {
      const src = typeof im === 'string' ? im : im.src;
      const alt = typeof im === 'string' ? '' : im.alt || '';
      const name = `${slug}-${k + 1}${src.slice(src.lastIndexOf('.'))}`;
      copyFileSync(join(dir, src), join(HERE, 'media', name));
      return { src: `media/${name}`, alt };
    });
    return { slug, ...m, images };
  })
  .filter((a) => !a.data.draft)
  .sort((a, b) => b.data.date - a.data.date);
copyFileSync(join(ROOT, 'public', 'favicon.svg'), join(HERE, 'media', 'favicon.svg'));

/* ── 版块：四个整数命题 ── */
const SECS = [
  {
    n: '1', hour: 'shallow', time: '23:19', hw: '浅梦', hd: '下沉', w: '随笔', d: '断章', badge: '可言说的', en: 'SAYABLE',
    pw: '能说出的，就尽量把它说清楚。',
    pd: '我的语言走到哪里，我的世界便亮到哪里。',
  },
  {
    n: '2', hour: 'deep', time: '01:11', hw: '深眠', hd: '深潜', w: '项目', d: '造物', badge: '可构造的', en: 'BUILDABLE',
    pw: '说不清的，就把它做出来。',
    pd: '不能说出的，会自己显示出来。',
  },
  {
    n: '3', hour: 'rem', time: '02:08', hw: '异相', hd: '悬停', w: '瞬间', d: '闪念', badge: '即逝的', en: 'EPHEMERAL',
    pw: '来不及成文的，先留下一瞥。',
    pd: '每一瞬都是整个世界，下一瞬是另一个。',
  },
  {
    n: '4', hour: 'dawn', time: '06:31', hw: '晨光', hd: '上浮', w: '关于', d: '此身', badge: '存在于此', en: 'PRESENCE',
    pw: '在被叫出名字之前，世界是完整的。',
    pd: '世界随时可能消失，又随时重新被记起。',
  },
];

/* 色板（取自 src/styles/hours.css；入夜一段取 home-storyboard.ts PALETTE 第 0 档） */
const PAL = {
  dusk: { bg: [237, 240, 244], fg: [35, 40, 48], soft: [86, 96, 109], faint: [134, 144, 158], glow: [255, 255, 255, 0.7], dark: 0 },
  shallow: { bg: [225, 231, 239], fg: [35, 40, 48], soft: [86, 96, 109], faint: [134, 144, 158], glow: [255, 255, 255, 0.55], dark: 0 },
  deep: { bg: [20, 27, 41], fg: [230, 233, 239], soft: [154, 166, 184], faint: [108, 120, 138], glow: [120, 150, 200, 0.18], dark: 1 },
  rem: { bg: [38, 33, 53], fg: [236, 230, 241], soft: [169, 159, 186], faint: [124, 115, 140], glow: [170, 140, 210, 0.18], dark: 1 },
  dawn: { bg: [242, 235, 224], fg: [43, 38, 32], soft: [111, 100, 87], faint: [150, 138, 123], glow: [255, 236, 205, 0.7], dark: 0 },
};

const dual = (w, d, tag = 'span', cls = 'mw') => `<${tag} class="${cls}" data-w="${esc(w)}" data-d="${esc(d)}">${esc(w)}</${tag}>`;

function row({ n, title, date, glimpse, thumbs = '', kind }) {
  return `<h3 class="ph">
        <a class="pt" href="#${n}" id="t-${n}" aria-controls="b-${n}" aria-expanded="true">
          <span class="num">${n}</span>
          <span class="ttl">${title}</span>
          <span class="date">${date}</span>
          <span class="glimpse">${thumbs}${glimpse ? `<span class="gl-t">${glimpse}</span>` : ''}</span>
        </a>
      </h3>`;
}

function xrefs(rel, label) {
  if (!rel || !rel.length) return '';
  return `<nav class="xrefs" aria-label="${label}"><span class="xr-h">${label}</span>${rel
    .map((r) => {
      const n = LINKS[r.href];
      const lab = esc(r.label.replace(/\s*→\s*$/, ''));
      return n
        ? `<a class="xref" href="#${n}" data-ref="${n}"><span class="num">${n}</span><span>${lab}</span></a>`
        : `<a href="${esc(r.href)}"><span>${lab}</span></a>`;
    })
    .join('')}</nav>`;
}

const ALL = []; // 供导览：{n, t, depth}

function articleProp(a, k) {
  const n = `1.${k + 1}`;
  const ctx = { num: n, h2: 0, h3: 0, subs: [] };
  const body = md(a.body, ctx);
  ALL.push({ n, t: a.data.title, depth: 1, subs: ctx.subs });
  const d = new Date(a.data.date);
  return `<article class="prop" id="${n}" data-kind="article">
      ${row({ n, title: esc(a.data.title), date: md2(d), glimpse: esc(a.data.description || '') })}
      <div class="pb" id="b-${n}" role="region" aria-labelledby="t-${n}"><div class="pi">
        <p class="meta"><time datetime="${ymd(d).replace(/\./g, '-')}">${ymd(d)}</time><span class="sep"></span>${a.data.tags
          .map((t) => `<span class="tag">${esc(t)}</span>`)
          .join('')}<span class="sep"></span><span>约 ${countChars(a.body).toLocaleString('en')} 字</span></p>
        <div class="md essay">${body}</div>
        ${xrefs(a.data.related, '关联篇章')}
        <a class="fold" href="#1" data-fold="${n}"><span class="num">${n}</span><span>收起</span></a>
      </div></div>
    </article>`;
}

function projectProp(p, k) {
  const n = `2.${k + 1}`;
  const ctx = { num: n, h2: 0, h3: 0, subs: [] };
  const body = md(p.body, ctx);
  ALL.push({ n, t: p.data.title, depth: 1, subs: ctx.subs });
  const d = new Date(p.data.date);
  const links = (p.data.links || [])
    .map((l) => `<a class="ext" href="${esc(l.href)}" target="_blank" rel="noopener"><span>${esc(l.label)}</span><span class="url">${esc(l.href.replace(/^https?:\/\//, ''))}</span><span class="arr">↗</span></a>`)
    .join('');
  const note = p.data.note
    ? `<aside class="note">${dual(p.data.note.awake, p.data.note.dream, 'p', 'mw note-t')}</aside>`
    : '';
  return `<article class="prop" id="${n}" data-kind="project">
      ${row({ n, title: `<span class="fancy">${esc(p.data.title)}</span>`, date: md2(d), glimpse: esc(p.data.description || '') })}
      <div class="pb" id="b-${n}" role="region" aria-labelledby="t-${n}"><div class="pi">
        <p class="lead">${esc(p.data.description || '')}</p>
        <p class="meta"><time>${ymd(d)}</time><span class="sep"></span><span class="status">${esc(p.data.status)}</span></p>
        <div class="md work">${body}</div>
        ${links ? `<div class="links">${links}</div>` : ''}
        ${note}
        ${xrefs(p.data.related, '关联篇章')}
        <a class="fold" href="#2" data-fold="${n}"><span class="num">${n}</span><span>收起</span></a>
      </div></div>
    </article>`;
}

function momentProp(m, k) {
  const n = `3.${k + 1}`;
  ALL.push({ n, t: m.data.title || hm(new Date(m.data.date)), depth: 1, subs: [] });
  const d = new Date(m.data.date);
  const text = m.body.trim();
  const firstLine = text
    .split('\n')
    .find((l) => l.trim())
    ?.replace(/\(\(([^|)]+?)(?:\|[^)]*)?\)\)/g, '$1')
    .replace(/\{\{([^|}]+?)(?:\|[^}]*)?\}\}/g, '$1');
  const glimpse = firstLine ? esc(firstLine) : m.images.map((im) => esc(im.alt)).join(' · ');
  const thumbs = m.images.length
    ? `<span class="thumbs" aria-hidden="true">${m.images.map((im) => `<img src="${im.src}" alt="" loading="lazy">`).join('')}</span>`
    : '';
  const imgs = m.images.length
    ? `<div class="plates n${m.images.length}">${m.images
        .map((im, j) => `<figure class="plate"><img src="${im.src}" alt="${esc(im.alt)}" loading="lazy"><figcaption><span class="num">${j + 1}</span>${esc(im.alt)}</figcaption></figure>`)
        .join('')}</div>`
    : '';
  const ctx = { num: n, h2: 0, h3: 0, subs: [] };
  return `<article class="prop" id="${n}" data-kind="moment">
      ${row({ n, title: esc(m.data.title || ''), date: `${mdOf(d)}<i>${hm(d)}</i>`, glimpse, thumbs })}
      <div class="pb" id="b-${n}" role="region" aria-labelledby="t-${n}"><div class="pi">
        ${imgs}
        ${text ? `<div class="md moment">${md(text, ctx)}</div>` : ''}
        <p class="meta"><time>${ymd(d)} ${hm(d)}</time><span class="sep"></span>${m.data.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</p>
        <a class="fold" href="#3" data-fold="${n}"><span class="num">${n}</span><span>收起</span></a>
      </div></div>
    </article>`;
}

function secHead(s) {
  ALL.push({ n: s.n, t: s.pw, depth: 0, subs: [] });
  return `<header class="sh-head">
      <h2 class="sp"><a class="sa" href="#${s.n}"><span class="num">${s.n}</span></a>${dual(s.pw, s.pd, 'span', 'mw sp-t')}</h2>
      <p class="badge"><span class="bn">${dual(s.w, s.d)}</span><span class="bw">${s.badge}</span><span class="be">${s.en}</span><span class="bt"><span class="tm">${s.time}</span>${dual(s.hw, s.hd)}</span></p>
    </header>`;
}

const rgb = (c) => `rgb(${c[0]} ${c[1]} ${c[2]})`;
const tide = (from, to) =>
  `<div class="tide" aria-hidden="true" data-from="${from}" data-to="${to}" style="--from:${rgb(PAL[from].bg)};--to:${rgb(PAL[to].bg)}"></div>`;

/* 题记：逐字失焦，越往「融化」越散（沿用主页 heroFx 的三档） */
const MOTTO = ['在即将醒来的那一瞬，', '世界究竟是在成形，', '还是正在融化？'];
const FX = { 1: 1, 4: 2, 5: 1, 7: 1, 8: 1, 9: 1, 11: 1, 13: 2, 14: 1, 18: 1, 19: 1, 21: 1, 22: 2, 23: 3, 24: 3, 25: 2 };
let ci = 0;
const motto = MOTTO.map(
  (line) =>
    `<span class="ml">${Array.from(line)
      .map((ch) => {
        const i = ci++;
        return `<span class="mc${FX[i] ? ` b${FX[i]}` : ''}" style="--i:${i}">${ch}</span>`;
      })
      .join('')}</span>`,
).join('');

const s1 = SECS[0], s2 = SECS[1], s3 = SECS[2], s4 = SECS[3];
const sec1 = `<section class="sec" id="1" data-hour="shallow" aria-label="1 随笔"><div class="ghost" aria-hidden="true"><span>1</span></div>${secHead(s1)}${articles.map(articleProp).join('\n')}</section>`;
const sec2 = `<section class="sec" id="2" data-hour="deep" aria-label="2 项目"><div class="ghost" aria-hidden="true"><span>2</span></div>${secHead(s2)}${projects.map(projectProp).join('\n')}</section>`;
const sec3 = `<section class="sec" id="3" data-hour="rem" aria-label="3 瞬间"><div class="ghost" aria-hidden="true"><span>3</span></div>${secHead(s3)}${moments.map(momentProp).join('\n')}</section>`;
const sec4 = `<section class="sec last" id="4" data-hour="dawn" aria-label="4 关于"><div class="ghost" aria-hidden="true"><span>4</span></div>${secHead(s4)}
      <p class="exits">
        <a href="https://github.com/Traveritas" target="_blank" rel="noopener">GitHub<small>github.com/Traveritas</small></a>
        <a href="https://github.com/Traveritas/traveritas.github.io" target="_blank" rel="noopener">本站源码<small>traveritas.github.io</small></a>
        <a href="/rss.xml">RSS<small>/rss.xml</small></a>
        <a href="/nexus/?from=blog">NEXUS<small>/nexus/</small></a>
      </p>
      <p class="colophon"><span class="seam" aria-hidden="true"></span>${dual('Traveritas', 'AveritA')}<span class="tm">06:31</span></p>
    </section>`;

/* 「命题」的列表也写进页面，供导览（脚本端读） */
const navData = JSON.stringify(ALL);
const palData = JSON.stringify(PAL);

const html = `<!doctype html>
<html lang="zh-CN" class="nojs" data-reality="wake">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Traveritas的个人网站 · 命题体</title>
<meta name="description" content="在即将醒来的那一瞬，世界究竟是在成形，还是正在融化？">
<script>document.documentElement.className='js';</script>
<link rel="icon" href="media/favicon.svg">
<link rel="preload" href="fonts/serif.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="style.css">
</head>
<body>
<a class="skip" href="#1">跳到正文</a>
<div class="ambient" aria-hidden="true"></div>

<header class="bar">
  <a class="brand" href="#top">${dual('Traveritas', 'AveritA')}</a>
  <span class="here" aria-hidden="true"><span class="num">—</span><span class="here-t"></span></span>
  <button class="toggle" type="button" aria-pressed="false" aria-label="换到另一面">
    <span class="tg-w">醒</span><span class="tg-track"><i></i></span><span class="tg-d">梦</span>
  </button>
</header>

<nav class="rail" aria-label="命题导览"><ol class="rail-list"></ol><span class="rail-loc" aria-hidden="true"><span class="num"></span></span></nav>

<main class="doc" id="top">
  <h1 class="sr">Traveritas的个人网站 —— 随笔、项目，与正在成形的东西。</h1>
  <section class="motto-sec" data-hour="dusk">
    <p class="motto"><span class="tm motto-t">23:07</span>${motto}</p>
  </section>
  ${tide('dusk', 'shallow')}
  ${sec1}
  ${tide('shallow', 'deep')}
  ${sec2}
  ${tide('deep', 'rem')}
  ${sec3}
  ${tide('rem', 'dawn')}
  ${sec4}
</main>

<script id="nav-data" type="application/json">${navData}</script>
<script id="pal-data" type="application/json">${palData}</script>
<script src="app.js" defer></script>
</body>
</html>
`;

writeFileSync(join(HERE, 'index.html'), html);
console.log('[tractatus] index.html 写好', (html.length / 1024).toFixed(1), 'KB');

/* ── 字体：Noto Serif SC 可变字体按页面用字切子集（保留 wght 轴，原型要用 400–700 之间的连续字重） ── */
const SRC = join(ROOT, '.cache', 'fonts', 'NotoSerifSC[wght].ttf');
mkdirSync(join(HERE, 'fonts'), { recursive: true });
const plex = join(ROOT, 'node_modules', '@fontsource', 'ibm-plex-mono', 'files', 'ibm-plex-mono-latin-400-normal.woff2');
if (existsSync(plex)) copyFileSync(plex, join(HERE, 'fonts', 'plex-mono-400.woff2'));
if (!existsSync(SRC)) {
  console.warn('[tractatus] 没找到 .cache/fonts/NotoSerifSC[wght].ttf（先在仓库根目录跑一次 npm run fonts），正文将落回系统宋体');
} else {
  const subsetFont = req('subset-font');
  const extra = readFileSync(join(HERE, 'app.js'), 'utf8') + readFileSync(join(HERE, 'style.css'), 'utf8');
  const text = Array.from(new Set(Array.from(html + extra + ' 0123456789'))).join('');
  const buf = await subsetFont(readFileSync(SRC), text, {
    targetFormat: 'woff2',
    variationAxes: { wght: { min: 400, max: 700 } },
  });
  writeFileSync(join(HERE, 'fonts', 'serif.woff2'), buf);
  console.log('[tractatus] fonts/serif.woff2', (buf.length / 1024).toFixed(0), 'KB');
}
