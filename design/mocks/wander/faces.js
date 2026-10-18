/* ─────────────────────────────────────────────────────────────
   卡面：最简的窗。
   一片半透明的薄片 + 1px 边 + 一道标题栏（圆点 · 版块名 · 英文 · 右侧日期），下面是内容。
   不做像素边、不做假按钮——像素与定格归空间（流光、失焦），窗本身保持干净、连续。

   每张卡用 canvas 2D 画一次（固定 2× 密度，检索视图里按 0.6–0.9 缩放时字仍清楚），
   再降采样出三档失焦（每像素 6 / 12 / 24 个世界单位）。投影与背后的磨砂不画进图里，
   由 CSS 给（box-shadow / backdrop-filter），这样窗在空间里是真的「浮着」的。

   ?many=1：每个版块复制到十几条（标题加序号、日期往前推），试检索视图在内容变多时排不排得开。
   ───────────────────────────────────────────────────────────── */
(() => {
  'use strict';
  const D = window.PLANE_DATA;
  const IMG = (p) => `../layout-plane/${p}`;
  const R = 2;
  const LODS = [6, 12, 24];
  const TB = 30; // 标题栏高
  const RAD = 3;

  /* 窗的墨色：浅底（随笔）与两种深底 */
  const INK = {
    essay: { glass: 'rgba(250, 251, 253, 0.62)', edge: 'rgba(52, 62, 82, 0.24)', hair: 'rgba(52, 62, 82, 0.13)', chip: 'rgba(118, 86, 64, 0.32)', sheen: [255, 255, 255, 0.46], fg: '#232830', soft: '#56606d', faint: '#8a94a2', ink: '#765640', dot: '#3a414c' },
    project: { glass: 'rgba(16, 26, 42, 0.56)', edge: 'rgba(168, 206, 226, 0.24)', hair: 'rgba(168, 206, 226, 0.13)', chip: 'rgba(201, 167, 126, 0.34)', sheen: [190, 225, 240, 0.11], fg: '#e6ebf1', soft: '#a6b4c6', faint: '#71849c', ink: '#c9a77e', dot: '#cfdbe6' },
    moment: { glass: 'rgba(40, 30, 56, 0.54)', edge: 'rgba(236, 196, 180, 0.24)', hair: 'rgba(236, 196, 180, 0.13)', chip: 'rgba(224, 170, 134, 0.34)', sheen: [250, 215, 200, 0.1], fg: '#f0e9f4', soft: '#bcadca', faint: '#877a98', ink: '#e0aa86', dot: '#e8dcec' },
  };
  const LABEL = { essay: ['随笔', 'ESSAY'], project: ['项目', 'PROJECT'], moment: ['瞬间', 'MOMENT'] };
  const SERIF = "'Noto Serif SC', 'Source Han Serif SC', SimSun, serif";
  const MONO = "'IBM Plex Mono', Consolas, monospace";
  const dot = (d) => d.slice(0, 10).replace(/-/g, '.');
  const paras = (s) => (s || '').split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
  const rgba = ([r, g, b], a) => `rgba(${r}, ${g}, ${b}, ${a})`;
  const CN = ['', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四', '十五'];

  /* ══ 条目 ══ */
  function shiftDate(d, days) {
    const t = new Date(`${d.slice(0, 10)}T12:00:00Z`);
    t.setUTCDate(t.getUTCDate() - days);
    return t.toISOString().slice(0, 10);
  }
  function items(many) {
    const essay = [];
    const project = [];
    const moment = [];
    const reps = many ? 7 : 1;
    for (let r = 0; r < reps; r++) {
      const tag = (it) => (r ? Object.assign({}, it, { title: `${it.title} · ${CN[r]}`, date: shiftDate(it.date, r * 23 + 5) }) : it);
      D.articles.forEach((a) => essay.push({ scene: 'essay', kind: 'article', ref: tag(a), w: 420, h: 250 }));
      D.projects.forEach((p) => project.push({ scene: 'project', kind: 'project', ref: tag(p), w: 440, h: 262 }));
      for (const m0 of D.moments) {
        const m = tag(m0);
        if (m.images.length) m.images.forEach((im, k) => moment.push({ scene: 'moment', kind: 'img', ref: m, k: k + 1, w: 340, h: TB + Math.round((340 * im.h) / im.w) + 44 }));
        else moment.push({ scene: 'moment', kind: 'note', ref: m, w: 330, h: 206 });
      }
    }
    const all = { essay, moment, project };
    for (const s in all) {
      // 检索视图按日期倒排；多图瞬间按原顺序挨着
      all[s].sort((a, b) => (b.ref.date > a.ref.date ? 1 : b.ref.date < a.ref.date ? -1 : (a.k || 0) - (b.k || 0)));
      all[s].forEach((it, i) => {
        it.id = `${s}-${i}`;
        it.i = i;
        it.title = it.ref.title;
        it.text = [it.ref.title, it.ref.desc || '', (it.ref.tags || []).join(' '), it.ref.text || '', it.kind === 'img' ? it.ref.images[it.k - 1].alt || '' : ''].join(' ').toLowerCase();
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
    const { w, h } = it;
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
      const im = a.images[it.k - 1];
      titleBar(ctx, it, c, dot(a.date), a.images.length > 1 ? `${it.k} / ${a.images.length}` : '');
      const pic = await loadImage(IMG(im.m));
      const ih = h - TB - 44;
      if (pic) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(1, TB + 1, w - 2, ih);
        ctx.clip();
        const sc = Math.max((w - 2) / pic.width, ih / pic.height);
        const pw = pic.width * sc;
        const ph = pic.height * sc;
        ctx.drawImage(pic, 1 + (w - 2 - pw) / 2, TB + 1 + (ih - ph) / 2, pw, ph);
        ctx.restore();
        ctx.fillStyle = c.hair;
        ctx.fillRect(0, TB + 1 + ih, w, 1);
      }
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

  const measureCtx = document.createElement('canvas').getContext('2d');
  async function paint(it) {
    const c = INK[it.scene];
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

  async function build({ many = false } = {}) {
    const all = items(many);
    const text = JSON.stringify(D);
    await Promise.all([
      document.fonts.load(`500 23px ${SERIF}`, text),
      document.fonts.load(`600 12.5px ${SERIF}`, '随笔项目瞬间'),
      document.fonts.load(`400 13px ${SERIF}`, text),
      document.fonts.load(`400 10px ${MONO}`, '0123456789 .·ESAYPROJCTMN°'),
    ]).catch(() => {});
    await document.fonts.ready;
    // 同一条的副本（?many）共用一张图不行——标题不同；但画是并行的，几十张也只要一两秒
    for (const s in all) await Promise.all(all[s].map(paint));
    return all;
  }

  window.WanderFaces = { build, LODS, INK, LABEL, TB };
})();
