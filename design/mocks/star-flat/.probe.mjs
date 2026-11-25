import { starPath, PRESETS } from "./star.js";
import { deviation, flatten } from "./.lib.mjs";
const O = {
  cursor: { d: "M0,-10C0.5,-3 2,-0.9 6.5,0C2,0.9 0.5,3 0,10C-0.5,3 -2,0.9 -6.5,0C-2,-0.9 -0.5,-3 0,-10Z", arm: 10, waist: 6.5 },
  boot: { d: "M0,-10C0.7,-2.6 2.6,-0.7 10,0C2.6,0.7 0.7,2.6 0,10C-0.7,2.6 -2.6,0.7 -10,0C-2.6,-0.7 -0.7,-2.6 0,-10Z", arm: 10, waist: 10 },
  ave: { d: "M0,-50L11,-11L50,0L11,11L0,50L-11,11L-50,0L-11,-11Z", arm: 50, waist: 50 },
};
for (const [s,t] of [[0.214,0.024],[0.246,0.03],[0.232,0],[0.232,-0.002]]) {
  const r = Object.entries(O).map(([k,o]) => `${k} ${(deviation(o.d, starPath({arm:o.arm,waist:o.waist,pinch:1,shoulder:s,turn:t})).d/o.arm*100).toFixed(2)}%`);
  console.log(`shoulder=${s} turn=${t}: ` + r.join(" · "));
}
// should spire reproduce cursor near-exactly with turn? check pinch sensitivity
console.log("--- pinch sweep on cursor with its best shoulder/turn ---");
for (const p of [0.6,0.8,0.9,1]) console.log("pinch", p, (deviation(O.cursor.d, starPath({arm:10,waist:6.5,pinch:p,shoulder:0.214,turn:0.024})).d/10*100).toFixed(3)+"%");
