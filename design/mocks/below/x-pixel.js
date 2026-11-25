/* ─────────────────────────────────────────────────────────────
 below · 钻进一个像素

 站里的流光是一格一格抖出来的像素。往下滚，就对准屏幕正中那一格不停放大：
 那一格大到占满屏幕时，里面原来是一片更细的、9×9 一层的像素流光，颜色随它的「父格」走，又微微偏一点；
 继续滚就继续往里钻。无底——世界越来越小，而不是越来越远。
 每钻三层，正中那一格里会藏着一样东西（一个小人、一颗六芒星），也是像素拼的；你正好钻进它的身体里。

 做法：同时画两层——粗层（第 k 层，格宽 base·9^f）与细层（第 k+1 层，格宽再除以 9），
 细层在 f 走到一半时淡入；f 绕回 0 时细层原样变成下一轮的粗层，于是无缝。
 每格的明暗 = 0.55·父格 + 0.45·自己（只追一层父格，正好够接缝处对上）。
 ───────────────────────────────────────────────────────────── */
import { scrub, quad } from './scrub.js';

const gl = quad(document.getElementById('gl'), `
uniform vec2 uRes; uniform float uT, uZ; uniform vec2 uM;
const float N = 9.;
float h21(vec2 p, float s){ p = fract(p * vec2(123.34, 456.21) + s * 0.1713); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p, float s){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(h21(i, s), h21(i + vec2(1, 0), s), f.x), mix(h21(i + vec2(0, 1), s), h21(i + vec2(1, 1), s), f.x), f.y); }
float own(vec2 c, float k){ return .65 * vn(c / 4.5 + vec2(uT * .05, -uT * .035), k) + .35 * vn(c / 1.7 + 3.1, k + 50.); }
float val(vec2 c, float k){ vec2 par = floor(c / N + .5); return .55 * own(par, k - 1.) + .45 * own(c, k); }

const int FIG[9] = int[9](16, 56, 16, 124, 16, 40, 68, 0, 0);
const int STAR[9] = int[9](16, 40, 511, 130, 68, 130, 511, 40, 16);
bool bit(vec2 c, bool star){ int x = int(c.x) + 4, r = 4 - int(c.y); if (x < 0 || x > 8 || r < 0 || r > 8) return false;
  int row = star ? STAR[r] : FIG[r]; return ((row >> x) & 1) == 1; }
/* 第 j 层的格子 c 是不是「那样东西」：在藏东西的那一层直接查图样；下一层查父格 */
float pat(vec2 c, float j){
  if (j < 2.) return 0.;
  float m = mod(j, 3.);
  bool star = mod(floor(j / 3.), 2.) == 1.;
  if (m == 2.) return bit(c, star) ? 1. : 0.;
  if (m == 0.) { vec2 par = floor(c / N + .5); bool s2 = mod(floor((j - 1.) / 3.), 2.) == 1.; return bit(par, s2) ? .65 : 0.; }
  return 0.;
}
vec3 pal(float v, float k){
  v = clamp((v - .22) / .56, 0., 1.);
  vec3 c0 = vec3(.055, .06, .12), c1 = vec3(.12, .12, .23), c2 = vec3(.29, .27, .44), c3 = vec3(.8, .72, .78);
  vec3 c = mix(c0, c1, smoothstep(.05, .45, v));
  c = mix(c, c2, smoothstep(.45, .85, v));
  c = mix(c, c3, smoothstep(.85, 1., v) * .8);
  // 每往里一层，颜色微微偏一点
  float h = .5 + .5 * sin(k * 1.3);
  return mix(c, vec3(c.r * 1.12, c.g * .96, c.b * .9), h * .35);
}
void main(){
  vec2 q = gl_FragCoord.xy - .5 * uRes;
  float k = floor(uZ), f = fract(uZ);
  float coarse = 7. * pow(N, f), fine = coarse / N;
  vec2 cc = floor(q / coarse + .5), cf = floor(q / fine + .5);
  float vis = smoothstep(.3, .82, f);
  float pc = pat(cc, k), pf = pat(cf, k + 1.);
  vec3 warm = vec3(.98, .86, .74);
  vec3 a = mix(pal(val(cc, k), k), warm, pc);
  vec3 b = mix(pal(val(cf, k + 1.), k + 1.), warm, pf);
  // 每格一个颜色：按格子抖动量化（像素就是像素）
  float L = 22.;
  a = floor(a * L + .5 + (h21(cc, k + 9.) - .5) * .9) / L;
  b = floor(b * L + .5 + (h21(cf, k + 10.) - .5) * .9) / L;
  vec3 col = mix(a, b, vis);
  // 格子大到看得见时，格与格之间留一道很细的暗缝
  vec2 g = abs(fract(q / coarse + .5) - .5) * coarse;
  float e = coarse * .5 - max(g.x, g.y);
  col *= 1. - (1. - smoothstep(0., 1.5, e)) * smoothstep(40., 160., coarse) * (1. - vis) * .35;
  // 正中那一格：一圈若有若无的框，告诉你「钻的是这一格」
  vec2 gc = abs(q) - vec2(coarse * .5);
  float ring = abs(max(gc.x, gc.y));
  col += warm * .25 * (1. - smoothstep(0., 1.4, ring)) * smoothstep(20., 80., coarse) * (1. - vis);
  o = vec4(col, 1.);
}`, { scale: 1 });

const ui = document.getElementById('ui');
ui.innerHTML = '<div class="gauge"><span>第</span><b id="lv">0</b><span>层</span></div><p class="tip" id="tip">一直往下滚</p>';
const lv = document.getElementById('lv');
const tip = document.getElementById('tip');
scrub({
  max: 40,
  onFrame({ t, depth }) {
    const z = depth * 1.15 + 0.15;
    gl.set('uT', t);
    gl.set('uZ', z);
    gl.draw();
    lv.textContent = Math.floor(z);
    tip.style.opacity = depth > 0.3 ? 0 : 1;
  },
});
