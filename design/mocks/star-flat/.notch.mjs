import { starPath, PRESETS } from "./star.js";
// 45° 腰点到「相邻两尖端连线」的垂距（path 单位），这是「星 vs 十字」的关键量
function notch(A, W, s) {
  // 弦: (0,-A) -> (W,0); 点: (s,-s)
  const ax=0, ay=-A, bx=W, by=0, px=s, py=-s;
  const dx=bx-ax, dy=by-ay;
  return Math.abs(dx*(ay-py)-dy*(ax-px))/Math.hypot(dx,dy);
}
for (const name of ["spire","equal","facet","tick"]) {
  const p = PRESETS[name];
  const s = p.shoulder * p.arm;
  console.log(name.padEnd(6), "notch", notch(p.arm,p.waist,s).toFixed(4), "u  =", (notch(p.arm,p.waist,s)/p.arm*100).toFixed(2)+"% arm");
}
// 各尺寸下 notch 的像素值（用 arm 做主尺度, 显示高度 = 2*arm）
for (const h of [8,12,16,24,32,48,96,160]) {
  const A = h/2, W = A*0.65, s = 0.214*A;
  console.log(`h=${h}px  spire notch = ${notch(A,W,s).toFixed(2)}px   equal notch = ${notch(A,A,0.246*A).toFixed(2)}px`);
}
