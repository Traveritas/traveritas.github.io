/* ─────────────────────────────────────────────────────────────
   碎片的样子：每张卡用 canvas 2D 画一次，再降采样出几档「失焦」。
   失焦不是高斯模糊，而是像素化：离焦平面越远，像素越粗。
   每档都做成 blob URL，所有副本共用，换档只换背景图。

   外观（?look=）只改「卡面」，内容排法相同；失焦档从画好的卡面降采样，所以自动跟着变：
     frost  半透明磨砂片（默认）
     glow   没有面板：字 / 图背后一团场景色的漏光，边缘由几粒像素光点界定
     slab   厚玻璃：三级像素阶梯斜边（亮边 / 暗边），后面的流光透过来、更清楚一点
     print  偏暖的不透明相纸，带抖动像素的投影
   有的外观要画到卡片外面（漏光、投影），卡片四周留出边距 M，元素按 (w + 2M) × (h + 2M) 摆放、中心不变。

   第二轮的 `?look=` 走注册表（reg.js + variants/looks/*.js）：下面这四个是内置的，
   新外观登记成 DriftReg.look(name, { margin, inset, paper, surface(ctx, it, c, M) })。
   ───────────────────────────────────────────────────────────── */
(() => {
  'use strict';
  const D = window.PLANE_DATA;
  const IMG = (p) => `../layout-plane/${p}`;
  const R = Math.min(2, Math.max(1, devicePixelRatio || 1)); // 清晰档的像素密度
  const LODS = [6, 12, 24]; // 失焦档：每个像素占多少世界单位
  const MARGIN = { frost: 0, glow: 26, slab: 0, print: 16 };
  const lookDef = (look) => (window.DriftReg && window.DriftReg.looks[look]) || null;

  /* 场景配色（frost / glow / slab 共用文字色；print 是纸上的墨） */
  const INK = {
    essay: { fill: 'rgba(246, 248, 251, 0.80)', fg: '#232830', soft: '#56606d', faint: '#8a94a2', ink: '#765640', lit: 'rgba(255,255,255,0.95)', shade: 'rgba(60,72,92,0.22)', glow: [255, 255, 255, 0.62], slab: 'rgba(250, 252, 255, 0.34)', dark: 'rgba(54, 66, 90, 0.4)', paper: '#f3eee6', drop: [40, 50, 72] },
    project: { fill: 'rgba(24, 36, 54, 0.74)', fg: '#e6e9ef', soft: '#a2b0c2', faint: '#6f8199', ink: '#c9a77e', lit: 'rgba(160,214,224,0.62)', shade: 'rgba(0,0,0,0.35)', glow: [104, 178, 196, 0.42], slab: 'rgba(36, 56, 82, 0.36)', dark: 'rgba(0, 0, 0, 0.45)', paper: '#e2dcd1', drop: [0, 0, 0] },
    moment: { fill: 'rgba(50, 38, 66, 0.72)', fg: '#efe8f3', soft: '#b9aac8', faint: '#857895', ink: '#e0aa86', lit: 'rgba(246,190,150,0.55)', shade: 'rgba(0,0,0,0.3)', glow: [236, 164, 132, 0.38], slab: 'rgba(66, 48, 86, 0.36)', dark: 'rgba(0, 0, 0, 0.42)', paper: '#ece2d8', drop: [8, 4, 14] },
  };
  const PAPER_INK = { fg: '#2c2721', soft: '#5e554b', faint: '#978c7f', ink: '#8a5a3a' };
  const SERIF = "'Noto Serif SC', 'Source Han Serif SC', SimSun, serif";
  const MONO = "'IBM Plex Mono', Consolas, monospace";
  const dot = (d) => d.slice(0, 10).replace(/-/g, ' · ');
  const paras = (s) => (s || '').split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
  const rgba = ([r, g, b], a) => `rgba(${r}, ${g}, ${b}, ${a})`;
  const hash = (a, b) => {
    let h = Math.imul(a ^ 0x9e3779b9, 2654435761) ^ Math.imul(b + 0x7f4a7c15, 1597334677);
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
  };
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

  /* 场景里的条目（世界单位尺寸，焦平面上 1:1） */
  function items() {
    const essay = D.articles.map((a) => ({ scene: 'essay', kind: 'article', ref: a, w: 420, h: 260 }));
    const project = D.projects.map((p, n) => ({ scene: 'project', kind: 'project', ref: p, no: String(n + 1).padStart(2, '0'), w: 440, h: 280 }));
    const moment = [];
    for (const m of D.moments) {
      if (m.images.length) m.images.forEach((im, k) => moment.push({ scene: 'moment', kind: 'img', ref: m, k: k + 1, w: 340, h: Math.round((340 * im.h) / im.w) + 54 }));
      else moment.push({ scene: 'moment', kind: 'note', ref: m, w: 320, h: 200 });
    }
    const all = { essay, project, moment };
    for (const s in all) all[s].forEach((it, i) => (it.id = `${s}-${i}`));
    return all;
  }

  /* 卡片外形：四角是像素阶梯（三级，每级 st 个世界单位） */
  function stepPath(ctx, x, y, w, h, s) {
    ctx.beginPath();
    ctx.moveTo(x + 3 * s, y);
    const P = [[w - 3 * s, 0], [w - 3 * s, s], [w - 2 * s, s], [w - 2 * s, 2 * s], [w - s, 2 * s], [w - s, 3 * s], [w, 3 * s],
      [w, h - 3 * s], [w - s, h - 3 * s], [w - s, h - 2 * s], [w - 2 * s, h - 2 * s], [w - 2 * s, h - s], [w - 3 * s, h - s], [w - 3 * s, h],
      [3 * s, h], [3 * s, h - s], [2 * s, h - s], [2 * s, h - 2 * s], [s, h - 2 * s], [s, h - 3 * s], [0, h - 3 * s],
      [0, 3 * s], [s, 3 * s], [s, 2 * s], [2 * s, 2 * s], [2 * s, s], [3 * s, s]];
    for (const [px, py] of P) ctx.lineTo(x + px, y + py);
    ctx.closePath();
  }

  /* 中文按字折行，西文按词；标点避头 */
  function wrap(ctx, text, maxW, maxLines) {
    const out = [];
    let line = '';
    const tokens = text.match(/[A-Za-z0-9À-ɏ'’.-]+|\s+|./gu) || [];
    const CLOSE = /^[，。、；：！？）」』》〉·…—,.;:!?)]/u;
    for (const tk of tokens) {
      const next = line + tk;
      if (ctx.measureText(next).width > maxW && line.trim() && !CLOSE.test(tk)) {
        out.push(line);
        line = tk.trimStart();
        if (out.length === maxLines) break;
      } else line = next;
    }
    if (out.length < maxLines && line) out.push(line);
    return out.slice(0, maxLines);
  }

  function track(ctx, text, x, y, sp) {
    let cx = x;
    for (const ch of Array.from(text)) {
      ctx.fillText(ch, cx, y);
      cx += ctx.measureText(ch).width + sp;
    }
    return cx;
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

  /* ══ 卡面（各外观不同） ══ */
  function surface(ctx, it, look, c, M) {
    const def = lookDef(look);
    if (def && def.surface) return def.surface(ctx, it, c, M, window.DriftReg);
    const { w, h } = it;
    if (look === 'frost') {
      stepPath(ctx, M, M, w, h, 3);
      ctx.fillStyle = c.fill;
      ctx.fill();
      ctx.save();
      ctx.clip();
      // 迎光的一侧（左上）一道 1 单位的像素亮边，背光一侧压暗
      ctx.fillStyle = c.lit;
      ctx.fillRect(M, M, w, 1);
      ctx.fillRect(M, M, 1, h);
      ctx.fillStyle = c.shade;
      ctx.fillRect(M, M + h - 1, w, 1);
      ctx.fillRect(M + w - 1, M, 1, h);
      ctx.restore();
    } else if (look === 'glow') {
      // 一团漏光：椭圆径向渐变，比卡片略大，边缘完全化开
      const g = c.glow;
      ctx.save();
      ctx.translate(M + w / 2, M + h / 2);
      ctx.scale((w + M * 1.6) / 2, (h + M * 1.6) / 2);
      const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      grd.addColorStop(0, rgba(g, g[3]));
      grd.addColorStop(0.55, rgba(g, g[3] * 0.62));
      grd.addColorStop(1, rgba(g, 0));
      ctx.fillStyle = grd;
      ctx.fillRect(-1, -1, 2, 2);
      ctx.restore();
      // 边缘：沿卡片外框散几粒像素光点，界定出一块看不见的面
      // 点数少、沿边随机、并在法向上前后错开几格，免得连成一条虚线
      const n = Math.round((w + h) / 34);
      const seed = it.id.length * 131 + it.w + it.h * 7;
      for (let i = 0; i < n; i++) {
        const u = 0.06 + hash(seed, i) * 0.88;
        const side = Math.floor(hash(seed, i + 99) * 4);
        const sz = hash(seed, i + 7) < 0.3 ? 3 : 2;
        const off = Math.round((hash(seed, i + 51) - 0.5) * 16);
        let x;
        let y;
        if (side < 2) { x = M + u * w; y = (side === 0 ? M - 2 : M + h) + off; }
        else { y = M + u * h; x = (side === 2 ? M - 2 : M + w) + off; }
        ctx.fillStyle = rgba([...g.slice(0, 3)].map((v) => Math.min(255, v + 40)), 0.5 + hash(seed, i + 3) * 0.45);
        ctx.fillRect(Math.round(x), Math.round(y), sz, sz);
      }
    } else if (look === 'slab') {
      stepPath(ctx, M, M, w, h, 3);
      ctx.fillStyle = c.slab;
      ctx.fill();
      ctx.save();
      ctx.clip();
      // 三级阶梯斜边：亮边在左上，暗边在右下，每级 3 单位，越往里越淡
      const B = 3;
      for (let k = 0; k < 3; k++) {
        const o = k * B;
        ctx.fillStyle = c.lit.replace(/[\d.]+\)$/, `${[0.62, 0.32, 0.14][k]})`);
        ctx.fillRect(M + o, M + o, w - 2 * o, B);
        ctx.fillRect(M + o, M + o, B, h - 2 * o);
        ctx.fillStyle = c.dark.replace(/[\d.]+\)$/, `${[0.42, 0.24, 0.1][k]})`);
        ctx.fillRect(M + o, M + h - o - B, w - 2 * o, B);
        ctx.fillRect(M + w - o - B, M + o, B, h - 2 * o);
      }
      ctx.restore();
    } else if (look === 'print') {
      // 抖动像素投影：右下错开，越往外越稀
      const ox = 7;
      const oy = 9;
      const cell = 2;
      ctx.fillStyle = rgba(c.drop, it.scene === 'essay' ? 0.5 : 0.62);
      for (let y = M + oy; y < M + h + oy + 6; y += cell)
        for (let x = M + ox; x < M + w + ox + 6; x += cell) {
          if (x < M + w && y < M + h) continue;
          const ex = Math.max(0, x - (M + w)) / (ox + 6);
          const ey = Math.max(0, y - (M + h)) / (oy + 6);
          const dens = (1 - Math.max(ex, ey)) * 0.9;
          const th = (BAYER[((y / cell) % 4) * 4 + ((x / cell) % 4)] + 0.5) / 16;
          if (th < dens) ctx.fillRect(x, y, cell, cell);
        }
      stepPath(ctx, M, M, w, h, 2);
      ctx.fillStyle = c.paper;
      ctx.fill();
      ctx.save();
      ctx.clip();
      // 纸纹：极稀的深色像素
      for (let i = 0; i < (w * h) / 90; i++) {
        ctx.fillStyle = `rgba(80, 60, 40, ${0.04 + hash(i, w) * 0.05})`;
        ctx.fillRect(M + Math.floor(hash(i, h) * w), M + Math.floor(hash(h, i) * h), 1, 1);
      }
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillRect(M, M, w, 1);
      ctx.restore();
    }
  }

  /* ══ 内容（所有外观共用） ══ */
  async function content(ctx, it, c, look, M) {
    const ins = it.inset || 0;
    if (ins) it = { ...it, w: it.w - ins * 2, h: it.h - ins * 2 };
    const { w, h } = it;
    const a = it.ref;
    const pad = 26;
    ctx.save();
    ctx.translate(M + ins, M + ins);
    if (it.kind === 'article' || it.kind === 'project') {
      ctx.font = `400 10.5px ${MONO}`;
      ctx.fillStyle = c.ink;
      const x = track(ctx, it.kind === 'article' ? '随笔' : '项目', pad, pad + 10, 2.4);
      ctx.fillStyle = c.faint;
      track(ctx, dot(a.date), x + 14, pad + 10, 1.6);
      if (it.kind === 'project') {
        // 幽灵编号：只描边、很淡
        ctx.font = `500 96px ${SERIF}`;
        ctx.strokeStyle = c.faint;
        ctx.globalAlpha = 0.28;
        ctx.lineWidth = 1;
        const nw = ctx.measureText(it.no).width;
        ctx.strokeText(it.no, w - pad - nw + 6, pad + 74);
        ctx.globalAlpha = 1;
      }
      ctx.font = `500 25px ${SERIF}`;
      ctx.fillStyle = c.fg;
      const tl = wrap(ctx, a.title, w - pad * 2 - (it.kind === 'project' ? 40 : 0), 2);
      tl.forEach((l, i) => ctx.fillText(l, pad, pad + 56 + i * 34));
      ctx.font = `400 13.5px ${SERIF}`;
      ctx.fillStyle = c.soft;
      const dy = pad + 56 + (tl.length - 1) * 34 + 34;
      wrap(ctx, a.desc, w - pad * 2, 3).forEach((l, i) => ctx.fillText(l, pad, dy + i * 23));
      // 底行（漏光外观没有面板，不画分隔线）
      if (look !== 'glow') {
        ctx.fillStyle = c.faint;
        ctx.globalAlpha = 0.35;
        ctx.fillRect(pad, h - pad - 22, w - pad * 2, 1);
        ctx.globalAlpha = 1;
      }
      ctx.font = `400 10px ${MONO}`;
      ctx.fillStyle = c.faint;
      if (it.kind === 'project') {
        ctx.font = `400 12px ${SERIF}`;
        ctx.fillStyle = c.ink;
        ctx.fillText(a.status, pad, h - pad + 2);
      } else track(ctx, `${a.chars} 字   ${a.tags.slice(0, 2).join(' · ')}`, pad, h - pad + 2, 1.2);
    } else if (it.kind === 'img') {
      const im = a.images[it.k - 1];
      const pic = await loadImage(IMG(im.m));
      const ih = h - 54;
      const inset = look === 'glow' ? 0 : look === 'print' ? 10 : 8;
      if (pic) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(inset, inset, w - inset * 2, ih - inset);
        ctx.clip();
        const sc = Math.max((w - inset * 2) / pic.width, (ih - inset) / pic.height);
        const pw = pic.width * sc;
        const ph = pic.height * sc;
        ctx.drawImage(pic, inset + (w - inset * 2 - pw) / 2, inset + (ih - inset - ph) / 2, pw, ph);
        ctx.restore();
      }
      ctx.font = `500 13.5px ${SERIF}`;
      ctx.fillStyle = c.fg;
      const cap = a.images.length > 1 ? `${a.title} · ${im.alt}` : a.title;
      ctx.fillText(wrap(ctx, cap, w - 120, 1)[0] || '', 14, h - 20);
      ctx.font = `400 10px ${MONO}`;
      ctx.fillStyle = c.faint;
      const dd = dot(a.date).slice(7);
      ctx.fillText(dd, w - 14 - ctx.measureText(dd).width, h - 20);
    } else if (it.kind === 'note') {
      ctx.font = `400 10.5px ${MONO}`;
      ctx.fillStyle = c.ink;
      const x = track(ctx, '瞬间', pad, pad + 10, 2.4);
      ctx.fillStyle = c.faint;
      track(ctx, dot(a.date), x + 14, pad + 10, 1.6);
      const [l1 = '', l2 = ''] = paras(a.text);
      ctx.font = `500 16px ${SERIF}`;
      ctx.fillStyle = c.fg;
      wrap(ctx, l1, w - pad * 2, 3).forEach((l, i) => ctx.fillText(l, pad, pad + 50 + i * 27));
      ctx.font = `400 13px ${SERIF}`;
      ctx.fillStyle = c.ink;
      ctx.fillText(wrap(ctx, l2, w - pad * 2, 1)[0] || '', pad, h - pad);
    }
    ctx.restore();
  }

  async function paint(it, look) {
    const base = INK[it.scene];
    const def = lookDef(look);
    const c = look === 'print' || (def && def.paper) ? { ...base, ...PAPER_INK } : base;
    const M = def ? def.margin || 0 : MARGIN[look] || 0;
    it.inset = (def && def.inset) || 0;
    const cw = it.w + 2 * M;
    const ch = it.h + 2 * M;
    it.M = M;
    it.cw = cw;
    it.ch = ch;
    const cv = document.createElement('canvas');
    cv.width = Math.round(cw * R);
    cv.height = Math.round(ch * R);
    const ctx = cv.getContext('2d');
    ctx.scale(R, R);
    ctx.textBaseline = 'alphabetic';
    surface(ctx, it, look, c, M);
    await content(ctx, it, c, look, M);

    it.lod = await window.DriftReg.toLODs(cv, cw, ch);
  }

  async function build(look = 'frost') {
    const all = items();
    const text = JSON.stringify(D);
    await Promise.all([
      document.fonts.load(`500 25px ${SERIF}`, text),
      document.fonts.load(`400 13px ${SERIF}`, text),
      document.fonts.load(`400 10px ${MONO}`, '0123456789 ·字'),
    ]).catch(() => {});
    await document.fonts.ready;
    for (const s in all) await Promise.all(all[s].map((it) => paint(it, look)));
    return all;
  }

  window.DriftCards = { build, LODS, INK };
})();
