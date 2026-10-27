/* ─────────────────────────────────────────────────────────────
 卡面：最简的窗。
 一片半透明的薄片 + 1px 边 + 一道标题栏（圆点 · 版块名 · 英文 · 右侧日期），下面是内容。
 不做像素边、不做假按钮——像素与定格归空间（流光、失焦），窗本身保持干净、连续。

 每张卡用 canvas 2D 画一次（固定 2× 密度，检索视图里按 0.6–0.9 缩放时字仍清楚），
 再降采样出三档失焦（每像素 6 / 12 / 24 个世界单位）。投影与背后的磨砂不画进图里，
 由 CSS 给（box-shadow / backdrop-filter），这样窗在空间里是真的「浮着」的。

 数据由 WanderIndex.astro 在构建期写进页面（见 readData）。
 ───────────────────────────────────────────────────────────── */
const R = 2;
const LODS = [6, 12, 24];
const TB = 30; // 标题栏高
const RAD = 3;
// 画卡的先后：随笔 → 瞬间 → 项目（与屏上从左到右一致，首屏每栏取前几张）
const SCENE_ORDER = ['essay', 'moment', 'project'];

/* 窗的墨色：浅底（随笔）与两种深底。ink 与 chip 是强调色那一族（怎么推出来的见 design/accent-contrast.cjs） */
const INK = {
  essay: { glass: 'rgba(250, 251, 253, 0.62)', edge: 'rgba(52, 62, 82, 0.24)', hair: 'rgba(52, 62, 82, 0.13)', chip: 'rgba(79, 74, 102, 0.32)', sheen: [255, 255, 255, 0.46], fg: '#232830', soft: '#56606d', faint: '#8a94a2', ink: '#4f4a66', dot: '#3a414c' },
  project: { glass: 'rgba(16, 26, 42, 0.56)', edge: 'rgba(168, 206, 226, 0.24)', hair: 'rgba(168, 206, 226, 0.13)', chip: 'rgba(152, 139, 182, 0.34)', sheen: [190, 225, 240, 0.11], fg: '#e6ebf1', soft: '#a6b4c6', faint: '#71849c', ink: '#988bb6', dot: '#cfdbe6' },
  moment: { glass: 'rgba(40, 30, 56, 0.54)', edge: 'rgba(236, 196, 180, 0.24)', hair: 'rgba(236, 196, 180, 0.13)', chip: 'rgba(156, 146, 200, 0.34)', sheen: [250, 215, 200, 0.1], fg: '#f0e9f4', soft: '#bcadca', faint: '#877a98', ink: '#9c92c8', dot: '#e8dcec' },
};
const LABEL = { essay: ['随笔', 'ESSAY'], project: ['项目', 'PROJECT'], moment: ['瞬间', 'MOMENT'] };
const SERIF = "'Noto Serif SC', 'Source Han Serif SC', SimSun, serif";
const MONO = "'IBM Plex Mono', Consolas, monospace";
const dot = (d) => d.slice(0, 10).replace(/-/g, '.');
const paras = (s) => (s || '').split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
const rgba = ([r, g, b], a) => `rgba(${r}, ${g}, ${b}, ${a})`;

/* ══ 多图瞬间的排法（工具栏「多图」，存在 localStorage 的 xm-multi）══
   grid 网格：2 列（≥5 张 3 列）方格裁切；row 并排：一行、各自的比例，放不下就溢出右缘；car 轮播：窗面上只摆第一张 + 圆点。
   改了设置（工具栏发 xm-multi 事件）由 repaintMulti 就地重画多图的窗；阅读窗每次现读。 */
