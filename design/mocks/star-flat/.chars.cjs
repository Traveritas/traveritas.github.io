const fs=require("fs");
const css=fs.readFileSync("public/fonts/noto-serif-sc/font.css","utf8");
const ranges=[...css.matchAll(/unicode-range:\s*([^;]+);/g)].map(m=>m[1]);
const set=new Set();
for(const r of ranges) for(const part of r.split(",")){
  const p=part.trim().replace(/^U\+/i,"");
  if(p.includes("-")){const [a,b]=p.split("-").map(h=>parseInt(h,16)); for(let i=a;i<=b;i++) set.add(i);}
  else set.add(parseInt(p,16));
}
const test="醒梦四芒星扁平原型对照墙参数材质尺寸梯指向原件复刻偏差腰深中心结锁住材质层磨砂双层尺寸阈值仍读成十字而非曲线直边内凹等臂竖横预览滑杆取景框偏移叠合重合";
const miss=[...new Set([...test])].filter(c=>!set.has(c.codePointAt(0)));
console.log("missing:", miss.join(""));
