/* 读数：凹口半径、中心交叠、中心墨量、每支重量、与现役那颗的逐点一致性。
   node design/mocks/star-t-arc/.probe.mjs  →  .readings.json  */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BASE, VARIANTS, buildStar, spikes, spikeSegs, segsToPoints, chainEdge,
  silhouetteProfile, centreCrossings, centreLoad, pxPerUnit,
} from './src.js';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '.readings.json');

/* ── 0. 「直」那一档必须与 drawStar() 逐点一致 ─────────────── */
function legacyD() {
  const DEG = Math.PI / 180;
  const yaw = 45 * DEG, pit = 35.264 * DEG;
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pit), sp = Math.sin(pit);
  const list = [];
  for (const [ax, ay, az] of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) {
    for (const s of [1, -1]) {
      const x0 = ax * s, y0 = ay * s, z0 = az * s;
      const x1 = x0 * cy + z0 * sy;
      const z1 = -x0 * sy + z0 * cy;
      const y2 = y0 * cp - z1 * sp;
      const z2 = y0 * sp + z1 * cp;
      list.push({ x: x1 * 16, y: -y2 * 16, z: z2 });
    }
  }
  list.sort((a, b) => a.z - b.z);
  const out = [];
  for (const p of list) {
    const L = Math.hypot(p.x, p.y);
    if (L < 0.6) continue;
    const ux = p.x / L, uy = p.y / L, w = 1.9;
    const op = (0.38 + (0.5 * (p.z + 1)) / 2).toFixed(3);
    out.push({
      d: `M${(-uy * w).toFixed(2)} ${(ux * w).toFixed(2)}L${p.x.toFixed(2)} ${p.y.toFixed(2)}L${(uy * w).toFixed(2)} ${(-ux * w).toFixed(2)}L${(-ux * 1.4).toFixed(2)} ${(-uy * 1.4).toFixed(2)}Z`,
      op,
    });
  }
  return out;
}

const straight = buildStar({ edge: VARIANTS[0].edge }).paths;
const legacy = legacyD();
let maxDelta = 0;
let opSame = true;
for (let i = 0; i < 6; i++) {
  const num = (s) => s.match(/-?\d+(?:\.\d+)?/g).map(Number);
  const a = num(straight[i].d).slice(0, 8);
  const b = num(legacy[i].d).slice(0, 8);
  for (let k = 0; k < 8; k++) maxDelta = Math.max(maxDelta, Math.abs(a[k] - b[k]));
  if (straight[i].op.toFixed(3) !== legacy[i].op) opSame = false;
}

/* ── 1. 每支的宽度剖面 ─────────────────────────────────────
   两支侧边各自算，再在同一个「离尖端多远」的站上量两条边之间的宽度。
   直档是 1.9 → 0 的线性收敛；曲率就是让这条线不再直。 */
const S = spikes(BASE).find((s) => Math.abs(s.ux - 0.866) < 0.01 && Math.abs(s.uy - 0.5) < 0.01);
const N = [S.uy, -S.ux];
const W = BASE.halfWidth;
/* 一支的投影长度（屏幕上真实那一支） */
const SPIKE_LEN = S.rp;
const AX_UP = [0, -1];
const AX_N = [1, 0];
const P_LEFT = [-AX_N[0] * W, -AX_N[1] * W];
const P_RIGHT = [AX_N[0] * W, AX_N[1] * W];
const P_TIP = [0, -SPIKE_LEN];

/** 一条边采成点列 */
function edgePts(from, to, nOut, edge) {
  const segs = chainEdge(from, to, edge.knots || [], edge.offs, nOut);
  const pts = [];
  for (const s of segs) {
    for (let i = 0; i <= 40; i++) {
      const t = i / 40, mt = 1 - t;
      pts.push([
        mt * mt * s.a[0] + 2 * mt * t * s.c[0] + t * t * s.b[0],
        mt * mt * s.a[1] + 2 * mt * t * s.c[1] + t * t * s.b[1],
      ]);
    }
  }
  return pts;
}

/**
 * 宽度剖面：在「离尖端 f·L 处」量左右两条边之间的横向距离。
 * 直档的剖面是 w(f) = 2·1.9·f（从尖端 0 线性长到根部 3.8）。
 */
/**
   * 宽度剖面：f 是「从根部算起走了几成」。
   * 直档的剖面是 w(f) = 2·1.9·(1 − f)（根部 3.8，尖端 0）。
   */
