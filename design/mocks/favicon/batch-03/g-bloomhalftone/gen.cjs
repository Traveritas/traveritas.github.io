/* ─────────────────────────────────────────────────────────────
   g-bloomhalftone · 生成器
   一朵花，用斜 14° 的半调网屏印出来。

   三段规矩（可复述）：
   ① 连续调：五瓣。每瓣的长度 / 开角 / 半宽 / 左右偏斜各由一条采样正弦给出；
      五瓣油墨叠印成花头；花心留空（那里没有墨可印，不是挖了一个洞）。
   ② 网屏：方形网线绕花心转 14° —— 全站那根发丝线的角度。
   ③ 网点：每格取格心的墨量 t，点面积 ∝ t，r = 0.44 · 网距 · √t（四舍五入到档）。
      0.44 是硬上限：再暗也不许两粒相碰。

   16px 的解法（三层）：
   · 换线数：粗网线 3.6（16px 下网距 1.8px）/ 细网线 1.6（只给大尺寸）。
   · 对版：搜网屏相位，让五瓣各至少压住 3 粒 —— 否则总有一瓣在 16px 落空。
   · 落版：粗网线的每粒点吸附到 0.5 单位（＝16px 下的 1px）格点上。
     于是 14° 的斜网在 16px 里走成台阶 —— 和主页那根台阶状发丝线同一个成因。

   跑：node gen.cjs         → favicon.svg / favicon-dream.svg / index.html
       node gen.cjs dev     → %TEMP%/bloom-dev.html（线数对照，开发用，不进交付）
   ───────────────────────────────────────────────────────────── */
const fs = require('fs');
const path = require('path');
const os = require('os');

const DIR = __dirname;

/* ── 令牌（照 src/styles/tokens.css） ── */
const T = {
  paper: '#f0f3f6',
  ink: '#232830',
  inkSoft: '#56606d',
  inkFaint: '#858f9d',
  night: '#0c0f18',
  night2: '#0d1524',
  night4: '#1d1729',
  light: '#e2e9f2',
  amber: '#9a86c4',
  amber2: '#a195c1',
};

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const f2 = (v) => String(Math.round(v * 100) / 100);
const smooth01 = (x) => {
  x = clamp(x, 0, 1);
  return x * x * (3 - 2 * x);
};
const DEG = Math.PI / 180;

/* ── ① 花：五瓣取样 ──────────────────────────────────────────
   开角  -90° + 72k + 4.6·sin(1.9k+1.15) + 1.7·cos(3.3k)
   瓣长  11.0 · (1 + 0.13·sin(1.7k+0.8))
   半宽  30°  · (1 + 0.10·sin(1.3k+2.1))
   偏斜  0.15·sin(1.25k+2.3)          （左右半宽不等，瓣尖因此偏）
   瓣形  w(u) = W · (1 - u^6)^0.30     （根部宽，外段渐收，尖梢略钝）
   ───────────────────────────────────────────────────────────── */
const PETALS = Array.from({ length: 5 }, (_, k) => ({
  k,
  axis: (-90 + 72 * k + 4.6 * Math.sin(1.9 * k + 1.15) + 1.7 * Math.cos(3.3 * k)) * DEG,
  L: 11.0 * (1 + 0.13 * Math.sin(1.7 * k + 0.8)),
  W: 30 * DEG * (1 + 0.1 * Math.sin(1.3 * k + 2.1)),
  skew: 0.15 * Math.sin(1.25 * k + 2.3),
}));

function petalTone(rho, phi, pet) {
  const u = rho / pet.L;
  if (u >= 1) return 0;
  let d = phi - pet.axis;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  const Ws = pet.W * (1 + (d >= 0 ? pet.skew : -pet.skew));
  const w = Ws * Math.pow(Math.max(0, 1 - Math.pow(u, 6)), 0.3);
  return smooth01((w - Math.abs(d)) / 0.11) * smooth01((pet.L - rho) / 1.7);
}

/* 墨量场。叠印：1 - Π(1 - t)。花心：1.7 内全空，3.7 处恢复满墨。 */
function tone(x, y) {
  const px = x - 16;
  const py = y - 16;
  const rho = Math.hypot(px, py);
  if (rho > 16) return 0;
  const phi = Math.atan2(py, px);
  let t = 0;
  for (const pet of PETALS) {
    const pt = petalTone(rho, phi, pet);
    if (pt > 0) t = 1 - (1 - t) * (1 - 0.94 * pt);
  }
  return clamp(t * smooth01((rho - 1.7) / 2.0), 0, 1);
}

/* ── ②③ 网屏与网点 ── */
const ANGLE = 14;
const RAD = ANGLE * DEG;
const COS = Math.cos(RAD);
const SIN = Math.sin(RAD);
const R_FRAC = 0.44;

function screen(pitch, levels, off, snap) {
  const n = Math.ceil(16 / pitch) + 2;
  const dots = [];
  for (let j = -n; j <= n; j++) {
    for (let i = -n; i <= n; i++) {
      const u = i * pitch + off.x;
      const v = j * pitch + off.y;
      let x = 16 + u * COS - v * SIN;
      let y = 16 + u * SIN + v * COS;
      if (x < -1 || x > 33 || y < -1 || y > 33) continue;
      if (snap) {
        // 落版：吸附到 0.5 单位（＝16px 下的 1px）格点，斜网走成台阶
        x = Math.round(x * 2) / 2;
        y = Math.round(y * 2) / 2;
      }
      const t = tone(x, y);
      const lv = Math.round(t * (levels - 1));
      if (lv <= 0) continue;
      const q = lv / (levels - 1);
      dots.push({
        x,
        y,
        r: R_FRAC * pitch * Math.sqrt(q),
        lv,
        q,
        rho: Math.hypot(x - 16, y - 16),
      });
    }
  }
  return dots;
}

