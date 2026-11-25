import { star } from "./src.js";
const nrm=(v)=>{const l=Math.hypot(...v);return v.map(x=>x/l)};
const dirOf=(az,el)=>nrm([Math.cos(el*Math.PI/180)*Math.cos(az*Math.PI/180),Math.sin(el*Math.PI/180),Math.cos(el*Math.PI/180)*Math.sin(az*Math.PI/180)]);
for(const [az,el] of [[90,30],[90,60],[70,-10],[70,10],[90,-40],[30,20],[150,25],[90,0],[110,-10],[90,15]]){
  const L=dirOf(az,el);
  for(const sides of [4,8]){
    const r=star({fold:1.2,sides,fillet:sides>4?0.12:0,light:L});
    console.log(`az${az} el${el} L=[${L.map(x=>x.toFixed(3)).join(",")}] s${sides} paths ${r.stats.paths} tones ${r.stats.tones.map(t=>t.toFixed(2)).join(" ")} spine ${r.stats.spine.map(t=>t.toFixed(2)).join(" ")} notch ${r.stats.notch.map(t=>t.toFixed(2)).join(" ")} same ${r.stats.sameOrder}`);
  }
}