function weight(edge) {
  /* 左翼在 x = −1.9，它「往外」是 −x；右翼在 x = +1.9，往外是 +x。
     与 src.js 的 spikeSegs 一致：A = −n·w 那一侧的外法向是 −n。 */
  const Lp = edgePts(P_LEFT, P_TIP, [-1, 0], edge);
  const Rp = edgePts(P_RIGHT, P_TIP, [1, 0], edge);
  const at = (pts, f) => {
    const target = -SPIKE_LEN * f;
    let best = pts[0], bd = Infinity;
    for (const p of pts) {
      const d = Math.abs(p[1] - target);
      if (d < bd) { bd = d; best = p; }
    }
    return best[0];
  };
  const widths = {};
  for (const f of [0.25, 0.5, 0.75, 0.9]) {
    widths['w' + Math.round(f * 100)] = +(at(Rp, f) - at(Lp, f)).toFixed(2);
  }
  const straightW = (f) => 2 * W * (1 - f);
  /* 剖面偏离直线：每个站 (实际宽 − 直档宽)，正 = 比直线宽、负 = 比直线窄。
     两段曲线会同时给出一个负段与一个正段；单段只给一边。 */
  let neck = 0, neckAt = 0, belly = 0, bellyAt = 0;
  for (let i = 20; i <= 190; i++) {
    const f = i / 200;
    const d = at(Rp, f) - at(Lp, f) - straightW(f);
    if (d < neck) { neck = d; neckAt = f; }
    if (d > belly) { belly = d; bellyAt = f; }
  }
  /* 尖端半角：最后一段在尖端处与轴线的夹角 */
  const tip = (pts) => {
    const a = pts[pts.length - 1];
    const b = pts[pts.length - 12];
    const tg = [a[0] - b[0], a[1] - b[1]];
    return (Math.acos(Math.min(1, Math.abs(tg[1]) / Math.hypot(...tg))) * 180) / Math.PI;
  };
  /* 边缘偏离直线超过 0.15u 的最小半径（= 弯最早在哪里看得出来） */
  let firstBend = null;
  for (const [pts, from] of [[Lp, P_LEFT], [Rp, P_RIGHT]]) {
    for (const p of pts) {
      const d = Math.abs(
        (p[0] - from[0]) * (P_TIP[1] - from[1]) - (p[1] - from[1]) * (P_TIP[0] - from[0]),
      ) / Math.hypot(P_TIP[0] - from[0], P_TIP[1] - from[1]);
      if (d > 0.15) {
        const r = Math.hypot(p[0], p[1]);
        if (firstBend === null || r < firstBend) firstBend = r;
      }
    }
  }
  return {
    ...widths,
    midVsStraight: +(((widths.w50 / straightW(0.5)) - 1) * 100).toFixed(0),
    /* 剖面相对直线的最大摆动（体单位），以及与直档相比最窄/最宽处的深度 */
    swing: +Math.max(Math.abs(neck), Math.abs(belly)).toFixed(2),
    neck: +neck.toFixed(2),
    neckAt: +neckAt.toFixed(2),
    belly: +belly.toFixed(2),
    bellyAt: +bellyAt.toFixed(2),
    tipHalfAngle: +((tip(Lp) + tip(Rp)) / 2).toFixed(1),
    firstBend: firstBend === null ? null : +firstBend.toFixed(2),
  };
}

/* ── 2. 逐档读数 ─────────────────────────────────────────── */
const rows = [];
for (const v of VARIANTS) {
  const pr = silhouetteProfile({ edge: v.edge });
  const w = weight(v.edge);
  const px = (s) => +(pr.notch * pxPerUnit(s)).toFixed(2);
  rows.push({
    id: v.id,
    fam: v.fam,
    name: v.name,
    note: v.note || '',
    offs: v.edge.offs,
    knots: v.edge.knots,
    ...w,
    prof: undefined,
    notchU: +pr.notch.toFixed(4),
    notchDeg: +pr.notchDeg.toFixed(1),
    notchPx: { 48: px(48), 96: px(96), 200: px(200), 400: px(400) },
    peakU: +Math.max(...pr.R).toFixed(4),
    cross1_6: centreCrossings({ edge: v.edge }, 1.6),
    cross3_2: centreCrossings({ edge: v.edge }, 3.2),
    load1_6: +centreLoad({ edge: v.edge }, 1.6, 0.06).toFixed(3),
    load3_2: +centreLoad({ edge: v.edge }, 3.2, 0.1).toFixed(3),
  });
}

