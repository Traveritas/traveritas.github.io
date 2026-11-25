/* ─────────────────────────────────────────────────────────────
   地面与物 · 一张画布画全站

   地面：流光场只按「格」算一次（低分辨率纹理，一格一个值），
     · 玻璃外：最近邻取格 + Bayer 抖动 + 量化 → 像素
     · 玻璃里：同一张纹理双线性取 → 平滑、干净
     同一份数据，差别只在「怎么读」。玻璃 = 插值。
   物：晶体是真的几何体，折射的也是这张纹理（双线性），所以晶体里的世界永远是清楚的。

   梦：夜色 + 12fps 步进；醒：昼色 + 平滑时间。换面时两套色板插值。
   ───────────────────────────────────────────────────────────── */

const FIELD_VS = `#version 300 es
in vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

/* 第一遍：每格一个流光值（编码进 rg 两个 8bit，双线性插值仍然线性） */
const FIELD_FS = `#version 300 es
precision highp float;
uniform vec2 uGrid;   // 格数
uniform float uTime;
uniform vec2 uPan;
uniform vec3 uHot;    // 指针 / 悬停的晶体：x, y（格坐标）, 强度
uniform vec2 uHot2;
uniform vec3 uPlace;  // 三处各自的元素：断章 · 风 / 闪念 · 雨 / 造物 · 星尘（0–1）
uniform float uGain;  // 地面整体的起伏（名录、阅读压低一点）
out vec4 o;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(h21(i), h21(i+vec2(1,0)), u.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), u.x), u.y); }
float fbm(vec2 p){ float a = 0.5, s = 0.0; mat2 r = mat2(0.8,-0.6,0.6,0.8);
  for (int i = 0; i < 4; i++){ s += a * vn(p); p = r * p * 2.03 + 11.7; a *= 0.5; } return s; }
