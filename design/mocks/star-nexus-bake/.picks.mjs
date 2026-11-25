/* 选格的几种算法对比：均匀 / 半格贪心 / 最大化最小分（DP，带间距约束） */
import fs from 'node:fs';
const g = JSON.parse(fs.readFileSync(new URL('./.shots/geo.json', import.meta.url), 'utf8'));
const samples = g.curve.samples; // u,score (301)
const n = samples.length;
const scoreAt = (i) => samples[i].score;

function evenPicks(k) {
  return Array.from({ length: k }, (_, i) => i / (k - 1));
}

/* 参考：原贪心（每格在自己的半格里滑） */
function slideGreedy(k) {
  const slide = 0.5 / (k - 1);
  const out = evenPicks(k).map((u0) => {
    let best = u0, bestS = -1e9;
    for (const r of samples) {
      if (r.u < u0 - slide || r.u > u0 + slide) continue;
      const s = r.score - Math.abs(r.u - u0) * 0.5;
      if (s > bestS) { bestS = s; best = r.u; }
    }
    return best;
  });
  out[0] = 0; out[k - 1] = 1;
  return out;
}

/* DP：恰好 k 个节点，首 0 尾 1，相邻间距 ∈ [gmin, gmax]（以 1/(k-1) 为单位），
   目标：最大化「最小节点分」，同分时偏好间距更均匀（次级目标：间距平方和最小）。 */
function dpPicks(k, gminF, gmaxF) {
  const step = 1 / (n - 1);
  const gmin = Math.max(1, Math.round((gminF / (k - 1)) / step));
  const gmax = Math.max(gmin, Math.round((gmaxF / (k - 1)) / step));
  const NEG = -1;
  // best[j][i] = 用 j+1 个节点、末节点在 i 时可达的最大最小分
  const best = Array.from({ length: k }, () => new Int16Array(n).fill(NEG));
  const from = Array.from({ length: k }, () => new Int16Array(n).fill(-1));
  for (let i = 0; i <= gmax; i++) best[0][i] = Infinity; // 起点之后的间距由后续约束
  best[0][0] = 1e9;
  for (let j = 1; j < k; j++) {
    for (let i = 0; i < n; i++) {
      let bv = NEG, bf = -1;
      for (let d = gmin; d <= gmax; d++) {
        const p = i - d;
        if (p < 0) break;
        const pv = best[j - 1][p];
        if (pv <= NEG) continue;
        const v = Math.min(pv, scoreAt(i));
        if (v > bv) { bv = v; bf = p; }
      }
      best[j][i] = bv; from[j][i] = bf;
    }
  }
  // 末节点必须正好是 1（i = n-1）
  const end = n - 1;
  if (best[k - 1][end] <= NEG) return null;
  const us = [];
  let i = end;
  for (let j = k - 1; j >= 0; j--) { us.push(samples[i].u); i = from[j][i]; if (j === 0) break; }
  us.reverse();
  return us;
}

const near = (u) => samples.reduce((a, b) => (Math.abs(b.u - u) < Math.abs(a.u - u) ? b : a));
const report = (k, us, tag) => {
  const sc = us.map((u) => near(u).score);
  const gaps = us.slice(1).map((u, i) => +(u - us[i]).toFixed(4));
  console.log(
    tag.padEnd(22),
    'k=' + k,
    'min=' + Math.min(...sc),
    'ugly=' + sc.filter((s) => s < 55).length,
    'gaps=' + gaps.join(' '),
  );
  console.log(' '.repeat(22), 'scores=' + sc.join(','));
  return sc;
};

for (const k of [12, 16, 24]) {
  report(k, evenPicks(k), 'even');
  report(k, slideGreedy(k), 'slide-greedy');
  for (const [g0, g1] of [[0.7, 1.8], [0.6, 1.8], [0.5, 2.0], [0.55, 2.2]]) {
    const us = dpPicks(k, g0, g1);
    if (!us) { console.log('  dp', k, g0, g1, '无解'); continue; }
    report(k, us, `dp[${g0},${g1}]`);
  }
}