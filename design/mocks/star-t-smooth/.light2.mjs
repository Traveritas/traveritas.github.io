/* 光向：单光源在「截面法向」这一维上一定有盲区。
   六支的截面横向（side）在屏幕上成 60° 均布；一个屏幕平面内的光向，
   与其中某一对 side 恰好垂直时，那一对支的两侧同色 —— 支内没有折。
   这里把这件事算出来，并试双光源。 */
const DEG = Math.PI / 180;
const nrm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/* 与 src.js 的 pose() 同一套 */
function frames(yaw = 45, pitch = 35.2643897) {
  const y = yaw * DEG, p = pitch * DEG;
  const cy = Math.cos(y), sy = Math.sin(y), cp = Math.cos(p), sp = Math.sin(p);
  const out = [];
  for (const [name, ax] of [['x', [1, 0, 0]], ['y', [0, 1, 0]], ['z', [0, 0, 1]]]) {
    for (const s of [1, -1]) {
      const x1 = ax[0] * s * cy + ax[2] * s * sy;
      const z1 = -ax[0] * s * sy + ax[2] * s * cy;
      const y2 = ax[1] * s * cp - z1 * sp;
      const z2 = ax[1] * s * sp + z1 * cp;
      const L = Math.hypot(x1, y2);
      const ux = x1 / L, uy = y2 / L;
      out.push({
        key: name + (s > 0 ? '+' : '-'), a: [x1, y2, z2],
        side: [-uy, ux, 0],
        ed: [(-z2 * x1) / L, (-z2 * y2) / L, (1 - z2 * z2) / L],
        ang: ((Math.atan2(uy, ux) / DEG) + 360) % 360,
      });
    }
  }
  return out.sort((p, q) => p.ang - q.ang);
}
const FR = frames();
const dirOf = (az, el) => nrm([Math.cos(el * DEG) * Math.cos(az * DEG), Math.sin(el * DEG), Math.cos(el * DEG) * Math.sin(az * DEG)]);

/* 一支的「两侧差」：正面上最左与最右那两片的 shade 差 */
function split(fr, shadeFn) {
  const L1 = nrm([fr.side[0] - fr.ed[0] * 0.5, fr.side[1] - fr.ed[1] * 0.5, fr.side[2] - fr.ed[2] * 0.5]);
  const L2 = nrm([-fr.side[0] + fr.ed[0] * 0.5, -fr.side[1] + fr.ed[1] * 0.5, -fr.side[2] + fr.ed[2] * 0.5]);
  const Zh = fr.ed;
  return Math.abs(shadeFn(L1) - shadeFn(L2)) + 0.35 * Math.abs(shadeFn(Zh) - shadeFn(L1));
}

console.log('单光源 · az / el 上的最小「支内两侧差」（六支里最差的那一支）');
const rows = [];
for (let az = 0; az < 360; az += 10) {
  for (let el = -30; el <= 80; el += 10) {
    const L = dirOf(az, el);
    const f = (n) => Math.max(0, dot(n, L));
    const sp = FR.map((fr) => split(fr, f));
    rows.push({ az, el, min: Math.min(...sp), avg: sp.reduce((a, b) => a + b, 0) / 6, L });
  }
}
rows.sort((a, b) => b.min - a.min || b.avg - a.avg);
for (const r of rows.slice(0, 10)) console.log(`  az ${String(r.az).padStart(3)} el ${String(r.el).padStart(3)}  min ${r.min.toFixed(3)}  avg ${r.avg.toFixed(3)}`);
console.log('  最差：', rows[rows.length - 1].az, rows[rows.length - 1].el, rows[rows.length - 1].min.toFixed(3));

console.log('\n双光源（主光 az 0、仰角 30；补光随机方向、0.4 权重）');
const key = dirOf(0, 30);
const best = [];
for (let az = 0; az < 360; az += 15) {
  for (let el = -40; el <= 70; el += 15) {
    const fill = dirOf(az, el);
    const f = (n) => 0.72 * Math.max(0, dot(n, key)) + 0.42 * Math.max(0, dot(n, fill));
    const sp = FR.map((fr) => split(fr, f));
    best.push({ az, el, min: Math.min(...sp), avg: sp.reduce((a, b) => a + b, 0) / 6 });
  }
}
best.sort((a, b) => b.min - a.min || b.avg - a.avg);
for (const b of best.slice(0, 8)) console.log(`  fill az ${String(b.az).padStart(3)} el ${String(b.el).padStart(3)}  min ${b.min.toFixed(3)} avg ${b.avg.toFixed(3)}`);

console.log('\n每支的 side 方位角与「单光 az0 的差」');
for (const fr of FR) {
  const sa = ((Math.atan2(fr.side[1], fr.side[0]) / DEG) + 360) % 360;
  console.log(`  ${fr.key} ang ${fr.ang.toFixed(0)}  side ${sa.toFixed(0)}  |cos(side,az0)| ${Math.abs(Math.cos(sa * DEG)).toFixed(3)}`);
}