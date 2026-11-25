/* 形状账（第四轮 · 离线）
   node design/mocks/star-v2/shape-audit.mjs            → 四列 + theta 扫描
   node design/mocks/star-v2/shape-audit.mjs --json      → 一行 JSON

   算法全在 shape-stats.mjs 里，与 `?set=shape` 那个页面 import 的是同一个模块 ——
   页面上的数与这里打印的数是同一份代码算的，不存在「两套数」。

   BRIEF-4 要的冷数字（每列）：面数 / 每支面数、六个尖各自到原点的距离与截面面积、
   正位剪影的内角半径 / 尖半径、与 A 列剪影的像素差百分比。
   另加两件「棱少了没有」绕不开的：锐棱数、立方对称破缺。
*/
import { readings } from './shape-stats.mjs';

const R = readings();
const J = process.argv.includes('--json');

if (J) {
  const out = {
    areaA: R.areaA,
    sweep: R.sweep,
    columns: R.columns.map((c) => {
      const { _blocks, _view, _mask, ...rest } = c;
      return rest;
    }),
  };
  console.log(JSON.stringify(out));
} else {
  const pad = (v, n) => String(v).padStart(n);

  console.log('截面积基准 AREA_A =', R.areaA, '· 判据：第二行（纯剪影）');
  console.log('');
  console.log('theta 扫描 —— 规则：锐棱数最少 且 六尖偏差 ≤ 2%');
  console.log('  theta  独立法向  锐棱  可见面  六尖 r        尖偏差   凹口/尖  六重破缺  可用');
  for (const s of R.sweep) {
    console.log(
      '  ' + pad(s.theta + '°', 5),
      pad(s.distinctDirs + (s.degenerate ? '(退化)' : ''), 8),
      pad(s.visibleRidges, 5),
      pad(s.visibleFaces, 7),
      pad(`${s.tipMin}–${s.tipMax}`, 13),
      pad(s.tipDeviationPct + '%', 8),
      pad(s.notchOverTip, 8),
      pad(s.sixFoldDev, 9),
      ' ' + (s.pass ? '✓' : '✗'),
    );
  }
  const okOnes = R.sweep.filter((s) => s.pass);
  const best = okOnes.reduce((a, b) => (b.visibleRidges < a.visibleRidges ? b : a), okOnes[0]);
  console.log(`  → 选中 theta = ${best.theta}°（锐棱 ${best.visibleRidges} 条）`);
  console.log('');

  console.log('四列');
  console.log(
    '  列    面数 /支  锐棱  可见面  六尖 r          截面面积(轴 x/y/z)            凹口/尖  六重破缺  与A差%  立方破缺 x/y/z',
  );
  for (const c of R.columns) {
    console.log(
      '  ' + c.id.padEnd(5),
      pad(c.faces, 4),
      pad(c.facesPerArm, 4),
      pad(c.visibleRidges, 5),
      pad(c.visibleFaces, 7),
      pad(`${c.tipMin}–${c.tipMax}`, 14),
      pad(c.armSectionArea.join(' / '), 30),
      pad(c.notchOverTip, 8),
      pad(c.sixFoldDev, 9),
      pad(c.diffVsA, 7),
      ` ${c.cubic.x}/${c.cubic.y}/${c.cubic.z}`,
    );
  }
  console.log('');
  console.log('六尖（各自到原点距离 / 每个尖的面形态）');
  for (const c of R.columns) {
    const kinds = c.tipShape.per.map((p) => `${p.faces}面(${p.gaps.join('/')}°)`);
    console.log(
      '  ' + c.id.padEnd(4),
      'r =', c.tips.join(','),
      '· 尖形态种数', c.tipShape.kinds,
      '· 每尖', kinds[0],
    );
  }
  console.log('');
  console.log('六尖在视空间的投影（角度 / 径向 / 深度）');
  for (const c of R.columns)
    console.log('  ' + c.id.padEnd(4), c.tipProj.map((p) => `${p.deg}°(ρ=${p.rho},z=${p.z})`).join(' '));
  console.log('');
  console.log('注：C·棱宽（C2）几何与 A 逐位相同 —— 它只把 uEdgeW 从 0.026 调到 0.05，');
  console.log('    所以六尖、截面、剪影、立方对称与 A 完全一致；变的只有棱带上那条高光的宽窄。');
}