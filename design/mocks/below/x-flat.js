/* ─────────────────────────────────────────────────────────────
 below · 时间摊开 · 纸片

 「时间摊开」那一版，加上能放的东西：平面的纸片（一张图就是一样东西）。
 屏幕上每一处是不同的时刻，所以纸片平时是被时间拧歪、拉弯的样子；
 按住鼠标，指针周围那一块的时间合上（都回到「此刻」），纸片恢复原形；
 轻点一张纸片，它会说一句 / 做个反应。

 ══ 往里加东西：在 THINGS 里加一行 ══
   src             一张图（PNG / SVG 的地址）——有它就直接用图；或者
   draw(g, w, h)   用代码画这张纸片（下面几个占位都是这样画的）
   aspect          宽 / 高
   from, to        住在哪一段时间里（秒；前后各淡入淡出一点）
   at(t)           t 时刻它在哪：{ x, y（屏幕高度为 1，原点在中心，y 向上）, rot, s（高度） }
   say             点它时依次说的话（或 onClick）
 运动在载入时按 4096 个时刻烘成一张数据贴图，着色器按每个像素各自的时刻去查——于是任何 JS 写的动法都能被摊开。
 ───────────────────────────────────────────────────────────── */
import { scrub, quad } from './scrub.js';

const TT = 300; // 时间轴总长（秒）
const S = 4096; // 烘焙的时刻数
const INK = '#2a2438', CREAM = '#efe6dc', LILAC = '#b9aed6', WARM = '#e8c3a6', DUSK = '#7d73a3';