const MULTI = ['grid', 'row', 'car'];
function multi() {
  try {
    const v = localStorage.getItem('xm-multi');
    return MULTI.includes(v) ? v : 'grid';
  } catch {
    return 'grid';
  }
}
const GAP = 2;
/* 图区的几何：{ mode, ih（图区高）, cells: [{x, y, w, h}] }，相对图区左上；单图 / 轮播只有一格 */
function picLayout(images, w, mode) {
  const n = images.length;
  const iw = w - 2;
  if (n === 1 || mode === 'car') {
    // 单图照旧不裁；轮播各张共用一个框，按第一张定、收在一个范围里
    const r = images[0].h / images[0].w;
    const ih = Math.round(n === 1 ? w * r : Math.min(Math.max(iw * r, iw * 0.62), iw * 1.2));
    return { mode: n === 1 ? 'one' : 'car', ih, cells: [{ x: 0, y: 0, w: iw, h: ih }] };
  }
  if (mode === 'row') {
    // 并排：一行，各张保持自己的比例、同一高度；放得下就正好铺满一行，放不下就从右缘溢出去（读的时候横着滑）
    const rs = images.map((im) => im.w / im.h);
    const fit = (iw - GAP * (n - 1)) / rs.reduce((a, b) => a + b, 0);
    const ih = Math.round(Math.max(fit, iw * 0.5));
    let x = 0;
    const cells = rs.map((r) => { const c = { x, y: 0, w: ih * r, h: ih }; x += ih * r + GAP; return c; });
    return { mode: 'row', ih, cells };
  }
  const cols = n >= 5 ? 3 : 2;
  const cw = (iw - GAP * (cols - 1)) / cols;
  const rows = Math.ceil(n / cols);
  const ih = Math.round(rows * cw + GAP * (rows - 1));
  return { mode: 'grid', ih, cells: images.map((_, i) => ({ x: (i % cols) * (cw + GAP), y: Math.floor(i / cols) * (cw + GAP), w: cw, h: cw })) };
}

/* ══ 条目 ══ */
function items(D) {
  const essay = D.articles.map((a) => ({ scene: 'essay', kind: 'article', ref: a, w: 420, h: 250 }));
  const project = D.projects.map((p) => ({ scene: 'project', kind: 'project', ref: p, w: 440, h: 262 }));
  const moment = [];
  for (const m of D.moments) {
    // 一则瞬间 = 一扇窗，所有配图都在里面
    if (m.images.length) {
      const pl = picLayout(m.images, 340, multi());
      moment.push({ scene: 'moment', kind: 'img', ref: m, w: 340, h: TB + pl.ih + 44, _pl: pl });
    } else moment.push({ scene: 'moment', kind: 'note', ref: m, w: 330, h: 206 });
  }
  const all = { essay, moment, project };
  for (const s in all) {
    // 检索视图按日期倒排
    all[s].sort((a, b) => (b.ref.date > a.ref.date ? 1 : b.ref.date < a.ref.date ? -1 : 0));
    all[s].forEach((it, i) => {
      it.id = `${s}-${i}`;
      it.i = i;
      it.title = it.ref.title;
      // 「年-月」也进检索文本：工具栏的年月圈拿它当一个词筛（2026-10）
      it.text = [it.ref.title, it.ref.desc || '', (it.ref.tags || []).join(' '), (it.ref.date || '').slice(0, 7), it.ref.text || '', (it.ref.images || []).map((im) => im.alt || '').join(' ')].join(' ').toLowerCase();
    });
  }
  return all;
}

