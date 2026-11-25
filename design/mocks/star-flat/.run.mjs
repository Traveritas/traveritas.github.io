import { starPath, knotPath, diamondPath, PRESETS } from "./star.js";
import { wall, deviation } from "./measure.js";
for (const r of wall(200)) console.log(r.label.padEnd(16), r.dev.toFixed(5).padStart(9)+" u", (r.devPctArm.toFixed(3)+"%").padStart(8), (r.devPx.toFixed(3)+"px").padStart(9), "worst@"+r.from);
console.log("ave gen d:", starPath(PRESETS.facet));
console.log("lock:", starPath(PRESETS.lock), "| knot:", knotPath(7), "| dev:", deviation(starPath(PRESETS.lock), knotPath(7)).d.toFixed(6));
console.log("minor:", starPath({...PRESETS.spire, minor:1, minorScale:0.5}));
console.log("diamond:", diamondPath({arm:7,waist:4.6}));
