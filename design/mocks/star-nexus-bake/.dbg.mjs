import fs from 'node:fs';
const g = JSON.parse(fs.readFileSync(new URL('./.shots/geo.json', import.meta.url), 'utf8'));
const s = g.curve.samples;
const ROOT = 'file:///D:/Documents/HTA/My%20Projects/personal-website/design/mocks/star-final/src.js';
const SF = await import(ROOT);
for (const u of [0, 0.033, 0.05, 0.067, 0.1, 0.133, 0.167, 0.2, 0.25, 0.33, 0.5]) {
  const M = SF.poseAt(u, SF.M_REST, SF.TUMBLE);
  const radii = SF.frames(M).map((f) => +f.Lxy.toFixed(3));
  const r = s.reduce((a, b) => (Math.abs(b.u - u) < Math.abs(a.u - u) ? b : a));
  const ang = SF.axisAngles(u, SF.TUMBLE).map((v) => +v.toFixed(1));
  console.log('u=' + u.toFixed(3), 'score=' + r.score, 'axisdeg=' + ang.join('/'), 'radii=' + radii.join(','));
}