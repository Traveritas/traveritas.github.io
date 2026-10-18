/* ─────────────────────────────────────────────────────────────
 背景：像素化的流光（沿用 drift/light.js 的着色器），多了一件事——
 屏幕被两条 14° 的斜缝分成三个区：随笔 · 瞬间 · 项目，各自一套调色板与质感。

 漫游时只有一个区：另两条缝被推到屏幕外，那个场景的光铺满全屏。
 检索时两条缝滑进来，三种光并排。换场景 = 缝扫过屏幕。
 缝的位置由 wander.js 每帧给（视口 px，在屏幕垂直中点处量），这里只负责按它切。

 随笔区多一阵「风」：那片光的采样空间沿 14° 缓缓流走、并被拉长成流痕——
 空间里没有多出任何东西，只是空气在动。?wind=0 关掉。
 ───────────────────────────────────────────────────────────── */

/* 场景调色板（sRGB 0–1）：底 · 中 · 光带 · 亮芯；区的顺序就是屏上从左到右 */
const ORDER = ['essay', 'moment', 'project'];
const PALETTES = {
  essay: [[0.78, 0.82, 0.88], [0.68, 0.73, 0.82], [0.84, 0.87, 0.92], [0.9, 0.9, 0.9]],
  moment: [[0.11, 0.09, 0.17], [0.23, 0.17, 0.3], [0.52, 0.33, 0.41], [0.88, 0.63, 0.43]],
  project: [[0.05, 0.08, 0.14], [0.1, 0.17, 0.27], [0.22, 0.42, 0.5], [0.62, 0.8, 0.84]],
};
/* 抖动强度 · 亮芯强度 · 量化阶数（浅底上满强度的抖动像网点印刷） */
const GRAIN = { essay: [0.42, 0.16, 40], moment: [1, 0.38, 26], project: [1, 0.38, 26] };

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
uniform vec2 uSeam;   // 两条缝的位置（画布 px）：竖缝是中线处的 x，横缝是中线处的 y
uniform float uHorz;  // 1 = 横缝（窄屏）
uniform float uTan;
uniform float uWind;
uniform vec3 uP[12];  // 3 区 × 4 色
uniform vec3 uG[3];
uniform float uLift[3]; // 检索时各区的悬停提亮
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

/* 第 r 区在这一格的颜色（量化之前） */
vec3 regionCol(int r, vec2 fc){
  vec3 c0 = uP[r * 4], c1 = uP[r * 4 + 1], c2 = uP[r * 4 + 2], c3 = uP[r * 4 + 3];
  vec3 gr = uG[r];
  vec2 uv = (fc - 0.5 * uRes) / uRes.y;
  vec2 pan = vec2(uPan.x, -uPan.y);
  float t = uTime;
  if (r == 0 && uWind > 0.0) {
    // 风：沿 14°（屏上向右、略向上）流，并沿风向拉长
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
  v = clamp((v - 0.3) / 0.42, 0.0, 1.0);

  vec3 col = mix(c0, c1, smoothstep(0.08, 0.5, v));
  col = mix(col, c2, smoothstep(0.5, 0.86, v));
  float band = smoothstep(0.6, 0.74, v) * (1.0 - smoothstep(0.78, 0.94, v));
  col += c3 * band * 0.58 * gr.y;
  col = mix(col, c3, smoothstep(0.84, 1.0, v) * gr.y);
  vec2 mo = (uMouse - 0.5 * uRes) / uRes.y;
  float dd = length(uv - mo);
  col += c3 * 0.06 * exp(-dd * dd * 7.0);
  col += c3 * 0.05 * uLift[r];
  if (r == 0 && uWind > 0.0) {
    // 风痕：沿 14° 拉得很长、横向很窄的亮纹，顺风很快地流走；一阵一阵的（gust），不是匀速的雨
    vec2 d = normalize(vec2(1.0, uTan));
    vec2 n = vec2(-d.y, d.x);
    vec2 u0 = (fc - 0.5 * uRes) / uRes.y;
    float al = dot(u0, d);
    float ac = dot(u0, n);
    float s1 = vnoise(vec2(al * 1.6 - t * 0.55, ac * 34.0));
    float s2 = vnoise(vec2(al * 0.9 - t * 0.32 + 7.0, ac * 19.0 + 3.0));
    float gust = 0.35 + 0.65 * smoothstep(0.2, 0.9, 0.5 + 0.5 * sin(t * 0.42 - al * 1.7));
    float st = smoothstep(0.7, 0.96, s1) * 0.8 + smoothstep(0.76, 0.98, s2) * 0.55;
    col = mix(col, vec3(1.0, 0.99, 0.97), st * 0.42 * gust * uWind);
  }
  return min(col, max(c3 * 1.02, vec3(0.97)));
}

void main(){
  vec2 fc = gl_FragCoord.xy;
  float ys = uRes.y - fc.y;
  // 这一格落在缝右边的比例：缝上那一格按覆盖量混两边，边是利落的，却不是一级级的台阶
  float k1, k2;
  if (uHorz > 0.5) {
    float sl = (fc.x - 0.5 * uRes.x) * uTan; // 横缝向右下倾
    k1 = clamp(ys + 0.5 - (uSeam.x + sl), 0.0, 1.0);
    k2 = clamp(ys + 0.5 - (uSeam.y + sl), 0.0, 1.0);
  } else {
    float sl = (0.5 * uRes.y - ys) * uTan; // 竖缝上端偏右
    k1 = clamp(fc.x + 0.5 - (uSeam.x + sl), 0.0, 1.0);
    k2 = clamp(fc.x + 0.5 - (uSeam.y + sl), 0.0, 1.0);
  }
  float w0 = 1.0 - k1;
  float w2 = k2;
  float w1 = max(0.0, k1 - k2);
  vec3 col = vec3(0.0);
  vec3 gr = vec3(0.0);
  if (w0 > 0.0) { col += w0 * regionCol(0, fc); gr += w0 * uG[0]; }
  if (w1 > 0.0) { col += w1 * regionCol(1, fc); gr += w1 * uG[1]; }
  if (w2 > 0.0) { col += w2 * regionCol(2, fc); gr += w2 * uG[2]; }
  col *= 1.0 - uDim * 0.42;

  float L = gr.z;
  col = floor(col * L + 0.5 + (bayer(fc) - 0.5) * gr.x) / L;
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
  for (const n of ['uRes', 'uTime', 'uPan', 'uZoom', 'uMouse', 'uDim', 'uSeam', 'uHorz', 'uTan', 'uWind', 'uP', 'uG', 'uLift']) u[n] = U(n);

  gl.uniform3fv(u.uP, new Float32Array(ORDER.flatMap((s) => PALETTES[s].flat())));
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
    /* seams：视口 px；horz：横缝；lift：[3] 0–1 */
    draw({ t, pan, zoom, mouse, dim, seams, horz, lift }) {
      gl.uniform2f(u.uRes, canvas.width, canvas.height);
      gl.uniform1f(u.uTime, t);
      gl.uniform2f(u.uPan, pan.x, pan.y);
      gl.uniform1f(u.uZoom, zoom);
      gl.uniform2f(u.uMouse, mouse.x / PX, canvas.height - mouse.y / PX);
      gl.uniform1f(u.uDim, dim);
      gl.uniform2f(u.uSeam, seams[0] / PX, seams[1] / PX);
      gl.uniform1f(u.uHorz, horz ? 1 : 0);
      gl.uniform1fv(u.uLift, new Float32Array(lift || [0, 0, 0]));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
  };
}
