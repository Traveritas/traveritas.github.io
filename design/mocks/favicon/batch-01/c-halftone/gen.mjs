/* ─────────────────────────────────────────────────────────────
   c-halftone · 生成器
   一枚「14° 网点」标记：把主页那层极细的半调网点放大，
   让网点本身成象 —— 象的是左上那团冷光。

   核心：这枚标记的**网线角度就是全站的 14°**（印刷制版的 screen angle，
   也正是主页那根发丝线的角度）。于是标记斜边的台阶，和主页那根
   台阶状斜线是同一个成因。

   跑：node design/mocks/favicon/batch-01/c-halftone/gen.mjs
   产出：favicon.svg / favicon-dream.svg / index.html
   ───────────────────────────────────────────────────────────── */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));

/* ── 令牌（照 src/styles/tokens.css） ── */
const T = {
  paper: '#f0f3f6',
  ink: '#232830',
  inkSoft: '#56606d',
  inkFaint: '#858f9d',
  night: '#0c0f18',
  night2: '#0d1524',
  night3: '#0e0f1d',
  night4: '#1d1729',
  light: '#e2e9f2',
  amber: '#9a86c4',
  amber2: '#a195c1',
};

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const f2 = (v) => String(Math.round(v * 100) / 100);

/* ── 网线几何 ── */
const ANGLE = 14; // 制版网线角度 = 全站发丝线角度
const RAD = (ANGLE * Math.PI) / 180;
const COS = Math.cos(RAD);
const SIN = Math.sin(RAD);
const CX = 16; // 光团的几何中心（居中，标签栏里重心稳）
const CY = 16;
const LX = 12.3; // 光源（冷光峰值）偏左上 —— 照主页
const LY = 12.1;
const R_LIGHT = 16.0; // 光衰减半径

const hash = (i, j, k) => {
  const h = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453;
  return h - Math.floor(h);
};

/* 两套网线：粗网线给 16–48px，细网线给 ≥96px 的大展示
   形状（哪些格有点）与灰阶（点多大）分开管：
   · 形状 = 一个圆盘，边缘按格子抖一点，于是边上长出齿而不是干净的圆；
   · 灰阶 = 从光源（左上）往下衰减，半径落成有限档 —— 这就是半调。
   硬约束：任何点的半径 ≤ 0.44 × 网距，所以再挤也不会碰在一起。
   （真半调在暗端会让点互相吃掉，但这里要它每一粒都数得清。） */
const RULING = {
  coarse: { pitch: 4.0, R: 11.7, rMin: 1.0, rMax: 1.68, levels: 3, edge: 0.9, jitter: 0.45, sq: 0.48 },
  fine: { pitch: 1.78, R: 11.4, rMin: 0.26, rMax: 0.78, levels: 6, edge: 0.8, jitter: 0.2, sq: 0.48 },
};

function screen(pitch, { R, rMin, rMax, levels, edge }) {
  const n = Math.ceil((R + edge) / pitch) + 1;
  const out = [];
  for (let j = -n; j <= n; j++) {
    for (let i = -n; i <= n; i++) {
      const u = i * pitch;
      const v = j * pitch;
      const x = CX + u * COS - v * SIN;
      const y = CY + u * SIN + v * COS;
      const dC = Math.hypot(x - CX, y - CY);
      if (dC > R + (hash(i, j, 5) - 0.5) * edge) continue; // 形状：圆盘 + 边缘抖动
      const b = Math.pow(clamp(1 - Math.hypot(x - LX, y - LY) / R_LIGHT, 0, 1), 0.9);
      const q = Math.round(Math.sqrt(b) * (levels - 1)) / (levels - 1);
      out.push({ i, j, x, y, b, r: lerp(rMin, rMax, q) });
    }
  }
  return out;
}

/* 亮度归一（0 = 外缘，1 = 光源峰值），用于梦面的边缘化开 */
function norm(dots) {
  const bs = dots.map((d) => d.b);
  const lo = Math.min(...bs);
  const hi = Math.max(...bs);
  return dots.map((d) => ({ ...d, k: (d.b - lo) / (hi - lo) }));
}

/* 光源那一点：离 LX/LY 最近的那一枚 —— 单独放大，是标记的锚 */
function anchorIdx(dots) {
  let best = 0;
  let bd = Infinity;
  dots.forEach((d, k) => {
    const dd = Math.hypot(d.x - LX, d.y - LY);
    if (dd < bd) {
      bd = dd;
      best = k;
    }
  });
  return best;
}

