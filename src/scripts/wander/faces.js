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

async function toLODs(cv, w, h) {
  const toURL = (canvas) => new Promise((res) => canvas.toBlob((b) => res(URL.createObjectURL(b))));
  const urls = [await toURL(cv)];
  for (const f of LODS) {
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
    urls.push(await toURL(lo));
  }
  return urls;
}

let measureCtx = null;
async function paint(it) {
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
  it.lod = await toLODs(cv, it.w, it.h);
}

async function build(D) {
  const all = items(D);
  const text = JSON.stringify(D);
  await Promise.all([
    document.fonts.load(`500 23px ${SERIF}`, text),
    document.fonts.load(`600 12.5px ${SERIF}`, '随笔项目瞬间'),
    document.fonts.load(`400 13px ${SERIF}`, text),
    document.fonts.load(`400 10px ${MONO}`, '0123456789 .·ESAYPROJCTMN°'),
  ]).catch(() => {});
  await document.fonts.ready;
  for (const s in all) await Promise.all(all[s].map(paint));
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
    const nt = { ...it, _pl: pl, h: TB + pl.ih + 44 };
    await paint(nt);
    // 连着点了几下：只认最后一次
    if (gen !== multiGen) return nt.lod.forEach((u) => URL.revokeObjectURL(u));
    Object.assign(it, { _pl: nt._pl, h: nt.h, lod: nt.lod, _ver: (it._ver || 0) + 1 });
  }));
  return its;
}

export const Faces = { build, LODS, INK, LABEL, TB, multi, repaintMulti };