/* ══ 排字 ══ */
function wrap(ctx, text, maxW, maxLines) {
  const out = [];
  let line = '';
  const tokens = text.match(/[A-Za-z0-9À-ɏ'’.-]+|\s+|./gu) || [];
  const CLOSE = /^[，。、；：！？）」』》〉·…—,.;:!?)]/u;
  let cut = false;
  for (const tk of tokens) {
    const next = line + tk;
    if (ctx.measureText(next).width > maxW && line.trim() && !CLOSE.test(tk)) {
      out.push(line);
      line = tk.trimStart();
      if (out.length === maxLines) { cut = true; break; }
    } else line = next;
  }
  if (out.length < maxLines && line) out.push(line);
  if (cut && out.length) {
    let l = out[out.length - 1];
    while (l.length > 1 && ctx.measureText(`${l}…`).width > maxW) l = l.slice(0, -1);
    out[out.length - 1] = `${l.replace(/[，。、；：\s]+$/u, '')}…`;
  }
  return out;
}
function track(ctx, text, x, y, sp) {
  let cx = x;
  for (const ch of Array.from(text)) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + sp;
  }
  return cx;
}
function trackW(ctx, text, sp) {
  let w = 0;
  for (const ch of Array.from(text)) w += ctx.measureText(ch).width + sp;
  return w - sp;
}
function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* 预热配图：瞬间的窗要等图下载完才能画。图片原本是「轮到画这张卡时」才开始请求的，
   首屏那张图卡因此要空等 4 张图的下载（移动端实测首张卡 3.5s 才出来）。
   这里在开始画之前就把首屏几张卡的图并发拉起来 —— 与画卡并行，不再串行。
   loadImage 有缓存，后面真正画的时候直接命中，不会重复请求。 */
function prewarm(list) {
  for (const it of list) {
    if (it.kind !== 'img' || !it._pl) continue;
    for (const im of (it.ref.images || []).slice(0, it._pl.cells.length)) loadImage(im.m);
  }
}

const imgCache = new Map();
function loadImage(src) {
  if (!imgCache.has(src))
    imgCache.set(src, new Promise((res) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => res(null);
      im.src = src;
    }));
  return imgCache.get(src);
}