/* 环带上最靠外的一枚 —— 梦面里"边缘上残留的一点记忆" */
function ringIdx(dots) {
  let best = -1;
  let bd = -1;
  dots.forEach((d, k) => {
    if (d.k > 0.18 && d.k < 0.45) {
      const dd = Math.hypot(d.x - LX, d.y - LY);
      if (dd > bd) {
        bd = dd;
        best = k;
      }
    }
  });
  return best;
}

/* 醒 / 梦共用同一组点（同一批 i,j），只是梦面离格、变淡、两枚转紫 */
function dotsFor(ruling, face) {
  const cfg = RULING[ruling];
  const base = norm(screen(cfg.pitch, cfg));
  const a = anchorIdx(base);
  const ring = face === 'dream' ? ringIdx(base) : -1;
  const half = cfg.sq * cfg.pitch; // 光源那一枚是方点，半边长
  const lx = base[a].x;
  const ly = base[a].y;
  return base.map((d, k) => {
    const isLight = k === a;
    let x = d.x;
    let y = d.y;
    let r = d.r;
    // 光点周围退让出一圈，方点的角才不会顶到邻点 —— 于是那一点亮周围是空的
    if (!isLight && Math.hypot(d.x - lx, d.y - ly) < 1.4 * cfg.pitch) r *= 0.55;
    if (isLight) r = half;
    let op = 1;
    if (face === 'dream') {
      x += (hash(d.i, d.j, 2) - 0.5) * cfg.jitter;
      y += (hash(d.i, d.j, 3) - 0.5) * cfg.jitter;
      if (!isLight) r *= 1 + (hash(d.i, d.j, 4) - 0.5) * 0.2;
      // 外缘的点化进夜里 —— 是变淡，不是删点（删了就成另一枚图标了）
      op = lerp(1, 0.34, Math.pow(1 - d.k, 0.8));
      if (isLight) op = 1;
    }
    return { x, y, r, op, square: isLight, amber: k === a || k === ring };
  });
}

const shape = (d, fill) => {
  const f = ` fill="${fill}"`;
  const o = d.op < 1 ? ` opacity="${f2(d.op)}"` : '';
  return d.square
    ? `<rect${f} x="${f2(d.x - d.r)}" y="${f2(d.y - d.r)}" width="${f2(2 * d.r)}" height="${f2(2 * d.r)}"${o}/>`
    : `<circle${f} cx="${f2(d.x)}" cy="${f2(d.y)}" r="${f2(d.r)}"${o}/>`;
};

/* 紫点画在最上层：它们要"浮"在网线之上 */
function circleMarkup(dots, amberFill) {
  const plain = dots.filter((d) => !d.amber);
  const amber = dots.filter((d) => d.amber);
  return [
    ...plain.map((d) => shape(d, 'currentColor')),
    ...amber.map((d) => shape(d, amberFill || 'currentColor')),
  ].join('\n    ');
}

/* 四种定义只写一次，页面里用 <use> 引用 —— 否则 132 点 × 几十处会把 HTML 撑到几百 KB */
const DEFS = [
  ['mk-cw', 'coarse', 'wake'],
  ['mk-cd', 'coarse', 'dream'],
  ['mk-fw', 'fine', 'wake'],
  ['mk-fd', 'fine', 'dream'],
];

function defsBlock() {
  const syms = DEFS.map(
    ([id, ruling, face]) =>
      `<symbol id="${id}" viewBox="0 0 32 32">\n    ${circleMarkup(
        dotsFor(ruling, face),
        face === 'dream' ? T.amber : undefined,
      )}\n  </symbol>`,
  ).join('\n  ');
  return `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>\n  ${syms}\n</defs></svg>`;
}

/* ── 单枚成品 SVG ── */
function standaloneSvg(face) {
  const dots = dotsFor('coarse', face);
  const label = face === 'dream' ? '十四度网点 · 梦面' : '十四度网点 · 醒面';
  const body = circleMarkup(dots, face === 'dream' ? T.amber : undefined);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" role="img" aria-label="${label}">
  <title>${label}</title>
  <g>
    ${body}
  </g>
</svg>
`;
}

/* ── 内联标记组件：醒 / 梦两层叠放，靠 --rm 交叉淡入淡出 ── */
const MARK_ID = { coarse: 'mk-c', fine: 'mk-f' };
function mark(ruling, size) {
  const p = MARK_ID[ruling];
  return `<span class="mark" style="--sz:${size}">
        <svg class="mw" viewBox="0 0 32 32" aria-hidden="true"><use href="#${p}w"/></svg>
        <svg class="md" viewBox="0 0 32 32" aria-hidden="true"><use href="#${p}d"/></svg>
      </span>`;
}

/* ── 主页那根 14° 台阶线（横 4px 竖 1px 一级） ── */
function steppedLine(x0, y0, len) {
  const t = Math.tan(RAD);
  const run = 1 / t; // ≈ 4.01 → 每级正好抬 1px
  let p = `M ${x0} ${y0}`;
  let x = x0;
  while (x < x0 + len) {
    x = Math.min(x + run, x0 + len);
    p += ` H ${x.toFixed(1)} V ${(y0 - (x - x0) * t).toFixed(1)}`;
  }
  return p;
}

const STAR = (cx, cy, R0, r0) => {
  const pts = [];
  for (let k = 0; k < 12; k++) {
    const rr = k % 2 ? r0 : R0;
    const a = (k * Math.PI) / 6 - Math.PI / 2;
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`);
  }
  return `<polygon points="${pts.join(' ')}"/>`;
};

