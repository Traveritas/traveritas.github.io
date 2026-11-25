const g = require(__dirname + '/.shots/geo.json');
const s = g.curve.samples;
let runs = [], cur = null;
for (const r of s) {
  if (r.score < 70) { if (!cur) cur = { a: r.u, b: r.u, min: r.score }; else { cur.b = r.u; cur.min = Math.min(cur.min, r.score); } }
  else if (cur) { runs.push(cur); cur = null; }
}
if (cur) runs.push(cur);
console.log('u<70 ranges:', runs.map((r) => r.a.toFixed(2) + '..' + r.b.toFixed(2) + '(min ' + r.min + ')').join('  '));
const out = [];
for (let i = 0; i <= 20; i++) {
  const u = i / 20;
  const r = s.reduce((a, b) => (Math.abs(b.u - u) < Math.abs(a.u - u) ? b : a));
  out.push(u.toFixed(2) + ':' + r.score);
}
console.log(out.join(' '));
for (const k of ['even12', 'greedy12', 'even16', 'greedy16', 'even24', 'greedy24'])
  console.log(k, 'us', g.sets[k].us.map((v) => v.toFixed(3)).join(','));
for (const k of ['even12', 'greedy12', 'even16', 'greedy16', 'even24', 'greedy24'])
  console.log(k, 'sc', g.sets[k].scores.join(','));