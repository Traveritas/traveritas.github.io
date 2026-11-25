/* ─────────────────────────────────────────────────────────────
 below · 切面

 往下滚不是往下走：是一张切面在穿过一块看不见的东西。屏幕上永远只有那一层截面。
 流光本来就是「一块三维的光被切开的样子」——这里把它当真：背景是三维噪声在深度 z 处的切片。
 里面藏着几样东西，只露出截面（亮的轮廓 + 浅一点的里子），再加一圈很淡的「下一层」预影：
   · 一只斜放的环：先是两团，滑近、合成一条弧，再分开；
   · 三颗挤在一起的球：圆冒出来、长大、黏成一团、又各自缩没；
   · 一根拧过的方柱：截面是一个方块，随你往下滚而转；
   · 一根弹簧：截面是一个点，绕着圈走——滚轮成了它的发条；
   · 一个八面体：一个菱形长大，再缩成一点；
   · 最后一只空心的大球：一圈轮廓涨满整屏，再收成一点。
 ───────────────────────────────────────────────────────────── */
import { scrub, quad } from './scrub.js';

const gl = quad(document.getElementById('gl'), `
uniform vec2 uRes; uniform float uT, uZ; uniform vec2 uM;
float h31(vec3 p){ p = fract(p * vec3(.1031, .1030, .0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }
float vn(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbm(vec3 p){ float a = .5, s = 0.; for (int i = 0; i < 4; i++){ s += a * vn(p); p = p * 2.03 + 7.1; a *= .5; } return s; }
float bayer(vec2 p){ ivec2 i = ivec2(mod(p, 4.)); int m[16] = int[16](0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5); return (float(m[i.y * 4 + i.x]) + .5) / 16.; }
mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
float smin(float a, float b, float k){ float h = clamp(.5 + .5 * (b - a) / k, 0., 1.); return mix(b, a, h) - k * h * (1. - h); }

float scene(vec3 p){
  float d = 1e9;
  // 斜放的环
  { vec3 q = p - vec3(.3, 0., 5.); q.yz *= rot(.75); q.xy *= rot(.3);
    vec2 t = vec2(length(q.xz) - 1.5, q.y); d = min(d, length(t) - .32); }
  // 三颗球
  { vec3 q = p - vec3(-.2, .1, 11.);
    float a = length(q - vec3(-.7, .2, -.6)) - .8, b = length(q - vec3(.6, -.3, 0.)) - .9, c = length(q - vec3(.1, .5, .9)) - .7;
    d = min(d, smin(smin(a, b, .5), c, .5)); }
  // 拧过的方柱（截面是一个会转的方块）
  { vec3 q = p - vec3(0., 0., 17.); if (abs(q.z) < 3.) { q.xy *= rot(q.z * .55); vec2 b = abs(q.xy) - vec2(.85); d = min(d, max(length(max(b, 0.)) + min(max(b.x, b.y), 0.), abs(q.z) - 3.)); } }
  // 弹簧（截面是一个绕圈走的点）
  { vec3 q = p - vec3(0., 0., 25.); if (abs(q.z) < 3.5) { float a = q.z * 1.9; vec2 c = vec2(cos(a), sin(a)) * 1.2; d = min(d, length(q.xy - c) - .26); } }
  // 八面体
  { vec3 q = abs(p - vec3(0., 0., 32.)); d = min(d, (q.x + q.y + q.z - 1.6) * .577); }
  // 空心大球
  { d = min(d, abs(length(p - vec3(0., 0., 40.)) - 3.4) - .06); }
  return d;
}

void main(){
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y * 6.;
  uv += (uM - .5) * vec2(.35, -.35);
  float z = uZ;
  // 背景：同一块三维的光，在 z 处的切面
  float v = fbm(vec3(uv * .42, z * .22 + uT * .015));
  v = clamp((v - .3) / .42, 0., 1.);
  vec3 c0 = vec3(.055, .06, .12), c1 = vec3(.12, .12, .23), c2 = vec3(.29, .27, .44), c3 = vec3(.8, .72, .78);
  vec3 col = mix(c0, c1, smoothstep(.08, .5, v));
  col = mix(col, c2, smoothstep(.5, .86, v));
  col += c3 * smoothstep(.62, .74, v) * (1. - smoothstep(.78, .94, v)) * .3;
  // 截面
  float px = 6. / uRes.y * 1.4;
  float d = scene(vec3(uv, z));
  float dn = scene(vec3(uv, z + .45));   // 下一层：很淡的预影
  vec3 warm = vec3(.96, .86, .78);
  col = mix(col, mix(col, c2 * 1.35 + .05, .7), step(d, 0.));            // 里子
  col += warm * .16 * (1. - smoothstep(0., px * 1.2, abs(dn)));          // 预影
  col = mix(col, warm, 1. - smoothstep(0., px, abs(d)));                  // 轮廓
  col += warm * .08 * exp(-abs(d) * 6.) * step(0., d);                    // 轮廓外一点晕
  float L = 26.;
  col = floor(col * L + .5 + (bayer(fc) - .5) * .9) / L;
  o = vec4(col, 1.);
}`);

const ui = document.getElementById('ui');
ui.innerHTML = '<div class="gauge"><span>深</span><b id="dz">0.00</b><span id="dn"></span></div><p class="tip" id="tip">慢慢往下滚，再往回滚一点</p>';
const dz = document.getElementById('dz');
const tip = document.getElementById('tip');
const sm = { x: 0.5, y: 0.5 };
scrub({
  max: 10,
  rate: 1, // 一屏滚动 ≈ 4.5 个深度单位（见 z）
  onFrame({ t, depth, mouse }) {
    sm.x += (mouse.x - sm.x) * 0.05;
    sm.y += (mouse.y - sm.y) * 0.05;
    const z = depth * 4.5 + 1;
    gl.set('uT', t);
    gl.set('uZ', z);
    gl.set('uM', sm.x, sm.y);
    gl.draw();
    dz.textContent = z.toFixed(2);
    tip.style.opacity = depth > 0.4 ? 0 : 1;
  },
});
