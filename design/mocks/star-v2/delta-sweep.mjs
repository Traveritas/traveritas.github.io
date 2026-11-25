/* δ 扫描（第五轮 · 离线）
   node design/mocks/star-v2/delta-sweep.mjs          → 表格
   node design/mocks/star-v2/delta-sweep.mjs --json    → 一行 JSON

   BRIEF-5 §1：让落定姿态从体对角正位出发，绕**视轴**倾斜 δ，扫
   0 / 5 / 10 / 15 / 20，每档报四件：
     · 径向剖面的峰数（要求 6）
     · 六个峰的角间距（标准 60°，报最大偏差）
     · 六个峰的半径（报最大偏差百分比）
     · 星内亮度按 8 级分箱后，占比 > 8% 的箱数（= 可辨明暗档数）

   选 δ 的判据（BRIEF 给）：峰数 6 且 角间距最大偏差 ≤ 3° 且 峰半径最大偏差 ≤ 3%，
   在此前提下取「可辨明暗档数」最多的那个；δ=0 已满足就取 0。

   关键几何事实（这是本轮最该说清的一句）：
   **绕视轴的 roll 是纯旋转 + 画面内自转**，它不改变剪影的形状，
   也不改变任何一张面与视轴的夹角 —— 所以峰数/角间距/峰半径/明暗档数
   在 δ = 0…20 之间**全部不变**。表格里五个 δ 是同一个模子的数字，
   这不是程序没接上，是几何本身如此（下面 `rollInvariant` 会显式核一遍）。
*/
import { buildBlocks, buildBlocksOpts, blocksInView, poseAt, restRoll, RENDER } from './src.js';
import { setView, shade, BG } from './tone.mjs';

const TAN = RENDER.tan;
const CAM = RENDER.camZ;
const DELTAS = [0, 5, 10, 15, 20];

const pad = (v, n) => String(v).padStart(n);

/* ── 径向剖面 ── */
function radial(view, NS = 360) {
  const cov = (x, y) => {
    for (const faces of view) {
      let lo = -Infinity;
      let hi = Infinity;
      let ok = true;
      for (const f of faces) {
        const r = f[3] - f[0] * x - f[1] * y;
        if (Math.abs(f[2]) < 1e-9) {
          if (r < 0) { ok = false; break; }
        } else if (f[2] > 0) hi = Math.min(hi, r / f[2]);
        else lo = Math.max(lo, r / f[2]);
      }
      if (ok && lo <= hi) return true;
    }
    return false;
  };
  const out = [];
  for (let i = 0; i < NS; i++) {
    const a = (i / NS) * Math.PI * 2;
    let lo = 0;
    let hi = 1.4;
    for (let k = 0; k < 60; k++) {
      const m = (lo + hi) / 2;
      if (cov(Math.cos(a) * m, Math.sin(a) * m)) lo = m;
      else hi = m;
    }
    out.push({ deg: (i / NS) * 360, r: (lo + hi) / 2 });
  }
  return out;
}
function peaksOf(r) {
  const N = r.length;
  const out = [];
  /* 只认「显著」的峰：比左右各 6 个采样点（= 6°，NS=360）都高，且高出 relative 阈值。
     三角截面的剪影在芒尖之间还有一处很浅的局部凸起（51.25° 处 r≈0.362，
     比两侧只高 0.0007 —— 那是两个三角面交接处的投影折痕，不是芒尖）。
     不设阈值会把它数成一个峰，于是 B 报 7 个峰。芒尖的门槛取「比两侧 6° 内的最小值
     高出 2% 」—— 真正的尖在这套尺度下是 20%+，折痕只有 0.2%。 */
  const WIN = 6;
  for (let i = 0; i < N; i++) {
    const c = r[i].r;
    let lo = Infinity;
    let isMax = true;
    for (let d = 1; d <= WIN; d++) {
      const a = r[(i - d + N) % N].r;
      const b = r[(i + d) % N].r;
      if (c < a || c <= b) { isMax = false; break; }
      lo = Math.min(lo, a, b);
    }
    if (isMax && (c - lo) / c >= 0.02) out.push(r[i]);
  }
  return out;
}

