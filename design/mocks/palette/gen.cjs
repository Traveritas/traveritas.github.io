/* ─────────────────────────────────────────────────────────────
   「背景配色」四案 · 生成器（不碰 src/，只写本目录）

   用法：node design/mocks/palette/gen.cjs
   产出：design/mocks/palette/palettes.js（window.PALETTES = …）+ 终端里的对比度表

   为什么要一个生成器而不是手写十六进制：
   1. 三栏的光不是一块平色，是着色器里的四档（底 c0 · 中 c1 · 光带 c2 · 亮芯 c3），
      改一档要跟着改 c0/c1/c2/c3 四个 sRGB 值（src/scripts/wander/light.js 的 uP 就是 12 个 float）——
      写 OKLCH 讲意图（明度阶、色相轴、彩度上限），再算成 sRGB，意图不会在换算里走样。
   2. 卡片上的字（INK）必须跟着底色走，还得真的达标：这里按 WCAG 相对亮度逐档解，
      解不出（彩度太高、明度挤在中间）就当场报出来，别等到画面里才发现字是糊的。

   色相约定（照 docs/design/aesthetic-direction.md）：蓝＝距离 / 清醒，紫＝记忆 / 梦。
   整站共用一条 250°→330° 的冷轴，四案只在「明度阶律」与「彩度」上分歧。
   ───────────────────────────────────────────────────────────── */

const fs = require('fs');
const path = require('path');

/* ══ 色彩换算：OKLCH ⇄ sRGB ══ */
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const srgbToLin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const linToSrgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function oklchToLinear(L, C, H) {
  const h = (H * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  return [
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}
function oklchToSrgb(L, C, H) {
  const [r, g, b] = oklchToLinear(L, C, H);
  return [r, g, b].map((v) => clamp(linToSrgb(clamp(v))));
}
/* 超出 sRGB 色域时把彩度收回来（保住明度与色相）——设计意图里 L 与 H 比 C 重要 */
function inGamut(L, C, H) {
  const lin = oklchToLinear(L, C, H);
  return lin.every((v) => v >= -0.0008 && v <= 1.0008);
}
function fitChroma(L, C, H) {
  if (inGamut(L, C, H)) return C;
  let lo = 0, hi = C;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(L, mid, H)) lo = mid; else hi = mid;
  }
  return lo;
}

const hex = (rgb) =>
  '#' + rgb.map((v) => Math.round(clamp(v) * 255).toString(16).padStart(2, '0')).join('');
const rgbTriple = (rgb) => rgb.map((v) => Math.round(clamp(v) * 255));
const cssRgb = (rgb) => `rgb(${rgbTriple(rgb).join(' ')})`;