/* 纸片的画法：平涂 + 一圈墨线 + 一点错开的纸影——剪下来的那种 */
function cut(g, path, fill, w = 5) {
  g.save();
  g.translate(5, 6);
  g.fillStyle = 'rgba(10,8,20,0.35)';
  path(g); g.fill();
  g.restore();
  g.fillStyle = fill; path(g); g.fill();
  g.lineWidth = w; g.strokeStyle = INK; g.lineJoin = 'round'; path(g); g.stroke();
}
const THINGS = [
  {
    id: 'walker', aspect: 0.55, from: 0, to: TT,
    draw(g, w, h) {
      cut(g, (c) => { c.beginPath(); c.moveTo(w * 0.3, h * 0.36); c.lineTo(w * 0.7, h * 0.36); c.lineTo(w * 0.82, h * 0.95); c.lineTo(w * 0.18, h * 0.95); c.closePath(); }, LILAC);
      cut(g, (c) => { c.beginPath(); c.arc(w * 0.5, h * 0.2, w * 0.2, 0, Math.PI * 2); }, CREAM);
      g.fillStyle = INK; g.beginPath(); g.arc(w * 0.58, h * 0.19, 6, 0, Math.PI * 2); g.fill();
    },
    at: (t) => ({ x: Math.sin(t * 0.42) * 0.62, y: -0.2 + Math.abs(Math.sin(t * 2.6)) * 0.015, rot: Math.sin(t * 2.6) * 0.07, s: 0.26 }),
    say: ['……', '按住的时候，我才走得直。', '<small>占位 · 以后换成真的话</small>你也是从上面下来的？'],
  },
  {
    id: 'star', aspect: 1, from: 0, to: TT,
    draw(g, w, h) {
      const tri = (k) => (c) => { c.beginPath(); for (let i = 0; i <= 3; i++) { const a = (i / 3) * Math.PI * 2 + (k ? Math.PI : 0) - Math.PI / 2; c[i ? 'lineTo' : 'moveTo'](w / 2 + Math.cos(a) * w * 0.42, h / 2 + Math.sin(a) * h * 0.42); } c.closePath(); };
      cut(g, tri(0), CREAM); cut(g, tri(1), WARM);
    },
    at: (t) => ({ x: -0.32, y: 0.16, rot: t * 1.2, s: 0.3 }),
    say: ['……', '<small>占位</small>它一直在转'],
  },
  {
    id: 'cup', aspect: 1, from: 4, to: TT,
    draw(g, w, h) {
      cut(g, (c) => { c.beginPath(); c.arc(w * 0.74, h * 0.6, w * 0.13, -Math.PI / 2, Math.PI / 2); c.lineWidth = 18; }, 'transparent', 14);
      cut(g, (c) => { c.beginPath(); c.moveTo(w * 0.2, h * 0.42); c.lineTo(w * 0.72, h * 0.42); c.lineTo(w * 0.66, h * 0.9); c.lineTo(w * 0.26, h * 0.9); c.closePath(); }, CREAM);
      g.strokeStyle = INK; g.lineWidth = 4;
      for (let i = 0; i < 3; i++) { g.beginPath(); const x = w * (0.32 + i * 0.12); g.moveTo(x, h * 0.36); g.bezierCurveTo(x - 14, h * 0.27, x + 14, h * 0.2, x, h * 0.1); g.stroke(); }
    },
    at: (t) => ({ x: 0.36, y: 0.08 + Math.sin(t * 1.1) * 0.05, rot: Math.sin(t * 0.7) * 0.25, s: 0.22 }),
    say: ['还是热的。', '……'],
  },
  {
    id: 'card', aspect: 1.5, from: 9, to: TT,
    draw(g, w, h) {
      cut(g, (c) => { c.beginPath(); c.rect(w * 0.06, h * 0.08, w * 0.88, h * 0.82); }, '#2d2440');
      g.fillStyle = '#ece6f0'; g.font = `500 ${h * 0.14}px "Noto Serif SC", serif`; g.fillText('碎碎念', w * 0.14, h * 0.32);
      g.globalAlpha = 0.6; g.font = `400 ${h * 0.08}px Consolas, monospace`; g.fillText('2026-11-01', w * 0.14, h * 0.8);
    },
    at: (t) => ({ x: 0.62 + Math.sin(t * 0.3) * 0.08, y: 0.3 + Math.cos(t * 0.37) * 0.04, rot: -0.12 + Math.sin(t * 0.5) * 0.08, s: 0.17 }),
    say: ['<small>点开就是那篇（占位）</small>碎碎念'],
  },
  {
    id: 'fish', aspect: 2, from: 14, to: TT,
    draw(g, w, h) {
      cut(g, (c) => { c.beginPath(); c.ellipse(w * 0.42, h * 0.5, w * 0.3, h * 0.32, 0, 0, Math.PI * 2); }, WARM);
      cut(g, (c) => { c.beginPath(); c.moveTo(w * 0.7, h * 0.5); c.lineTo(w * 0.94, h * 0.18); c.lineTo(w * 0.94, h * 0.82); c.closePath(); }, DUSK);
      g.fillStyle = INK; g.beginPath(); g.arc(w * 0.24, h * 0.44, 7, 0, Math.PI * 2); g.fill();
    },
    at: (t) => ({ x: ((t * 0.09) % 2.4) - 1.2, y: -0.36 + Math.sin(t * 0.9) * 0.04, rot: Math.sin(t * 3.1) * 0.08, s: 0.1 }),
    say: ['（游开了）'],
  },
];

/* ══ 图集：每张纸片画进一张大画布的一格（给了 src 的先把图载进来） ══ */
await Promise.all(THINGS.filter((th) => th.src).map((th) => new Promise((ok) => {
  const im = new Image();
  im.onload = () => { th.img = im; th.aspect ??= im.naturalWidth / im.naturalHeight; ok(); };
  im.onerror = ok;
  im.src = th.src;
})));
const CELL = 256;
const atlas = document.createElement('canvas');
atlas.width = CELL * THINGS.length * 2;
atlas.height = CELL;
const ag = atlas.getContext('2d');
let ax = 0;
THINGS.forEach((th) => {
  const w = Math.round(CELL * th.aspect), h = CELL;
  ag.save();
  ag.translate(ax, 0);
  ag.beginPath(); ag.rect(0, 0, w, h); ag.clip();
  if (th.img) ag.drawImage(th.img, 0, 0, w, h);
  else th.draw?.(ag, w, h);
  ag.restore();
  th.rect = [ax / atlas.width, 0, (ax + w) / atlas.width, 1];
  ax += w + 8;
});

