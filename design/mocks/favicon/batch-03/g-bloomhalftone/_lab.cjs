/* 试验台：花形 + 网点，ASCII 预览（开发用，不进交付） */
const DEG = Math.PI / 180;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth01 = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };

function build(cfg) {
  const P = Array.from({ length: 5 }, (_, k) => ({
    k,
    axis: (-90 + 72 * k + cfg.jAxis * Math.sin(1.9 * k + 1.15) + cfg.jAxis2 * Math.cos(3.3 * k)) * DEG,
    L: cfg.L * (1 + cfg.jL * Math.sin(1.7 * k + 0.8)),
    W: cfg.W * (1 + cfg.jW * Math.sin(1.3 * k + 2.1)),
    skew: cfg.jS * Math.sin(1.25 * k + 2.3),
  }));

  function half(s, p) {
    return p.W * Math.pow(1 - Math.pow(s, 6), 0.5) * (cfg.base + (1 - cfg.base) * Math.sin(Math.PI * Math.min(s * 1.1, 1)) * 0.6);
  }
  function shade(x, y, p) {
    const dx = x - 16, dy = y - 16;
    const ca = Math.cos(p.axis), sa = Math.sin(p.axis);
    const a = dx * ca + dy * sa, b = -dx * sa + dy * ca;
    if (a < 0 || a > p.L) return 0;
    const s = a / p.L;
    const h = half(s, p) * (1 + (b >= 0 ? p.skew : -p.skew));
    const u = Math.abs(b) / Math.max(h, 0.001);
    if (u >= 1) return 0;
    const across = Math.pow(1 - Math.pow(u, cfg.acrossPow), cfg.acrossExp);
    const along = smooth01((s + 0.12) / 0.30) * smooth01((1 - s) / 0.16);
    return cfg.dark * across * along;
  }
  function tone(x, y) {
    const rho = Math.hypot(x - 16, y - 16);
    if (rho > 16) return 0;
    let t = 0;
    for (const p of P) { const v = shade(x, y, p); if (v > t) t = v; }
    // 花心让空
    return clamp(t * smooth01((rho - cfg.hole) / cfg.holeFade), 0, 1);
  }
  return { P, tone, half };
}

/* 14° 网屏 + 落版 */
function dots(cfg, c) {
  const A = 14 * DEG, CS = Math.cos(A), SN = Math.sin(A);
  const out = [];
  const n = Math.ceil(16 / cfg.pitch) + 2;
  for (let j = -n; j <= n; j++) for (let i = -n; i <= n; i++) {
    const u = i * cfg.pitch + c.off.x, v = j * cfg.pitch + c.off.y;
    let x = 16 + u * CS - v * SN, y = 16 + u * SN + v * CS;
    if (x < 0 || x > 32 || y < 0 || y > 32) continue;
    if (cfg.snap) { x = Math.round(x * 2) / 2; y = Math.round(y * 2) / 2; }
    const t = c.tone(x, y);
    const lv = Math.round(t * (cfg.levels - 1));
    if (lv <= 0) continue;
    out.push({ x, y, lv, r: 0.44 * cfg.pitch * Math.sqrt(lv / (cfg.levels - 1)) });
  }
  return out;
}

function ascii(ds) {
  const g = Array.from({ length: 32 }, () => Array(32).fill(' '));
  for (const d of ds) {
    const i = Math.floor(d.x), j = Math.floor(d.y);
    if (i < 0 || j < 0 || i > 31 || j > 31) continue;
    g[j][i] = d.lv >= 4 ? '@' : d.lv === 3 ? 'O' : d.lv === 2 ? 'o' : '.';
  }
  return g.map((r) => '|' + r.join('') + '|').join('\n');
}

const base = {
  pitch: 3.2, levels: 5, snap: true,
  L: 11.0, W: 2.7, base: 0.8,
  jAxis: 4.6, jAxis2: 1.7, jL: 0.11, jW: 0.1, jS: 0.14,
  acrossPow: 1.5, acrossExp: 0.75, dark: 1.0,
  hole: 1.3, holeFade: 1.1,
};

for (const W of [2.4, 2.9, 3.4]) {
  for (const off of [{ x: 0, y: 0 }, { x: 1.6, y: 0.8 }]) {
    const cfg = { ...base, W };
    const { tone } = build(cfg);
    const ds = dots(cfg, { tone, off });
    console.log(`\n=== W ${W} · off ${off.x},${off.y} · ${ds.length} dots`);
    console.log(ascii(ds));
  }
}
