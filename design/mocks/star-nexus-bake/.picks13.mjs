import fs from 'node:fs';
const ROOT='file:///D:/Documents/HTA/My%20Projects/personal-website/design/mocks/star-nexus-bake/';
const m=await import(ROOT+'bake.mjs');
const g=JSON.parse(fs.readFileSync(new URL('./.shots/geo.json',import.meta.url),'utf8'));
const P=m.BAKE.shape; const samples=g.curve.samples; const N=samples.length;
const sc=samples.map(r=>r.score); const US=samples.map(r=>r.u);
const SIZE=48, MI=SIZE*SIZE;
const MASKS=US.map(u=>m.__mask(P,u,SIZE));
const cache=new Map();
function iou(i,j){const k=i*1000+j;let v=cache.get(k);if(v!==undefined)return v;
 const a=MASKS[i],b=MASKS[j];let it=0,un=0;for(let t=0;t<MI;t++){if(a[t]&&b[t])it++;if(a[t]||b[t])un++;}
 v=un?it/un:1;cache.set(k,v);return v;}
function dp(k,hi,lo,gapMax,gapMin){
 const gmin=Math.max(1,Math.round(gapMin*300)), gmax=Math.round(gapMax*300);
 const best=Array.from({length:k},()=>new Float64Array(N).fill(-1));
 const from=Array.from({length:k},()=>new Int16Array(N).fill(-1));
 best[0][0]=1e9;
 for(let j=1;j<k;j++) for(let i=0;i<N;i++){
   if(sc[i]<50)continue; let bv=-1,bf=-1;
   for(let d=gmin;d<=gmax;d++){const p=i-d;if(p<0)break;
     const pv=best[j-1][p];if(pv<0)continue;
     const q=iou(p,i); if(q>hi||q<lo)continue;
     const v=Math.min(pv,sc[i]); if(v>bv){bv=v;bf=p;}}
   best[j][i]=bv;from[j][i]=bf;}
 if(best[k-1][N-1]<0)return null;
 const idx=[];let i=N-1;
 for(let j=k-1;j>=0;j--){idx.push(i);i=from[j][i];if(j===0)break;}
 return idx.reverse();}
const rows=[];
for(const k of [16])
for(let hi=0.90;hi<=0.98;hi+=0.01)
for(let lo=0.70;lo<=0.86;lo+=0.02)
for(const gapMax of [0.4,0.6,0.9]){
 const idx=dp(k,+hi.toFixed(2),+lo.toFixed(2),gapMax,0.003);
 if(!idx)continue;
 const s2=idx.map(i=>sc[i]);const io=idx.slice(1).map((j,t)=>iou(idx[t],j));
 rows.push({k,hi:+hi.toFixed(2),lo:+lo.toFixed(2),gapMax,min:Math.min(...s2),ugly:s2.filter(v=>v<55).length,
  ioMin:Math.min(...io),ioMax:Math.max(...io),us:idx.map(i=>US[i]),sc:s2});}
rows.sort((a,b)=>b.min-a.min||a.ioMax-b.ioMax);
console.log('候选',rows.length);
for(const r of rows.slice(0,6)){
 console.log('iou['+r.lo.toFixed(2)+','+r.hi.toFixed(2)+'] gapMax='+r.gapMax+' min='+r.min+' ugly='+r.ugly+' io='+r.ioMin.toFixed(3)+'..'+r.ioMax.toFixed(3));
 console.log('   us=['+r.us.map(v=>v.toFixed(3)).join(', ')+']');
 console.log('   sc=['+r.sc.join(', ')+']');}
