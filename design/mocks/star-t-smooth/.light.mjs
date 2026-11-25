/* 光向搜索：在球面上扫，看哪一档光的「支内落差 / 交界落差 / 相反序」三项同时好 */
import { star, pose, LIGHT } from './src.js';

const nrm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
const H = (n, squ) => star({ fold: 1.2, sides: n, rim: n > 4 ? 0.14 : 0 });
const base = star({ fold: 1.2, sides: 4, light: LIGHT });

/* 先看现役光向的每支每片调子，确认结构 */
console.log('spikes (视空间 a, 屏幕方位角)');
for (const s of base.spikes) {
  console.log('  ', s.fr.key, 'z', s.fr.z.toFixed(3), 'ang', s.fr.ang.toFixed(1), 'cells', s.cells.length,
    'tones', s.cells.map((c) => c.tone).join(' '));
}
console.log('tones', base.stats.tones.join(' '), 'spine', base.stats.spine.join(' '),
  'notch', base.stats.notch.join(' '), 'same', base.stats.sameOrder);

/* 球面扫 */
const rows = [];
for (let az = 0; az < 360; az += 15) {
  for (let el = -60; el <= 75; el += 15) {
    const a = (az * Math.PI) / 180;
    const e = (el * Math.PI) / 180;
    const L = nrm([Math.cos(e) * Math.cos(a), Math.sin(e), Math.cos(e) * Math.sin(a)]);
    const r = star({ fold: 1.2, sides: 4, light: L });
    const spineMin = Math.min(...r.stats.spine);
    const spineAvg = r.stats.spine.reduce((x, y) => x + y, 0) / 6;
    const notchMin = Math.min(...r.stats.notch);
    const notchAvg = r.stats.notch.reduce((x, y) => x + y, 0) / 6;
    const distinct = r.stats.tones.length;
    // 判据：每支内部都要有落差（spineMin 不塌）、交界不要出现「同色接同色」（notchMin 不塌）、
    // 相邻序尽量相反（same 小）、调子档数尽量多
    const score = spineMin * 1.2 + notchMin * 1.0 + (6 - r.stats.sameOrder) * 0.05 + distinct * 0.05 + spineAvg * 0.3;
    rows.push({ az, el, L, spineMin, spineAvg, notchMin, notchAvg, same: r.stats.sameOrder, distinct, score });
  }
}
rows.sort((x, y) => y.score - x.score);
console.log('\n前 12 档光');
for (const x of rows.slice(0, 12)) {
  console.log(
    `  az ${String(x.az).padStart(3)} el ${String(x.el).padStart(3)}  spineMin ${x.spineMin.toFixed(2)} avg ${x.spineAvg.toFixed(2)}` +
      `  notchMin ${x.notchMin.toFixed(2)} avg ${x.notchAvg.toFixed(2)}  same ${x.same}  tones ${x.distinct}  ${x.score.toFixed(3)}`,
  );
}
console.log('\n末 4 档');
for (const x of rows.slice(-4)) {
  console.log(`  az ${x.az} el ${x.el}  spineMin ${x.spineMin.toFixed(2)} notchMin ${x.notchMin.toFixed(2)} same ${x.same}  ${x.score.toFixed(3)}`);
}