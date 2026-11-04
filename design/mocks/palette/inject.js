/* ─────────────────────────────────────────────────────────────
   「背景配色」预览 · 注入脚本（原型期运行时换色，不改 src/、不改 dist/）

   地址带 ?p=now | a | b | c | d 时，本脚本在页面里做三件事：

   1. 着色器调色板：三栏的底色本身就是 src/scripts/wander/light.js 里 uP 那 48 个 float
      混出来的（4 区 × 4 档：底 / 中 / 光带 / 亮芯）。CSS 的 --w-bg 只盖到覆盖层，改不到光，
      所以这里拦 WebGL2 的 getUniformLocation / uniform3fv，命中 uP 就换成新案的值。
      醒 / 梦两态：uP 是 DREAM→WAKE 插值后的结果，脚本按 --reality-mix 现算，换面时跟着走。
   2. CSS 变量：--w-*（栏头、卡片纸、角落小字）、阅读窗里那一族 --bg/--fg/--line，
      以及卡片纸那层值偏移的方向（浅底压暗、深底提亮）。
   3. 卡片上的字：faces.js 的 INK 是模块内常量，拿不到引用；但它是画进 canvas 的，
      所以拦 CanvasRenderingContext2D 的 fillStyle / strokeStyle，按「旧色 → 新色」的对照表换。
      对照表由 palettes.js 的 ink 值推出，只认 faces.js 里那六对颜色，别的色一律放行。

   ⚠ 只用于并排比较，不是实现。定稿时这三件事分别落到
     src/scripts/wander/light.js 的 DREAM / WAKE 表、
     src/styles/wander.css 的三组 --w-* 与 .w-rd 令牌、
     src/scripts/wander/faces.js 的 INK 表。
   ───────────────────────────────────────────────────────────── */
