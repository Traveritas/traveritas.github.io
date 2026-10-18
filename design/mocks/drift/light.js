/* ─────────────────────────────────────────────────────────────
   背景：像素化的流光。
   WebGL2 片元着色器，画布只有视口的 1/PX 大，CSS 用 pixelated 放大——
   流光本身是 domain-warped fbm，按场景的四色梯度上色，再量化并做 4×4 Bayer 抖动：
   远看是柔的光，近看是一格格的抖动像素。
   推拉镜头时用两个八度交叉淡化，光可以无限往里推。

   和镜头怎么联动由 drift.js 决定（?bg=），这里只收结果：
     uPan   背景的平移（uv 单位）
     uStir  搅动：拖动速度的平滑值（uv/秒）。越快，光沿拖动方向被拉长、被搅乱
     uFlow  搅动的累积位移：流痕顺着拖过的方向漂走
   ───────────────────────────────────────────────────────────── */
(() => {
  'use strict';

  /* 场景调色板（sRGB 0–1）：底 · 中 · 光带 · 亮芯 */
  const PALETTES = {
    essay: [[0.78, 0.82, 0.88], [0.68, 0.73, 0.82], [0.84, 0.87, 0.92], [0.9, 0.9, 0.9]],
    moment: [[0.11, 0.09, 0.17], [0.23, 0.17, 0.3], [0.52, 0.33, 0.41], [0.88, 0.63, 0.43]],
    project: [[0.05, 0.08, 0.14], [0.1, 0.17, 0.27], [0.22, 0.42, 0.5], [0.62, 0.8, 0.84]],
  };
  /* 场景的质感参数：抖动强度 · 亮芯强度 · 量化阶数。
     浅色底上满强度的抖动像网点印刷，所以随笔减半抖动、加多阶数、亮芯收住 */
  const GRAIN = {
    essay: [0.42, 0.16, 40],
    moment: [1, 0.38, 26],
    project: [1, 0.38, 26],
  };

  const VERT = `#version 300 es
  in vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

  const FRAG = `#version 300 es
  precision highp float;
  uniform vec2 uRes;
  uniform float uTime;
  uniform vec2 uPan;
  uniform float uZoom;
  uniform vec2 uStir;
  uniform vec2 uFlow;
  uniform vec2 uMouse;
  uniform float uMix;
  uniform float uDim;
  uniform vec3 uGrain;
  uniform vec3 uA[4];
  uniform vec3 uB[4];
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
  /* d：搅动方向，m：搅动强度（0 = 平静） */
  float field(vec2 p, float t, vec2 d, float m){
    // 沿拖动方向把空间压扁 → 纹理沿该方向被拉长成流痕
    p -= d * dot(p, d) * 0.62 * m;
    vec2 q = vec2(fbm(p + vec2(0.0, t * 0.05)), fbm(p + vec2(5.2, 1.3) - t * 0.04));
    // 搅乱：高一档频率的扰动叠进 warp，并顺着方向推一把
    vec2 tur = vec2(fbm(p * 2.6 + t * 0.6), fbm(p * 2.6 + vec2(3.1, 7.7) - t * 0.6)) - 0.45;
    q += tur * 0.9 * m + d * m * 0.5;
    vec2 r = vec2(fbm(p + 2.0 * q + vec2(1.7, 9.2) + t * 0.03), fbm(p + 2.0 * q + vec2(8.3, 2.8) - t * 0.025));
    return fbm(p + 1.9 * r);
  }
  vec3 pal(int i){ return mix(uA[i], uB[i], uMix); }
  vec3 ramp(float v){
    vec3 c = mix(pal(0), pal(1), smoothstep(0.08, 0.5, v));
    c = mix(c, pal(2), smoothstep(0.5, 0.86, v));
    return c;
  }
  float bayer(vec2 p){
    ivec2 i = ivec2(mod(p, 4.0));
    int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
    return (float(m[i.y * 4 + i.x]) + 0.5) / 16.0;
  }

  void main(){
    vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
    vec2 pan = vec2(uPan.x, -uPan.y) + vec2(uFlow.x, -uFlow.y);
    float ms = length(uStir);
    vec2 d = ms > 1e-4 ? vec2(uStir.x, -uStir.y) / ms : vec2(0.0);
    float m = clamp(ms * 1.4, 0.0, 1.4);
    float z = uZoom * 0.42;
    float s = fract(z);
    float k = floor(z);
    vec2 oa = vec2(h21(vec2(k, 1.0)), h21(vec2(k, 7.0))) * 40.0;
    vec2 ob = vec2(h21(vec2(k + 1.0, 1.0)), h21(vec2(k + 1.0, 7.0))) * 40.0;
    float base = 0.72;
    float a = field(uv * base * exp2(-s) + pan + oa, uTime, d, m);
    float b = field(uv * base * exp2(1.0 - s) + pan * 2.0 + ob, uTime, d, m);
    float v = mix(a, b, smoothstep(0.0, 1.0, s));
    v = clamp((v - 0.3) / 0.42, 0.0, 1.0); // fbm 大多落在中段，拉开后光带才出得来

    vec3 col = ramp(v);
    // 光带：值落在一条窄带里的地方更亮，像光从雾里透出来
    float band = smoothstep(0.6, 0.74, v) * (1.0 - smoothstep(0.78, 0.94, v));
    col += pal(3) * band * 0.58 * uGrain.y; // 光带强度跟亮芯一起按场景收
    float core = smoothstep(0.84, 1.0, v);
    col = mix(col, pal(3), core * uGrain.y);
    // 光标附近的一点余温
    vec2 mo = (uMouse - 0.5 * uRes) / uRes.y;
    float dd = length(uv - mo);
    col += pal(3) * 0.06 * exp(-dd * dd * 7.0);
    col = min(col, pal(3) * 1.02); // 不让亮芯溢成死白
    col *= 1.0 - uDim * 0.42;

    // 量化 + 4×4 Bayer 抖动（强度按场景）
    float L = uGrain.z;
    col = floor(col * L + 0.5 + (bayer(gl_FragCoord.xy) - 0.5) * uGrain.x) / L;
    o = vec4(clamp(col, 0.0, 1.0), 1.0);
  }`;

  window.DriftLight = function createLight(canvas, PX) {
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
    const u = { res: U('uRes'), time: U('uTime'), pan: U('uPan'), zoom: U('uZoom'), stir: U('uStir'), flow: U('uFlow'), mouse: U('uMouse'), mix: U('uMix'), dim: U('uDim'), grain: U('uGrain'), A: U('uA'), B: U('uB') };

    let from = 'essay';
    let to = 'essay';
    let mix = 1;
    const flat = (name) => new Float32Array(PALETTES[name].flat());

    function resize() {
      canvas.width = Math.ceil(innerWidth / PX);
      canvas.height = Math.ceil(innerHeight / PX);
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
    resize();

    return {
      resize,
      /* 换场景：调色板从当前插值过去 */
      setScene(name, instant) {
        from = instant ? name : mix >= 1 ? to : from;
        to = name;
        mix = instant ? 1 : 0;
      },
      /* pan / flow：uv 单位；stir：uv/秒 */
      draw({ t, pan, zoom, stir, flow, mouse, dim, dt }) {
        mix = Math.min(1, mix + dt / 900);
        const e = mix * mix * (3 - 2 * mix);
        const g = GRAIN[from].map((v, i) => v + (GRAIN[to][i] - v) * e);
        gl.uniform2f(u.res, canvas.width, canvas.height);
        gl.uniform1f(u.time, t);
        gl.uniform2f(u.pan, pan.x, pan.y);
        gl.uniform1f(u.zoom, zoom);
        gl.uniform2f(u.stir, stir.x, stir.y);
        gl.uniform2f(u.flow, flow.x, flow.y);
        gl.uniform2f(u.mouse, mouse.x / PX, canvas.height - mouse.y / PX);
        gl.uniform1f(u.mix, e);
        gl.uniform1f(u.dim, dim);
        gl.uniform3f(u.grain, g[0], g[1], g[2]);
        gl.uniform3fv(u.A, flat(from));
        gl.uniform3fv(u.B, flat(to));
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      },
    };
  };
})();
