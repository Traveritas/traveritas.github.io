/* ─────────────────────────────────────────────────────────────
   变体注册表 + 公共绘制助手。

   四个维度，各是一个可插拔的登记项：
     look   碎片的外观（cards.js 画卡面时来取）
     hover  悬停（drift.js 每帧来问）
     open   点开（drift.js 点中时交给它跑）
     deco   场景里的装饰（deco.js 铺空间时来取）

   每个变体是 variants/ 下的一个独立文件，加载时把自己登记进来：
     DriftReg.look('facet', { label: '棱面', margin: 20, surface(ctx, it, c, M) {} });
     DriftReg.hover('breathe', { label: '呼吸', css: '…', tick(dt, t, api) {} });
     DriftReg.open('bloom', { label: '绽开', run(api) {} });
     DriftReg.deco('motes', { label: '浮尘', shapes: [...], paint(ctx, sh, c, M) {} });

   接口细节见各维度开头的注释，或看 variants/ 下已写好的那几个。
   ───────────────────────────────────────────────────────────── */
(() => {
  'use strict';
  const KINDS = ['looks', 'hovers', 'opens', 'decos', 'schemes'];
  const SINGLE = { looks: 'look', hovers: 'hover', opens: 'open', decos: 'deco', schemes: 'scheme' };
  const reg = { looks: {}, hovers: {}, opens: {}, decos: {}, schemes: {} };
  const names = { looks: [], hovers: [], opens: [], decos: [], schemes: [] };
  const injected = new Set();

  function inject(id, css) {
    if (injected.has(id) || !css) return;
    injected.add(id);
    const s = document.createElement('style');
    s.id = `drift-${id}`;
    s.textContent = css;
    document.head.appendChild(s);
  }

  for (const k of KINDS) {
    reg[SINGLE[k]] = (name, def) => {
      if (!name || reg[k][name]) return reg[k][name];
      const d = Object.assign({ name, kind: SINGLE[k] }, def || {});
      reg[k][name] = d;
      names[k].push(name);
      inject(`${k}-${name}`, d.css);
      return d;
    };
  }
  reg.names = names;
  reg.get = (kind, name) => reg[`${kind}s`] && reg[`${kind}s`][name] || null;
  reg.inject = inject;

  /* ══ 公共助手 ══ */
  /* 两个参数都按字符串走 FNV-1a：排法里的 key 是 `场景:层:周期:条目:格x:格y` 这种串，
     按数值取整会全塌成同一个数（所有实例叠在一处）。 */
  reg.hash = (a, b) => {
    let h = 2166136261;
    for (const s of [String(a), String(b)]) {
      for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
      h = Math.imul(h ^ 0x9e37, 2654435761);
    }
    return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
  };
  reg.rgba = ([r, g, b], a) => `rgba(${r}, ${g}, ${b}, ${a})`;
  reg.BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  reg.LODS = [6, 12, 24]; // 失焦档：每个像素占多少世界单位
  reg.PX = 5; // 流光画布的放大倍数

  /* 卡片 / 装饰共用的外形：四角像素阶梯（三级，每级 s 个单位） */
  reg.stepPath = (ctx, x, y, w, h, s) => {
    ctx.beginPath();
    ctx.moveTo(x + 3 * s, y);
    const P = [[w - 3 * s, 0], [w - 3 * s, s], [w - 2 * s, s], [w - 2 * s, 2 * s], [w - s, 2 * s], [w - s, 3 * s], [w, 3 * s],
      [w, h - 3 * s], [w - s, h - 3 * s], [w - s, h - 2 * s], [w - 2 * s, h - 2 * s], [w - 2 * s, h - s], [w - 3 * s, h - s], [w - 3 * s, h],
      [3 * s, h], [3 * s, h - s], [2 * s, h - s], [2 * s, h - 2 * s], [s, h - 2 * s], [s, h - 3 * s], [0, h - 3 * s],
      [0, 3 * s], [s, 3 * s], [s, 2 * s], [2 * s, 2 * s], [2 * s, s], [3 * s, s]];
    for (const [px, py] of P) ctx.lineTo(x + px, y + py);
    ctx.closePath();
  };

  /* 一张画布 → 清晰档 + 三档像素化的 blob URL */
  reg.toLODs = async (cv, cw, ch) => {
    const toURL = (canvas) => new Promise((res) => canvas.toBlob((b) => res(URL.createObjectURL(b))));
    const urls = [await toURL(cv)];
    for (const f of reg.LODS) {
      const lw = Math.max(2, Math.round(cw / f));
      const lh = Math.max(2, Math.round(ch / f));
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
  };

  /* 场景墨色（cards.js 载入后才有） */
  reg.ink = (scene) => (window.DriftCards && window.DriftCards.INK[scene]) || {};

  /* 抖动像素点阵：沿 (x0,y0)-(x1,y1) 的框线撒点，用于界定一块看不见的面 */
  reg.dotEdge = (ctx, x0, y0, x1, y1, seed, n, color, size) => {
    for (let i = 0; i < n; i++) {
      const u = 0.06 + reg.hash(seed, i) * 0.88;
      const side = Math.floor(reg.hash(seed, i + 99) * 4);
      const sz = reg.hash(seed, i + 7) < 0.3 ? size + 1 : size;
      const off = Math.round((reg.hash(seed, i + 51) - 0.5) * 16);
      let x;
      let y;
      if (side < 2) { x = x0 + u * (x1 - x0); y = (side === 0 ? y0 - 2 : y1) + off; }
      else { y = y0 + u * (y1 - y0); x = (side === 2 ? x0 - 2 : x1) + off; }
      ctx.fillStyle = typeof color === 'function' ? color(reg.hash(seed, i + 3)) : color;
      ctx.fillRect(Math.round(x), Math.round(y), sz, sz);
    }
  };

  window.DriftReg = reg;
})();
