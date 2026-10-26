/* 开发用花形/线数对照（不进交付）。跑完 node _sweep.cjs 再截图 %TEMP%/bloom-sweep.html */
const fs = require('fs');
const path = require('path');
const os = require('os');
const DEG = Math.PI / 180;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth01 = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };

/* 瓣形：半宽 half(s) = Wmax · (1 - s^5)^0.40 · (0.80 + 0.20·sin(π·s))
   根部不窄（花心才实），中段最宽，梢头收成钝尖。 */
function petals(Wmax) {
  return Array.from({ length: 5 }, (_, k) => ({
    k,
    axis: (-90 + 72 * k + 4.6 * Math.sin(1.9 * k + 1.15) + 1.7 * Math.cos(3.3 * k)) * DEG,
    L: 11.2 * (1 + 0.13 * Math.sin(1.7 * k + 0.8)),
    W: Wmax * (1 + 0.1 * Math.sin(1.3 * k + 2.1)),
    skew: 0.15 * Math.sin(1.25 * k + 2.3),
  }));
}
function halfAt(s, p) {
  return p.W * Math.pow(1 - Math.pow(s, 5), 0.4) * (0.8 + 0.2 * Math.sin(Math.PI * Math.min(s * 1.15, 1)));
}
function pt(x, y, p) {
  const dx = x - 16, dy = y - 16;
  const ca = Math.cos(p.axis), sa = Math.sin(p.axis);
  const a = dx * ca + dy * sa, b = -dx * sa + dy * ca;
  if (a < 0 || a > p.L) return 0;
  const half = halfAt(a / p.L, p);
  return smooth01((half * (1 + (b >= 0 ? p.skew : -p.skew)) - Math.abs(b)) / 0.4);
}
function tone(x, y, ps, hole) {
  const rho = Math.hypot(x - 16, y - 16);
  if (rho > 16) return 0;
  let t = 0;
  for (const p of ps) { const v = pt(x, y, p); if (v > t) t = v; }
  return clamp(t * smooth01((rho - hole) / 1.2), 0, 1);
}

const A = 14 * DEG, CS = Math.cos(A), SN = Math.sin(A);
function screen(pitch, levels, off, snap, ps, hole) {
  const n = Math.ceil(16 / pitch) + 2, dots = [];
  for (let j = -n; j <= n; j++) for (let i = -n; i <= n; i++) {
    const u = i * pitch + off.x, v = j * pitch + off.y;
    let x = 16 + u * CS - v * SN, y = 16 + u * SN + v * CS;
    if (x < -1 || x > 33 || y < -1 || y > 33) continue;
    if (snap) { x = Math.round(x * 2) / 2; y = Math.round(y * 2) / 2; }
    const t = tone(x, y, ps, hole), lv = Math.round(t * (levels - 1));
    if (lv <= 0) continue;
    dots.push({ x, y, r: 0.44 * pitch * Math.sqrt(lv / (levels - 1)), lv, rho: Math.hypot(x - 16, y - 16) });
  }
  return dots;
}
function reg(pitch, levels, snap, ps, hole, target) {
  let best = null;
  for (let a = 0; a < 26; a++) for (let b = 0; b < 26; b++) {
    const off = { x: (a / 26) * pitch, y: (b / 26) * pitch };
    const ds = screen(pitch, levels, off, snap, ps, hole);
    if (ds.length < 12 || ds.length > 48) continue;
    const per = ps.map((p) => {
      let c = 0;
      for (const d of ds) {
        const ca = Math.cos(p.axis), sa = Math.sin(p.axis);
        const aa = (d.x - 16) * ca + (d.y - 16) * sa, bb = -(d.x - 16) * sa + (d.y - 16) * ca;
        if (aa < 0 || aa > p.L) continue;
        const half = halfAt(aa / p.L, p);
        if (Math.abs(bb) < half * (1 + (bb >= 0 ? p.skew : -p.skew)) * 0.8 && d.lv >= 2) c++;
      }
      return c;
    });
    const minC = Math.min(...per);
    const free = ds.some((d) => d.rho < hole * 0.7) ? 0 : 1;
    const sc = minC * 30 + per.reduce((s, v) => s + Math.min(v, 4), 0) + free * 8 - Math.abs(ds.length - target) * 0.3;
    if (!best || sc > best.sc) best = { sc, off, per, minC, dots: ds };
  }
  return best;
}

const variants = [];
for (const W of [2.6, 3.0, 3.4]) for (const pitch of [3.6, 3.2, 2.8]) variants.push({ W, pitch });

