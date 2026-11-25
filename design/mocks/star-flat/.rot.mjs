import { starPath, PRESETS } from "./star.js";
import { flatten } from "./measure.js";
const d0 = starPath(PRESETS.spire);
const d45 = starPath({...PRESETS.spire, rotate: 45});
console.log("d0 :", d0);
console.log("d45:", d45);
// 半径随角度的分布：应当只差一个 45° 相位
const f = (d) => { const pts = flatten(d, 64);
  const out = [];
  for (let a = 0; a < 360; a += 15) {
    const r = (a*Math.PI)/180;
    let best = 0;
    for (const p of pts) { const ang = Math.atan2(p[1], p[0]); let dd = Math.abs(((ang - r + Math.PI*3) % (Math.PI*2)) - Math.PI); if (dd < 0.06) best = Math.max(best, Math.hypot(p[0],p[1])); }
    out.push(best.toFixed(2));
  } return out; };
console.log("r(0deg star):", f(d0).join(" "));
console.log("r(45deg star):", f(d45).join(" "));