/* ══ 运动：烘成数据贴图（每样两行：x, y, rot, s ／ 不透明度, 宽高比） ══ */
const mot = new Float32Array(S * THINGS.length * 2 * 4);
THINGS.forEach((th, j) => {
  for (let i = 0; i < S; i++) {
    const t = (i / (S - 1)) * TT;
    const m = th.at(t);
    const a = Math.min(1, Math.max(0, (t - th.from) / 1.5)) * Math.min(1, Math.max(0, (th.to - t) / 1.5));
    mot.set([m.x, m.y, m.rot, m.s], ((j * 2) * S + i) * 4);
    mot.set([a, th.aspect, 0, 0], ((j * 2 + 1) * S + i) * 4);
  }
});

const MAXI = 8;
const q = quad(document.getElementById('gl'), `
uniform vec2 uRes; uniform float uT, uNow, uSpan, uAng, uTT; uniform vec3 uFold;
uniform sampler2D uAtlas, uMot; uniform vec4 uRect[${MAXI}]; uniform int uN;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p){ float a = .5, s = 0.; for (int i = 0; i < 4; i++){ s += a * vn(p); p = p * 2.03 + 11.7; a *= .5; } return s; }
float bayer(vec2 p){ ivec2 i = ivec2(mod(p, 4.)); int m[16] = int[16](0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5); return (float(m[i.y * 4 + i.x]) + .5) / 16.; }
vec4 mot(int j, int row, float tau){
  float u = clamp(tau / uTT, 0., 1.) * ${S - 1}.;
  int i0 = int(floor(u)); int i1 = min(i0 + 1, ${S - 1});
  return mix(texelFetch(uMot, ivec2(i0, j * 2 + row), 0), texelFetch(uMot, ivec2(i1, j * 2 + row), 0), fract(u));
}
void main(){
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  vec2 dir = vec2(cos(uAng), sin(uAng));
  float x = dot(uv, -dir);
  float fold = uFold.z * exp(-dot(uv - uFold.xy, uv - uFold.xy) / .045);   // 按住：这一块的时间合上
  float tau = uNow + x * uSpan * (1. - fold);

  float v = clamp((fbm(uv * 1.5 + vec2(tau * .1, tau * .04)) - .3) / .42, 0., 1.);
  vec3 col = mix(vec3(.055, .06, .12), vec3(.12, .12, .23), smoothstep(.08, .5, v));
  col = mix(col, vec3(.29, .27, .44), smoothstep(.5, .86, v));
  col = mix(col, col * .7 + vec3(.04, .035, .06), fold * .6);                // 合上的那一块略静一点

  for (int j = 0; j < ${MAXI}; j++) {
    if (j >= uN) break;
    vec4 a = mot(j, 0, tau), b = mot(j, 1, tau);
    if (b.x < .003) continue;
    vec2 d = uv - a.xy;
    float c = cos(-a.z), s = sin(-a.z);
    d = mat2(c, -s, s, c) * d / a.w;
    vec2 st = d / vec2(b.y, 1.) + .5;
    if (st.x < 0. || st.x > 1. || st.y < 0. || st.y > 1.) continue;
    vec4 r = uRect[j];
    vec4 px = texture(uAtlas, vec2(mix(r.x, r.z, st.x), mix(r.y, r.w, 1. - st.y)));
    col = mix(col, px.rgb, px.a * b.x);
  }
  col += vec3(.9, .86, .96) * .1 * (1. - smoothstep(0., 2.2 / uRes.y, abs(x))) * (1. - fold);   // 「此刻」
  float L = 30.;
  col = floor(col * L + .5 + (bayer(fc) - .5) * .7) / L;
  o = vec4(col, 1.);
}`, { scale: 0.75 });

/* 贴图 */
const { gl } = q;
function tex(unit, setup) {
  const t = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, t);
  setup();
  return t;
}
tex(0, () => {
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
});
tex(1, () => {
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, S, THINGS.length * 2, 0, gl.RGBA, gl.FLOAT, mot);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
});
gl.uniform1i(q.loc('uAtlas'), 0);
gl.uniform1i(q.loc('uMot'), 1);
gl.uniform4fv(q.loc('uRect[0]'), new Float32Array(THINGS.flatMap((th) => th.rect)));
gl.uniform1i(q.loc('uN'), THINGS.length);
q.set('uTT', TT);