/* ══ 窗 ══ */
function frame(ctx, it, c) {
  const { w, h } = it;
  rrect(ctx, 0, 0, w, h, RAD);
  ctx.fillStyle = c.glass;
  ctx.fill();
  ctx.save();
  ctx.clip();
  // 迎光：左上一道斜向的亮（115°，到 42% 处归零）
  const g = ctx.createLinearGradient(0, 0, w * 0.62, h * 0.9);
  g.addColorStop(0, rgba(c.sheen, c.sheen[3]));
  g.addColorStop(0.42, rgba(c.sheen, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // 标题栏下的发丝线
  ctx.fillStyle = c.hair;
  ctx.fillRect(0, TB, w, 1);
  ctx.restore();
  rrect(ctx, 0.5, 0.5, w - 1, h - 1, RAD);
  ctx.strokeStyle = c.edge;
  ctx.lineWidth = 1;
  ctx.stroke();
}

/* 标题栏：不再写版块名（三栏 / 三种夜色已经说了它是什么），只放日期——
   左边一个空心小圈 + 日期，右边一条次要的信息（字数 / 状态 / 第几张）。 */
function titleBar(ctx, it, c, date, right, rightInk) {
  const { w } = it;
  ctx.beginPath();
  ctx.arc(14.5, TB / 2, 3.6, 0, Math.PI * 2);
  ctx.strokeStyle = c.dot;
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = 1.1;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.font = `500 11px ${MONO}`;
  ctx.fillStyle = c.fg;
  ctx.globalAlpha = 0.78;
  track(ctx, date, 26, TB / 2 + 3.8, 1.6);
  ctx.globalAlpha = 1;
  if (right) {
    ctx.font = rightInk ? `400 11.5px ${SERIF}` : `400 10px ${MONO}`;
    ctx.fillStyle = rightInk ? c.ink : c.faint;
    const sp = rightInk ? 0.6 : 1.2;
    const rw = trackW(ctx, right, sp);
    track(ctx, right, w - 14 - rw, TB / 2 + 3.8, sp);
  }
}

/* 标签：细边的小签，左对齐排一行，放不下的就不放 */
function chips(ctx, c, labels, x, y, maxX) {
  ctx.font = `400 11.5px ${SERIF}`;
  const H = 20;
  let cx = x;
  for (const raw of labels) {
    const t = raw;
    const tw = ctx.measureText(t).width;
    const cw = tw + 14;
    if (cx + cw > maxX) break;
    rrect(ctx, cx + 0.5, y + 0.5, cw - 1, H - 1, 2);
    ctx.strokeStyle = c.chip;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = c.ink;
    ctx.fillText(t, cx + 7, y + 14);
    cx += cw + 6;
  }
  return cx;
}

/* 文字类的窗：高度按内容排（标题几行、简介几行、有没有标签），不留一大块空 */
const PAD = 22;
function layoutText(ctx, it) {
  const a = it.ref;
  const w = it.w;
  if (it.kind === 'note') {
    ctx.font = `500 17px ${SERIF}`;
    const tl = wrap(ctx, paras(a.text)[0] || '', w - PAD * 2, 3);
    const chipY = TB + 42 + (tl.length - 1) * 28 + 24;
    it._lay = { tl, chipY };
    it.h = chipY + 20 + PAD;
    return;
  }
  ctx.font = `500 24px ${SERIF}`;
  const tl = wrap(ctx, a.title, w - PAD * 2, 2);
  const t0 = TB + 44;
  ctx.font = `400 13.5px ${SERIF}`;
  const dl = wrap(ctx, a.desc || '', w - PAD * 2, tl.length > 1 ? 2 : 3);
  const d0 = t0 + (tl.length - 1) * 33 + 30;
  const labels = it.kind === 'project' ? (a.links || []).map((l) => `${l.label} ↗`) : a.tags || [];
  const last = d0 + (dl.length - 1) * 22.5;
  const chipY = last + 26;
  it._lay = { tl, dl, t0, d0, labels, chipY };
  it.h = Math.max(170, labels.length ? chipY + 20 + PAD : last + PAD + 8);
}

async function content(ctx, it, c) {
  const { w, h } = it;
  const a = it.ref;
  const pad = PAD;
  if (it.kind === 'article' || it.kind === 'project') {
    const isP = it.kind === 'project';
    const { tl, dl, t0, d0, labels, chipY } = it._lay;
    titleBar(ctx, it, c, dot(a.date), isP ? a.status : `${a.chars} 字`, isP);
    // 标题：版面的主角
    ctx.font = `500 24px ${SERIF}`;
    ctx.fillStyle = c.fg;
    tl.forEach((l, i) => ctx.fillText(l, pad, t0 + i * 33));
    // 简介
    ctx.font = `400 13.5px ${SERIF}`;
    ctx.fillStyle = c.soft;
    dl.forEach((l, i) => ctx.fillText(l, pad, d0 + i * 22.5));
    // 底：标签（项目是链接）
    chips(ctx, c, labels, pad, chipY, w - pad);
  } else if (it.kind === 'img') {
    const n = a.images.length;
    const pl = it._pl;
    titleBar(ctx, it, c, dot(a.date), n > 1 ? (pl.mode === 'car' ? `1 / ${n}` : `${n} 张`) : '');
    const ih = pl.ih;
    const pics = await Promise.all(a.images.slice(0, pl.cells.length).map((im) => loadImage(im.m)));
    ctx.save();
    ctx.beginPath();
    ctx.rect(1, TB + 1, w - 2, ih);
    ctx.clip();
    pl.cells.forEach((cell, i) => {
      const pic = pics[i];
      if (!pic) return;
      const x0 = 1 + cell.x;
      const y0 = TB + 1 + cell.y;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, y0, cell.w, cell.h);
      ctx.clip();
      const sc = Math.max(cell.w / pic.width, cell.h / pic.height);
      const pw = pic.width * sc;
      const ph = pic.height * sc;
      ctx.drawImage(pic, x0 + (cell.w - pw) / 2, y0 + (cell.h - ph) / 2, pw, ph);
      ctx.restore();
    });
    // 轮播：图底几粒安静的圆点，第一粒是此刻
    if (pl.mode === 'car') {
      const gap = 11;
      const x0 = w / 2 - ((n - 1) * gap) / 2;
      const y0 = TB + 1 + ih - 14;
      // 底下垫一条淡暗的衬，浅色的图上圆点也看得见
      rrect(ctx, x0 - 11, y0 - 7, (n - 1) * gap + 22, 14, 7);
      ctx.fillStyle = 'rgba(24, 18, 40, 0.34)';
      ctx.fill();
      for (let i = 0; i < n; i++) {
        ctx.beginPath();
        ctx.arc(x0 + i * gap, y0, i ? 2.2 : 2.8, 0, Math.PI * 2);
        ctx.fillStyle = i ? 'rgba(255, 255, 255, 0.5)' : 'rgba(255, 255, 255, 0.95)';
        ctx.fill();
      }
    }
    ctx.restore();
    ctx.fillStyle = c.hair;
    ctx.fillRect(0, TB + 1 + ih, w, 1);
    // 图注：标题在左，第一个标签在右
    const tag = (a.tags || [])[0];
    ctx.font = `400 11px ${SERIF}`;
    const tagW = tag ? ctx.measureText(tag).width : 0;
    ctx.font = `500 14px ${SERIF}`;
    ctx.fillStyle = c.fg;
    ctx.fillText(wrap(ctx, a.title, w - 32 - (tag ? tagW + 26 : 0), 1)[0] || '', 16, h - 16);
    if (tag) {
      ctx.font = `400 11px ${SERIF}`;
      ctx.fillStyle = c.ink;
      ctx.fillText(tag, w - 16 - tagW, h - 16);
    }
  } else if (it.kind === 'note') {
    titleBar(ctx, it, c, dot(a.date), '');
    ctx.font = `500 17px ${SERIF}`;
    ctx.fillStyle = c.fg;
    it._lay.tl.forEach((l, i) => ctx.fillText(l, pad, TB + 42 + i * 28));
    chips(ctx, c, a.tags || [], pad, it._lay.chipY, w - pad);
  }
}

/* 各档图的 blob URL。第一档（清晰那档）单独返回，另外三档延后补：
   首页 / 目录页第一次画完所有窗要 4–5s（移动端 4× 节流实测），期间页面一片空白。
   现在 paint() 只等第一档，其余三档在空闲时补齐，拿到之前 apply() 继续用第一档顶上
   ——顶替的是「还没降采样」的那张，本来就不糊，只是远景少了点像素味的失焦。

   编码用 WebP 不用 PNG：同一张卡（840×500 @2x）在 4× 节流下
   PNG toBlob 实测 93–100ms/张、WebP(q.92) 约 55–66ms，而体积从 250KB 降到 ~95KB
   ——十几张卡连着画，光这一步就差出 0.5s 以上，而 LCP 就压在「最后一张大卡画完」上。 */
const MIME = 'image/webp';
const QUALITY = 0.92;
async function toURL(canvas) {
  return new Promise((res) => canvas.toBlob((b) => res(b ? URL.createObjectURL(b) : ''), MIME, QUALITY));
}
function downscale(cv, w, h, f) {
  const lw = Math.max(2, Math.round(w / f));
  const lh = Math.max(2, Math.round(h / f));
  const mid = document.createElement('canvas');
  mid.width = Math.max(lw * 2, 4);
  mid.height = Math.max(lh * 2, 4);
  const mc = mid.getContext('2d');
  mc.imageSmoothingQuality = 'high';
  mc.drawImage(cv, 0, 0, mid.width, mid.height);
  const lo = document.createElement('canvas');
  lo.width = lw;
  lo.height = lh;
  const lc = lo.getContext('2d');
  lc.imageSmoothingQuality = 'high';
  lc.drawImage(mid, 0, 0, lw, lh);
  return lo;
}
/* 空闲时再补齐剩下的档位（别和自己的绘制抢同一帧）：写回 it.lod，
   标记 _ver +1 —— apply() 见到版本变了会把正在显示的那一档重贴上去 */
const idle = (fn) =>
  (typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 2000 }) : setTimeout(fn, 120));