const base = rows[0];
for (const r of rows) {
  r.notchVsStraight = +((r.notchU / base.notchU - 1) * 100).toFixed(1);
  r.peakVsStraight = +((r.peakU / base.peakU - 1) * 100).toFixed(1);
  r.load1_6VsStraight = +((r.load1_6 / base.load1_6 - 1) * 100).toFixed(1);
  r.load3_2VsStraight = +((r.load3_2 / base.load3_2 - 1) * 100).toFixed(1);
}

/* ── 3. 中心：r < 3.2 的覆盖分布（露底 / 单层 / 叠层） ──────── */
function inPoly(poly, x, y) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

function centreMix(edge, radius = 3.2, step = 0.08) {
  const polys = spikes(BASE).map((s) => segsToPoints(spikeSegs(s, { ...BASE, edge }), 30));
  let z = 0, one = 0, mix = 0, tot = 0;
  for (let x = -radius; x <= radius; x += step) {
    for (let y = -radius; y <= radius; y += step) {
      if (x * x + y * y > radius * radius) continue;
      tot++;
      let k = 0;
      for (const q of polys) if (inPoly(q, x, y)) k++;
      if (k === 0) z++;
      else if (k === 1) one++;
      else mix++;
    }
  }
  return {
    bare: +((z / tot) * 100).toFixed(1),
    single: +((one / tot) * 100).toFixed(1),
    layered: +((mix / tot) * 100).toFixed(1),
  };
}

/** 内部结点位置（离尖端多远开始换向）—— 两段曲线的转点 */
function knotDepth(edge) {
  return (edge.knots || []).map((k) => +(1 - k).toFixed(2));
}

for (const r of rows) {
  const v = VARIANTS.find((q) => q.id === r.id);
  Object.assign(r, centreMix(v.edge), { knotDepth: knotDepth(v.edge) });
}

/* ── 4. 六个内角的角度位置（判断六支是否仍等角） ───────────── */
const angles = rows.map((r) => r.notchDeg);
const spread = +(Math.max(...angles) - Math.min(...angles)).toFixed(1);

fs.writeFileSync(OUT, JSON.stringify({
  parity: {
    maxDelta: +maxDelta.toFixed(6),
    opSame,
    note: '直档 vs drawStar() 的前四组坐标最大差（体单位）',
  },
  spikeLen: +SPIKE_LEN.toFixed(3),
  halfWidth: W,
  notchAngleSpread: spread,
  rows,
}, null, 2));

console.log('parity maxDelta', maxDelta, '｜ opSame', opSame, '｜ 投影支长', SPIKE_LEN.toFixed(3));
console.log('id   25%   50%   75%   90%  中点vs直 摆  腰   腰@  腹   腹@  尖端° 首弯r 凹口u @48  @96  @200 Δ%   露底 单层 叠层   name');
for (const r of rows) {
  console.log(
    r.id.padEnd(4),
    String(r.w25).padEnd(5),
    String(r.w50).padEnd(5),
    String(r.w75).padEnd(5),
    String(r.w90).padEnd(5),
    String(r.midVsStraight >= 0 ? '+' + r.midVsStraight : r.midVsStraight).padEnd(8),
    String(r.swing).padEnd(4),
    String(r.neck).padEnd(5),
    String(r.neckAt).padEnd(4),
    String(r.belly).padEnd(4),
    String(r.bellyAt).padEnd(4),
    String(r.tipHalfAngle).padEnd(6),
    String(r.firstBend ?? '—').padEnd(5),
    String(r.notchU).padEnd(5),
    String(r.notchPx[48]).padEnd(4),
    String(r.notchPx[96]).padEnd(4),
    String(r.notchPx[200]).padEnd(5),
    String((r.notchVsStraight > 0 ? '+' : '') + r.notchVsStraight).padEnd(5),
    String(r.bare).padEnd(5),
    String(r.single).padEnd(4),
    String(r.layered).padEnd(5),
    r.name,
  );
}
console.log('\n六个内角的角度极差', spread, '度（0 = 六个凹口严格等角）');
console.log('wrote', OUT);