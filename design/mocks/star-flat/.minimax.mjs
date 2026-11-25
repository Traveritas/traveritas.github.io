import { starPath } from "./star.js";
import { deviation } from "./.lib.mjs";
const O = {
  cursor: { d: "M0,-10C0.5,-3 2,-0.9 6.5,0C2,0.9 0.5,3 0,10C-0.5,3 -2,0.9 -6.5,0C-2,-0.9 -0.5,-3 0,-10Z", arm: 10, waist: 6.5 },
  boot: { d: "M0,-10C0.7,-2.6 2.6,-0.7 10,0C2.6,0.7 0.7,2.6 0,10C-0.7,2.6 -2.6,0.7 -10,0C-2.6,-0.7 -0.7,-2.6 0,-10Z", arm: 10, waist: 10 },
};
let best = { s:0, t:0, w:9e9 };
for (let s = 0.20; s <= 0.28; s += 0.001)
  for (let t = -0.01; t <= 0.05; t += 0.002) {
    let w = 0;
    for (const k of ["cursor","boot"]) { const o=O[k]; w = Math.max(w, deviation(o.d, starPath({arm:o.arm,waist:o.waist,pinch:1,shoulder:s,turn:t})).d / o.arm * 100); }
    if (w < best.w) best = { s:+s.toFixed(3), t:+t.toFixed(3), w };
  }
console.log("minimax(cursor,boot):", best);
for (const k of ["cursor","boot"]) { const o=O[k];
  console.log("  ", k, (deviation(o.d, starPath({arm:o.arm,waist:o.waist,pinch:1,shoulder:best.s,turn:best.t})).d/o.arm*100).toFixed(3)+"%"); }
