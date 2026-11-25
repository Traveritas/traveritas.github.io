import fs from 'node:fs';
const ROOT = 'file:///D:/Documents/HTA/My%20Projects/personal-website/design/mocks/star-nexus-bake/';
const m = await import(ROOT + 'bake.mjs');
const g = JSON.parse(fs.readFileSync(new URL('./.shots/geo.json', import.meta.url), 'utf8'));
const P = m.BAKE.shape; const samples = g.curve.samples;
const scoreAt=(u)=>samples.reduce((a,b)=>(Math.abs(b.u-u)<Math.abs(a.u-u)?b:a)).score;
const SIZE=64, MI=SIZE*SIZE;
const maskAt=(u)=>m.__mask(P,u,SIZE);
const iouAB=(a,b)=>{let it=0,un=0;for(let i=0;i<MI;i++){if(a[i]&&b[i])it++;if(a[i]||b[i])un++;}return un?it/un:1;};
const US=[];for(let i=0;i<=400;i++)US.push(i/400);
const MASKS=US.map(maskAt);
function build(target, pass, iEnd, nTail){
  const idx=[0]; let i=0;
  const endI=Math.round(iEnd/0.0025);
  while(i<endI){
    let step=1;
    while(i+step<=endI){ const j=i+step; if(scoreAt(US[j])>=pass&&iouAB(MASKS[i],MASKS[j])<=target) break; step++; }
    i=Math.min(i+step,endI); idx.push(i); if(idx.length>40)break;
  }
  for(let k=1;k<=nTail;k++) idx.push(Math.round(US.length-1-((nTail-k)*(US.length-1-endI))/(nTail+1)));
  idx.push(US.length-1);
  return Array.from(new Set(idx)).sort((a,b)=>a-b);
}
const rows=[];
for(let T=0.80;T<=0.95;T+=0.005) for(const pass of [55,58,60,62,64]) for(const iEnd of [0.30,0.35,0.40,0.45])
 for(const nTail of [1,2,3]){
  const idx=build(T,pass,iEnd,nTail); if(idx.length<14||idx.length>18) continue;
  const us=idx.map(i=>US[i]); const sc=us.map(scoreAt);
  const ious=us.slice(1).map((u,k)=>iouAB(MASKS[idx[k]],MASKS[idx[k+1]]));
  const maxGap=Math.max(...us.slice(1).map((u,k)=>u-us[k]));
  rows.push({T:+T.toFixed(3),pass,iEnd,nTail,n:us.length,min:Math.min(...sc),iouMin:Math.min(...ious),iouMax:Math.max(...ious),maxGap,us:us.map(v=>v.toFixed(4)),sc});
 }
rows.sort((a,b)=>b.min-a.min||b.iouMin-a.iouMin);
console.log('候选',rows.length);
for(const r of rows.slice(0,6)){
  console.log('T='+r.T,'pass='+r.pass,'iEnd='+r.iEnd,'tail='+r.nTail,'n='+r.n,'min='+r.min,'iou='+r.iouMin.toFixed(3)+'..'+r.iouMax.toFixed(3),'gap='+r.maxGap.toFixed(3));
  console.log('   us=['+r.us.join(', ')+']');
  console.log('   sc=['+r.sc.join(', ')+']');
}
