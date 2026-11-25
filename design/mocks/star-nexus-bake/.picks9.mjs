import fs from 'node:fs';
const ROOT='file:///D:/Documents/HTA/My%20Projects/personal-website/design/mocks/star-nexus-bake/';
const m=await import(ROOT+'bake.mjs');
const g=JSON.parse(fs.readFileSync(new URL('./.shots/geo.json',import.meta.url),'utf8'));
const P=m.BAKE.shape; const samples=g.curve.samples; const N=samples.length;
const sc=samples.map(r=>r.score); const US=samples.map(r=>r.u);
const SIZE=48, MI=SIZE*SIZE;
const MASKS=US.map(u=>m.__mask(P,u,SIZE));
const cache=new Map();
function iou(i,j){ const k=i*1000+j; let v=cache.get(k); if(v!==undefined)return v;
  const a=MASKS[i],b=MASKS[j]; let it=0,un=0;
  for(let t=0;t<MI;t++){if(a[t]&&b[t])it++;if(a[t]||b[t])un++;}
  v=un?it/un:1; cache.set(k,v); return v; }

function dp(k, iouMax, gapMax, gapMin=0.008){
  const gmin=Math.max(1,Math.round(gapMin*300)), gmax=Math.round(gapMax*300);
  const best=Array.from({length:k},()=>new Float64Array(N).fill(-1));
  const from=Array.from({length:k},()=>new Int16Array(N).fill(-1));
  best[0][0]=1e9;
  for(let j=1;j<k;j++) for(let i=0;i<N;i++){
    if(sc[i]<50) continue;
    let bv=-1,bf=-1;
    for(let d=gmin;d<=gmax;d++){ const p=i-d; if(p<0)break;
      const pv=best[j-1][p]; if(pv<0)continue;
      if(iou(p,i)>iouMax) continue;
      const v=Math.min(pv,sc[i]); if(v>bv){bv=v;bf=p;} }
    best[j][i]=bv; from[j][i]=bf; }
  if(best[k-1][N-1]<0) return null;
  const idx=[]; let i=N-1;
  for(let j=k-1;j>=0;j--){ idx.push(i); i=from[j][i]; if(j===0)break; }
  return idx.reverse();
}
for(const k of [12,16,24]) for(const iouMax of [0.92,0.95]) for(const gapMax of [0.30,0.45,0.6]){
  const idx=dp(k,iouMax,gapMax);
  if(!idx){console.log('k='+k,'iouMax='+iouMax,'gapMax='+gapMax,'无解');continue;}
  const s2=idx.map(i=>sc[i]); const us=idx.map(i=>US[i]);
  const io=idx.slice(1).map((j,t)=>iou(idx[t],j));
  console.log('k='+k,'iouMax='+iouMax,'gapMax='+gapMax,'min='+Math.min(...s2),'ugly='+s2.filter(v=>v<55).length,
    'iou='+Math.min(...io).toFixed(3)+'..'+Math.max(...io).toFixed(3));
  console.log('   us=['+us.map(v=>v.toFixed(3)).join(', ')+']');
  console.log('   sc=['+s2.join(', ')+']');
}
