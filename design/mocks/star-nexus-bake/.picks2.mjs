/* 选格的最后一版：DP，最大化「所选姿态的最低分」，相邻间距限制在一个带里。
   间距下界防止「几格挤在同一个角度」（画面没变，白付字节）；
   上界防止「一跳三格」（读成瞬移）。 */
import fs from 'node:fs';
const g = JSON.parse(fs.readFileSync(new URL('./.shots/geo.json', import.meta.url), 'utf8'));
const samples = g.curve.samples;
const n = samples.length;
const step = 1 / (n - 1);

function dpPicks(k, loF, hiF) {
  const gmin = Math.max(1, Math.round((loF / (k - 1)) / step));
  const gmax = Math.max(gmin, Math.round((hiF / (k - 1)) / step));
  const best = Array.from({ length: k }, () => new Float64Array(n).fill(-1));
  const from = Array.from({ length: k }, () => new Int16Array(n).fill(-1));
  best[0][0] = 1e9;
  for (let j = 1; j < k; j++)
    for (let i = 0; i < n; i++) {
      let bv = -1, bf = -1;
      for (let d = gmin; d <= gmax; d++) {
        const p = i - d;
        if (p < 0) break;
        const pv = best[j - 1][p];
        if (pv < 0) continue;
        const v = Math.min(pv, samples[i].score);
        if (v > bv) { bv = v; bf = p; }
      }
      best[j][i] = bv; from[j][i] = bf;
    }
  const end = n - 1;
  if (best[k - 1][end] < 0) return null;
  const idx = [];
  let i = end;
  for (let j = k - 1; j >= 0; j--) { idx.push(i); i = from[j][i]; if (j === 0) break; }
  idx.reverse();
  return idx.map((i) => samples[i].u);
}
const report = (k, us, tag) => {
  if (!us) { console.log(tag, 'k=' + k, '无解'); return; }
  const sc = us.map((u) => samples[Math.round(u * (n - 1))].score);
  const gaps = us.slice(1).map((u, i) => +(u - us[i]).toFixed(3));
  console.log(tag.padEnd(18), 'k=' + k, 'min=' + Math.min(...sc), 'ugly=' + sc.filter((s) => s < 55).length,
    'maxgap=' + Math.max(...gaps), 'sc=' + sc.join(','));
};
for (const k of [12, 16, 24])
  for (const [lo, hi] of [[0.45, 2.2], [0.4, 3.0], [0.35, 4.0], [0.3, 5.0]]) report(k, dpPicks(k, lo, hi), `dp[${lo},${hi}]`);