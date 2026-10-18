/* ─────────────────────────────────────────────────────────────
 背景：像素化的流光（沿用 drift/light.js 的着色器）。屏幕被两条 14° 的斜缝分成三个区：
 随笔 · 瞬间 · 项目，各自一套调色板与质感。

 漫游时只有一个区：另两条缝被推到屏幕外，那个场景的光铺满全屏。
 检索时两条缝滑进来，三种光并排。换场景 = 缝扫过屏幕。
 主页（首屏）时还没分开：三种夜色只是一池池浮在第四种夜色（主页的靛夜）里，各自偏在它将来那一栏的方向；
   往下走时那根线转过来、劈成两条缝，池子被缝收拢成三栏（uSplit 0 → 1）。
 缝的几何由 wander.js 每帧给：每条缝一个支点 + 共用的法向（于是缝可以转，主页那根线就是转了 90° 的缝）。

 随笔区多一阵「风」：那片光的采样空间沿 14° 缓缓流走、并被拉长成流痕。?wind=0 关掉。

 醒 / 梦：两套调色板（梦是原来那一套，醒偏冷、偏灰），由 wander.js 按换面进度混好再传进来。
 入梦检验的塌缩圈也画在这里：圈里按块取级别（同 ring.ts 的级别函数），级别越高采样格越粗、越暗一点——
   整片光就在圈里粗成像素，再一级级解析回来。
 ───────────────────────────────────────────────────────────── */

/* 场景调色板（sRGB 0–1）：底 · 中 · 光带 · 亮芯；顺序 = 随笔 · 瞬间 · 项目 · 主页 */
const ORDER = ['essay', 'moment', 'project', 'home'];
const DREAM = {
  essay: [[0.78, 0.82, 0.88], [0.68, 0.73, 0.82], [0.84, 0.87, 0.92], [0.9, 0.9, 0.9]],
  moment: [[0.11, 0.09, 0.17], [0.23, 0.17, 0.3], [0.52, 0.33, 0.41], [0.88, 0.63, 0.43]],
  project: [[0.05, 0.08, 0.14], [0.1, 0.17, 0.27], [0.22, 0.42, 0.5], [0.62, 0.8, 0.84]],
  home: [[0.055, 0.06, 0.12], [0.12, 0.12, 0.23], [0.29, 0.27, 0.44], [0.8, 0.72, 0.78]],
};
const WAKE = {
  essay: [[0.8, 0.82, 0.85], [0.71, 0.74, 0.79], [0.86, 0.87, 0.89], [0.92, 0.92, 0.92]],
  moment: [[0.1, 0.1, 0.14], [0.2, 0.19, 0.25], [0.4, 0.36, 0.42], [0.76, 0.68, 0.62]],
  project: [[0.06, 0.08, 0.11], [0.11, 0.15, 0.21], [0.24, 0.34, 0.4], [0.62, 0.72, 0.76]],
  home: [[0.065, 0.072, 0.1], [0.13, 0.14, 0.19], [0.28, 0.3, 0.36], [0.72, 0.74, 0.78]],
};
/* 抖动强度 · 亮芯强度 · 量化阶数（浅底上满强度的抖动像网点印刷） */
const GRAIN = { essay: [0.42, 0.16, 40], moment: [1, 0.38, 26], project: [1, 0.38, 26], home: [1, 0.3, 26] };

