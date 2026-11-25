import fs from 'node:fs';
const ROOT = 'file:///D:/Documents/HTA/My%20Projects/personal-website/design/mocks/star-nexus-bake/';
const m = await import(ROOT + 'bake.mjs');
const g = JSON.parse(fs.readFileSync(new URL('./.shots/geo.json', import.meta.url), 'utf8'));
const P = m.BAKE.shape; const samples = g.curve.samples;
const scoreAt = (u) => samples.reduce((a, b) => (Math.abs(b.u - u) < Math.abs(a.u - u) ? b : a)).score;
const SIZE=48, MI=SIZE*SIZE;
const maskAt=(u)=>m.__mask(P,u,SIZE);
const iouAB=(a,b)=>{let it=0,un=0;for(let i=0;i<MI;i++){if(a[i]&&b[i])it++;if(a[i]||b[i])un++;}return un?it/un:1;};
const US=[];for(let i=0;i<=400;i++)US.push(i/400);
const MASKS=US.map(maskAt);
function greedy(target,pass){ const idx=[0];let i=0;
  while(i<US.length-1){ let step=1;
    while(i+step<US.length-1){ const j=i+step; if(scoreAt(US[j])>=pass&&iouAB(MASKS[i],MASKS[j])<=target)break; step++; }
    i=Math.min(i+step,US.length-1); idx.push(i); if(idx.length>50)break; }
  if(US[idx.at(-1)]!==1)idx.push(US.length-1); return idx; }
const rows=[];
for(let T=0.80;T<=0.95;T+=0.005) for(const pass of [58,60,62,64,66,68]) {
  const idx=greedy(T,pass); if(idx.length<14||idx.length>20) continue;
  const us=idx.map(i=>US[i]); const sc=us.map(scoreAt);
  const ious=us.slice(1).map((u,k)=>iouAB(MASKS[idx[k]],MASKS[idx[k+1]]));
  const maxGap=Math.max(...us.slice(1).map((u,k)=>u-us[k]));
  rows.push({T:+T.toFixed(3),pass,n:us.length,min:Math.min(...sc),iouMin:Math.min(...ious).toFixed(3),iouMax:Math.max(...ious).toFixed(3),maxGap:+maxGap.toFixed(3),us:us.map(v=>v.toFixed(4)),sc});
}
rows.sort((a,b)=>b.min-a.min||a.maxGap-b.maxGap);
console.log('候选数',rows.length);
for(const r of rows.slice(0,8)){
  console.log('T='+r.T,'pass='+r.pass,'n='+r.n,'min='+r.min,'iou='+r.iouMin+'..'+r.iouMax,'maxGap='+r.maxGap);
  console.log('   us=['+r.us.join(', ')+']');
  console.log('   sc=['+r.sc.join(', ')+']');
}
