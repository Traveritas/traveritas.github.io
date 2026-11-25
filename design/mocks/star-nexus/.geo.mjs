/* 几何自检：不开浏览器，直接验凸块并集。
   node design/mocks/star-nexus/.geo.mjs */
globalThis.matchMedia = globalThis.matchMedia || (() => ({ matches: false, addEventListener() {} }));
const { buildSolid, fillCfg, MAXP, NPPL, camPos } = await import('./src.js');

const g = buildSolid(fillCfg({ w: 0.26, prof: 'waist', seg: 4, bev: 0.42 }));
console.log('pieces', g.nPieces, 'tris', g.tris);

/* ① 每个半空间：把块心的内点（块心一定在内侧）代进去要显著 < d */
let worst = 0;
for (let k = 0; k < g.nPieces; k++) {
  const c = [g.spheres[k * 4], g.spheres[k * 4 + 1], g.spheres[k * 4 + 2]];
  for (let i = 0; i < NPPL; i++) {
    const o = (k * NPPL + i) * 4;
    const n = [g.planes[o], g.planes[o + 1], g.planes[o + 2]];
    const d = g.planes[o + 3];
    const L = Math.hypot(...n);
    const gv = d - (n[0] * c[0] + n[1] * c[1] + n[2] * c[2]);
    if (Math.abs(L - 1) > 1e-4) console.log('  面法向未归一', k, i, L);
    if (gv < 0) console.log('  块心在外侧！', k, i, gv);
    worst = Math.max(worst, Math.abs(gv));
  }
}
console.log('① 半空间朝外：块心到各面的距离都 > 0，最大', worst.toFixed(4));

/* ② 沿 +z 打一束平行光线穿过原点附近：出射应当与解析值对上（凹口处不折） */
function pieceAt(P, T, k) {
  let ta = -1e9, tb = 1e9, nb = null, fail = false;
  for (let i = 0; i < NPPL; i++) {
    const o = (k * NPPL + i) * 4;
    const n = [g.planes[o], g.planes[o + 1], g.planes[o + 2]];
    const d = g.planes[o + 3];
    const dn = n[0] * T[0] + n[1] * T[1] + n[2] * T[2];
    const gg = d - (n[0] * P[0] + n[1] * P[1] + n[2] * P[2]);
    if (dn > 1e-6) { const t = gg / dn; if (t < tb) { tb = t; nb = n; } }
    else if (dn < -1e-6) { const t = gg / dn; if (t > ta) ta = t; }
    else if (gg < 0) fail = true;
  }
  return { ta, tb, nb, ok: !fail && ta <= tb };
}
function exitUnion(P, T) {
  let best = -1, nb = null;
  for (let k = 0; k < g.nPieces; k++) {
    const c = [g.spheres[k * 4], g.spheres[k * 4 + 1], g.spheres[k * 4 + 2]];
    const r = g.spheres[k * 4 + 3];
    const dp = [P[0] - c[0], P[1] - c[1], P[2] - c[2]];
    if (dp[0] * dp[0] + dp[1] * dp[1] + dp[2] * dp[2] > r * r) continue;
    const q = pieceAt(P, T, k);
    if (!q.ok || q.ta > 1e-3) continue;
    if (q.tb > best) { best = q.tb; nb = q.nb; }
  }
  return { t: best, nb };
}

/* 从外面朝原点打，看每个方向能不能找到出射 */
const dirs = [];
for (let i = 0; i < 24; i++) {
  const a = (i / 24) * Math.PI * 2;
  dirs.push([Math.cos(a) * 0.5, Math.sin(a) * 0.5, 1]);
}
dirs.push([0.001, 0.001, 1], [0.3, 0.2, 1], [0.45, 0.45, 1]);
let bad = 0;
for (const [px, py] of dirs) {
  /* 射线从 (px,py,2) 朝 -z；先求入射点（用并集的 ta） */
  const P0 = [px, py, 2], T = [0, 0, -1];
  let ain = 1e9;
  for (let k = 0; k < g.nPieces; k++) {
    const q = pieceAt(P0, T, k);
    if (q.ok && q.ta > 0 && q.ta < ain) ain = q.ta;
  }
  if (!isFinite(ain) || ain > 1e8) { continue; } // 没打中
  const Pin = [px, py, 2 - ain + 1e-4];
  const out = exitUnion(Pin, T);
  if (out.t <= 0) { bad++; console.log('  出射失败 @', px.toFixed(3), py.toFixed(3), 't=', out.t.toFixed(5)); }
}
console.log('② 入射后找不到出射的方向数：', bad, '/', dirs.length);

/* ③ 立方群对称：绕三轴各 90°、绕 (1,1,1) 120°，顶点集合不变 */
const rots = {
  'x90': (p) => [p[0], -p[2], p[1]],
  'y90': (p) => [p[2], p[1], -p[0]],
  'z90': (p) => [-p[1], p[0], p[2]],
  'd120': (p) => [p[2], p[0], p[1]],
};
const key = (p) => p.map((v) => Math.round(v * 1e4)).join(',');
const set = new Set();
for (let i = 0; i < g.pos.length; i += 3) set.add(key([g.pos[i], g.pos[i + 1], g.pos[i + 2]]));
for (const [n, f] of Object.entries(rots)) {
  let miss = 0;
  for (let i = 0; i < g.pos.length; i += 3) if (!set.has(key(f([g.pos[i], g.pos[i + 1], g.pos[i + 2]])))) miss++;
  console.log('③', n, '不在集合里的顶点', miss);
}

/* ④ 支尖的最远点（归一化坐标）—— 确认支尖没有被切掉 */
let far = 0;
for (let i = 0; i < g.pos.length; i += 3) far = Math.max(far, Math.hypot(g.pos[i], g.pos[i + 1], g.pos[i + 2]));
console.log('④ 支尖最远点 r =', far.toFixed(4), '（目标 1.0）');