/* 网线角度示意：斜 14° 的点阵 + 一根 14° 参考线 */
function latticeDiagram() {
  let g = '';
  for (let k = 0; k < 121; k++) {
    const i = (k % 11) - 5;
    const j = Math.floor(k / 11) - 5;
    const u = i * 2.62;
    const v = j * 2.62;
    g += `<circle cx="${f2(CX + u * COS - v * SIN)}" cy="${f2(CY + u * SIN + v * COS)}" r="0.5"/>`;
  }
  return `<svg viewBox="0 0 32 32" aria-hidden="true">
        <g fill="rgba(35,40,48,.20)">${g}</g>
        <line x1="0" y1="26" x2="32" y2="18" stroke="${T.amber}" stroke-width="0.4" stroke-dasharray="1.5 1.5"/>
      </svg>`;
}

const nCoarse = dotsFor('coarse', 'wake').length;
const nFine = dotsFor('fine', 'wake').length;

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>favicon mockup · 半调网点（14° 网线） · c-halftone</title>
<style>
  :root{
    --paper:${T.paper}; --ink:${T.ink}; --ink-soft:${T.inkSoft}; --ink-faint:${T.inkFaint};
    --night:${T.night}; --night2:${T.night2}; --light:${T.light};
    --amber:${T.amber}; --line:rgba(35,40,48,.12);
    --mono:ui-monospace,'Cascadia Mono',Consolas,'DejaVu Sans Mono',monospace;
    --serif:'Palatino Linotype','Iowan Old Style',Palatino,Georgia,'Songti SC',serif;
    --sans:system-ui,'Segoe UI','PingFang SC','Microsoft YaHei UI',sans-serif;
  }
  *{box-sizing:border-box}
  html,body{margin:0}
  body{background:var(--paper);color:var(--ink);font-family:var(--sans);font-size:14px;line-height:1.75;-webkit-font-smoothing:antialiased}
  .wrap{max-width:1080px;margin:0 auto;padding:56px 40px 96px}
  h1{font-family:var(--serif);font-weight:600;font-size:30px;letter-spacing:.01em;margin:0 0 6px}
  h2{font-family:var(--serif);font-weight:600;font-size:19px;margin:0}
  .sub{color:var(--ink-soft);margin:0}
  .meta{font-family:var(--mono);font-size:11px;letter-spacing:.06em;color:var(--ink-faint);text-transform:uppercase}
  .lede{max-width:66ch;color:var(--ink-soft);margin:18px 0 0}
  .lede b{color:var(--ink)}
  hr{border:0;border-top:1px solid var(--line);margin:44px 0}
  section{margin:0 0 54px}
  .shead{display:flex;align-items:baseline;gap:14px;margin:0 0 20px}
  .shead .n{font-family:var(--mono);font-size:11px;color:var(--ink-faint);letter-spacing:.1em}
  .cap{font-family:var(--mono);font-size:11px;letter-spacing:.04em;color:var(--ink-faint);margin-top:12px;line-height:1.85}
  .note{font-size:12.5px;color:var(--ink-soft);max-width:72ch}
  .note b{color:var(--ink)}

  /* 标记组件：醒/梦两层叠放，--rm 交叉淡入淡出 */
  .mark{position:relative;display:inline-block;width:var(--sz);height:var(--sz);line-height:0;vertical-align:middle}
  .mark>svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
  .mark .mw{opacity:var(--rm,1)}
  .mark .md{opacity:calc(1 - var(--rm,1))}
  .on-paper{color:${T.ink}}
  .on-night{color:${T.light}}

  .panes{display:flex;gap:22px;flex-wrap:wrap}
  .pane{flex:1 1 320px;border-radius:14px;padding:28px 26px 22px;display:flex;flex-direction:column;align-items:center;gap:18px;min-width:300px}
  .pane.paper{background:${T.paper};border:1px solid var(--line)}
  .pane.night{background:${T.night};border:1px solid rgba(226,233,242,.08);color:${T.light}}
  .plabel{font-family:var(--mono);font-size:10.5px;letter-spacing:.14em;text-transform:uppercase}
  .pane.paper .plabel{color:var(--ink-faint)}
  .pane.night .plabel{color:rgba(226,233,242,.45)}
  .duo{display:flex;gap:36px;align-items:flex-end;flex-wrap:wrap;justify-content:center}
  .duo figure{margin:0;display:flex;flex-direction:column;align-items:center;gap:12px}
  .duo figcaption{font-family:var(--mono);font-size:10.5px;letter-spacing:.08em}

  .band{display:flex;align-items:flex-end;gap:30px;flex-wrap:wrap;justify-content:center}
  .cell{display:flex;flex-direction:column;align-items:center;gap:10px}
  .cell .px{font-family:var(--mono);font-size:10px;color:var(--ink-faint);letter-spacing:.06em;white-space:nowrap}
  .pane.night .cell .px{color:rgba(226,233,242,.4)}

  .tabs{display:flex;flex-direction:column;gap:16px}
  .tabbar{display:flex;align-items:center;border-radius:10px 10px 0 0;padding:8px 10px 0;font-size:12px;overflow:hidden}
  .tabbar.light{background:#dee1e6}
  .tabbar.dark{background:#202124}
  .tab{display:flex;align-items:center;gap:8px;padding:8px 16px 9px;border-radius:8px 8px 0 0;max-width:230px;flex:0 1 auto}
  .tabbar.light .tab{color:#5f6673}
  .tabbar.light .tab.on{background:${T.paper};color:${T.ink}}
  .tabbar.dark .tab{color:#9aa0a6}
  .tabbar.dark .tab.on{background:${T.night};color:#e2e9f2}
  .tab .ttl{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .tabbar.light .tab .mark{color:#232830}
  .tabbar.dark .tab .mark{color:#e2e9f2}
  .tab.amber .mark{color:${T.amber}}
  .tab.off .mark{opacity:.5}
  .chrome-under{height:34px;border-radius:0 0 10px 10px;background:${T.paper};border-top:1px solid rgba(0,0,0,.06)}
  .tabbar.dark+.chrome-under{background:${T.night};border-top:1px solid rgba(226,233,242,.08)}

  .gate{display:flex;align-items:center;gap:34px;flex-wrap:wrap;border-radius:14px;padding:26px 30px;background:linear-gradient(120deg,${T.night} 0%,${T.night4} 100%);color:${T.light}}
  .gate .gcol{display:flex;flex-direction:column;gap:8px}
  input[type=range]{width:300px;accent-color:${T.amber}}
  .gv{font-family:var(--mono);font-size:11px;letter-spacing:.08em;color:rgba(226,233,242,.6)}
  .gl{font-family:var(--mono);font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:rgba(226,233,242,.42)}

  .ctx{background:${T.night};border-radius:14px;overflow:hidden;border:1px solid rgba(226,233,242,.08)}
  .ctxbar{display:flex;align-items:center;background:#1b1c21;padding:9px 12px 0;font-size:12px;color:#9aa0a6}
  .ctxbar .tab{color:#9aa0a6}
  .ctxbar .tab.on{background:${T.night};color:#e2e9f2}
  .ctxbar .tab .mark{color:#e2e9f2}
  .ctxbar .dots3{margin-left:auto;display:flex;gap:6px;padding-bottom:9px}
  .ctxbar .dots3 i{width:9px;height:9px;border-radius:50%;background:#3a3c42;display:block}
  .hero{position:relative;height:360px;overflow:hidden;
        background:
          radial-gradient(120% 90% at 6% 4%, rgba(226,233,242,.30) 0%, rgba(226,233,242,.09) 42%, transparent 68%),
          radial-gradient(90% 80% at 92% 96%, rgba(29,23,41,.9) 0%, transparent 70%),
          linear-gradient(160deg,${T.night2} 0%,${T.night} 55%,${T.night3} 100%)}
  .hero .dots{position:absolute;inset:0;background-image:radial-gradient(circle, rgba(226,233,242,.13) .7px, transparent .9px);background-size:4px 4px}
  .hero .stepped{position:absolute;inset:0;width:100%;height:100%}
  .hero .stepped path{fill:none;stroke:rgba(226,233,242,.42);stroke-width:1;vector-effect:non-scaling-stroke}
  .hero .name{position:absolute;left:44px;top:74px;font-family:var(--serif);font-size:60px;color:rgba(226,233,242,.9);text-shadow:0 0 26px rgba(226,233,242,.18)}
  .hero .eyebrow{position:absolute;left:46px;top:44px;font-family:var(--mono);font-size:10px;letter-spacing:.4em;color:rgba(226,233,242,.42)}
  .hero .entry{position:absolute;display:flex;align-items:center;gap:9px;font-size:12.5px;color:rgba(226,233,242,.82)}
  .hero .entry i{width:5px;height:5px;border-radius:50%;background:${T.amber2};display:block;box-shadow:0 0 8px ${T.amber2}}
  .hero .entry em{font-style:normal;font-family:var(--mono);font-size:9.5px;letter-spacing:.22em;color:rgba(226,233,242,.38)}
  .hero .star{position:absolute;left:26px;bottom:22px;width:26px;height:26px;color:rgba(226,233,242,.72)}
  .hero .star svg{width:100%;height:100%;fill:currentColor}
  .hero .nexus{position:absolute;right:28px;bottom:24px;font-family:var(--mono);font-size:11px;letter-spacing:.34em;color:rgba(226,233,242,.5)}

  .angle{display:flex;gap:30px;align-items:center;flex-wrap:wrap}
  .angle>svg{width:132px;height:132px;background:#fff;border:1px solid var(--line);border-radius:10px;flex:0 0 auto}
  .files{font-family:var(--mono);font-size:11.5px;color:var(--ink-soft);line-height:2.1}
  .files b{font-weight:600;color:var(--ink)}
  .swatch{display:inline-block;width:10px;height:10px;border-radius:2px;vertical-align:-1px;margin-right:6px}
</style>
</head>
<body>
${defsBlock()}
<div class="wrap">

  <header>
    <div class="meta">batch-01 · c-halftone</div>
    <h1>半调网点 · 14° 网线</h1>
    <p class="sub">把主页那层极细的网点放大到能看清一粒一粒 —— 网线本身成象，象的是左上那团冷光。</p>
    <p class="lede">制版时半调网屏要定一个 <em>screen angle</em>（15° / 45° / 75°，为了避开摩尔纹）。这枚标记的网线角度取
    <b>14°</b> —— 正是全站那根发丝线的角度。于是标记斜边上一级一级的台阶，和主页那根台阶状斜线是同一个成因：
    不是画出来的线，是斜着排的网点在圆的边界上被裁出来的齿。</p>
    <p class="meta" style="margin-top:16px">网线角度 14° · 两套线数（粗 / 细）· 两态同一组点 · 可退 currentColor</p>
  </header>

  <hr>

  <!-- 01 主视觉 -->
  <section>
    <div class="shead"><span class="n">01</span><h2>主视觉 · 醒与梦</h2></div>
    <div class="panes">
      <div class="pane paper on-paper" style="--rm:1">
        <div class="plabel">醒 · wake · 纸上</div>
        <div class="duo">
          <figure>${mark('fine', '176px')}<figcaption style="color:var(--ink-faint)">细网线 1.78 · 176px（大尺寸版）</figcaption></figure>
          <figure>${mark('coarse', '48px')}<figcaption style="color:var(--ink-faint)">粗网线 4.0 · 48px（发货版）</figcaption></figure>
        </div>
        <div class="cap">规矩、克制；点按亮度落成 3 / 6 档半径，像印在纸上的一个灰阶形状。左上那一点最亮 —— 全屏唯一的光源，也是全图唯一一枚方点。</div>
      </div>
      <div class="pane night on-night" style="--rm:0">
        <div class="plabel">梦 · dream · 靛夜里</div>
        <div class="duo">
          <figure>${mark('fine', '176px')}<figcaption style="color:rgba(226,233,242,.4)">细网线 1.78 · 176px（大尺寸版）</figcaption></figure>
          <figure>${mark('coarse', '48px')}<figcaption style="color:rgba(226,233,242,.4)">粗网线 4.0 · 48px（发货版）</figcaption></figure>
        </div>
        <div class="cap" style="color:rgba(226,233,242,.5)">同一组点，离格、散开；外缘的点化进夜里（不是删点）。光源那一枚偏成薄暮紫并微微上浮，环带最远处再留一点紫。</div>
      </div>
    </div>
  </section>

  <!-- 02 总闸 -->
  <section>
    <div class="shead"><span class="n">02</span><h2>同一枚 · 总闸 --reality-mix</h2></div>
    <div class="gate" id="gate" style="--rm:1">
      ${mark('coarse', '104px')}
      <div class="gcol" style="flex:1 1 320px">
        <div class="gl">reality-mix 1 → 0</div>
        <input id="rm" type="range" min="0" max="100" value="100">
        <div class="gv" id="rmv">--reality-mix: 1.00</div>
      </div>
      <div class="gcol" style="flex:1 1 300px">
        <div class="note" style="color:rgba(226,233,242,.6);margin:0">拖动看它化开。两点之间没有切换动作 ——
        只是同一组点在同一张网线上离格、变淡、上浮。真做标签页两态需 JS 换 <span style="font-family:var(--mono);font-size:11.5px">&lt;link rel="icon"&gt;</span>，见 notes。</div>
      </div>
    </div>
  </section>

  <!-- 03 尺寸带 -->
  <section>
    <div class="shead"><span class="n">03</span><h2>尺寸带 · 32 / 24 / 16</h2></div>
    <p class="note" style="margin:0 0 18px">16px 换一套更粗的固定网线（网距 4.0 —— 落到 16px 就是 2.0px）：点的直径收到 1.0–1.7px，间隔 0.3–1.0px，点数从 ${nFine} 减到 ${nCoarse}。
    形状靠「点还在不在」（删点）定，不靠「点多小」（缩点）定，所以边缘不糊。光源那一枚是全图唯一的方点，
    周围还退让出一圈空 —— 16px 下它是唯一可辨的锚。</p>
    <div class="panes">
      <div class="pane paper on-paper" style="--rm:1">
        <div class="plabel">醒 · 昼面 ${T.paper}</div>
        <div class="band">
          <div class="cell">${mark('coarse', '32px')}<span class="px">32 粗</span></div>
          <div class="cell">${mark('fine', '32px')}<span class="px">32 细</span></div>
          <div class="cell">${mark('coarse', '24px')}<span class="px">24 粗</span></div>
          <div class="cell">${mark('fine', '24px')}<span class="px">24 细</span></div>
          <div class="cell">${mark('coarse', '16px')}<span class="px">16 粗</span></div>
          <div class="cell">${mark('fine', '16px')}<span class="px">16 细</span></div>
        </div>
      </div>
      <div class="pane night on-night" style="--rm:0">
        <div class="plabel">梦 · 深底 ${T.night}</div>
        <div class="band">
          <div class="cell">${mark('coarse', '32px')}<span class="px">32 粗</span></div>
          <div class="cell">${mark('fine', '32px')}<span class="px">32 细</span></div>
          <div class="cell">${mark('coarse', '24px')}<span class="px">24 粗</span></div>
          <div class="cell">${mark('fine', '24px')}<span class="px">24 细</span></div>
          <div class="cell">${mark('coarse', '16px')}<span class="px">16 粗</span></div>
          <div class="cell">${mark('fine', '16px')}<span class="px">16 细</span></div>
        </div>
      </div>
    </div>
    <div class="panes" style="margin-top:22px">
      <div class="pane on-night" style="--rm:0;background:#16171c;border-color:rgba(226,233,242,.08)">
        <div class="plabel" style="color:rgba(226,233,242,.45)">深色标签栏底色 #16171c · 16px 粗网线，连排六枚</div>
        <div class="band">
          ${'<div class="cell">' + mark('coarse', '16px') + '<span class="px">16</span></div>'}
          ${'<div class="cell">' + mark('coarse', '16px') + '<span class="px">16</span></div>'}
          ${'<div class="cell">' + mark('coarse', '16px') + '<span class="px">16</span></div>'}
          ${'<div class="cell">' + mark('coarse', '16px') + '<span class="px">16</span></div>'}
          ${'<div class="cell">' + mark('coarse', '16px') + '<span class="px">16</span></div>'}
          ${'<div class="cell">' + mark('coarse', '16px') + '<span class="px">16</span></div>'}
        </div>
      </div>
    </div>
    <div class="cap">细网线在 16px 下正如所料糊成一片灰 —— 那是它不该出现的尺寸。真正的标签页图标只发粗网线那一份。</div>
  </section>

  <!-- 04 标签栏 -->
  <section>
    <div class="shead"><span class="n">04</span><h2>真实标签页</h2></div>
    <div class="tabs">
      <div>
        <div class="tabbar light">
          <div class="tab off">${mark('coarse', '16px')}<span class="ttl">GitHub</span></div>
          <div class="tab on">${mark('coarse', '16px')}<span class="ttl">Traveritas</span></div>
          <div class="tab off">${mark('coarse', '16px')}<span class="ttl">RSS · 订阅</span></div>
        </div>
        <div class="chrome-under"></div>
      </div>
      <div>
        <div class="tabbar dark">
          <div class="tab off">${mark('coarse', '16px')}<span class="ttl">GitHub</span></div>
          <div class="tab on">${mark('coarse', '16px')}<span class="ttl">AveritA</span></div>
          <div class="tab off">${mark('coarse', '16px')}<span class="ttl">RSS</span></div>
        </div>
        <div class="chrome-under"></div>
      </div>
      <div>
        <div class="tabbar dark">
          <div class="tab off">${mark('coarse', '16px')}<span class="ttl">Notes</span></div>
          <div class="tab off">${mark('coarse', '16px')}<span class="ttl">Mail</span></div>
          <div class="tab off">${mark('coarse', '16px')}<span class="ttl">Docs</span></div>
          <div class="tab off">${mark('coarse', '16px')}<span class="ttl">Design</span></div>
          <div class="tab on">${mark('coarse', '16px')}<span class="ttl">Traveritas · 断章</span></div>
          <div class="tab off">${mark('coarse', '16px')}<span class="ttl">+</span></div>
        </div>
        <div class="chrome-under"></div>
      </div>
      <div>
        <div class="tabbar light">
          <div class="tab off amber">${mark('coarse', '16px')}<span class="ttl">GitHub</span></div>
          <div class="tab on amber">${mark('coarse', '16px')}<span class="ttl">Traveritas</span></div>
          <div class="tab off amber">${mark('coarse', '16px')}<span class="ttl">RSS</span></div>
        </div>
        <div class="chrome-under"></div>
      </div>
      <div>
        <div class="tabbar dark">
          <div class="tab off amber">${mark('coarse', '16px')}<span class="ttl">GitHub</span></div>
          <div class="tab on amber">${mark('coarse', '16px')}<span class="ttl">AveritA</span></div>
          <div class="tab off amber">${mark('coarse', '16px')}<span class="ttl">RSS</span></div>
        </div>
        <div class="chrome-under"></div>
      </div>
    </div>
    <div class="cap">浅色条上是一枚偏灰的点团；深色条上是一枚偏亮的点团 —— 同一枚，只是 ink 换了。两张条里它都不脏、不消失。
    最后两条是薄暮紫版：深底上最稳，浅底上偏淡（约 2.3:1），仍然看得见但确实软。</div>
  </section>

  <!-- 05 单色退让 -->
  <section>
    <div class="shead"><span class="n">05</span><h2>单色退让 · currentColor</h2></div>
    <p class="note" style="margin:0 0 18px">全站图标多半跟 <span style="font-family:var(--mono);font-size:12px">currentColor</span> 走。退成单色时：
    灰阶层次整个丢掉，只剩「点的大小差」与「点在不在」；醒梦的区别也从「紫 / 亮」退成「在格 / 离格 + 外缘浓淡」。
    光源那一枚仍然最大 —— 所以它认得出来。</p>
    <div class="panes">
      <div class="pane paper on-paper" style="--rm:1">
        <div class="plabel">单色 · 昼面 · 醒</div>
        <div class="band">
          <div class="cell">${mark('coarse', '128px')}<span class="px">128 粗</span></div>
          <div class="cell">${mark('fine', '128px')}<span class="px">128 细</span></div>
          <div class="cell">${mark('coarse', '32px')}<span class="px">32</span></div>
          <div class="cell">${mark('coarse', '16px')}<span class="px">16</span></div>
        </div>
      </div>
      <div class="pane night on-night" style="--rm:1">
        <div class="plabel">单色 · 深底 · 醒面形态</div>
        <div class="band">
          <div class="cell">${mark('coarse', '128px')}<span class="px">128 粗</span></div>
          <div class="cell">${mark('fine', '128px')}<span class="px">128 细</span></div>
          <div class="cell">${mark('coarse', '32px')}<span class="px">32</span></div>
          <div class="cell">${mark('coarse', '16px')}<span class="px">16</span></div>
        </div>
      </div>
      <div class="pane paper" style="--rm:1;color:${T.amber}">
        <div class="plabel" style="color:${T.amber}">单色 · 薄暮紫（唯一异质色）· 醒面</div>
        <div class="band">
          <div class="cell">${mark('coarse', '128px')}<span class="px" style="color:${T.amber}">128 粗</span></div>
          <div class="cell">${mark('fine', '128px')}<span class="px" style="color:${T.amber}">128 细</span></div>
          <div class="cell">${mark('coarse', '32px')}<span class="px" style="color:${T.amber}">32</span></div>
          <div class="cell">${mark('coarse', '16px')}<span class="px" style="color:${T.amber}">16</span></div>
        </div>
      </div>
    </div>
    <div class="cap">薄暮紫是「一份文件走两边」时的折中：深底上最稳，浅底上偏淡。真要两边都硬，
    按 <span style="font-family:var(--mono)">prefers-color-scheme</span> 发两份 ink（昼面 <span style="font-family:var(--mono)">#232830</span>、夜面 <span style="font-family:var(--mono)">#e2e9f2</span>）比单发一份紫更清楚 —— 见 notes。</div>
  </section>

  <!-- 06 网线角度 -->
  <section>
    <div class="shead"><span class="n">06</span><h2>小巧思 · 网线角度就是那根发丝线</h2></div>
    <div class="angle">
      ${latticeDiagram()}
      <div style="flex:1 1 340px">
        <p class="note" style="margin:0 0 10px">轴对齐的网点，只是屏幕上的一块纹理。把整张网斜 14°，它就跟那根发丝线对齐了 ——
        同一条斜线上，一级一级，横 4px 竖 1px。</p>
        <p class="note" style="margin:0">标记的圆边于是天然长出齿：<b>不是画了一根斜线，是斜排的点在圆的边界上被裁掉</b>。
        主页那根斜线在屏幕上也正是这样一级一级的台阶（见参考截图）。这两处的「像素感」因此同源，
        和右下角 NEXUS 那套像素字是远亲。</p>
      </div>
    </div>
  </section>

  <!-- 07 语境 -->
  <section>
    <div class="shead"><span class="n">07</span><h2>一格语境 · 放回主页</h2></div>
    <div class="ctx">
      <div class="ctxbar">
        <div class="tab off">${mark('coarse', '16px')}<span class="ttl">GitHub</span></div>
        <div class="tab on">${mark('coarse', '16px')}<span class="ttl">Traveritas</span></div>
        <div class="dots3"><i></i><i></i><i></i></div>
      </div>
      <div class="hero">
        <div class="dots"></div>
        <svg class="stepped" viewBox="0 0 760 360" preserveAspectRatio="none">
          <path d="${steppedLine(-20, 250, 800)}"/>
        </svg>
        <div class="eyebrow">昼 梦 幻 集</div>
        <div class="name">Traveritas</div>
        <div class="entry" style="left:250px;top:196px"><i></i>Ⅰ 断章 <em>ESSAYS</em></div>
        <div class="entry" style="left:392px;top:232px"><i></i>Ⅱ 闪念 <em>MOMENTS</em></div>
        <div class="entry" style="left:534px;top:268px"><i></i>Ⅲ 造物 <em>PROJECTS</em></div>
        <div class="star"><svg viewBox="0 0 26 26">${STAR(13, 13, 12, 3.4)}</svg></div>
        <div class="nexus">NEXUS</div>
      </div>
    </div>
    <div class="cap">标签页上那枚点团，和页面里那层网点、那根台阶线、左下那颗星是同一套语汇。它不像「贴上去的 logo」，像从这层纹理里长出来的一点。</div>
  </section>

  <hr>

  <section>
    <div class="shead"><span class="n">08</span><h2>交付</h2></div>
    <div class="files">
      <b>favicon.svg</b> —— 单枚成品，粗网线（16px 可辨），点走 currentColor<br>
      <b>favicon-dream.svg</b> —— 梦面，粗网线，两枚薄暮紫点<br>
      <b>gen.mjs</b> —— 生成器（网点位置由它算出）<br>
      <b>notes.md</b> —— 设计说明 · <b>shots/</b> —— 截图
    </div>
    <p class="note" style="margin-top:16px">
      <span class="swatch" style="background:${T.ink}"></span>醒 ink ${T.ink} ·
      <span class="swatch" style="background:${T.light}"></span>梦 ink ${T.light} ·
      <span class="swatch" style="background:${T.amber}"></span>薄暮紫 ${T.amber} ·
      <span class="swatch" style="background:${T.paper}"></span>昼面 ${T.paper} ·
      <span class="swatch" style="background:${T.night}"></span>靛夜 ${T.night}
    </p>
  </section>

</div>

<script>
  const gate = document.getElementById('gate');
  const rm = document.getElementById('rm');
  const rmv = document.getElementById('rmv');
  const sync = () => {
    const v = Number(rm.value) / 100;
    gate.style.setProperty('--rm', String(v));
    rmv.textContent = '--reality-mix: ' + v.toFixed(2);
  };
  rm.addEventListener('input', sync);
  sync();
</script>
</body>
</html>
`;

fs.writeFileSync(path.join(DIR, 'favicon.svg'), standaloneSvg('wake'));
fs.writeFileSync(path.join(DIR, 'favicon-dream.svg'), standaloneSvg('dream'));
fs.writeFileSync(path.join(DIR, 'index.html'), html);
console.log(`coarse dots: ${nCoarse}   fine dots: ${nFine}`);
console.log('wrote favicon.svg / favicon-dream.svg / index.html');