const nextIdle = (timeout = 120) =>
  new Promise((res) => {
    if (typeof requestIdleCallback === 'function') requestIdleCallback(() => res(), { timeout });
    else setTimeout(res, 0);
  });
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
async function restLODs(it, cv, w, h) {
  const gen = it._lodGen;
  for (const f of LODS) {
    if (gen !== it._lodGen) return; // 这一条被重画过了（换了「多图」的排法），旧的别写回去
    const url = await toURL(downscale(cv, w, h, f));
    if (gen !== it._lodGen) return;
    if (url) it.lod.push(url);
  }
  // _verHost：重画（repaintMulti）时画在副本 nt 上、结果并回原条目 it，
  // 而 apply() 读的是原条目的 _ver —— 版本号必须记到它身上，否则补完档也没人重贴
  if (gen === it._lodGen) {
    const host = it._verHost || it;
    host._ver = (host._ver || 0) + 1;
  }
}
function scheduleRest(it, cv, w, h) {
  it._lodGen = (it._lodGen || 0) + 1;
  const gen = it._lodGen;
  idle(() => { if (gen === it._lodGen) restLODs(it, cv, w, h); });
}

/* 取某一档的图：档位还没补齐时退到已有的最接近的档，
   再不行就退到第一档（清晰那张）。绝不返回 undefined —— 否则兜底会把窗刷成空。 */
