export function flatten(d, seg = 96) {
  const toks = d.match(/[MLCQZmlcqz]|-?\d*\.?\d+(?:e-?\d+)?/g) || [];
  const pts = []; let i = 0, cur = [0,0], start = [0,0];
  const num = () => parseFloat(toks[i++]);
  const P = () => { const p=[num(),num()]; return p; };
  while (i < toks.length) {
    const t = toks[i++];
    if (t==="M"||t==="m") { cur=P(); start=cur; pts.push(cur); }
    else if (t==="L"||t==="l") { cur=P(); pts.push(cur); }
    else if (t==="C"||t==="c") { const c1=P(),c2=P(),e=P();
      for (let k=1;k<=seg;k++){const u=k/seg,v=1-u;pts.push([v*v*v*cur[0]+3*v*v*u*c1[0]+3*v*u*u*c2[0]+u*u*u*e[0], v*v*v*cur[1]+3*v*v*u*c1[1]+3*v*u*u*c2[1]+u*u*u*e[1]]);} cur=e; }
    else if (t==="Q"||t==="q") { const c1=P(),e=P();
      for (let k=1;k<=seg;k++){const u=k/seg,v=1-u;pts.push([v*v*cur[0]+2*v*u*c1[0]+u*u*e[0], v*v*cur[1]+2*v*u*c1[1]+u*u*e[1]]);} cur=e; }
    else if (t==="Z"||t==="z") { pts.push(start); cur=start; }
  }
  return pts;
}
function segDist(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1];const L=dx*dx+dy*dy;let t=L?((p[0]-a[0])*dx+(p[1]-a[1])*dy)/L:0;t=Math.max(0,Math.min(1,t));return Math.hypot(p[0]-(a[0]+t*dx),p[1]-(a[1]+t*dy));}
function oneWay(A,B){let max=0;for(const p of A){let best=Infinity;for(let k=0;k<B.length;k++){const d=segDist(p,B[k],B[(k+1)%B.length]);if(d<best)best=d;}if(best>max)max=best;}return max;}
export function deviation(dA,dB){const A=flatten(dA),B=flatten(dB);return {d:Math.max(oneWay(A,B),oneWay(B,A))};}