void main(){
  vec2 g = gl_FragCoord.xy;
  vec2 uv = (g - 0.5 * uGrid) / uGrid.y + uPan;
  float t = uTime;
  vec2 q = vec2(fbm(uv * 0.9 + vec2(0.0, t * 0.05)), fbm(uv * 0.9 + vec2(5.2, 1.3) - t * 0.04));
  vec2 r = vec2(fbm(uv * 0.9 + 2.0*q + vec2(1.7, 9.2) + t*0.03), fbm(uv * 0.9 + 2.0*q + vec2(8.3, 2.8) - t*0.025));
  float v = fbm(uv * 0.9 + 1.9 * r);
  v = clamp((v - 0.26) / 0.40, 0.0, 1.0);
  // 大尺度的明暗起伏：地面上有亮的地方，也有沉下去的地方
  float big = fbm(uv * 0.32 + vec2(t * 0.006, -t * 0.004) + 3.1);
  v = clamp(v * (0.5 + 0.62 * smoothstep(0.3, 0.75, big)), 0.0, 1.0);
  v *= uGain;
  vec2 uv0 = (g - 0.5 * uGrid) / uGrid.y;
  // 断章 · 风：沿 14° 拉得很长、很窄的亮纹，一阵一阵地流过
  if (uPlace.x > 0.001) {
    vec2 dir = normalize(vec2(1.0, -0.2493));
    vec2 nn = vec2(-dir.y, dir.x);
    float al = dot(uv0, dir), ac = dot(uv0, nn);
    float s1 = vn(vec2(al * 1.4 - t * 0.5, ac * 38.0));
    float s2 = vn(vec2(al * 0.8 - t * 0.3 + 7.0, ac * 21.0 + 3.0));
    float gust = 0.35 + 0.65 * smoothstep(0.2, 0.9, 0.5 + 0.5 * sin(t * 0.4 - al * 1.6));
    float st = smoothstep(0.72, 0.96, s1) * 0.8 + smoothstep(0.78, 0.98, s2) * 0.5;
    v = mix(v, 1.0, st * 0.55 * gust * uPlace.x);
  }
  // 闪念 · 细雨：偏 14° 从下往上升的短线，稀、慢；亮头在上，尾巴往下淡
  if (uPlace.y > 0.001) {
    float x = uv0.x + uv0.y * 0.2493;
    float col = floor(x * 80.0);
    float h = h21(vec2(col, 3.7));
    float on = step(0.9, h);
    float p = fract(uv0.y * 0.55 - t * (0.12 + h * 0.12) + h * 13.0);
    float dash = smoothstep(0.0, 0.07, p) * (1.0 - smoothstep(0.07, 0.078, p));
    float lane = 1.0 - smoothstep(0.0, 0.35, abs(fract(x * 80.0) - 0.5));
    v = mix(v, 1.0, dash * lane * on * uPlace.y * 0.9);
  }
  // 造物 · 星尘：三层，远的小、暗、慢，近的大、亮、快（滚动时近的也挪得多）；只很轻地呼吸，不闪
  if (uPlace.z > 0.001) {
    float dust = 0.0;
    for (int l = 0; l < 3; l++) {
      float fl = float(l);
      float n = mix(5.0, 14.0, fl * 0.5);          // 一颗星占的格（越近越疏）
      float rr = mix(0.55, 1.45, fl * 0.5);        // 星的半径（格）
      float sp = mix(0.12, 0.7, fl * 0.5);         // 漂移速度（格 / 秒）
      float par = mix(0.25, 1.0, fl * 0.5);        // 视差
      vec2 q = g + vec2(t * sp, t * sp * 0.22) + uPan * uGrid.y * par + fl * 37.0;
      vec2 cell = floor(q / n);
      float hh = h21(cell + fl * 11.3);
      if (hh < mix(0.8, 0.9, fl * 0.5)) continue;
      vec2 at = cell * n + vec2(h21(cell + 4.1), h21(cell + 8.7)) * (n - 2.0) + 1.0;
      vec2 dd = floor(q) + 0.5 - at;
      float inside = step(dot(dd, dd), rr * rr);
      float br = mix(0.5, 0.98, fl * 0.5) * (0.88 + 0.12 * sin(t * 0.5 + hh * 40.0));
      dust = max(dust, inside * br);
    }
    v = max(v, dust * uPlace.z);
  }
  vec2 d = (g - uHot.xy) / uGrid.y;
  v += uHot.z * 0.22 * exp(-dot(d, d) * 18.0);
  vec2 d2 = (g - uHot2) / uGrid.y;
  v += 0.07 * exp(-dot(d2, d2) * 30.0);
  v = clamp(v, 0.0, 1.0);
  float hi = floor(v * 255.0) / 255.0;
  o = vec4(hi, (v - hi) * 255.0, 0.0, 1.0);
}`;

const PAL = `
uniform vec3 uP[4];
vec3 ramp(float v){
  vec3 c = mix(uP[0], uP[1], smoothstep(0.0, 0.42, v));
  c = mix(c, uP[2], smoothstep(0.36, 0.78, v));
  float band = smoothstep(0.58, 0.7, v) * (1.0 - smoothstep(0.74, 0.9, v));
  c += uP[3] * band * 0.18;
  return mix(c, uP[3], smoothstep(0.8, 1.0, v));
}
float dec(vec4 s){ return s.r + s.g / 255.0; }`;

/* 第二遍：整屏合成 */
const COMP_FS = `#version 300 es
precision highp float;
uniform sampler2D uF;
uniform vec2 uRes;     // 画布 px
uniform vec2 uGrid;
uniform float uCell;   // 一格几画布 px
uniform float uCoarse; // 换页时的粗化倍数（1 = 原样）
uniform float uLv;     // 量化阶
uniform float uDay;    // 0 夜 1 昼
uniform float uDpr;
uniform int uN;
uniform vec4 uR[12];   // 玻璃：x, y, w, h（画布 px，y 朝下）
uniform vec4 uRs[12];  // 玻璃：圆角, 显现 0–1, 底色浓度, 0
uniform float uVeil;   // 开屏：地面从夜色里亮起来
${PAL}
out vec4 o;
float bayer(vec2 p){ ivec2 i = ivec2(mod(p, 4.0));
  int m[16] = int[16](0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5); return (float(m[i.y*4+i.x]) + 0.5) / 16.0; }