function lodURL(it, i) {
  const a = it.lod || [];
  if (!a.length) return '';
  return a[i] || a[a.length - 1] || '';
}

let measureCtx = null;
/* revoke：重画自己的条目时才回收旧图。repaintMulti 传的是「副本」，
   它的 lod 就是原条目正在用的那个数组 —— 在副本上回收会把屏幕上的窗一起弄坏。 */
async function paint(it, { revoke = true } = {}) {
  const c = INK[it.scene];
  measureCtx ||= document.createElement('canvas').getContext('2d');
  if (it.kind !== 'img') layoutText(measureCtx, it);
  const cv = document.createElement('canvas');
  cv.width = Math.round(it.w * R);
  cv.height = Math.round(it.h * R);
  const ctx = cv.getContext('2d');
  ctx.scale(R, R);
  ctx.textBaseline = 'alphabetic';
  frame(ctx, it, c);
  await content(ctx, it, c);
  // 先只交出第一档：等它就能上屏，其余三档排到空闲时
  const first = await toURL(cv);
  const old = it.lod || [];
  it.lod = first ? [first] : [];
  it._fb = !fontsSettled; // 用的是兜底字，字体到位后要补一遍
  if (revoke) for (const u of old) if (u && u !== first) URL.revokeObjectURL(u);
  (it._verHost || it)._ver = ((it._verHost || it)._ver || 0) + 1;
  scheduleRest(it, cv, it.w, it.h);
}
/** 这条还没画过就现画（阅读窗打开时兜底：别让人点开一扇空窗） */
async function ensurePainted(it) {
  if ((it.lod || []).length) return;
  if (!it._painting) it._painting = paint(it).finally(() => { it._painting = null; });
  await it._painting;
}

const FONT_CAP = 450;
const HEAD = 4; // 第一屏每栏先画几张
let fontsSettled = false;

function loadFonts(D) {
  const text = JSON.stringify(D);
  /* 只等「画卡要用到的那几个字面」，绝不再挂 document.fonts.ready ——
     那是全站字体计划的闩：任何一个分包（体积正文用的 500-1…500-4）还在路上，
     它就不 resolve，移动端实测要 3.3s。卡面只需要这几个字号/字重的行，
     load() 各自 resolves 就够了。 */
  return Promise.all([
    document.fonts.load(`500 23px ${SERIF}`, text),
    document.fonts.load(`600 12.5px ${SERIF}`, '随笔项目瞬间'),
    document.fonts.load(`400 13px ${SERIF}`, text),
    document.fonts.load(`400 10px ${MONO}`, '0123456789 .·ESAYPROJCTMN°'),
  ]).catch(() => {});
}