const VERT = `#version 300 es
in vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uPan;
uniform float uZoom;
uniform vec2 uMouse;
uniform float uDim;
uniform vec4 uSeamP;  // 两条缝的支点（画布 px，y 朝下）
uniform vec2 uSeamN;  // 缝的法向（单位向量，y 朝下；指向「后一区」）
uniform float uTan;
uniform float uWind;
uniform float uSplit; // 0 = 主页（池），1 = 按缝分区
uniform float uBias[3]; // 主页：悬停的那一种夜色池子涨起来
uniform vec4 uRing;   // 塌缩圈：x, y, r（画布 px，y 朝下）, shift
uniform float uRingStep;
uniform vec3 uP[16];  // 4 区 × 4 色
uniform vec3 uG[4];
uniform float uLift[3];
out vec4 o;

float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), u.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p){
  float a = 0.5, s = 0.0;
  mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 4; i++){ s += a * vnoise(p); p = r * p * 2.03 + 11.7; a *= 0.5; }
  return s;
}
float field(vec2 p, float t){
  vec2 q = vec2(fbm(p + vec2(0.0, t * 0.05)), fbm(p + vec2(5.2, 1.3) - t * 0.04));
  vec2 r = vec2(fbm(p + 2.0 * q + vec2(1.7, 9.2) + t * 0.03), fbm(p + 2.0 * q + vec2(8.3, 2.8) - t * 0.025));
  return fbm(p + 1.9 * r);
}
float bayer(vec2 p){
  ivec2 i = ivec2(mod(p, 4.0));
  int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(m[i.y * 4 + i.x]) + 0.5) / 16.0;
}

/* 流光的明暗值（量化之前，0–1）；wind = 随笔区的风 */
float flowV(vec2 fc, bool wind){
  vec2 uv = (fc - 0.5 * uRes) / uRes.y;
  vec2 pan = vec2(uPan.x, -uPan.y);
  float t = uTime;
  if (wind) {
    vec2 d = normalize(vec2(1.0, uTan));
    vec2 n = vec2(-d.y, d.x);
    uv = d * dot(uv, d) * 0.55 + n * dot(uv, n);
    pan += d * t * 0.05 * uWind;
  }
  float z = uZoom * 0.42;
  float s = fract(z);
  float k = floor(z);
  vec2 oa = vec2(h21(vec2(k, 1.0)), h21(vec2(k, 7.0))) * 40.0;
  vec2 ob = vec2(h21(vec2(k + 1.0, 1.0)), h21(vec2(k + 1.0, 7.0))) * 40.0;
  float base = 0.72;
  float a = field(uv * base * exp2(-s) + pan + oa, t);
  float b = field(uv * base * exp2(1.0 - s) + pan * 2.0 + ob, t);
  float v = mix(a, b, smoothstep(0.0, 1.0, s));
  return clamp((v - 0.3) / 0.42, 0.0, 1.0);
}

/* 第 r 区按明暗值 v 上色 */
vec3 colorize(int r, float v, vec2 fc){
  vec3 c0 = uP[r * 4], c1 = uP[r * 4 + 1], c2 = uP[r * 4 + 2], c3 = uP[r * 4 + 3];
  vec3 gr = uG[r];
  vec3 col = mix(c0, c1, smoothstep(0.08, 0.5, v));
  col = mix(col, c2, smoothstep(0.5, 0.86, v));
  float band = smoothstep(0.6, 0.74, v) * (1.0 - smoothstep(0.78, 0.94, v));
  col += c3 * band * 0.58 * gr.y;
  col = mix(col, c3, smoothstep(0.84, 1.0, v) * gr.y);
  vec2 uv = (fc - 0.5 * uRes) / uRes.y;
  vec2 mo = (uMouse - 0.5 * uRes) / uRes.y;
  float dd = length(uv - mo);
  col += c3 * 0.06 * exp(-dd * dd * 7.0);
  if (r < 3) col += c3 * 0.05 * uLift[r];
  if (r == 0 && uWind > 0.0) {
    // 风痕：沿 14° 拉得很长、横向很窄的亮纹，顺风很快地流走；一阵一阵的（gust）
    float t = uTime;
    vec2 d = normalize(vec2(1.0, uTan));
    vec2 n = vec2(-d.y, d.x);
    float al = dot(uv, d);
    float ac = dot(uv, n);
    float s1 = vnoise(vec2(al * 1.6 - t * 0.55, ac * 34.0));
    float s2 = vnoise(vec2(al * 0.9 - t * 0.32 + 7.0, ac * 19.0 + 3.0));
    float gust = 0.35 + 0.65 * smoothstep(0.2, 0.9, 0.5 + 0.5 * sin(t * 0.42 - al * 1.7));
    float st = smoothstep(0.7, 0.96, s1) * 0.8 + smoothstep(0.76, 0.98, s2) * 0.55;
    col = mix(col, vec3(1.0, 0.99, 0.97), st * 0.42 * gust * uWind);
  }
  return min(col, max(c3 * 1.02, vec3(0.97)));
}

/* 主页的池：三种夜色各自浮成一池池的，偏在它将来那一栏的方向。
   字不靠池子让路：字自己按底下的明暗换墨（wander.js 的 ink） */
vec4 poolW(vec2 fc){
  vec2 uv = (fc - 0.5 * uRes) / uRes.y;
  float t = uTime;
  float ax = 0.5 * uRes.x / uRes.y; // 半屏宽（uv）
  vec3 w;
  for (int r = 0; r < 3; r++) {
    float fr = float(r);
    float cx = (fr - 1.0) * ax * 0.72;
    float prior = exp(-pow((uv.x - cx) / (ax * 0.5), 2.0));
    float n = fbm(uv * 1.15 + vec2(fr * 7.3, fr * 3.1) + vec2(t * 0.012 * (fr - 1.0), t * 0.009));
    n += 0.16 * (prior - 0.55) + 0.1 * uBias[r];
    w[r] = smoothstep(0.5, 0.64, n) * (0.78 + 0.22 * uBias[r]);
  }
  float s = w.x + w.y + w.z;
  if (s > 1.0) w /= s;
  return vec4(w, 1.0 - min(1.0, s));
}

void main(){
  vec2 fc0 = gl_FragCoord.xy;
  vec2 ys0 = vec2(fc0.x, uRes.y - fc0.y);
  // 塌缩圈：按 8×8 的块取级别，级别越高采样格越粗（1 / 2 / 4 / 8 画布 px）
  float L = 0.0;
  vec2 fc = fc0;
  if (uRing.z > 0.0) {
    vec2 blk = floor(ys0 / 8.0);
    float d = length((blk + 0.5) * 8.0 - uRing.xy);
    L = clamp(floor(min((uRing.z - d) / uRingStep, 4.0) + bayer(blk) - uRing.w), 0.0, 4.0);
    if (L >= 2.0) {
      float cs = exp2(L - 1.0);
      vec2 cell = (floor(ys0 / cs) + 0.5) * cs;
      fc = vec2(cell.x, uRes.y - cell.y);
    }
  }
  vec2 ys = vec2(fc.x, uRes.y - fc.y);

  // 分区：这一格落在缝「后一侧」的比例，缝上那一格按覆盖量混两边
  float k1 = clamp(dot(ys - uSeamP.xy, uSeamN) + 0.5, 0.0, 1.0);
  float k2 = clamp(dot(ys - uSeamP.zw, uSeamN) + 0.5, 0.0, 1.0);
  vec4 w = vec4(1.0 - k1, max(0.0, k1 - k2), k2, 0.0);
  if (uSplit < 0.999) w = mix(poolW(fc), w, uSplit);

  float vp = flowV(fc, false);
  vec3 col = vec3(0.0);
  vec3 gr = vec3(0.0);
  if (w.x > 0.0) { col += w.x * colorize(0, uWind > 0.0 ? flowV(fc, true) : vp, fc); gr += w.x * uG[0]; }
  if (w.y > 0.0) { col += w.y * colorize(1, vp, fc); gr += w.y * uG[1]; }
  if (w.z > 0.0) { col += w.z * colorize(2, vp, fc); gr += w.z * uG[2]; }
  if (w.w > 0.0) { col += w.w * colorize(3, vp, fc); gr += w.w * uG[3]; }
  col *= 1.0 - uDim * 0.42;
  col *= 1.0 - 0.055 * L;

  float Lq = gr.z;
  col = floor(col * Lq + 0.5 + (bayer(fc0) - 0.5) * gr.x) / Lq;
  o = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

export function createLight(canvas, PX, { wind = true } = {}) {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: true });
  if (!gl) {
    canvas.classList.add('no-gl');
    return null;
  }
  const sh = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = (n) => gl.getUniformLocation(prog, n);
  const u = {};
  for (const n of ['uRes', 'uTime', 'uPan', 'uZoom', 'uMouse', 'uDim', 'uSeamP', 'uSeamN', 'uTan', 'uWind', 'uSplit', 'uBias', 'uRing', 'uRingStep', 'uP', 'uG', 'uLift']) u[n] = U(n);

  const flat = (set) => ORDER.flatMap((s) => set[s].flat());
  const PD = flat(DREAM);
  const PW = flat(WAKE);
  const pal = new Float32Array(PD.length);
  let lastFace = -1;
  function setFace(f) {
    // f：醒度 0（梦）→ 1（醒）
    if (Math.abs(f - lastFace) < 0.002) return;
    lastFace = f;
    for (let i = 0; i < pal.length; i++) pal[i] = PD[i] + (PW[i] - PD[i]) * f;
    gl.uniform3fv(u.uP, pal);
  }
  setFace(0);
  gl.uniform3fv(u.uG, new Float32Array(ORDER.flatMap((s) => GRAIN[s])));
  gl.uniform1f(u.uTan, Math.tan((14 * Math.PI) / 180));
  gl.uniform1f(u.uWind, wind ? 1 : 0);

  function resize() {
    canvas.width = Math.ceil(innerWidth / PX);
    canvas.height = Math.ceil(innerHeight / PX);
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  resize();

  return {
    resize,
    ORDER,
    /* seam：{ p: [[x, y], [x, y]]（视口 px）, n: [nx, ny] }；split：0 主页 → 1 分区；bias：[3]；
       ring：{ x, y, r, shift, step }（视口 px）或 null；face：醒度 0–1 */
    draw({ t, pan, zoom, mouse, dim, seam, split = 1, bias, lift, ring, face = 0 }) {
      setFace(face);
      gl.uniform2f(u.uRes, canvas.width, canvas.height);
      gl.uniform1f(u.uTime, t);
      gl.uniform2f(u.uPan, pan.x, pan.y);
      gl.uniform1f(u.uZoom, zoom);
      gl.uniform2f(u.uMouse, mouse.x / PX, canvas.height - mouse.y / PX);
      gl.uniform1f(u.uDim, dim);
      gl.uniform4f(u.uSeamP, seam.p[0][0] / PX, seam.p[0][1] / PX, seam.p[1][0] / PX, seam.p[1][1] / PX);
      gl.uniform2f(u.uSeamN, seam.n[0], seam.n[1]);
      gl.uniform1f(u.uSplit, split);
      gl.uniform1fv(u.uBias, new Float32Array(bias || [0, 0, 0]));
      if (ring && ring.r > 0) {
        gl.uniform4f(u.uRing, ring.x / PX, ring.y / PX, ring.r / PX, ring.shift);
        gl.uniform1f(u.uRingStep, ring.step / PX);
      } else gl.uniform4f(u.uRing, 0, 0, 0, 0);
      gl.uniform1fv(u.uLift, new Float32Array(lift || [0, 0, 0]));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
  };
}