/* ══ 交互：按住合上；轻点纸片说话 ══ */
const ui = document.getElementById('ui');
ui.innerHTML = '<div class="gauge"><span>此刻</span><b id="tn">0.00</b><span>秒</span></div><p class="tip" id="tip">按住，那一块的时间就合上 · 轻点纸片</p>';
const tn = document.getElementById('tn');
const tip = document.getElementById('tip');
const bubble = document.createElement('p');
bubble.className = 'say';
bubble.style.cssText = 'position:fixed;left:0;top:0;z-index:10;margin:0;pointer-events:none;white-space:nowrap;font:400 13.5px/1.8 var(--font-display);letter-spacing:.08em;padding:6px 14px;border-radius:3px;color:#eee8f2;background:rgba(20,18,34,.55);border:1px solid rgba(232,226,240,.2);backdrop-filter:blur(6px);opacity:0;transition:opacity .35s ease';
document.body.appendChild(bubble);
const sayStyle = document.createElement('style');
sayStyle.textContent = '.say small{display:block;font:400 9.5px/1.6 var(--font-mono);letter-spacing:.2em;opacity:.55}';
document.head.appendChild(sayStyle);

let fold = 0, holding = false, downAt = 0, downXY = null;
let now = 0, vwG = innerWidth, vhG = innerHeight;
let talk = null; // { th, until }
addEventListener('pointerdown', (e) => { holding = true; downAt = performance.now(); downXY = [e.clientX, e.clientY]; });
addEventListener('pointerup', (e) => {
  holding = false;
  const quick = performance.now() - downAt < 260 && downXY && Math.hypot(e.clientX - downXY[0], e.clientY - downXY[1]) < 8;
  if (!quick) return;
  // 轻点：在「此刻」查一遍谁在指针下面（最上面那张先）
  const ux = (e.clientX - vwG / 2) / vhG, uy = (vhG / 2 - e.clientY) / vhG;
  for (let j = THINGS.length - 1; j >= 0; j--) {
    const th = THINGS[j];
    if (now < th.from || now > th.to) continue;
    const m = th.at(now + (th.kickT || 0));
    let dx = ux - m.x, dy = uy - m.y;
    const c = Math.cos(-m.rot), s = Math.sin(-m.rot);
    [dx, dy] = [(dx * c - dy * s) / m.s, (dx * s + dy * c) / m.s];
    if (Math.abs(dx) < th.aspect / 2 && Math.abs(dy) < 0.5) {
      th.si = ((th.si ?? -1) + 1) % th.say.length;
      bubble.innerHTML = th.say[th.si];
      th.onClick?.(th);
      talk = { th, until: performance.now() + 2600 };
      break;
    }
  }
});

const sm = { x: 0.5, y: 0.5 };
scrub({
  max: 20,
  onFrame({ t, dt, depth, mouse, vw, vh }) {
    vwG = vw; vhG = vh;
    sm.x += (mouse.x - sm.x) * 0.06;
    sm.y += (mouse.y - sm.y) * 0.06;
    fold += ((holding ? 1 : 0) - fold) * (1 - Math.exp(-dt * 6));
    now = depth * 5 + t * 0.15;
    q.set('uT', t);
    q.set('uNow', now);
    q.set('uAng', 1.5708 + (sm.x - 0.5) * 2.4);
    q.set('uSpan', 0.6 + (1 - sm.y) * 6.4);
    q.set('uFold', (mouse.x * vw - vw / 2) / vh, (vh / 2 - mouse.y * vh) / vh, fold);
    q.draw();
    tn.textContent = now.toFixed(2);
    tip.style.opacity = depth > 0.6 ? 0 : 1;
    if (talk && performance.now() < talk.until) {
      const m = talk.th.at(now);
      bubble.style.opacity = 1;
      bubble.style.transform = `translate(${vw / 2 + m.x * vh}px, ${vh / 2 - (m.y + m.s * 0.6) * vh}px) translate(-50%, -100%)`;
    } else bubble.style.opacity = 0;
  },
});
