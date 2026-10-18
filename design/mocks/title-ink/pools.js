/* ─────────────────────────────────────────────────────────────
   标定用的底：一条只沿 x 变化的夜色带，t = 0…1 铺满「字自己那一格」。

   为什么是一维的：这一轮要比的是「同一种底上，几种让字读得清的做法各自什么时候失效」。
   底必须对每一行完全相同，比较才成立。所以这里不画真实那片漂动的池子，而是把
   src/scripts/wander/light.js 里三种夜色 + 主页靛夜的实测色值取出来，沿横轴摊成一条固定的带：
   暗靛 → 随笔池（近白）→ 暗 → 瞬间池（琥珀）→ 暗 → 项目池（青）→ 暗 → 主页池（淡粉紫）→ 暗。
   每行的字都横穿全部四种池，且每种池上都有同样的字。

   field(t) 与 lumAt(t) 是同一个函数的两个出口：前者生成 CSS 背景，后者给「字随底换墨」
   那一行算每一点该用哪种墨。两者同源，所以基线那一行不是凭印象画的。
   ───────────────────────────────────────────────────────────── */

/* 色值取自 light.js 的 DREAM 调色板（sRGB 0–255） */
export const BASE = [14, 15, 31]; // 主页靛夜
const POOLS = [
  // [中心 t, 芯宽, 芯色, 肩色, 肩宽]
  [0.14, 0.072, [230, 230, 230], [214, 222, 235], 0.165], // 随笔池 · 近白
  [0.37, 0.07, [224, 161, 110], [133, 84, 105], 0.16], // 瞬间池 · 琥珀
  [0.60, 0.07, [158, 204, 214], [56, 107, 128], 0.16], // 项目池 · 青
  [0.83, 0.07, [204, 184, 199], [74, 69, 112], 0.16], // 主页池 · 淡粉紫
];

const gauss = (t, c, w) => Math.exp(-(((t - c) / w) ** 2));

export function field(t) {
  const c = [...BASE];
  for (const [ct, cw, core, shoulder, sw] of POOLS) {
    const kc = gauss(t, ct, cw);
    const ks = gauss(t, ct, sw) * 0.85;
    for (let i = 0; i < 3; i++) c[i] += (core[i] - BASE[i]) * kc + (shoulder[i] - BASE[i]) * ks;
  }
  return c.map((v) => Math.max(0, Math.min(255, Math.round(v))));
}

const lin = (v) => {
  v /= 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

export function lumAt(t) {
  const [r, g, b] = field(t);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/* 把 field 摊成一条 CSS 渐变；[t0, t1] 是字格在整块板里的横向范围（0…1 的板宽比例） */
export function paneGradient(t0, t1, n = 320) {
  const stops = [];
  for (let i = 0; i <= n; i++) {
    const p = i / n;
    const t = (p - t0) / (t1 - t0);
    const c = t >= 0 && t <= 1 ? field(t) : BASE;
    stops.push(`rgb(${c.join(' ')}) ${(p * 100).toFixed(2)}%`);
  }
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}

/* ── 「字随底换墨」的基线：沿字宽取 n 点，每点二选一，写成一条横向渐变 ──
   与 src/scripts/wander/ink.js 同一套数：浅墨 239/234/244、深墨 30/34/44；
   分界取「两墨对底色对比度相等」处（线性亮度 ≈ 0.19）。 */
export const INK_LIGHT = [239, 234, 244];
export const INK_DARK = [30, 34, 44];

const lumOf = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);

/* 两墨对底色对比度相等的那一点：(L+0.05)² = (L浅+0.05)(L深+0.05)
   → L = √((0.837+0.05)(0.0145+0.05)) − 0.05 ≈ 0.189，与 ink.js 注释里的 0.19 一致。
   注意这不是「中灰」：通道 50% 处的线性亮度只有 0.22，肉眼觉得是中灰、算出来并不在中间。 */
export const CROSS = Math.sqrt((lumOf(INK_LIGHT) + 0.05) * (lumOf(INK_DARK) + 0.05)) - 0.05;

/* 黑→白全亮度带上，通道值 t 处的线性亮度 */
export const rampLum = (t) => lin(255 * t);

/* lumFn: t → 线性亮度。板 A 传 lumAt（标定夜色带），板 B 传 rampLum（黑→白） */
export function inkGradient(lumFn, { n = 24, light = INK_LIGHT, dark = INK_DARK, a = 1 } = {}) {
  const stops = [];
  for (let k = 0; k < n; k++) {
    const t = (k + 0.5) / n;
    const c = lumFn(t) > CROSS ? dark : light;
    stops.push(`rgb(${c.join(' ')} / ${a}) ${(t * 100).toFixed(1)}%`);
  }
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}
