/* 验证三条结论（notes.md 要能复核）：
   1. 8 个体对角视线的剪影是不是同一张图（若相同，「跳格换面」就是无效运动）
   2. 绕视轴滚 30°/60° 的剪影有没有变（若变了但分数仍是 100，说明滚是合法的换面）
   3. 整圈自转在好姿态带里到底能停几格 */
import { buildStar, rasterizeM, measureMask, scoreOf, mul3, rotAxis, viewMatrix, maskIoU } from './posecore.mjs';

const mesh = buildStar();
const read = (m, size = 144) => {
  const { mask } = rasterizeM(mesh, m, { size });
  return { mask, res: measureMask(mesh, mask, size, 0, 0, { matrix: m }) };
};
const ISO = viewMatrix(45, 35.264);
const base = read(ISO);

/* 1. 八个对角视 */
console.log('== 八个体对角视线的剪影互相比 ==');
const DIAG = [];
for (const sx of [1, -1]) for (const sy of [1, -1]) for (const sz of [1, -1]) {
  const d = [sx / Math.sqrt(3), sy / Math.sqrt(3), sz / Math.sqrt(3)];
  const pitch = (Math.asin(d[1]) * 180) / Math.PI;
  let yaw = (Math.atan2(-d[0], -d[2]) * 180) / Math.PI;
  if (yaw < 0) yaw += 360;
  DIAG.push({ dir: `${sx}${sy}${sz}`, yaw: +yaw.toFixed(2), pitch: +pitch.toFixed(2), m: viewMatrix(yaw, pitch) });
}
const diagMasks = DIAG.map((d) => read(d.m));
let minP = 1, maxP = 0;
for (let i = 0; i < diagMasks.length; i++) {
  for (let j = i + 1; j < diagMasks.length; j++) {
    const v = maskIoU(diagMasks[i].mask, diagMasks[j].mask);
    minP = Math.min(minP, v); maxP = Math.max(maxP, v);
  }
}
console.log(`  两两 IoU：${minP.toFixed(4)} … ${maxP.toFixed(4)}（${diagMasks.length} 个姿态，28 对）`);
console.log(`  分数：${diagMasks.map((d) => scoreOf(d.res)).join(' ')}`);
console.log(`  → ${minP > 0.99 ? '完全相同，跳格换面看不出任何变化' : '有差异'}`);

/* 2. 绕视轴滚 */
console.log('\n== 绕视轴（看的方向不变）滚 ==');
for (const deg of [0, 15, 30, 45, 60, 90]) {
  const m = mul3(rotAxis([0, 0, 1], deg), ISO);
  const r = read(m);
  console.log(`  ${String(deg).padStart(3)}°  与 0° 的 IoU ${maskIoU(base.mask, r.mask).toFixed(4)}  分数 ${scoreOf(r.res)}  bal ${r.res.balance.toFixed(3)}`);
}
console.log('  → 剪影在平面内转了（IoU 低），但仍是正六芒星（分数不变）＝ 合法的换面');

/* 3. 整圈自转能停几格 */
console.log('\n== 绕体轴整圈：每 5° 一格的分数 ==');
for (const [name, axis] of [['体 x', [1, 0, 0]], ['体 y', [0, 1, 0]]]) {
  const rows = [];
  for (let t = 0; t < 360; t += 5) {
    const r = read(mul3(ISO, rotAxis(axis, t)), 96);
    rows.push({ t, s: scoreOf(r.res) });
  }
  const ok = rows.filter((r) => r.s >= 70);
  console.log(`  ${name}: ${rows.length} 个候选里 ${ok.length} 个 ≥70 → 角度 ${ok.map((r) => r.t).join(',')}`);
}
console.log('  → 90° 是这颗星的对称操作，所以「90° 一步」的整圈 = 一直停在同一个画面上');
console.log('    而任何「看得出变化」的步长，都必须离开好姿态带');

/* 4. 摆动带里最差的一格 */
console.log('\n== 摆动 ±18° 内逐度的分数 ==');
const osc = [];
for (let t = -18; t <= 18; t += 3) {
  const r = read(mul3(ISO, rotAxis([0, 1, 0], t)), 96);
  osc.push({ t, s: scoreOf(r.res) });
}
console.log('  ' + osc.map((o) => `${o.t}°:${o.s}`).join('  '));
console.log(`  最低 ${Math.min(...osc.map((o) => o.s))}`);