/* 中心交叠的几何账：半径 R 以内，六支各自覆盖了多少、叠了几层 */
import { frames, M_REST, stationAt, syncOpts, halfW } from "./src.js";
const cfg = syncOpts({ curve: 0, tail: 0 });
const inPoly = (poly, x, y) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
const polys = frames(M_REST).map((fr) => {
  const P = [];
  for (let i = 0; i <= 40; i++) { const st = stationAt(i/40, cfg); P.push([fr.a[0]*st.s - fr.side[0]*st.W, fr.a[1]*st.s - fr.side[1]*st.W]); }
  for (let i = 40; i >= 0; i--) { const st = stationAt(i/40, cfg); P.push([fr.a[0]*st.s + fr.side[0]*st.W, fr.a[1]*st.s + fr.side[1]*st.W]); }
  return P;
});
for (const R of [1.7, 2.5, 3, 4, 5, 6.4]) {
  let n=0, c0=0, c1=0, c2=0, c3=0;
  for (let x=-R; x<=R; x+=0.06) for (let y=-R; y<=R; y+=0.06) {
    if (x*x+y*y > R*R) continue;
    n++;
    let k=0; for (const p of polys) if (inPoly(p,x,y)) k++;
    if (k===0) c0++; else if (k===1) c1++; else if (k===2) c2++; else c3++;
  }
  console.log(`R=${R}  露底 ${(c0/n*100).toFixed(1)}%  一层 ${(c1/n*100).toFixed(1)}%  两层 ${(c2/n*100).toFixed(1)}%  三层+ ${(c3/n*100).toFixed(1)}%`);
}
console.log("\n半宽在根/中/尖：", [0,0.25,0.5,0.75].map(t=>halfW(t,cfg).toFixed(2)).join(" / "));