const rows = variants.map((v) => {
  const ps = petals(v.W);
  const r = reg(v.pitch, 4, true, ps, 1.8, 25);
  if (!r) return `<div class="row"><div class="lb">W ${v.W} · ${v.pitch}<br>no fit</div></div>`;
  const dots = r.dots;
  const minLv = Math.min(...dots.map((d) => d.lv));
  dots.forEach((d) => (d.sq = d.lv === minLv));
  return `<div class="row"><div class="lb">W ${v.W} · pitch ${v.pitch}<br>${dots.length} 粒 · 每瓣 ${r.per.join('/')}</div>
  <div class="rz" data-d='${JSON.stringify(dots.map((d) => [d.x, d.y, d.r, d.sq ? 1 : 0]))}'></div>
  <canvas class="tm" data-w="${v.W}"></canvas></div>`;
}).join('\n');

const html = `<!doctype html><meta charset="utf-8"><title>bloom sweep</title><style>
body{background:#f0f3f6;font:13px system-ui;color:#232830;padding:24px;margin:0}
.row{display:flex;align-items:flex-end;gap:24px;margin-bottom:20px}
.lb{width:150px;font:11px/1.6 ui-monospace;color:#56606d}
.rz{display:flex;align-items:flex-end;gap:16px}
.c{display:flex;flex-direction:column;align-items:center;gap:5px;font:10px ui-monospace;color:#858f9d}
canvas{image-rendering:pixelated;display:block}
.tm{width:140px;height:140px;image-rendering:pixelated}
</style>${rows}
<script>
const DEG=Math.PI/180, clamp=(v,a,b)=>v<a?a:v>b?b:v, smooth01=x=>{x=clamp(x,0,1);return x*x*(3-2*x)};
const petals=W=>Array.from({length:5},(_,k)=>({k,axis:(-90+72*k+4.6*Math.sin(1.9*k+1.15)+1.7*Math.cos(3.3*k))*DEG,L:11.2*(1+0.13*Math.sin(1.7*k+0.8)),W:W*(1+0.1*Math.sin(1.3*k+2.1)),skew:0.15*Math.sin(1.25*k+2.3)}));
const halfAt=(s,p)=>p.W*Math.pow(1-Math.pow(s,5),0.4)*(0.8+0.2*Math.sin(Math.PI*Math.min(s*1.15,1)));
function pt(x,y,p){const dx=x-16,dy=y-16,ca=Math.cos(p.axis),sa=Math.sin(p.axis);const a=dx*ca+dy*sa,b=-dx*sa+dy*ca;if(a<0||a>p.L)return 0;const half=halfAt(a/p.L,p);return smooth01((half*(1+(b>=0?p.skew:-p.skew))-Math.abs(b))/0.4);}
function tone(x,y,ps){const rho=Math.hypot(x-16,y-16);if(rho>16)return 0;let t=0;for(const p of ps){const v=pt(x,y,p);if(v>t)t=v;}return clamp(t*smooth01((rho-1.8)/1.2),0,1);}
for(const cv of document.querySelectorAll('.tm')){
  const ps=petals(parseFloat(cv.dataset.w)), ctx=cv.getContext('2d'), n=48;
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){
    const t=tone((i+.5)/n*32,(j+.5)/n*32,ps);
    const g=Math.round(245-t*215);
    ctx.fillStyle='rgb('+g+','+(g+2)+','+(g+5)+')';ctx.fillRect(i*2,j*2,2,2);
  }
}
const S=(dots,ink)=>'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">'+dots.map(d=>d[3]
  ?'<rect x="'+(d[0]-d[2]*0.86)+'" y="'+(d[1]-d[2]*0.86)+'" width="'+(2*d[2]*0.86)+'" height="'+(2*d[2]*0.86)+'" fill="'+ink+'"/>'
  :'<circle cx="'+d[0]+'" cy="'+d[1]+'" r="'+d[2]+'" fill="'+ink+'"/>').join('')+'</svg>';
(async()=>{
  for(const rz of document.querySelectorAll('.rz')){
    const dots=JSON.parse(rz.dataset.d);
    for(const [px,show] of [[16,16],[16,160],[32,192],[48,192]]){
      const url='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(S(dots,'#232830'));
      const img=new Image(); await new Promise(r=>{img.onload=r;img.src=url;});
      const c=document.createElement('canvas'); c.width=c.height=px;
      const x=c.getContext('2d'); x.imageSmoothingQuality='high'; x.drawImage(img,0,0,px,px);
      c.style.width=c.style.height=show+'px';
      const w=document.createElement('div'); w.className='c'; w.appendChild(c);
      const t=document.createElement('span'); t.textContent=px+(show>px?' ×'+(show/px):''); w.appendChild(t);
      rz.appendChild(w);
    }
  }
})();
</script>`;
const p = path.join(os.tmpdir(), 'bloom-sweep.html');
fs.writeFileSync(p, html);
console.log(p);