/* 对版：搜网屏相位，让五瓣各至少压住若干粒；顺带偏好花心落在一格空里 */
function register(pitch, levels, { target = 26, cap = 4, steps = 30, snap = false } = {}) {
  let best = null;
  for (let a = 0; a < steps; a++) {
    for (let b = 0; b < steps; b++) {
      const off = { x: (a / steps) * pitch, y: (b / steps) * pitch };
      const dots = screen(pitch, levels, off, snap);
      if (dots.length < target * 0.55 || dots.length > target * 1.45) continue;
      const per = PETALS.map((pet) => {
        let c = 0;
        for (const d of dots) {
          const rho = d.rho;
          if (rho > pet.L) continue;
          let dd = Math.atan2(d.y - 16, d.x - 16) - pet.axis;
          dd = Math.atan2(Math.sin(dd), Math.cos(dd));
          const w =
            pet.W *
            (1 + (dd >= 0 ? pet.skew : -pet.skew)) *
            Math.pow(Math.max(0, 1 - Math.pow(rho / pet.L, 6)), 0.3);
          if (Math.abs(dd) < w * 0.82 && d.lv >= 2) c++;
        }
        return c;
      });
      const minC = Math.min(...per);
      const centerFree = dots.some((d) => d.rho < 1.1) ? 0 : 1;
      const score =
        minC * 30 +
        per.reduce((s, v) => s + Math.min(v, cap), 0) +
        centerFree * 6 -
        Math.abs(dots.length - target) * 0.4;
      if (!best || score > best.score) best = { off, dots, score, per, minC };
    }
  }
  return best;
}

const RULING = {
  coarse: { pitch: 3.6, levels: 4, snap: true, target: 26, cap: 4 },
  fine: { pitch: 1.6, levels: 6, snap: false, target: 128, cap: 6 },
};

const regCoarse = register(RULING.coarse.pitch, RULING.coarse.levels, RULING.coarse);
const regFine = register(RULING.fine.pitch, RULING.fine.levels, RULING.fine);

/* 高光端退化：最小的一档网点画成方点 —— 点还没长成圆，先被格子的边裁成方。
   花心让空，于是最小的一档正好绕在花心外一圈。 */
function markSquares(dots) {
  const minLv = Math.min(...dots.map((d) => d.lv));
  for (const d of dots) d.sq = d.lv === minLv;
  return dots;
}

const hash = (a, b, k) => {
  const h = Math.sin(a * 127.1 + b * 311.7 + k * 74.7) * 43758.5453;
  return h - Math.floor(h);
};

function dotsFor(ruling, face) {
  const cfg = RULING[ruling];
  const reg = ruling === 'coarse' ? regCoarse : regFine;
  const base = markSquares(reg.dots.map((d) => ({ ...d })));
  const out = base.map((d) => {
    let x = d.x;
    let y = d.y;
    let r = d.r;
    let op = 1;
    if (face === 'dream') {
      const jit = ruling === 'coarse' ? 0.3 : 0.16;
      x += (hash(d.x, d.y, 2) - 0.5) * jit;
      y += (hash(d.x, d.y, 3) - 0.5) * jit;
      // 点浮起来：整朵向外松开一点，疏密关系随之松掉
      const k = ruling === 'coarse' ? 1.03 : 1.045;
      x = 16 + (x - 16) * k;
      y = 16 + (y - 16) * k;
      r *= 1 + (hash(d.x, d.y, 4) - 0.5) * 0.16;
      const kk = clamp(1 - (d.rho - 4.5) / 9, 0, 1);
      const floor = ruling === 'coarse' ? 0.5 : 0.34;
      op = floor + (1 - floor) * Math.pow(kk, 0.8);
    }
    return { ...d, x, y, r, op };
  });
  if (face === 'dream') {
    const outer = out.filter((d) => d.rho > 7.4).sort((a, b) => b.rho - a.rho);
    const picked = [];
    for (const d of outer) {
      if (
        picked.every(
          (p) =>
            Math.abs(
              Math.atan2(p.y - 16, p.x - 16) - Math.atan2(d.y - 16, d.x - 16),
            ) > 0.7,
        )
      )
        picked.push(d);
      if (picked.length >= 3) break;
    }
    picked.forEach((p) => (p.amber = true));
  }
  return out;
}

const CW = dotsFor('coarse', 'wake');
const CD = dotsFor('coarse', 'dream');
const FW = dotsFor('fine', 'wake');
const FD = dotsFor('fine', 'dream');

/* ── SVG ── */
function el(d, cls) {
  const o = d.op < 1 ? ` opacity="${f2(d.op)}"` : '';
  const side = 2 * d.r * 0.86; // 方点略收，面积与同半径的圆相当
  return d.sq
    ? `<rect class="${cls}" x="${f2(d.x - side / 2)}" y="${f2(d.y - side / 2)}" width="${f2(side)}" height="${f2(side)}"${o}/>`
    : `<circle class="${cls}" cx="${f2(d.x)}" cy="${f2(d.y)}" r="${f2(d.r)}"${o}/>`;
}
function group(dots, cls) {
  return dots.filter((d) => !d.amber).map((d) => el(d, cls)).join('\n    ');
}
function groupAmber(dots, cls) {
  return dots.filter((d) => d.amber).map((d) => el(d, cls)).join('\n    ');
}

