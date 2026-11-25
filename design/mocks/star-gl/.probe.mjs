/* 离线读数（不开浏览器）：几何账、凹口、姿态分数、翻动的难看账
   node design/mocks/star-gl/.probe.mjs   → .shots/probe.json */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MAIN,
  cfgOf,
  buildGeometry,
  notchRadius,
  measurePose,
  calibrate,
  scoreSamples,
  poseAt,
  M_REST,
  frames,
  L_ISO,
  stationAt,
  A6_REF,
  SCORE_SIZE,
  TUMBLE,
  axisAngles,
} from './src.js';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '.shots');
fs.mkdirSync(OUT, { recursive: true });

const cal = calibrate(MAIN);
const g = buildGeometry(MAIN);

/* ① 剖面：半宽在 25/50/75/90% 处变成了多少（曲边的收腰） */
const widthProfile = [0.25, 0.5, 0.75, 0.9].map((f) => {
  const a = stationAt(f, MAIN);
  const straight = MAIN.halfWidth * (1 - f);
  return { f, W: +a.W.toFixed(3), straight: +straight.toFixed(3), pct: +((a.W / straight - 1) * 100).toFixed(1) };
});

/* ② 凹口：三个半宽 */
const notches = [0.2, 0.26, 0.32].map((k) => {
  const cfg = cfgOf({ halfWidth: k * 16 });
  const nr = notchRadius(cfg);
  return { halfWidth: +cfg.halfWidth.toFixed(3), notch: nr, at200: +((nr / 40) * 200).toFixed(2), at40: +((nr / 40) * 40).toFixed(2) };
});

/* ③ 中心投影覆盖：半径 R 以内，被几支的投影轮廓盖住（几何账，与渲染无关） */
function coverage(cfg, R) {
  const polys = frames(M_REST)
    .filter((f) => !f.skip)
    .map((fr) => {
      const pts = [];
      const N = 40;
      for (let i = 0; i <= N; i++) {
        const st = stationAt(i / N, cfg);
        pts.push([fr.a[0] * st.s + fr.side[0] * -st.W, fr.a[1] * st.s + fr.side[1] * -st.W]);
      }
      for (let i = N; i >= 0; i--) {
        const st = stationAt(i / N, cfg);
        pts.push([fr.a[0] * st.s + fr.side[0] * st.W, fr.a[1] * st.s + fr.side[1] * st.W]);
      }
      return pts;
    });
  const inside = (poly, x, y) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i];
      const b = poly[j];
      if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
    }
    return c;
  };
  const N = 60;
  const hist = new Array(7).fill(0);
  let n = 0;
  for (let i = 0; i < N; i++)
    for (let j = 0; j < N; j++) {
      const x = ((i + 0.5) / N - 0.5) * 2 * R;
      const y = ((j + 0.5) / N - 0.5) * 2 * R;
      if (x * x + y * y > R * R) continue;
      n++;
      let k = 0;
      for (const p of polys) if (inside(p, x, y)) k++;
      hist[Math.min(6, k)]++;
    }
  return { R, n, layered: hist.map((v) => +(v / n).toFixed(4)) };
}

/* ④ 姿态分数 + 翻动的难看账 */
const rest = measurePose(MAIN, M_REST, SCORE_SIZE);
const motion = scoreSamples({ n: 150 });

/* ⑤ 三轴的起止与落定 */
const anglesAt = [0, 0.12, 0.25, 0.5, 0.75, 0.88, 1].map((u) => ({ u, deg: axisAngles(u).map((v) => +v.toFixed(1)) }));
const landedScore = measurePose(MAIN, poseAt(1), SCORE_SIZE).score;

const report = {
  at: new Date().toISOString(),
  geometry: { ...g.stats, notch: notchRadius(MAIN), L: +L_ISO(MAIN.r).toFixed(4) },
  calibrate: cal,
  A6_REF: +A6_REF.toFixed(4),
  widthProfile,
  notches,
  coverage: [1.7, 2.5, 4.0, 5.0].map((R) => coverage(MAIN, R)),
  rest: { score: rest.score, balance: +rest.balance.toFixed(4), a6: +rest.a6.toFixed(4), aspect: +rest.aspect.toFixed(4) },
  landedScore,
  motion: {
    ugly: motion.ugly,
    pass: motion.pass,
    good: motion.good,
    min: motion.min,
    minT: motion.minT,
    uglyMs: motion.uglyMs,
    duration: TUMBLE.duration,
    rows: motion.rows,
  },
  anglesAt,
};
fs.writeFileSync(path.join(OUT, 'probe.json'), JSON.stringify(report, null, 2));
console.log(
  JSON.stringify(
    {
      geometry: report.geometry,
      calibrate: report.calibrate,
      widthProfile,
      notches,
      coverage: report.coverage.map((c) => ({ R: c.R, layered: c.layered })),
      rest: report.rest,
      landedScore,
      motion: { ugly: motion.ugly, min: motion.min, minT: motion.minT, uglyMs: motion.uglyMs },
      anglesAt,
    },
    null,
    2,
  ),
);