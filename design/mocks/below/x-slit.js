/* ─────────────────────────────────────────────────────────────
 below · 时间摊开

 往下滚不再推空间，而是推时间。而且这一屏不是「某一刻」：屏幕上每一处是不同的时刻——
 时间沿一个方向摊在屏幕上（扫描式成像 / slit-scan），中间那条淡线是「此刻」，一侧是刚才，另一侧是待会儿。
 于是转着的六芒星（左下角那颗工具栏的星）被摊成一颗弯掉的星；绕圈的几粒光被拉成一条条弧；
 摆动的线成了波纹；走过去的那位被拉成一道斜影。
 滚轮：在时间里前后走（停手，它们也还在慢慢动）。
 鼠标左右：时间摊开的方向；上下：摊开得多长（越长，弯得越厉害）。
 ───────────────────────────────────────────────────────────── */
import { scrub, quad } from './scrub.js';

const gl = quad(document.getElementById('gl'), `
uniform vec2 uRes; uniform float uT, uS; uniform vec2 uM;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p){ float a = .5, s = 0.; for (int i = 0; i < 4; i++){ s += a * vn(p); p = p * 2.03 + 11.7; a *= .5; } return s; }
float bayer(vec2 p){ ivec2 i = ivec2(mod(p, 4.)); int m[16] = int[16](0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5); return (float(m[i.y * 4 + i.x]) + .5) / 16.; }
mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
float tri(vec2 p, float r){ const float k = 1.7320508; p.x = abs(p.x) - r; p.y = p.y + r / k;
  if (p.x + k * p.y > 0.) p = vec2(p.x - k * p.y, -k * p.x - p.y) / 2.; p.x -= clamp(p.x, -2. * r, 0.); return -length(p) * sign(p.y); }
float seg(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0., 1.); return length(pa - ba * h); }

void main(){
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  float ang = 1.5708 + (uM.x - .5) * 2.4;            // 时间摊开的方向（默认竖着：上面是刚才，下面是待会儿）
  vec2 dir = vec2(cos(ang), sin(ang));
  float span = mix(.6, 7., 1. - uM.y);                 // 一屏摊开几秒
  float now = uS + uT * .22;
  float x = dot(uv, -dir);
  float tau = now + x * span;                          // 这一点的时刻

  // 背景：同一片流光，各点在各自的时刻
  float v = fbm(uv * 1.5 + vec2(tau * .1, tau * .04));
  v = clamp((v - .3) / .42, 0., 1.);
  vec3 c0 = vec3(.055, .06, .12), c1 = vec3(.12, .12, .23), c2 = vec3(.29, .27, .44), c3 = vec3(.8, .72, .78);
  vec3 col = mix(c0, c1, smoothstep(.08, .5, v));
  col = mix(col, c2, smoothstep(.5, .86, v));

  vec3 warm = vec3(.97, .86, .76);
  float px = 1.6 / uRes.y;
  float d = 1e9;
  // 转着的六芒星
  { vec2 p = rot(tau * 1.15) * (uv - vec2(-.18, .02));
    d = min(d, abs(min(tri(p, .2), tri(-p, .2))) - .006); }
  // 绕圈的三粒光
  for (int i = 0; i < 3; i++) { float a = tau * 1.7 + float(i) * 2.094; d = min(d, length(uv - vec2(-.18, .02) - vec2(cos(a), sin(a)) * .34) - .022); }
  // 摆动的线（从上沿垂下来）
  { float a = sin(tau * 1.3) * .7; vec2 top = vec2(.42, .5); d = min(d, seg(uv, top, top + vec2(sin(a), -cos(a)) * .55) - .004);
    d = min(d, length(uv - top - vec2(sin(a), -cos(a)) * .55) - .03); }
  // 走过去的那位（左右来回）
  { float wx = sin(tau * .5) * .75; vec2 p = uv - vec2(wx, -.33);
    d = min(d, seg(p, vec2(0., -.06), vec2(0., .07)) - .022); d = min(d, length(p - vec2(0., .12)) - .03); }

  col = mix(col, warm, 1. - smoothstep(0., px, d));
  col += warm * .1 * exp(-max(d, 0.) * 40.);
  // 「此刻」：时间等于 now 的那条线
  col += vec3(.9, .86, .96) * .14 * (1. - smoothstep(0., px * 1.5, abs(x)));

  float L = 26.;
  col = floor(col * L + .5 + (bayer(fc) - .5) * .9) / L;
  o = vec4(col, 1.);
}`, { scale: 0.75 });

const ui = document.getElementById('ui');
ui.innerHTML = '<div class="gauge"><span>此刻</span><b id="tn">0.00</b><span>秒</span></div><p class="tip" id="tip">滚动是在时间里走 · 动一动鼠标</p>';
const tn = document.getElementById('tn');
const tip = document.getElementById('tip');
const sm = { x: 0.5, y: 0.5 };
scrub({
  max: 20,
  onFrame({ t, depth, mouse }) {
    sm.x += (mouse.x - sm.x) * 0.06;
    sm.y += (mouse.y - sm.y) * 0.06;
    const s = depth * 5;
    gl.set('uT', t);
    gl.set('uS', s);
    gl.set('uM', sm.x, sm.y);
    gl.draw();
    tn.textContent = (s + t * 0.22).toFixed(2);
    tip.style.opacity = depth > 0.5 ? 0 : 1;
  },
});