/* ── 星内亮度：8 级分箱，占比 > 8% 的箱数 ── */
function toneLevels(view, PX = 200) {
  setView(view);
  const bins = new Array(8).fill(0);
  let n = 0;
  for (let y = 0; y < PX; y++) {
    for (let x = 0; x < PX; x++) {
      const nx = ((x + 0.5) / PX) * 2 - 1;
      const ny = 1 - ((y + 0.5) / PX) * 2;
      const d = [nx * TAN, ny * TAN, -1];
      const L = Math.hypot(d[0], d[1], d[2]);
      const s = shade([0, 0, CAM], [d[0] / L, d[1] / L, d[2] / L]);
      if (!s) continue;
      /* 与底色差 > 6 才算星内（与 tone.mjs 同口径） */
      const dr =
        Math.max(
          Math.abs(Math.min(1, Math.max(0, s.col[0])) - BG[0]),
          Math.abs(Math.min(1, Math.max(0, s.col[1])) - BG[1]),
          Math.abs(Math.min(1, Math.max(0, s.col[2])) - BG[2]),
        ) * 255;
      if (dr <= 6) continue;
      const lum = 0.2126 * Math.min(1, s.col[0]) + 0.7152 * Math.min(1, s.col[1]) + 0.0722 * Math.min(1, s.col[2]);
      bins[Math.min(7, Math.floor(lum * 8))]++;
      n++;
    }
  }
  const pct = bins.map((b) => +((b / Math.max(1, n)) * 100).toFixed(1));
  return { levels: pct.filter((v) => v > 8).length, pct };
}

/* ── 每档 δ 的读数 ── */
const BLOCKS = buildBlocks();
function measureRoll(deg) {
  const view = blocksInView(BLOCKS, restRoll(deg));
  const r = radial(view);
  const pk = peaksOf(r);
  const degs = pk.map((o) => o.deg).sort((a, b) => a - b);
  const gaps = degs.map((d, i) => (((degs[(i + 1) % degs.length] - d) + 360) % 360));
  const radii = pk.map((o) => o.r);
  const rMax = Math.max(...radii);
  const rMin = Math.min(...radii);
  const tone = toneLevels(view);
  return {
    delta: deg,
    peakCount: pk.length,
    peakDegs: degs.map((d) => +d.toFixed(2)),
    gapMaxDev: +Math.max(...gaps.map((g) => Math.abs(g - 60))).toFixed(3),
    peakRadii: radii.map((v) => +v.toFixed(4)),
    radiusMaxDevPct: +(((rMax - rMin) / rMax) * 100).toFixed(3),
    toneLevels: tone.levels,
    tonePct: tone.pct,
    /* 剪影形状与 δ 无关的证明：把星体自身滚回 0 再量一次，两次峰数/半径应重合 */
  };
}

/* ── 「roll 不改形状」的显式核对 ──
   把 δ=20 的径向剖面整体转 −20° 后与 δ=0 的比对，最大差应 ~0。 */
function rollInvariantCheck() {
  const r0 = radial(blocksInView(BLOCKS, restRoll(0)), 720);
  const r20 = radial(blocksInView(BLOCKS, restRoll(20)), 720);
  const shiftIdx = Math.round((20 / 360) * 720); // 20° 在 720 份里是 40 份
  let mx = 0;
  for (let i = 0; i < 720; i++) mx = Math.max(mx, Math.abs(r20[(i + shiftIdx) % 720].r - r0[i].r));
  return +mx.toFixed(6);
}

const rows = DELTAS.map(measureRoll);
const okOnes = rows.filter((r) => r.peakCount === 6 && r.gapMaxDev <= 3 && r.radiusMaxDevPct <= 3);
const best = okOnes.length
  ? okOnes.reduce((a, b) => (b.toneLevels > a.toneLevels ? b : a), okOnes[0])
  : null;
