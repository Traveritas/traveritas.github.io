import { starPath, knotPath, diamondPath } from "./star.js";
import { deviation } from "./measure.js";
// shoulder = waist/(arm+waist) 应当退化成纯菱形
for (const [arm, waist] of [[10,6.5],[7,4.6],[50,50]]) {
  const s = waist/(arm+waist);
  console.log(`${arm}/${waist} shoulder=${s.toFixed(4)} vs diamondPath:`, deviation(starPath({arm,waist,pinch:0,shoulder:s}), diamondPath({arm,waist})).d.toFixed(6));
}
console.log("knot vs starPath shoulder=4.6/11.6:", deviation(knotPath(7), starPath({arm:7,waist:4.6,pinch:0,shoulder:4.6/11.6})).d.toFixed(6));
console.log("knotPath(7) =", knotPath(7));
console.log("star lock d =", starPath({arm:7,waist:4.6,pinch:0,shoulder:0.39655}));
