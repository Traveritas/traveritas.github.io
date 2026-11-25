import { starPath, PRESETS } from "./star.js";
import { deviation } from "./measure.js";
const eq = (o) => starPath({arm:10, waist:10, pinch:1, ...o});
for (const turn of [0, 0.03]) {
  const base = eq({turn});
  console.log(`turn=${turn}: self-90deg dev = ${deviation(base, starPath({arm:10,waist:10,pinch:1,turn,rotate:90})).d.toFixed(4)}`);
  console.log(`          self-mirror(x) dev = ${deviation(base, starPath({arm:10,waist:10,pinch:1,turn,rotate:180})).d.toFixed(4)}`);
}
// spire: 180° should match
console.log("spire 180deg:", deviation(starPath(PRESETS.spire), starPath({...PRESETS.spire, rotate:180})).d.toFixed(4));
console.log("spire 90deg :", deviation(starPath(PRESETS.spire), starPath({...PRESETS.spire, rotate:90})).d.toFixed(4));
console.log("equal 90deg :", deviation(starPath(PRESETS.equal), starPath({...PRESETS.equal, rotate:90})).d.toFixed(4));