float sdBox(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
void main(){
  vec2 fc = gl_FragCoord.xy;
  vec2 ys = vec2(fc.x, uRes.y - fc.y);
  // 像素：按（可能粗化过的）格取中心值
  float k = max(1.0, floor(uCoarse + 0.5));
  vec2 cell = floor(fc / (uCell * k));
  vec2 cuv = ((cell + 0.5) * k) / uGrid;
  float v = dec(texture(uF, clamp(cuv, vec2(0.0), vec2(1.0))));
  float lv = uLv;
  float q = floor(v * lv + bayer(cell) - 0.25) / lv;
  vec3 pix = ramp(clamp(q, 0.0, 1.0));
  // 格与格之间留一道极淡的缝，让「格」本身可见
  vec2 inC = fract(fc / (uCell * k));
  float gap = step(inC.x, 1.0 / (uCell * k)) + step(inC.y, 1.0 / (uCell * k));
  pix *= 1.0 - min(gap, 1.0) * mix(0.10, 0.035, uDay);

  vec3 col = pix;
  // 玻璃：同一张纹理的双线性读法
  for (int i = 0; i < 12; i++){
    if (i >= uN) break;
    vec4 R = uR[i]; vec4 S = uRs[i];
    vec2 c = R.xy + R.zw * 0.5;
    float d = sdBox(ys - c, R.zw * 0.5, S.x);
    if (d > 2.0 * uDpr) continue;
    float inside = 1.0 - smoothstep(-0.5, 0.5, d);
    // 玻璃里：平滑值，略微压低起伏，往底色靠一点（为了字）
    vec2 suv = fc / (uCell * uGrid);
    float sv = dec(texture(uF, suv));
    vec3 clear = ramp(sv * 0.6 + 0.1);
    vec3 base = mix(uP[0] * 0.92, vec3(0.975, 0.97, 0.985), uDay);
    clear = mix(clear, base, S.z);
    // 边：顶沿一道亮、底沿一道暗（发丝线，按法向）
    float edge = 1.0 - smoothstep(0.0, 1.0 * uDpr, abs(d + 0.5 * uDpr));
    float ny = (ys.y - c.y) / max(R.w * 0.5, 1.0);
    vec3 rim = mix(vec3(1.0, 0.98, 1.0) * mix(0.75, 1.0, uDay), uP[0] * 0.7, smoothstep(-0.6, 0.9, ny));
    vec3 g = mix(clear, rim, edge * mix(0.55, 0.85, uDay));
    // 内沿一圈很窄的亮（玻璃厚度）
    float lip = (1.0 - smoothstep(0.0, 6.0 * uDpr, -d)) * inside * (1.0 - smoothstep(-0.2, 0.4, ny));
    g += uP[3] * lip * 0.05;
    col = mix(col, g, max(inside, edge) * S.y);
  }
  col = mix(uP[0] * 0.55, col, uVeil);
  o = vec4(col, 1.0);
}`;

/* 第三遍：晶体 */
const XTAL_VS = `#version 300 es
in vec3 aP; in vec3 aB;
uniform mat3 uRot;
uniform vec3 uC;      // 屏上中心（画布 px，y 朝下）, 尺寸（画布 px）
uniform vec2 uRes;
out vec3 vP; out vec3 vB; out vec2 vS;
void main(){
  vec3 p = uRot * aP;
  float persp = 1.0 / (1.0 - p.z * 0.22);
  vec2 s = uC.xy + p.xy * vec2(1.0, -1.0) * uC.z * persp;
  vP = p; vB = aB; vS = s;
  gl_Position = vec4(s.x / uRes.x * 2.0 - 1.0, 1.0 - s.y / uRes.y * 2.0, -p.z * 0.5, 1.0);
}`;

const XTAL_FS = `#version 300 es
precision highp float;
uniform sampler2D uF;
uniform vec2 uRes;
uniform vec2 uGrid;
uniform float uCell;
uniform float uA;      // 显现
uniform vec3 uTint;
uniform float uDay;
uniform float uDpr;
uniform float uGlow;
uniform vec3 uCtr; // 中心（画布 px，y 朝上）, 尺寸
${PAL}
in vec3 vP; in vec3 vB; in vec2 vS;
out vec4 o;
void main(){
  vec3 n = normalize(cross(dFdx(vP), dFdy(vP)));
  if (n.z < 0.0) n = -n;
  vec2 fc = gl_FragCoord.xy;
  // 晶体是一枚放大镜：里面的地面放大、平滑（同一张纹理的双线性读法）
  vec2 lens = uCtr.xy + (fc - uCtr.xy) * 0.5;
  vec2 base = lens / (uCell * uGrid);
  float fr = pow(1.0 - abs(n.z), 2.0);
  // 色散只在掠射的面上出现：越斜，R / B 分得越开
  vec2 off = n.xy * (0.025 + 0.05 * fr);
  float sep = 0.12 + 0.5 * fr;
  float vr = dec(texture(uF, base + off * (1.0 + sep)));
  float vg = dec(texture(uF, base + off));
  float vb = dec(texture(uF, base + off * (1.0 - sep)));
  vec3 c = vec3(ramp(vr).r, ramp(vg).g, ramp(vb).b);
  // 透：身子里基本是放大后的地面本身，只提一点亮
  // 昼：底子本来就亮，玻璃要往暗里收，靠暗的棱与面差显形
  c = mix(c * 1.18 + uP[1] * 0.12, c * 0.8 - 0.06, uDay);
  // 每个面各自接住的光不一样多（晶体感来自面与面的明暗差，而不是颜色）
  float fh = fract(sin(dot(floor(n * 9.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  // 里面反射上来的一点光：往反方向取一段，按亮的那头读
  float vi = dec(texture(uF, base - n.xy * 0.16));
  vec3 inner = mix(uP[2], uP[3], vi) * uTint;
  c += inner * (0.1 + 0.22 * fh) * (1.0 - fr) * (1.0 - 0.75 * uDay);
  c -= vec3(0.06) * fh * uDay;
  vec3 L = normalize(vec3(-0.45, 0.7, 0.55));
  float lam = dot(n, L);
  c += uTint * 0.16 * max(lam, 0.0) - vec3(0.05) * max(-lam, 0.0);
  c += uP[3] * uGlow * 0.12;
  // 掠射处一圈带色的亮（颜色只在边上）
  c = mix(c, mix(mix(vec3(1.0), uTint, 0.45), uP[0] * uTint * 0.75, uDay), fr * mix(0.62, 0.5, uDay));
  float sp = pow(max(dot(reflect(-L, n), vec3(0, 0, 1)), 0.0), 56.0);
  c += sp * mix(0.7, 0.45, uDay);
  vec3 w = fwidth(vB);
  vec3 e = smoothstep(vec3(0.0), w * 1.1, vB);
  float edge = 1.0 - min(min(e.x, e.y), e.z);
  c = mix(c, mix(mix(vec3(1.0), uTint, 0.3), uP[0] * 0.38, uDay), edge * mix(0.82, 0.95, uDay));
  c = min(c, vec3(1.0));
  o = vec4(c * uA, uA);
}`;

function sh(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) + '\n' + src);
  return s;
}
function prog(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, sh(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, sh(gl, gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(p, 0, 'p');
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const name = gl.getActiveUniform(p, i).name.replace(/\[0\]$/, '');
    u[name] = gl.getUniformLocation(p, name);
  }
  return { p, u };
}

/* ── 晶体几何：都摊成不共享顶点的三角形，附重心坐标 ── */
function flatten(tris) {
  const P = [], B = [];
  for (const [a, b, c] of tris) {
    P.push(...a, ...b, ...c);
    B.push(1, 0, 0, 0, 1, 0, 0, 0, 1);
  }
  return { P: new Float32Array(P), B: new Float32Array(B), n: tris.length * 3 };
}
const norm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };

/* 三轴星：±x ±y ±z 六支菱形尖锥，一体 */
export function starMesh(len = 1, w = 0.2) {
  const tris = [];
  const axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let a = 0; a < 3; a++) for (const s of [1, -1]) {
    const ax = axes[a].map((x) => x * s);
    const u = axes[(a + 1) % 3], v = axes[(a + 2) % 3];
    const tip = ax.map((x) => x * len);
    // 底：轴向 45° 的菱形，四角在相邻两轴上
    const q = [u, v, u.map((x) => -x), v.map((x) => -x)].map((d) => d.map((x) => x * w));
    for (let i = 0; i < 4; i++) {
      const p0 = q[i], p1 = q[(i + 1) % 4];
      tris.push(s > 0 ? [tip, p0, p1] : [tip, p1, p0]);
    }
  }
  return flatten(tris);
}
/* 双锥（n 边，上下不等长）：随笔 */
export function bipyramid(n = 6, top = 1, bot = 0.8, r = 0.42) {
  const tris = [];
  const ring = [];
  for (let i = 0; i < n; i++) { const t = (i / n) * Math.PI * 2; ring.push([Math.cos(t) * r, 0, Math.sin(t) * r]); }
  for (let i = 0; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % n];
    tris.push([[0, top, 0], b, a]);
    tris.push([[0, -bot, 0], a, b]);
  }
  return flatten(tris);
}
/* 被敲过的二十面体：瞬间 */
export function shard(seed = 3) {
  const t = (1 + Math.sqrt(5)) / 2;
  let V = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map(norm);
  const F = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  V = V.map((v) => v.map((x) => x * (0.82 + rnd() * 0.3)));
  V = V.map(([x, y, z]) => [x * 0.8, y * 1.1, z * 0.8]);
  return flatten(F.map((f) => f.map((i) => V[i])));
}
/* 立在角上的立方体：项目 */
export function cube() {
  const v = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) v.push([x * 0.55, y * 0.55, z * 0.55]);
  const F = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]];
  const tris = [];
  for (const [a, b, c, d] of F) { tris.push([v[a], v[b], v[c]]); tris.push([v[a], v[c], v[d]]); }
  // 立在角上：把 (1,1,1) 转到 y 轴
  const ax = norm([1, 0, -1]), ang = Math.acos(1 / Math.sqrt(3));
  const R = rotAxis(ax, ang);
  return flatten(tris.map((t) => t.map((p) => mul(R, p))));
}
/* 立方体里每个三角形都是两半拼的，对角线那条棱要去掉：重心坐标里把对角那一维置大 */
export function cubeClean() {
  const m = cube();
  for (let i = 0; i < m.n; i += 3) {
    // 每个四边形拆成 (a,b,c)(a,c,d)：两个三角形共用 a-c 边。a-c 边对着 b（第一个）/ d（第二个）
    const tri = (i / 3) % 2;
    const opp = tri === 0 ? 1 : 2; // 对角线所对的顶点下标
    for (let k = 0; k < 3; k++) m.B[(i + k) * 3 + opp] = 1;
  }
  return m;
}
function rotAxis([x, y, z], a) {
  const c = Math.cos(a), s = Math.sin(a), t = 1 - c;
  return [t * x * x + c, t * x * y - s * z, t * x * z + s * y, t * x * y + s * z, t * y * y + c, t * y * z - s * x, t * x * z - s * y, t * y * z + s * x, t * z * z + c];
}
const mul = (m, [x, y, z]) => [m[0] * x + m[1] * y + m[2] * z, m[3] * x + m[4] * y + m[5] * z, m[6] * x + m[7] * y + m[8] * z];
export function euler(rx, ry, rz) {
  const X = rotAxis([1, 0, 0], rx), Y = rotAxis([0, 1, 0], ry), Z = rotAxis([0, 0, 1], rz);
  const mm = (A, B) => {
    const r = new Array(9);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j];
    return r;
  };
  return mm(Z, mm(X, Y));
}

/* 色板（sRGB 0–1）：底 · 中 · 光带 · 亮芯 */
export const NIGHT = [[0.045, 0.047, 0.1], [0.125, 0.12, 0.25], [0.31, 0.275, 0.46], [0.88, 0.79, 0.88]];
export const DAY = [[0.68, 0.69, 0.785], [0.8, 0.795, 0.865], [0.885, 0.865, 0.915], [0.965, 0.95, 0.97]];

export function createGround(canvas) {
  const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, premultipliedAlpha: true });
  if (!gl) throw new Error('webgl2');
  const P1 = prog(gl, FIELD_VS, FIELD_FS);
  const P2 = prog(gl, FIELD_VS, COMP_FS);
  const P3 = prog(gl, XTAL_VS, XTAL_FS);
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

  const tex = gl.createTexture();
  const fb = gl.createFramebuffer();
  let gw = 0, gh = 0;

  const meshes = new Map();
  function mesh(name, m) {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    for (const [attr, arr] of [['aP', m.P], ['aB', m.B]]) {
      const b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(P3.p, attr);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0);
    }
    gl.bindVertexArray(null);
    meshes.set(name, { vao, n: m.n });
  }

  const S = { dpr: 1, cell: 4 };
  function resize() {
    S.dpr = Math.min(devicePixelRatio || 1, 2);
    const W = Math.round(innerWidth * S.dpr), H = Math.round(innerHeight * S.dpr);
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    S.cellPx = Math.max(2, Math.round(S.cell * S.dpr));
    const nw = Math.ceil(W / S.cellPx) + 1, nh = Math.ceil(H / S.cellPx) + 1;
    if (nw !== gw || nh !== gh) {
      gw = nw; gh = nh;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gw, gh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
  }

  const pal = new Float32Array(12);
  /* f: { time, pan:[x,y], hot:[x,y,k] (css px), mouse:[x,y], day, coarse, glass:[{x,y,w,h,r,a,fill}], crystals:[{mesh,x,y,size,rot,a,tint,glow}] } */
  function draw(f) {
    resize();
    const W = canvas.width, H = canvas.height, d = S.dpr, cp = S.cellPx;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) pal[i * 3 + j] = NIGHT[i][j] + (DAY[i][j] - NIGHT[i][j]) * f.day;

    // 1. 场
    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.viewport(0, 0, gw, gh);
    gl.useProgram(P1.p);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2f(P1.u.uGrid, gw, gh);
    gl.uniform1f(P1.u.uTime, f.time);
    gl.uniform2f(P1.u.uPan, f.pan[0], f.pan[1]);
    gl.uniform3f(P1.u.uHot, (f.hot[0] * d) / cp, gh - (f.hot[1] * d) / cp, f.hot[2]);
    gl.uniform2f(P1.u.uHot2, (f.mouse[0] * d) / cp, gh - (f.mouse[1] * d) / cp);
    gl.uniform3fv(P1.u.uPlace, f.place);
    gl.uniform1f(P1.u.uGain, f.gain);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // 2. 合成
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.useProgram(P2.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(P2.u.uF, 0);
    gl.uniform2f(P2.u.uRes, W, H);
    gl.uniform2f(P2.u.uGrid, gw, gh);
    gl.uniform1f(P2.u.uCell, cp);
    gl.uniform1f(P2.u.uCoarse, f.coarse);
    gl.uniform1f(P2.u.uLv, 7 + f.day * 3);
    gl.uniform1f(P2.u.uDay, f.day);
    gl.uniform1f(P2.u.uDpr, d);
    gl.uniform3fv(P2.u.uP, pal);
    gl.uniform1f(P2.u.uVeil, f.veil);
    const gs = f.glass.slice(0, 12);
    const R = new Float32Array(48), Rs = new Float32Array(48);
    gs.forEach((g, i) => {
      R.set([g.x * d, g.y * d, g.w * d, g.h * d], i * 4);
      Rs.set([(g.r ?? 2) * d, g.a ?? 1, g.fill ?? 0.6, 0], i * 4);
    });
    gl.uniform1i(P2.u.uN, gs.length);
    gl.uniform4fv(P2.u.uR, R);
    gl.uniform4fv(P2.u.uRs, Rs);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // 3. 晶体
    if (f.crystals.length) {
      gl.enable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(P3.p);
      gl.uniform1i(P3.u.uF, 0);
      gl.uniform2f(P3.u.uRes, W, H);
      gl.uniform2f(P3.u.uGrid, gw, gh);
      gl.uniform1f(P3.u.uCell, cp);
      gl.uniform1f(P3.u.uDay, f.day);
      gl.uniform1f(P3.u.uDpr, d);
      gl.uniform3fv(P3.u.uP, pal);
      for (const c of f.crystals) {
        if (c.a < 0.004 || c.size < 0.5) continue;
        const m = meshes.get(c.mesh);
        if (!m) continue;
        gl.clear(gl.DEPTH_BUFFER_BIT);
        gl.uniformMatrix3fv(P3.u.uRot, true, c.rot);
        gl.uniform3f(P3.u.uC, c.x * d, c.y * d, c.size * d);
        gl.uniform3f(P3.u.uCtr, c.x * d, H - c.y * d, c.size * d);
        gl.uniform1f(P3.u.uA, c.a);
        gl.uniform3fv(P3.u.uTint, c.tint);
        gl.uniform1f(P3.u.uGlow, c.glow || 0);
        gl.bindVertexArray(m.vao);
        gl.drawArrays(gl.TRIANGLES, 0, m.n);
      }
      gl.bindVertexArray(null);
    }
  }

  return { draw, mesh, state: S };
}