async function paintMany(list) {
  for (let i = 0; i < list.length; i += 3) {
    await Promise.all(list.slice(i, i + 3).map((it) => paint(it)));
    if (i + 3 < list.length) await nextIdle();
  }
}

async function build(D) {
  const all = items(D);
  const order = SCENE_ORDER.flatMap((s) => all[s]);

  let settled = false;
  const fonts = loadFonts(D).then(() => {
    settled = true;
    fontsSettled = true;
  });
  // 配图和字体的等待并行起来：图先下去，等字体那 450ms 正好用来下载
  prewarm(SCENE_ORDER.flatMap((s) => all[s].slice(0, HEAD)));
  await Promise.race([fonts, sleep(FONT_CAP)]);

  /* 前台只画一张：首屏里**面积最大**的那张，其余全部进后台队列。
     两条约束叠在一起才说得通：
     · 卡片直到 build() 返回才进 DOM，所以「前台画几张」直接等于「首屏要等多久」。
       一张约 250ms（2× 栅格 + WebP 编码），等满 12 张就是 2.8s，全压在 LCP 上
       （实测：等 12 张时首屏卡片到 4.9s 才现身）。
     · LCP 只认「目前为止最大」的那一次刷新。按顺序画的话，起手的小卡先上屏，
       真正最大的那张（瞬间的图卡）最后才到，LCP 就被拖到最后（实测 5.4s）。
       先把最大的那张画出来，它一上屏 LCP 就锁住；后面再贴多小的卡都不再改动它。 */
  const head = new Set();
  for (const s of SCENE_ORDER) for (const it of all[s].slice(0, HEAD)) head.add(it);
  const byArea = (a, b) => b.w * b.h - a.w * a.h;
  const firstScreen = order.filter((it) => head.has(it)).sort(byArea);
  await paintMany(firstScreen.slice(0, 1));

  // 字体迟到（拿了兜底字）：到位后把这些补一遍
  if (!settled) fonts.then(() => paintMany(order.filter((it) => it._fb)));

  /* 后台补画：首屏剩下的先补（同样大的先画），再补首屏之外的。
     一张一张来 —— 和首屏抢主线程的话，先出现的那张反而更晚。 */
  (async () => {
    if (!fontsSettled) await Promise.race([fonts, sleep(2500)]);
    for (const it of firstScreen.slice(1).concat(order.filter((it) => !head.has(it)))) {
      if ((it.lod || []).length) continue;
      await paint(it);
      await nextIdle();
    }
  })();

  return all;
}

/* 「多图」换了：多图瞬间按新排法重算高度、重画各档（旧的各档不放：开着的阅读窗合上时还要用它）。返回改过的条目 */
let multiGen = 0;
async function repaintMulti(all) {
  const mode = multi();
  const gen = ++multiGen;
  const its = all.moment.filter((it) => it.kind === 'img' && it.ref.images.length > 1);
  await Promise.all(its.map(async (it) => {
    // 先在一份副本上画完，再一起换上：画的途中窗不会是新高度配旧图
    const pl = picLayout(it.ref.images, it.w, mode);
    const nt = { ...it, _pl: pl, h: TB + pl.ih + 44, _verHost: it };
    // revoke:false —— nt.lod 从 it 继承来的那个数组正是屏幕在用的一份，不能在这里回收
    await paint(nt, { revoke: false });
    // 连着点了几下：只认最后一次
    if (gen !== multiGen) { for (const u of nt.lod) if (!(it.lod || []).includes(u)) URL.revokeObjectURL(u); return; }
    const gone = (it.lod || []).filter((u) => !nt.lod.includes(u));
    Object.assign(it, { _pl: nt._pl, h: nt.h, lod: nt.lod, _fb: nt._fb, _ver: (it._ver || 0) + 1 });
    for (const u of gone) URL.revokeObjectURL(u);
  }));
  return its;
}

export const Faces = { build, LODS, INK, LABEL, TB, multi, repaintMulti, lodURL, ensurePainted };