(() => {
  const P = window.PALETTES;
  if (!P) return;
  const ORDER = ['essay', 'moment', 'project', 'home'];
  const key = (
    new URLSearchParams(location.search).get('p') ||
    document.documentElement.dataset.paletteRequest ||
    'now'
  ).toLowerCase();
  const scheme = P[key] || P.now;
  document.documentElement.dataset.palette = P[key] ? key : 'now';

  /* ══ 1 · 着色器调色板 ══
     主页不在这次范围内：那一区的四个颜色一律回退成站点原来的 DREAM 值（light.js），
     所以「主页 → 往下走进三栏 → 三栏换色」整条路上，主页还是它本来的那片靛夜。 */
  const HOME_ORIG = [0.055, 0.06, 0.12, 0.12, 0.12, 0.23, 0.29, 0.27, 0.44, 0.8, 0.72, 0.78];
  const dream = [];
  for (const s of ORDER) {
    if (s === 'home' && !scheme.scenes.home) dream.push(...HOME_ORIG);
    else dream.push(...(scheme.scenes[s]?.shader || []));
  }
  const DREAM = Float32Array.from(dream);
  /* 醒面：原站点的醒面是「同一片光更冷更灰」，不是另一套配色。这里把彩度朝中灰收 12%，明度不动。 */
  const WAKE = Float32Array.from(dream.map((v) => 0.5 + (v - 0.5) * 0.88));

  let mix = DREAM;
  const applyFace = () => {
    const f = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--reality-mix'));
    const m = Number.isNaN(f) ? 1 : Math.min(1, Math.max(0, f));
    mix = Float32Array.from(DREAM, (v, i) => v + (WAKE[i] - v) * m);
  };
  applyFace();
  let lastMix = -1;
  setInterval(() => {
    const f = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--reality-mix'));
    if (!Number.isNaN(f) && Math.abs(f - lastMix) > 0.01) {
      lastMix = f;
      applyFace();
    }
  }, 220);

  const proto = window.WebGL2RenderingContext && WebGL2RenderingContext.prototype;
  if (proto) {
    const names = new WeakMap();
    const gLoc = proto.getUniformLocation;
    const g3 = proto.uniform3fv;
    proto.getUniformLocation = function (p, n) {
      const loc = gLoc.call(this, p, n);
      if (loc) names.set(loc, n);
      return loc;
    };
    proto.uniform3fv = function (loc, data) {
      if (names.get(loc) === 'uP' && data && data.length === 48) return g3.call(this, loc, mix);
      return g3.call(this, loc, data);
    };
  }

  /* ══ 2 · 卡片上的字（canvas）══
     faces.js 的 INK 六色，按「旧值 → 新值」整表换。旧值逐字照抄 faces.js，新值取本栏 ink。 */
  const OLD_INK = {
    essay: { fg: [35, 40, 48, 1], soft: [73, 82, 95, 1], faint: [92, 102, 117, 1], ink: [79, 74, 102, 1], dot: [58, 65, 76, 1], chip: [79, 74, 102, 0.3] },
    project: { fg: [232, 240, 252, 0.93], soft: [213, 226, 247, 0.62], faint: [213, 226, 247, 0.45], ink: [152, 139, 182, 1], dot: [207, 219, 230, 1], chip: [152, 139, 182, 0.3] },
    moment: { fg: [246, 240, 246, 0.93], soft: [237, 228, 239, 0.64], faint: [237, 228, 239, 0.47], ink: [156, 146, 200, 1], dot: [232, 220, 236, 1], chip: [156, 146, 200, 0.3] },
  };
  const parse = (s) => {
    if (typeof s !== 'string') return null;
    let m = /^#([0-9a-f]{6})$/i.exec(s.trim());
    if (m) {
      const n = parseInt(m[1], 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
    }
    m = /^#([0-9a-f]{3})$/i.exec(s.trim());
    if (m) return [...m[1]].map((c) => parseInt(c + c, 16)).concat(1);
    m = /^rgba?\(([^)]+)\)$/i.exec(s.trim());
    if (!m) return null;
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    if (p.length < 3) return null;
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  };
  const hexOf = (h) => {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const key4 = (c) => c.map((v, i) => (i < 3 ? Math.round(v) : +v.toFixed(2))).join(',');
  const MAP = new Map();
  for (const s of ORDER) {
    const sc = scheme.scenes[s];
    if (!sc || !OLD_INK[s]) continue;
    const o = OLD_INK[s];
    const n = sc.ink;
    const pairs = [
      ['fg', hexOf(n.fg)],
      ['soft', hexOf(n.soft)],
      ['faint', hexOf(n.faint)],
      ['ink', hexOf(n.accent)],
      ['dot', hexOf(n.soft)], // 圆点：跟着次墨走
      ['chip', hexOf(n.accent)], // 标签细边：跟着强调墨走
    ];
    for (const [k, rgb] of pairs) {
      const old = o[k];
      // 深浅两态在薄暮底上会挤到一起：新值一律保留旧值的透明度，颜色换成这一栏解出来的墨
      MAP.set(key4(old), `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${old[3]})`);
    }
  }

  const C2D = window.CanvasRenderingContext2D && CanvasRenderingContext2D.prototype;
  window.__paletteInk = 0;
  if (C2D) {
    const store = new WeakMap();
    for (const prop of ['fillStyle', 'strokeStyle']) {
      const d = Object.getOwnPropertyDescriptor(C2D, prop);
      if (!d || !d.set) continue;
      Object.defineProperty(C2D, prop, {
        configurable: true,
        enumerable: d.enumerable,
        get() {
          return store.has(this) ? store.get(this)[prop] : d.get.call(this);
        },
        set(v) {
          const c = parse(v);
          const hit = c && MAP.get(key4(c));
          const next = hit && typeof v === 'string' && (v.startsWith('#') || v.startsWith('rgb')) ? hit : v;
          if (next !== v) window.__paletteInk++;
          let rec = store.get(this);
          if (!rec) store.set(this, (rec = {}));
          rec[prop] = next;
          d.set.call(this, next);
        },
      });
    }
  }

  /* ══ 3 · 字随底换墨（ink.js）的两态 ══
     ink.js 把两态（浅墨 rgb(239 234 244)、深墨 rgb(30 34 44)）写死成常量，并把渐变直接写进
     元素的 inline background-image，CSS 覆盖不到。这里在每帧之后把那一串 gradients 里的两态
     颜色按「本栏的底色」换掉：浅底栏两态都往深墨收，深底栏浅墨＝本栏文字墨、深墨＝本栏暗面。 */
  const lumOf = (h) => {
    const [r, g, b] = hexOf(h).map((v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const tones = {};
  for (const s of ORDER) {
    const sc = scheme.scenes[s];
    if (!sc) continue;
    tones[s] = lumOf(sc.base) > 0.35
      ? { light: hexOf(sc.ink.soft), dark: hexOf(sc.ink.fg) }
      : { light: hexOf(sc.ink.fg), dark: hexOf(sc.stops[0]) };
  }
  const LIGHT_OLD = '239 234 244';
  const DARK_OLD = '30 34 44';
  let scanQueued = false;
  const retint = () => {
    for (const el of document.querySelectorAll('[data-ink-auto]')) {
      const bg = el.style.backgroundImage;
      if (!bg || (!bg.includes(LIGHT_OLD) && !bg.includes(DARK_OLD))) continue;
      const holder = el.closest('[data-wscene]') || document.documentElement;
      const s = holder.dataset.wscene || '';
      const t = tones[s];
      if (!t) continue;
      el.style.backgroundImage = bg
        .split(`rgb(${LIGHT_OLD} /`)
        .join(`rgb(${t.light.join(' ')} /`)
        .split(`rgb(${DARK_OLD} /`)
        .join(`rgb(${t.dark.join(' ')} /`);
    }
  };
  const tick = () => {
    if (!scanQueued) {
      scanQueued = true;
      requestAnimationFrame(() => {
        scanQueued = false;
        try {
          retint();
        } catch (e) {
          /* 样子不对就算了，别把页面拖死 */
        }
        // 调试用：看看这一轮找到多少个、换了多少个
        window.__paletteRetint = (window.__paletteRetint || 0) + document.querySelectorAll('[data-ink-auto]').length;
      });
    }
    setTimeout(tick, 420);
  };
  tick();

  /* ══ 4 · CSS 变量 ══ */
  const css = (h) => hexOf(h).join(' ');
  const trail = (h, a) => `rgba(${hexOf(h).join(', ')}, ${a})`;
  const rules = [
    scheme.scenes.home
      ? `html { --w-chrome-ink: ${scheme.scenes.home.ink.fg}; }`
      : '/* 主页不在这次范围：外框墨保持站点原值 */',
  ];
  for (const s of ORDER) {
    const sc = scheme.scenes[s];
    if (!sc) continue;
    const ink = sc.ink;
    /* 选择器都带 html 前缀：站点的三组 --w-* 定义在 [data-wscene] / [data-ink] 上（权重 0,1,0），
       而本样式先于站点的 <link> 插进 <head> —— 同权重时后加载的赢，所以这里每条都要高一级。 */
    rules.push(`html[data-wscene='${s}'], html .w-space[data-wscene='${s}'], html .w-rh[data-wscene='${s}'], html [data-ink='${s}'] {
  --w-bg: ${sc.base};
  --w-fg: ${ink.fg}; --w-soft: ${ink.soft}; --w-faint: ${ink.faint}; --w-ink: ${ink.accent};
  --w-chrome: ${ink.fg};
  --w-glass: ${css(sc.stops[2])}; --w-edge: ${css(ink.soft)}; --w-sheen: ${css(sc.stops[3])};
}`);
    // 阅读窗：同一栏的夜色换成新案（.w-rd 那一族令牌）
    rules.push(`html .w-rd[data-wscene='${s}'] {
  --bg: ${sc.base}; --bg-sunken: ${sc.stops[0]};
  --fg: ${ink.fg}; --fg-soft: ${ink.soft}; --fg-faint: ${ink.faint};
  --line: color-mix(in srgb, ${ink.fg} 14%, transparent);
  --hour-ink: ${ink.accent};
}`);
    rules.push(`html .w-rd[data-wscene='${s}'] .w-rd-win {
  --w-panel-top: ${css(sc.stops[2])}; --w-panel-bot: ${css(sc.stops[0])};
  --w-ink-face: ${css(ink.fg)};
}`);
  }
  // 卡片纸的值偏移：方向照旧（浅底压暗 / 深底提亮），浓度按新底色微调
  const card = (s, a, b, hi, lo, ring, lit) => `html .w-space[data-wscene='${s}'] .w-card {
  --w-face-a: ${a}; --w-face-b: ${b};
  --w-edge-hi: ${hi}; --w-edge-lo: ${lo}; --w-edge-ring: ${ring}; --w-lit: ${lit};
  --w-mark: ${s === 'essay' ? trail('#171c28', 0.62) : trail('#ffffff', 0.7)};
}`;
  const lightish = (s) => scheme.scenes[s] && scheme.scenes[s].lightText === false;
  for (const s of ['essay', 'moment', 'project']) {
    if (!scheme.scenes[s]) continue;
    rules.push(
      lightish(s)
        ? card(s, trail('#171c28', 0.018), trail('#171c28', 0.092), trail('#ffffff', 0.46), trail('#171c28', 0.27), trail('#171c28', 0.16), trail('#ffffff', 0.94))
        : card(s, trail('#ffffff', 0.118), trail('#ffffff', 0.022), trail('#ffffff', 0.55), trail('#000000', 0.28), trail('#ffffff', 0.1), trail('#ffffff', 0.9)),
    );
  }

  const st = document.createElement('style');
  st.id = 'palette-inject';
  st.textContent = rules.join('\n');
  (document.head || document.documentElement).appendChild(st);
  console.log('[palette]', document.documentElement.dataset.palette, scheme.label);
})();