const invariant = rollInvariantCheck();

/* ── 三列在新姿态下的剪影读数（BRIEF-5 §2） ── */
const COLS3 = [
  { id: 'A', label: 'A · 现役菱形', kind: 'quad', theta: 45 },
  { id: 'B', label: 'B · 三角截面', kind: 'tri', theta: null },
  { id: 'C', label: 'C · 脊压平 (θ=15°)', kind: 'quad', theta: 15 },
];
function maskOf(view, N = 400) {
  const cov = (x, y) => {
    for (const faces of view) {
      let lo = -Infinity;
      let hi = Infinity;
      let ok = true;
      for (const f of faces) {
        const r = f[3] - f[0] * x - f[1] * y;
        if (Math.abs(f[2]) < 1e-9) {
          if (r < 0) { ok = false; break; }
        } else if (f[2] > 0) hi = Math.min(hi, r / f[2]);
        else lo = Math.max(lo, r / f[2]);
      }
      if (ok && lo <= hi) return true;
    }
    return false;
  };
  const m = new Uint8Array(N * N);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const nx = ((x + 0.5) / N) * 2 - 1;
      const ny = 1 - ((y + 0.5) / N) * 2;
      m[y * N + x] = cov(nx * TAN * CAM, ny * TAN * CAM) ? 1 : 0;
    }
  return m;
}
const maskDiff = (a, b) => {
  let d = 0;
  let u = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] || b[i]) u++;
    if (a[i] !== b[i]) d++;
  }
  return +((d / Math.max(1, u)) * 100).toFixed(2);
};
/* 锐棱数（与第四轮同口径：二面角 ≤150° 且真的出现在画面上的面—面相邻对） */
function sharpRidges(view, N = 320, sharpDeg = 150) {
  const D = Math.cos(((180 - sharpDeg) * Math.PI) / 180);
  const tag = new Int32Array(N * N).fill(-1);
  const nrm = new Float32Array(N * N * 3);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const wx = (((x + 0.5) / N) * 2 - 1) * TAN * CAM;
      const wy = (1 - ((y + 0.5) / N) * 2) * TAN * CAM;
      let bestT = Infinity;
      let bk = -1;
      let bi = -1;
      for (let k = 0; k < view.length; k++) {
        const faces = view[k];
        let t0 = -Infinity;
        let t1 = Infinity;
        let ni = -1;
        for (let i = 0; i < faces.length; i++) {
          const f = faces[i];
          const num = f[3] - (f[0] * wx + f[1] * wy);
          if (f[2] > 1e-7) t1 = Math.min(t1, num / f[2]);
          else if (f[2] < -1e-7) {
            const t = num / f[2];
            if (t > t0) { t0 = t; ni = i; }
          }
        }
        if (ni < 0 || t0 > t1 || t1 <= 1e-6) continue;
        if (t0 < bestT) { bestT = t0; bk = k; bi = ni; }
      }
      if (bk < 0) continue;
      const idx = y * N + x;
      tag[idx] = bk * 16 + bi;
      const f = view[bk][bi];
      nrm[idx * 3] = f[0];
      nrm[idx * 3 + 1] = f[1];
      nrm[idx * 3 + 2] = f[2];
    }
  const pairs = new Set();
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const a = tag[y * N + x];
      if (a < 0) continue;
      for (const [dx, dy] of [[1, 0], [0, 1]]) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= N || yy >= N) continue;
        const b = tag[yy * N + xx];
        if (b < 0 || b === a) continue;
        const pa = (y * N + x) * 3;
        const pb = (yy * N + xx) * 3;
        const d = nrm[pa] * nrm[pb] + nrm[pa + 1] * nrm[pb + 1] + nrm[pa + 2] * nrm[pb + 2];
        if (d > D) continue;
        pairs.add(a < b ? `${a}|${b}` : `${b}|${a}`);
      }
    }
  return pairs.size;
}