/* WCAG 相对亮度（入参是 0–1 的 sRGB） */
const lum = (rgb) => {
  const [r, g, b] = rgb.map(srgbToLin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return +((x + 0.05) / (y + 0.05)).toFixed(2);
};
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

/* 在 OKLCH 里找一个明度，使它对底色的对比度达到 target（保留色相，彩度压到不刺眼）。
   朝哪个方向找由底色决定：亮底往暗里找，暗底往亮里找；一头够不着（比如薄暮底想用深墨，
   反而越走越没对比）就换另一头，两头都够不着就返回那一头能做到的最好值并记下 short。 */
function solveInk(base, { target, hue, c = 0.02 }) {
  const at = (L) => oklchToSrgb(L, fitChroma(L, c, hue), hue);
  const ok = (L) => contrast(at(L), base) >= target;
  /* 'dark'：L 越小越黑、对比越高 → 取「仍然达标的最大 L」（字尽量轻）；
     'light'：反过来取「仍然达标的最小 L」。两头都不达标才算够不着。 */
  const edge = (dir) => {
    const [good, bad] = dir === 'dark' ? [0, 1] : [1, 0];
    if (!ok(good)) return null;
    if (ok(bad)) return bad;
    let lo = good, hi = bad;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (ok(mid)) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  };
  const preferDark = lum(base) > 0.16;
  for (const dir of preferDark ? ['dark', 'light'] : ['light', 'dark']) {
    const L = edge(dir);
    if (L === null) continue;
    const rgb = at(L);
    return { lch: [L, fitChroma(L, c, hue), hue], rgb, short: false };
  }
  // 两头都够不着：往对比更大的一头贴到底
  const dark = at(0), light = at(1);
  const pick = contrast(dark, base) >= contrast(light, base) ? dark : light;
  return { lch: null, rgb: pick, short: true, got: contrast(pick, base) };
}

/* ══ 一栏的光：底 c0 → 中 c1 → 光带 c2 → 亮芯 c3 ══
   c1 由 c0 推（抬 0.06 明度、彩度略收），c2 由 c0→c3 的路上取一点并给彩度留一口气。
   这样每栏只需写两个「意图点」：底色与亮芯。 */
function stops(base, core) {
  const c1 = [base[0] + 0.055, base[1] * 0.92, base[2]];
  const c2 = [
    base[0] + (core[0] - base[0]) * 0.5,
    Math.max(base[1] * 1.25, core[1] * 2.2),
    base[2] + (core[2] - base[2]) * 0.45,
  ];
  return [base, c1, c2, core].map(([L, C, H]) => oklchToSrgb(L, fitChroma(L, C, H), H));
}

/* ══ 四案 + 现状 ══
   每栏写：底色 [L, C, H]、亮芯 [L, C, H]、以及字的方向（light = 深底提亮字，dark = 浅底压暗字） */
const SCHEMES = {
  now: {
    label: '现状',
    tag: '对照',
    intent: '这次要修的那一版：随笔一块浅灰蓝、瞬间与项目两块近黑只差 30° 色相，光带一冷一暖。字族与四档全照抄线上（light.js / wander.css / faces.js），对照才诚实。',
    scenes: {
      essay: {
        zh: '随笔', en: 'ESSAY', base: [0.849, 0.018, 256], core: [0.945, 0.004, 250],
        exact: {
          stops: ['#c7d1e0', '#adbacc', '#d6deeb', '#e6e6e6'],
          shader: [[0.78, 0.82, 0.88], [0.68, 0.73, 0.82], [0.84, 0.87, 0.92], [0.9, 0.9, 0.9]],
          base: '#c6ced9', fg: '#232830', soft: '#56606d', faint: '#8a94a2', accent: '#4f4a66',
        },
      },
      moment: {
        zh: '瞬间', en: 'MOMENT', base: [0.221, 0.035, 299], core: [0.72, 0.10, 35],
        exact: {
          stops: ['#1c172b', '#3b2c4c', '#856954', '#e0a06e'],
          shader: [[0.11, 0.09, 0.17], [0.23, 0.17, 0.3], [0.52, 0.33, 0.41], [0.88, 0.63, 0.43]],
          base: '#1d1729', fg: '#f0e9f4', soft: '#bcadca', faint: '#877a98', accent: '#9c92c8',
        },
      },
      project: {
        zh: '项目', en: 'PROJECT', base: [0.196, 0.033, 262], core: [0.81, 0.06, 200],
        exact: {
          stops: ['#0d1424', '#1a2b45', '#386b80', '#9eccd6'],
          shader: [[0.05, 0.08, 0.14], [0.1, 0.17, 0.27], [0.22, 0.42, 0.5], [0.62, 0.8, 0.84]],
          base: '#0d1524', fg: '#e6ebf1', soft: '#a6b4c6', faint: '#71849c', accent: '#988bb6',
        },
      },
      home: {
        zh: '主页', en: 'HOME', base: [0.175, 0.029, 280], core: [0.76, 0.05, 320],
        exact: {
          stops: ['#0e0f1f', '#1f1f3b', '#4a4570', '#ccb8c7'],
          shader: [[0.055, 0.06, 0.12], [0.12, 0.12, 0.23], [0.29, 0.27, 0.44], [0.8, 0.72, 0.78]],
          base: '#0e0f1d', fg: '#ece8f2', soft: '#b7b3c8', faint: '#827f98', accent: '#a195c1',
        },
      },
    },
  },

  a: {
    label: 'A · 同阶冷夜',
    tag: '保守',
    intent:
      '结构不动，只理秩序：三栏回到同一条明度阶律（浅的仍是浅的，两块黑各抬一档并拉开），彩度统一收到 0.030，亮芯从冷白起、到淡玫瑰止——一束光走完整条夜。',
    scenes: {
      essay: { zh: '随笔', en: 'ESSAY', base: [0.862, 0.011, 252], core: [0.955, 0.004, 245] },
      moment: { zh: '瞬间', en: 'MOMENT', base: [0.300, 0.028, 302], core: [0.885, 0.022, 332] },
      project: { zh: '项目', en: 'PROJECT', base: [0.222, 0.026, 264], core: [0.878, 0.018, 232] },
    },
  },

  b: {
    label: 'B · 降饱和近似',
    tag: '你点名的方向',
    intent:
      '彩度全线压到 0.010–0.014，三栏的色相挤在 258°–276° 这一小段里：一眼看过去是同一片雾的三个曝光，靠明度与光带分开，不靠颜色吵架。',
    scenes: {
      essay: { zh: '随笔', en: 'ESSAY', base: [0.845, 0.006, 258], core: [0.950, 0.003, 255] },
      moment: { zh: '瞬间', en: 'MOMENT', base: [0.272, 0.011, 276], core: [0.880, 0.010, 300] },
      project: { zh: '项目', en: 'PROJECT', base: [0.218, 0.010, 262], core: [0.872, 0.008, 250] },
    },
  },

  c: {
    label: 'C · 全线提亮',
    tag: '偏激进',
    intent:
      '三栏都抬到浅色：项目与瞬间不再是夜，而是同一片晨雾里偏蓝与偏玫瑰的两块薄光，深色只留给主页。阅读最舒服、站内最一致——代价是目录页不再有夜色，`版块＝时辰` 的「深眠 / 异相」只剩主页那段。',
    scenes: {
      essay: { zh: '随笔', en: 'ESSAY', base: [0.918, 0.009, 250], core: [0.978, 0.003, 246] },
      moment: { zh: '瞬间', en: 'MOMENT', base: [0.905, 0.017, 318], core: [0.975, 0.006, 330] },
      project: { zh: '项目', en: 'PROJECT', base: [0.898, 0.019, 264], core: [0.974, 0.005, 252] },
    },
  },

  d: {
    label: 'D · 全夜同源',
    tag: '激进',
    intent:
      '把随笔那栏也带进夜里：三栏全暗、同一阶、同一束暖白月光从三栏上流过去，只有底色的深浅与极小的色相差。夜最完整——代价是检索视图不再有一块亮地。',
    scenes: {
      essay: { zh: '随笔', en: 'ESSAY', base: [0.330, 0.016, 254], core: [0.900, 0.012, 70] },
      moment: { zh: '瞬间', en: 'MOMENT', base: [0.268, 0.022, 292], core: [0.905, 0.014, 60] },
      project: { zh: '项目', en: 'PROJECT', base: [0.212, 0.020, 266], core: [0.895, 0.013, 78] },
    },
  },
};

/* ══ 组装：每栏算出四档 sRGB、可见底、字族与对比度 ══ */
function build(scheme) {
  const out = { label: scheme.label, tag: scheme.tag, intent: scheme.intent, scenes: {} };
  for (const [key, sc] of Object.entries(scheme.scenes)) {
    const pts = [sc.base, sc.core].map(([L, C, H]) => ({
      lch: [L, fitChroma(L, C, H), H],
      rgb: oklchToSrgb(L, fitChroma(L, C, H), H),
    }));
    const field = stops(pts[0].lch, pts[1].lch);
    // 真实屏上占面积最大的是 c0 到 c1 这一段：拿它们的中间当「可见底」来算字
    const base = mix(field[0], field[1], 0.5);
    const hue = sc.base[2];
    const lightText = sc.base[0] < 0.5;
    const groundLine = (lch) => lch.map((v, i) => (i === 0 ? +v.toFixed(3) : +v.toFixed(i === 1 ? 4 : 1)));

    /* 现状那一支：四档、底色、字族全照抄站点现在的值，对照才诚实 */
    if (sc.exact) {
      const e = sc.exact;
      const rgbOf = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
      const vbg = rgbOf(e.base);
      out.scenes[key] = {
        zh: sc.zh,
        en: sc.en,
        stops: e.stops,
        stopsCss: e.stops.map((h) => cssRgb(rgbOf(h))),
        shader: e.shader.flat(),
        base: e.base,
        ground: groundLine(pts[0].lch),
        core: groundLine(pts[1].lch),
        lightText,
        ink: { fg: e.fg, soft: e.soft, faint: e.faint, accent: e.accent },
        ratios: {
          fg: contrast(rgbOf(e.fg), vbg),
          soft: contrast(rgbOf(e.soft), vbg),
          faint: contrast(rgbOf(e.faint), vbg),
          accent: contrast(rgbOf(e.accent), vbg),
        },
        short: { fg: null, soft: null, faint: null, accent: null },
      };
      continue;
    }

    const fg = solveInk(base, { target: 12.5, hue, c: 0.012 });
    const soft = solveInk(base, { target: 6.6, hue, c: 0.014 });
    const faint = solveInk(base, { target: 3.6, hue, c: 0.016 });
    // 强调墨：色相挪到这一栏的反侧，夜里偏暖紫、薄暮上偏冷紫
    const inkHue = lightText ? 320 : base[0] > 0.6 ? 262 : 320;
    const ink = solveInk(base, { target: 5.0, hue: inkHue, c: 0.05 });
    out.scenes[key] = {
      zh: sc.zh,
      en: sc.en,
      stops: field.map(hex),
      stopsCss: field.map(cssRgb),
      shader: field.flat().map((v) => +v.toFixed(4)),
      base: hex(base),
      ground: groundLine(pts[0].lch),
      core: groundLine(pts[1].lch),
      lightText,
      ink: {
        fg: hex(fg.rgb), soft: hex(soft.rgb), faint: hex(faint.rgb), accent: hex(ink.rgb),
      },
      ratios: {
        fg: contrast(fg.rgb, base),
        soft: contrast(soft.rgb, base),
        faint: contrast(faint.rgb, base),
        accent: contrast(ink.rgb, base),
      },
      short: {
        fg: fg.short ? fg.got : null,
        soft: soft.short ? soft.got : null,
        faint: faint.short ? faint.got : null,
        accent: ink.short ? ink.got : null,
      },
    };
  }
  return out;
}

const data = {};
for (const [k, s] of Object.entries(SCHEMES)) data[k] = build(s);

/* 交代一下这一案的「阶律」是否站得住：三栏可见底的明度差 */
const order = ['essay', 'moment', 'project'];
const report = [];
for (const [k, v] of Object.entries(data)) {
  const L = order.map((s) => v.scenes[s].ground[0]);
  const C = order.map((s) => v.scenes[s].ground[1]);
  report.push({ scheme: k, label: v.label, L, C });
}

const OUT = path.join(__dirname, 'palettes.js');
fs.writeFileSync(
  OUT,
  `/* 由 gen.cjs 生成，勿手改。\n   重新生成：node design/mocks/palette/gen.cjs */\nwindow.PALETTES = ${JSON.stringify(
    data,
    null,
    2,
  )};\n`,
);

console.log('── 明度阶（随笔 / 瞬间 / 项目）与彩度上限 ──');
for (const r of report) {
  console.log(
    r.scheme.padEnd(4),
    r.label.padEnd(16),
    'L',
    r.L.map((v) => v.toFixed(3)).join(' / '),
    ' C',
    r.C.map((v) => v.toFixed(3)).join(' / '),
  );
}
console.log('\n── 对比度（对可见底：文字 / 次墨 / 微墨 / 强调）──');
for (const [k, v] of Object.entries(data)) {
  const row = order
    .map((s) => {
      const r = v.scenes[s].ratios;
      return `${s}: ${r.fg}/${r.soft}/${r.faint}/${r.accent}`;
    })
    .join('   ');
  console.log(k.padEnd(4), row);
}
const bad = [];
for (const [k, v] of Object.entries(data)) {
  for (const s of order) {
    const r = v.scenes[s].ratios;
    if (r.fg < 7 || r.soft < 4.5 || r.faint < 3 || r.accent < 4.5)
      bad.push(`${k}/${s}: ${JSON.stringify(r)}`);
  }
}
console.log(bad.length ? `\n⚠ 不达标：\n  ${bad.join('\n  ')}` : '\n全部达门槛（文字 ≥7、次墨 ≥4.5、微墨 ≥3、强调 ≥4.5）');
console.log('\n写出', path.relative(process.cwd(), OUT));