function standalone(face) {
  const dots = face === 'dream' ? CD : CW;
  const label = face === 'dream' ? '网点开花 · 梦面' : '网点开花 · 醒面';
  const ink = face === 'dream' ? '#dbe3ef' : '#232830';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" role="img" aria-label="${label}">
  <title>${label}</title>
  <style>
    .ink{fill:currentColor}
    .warm{fill:currentColor}
    @media (prefers-color-scheme: dark){
      .ink{fill:#dbe3ef}
      .warm{fill:#a195c1}
    }
  </style>
  <g>
    ${group(dots, 'ink')}
    ${groupAmber(dots, 'warm')}
  </g>
</svg>
`;
}

/* 页面里用 symbol 引用，同一批点只写一遍 */
function symbols() {
  const def = (id, dots, amberFill) => `<symbol id="${id}" viewBox="0 0 32 32">
    ${dots
      .filter((d) => !d.amber)
      .map((d) => el(d, 'ink'))
      .join('\n    ')}
    ${
      amberFill
        ? dots
            .filter((d) => d.amber)
            .map((d) => {
              const o = d.op < 1 ? ` opacity="${f2(d.op)}"` : '';
              const side = 2 * d.r * 0.86;
              return d.sq
                ? `<rect fill="${amberFill}" x="${f2(d.x - side / 2)}" y="${f2(d.y - side / 2)}" width="${f2(side)}" height="${f2(side)}"${o}/>`
                : `<circle fill="${amberFill}" cx="${f2(d.x)}" cy="${f2(d.y)}" r="${f2(d.r)}"${o}/>`;
            })
            .join('\n    ')
        : ''
    }
  </symbol>`;
  return `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
  <style>
    #mk-cw .ink,#mk-fw .ink{fill:currentColor}
    #mk-cd .ink,#mk-fd .ink{fill:currentColor}
  </style>
  ${def('mk-cw', CW)}
  ${def('mk-cd', CD, T.amber)}
  ${def('mk-fw', FW)}
  ${def('mk-fd', FD, T.amber)}
</defs></svg>`;
}

const mark = (id, size) =>
  `<span class="mark" style="--sz:${size}"><svg viewBox="0 0 32 32" aria-hidden="true"><use href="#${id}"/></svg></span>`;
const mark2 = (ruling, size) =>
  `<span class="mark" style="--sz:${size}"><svg viewBox="0 0 32 32" aria-hidden="true" class="mw"><use href="#mk-${ruling === 'coarse' ? 'c' : 'f'}w"/></svg><svg viewBox="0 0 32 32" aria-hidden="true" class="md"><use href="#mk-${ruling === 'coarse' ? 'c' : 'f'}d"/></svg></span>`;

/* 墨量场缩略图（48×48，十六级），给页面的「规矩」三格用 */
function toneMap(n = 48) {
  let s = '';
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      s += Math.round(tone(((i + 0.5) / n) * 32, ((j + 0.5) / n) * 32) * 15).toString(16);
    }
  }
  return s;
}

function steppedLine(x0, y0, len) {
  const t = Math.tan(RAD);
  const run = 1 / t;
  let p = `M ${x0} ${y0}`;
  let x = x0;
  while (x < x0 + len) {
    x = Math.min(x + run, x0 + len);
    p += ` H ${x.toFixed(1)} V ${(y0 - (x - x0) * t).toFixed(1)}`;
  }
  return p;
}

const dotsJson = JSON.stringify({
  cw: CW.map((d) => [d.x, d.y, d.r, d.sq ? 1 : 0, d.op, 0]),
  cd: CD.map((d) => [d.x, d.y, d.r, d.sq ? 1 : 0, d.op, d.amber ? 1 : 0]),
});

const page = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>favicon mockup · 网点开花 · g-bloomhalftone</title>
<style>
  :root{
    --paper:${T.paper}; --ink:${T.ink}; --ink-soft:${T.inkSoft}; --ink-faint:${T.inkFaint};
    --night:${T.night}; --night2:${T.night2}; --light:${T.light}; --amber:${T.amber};
    --line:rgba(35,40,48,.12);
    --mono:ui-monospace,'Cascadia Mono',Consolas,'DejaVu Sans Mono',monospace;
    --serif:'Palatino Linotype','Iowan Old Style',Palatino,Georgia,'Songti SC',serif;
    --sans:system-ui,'Segoe UI','PingFang SC','Microsoft YaHei UI',sans-serif;
  }
  *{box-sizing:border-box}
  html,body{margin:0}
  body{background:var(--paper);color:var(--ink);font-family:var(--sans);font-size:14px;line-height:1.78;-webkit-font-smoothing:antialiased}
  .wrap{max-width:1080px;margin:0 auto;padding:56px 40px 100px}
  h1{font-family:var(--serif);font-weight:600;font-size:31px;letter-spacing:.01em;margin:0 0 8px}
  h2{font-family:var(--serif);font-weight:600;font-size:19px;margin:0}
  .sub{color:var(--ink-soft);margin:0;max-width:64ch}
  .meta{font-family:var(--mono);font-size:11px;letter-spacing:.06em;color:var(--ink-faint);text-transform:uppercase}
  .lede{max-width:68ch;color:var(--ink-soft);margin:20px 0 0}
  .lede b{color:var(--ink);font-weight:600}
  hr{border:0;border-top:1px solid var(--line);margin:46px 0}
  section{margin:0 0 56px}
  .shead{display:flex;align-items:baseline;gap:14px;margin:0 0 20px}
  .shead .n{font-family:var(--mono);font-size:11px;color:var(--ink-faint);letter-spacing:.1em}
  .cap{font-family:var(--mono);font-size:11px;letter-spacing:.03em;color:var(--ink-faint);margin-top:14px;line-height:1.9;max-width:82ch}
  .note{font-size:13px;color:var(--ink-soft);max-width:76ch;margin:0}
  .note b{color:var(--ink)}
  .mark{position:relative;display:inline-block;width:var(--sz);height:var(--sz);line-height:0;vertical-align:middle}
  .mark>svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
  .mark .mw{opacity:var(--rm,1)}
  .mark .md{opacity:calc(1 - var(--rm,1))}
  .on-paper{color:${T.ink}}
  .on-night{color:${T.light}}

  .panes{display:flex;gap:20px;flex-wrap:wrap}
  .pane{flex:1 1 320px;min-width:300px;border-radius:14px;padding:26px 24px 20px;display:flex;flex-direction:column;align-items:center;gap:18px}
  .pane.paper{background:${T.paper};border:1px solid var(--line)}
  .pane.night{background:${T.night};border:1px solid rgba(226,233,242,.08);color:${T.light}}
  .plabel{font-family:var(--mono);font-size:10.5px;letter-spacing:.14em;text-transform:uppercase}
  .pane.paper .plabel{color:var(--ink-faint)}
  .pane.night .plabel{color:rgba(226,233,242,.45)}
  .duo{display:flex;gap:34px;align-items:flex-end;justify-content:center;flex-wrap:wrap}
  .duo figure{margin:0;display:flex;flex-direction:column;align-items:center;gap:11px}
  .duo figcaption{font-family:var(--mono);font-size:10.5px;letter-spacing:.06em}

  .band{display:flex;align-items:flex-end;gap:26px;flex-wrap:wrap;justify-content:center}
  .cell{display:flex;flex-direction:column;align-items:center;gap:9px}
  .cell .px{font-family:var(--mono);font-size:10px;color:var(--ink-faint);letter-spacing:.05em;white-space:nowrap}
  .pane.night .cell .px{color:rgba(226,233,242,.4)}

  .rasterrow{display:flex;align-items:flex-end;gap:26px;flex-wrap:wrap;justify-content:center}
  .rz{display:flex;flex-direction:column;align-items:center;gap:7px}
  .rz canvas{display:block;image-rendering:pixelated}
  .rz .lbl{font-family:var(--mono);font-size:10px;letter-spacing:.04em;color:var(--ink-faint);white-space:nowrap}
  .pane.night .rz .lbl{color:rgba(226,233,242,.4)}

  .tabs{display:flex;flex-direction:column;gap:15px}
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
  .tab.off .mark{opacity:.42}
  .chrome-under{height:32px;border-radius:0 0 10px 10px;background:${T.paper};border-top:1px solid rgba(0,0,0,.06)}
  .tabbar.dark+.chrome-under{background:${T.night};border-top:1px solid rgba(226,233,242,.08)}

  .gate{display:flex;align-items:center;gap:34px;flex-wrap:wrap;border-radius:14px;padding:24px 28px;background:linear-gradient(120deg,${T.night} 0%,${T.night4} 100%);color:${T.light}}
  .gcol{display:flex;flex-direction:column;gap:7px}
  input[type=range]{width:290px;accent-color:${T.amber}}
  .gv{font-family:var(--mono);font-size:11px;letter-spacing:.07em;color:rgba(226,233,242,.6)}
  .gl{font-family:var(--mono);font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:rgba(226,233,242,.42)}

  .rule{display:flex;gap:16px;flex-wrap:wrap}
  .rbox{flex:1 1 230px;border:1px solid var(--line);border-radius:12px;padding:16px;display:flex;flex-direction:column;align-items:center;gap:10px;background:#f7f9fb}
  .rbox canvas{width:200px;height:200px;display:block}
  .rbox .rl{font-family:var(--mono);font-size:10.5px;letter-spacing:.06em;color:var(--ink-faint);align-self:flex-start}
  .rbox .rd{font-size:12px;color:var(--ink-soft);line-height:1.7;align-self:flex-start;margin:0}

  .ctx{background:${T.night};border-radius:14px;overflow:hidden;border:1px solid rgba(226,233,242,.08)}
  .ctxbar{display:flex;align-items:center;background:#1b1c21;padding:9px 12px 0;font-size:12px;color:#9aa0a6}
  .ctxbar .tab{color:#9aa0a6}
  .ctxbar .tab.on{background:${T.night};color:#e2e9f2}
  .ctxbar .tab .mark{color:#e2e9f2}
  .ctxbar .dots3{margin-left:auto;display:flex;gap:6px;padding-bottom:9px}
  .ctxbar .dots3 i{width:9px;height:9px;border-radius:50%;background:#3a3c42;display:block}
  .hero{position:relative;height:340px;overflow:hidden;
        background:
          radial-gradient(120% 90% at 6% 4%, rgba(226,233,242,.30) 0%, rgba(226,233,242,.09) 42%, transparent 68%),
          radial-gradient(90% 80% at 92% 96%, rgba(29,23,41,.9) 0%, transparent 70%),
          linear-gradient(160deg,${T.night2} 0%,${T.night} 55%,#0e0f1d 100%)}
  .hero .dots{position:absolute;inset:0;background-image:radial-gradient(circle, rgba(226,233,242,.13) .7px, transparent .9px);background-size:4px 4px}
  .hero .stepped{position:absolute;inset:0;width:100%;height:100%}
  .hero .stepped path{fill:none;stroke:rgba(226,233,242,.40);stroke-width:1;vector-effect:non-scaling-stroke}
  .hero .name{position:absolute;left:44px;top:70px;font-family:var(--serif);font-size:58px;color:rgba(226,233,242,.9);text-shadow:0 0 26px rgba(226,233,242,.18)}
  .hero .eyebrow{position:absolute;left:46px;top:42px;font-family:var(--mono);font-size:10px;letter-spacing:.4em;color:rgba(226,233,242,.42)}
  .hero .entry{position:absolute;display:flex;align-items:center;gap:9px;font-size:12.5px;color:rgba(226,233,242,.82)}
  .hero .entry i{width:5px;height:5px;border-radius:50%;background:${T.amber2};display:block;box-shadow:0 0 8px ${T.amber2}}
  .hero .entry em{font-style:normal;font-family:var(--mono);font-size:9.5px;letter-spacing:.22em;color:rgba(226,233,242,.38)}
  .hero .nexus{position:absolute;right:28px;bottom:24px;font-family:var(--mono);font-size:11px;letter-spacing:.34em;color:rgba(226,233,242,.5)}
  .hero .bloom{position:absolute;right:56px;top:40px;width:82px;height:82px;opacity:.62}

  .files{font-family:var(--mono);font-size:11.5px;color:var(--ink-soft);line-height:2.1}
  .files b{font-weight:600;color:var(--ink)}
  .swatch{display:inline-block;width:10px;height:10px;border-radius:2px;vertical-align:-1px;margin-right:6px}
  .kbd{font-family:var(--mono);font-size:11.5px;background:rgba(35,40,48,.06);padding:1px 5px;border-radius:3px}
</style>
</head>
<body>
${symbols()}
<div class="wrap">

  <header>
    <div class="meta">batch-03 · g-bloomhalftone</div>
    <h1>网点开花</h1>
    <p class="sub">一朵花，不是画出来的，是印出来的。斜 14° 的网屏按每一处的墨量决定网点大小，五瓣从网点里显影。</p>
    <p class="lede">留下的两枚里，一枚是<em>网屏</em>，一枚是<em>花</em>。这一枚把它们叠在同一张纸上：
    花给出「是个东西」，网屏给出「是这个站」。花心是整张网上唯一让空的一格 ——
    <b>孔不是挖出来的，是那里本来就没有墨可印</b>。</p>
    <p class="meta" style="margin-top:16px">网线 14° · 点面积 ∝ 墨量 · 半径 ≤ 0.44 × 网距 · 两套线数 · 粗网落版</p>
  </header>

  <hr>

  <!-- 01 主视觉 -->
  <section>
    <div class="shead"><span class="n">01</span><h2>主视觉 · 醒与梦</h2></div>
    <div class="panes">
      <div class="pane paper on-paper" style="--rm:1">
        <div class="plabel">醒 · wake · 纸上</div>
        <div class="duo">
          <figure>${mark('mk-fw', '178px')}<figcaption style="color:var(--ink-faint)">细网线 1.6 · 178px</figcaption></figure>
          <figure>${mark('mk-cw', '62px')}<figcaption style="color:var(--ink-faint)">粗网线 3.6 · 62px（发货）</figcaption></figure>
        </div>
        <div class="cap">冷灰 ${T.ink} 印在纸面 ${T.paper} 上。每粒点的大小只由「这一格该有多暗」决定，
        所以花瓣的边缘是一串半大不小的点 —— 印刷品被放大之后，边界本来就是这样的。</div>
      </div>
      <div class="pane night on-night" style="--rm:0">
        <div class="plabel">梦 · dream · 靛夜里</div>
        <div class="duo">
          <figure>${mark('mk-fd', '178px')}<figcaption style="color:rgba(226,233,242,.4)">细网线 1.6 · 178px</figcaption></figure>
          <figure>${mark('mk-cd', '62px')}<figcaption style="color:rgba(226,233,242,.4)">粗网线 3.6 · 62px（发货）</figcaption></figure>
        </div>
        <div class="cap" style="color:rgba(226,233,242,.5)">同一批点，离格、外扩、外圈变淡；最外三粒偏成薄暮紫。
        花心那格仍然是空的 —— 梦里它也没有被填上。</div>
      </div>
    </div>
  </section>

  <!-- 02 规矩 -->
  <section>
    <div class="shead"><span class="n">02</span><h2>三段规矩 · 连续调 → 网屏 → 网点</h2></div>
    <div class="rule">
      <div class="rbox">
        <span class="rl">① 连续调 · tone</span>
        <canvas id="tm" width="200" height="200"></canvas>
        <p class="rd">五瓣各自取样：开角 <span class="kbd">-90°+72k+4.6sin(1.9k+1.15)+1.7cos(3.3k)</span>，
        瓣长 <span class="kbd">11.0(1+0.13sin(1.7k+0.8))</span>，半宽 <span class="kbd">30°(1+0.10sin(1.3k+2.1))</span>，
        偏斜 <span class="kbd">0.15sin(1.25k+2.3)</span>。叠印处更暗，花心让空。</p>
      </div>
      <div class="rbox">
        <span class="rl">② 网屏 · 14°</span>
        <canvas id="lat" width="200" height="200"></canvas>
        <p class="rd">整张方形网线绕花心转 14° —— 就是全站那根发丝线的角度。
        粗网线还要对版：搜一个相位，让五瓣各至少压住三粒。</p>
      </div>
      <div class="rbox">
        <span class="rl">③ 网点 · r ∝ √t</span>
        <canvas id="ht" width="200" height="200"></canvas>
        <p class="rd">每格取格心的墨量 t，点面积 ∝ t，于是 <span class="kbd">r = 0.44·网距·√t</span>，
        再落到 4 档。0.44 是硬上限：再暗也不许两粒相碰。</p>
      </div>
    </div>
    <div class="cap">三格是同一朵花的三个状态，不是三张插画：第三格由第二格的格子与第一格的墨量算出。</div>
  </section>

  <!-- 03 总闸 -->
  <section>
    <div class="shead"><span class="n">03</span><h2>同一枚 · 总闸 reality-mix</h2></div>
    <div class="gate" id="gate" style="--rm:1">
      ${mark2('coarse', '104px')}
      <div class="gcol" style="flex:1 1 300px">
        <div class="gl">reality-mix 1 → 0</div>
        <input id="rm" type="range" min="0" max="100" value="100">
        <div class="gv" id="rmv">reality-mix: 1.00</div>
      </div>
      <div class="gcol" style="flex:1 1 300px">
        <p class="note" style="color:rgba(226,233,242,.6)">两层叠着交叉淡入淡出，中间没有切换动作。
        真做标签页两态只能靠 JS 换 <span class="kbd" style="background:rgba(226,233,242,.1)">&lt;link rel="icon"&gt;</span>，
        且要带滞回阈值 —— 见 notes。</p>
      </div>
    </div>
  </section>

  <!-- 04 尺寸带 + 真光栅 -->
  <section>
    <div class="shead"><span class="n">04</span><h2>尺寸带 · 与真光栅的 16px</h2></div>
    <p class="note" style="margin:0 0 18px">上面一排是 SVG 直接缩到 32 / 24 / 16。<b>下面一排是真光栅</b>：
    同一枚 SVG 用 <span class="kbd">drawImage</span> 画进 16×16 的 canvas，再按整数倍放大 —— 浏览器标签栏里看到的就是这个。
    左起：真 16px（1:1）· 16px ×10 · 24px ×8 · 32px ×6。</p>
    <div class="panes">
      <div class="pane paper on-paper" style="--rm:1">
        <div class="plabel">醒 · 昼面 ${T.paper}</div>
        <div class="band">
          <div class="cell">${mark('mk-cw', '32px')}<span class="px">32</span></div>
          <div class="cell">${mark('mk-cw', '24px')}<span class="px">24</span></div>
          <div class="cell">${mark('mk-cw', '16px')}<span class="px">16</span></div>
        </div>
        <div class="rasterrow" data-face="wake" data-bg="${T.paper}"></div>
      </div>
      <div class="pane night on-night" style="--rm:0">
        <div class="plabel">梦 · 靛夜 ${T.night}</div>
        <div class="band">
          <div class="cell">${mark('mk-cd', '32px')}<span class="px">32</span></div>
          <div class="cell">${mark('mk-cd', '24px')}<span class="px">24</span></div>
          <div class="cell">${mark('mk-cd', '16px')}<span class="px">16</span></div>
        </div>
        <div class="rasterrow" data-face="dream" data-bg="${T.night}"></div>
      </div>
    </div>
    <div class="cap">16px 下这朵花只剩 ${CW.length} 粒点：花心一个空、周围一圈小点、外面五团深点。
    它不再是一张「有灰阶的图」，而是一个「有孔的花形点团」—— 这是这一档该有的样子。</div>
  </section>

  <!-- 05 标签栏 -->
  <section>
    <div class="shead"><span class="n">05</span><h2>真实标签页</h2></div>
    <div class="tabs">
      <div>
        <div class="tabbar light">
          <div class="tab off">${mark('mk-cw', '16px')}<span class="ttl">GitHub</span></div>
          <div class="tab on">${mark('mk-cw', '16px')}<span class="ttl">Traveritas</span></div>
          <div class="tab off">${mark('mk-cw', '16px')}<span class="ttl">RSS · 订阅</span></div>
        </div>
        <div class="chrome-under"></div>
      </div>
      <div>
        <div class="tabbar dark">
          <div class="tab off">${mark('mk-cd', '16px')}<span class="ttl">GitHub</span></div>
          <div class="tab on">${mark('mk-cd', '16px')}<span class="ttl">AveritA</span></div>
          <div class="tab off">${mark('mk-cd', '16px')}<span class="ttl">RSS</span></div>
        </div>
        <div class="chrome-under"></div>
      </div>
      <div>
        <div class="tabbar dark">
          <div class="tab off">${mark('mk-cd', '16px')}<span class="ttl">Notes</span></div>
          <div class="tab off">${mark('mk-cd', '16px')}<span class="ttl">Mail</span></div>
          <div class="tab off">${mark('mk-cd', '16px')}<span class="ttl">Docs</span></div>
          <div class="tab off">${mark('mk-cd', '16px')}<span class="ttl">Design</span></div>
          <div class="tab on">${mark('mk-cd', '16px')}<span class="ttl">Traveritas · 断章</span></div>
          <div class="tab off">${mark('mk-cd', '16px')}<span class="ttl">+</span></div>
        </div>
        <div class="chrome-under"></div>
      </div>
      <div>
        <div class="tabbar light">
          <div class="tab off amber">${mark('mk-cw', '16px')}<span class="ttl">GitHub</span></div>
          <div class="tab on amber">${mark('mk-cw', '16px')}<span class="ttl">Traveritas</span></div>
          <div class="tab off amber">${mark('mk-cw', '16px')}<span class="ttl">RSS</span></div>
        </div>
        <div class="chrome-under"></div>
      </div>
    </div>
    <div class="cap">浅栏里它是一枚偏深的点花，深栏里是一枚偏亮的点花。两处都不脏、不消失。
    最后一条是薄暮紫版：浅底上偏淡，仍然看得见。</div>
  </section>

  <!-- 06 单色 -->
  <section>
    <div class="shead"><span class="n">06</span><h2>单色退让 · currentColor</h2></div>
    <p class="note" style="margin:0 0 18px">整枚只用一种墨色时，灰阶层次整个丢掉，只剩「点的大小差」与「点在不在」。
    花心的空仍然在，五瓣的轮廓仍然靠「点团之间的空」读出来 —— 所以它不靠颜色也成立。</p>
    <div class="panes">
      <div class="pane paper on-paper">
        <div class="plabel">单色 · 昼面</div>
        <div class="band">
          <div class="cell">${mark('mk-fw', '128px')}<span class="px">128 细</span></div>
          <div class="cell">${mark('mk-cw', '128px')}<span class="px">128 粗</span></div>
          <div class="cell">${mark('mk-cw', '32px')}<span class="px">32</span></div>
          <div class="cell">${mark('mk-cw', '16px')}<span class="px">16</span></div>
        </div>
      </div>
      <div class="pane night on-night">
        <div class="plabel">单色 · 靛夜</div>
        <div class="band">
          <div class="cell">${mark('mk-fw', '128px')}<span class="px">128 细</span></div>
          <div class="cell">${mark('mk-cw', '128px')}<span class="px">128 粗</span></div>
          <div class="cell">${mark('mk-cw', '32px')}<span class="px">32</span></div>
          <div class="cell">${mark('mk-cw', '16px')}<span class="px">16</span></div>
        </div>
      </div>
      <div class="pane paper" style="color:${T.amber}">
        <div class="plabel" style="color:${T.amber}">单色 · 薄暮紫</div>
        <div class="band">
          <div class="cell">${mark('mk-fw', '128px')}<span class="px" style="color:${T.amber}">128 细</span></div>
          <div class="cell">${mark('mk-cw', '128px')}<span class="px" style="color:${T.amber}">128 粗</span></div>
          <div class="cell">${mark('mk-cw', '32px')}<span class="px" style="color:${T.amber}">32</span></div>
          <div class="cell">${mark('mk-cw', '16px')}<span class="px" style="color:${T.amber}">16</span></div>
        </div>
      </div>
    </div>
    <div class="cap">薄暮紫在深底上最稳，浅底上偏淡（约 2.3:1）。真要两边都硬，按 prefers-color-scheme 发两份 ink，比单发一份紫更清楚。</div>
  </section>

  <!-- 07 语境 -->
  <section>
    <div class="shead"><span class="n">07</span><h2>一格语境 · 放回主页</h2></div>
    <div class="ctx">
      <div class="ctxbar">
        <div class="tab off">${mark('mk-cd', '16px')}<span class="ttl">GitHub</span></div>
        <div class="tab on">${mark('mk-cd', '16px')}<span class="ttl">Traveritas</span></div>
        <div class="dots3"><i></i><i></i><i></i></div>
      </div>
      <div class="hero">
        <div class="dots"></div>
        <svg class="stepped" viewBox="0 0 760 340" preserveAspectRatio="none"><path d="${steppedLine(-20, 236, 800)}"/></svg>
        <div class="eyebrow">昼 梦 幻 集</div>
        <div class="name">Traveritas</div>
        <div class="entry" style="left:250px;top:184px"><i></i>Ⅰ 断章 <em>ESSAYS</em></div>
        <div class="entry" style="left:392px;top:220px"><i></i>Ⅱ 闪念 <em>MOMENTS</em></div>
        <div class="entry" style="left:534px;top:256px"><i></i>Ⅲ 造物 <em>PROJECTS</em></div>
        <div class="bloom">${mark('mk-fd', '82px')}</div>
        <div class="nexus">NEXUS</div>
      </div>
    </div>
    <div class="cap">右上角那朵是同一枚标记放大后的样子：它和页面背景那层网点、那根台阶线是同一套东西，
    所以它不像贴上去的 logo，像从这层纹理里长出来的一点。</div>
  </section>

  <hr>

  <section>
    <div class="shead"><span class="n">08</span><h2>交付</h2></div>
    <div class="files">
      <b>favicon.svg</b> —— 单枚成品 · 粗网线 ${CW.length} 粒 · 走 currentColor，暗色主题自适应<br>
      <b>favicon-dream.svg</b> —— 梦面 · 粗网线 · 外圈三粒薄暮紫<br>
      <b>gen.cjs</b> —— 生成器（花、网屏、对版、落版、网点全在这里算）<br>
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
const TONEMAP = "${toneMap(48)}";
const TN = 48;
const DOTS = ${dotsJson};
const COARSE_OFF = ${JSON.stringify(regCoarse.off)};
const COARSE_PITCH = ${RULING.coarse.pitch};

/* ① 连续调 */
(() => {
  const c = document.getElementById('tm'), ctx = c.getContext('2d');
  const n = TN, s = c.width / n;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const v = parseInt(TONEMAP[j * n + i], 16) / 15;
    const g = Math.round(245 - v * 210);
    ctx.fillStyle = 'rgb(' + g + ',' + (g + 2) + ',' + (g + 5) + ')';
    ctx.fillRect(i * s, j * s, s + 0.5, s + 0.5);
  }
})();

/* ② 网屏：连续调 + 14° 网线 */
(() => {
  const c = document.getElementById('lat'), ctx = c.getContext('2d');
  ctx.drawImage(document.getElementById('tm'), 0, 0);
  const k = c.width / 32;
  const pitch = COARSE_PITCH * k;
  const a = 14 * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a);
  const R = 700;
  ctx.strokeStyle = 'rgba(154,134,196,.6)';
  ctx.lineWidth = 1;
  for (let m = -40; m <= 40; m++) {
    const ox = m * pitch;
    ctx.beginPath();
    ctx.moveTo(100 + ox * cs - R * sn, 100 + ox * sn + R * cs);
    ctx.lineTo(100 + ox * cs + R * sn, 100 + ox * sn - R * cs);
    ctx.moveTo(100 + ox * cs - R * cs, 100 + ox * sn - R * sn);
    ctx.lineTo(100 + ox * cs + R * cs, 100 + ox * sn + R * sn);
    ctx.stroke();
  }
})();

/* ③ 网点：真实的粗网线那 ${CW.length} 粒 */
(() => {
  const c = document.getElementById('ht'), ctx = c.getContext('2d');
  const k = c.width / 32;
  for (const d of DOTS.cw) {
    const [x, y, r, sq, op] = d;
    ctx.globalAlpha = op;
    ctx.fillStyle = '#232830';
    if (sq) ctx.fillRect((x - r * 0.86) * k, (y - r * 0.86) * k, 2 * r * 0.86 * k, 2 * r * 0.86 * k);
    else { ctx.beginPath(); ctx.arc(x * k, y * k, r * k, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.globalAlpha = 1;
})();

/* 真光栅：同一批点画进 16 / 24 / 32 的 canvas */
function svgFor(dots, ink, amber) {
  const body = dots.map((d) => {
    const fill = d[5] ? amber : ink;
    const op = d[4] < 1 ? ' opacity="' + d[4].toFixed(2) + '"' : '';
    return d[3]
      ? '<rect x="' + (d[0] - d[2] * 0.86).toFixed(2) + '" y="' + (d[1] - d[2] * 0.86).toFixed(2) + '" width="' + (2 * d[2] * 0.86).toFixed(2) + '" height="' + (2 * d[2] * 0.86).toFixed(2) + '" fill="' + fill + '"' + op + '/>'
      : '<circle cx="' + d[0].toFixed(2) + '" cy="' + d[1].toFixed(2) + '" r="' + d[2].toFixed(2) + '" fill="' + fill + '"' + op + '/>';
  }).join('');
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">' + body + '</svg>';
}

async function raster(dots, ink, amber, px) {
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgFor(dots, ink, amber));
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
  const c = document.createElement('canvas');
  c.width = px; c.height = px;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, px, px);
  return c;
}

(async () => {
  for (const row of document.querySelectorAll('.rasterrow')) {
    const dream = row.dataset.face === 'dream';
    const dots = dream ? DOTS.cd : DOTS.cw;
    const ink = dream ? '#e2e9f2' : '#232830';
    const amber = '#a195c4';
    const specs = [
      { px: 16, show: 16, lbl: '16 · 1:1' },
      { px: 16, show: 160, lbl: '16 · ×10' },
      { px: 24, show: 192, lbl: '24 · ×8' },
      { px: 32, show: 192, lbl: '32 · ×6' },
    ];
    for (const sp of specs) {
      const box = document.createElement('div');
      box.className = 'rz';
      const c = await raster(dots, ink, amber, sp.px);
      c.style.width = sp.show + 'px';
      c.style.height = sp.show + 'px';
      box.appendChild(c);
      const l = document.createElement('span');
      l.className = 'lbl';
      l.textContent = sp.lbl;
      box.appendChild(l);
      row.appendChild(box);
    }
  }
})();

/* 总闸 */
const gate = document.getElementById('gate');
const rm = document.getElementById('rm');
const rmv = document.getElementById('rmv');
const sync = () => {
  const v = Number(rm.value) / 100;
  gate.style.setProperty('--rm', String(v));
  rmv.textContent = 'reality-mix: ' + v.toFixed(2);
};
rm.addEventListener('input', sync);
sync();
</script>
</body>
</html>
`;

/* ── dev：线数对照（不进交付） ── */
function devPage() {
  const variants = [
    { pitch: 4.4, snap: true },
    { pitch: 4.0, snap: true },
    { pitch: 3.6, snap: true },
    { pitch: 3.6, snap: false },
    { pitch: 3.2, snap: true },
    { pitch: 2.8, snap: true },
  ];
  const rows = variants
    .map((v, idx) => {
      const reg = register(v.pitch, 4, { target: 26, cap: 4, snap: v.snap });
      const dots = markSquares(reg.dots.map((d) => ({ ...d })));
      return `<div class="row"><div class="lb">pitch ${v.pitch}${v.snap ? '' : ' · 不落版'}<br>${dots.length} 粒 · 每瓣 ${reg.per.join('/')}</div>
      <div class="rz" data-d='${JSON.stringify(dots.map((d) => [d.x, d.y, d.r, d.sq ? 1 : 0]))}'></div></div>`;
    })
    .join('\n');
  return `<!doctype html><meta charset="utf-8"><title>bloom dev</title><style>
  body{background:#f0f3f6;font:13px system-ui;color:#232830;padding:26px;margin:0}
  .row{display:flex;align-items:flex-end;gap:28px;margin-bottom:22px}
  .lb{width:170px;font:11px/1.6 ui-monospace;color:#56606d}
  .rz{display:flex;align-items:flex-end;gap:18px}
  .c{display:flex;flex-direction:column;align-items:center;gap:5px;font:10px ui-monospace;color:#858f9d}
  canvas{image-rendering:pixelated;display:block}
  </style>${rows}
  <script>
  const S=(dots,ink)=>'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">'+dots.map(d=>d[3]
    ?'<rect x="'+(d[0]-d[2]*0.86)+'" y="'+(d[1]-d[2]*0.86)+'" width="'+(2*d[2]*0.86)+'" height="'+(2*d[2]*0.86)+'" fill="'+ink+'"/>'
    :'<circle cx="'+d[0]+'" cy="'+d[1]+'" r="'+d[2]+'" fill="'+ink+'"/>').join('')+'</svg>';
  (async()=>{
    for(const rz of document.querySelectorAll('.rz')){
      const dots=JSON.parse(rz.dataset.d);
      for(const [px,show] of [[16,16],[16,160],[32,192]]){
        const url='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(S(dots,'#232830'));
        const img=new Image(); await new Promise(r=>{img.onload=r;img.src=url;});
        const c=document.createElement('canvas'); c.width=c.height=px;
        const x=c.getContext('2d'); x.imageSmoothingQuality='high'; x.drawImage(img,0,0,px,px);
        c.style.width=c.style.height=show+'px';
        const w=document.createElement('div'); w.className='c'; w.appendChild(c);
        const t=document.createElement('span'); t.textContent=px+(show>px?' ×'+(show/px):''); w.appendChild(t);
        rz.appendChild(w);
      }
    }
  })();
  </script>`;
}

/* ── 输出 ── */
fs.writeFileSync(path.join(DIR, 'favicon.svg'), standalone('wake'));
fs.writeFileSync(path.join(DIR, 'favicon-dream.svg'), standalone('dream'));
fs.writeFileSync(path.join(DIR, 'index.html'), page);

console.log(
  `coarse pitch ${RULING.coarse.pitch}: ${CW.length} dots · per-petal ${regCoarse.per.join('/')} · off ${JSON.stringify(regCoarse.off)}`,
);
console.log(`fine   pitch ${RULING.fine.pitch}: ${FW.length} dots · per-petal ${regFine.per.join('/')}`);
console.log(`squares (highlight end): ${CW.filter((d) => d.sq).length}`);
if (process.argv[2] === 'dev') {
  const p = path.join(os.tmpdir(), 'bloom-dev.html');
  fs.writeFileSync(p, devPage());
  console.log('dev →', p);
}
console.log('wrote favicon.svg / favicon-dream.svg / index.html');