const pose = poseAt(0);
const cols = COLS3.map((c) => {
  const blocks = buildBlocksOpts({ kind: c.kind, theta: c.theta ?? 45 });
  const view = blocksInView(blocks, pose);
  const r = radial(view);
  const pk = peaksOf(r);
  const degs = pk.map((o) => o.deg).sort((a, b) => a - b);
  const gaps = degs.map((d, i) => (((degs[(i + 1) % degs.length] - d) + 360) % 360));
  const radii = pk.map((o) => o.r);
  return {
    id: c.id,
    label: c.label,
    faces: blocks.reduce((a, b) => a + b.length, 0),
    sharpRidges: sharpRidges(view),
    peakCount: pk.length,
    peakDegs: degs.map((d) => +d.toFixed(2)),
    gapMaxDev: +Math.max(...gaps.map((g) => Math.abs(g - 60))).toFixed(3),
    peakRadiusMaxDevPct: +(((Math.max(...radii) - Math.min(...radii)) / Math.max(...radii)) * 100).toFixed(3),
    notchOverTip: +(Math.min(...r.map((o) => o.r)) / Math.max(...r.map((o) => o.r))).toFixed(4),
    _mask: maskOf(view),
    _view: view,
    _blocks: blocks,
  };
});
const aMask = cols[0]._mask;
for (const c of cols) c.diffVsA = c.id === 'A' ? 0 : maskDiff(aMask, c._mask);

/* B 列那 11.81% 偏在哪：分三件量 */
function bDeviationBreakdown() {
  const A = cols[0]._view;
  const Bv = cols[1]._view;
  /* 1. 臂宽：沿 0/60/…/300 六个方向量半径，比 A 与 B */
  const radialAt = (view, degs, NS = 1440) => {
    const cov = (x, y) => {
      for (const faces of view) {
        let lo = -Infinity;
        let hi = Infinity;
        let ok = true;
        for (const f of faces) {
          const r = f[3] - f[0] * x - f[1] * y;
          if (Math.abs(f[2]) < 1e-9) {
            if (r < 0) { ok = false; break; }
          } else if (f[2] > 0) hi = Math.min(hi, r / f[2]);
          else lo = Math.max(lo, r / f[2]);
        }
        if (ok && lo <= hi) return true;
      }
      return false;
    };
    return degs.map((deg) => {
      const a = (deg * Math.PI) / 180;
      let lo = 0;
      let hi = 1.4;
      for (let k = 0; k < 64; k++) {
        const m = (lo + hi) / 2;
        if (cov(Math.cos(a) * m, Math.sin(a) * m)) lo = m;
        else hi = m;
      }
      return (lo + hi) / 2;
    });
  };
  const peakDegs = cols[0].peakDegs;
  const notchDegs = peakDegs.map((d) => (d + 30) % 360); // 六尖之间的中点
  const aPeak = radialAt(A, peakDegs);
  const bPeak = radialAt(Bv, peakDegs);
  const aNotch = radialAt(A, notchDegs);
  const bNotch = radialAt(Bv, notchDegs);
  const pct = (a, b) => +(((b - a) / a) * 100).toFixed(2);
  /* 2. 尖角：每个尖处两条边之间的夹角（用剪影边界在尖两侧的斜率估） */
  const tipHalf = (view, deg) => {
    /* 尖处向两侧各取 3°，看半径掉多快 → 夹角越小掉得越快 */
    const rr = radialAt(view, [deg - 6, deg - 3, deg + 3, deg + 6]);
    const r0 = radialAt(view, [deg])[0];
    const dropL = (r0 - rr[0]) / r0;
    const dropR = (r0 - rr[3]) / r0;
    return +(((dropL + dropR) / 2) * 100).toFixed(2);
  };
  return {
    peakDegs,
    armRadius: {
      A: aPeak.map((v) => +v.toFixed(4)),
      B: bPeak.map((v) => +v.toFixed(4)),
      pctDiff: aPeak.map((v, i) => pct(v, bPeak[i])),
    },
    notchRadius: {
      A: aNotch.map((v) => +v.toFixed(4)),
      B: bNotch.map((v) => +v.toFixed(4)),
      pctDiff: aNotch.map((v, i) => pct(v, bNotch[i])),
    },
    notchOverTipA: +(Math.min(...aNotch) / Math.max(...aPeak)).toFixed(4),
    notchOverTipB: +(Math.min(...bNotch) / Math.max(...bPeak)).toFixed(4),
    /* 3. 尖角锐度：尖两侧各 3° 处半径的跌幅（越大越尖） */
    tipSharpness: peakDegs.map((d) => ({ deg: d, A: tipHalf(A, d), B: tipHalf(Bv, d) })),
  };
}
const bBreak = bDeviationBreakdown();

