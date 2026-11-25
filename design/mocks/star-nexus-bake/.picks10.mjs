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

function dp(k,iouMax,gapMax,gapMin){
 const gmin=Math.max(1,Math.round(gapMin*300)), gmax=Math.round(gapMax*300);
 const best=Array.from({length:k},()=>new Float64Array(N).fill(-1));
 const from=Array.from({length:k},()=>new Int16Array(N).fill(-1));
 best[0][0]=1e9;
 for(let j=1;j<k;j++) for(let i=0;i<N;i++){
   if(sc[i]<50)continue; let bv=-1,bf=-1;
   for(let d=gmin;d<=gmax;d++){const p=i-d;if(p<0)break;
     const pv=best[j-1][p];if(pv<0)continue;
     if(iou(p,i)>iouMax)continue;
     const v=Math.min(pv,sc[i]);if(v>bv){bv=v;bf=p;}}
   best[j][i]=bv;from[j][i]=bf;}
 if(best[k-1][N-1]<0)return null;
 const idx=[];let i=N-1;
 for(let j=k-1;j>=0;j--){idx.push(i);i=from[j][i];if(j===0)break;}
 return idx.reverse();
}
const rows=[];
for(const k of [12,16,24])
for(let iouMax=0.93;iouMax<=0.99;iouMax+=0.01)
for(const gapMax of [0.45,0.6,0.8,1.0])
for(const gapMin of [0.001,0.004,0.01,0.02]){
 const idx=dp(k,+iouMax.toFixed(2),gapMax,gapMin);
 if(!idx)continue;
 const s2=idx.map(i=>sc[i]);const io=idx.slice(1).map((j,t)=>iou(idx[t],j));
 rows.push({k,iouMax:+iouMax.toFixed(2),gapMax,gapMin,min:Math.min(...s2),
   ugly:s2.filter(v=>v<55).length,ioMin:Math.min(...io),ioMax:Math.max(...io),
   us:idx.map(i=>US[i]),sc:s2});
}
console.log('候选',rows.length);
const byK={};
for(const r of rows){ (byK[r.k] ||= []).push(r); }
for(const k of [12,16,24]){
 const list=byK[k]||[];
 list.sort((a,b)=>b.min-a.min||a.ioMax-b.ioMax);
 console.log('===== k='+k+' 前四');
 for(const r of list.slice(0,4)){
  console.log(' iouMax='+r.iouMax,'gapMax='+r.gapMax,'gapMin='+r.gapMin,'min='+r.min,'ugly='+r.ugly,
    'io='+r.ioMin.toFixed(3)+'..'+r.ioMax.toFixed(3));
  console.log('   us=['+r.us.map(v=>v.toFixed(3)).join(', ')+']');
  console.log('   sc=['+r.sc.join(', ')+']');
 }
}

