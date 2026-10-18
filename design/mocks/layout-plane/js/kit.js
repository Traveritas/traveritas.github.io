/* ─────────────────────────────────────────────────────────────
   工具：命名空间、oklab 颜色、文本小函数。所有模块挂在 window.PlaneKit 上。
   ───────────────────────────────────────────────────────────── */
(() => {
  'use strict';
  const K = (window.PlaneKit = window.PlaneKit || { rules: {}, mechs: {} });

  /* ══ 颜色（oklab） ══ */
  const lin = (c) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const gam = (c) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
  function toLab([r, g, b]) {
    r = lin(r); g = lin(g); b = lin(b);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
  }
  function fromLab([L, a, b]) {
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
    return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s].map((v) => Math.max(0, Math.min(255, Math.round(gam(v)))));
  }
  const mixLab = (a, b, t) => fromLab(toLab(a).map((v, i) => v + (toLab(b)[i] - v) * t));
  const rgb = (c, a = 1) => (a >= 1 ? `rgb(${c[0]} ${c[1]} ${c[2]})` : `rgb(${c[0]} ${c[1]} ${c[2]} / ${a.toFixed(3)})`);
  const mod = (a, n) => ((a % n) + n) % n;
  K.color = { toLab, fromLab, mixLab, rgb, mod };

  /* ══ 文本 ══ */
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const chars = (s) => Array.from(s);
  const cut = (s, n) => chars(s).slice(0, n).join('');
  const cutPct = (s, p, min = 3) => cut(s, Math.max(min, Math.ceil(chars(s).length * p)));
  const dot = (d) => d.slice(0, 10).replace(/-/g, ' · ');
  const ym = (d) => d.slice(0, 7).replace(/-/g, ' · ');
  const paras = (s) => s.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
  K.text = { esc, chars, cut, cutPct, dot, ym, paras };

  /* 确定性的伪随机（同一个副本每次都抖到同一处） */
  K.hash = function hash(a, b, c) {
    let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
})();
