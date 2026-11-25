/* 光向终选：在真实评估器上扫（spine / notch / 相邻明暗序 / 调子档数） */
import { star } from './src.js';
const nrm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
const dirOf = (az, el) => nrm([Math.cos(el * Math.PI / 180) * Math.cos(az * Math.PI / 180), Math.sin(el * Math.PI / 180), Math.cos(el * Math.PI / 180) * Math.sin(az * Math.PI / 180)]);

for (const sides of [4, 6, 8]) {
  const rows = [];
  for (let az = 0; az < 360; az += 10) {
    for (let el = -40; el <= 80; el += 10) {
      const L = dirOf(az, el);
      const r = star({ fold: 1.2, sides, rim: sides > 4 ? 0.16 : 0, light: L });
      const smin = Math.min(...r.stats.spine);
      const nmin = Math.min(...r.stats.notch);
      const sminN = r.stats.spine.filter((x) => x < 0.3).length; // 没有折的支数
      const score = smin * 1.4 + nmin * 1.0 + (6 - r.stats.sameOrder) * 0.04 + Math.min(6, r.stats.tones.length) * 0.04;
      rows.push({ az, el, L, smin, nmin, same: r.stats.sameOrder, dead: sminN, tones: r.stats.tones.length, score });
    }
  }
  rows.sort((a, b) => b.score - a.score);
  console.log(`\n=== ${sides} 边截面 · 前 6 ===`);
  for (const x of rows.slice(0, 6)) {
    console.log(`  az ${String(x.az).padStart(3)} el ${String(x.el).padStart(3)} spineMin ${x.smin.toFixed(2)} notchMin ${x.nmin.toFixed(2)} 无折支 ${x.dead} same ${x.same} 档 ${x.tones} 得分 ${x.score.toFixed(3)}`);
  }
}