import { starPath, PRESETS } from "./star.js";
import { deviation } from "./measure.js";
console.log("equal 0 vs 45 :", deviation(starPath(PRESETS.equal), starPath({...PRESETS.equal, rotate:45})).d.toFixed(4));
console.log("spire 0 vs 45 :", deviation(starPath(PRESETS.spire), starPath({...PRESETS.spire, rotate:45})).d.toFixed(4));
