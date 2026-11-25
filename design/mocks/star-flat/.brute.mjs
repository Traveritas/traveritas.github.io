import { flatten, ORIGINALS } from "./measure.js";
import { starPath } from "./star.js";
function segDist(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1];const L=dx*dx+dy*dy;let t=L?((p[0]-a[0])*dx+(p[1]-a[1])*dy)/L:0;t=Math.max(0,Math.min(1,t));return Math.hypot(p[0]-(a[0]+t*dx),p[1]-(a[1]+t*dy));}
function brute(A,B){let max=0;for(const p of A){let best=Infinity;for(let k=0;k<B.length;k++){const d=segDist(p,B[k],B[(k+1)%B.length]);if(d<best)best=d;}if(best>max)max=best;}return max;}
for (const o of ORIGINALS){
  const A=flatten(o.d), B=flatten(starPath(o.fit));
  const v=Math.max(brute(A,B),brute(B,A));
  console.log(o.key, "brute", v.toFixed(6), "u");
}