const out = {
  deltas: rows,
  chosen: best,
  rollInvariantMaxDiff: invariant,
  cols: cols.map(({ _mask, _view, _blocks, ...rest }) => rest),
  bBreakdown: bBreak,
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(out));
} else {
  console.log('δ 扫描 —— 绕视轴 roll（R\' = V_RESTᵀ·Rz(δ)·V_REST）');
  console.log('  δ    峰数  峰角间距最大偏差  峰半径最大偏差  可辨明暗档数  8 级分箱占比');
  for (const r of rows) {
    console.log(
      '  ' + pad(r.delta + '°', 4),
      pad(r.peakCount, 4),
      pad(r.gapMaxDev + '°', 15),
      pad(r.radiusMaxDevPct + '%', 14),
      pad(r.toneLevels, 12),
      ' ' + r.tonePct.join(' / '),
    );
  }
  console.log('');
  console.log('  「roll 不改形状」核对：δ=20 的剖面转 −20° 后与 δ=0 的最大差 =', invariant);
  console.log('  （0 表示五个 δ 是同一形状的不同朝向 —— 这是几何事实，不是程序没接上）');
  console.log('');
  console.log('  → 选中 δ =', best ? best.delta + '°' : '（无满足项）',
    '· 峰数', best?.peakCount, '· 角间距偏差', best?.gapMaxDev + '°',
    '· 半径偏差', best?.radiusMaxDevPct + '%', '· 明暗档数', best?.toneLevels);
  console.log('');
  console.log('三列在新落定姿态下的剪影（BRIEF-5 §2）');
  console.log('  列  面数  锐棱  峰数  峰角间距偏差  峰半径偏差  凹口/尖  与A差%');
  for (const c of cols) {
    console.log(
      '  ' + c.id.padEnd(3),
      pad(c.faces, 5),
      pad(c.sharpRidges, 5),
      pad(c.peakCount, 5),
      pad(c.gapMaxDev + '°', 13),
      pad(c.peakRadiusMaxDevPct + '%', 11),
      pad(c.notchOverTip, 8),
      pad(c.diffVsA, 7),
    );
  }
  console.log('');
  console.log('B 列偏差拆解（11.81% 具体偏在哪）');
  console.log('  臂半径  A:', bBreak.armRadius.A.join(', '));
  console.log('          B:', bBreak.armRadius.B.join(', '));
  console.log('       差%:', bBreak.armRadius.pctDiff.join(', '));
  console.log('  凹口半径 A:', bBreak.notchRadius.A.join(', '));
  console.log('           B:', bBreak.notchRadius.B.join(', '));
  console.log('        差%:', bBreak.notchRadius.pctDiff.join(', '));
  console.log('  凹口/尖  A =', bBreak.notchOverTipA, ' B =', bBreak.notchOverTipB);
  console.log('  尖角锐度（尖两侧各 3° 处半径跌幅 %，越大越尖）:');
  for (const t of bBreak.tipSharpness) console.log(`    ${t.deg}°: A ${t.A}%  B ${t.B}%`);
}