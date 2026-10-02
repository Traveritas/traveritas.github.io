/* ─────────────────────────────────────────────────────────────
   离屏 Worker 的线条绘制后端：主页开屏的线景地形（home-linescape-worker.ts），
   以及全站那条脑电线（eeg-worker.ts）。
   Worker 每帧把画面整理成一张「绘制列表」（Scene）：
   点（视口 CSS px）按折线分组，再按画家顺序列出操作 ——
     · line：描一条折线（实色或以光心为圆心的径向渐变；可只留倒影环带里的那几段；可是擦除；
       可按弧长描成虚线，或只留弧长落在某一段里的部分）
     · band：擦掉一排线以下的一条带（destination-out，近处的山脊遮住远处的线）
     · dot：一粒圆点（实心，或由中心向外线性淡出的光晕）
     · img：把一张整幅的静态位图按给定不透明度铺上去（穹肋：尺寸变化时画一次，之后每帧只贴图）
   两个后端照同一张列表画：
     · WebGL2（首选）：整帧几何一次上传，一条操作一次 drawArrays。原 Canvas 2D 每帧
       在 GPU 进程主线程上把几千个点的长路径逐条三角化，核显上一帧要 50ms 以上、
       把整页的合成也拖住；这里三角化在 Worker 里做（每点两个顶点），GPU 只管画。
       描线的抗锯齿在片元里按到中线的距离算；擦除带与倒影环带的边缘交给 MSAA / 片元软边。
     · Canvas 2D（退路：没有 WebGL2 时）：照列表重放成 Path2D，画面与原实现一致。
   ───────────────────────────────────────────────────────────── */

/* 径向渐变：三个色标（0 / .55 / 1），rgba 未预乘 */
export interface Grad {
  x: number;
  y: number;
  r: number;
  s: [number[], number[], number[]];
}
/* 倒影环带：两枚同心、同转角的椭圆之间（evenodd） */
export interface Ring {
  x: number;
  y: number;
  rot: number;
  ox: number;
  oy: number;
  ix: number;
  iy: number;
}
export type Op =
  /* c ＝ rgba（未预乘，a 已含整体透明度）；out ＝ 擦除；ring ＝ 只画在倒影环带里 */
  | {
      t: 'line';
      p: number;
      w: number;
      c: number[];
      g?: Grad | null;
      ring?: boolean;
      out?: boolean;
      /* 虚线 [实, 空]（CSS px，沿弧长从折线起点量起） */
      dash?: [number, number] | null;
      /* 只留弧长在 [s0, s1] 之间的那一段 */
      win?: [number, number] | null;
    }
  /* 擦除带：折线 p 的每个点沿法向 (nx, ny) 伸出 band，擦到 a */
  | { t: 'band'; p: number; band: number; a: number }
  /* 圆点：soft ＝ 光晕（中心 c、到半径 r 线性淡到 0）；否则实心、边缘抗锯齿 */
  | { t: 'dot'; x: number; y: number; r: number; c: number[]; soft?: boolean }
  /* 整幅静态位图（与画布同像素尺寸，预乘 alpha）：ver 变了才重新上传 */
  | { t: 'img'; src: OffscreenCanvas; ver: number; a: number };

/* 点：x, y, f（f ＝ 0 抬笔跳过 / 1 起笔 / 2 连线）；折线 ＝ 点表里的一段 [o, o + n) */
export class Scene {
  pts = new Float32Array(1 << 15);
  np = 0;
  polys: number[] = []; // o0, n0, o1, n1, …
  ops: Op[] = [];
  ring: Ring | null = null;
  nx = 0;
  ny = 1;
  reset() {
    this.np = 0;
    this.polys.length = 0;
    this.ops.length = 0;
    this.ring = null;
  }
  /** 开一条新折线，返回它的编号 */
  begin(): number {
    this.polys.push(this.np, 0);
    return this.polys.length / 2 - 1;
  }
  add(x: number, y: number, f: number) {
    if (this.np * 3 + 3 > this.pts.length) {
      const a = new Float32Array(this.pts.length * 2);
      a.set(this.pts);
      this.pts = a;
    }
    const i = this.np * 3;
    this.pts[i] = x;
    this.pts[i + 1] = y;
    this.pts[i + 2] = f;
    this.np++;
    this.polys[this.polys.length - 1]++;
  }
}

export interface Backend {
  kind: 'gl' | '2d';
  resize(W: number, H: number, dpr: number): void;
  draw(s: Scene): void;
}

const cl = (v: number) => Math.min(1, Math.max(0, v));

/* ══════════ WebGL2 ══════════ */

const VS_LINE = `#version 300 es
in vec2 aP;
in vec2 aM;
in float aS;
in float aL;
uniform vec2 uRes;
uniform float uHw;
uniform float uDpr;
out vec2 vPos;
out float vD;
out float vL;
void main() {
  vec2 p = aP + aM * (aS * uHw);
  vPos = p;
  vD = aS * uHw * uDpr;
  vL = aL;
  vec2 c = p / uRes * 2.0 - 1.0;
  gl_Position = vec4(c.x, -c.y, 0.0, 1.0);
}`;

/* 覆盖率：中线两侧 uCore（设备 px）全覆盖、外沿 1px 线性收；不足 1 设备像素宽的线画成 1px、按宽度减淡。
   虚线 / 弧长窗口按弧长 vL（CSS px）裁，两端各留 1 设备像素的软边 */
const FS_LINE = `#version 300 es
precision highp float;
in vec2 vPos;
in float vD;
in float vL;
uniform vec2 uDash;
uniform vec2 uWin;
uniform float uCore;
uniform float uCov;
uniform float uDpr;
uniform vec4 uC0;
uniform vec4 uC1;
uniform vec4 uC2;
uniform vec3 uG;
uniform int uRing;
uniform vec4 uE;
uniform vec4 uR;
out vec4 o;
// 到椭圆的近似有符号距离（CSS px，外正内负）
float ell(vec2 q, vec2 r) {
  float k = length(q / r);
  float g = length(q / (r * r));
  return (k - 1.0) * k / max(g, 1e-6);
}
void main() {
  float cov = clamp(uCore + 0.5 - abs(vD), 0.0, 1.0) * uCov;
  vec4 c = uC0;
  if (uG.z > 0.0) {
    float t = clamp(length(vPos - uG.xy) / uG.z, 0.0, 1.0);
    c = t < 0.55 ? mix(uC0, uC1, t / 0.55) : mix(uC1, uC2, (t - 0.55) / 0.45);
  }
  if (uRing == 1) {
    vec2 d = vPos - uE.xy;
    vec2 q = vec2(d.x * uE.z + d.y * uE.w, -d.x * uE.w + d.y * uE.z);
    cov *= clamp(0.5 - ell(q, uR.xy) * uDpr, 0.0, 1.0) * clamp(0.5 + ell(q, uR.zw) * uDpr, 0.0, 1.0);
  }
  if (uDash.x > 0.0) {
    float m = mod(vL, uDash.x + uDash.y);
    cov *= clamp(min(m, uDash.x - m) * uDpr + 0.5, 0.0, 1.0);
  }
  if (uWin.y >= uWin.x) cov *= clamp((vL - uWin.x) * uDpr + 0.5, 0.0, 1.0) * clamp((uWin.y - vL) * uDpr + 0.5, 0.0, 1.0);
  float a = c.a * cov;
  o = vec4(c.rgb * a, a);
}`;

/* 圆点：以圆心为中心的一个方块（gl_VertexID 0..3 → 三角带），片元里按到圆心的距离出覆盖率 */
const VS_DOT = `#version 300 es
uniform vec2 uRes;
uniform vec3 uC;
out vec2 vPos;
void main() {
  vec2 k = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1)) * 2.0 - 1.0;
  vec2 p = uC.xy + k * (uC.z + 1.0);
  vPos = p;
  vec2 c = p / uRes * 2.0 - 1.0;
  gl_Position = vec4(c.x, -c.y, 0.0, 1.0);
}`;
const FS_DOT = `#version 300 es
precision highp float;
in vec2 vPos;
uniform vec3 uC;
uniform vec4 uCol;
uniform int uSoft;
uniform float uDpr;
out vec4 o;
void main() {
  float d = length(vPos - uC.xy);
  float cov = uSoft == 1 ? clamp(1.0 - d / uC.z, 0.0, 1.0) : clamp((uC.z - d) * uDpr + 0.5, 0.0, 1.0);
  float a = uCol.a * cov;
  o = vec4(uCol.rgb * a, a);
}`;

/* 整幅位图：铺满画布的一个方块，逐像素对位取样（位图与画布同像素尺寸） */
const VS_IMG = `#version 300 es
out vec2 vUv;
void main() {
  vec2 k = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1));
  vUv = k;
  gl_Position = vec4(k.x * 2.0 - 1.0, 1.0 - k.y * 2.0, 0.0, 1.0);
}`;
const FS_IMG = `#version 300 es
precision mediump float;
in vec2 vUv;
uniform sampler2D uTex;
uniform float uA;
out vec4 o;
void main() { o = texture(uTex, vUv) * uA; }`;

const VS_BAND = `#version 300 es
in vec2 aP;
uniform vec2 uRes;
void main() {
  vec2 c = aP / uRes * 2.0 - 1.0;
  gl_Position = vec4(c.x, -c.y, 0.0, 1.0);
}`;
const FS_BAND = `#version 300 es
precision mediump float;
uniform float uA;
out vec4 o;
void main() { o = vec4(0.0, 0.0, 0.0, uA); }`;

/* 可增长的顶点暂存 */
class Buf {
  a = new Float32Array(1 << 16);
  n = 0;
  need(k: number) {
    if (this.n + k <= this.a.length) return;
    let len = this.a.length * 2;
    while (len < this.n + k) len *= 2;
    const b = new Float32Array(len);
    b.set(this.a.subarray(0, this.n));
    this.a = b;
  }
}

/** msaa：地形要（擦除带与倒影环带的边缘靠它）；只描细线的脑电不要 —— 描线的抗锯齿在片元里算，
    整屏多重采样每帧还得多解析一遍 */
export function makeGl(canvas: OffscreenCanvas, msaa = true): Backend | null {
  const gl = canvas.getContext('webgl2', {
    alpha: true,
    premultipliedAlpha: true,
    antialias: msaa,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: false,
    powerPreference: 'low-power',
  }) as WebGL2RenderingContext | null;
  if (!gl) return null;

  const compile = (vs: string, fs: string) => {
    const p = gl.createProgram() as WebGLProgram;
    for (const [type, src] of [
      [gl.VERTEX_SHADER, vs],
      [gl.FRAGMENT_SHADER, fs],
    ] as const) {
      const s = gl.createShader(type) as WebGLShader;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      gl.attachShader(p, s);
    }
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link');
    return p;
  };
  let pl: WebGLProgram;
  let pb: WebGLProgram;
  let pd: WebGLProgram;
  let pi: WebGLProgram;
  try {
    pl = compile(VS_LINE, FS_LINE);
    pb = compile(VS_BAND, FS_BAND);
    pd = compile(VS_DOT, FS_DOT);
    pi = compile(VS_IMG, FS_IMG);
  } catch {
    return null;
  }
  const U = (p: WebGLProgram, names: string[]) =>
    Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(p, n)])) as Record<string, WebGLUniformLocation | null>;
  const ul = U(pl, ['uRes', 'uHw', 'uDpr', 'uCore', 'uCov', 'uC0', 'uC1', 'uC2', 'uG', 'uRing', 'uE', 'uR', 'uDash', 'uWin']);
  const ub = U(pb, ['uRes', 'uA']);
  const ud = U(pd, ['uRes', 'uC', 'uCol', 'uSoft', 'uDpr']);
  const ui = U(pi, ['uTex', 'uA']);

  // 描线：x, y, mx, my, side, 弧长（每点两个顶点，三角带）
  const vaoL = gl.createVertexArray();
  const bufL = gl.createBuffer();
  gl.bindVertexArray(vaoL);
  gl.bindBuffer(gl.ARRAY_BUFFER, bufL);
  const aP = gl.getAttribLocation(pl, 'aP');
  const aM = gl.getAttribLocation(pl, 'aM');
  const aS = gl.getAttribLocation(pl, 'aS');
  const aL = gl.getAttribLocation(pl, 'aL');
  gl.enableVertexAttribArray(aP);
  gl.vertexAttribPointer(aP, 2, gl.FLOAT, false, 24, 0);
  gl.enableVertexAttribArray(aM);
  gl.vertexAttribPointer(aM, 2, gl.FLOAT, false, 24, 8);
  gl.enableVertexAttribArray(aS);
  gl.vertexAttribPointer(aS, 1, gl.FLOAT, false, 24, 16);
  gl.enableVertexAttribArray(aL);
  gl.vertexAttribPointer(aL, 1, gl.FLOAT, false, 24, 20);
  // 圆点与位图：顶点全在着色器里由 gl_VertexID 生成，不挂任何属性
  const vaoE = gl.createVertexArray();
  // 位图的纹理：每张源画布一份，ver 变了才重传
  const texOf = new Map<OffscreenCanvas, { tex: WebGLTexture; ver: number }>();
  // 擦除带：x, y
  const vaoB = gl.createVertexArray();
  const bufB = gl.createBuffer();
  gl.bindVertexArray(vaoB);
  gl.bindBuffer(gl.ARRAY_BUFFER, bufB);
  const bP = gl.getAttribLocation(pb, 'aP');
  gl.enableVertexAttribArray(bP);
  gl.vertexAttribPointer(bP, 2, gl.FLOAT, false, 8, 0);
  gl.bindVertexArray(null);

  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.clearColor(0, 0, 0, 0);

  let W = 1;
  let H = 1;
  let dpr = 1;
  const L = new Buf();
  const B = new Buf();
  const lineAt: number[] = []; // 每条折线在描线顶点里的 [首, 数]
  const bandAt = new Map<number, [number, number]>(); // 擦除带：折线编号 → [首, 数]

  /* 一条折线 → 三角带。各段子路径之间用退化三角形接上；拐点处法线取两段的平均、按斜接放长（上限 2 倍）。
     每个顶点带上从折线起点量起的弧长（只计落笔的段），给虚线与弧长窗口用 */
  function stripOf(s: Scene, o: number, n: number) {
    const P = s.pts;
    const first = L.n / 6;
    let started = false;
    let len = 0;
    let i = 0;
    while (i < n) {
      // 找一段连续的子路径 [a, b)
      while (i < n && P[(o + i) * 3 + 2] !== 1) i++;
      const a = i;
      i++;
      while (i < n && P[(o + i) * 3 + 2] === 2) i++;
      const b = i;
      const m = b - a;
      if (m < 2) continue;
      L.need((m * 2 + 2) * 6);
      const A = L.a;
      // 首尾几乎重合 ⇒ 闭合（圆环）：两端法线按环绕取
      const x0 = P[(o + a) * 3];
      const y0 = P[(o + a) * 3 + 1];
      const closed = Math.hypot(P[(o + b - 1) * 3] - x0, P[(o + b - 1) * 3 + 1] - y0) < 0.5 && m > 3;
      const seg = (j: number): [number, number] => {
        // 第 j 段（点 j → j+1）的单位法线
        const p = (o + a + j) * 3;
        const dx = P[p + 3] - P[p];
        const dy = P[p + 4] - P[p + 1];
        const l = Math.hypot(dx, dy);
        return l > 1e-6 ? [-dy / l, dx / l] : [NaN, NaN];
      };
      let prev: [number, number] = closed ? seg(m - 2) : [NaN, NaN];
      for (let j = 0; j < m; j++) {
        let next: [number, number] = j < m - 1 ? seg(j) : closed ? seg(0) : [NaN, NaN];
        if (Number.isNaN(next[0])) next = prev;
        if (Number.isNaN(prev[0])) prev = next;
        let mx = prev[0] + next[0];
        let my = prev[1] + next[1];
        const ml = Math.hypot(mx, my);
        if (Number.isNaN(ml) || ml < 1e-6) {
          mx = Number.isNaN(next[0]) ? 0 : next[0];
          my = Number.isNaN(next[1]) ? 1 : next[1];
        } else {
          mx /= ml;
          my /= ml;
          const k = Math.min(2, 1 / Math.max(0.5, mx * next[0] + my * next[1]));
          mx *= k;
          my *= k;
        }
        const p = (o + a + j) * 3;
        const x = P[p];
        const y = P[p + 1];
        if (j) len += Math.hypot(x - P[p - 3], y - P[p - 2]);
        if (j === 0 && started) {
          // 退化：重复上一个顶点与这一个顶点
          A.set(A.subarray(L.n - 6, L.n), L.n);
          L.n += 6;
          A[L.n++] = x;
          A[L.n++] = y;
          A[L.n++] = mx;
          A[L.n++] = my;
          A[L.n++] = 1;
          A[L.n++] = len;
        }
        A[L.n++] = x;
        A[L.n++] = y;
        A[L.n++] = mx;
        A[L.n++] = my;
        A[L.n++] = 1;
        A[L.n++] = len;
        A[L.n++] = x;
        A[L.n++] = y;
        A[L.n++] = mx;
        A[L.n++] = my;
        A[L.n++] = -1;
        A[L.n++] = len;
        if (!Number.isNaN(next[0])) prev = next;
      }
      started = true;
    }
    lineAt.push(first, L.n / 6 - first);
  }

  function bandOf(s: Scene, pi: number, band: number) {
    const o = s.polys[2 * pi];
    const n = s.polys[2 * pi + 1];
    const P = s.pts;
    const first = B.n / 2;
    B.need(n * 4);
    const A = B.a;
    const ox = s.nx * band;
    const oy = s.ny * band;
    for (let i = 0; i < n; i++) {
      const p = (o + i) * 3;
      A[B.n++] = P[p];
      A[B.n++] = P[p + 1];
      A[B.n++] = P[p] + ox;
      A[B.n++] = P[p + 1] + oy;
    }
    bandAt.set(pi, [first, B.n / 2 - first]);
  }

  return {
    kind: 'gl',
    resize(w, h, r) {
      W = w;
      H = h;
      dpr = r;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    },
    draw(s) {
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (!s.ops.length) return;
      // 几何：用到的折线各建一份三角带；擦除带按需
      L.n = 0;
      B.n = 0;
      lineAt.length = 0;
      bandAt.clear();
      const np = s.polys.length / 2;
      for (let pi = 0; pi < np; pi++) stripOf(s, s.polys[2 * pi], s.polys[2 * pi + 1]);
      for (const op of s.ops) if (op.t === 'band') bandOf(s, op.p, op.band);

      gl.bindBuffer(gl.ARRAY_BUFFER, bufL);
      gl.bufferData(gl.ARRAY_BUFFER, L.a.subarray(0, L.n), gl.STREAM_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, bufB);
      gl.bufferData(gl.ARRAY_BUFFER, B.a.subarray(0, B.n), gl.STREAM_DRAW);

      gl.useProgram(pl);
      gl.uniform2f(ul.uRes, W, H);
      gl.uniform1f(ul.uDpr, dpr);
      const r = s.ring;
      if (r) {
        gl.uniform4f(ul.uE, r.x, r.y, Math.cos(r.rot), Math.sin(r.rot));
        gl.uniform4f(ul.uR, r.ox, r.oy, r.ix, r.iy);
      }
      gl.useProgram(pb);
      gl.uniform2f(ub.uRes, W, H);
      gl.useProgram(pd);
      gl.uniform2f(ud.uRes, W, H);
      gl.uniform1f(ud.uDpr, dpr);

      let cur: WebGLProgram | null = null;
      let out: boolean | null = null;
      for (const op of s.ops) {
        const wantOut = op.t === 'band' || (op.t === 'line' && !!op.out);
        if (wantOut !== out) {
          out = wantOut;
          if (out) gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);
          else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        }
        if (op.t === 'img') {
          if (op.a <= 0.001) continue;
          let t = texOf.get(op.src);
          if (!t) texOf.set(op.src, (t = { tex: gl.createTexture() as WebGLTexture, ver: NaN }));
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, t.tex);
          if (t.ver !== op.ver) {
            t.ver = op.ver;
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, op.src);
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          }
          if (cur !== pi) {
            gl.useProgram((cur = pi));
            gl.bindVertexArray(vaoE);
            gl.uniform1i(ui.uTex, 0);
          }
          gl.uniform1f(ui.uA, cl(op.a));
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
          continue;
        }
        if (op.t === 'dot') {
          if (cur !== pd) {
            gl.useProgram((cur = pd));
            gl.bindVertexArray(vaoE);
          }
          const c = op.c;
          gl.uniform3f(ud.uC, op.x, op.y, op.r);
          gl.uniform4f(ud.uCol, c[0] / 255, c[1] / 255, c[2] / 255, cl(c[3]));
          gl.uniform1i(ud.uSoft, op.soft ? 1 : 0);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
          continue;
        }
        if (op.t === 'band') {
          const at = bandAt.get(op.p);
          if (!at || at[1] < 4) continue;
          if (cur !== pb) {
            gl.useProgram((cur = pb));
            gl.bindVertexArray(vaoB);
          }
          gl.uniform1f(ub.uA, cl(op.a));
          gl.drawArrays(gl.TRIANGLE_STRIP, at[0], at[1]);
          continue;
        }
        const first = lineAt[2 * op.p];
        const count = lineAt[2 * op.p + 1];
        if (count < 4) continue;
        if (cur !== pl) {
          gl.useProgram((cur = pl));
          gl.bindVertexArray(vaoL);
        }
        const wd = op.w * dpr;
        const core = Math.max(wd, 1) / 2;
        gl.uniform1f(ul.uCore, core);
        gl.uniform1f(ul.uCov, Math.min(1, wd));
        gl.uniform1f(ul.uHw, (core + 1) / dpr);
        const c = op.c;
        gl.uniform4f(ul.uC0, c[0] / 255, c[1] / 255, c[2] / 255, cl(c[3]));
        const g = op.g;
        if (g) {
          const [s0, s1, s2] = g.s;
          gl.uniform4f(ul.uC0, s0[0] / 255, s0[1] / 255, s0[2] / 255, cl(s0[3]));
          gl.uniform4f(ul.uC1, s1[0] / 255, s1[1] / 255, s1[2] / 255, cl(s1[3]));
          gl.uniform4f(ul.uC2, s2[0] / 255, s2[1] / 255, s2[2] / 255, cl(s2[3]));
          gl.uniform3f(ul.uG, g.x, g.y, g.r);
        } else gl.uniform3f(ul.uG, 0, 0, 0);
        gl.uniform1i(ul.uRing, op.ring && r ? 1 : 0);
        gl.uniform2f(ul.uDash, op.dash ? op.dash[0] : 0, op.dash ? op.dash[1] : 0);
        gl.uniform2f(ul.uWin, op.win ? op.win[0] : 1, op.win ? op.win[1] : 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, first, count);
      }
      gl.bindVertexArray(null);
    },
  };
}

/* ══════════ Canvas 2D（退路）══════════ */

const rgba = (c: number[]) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${cl(c[3]).toFixed(3)})`;

export function make2d(canvas: OffscreenCanvas): Backend | null {
  const ctx = canvas.getContext('2d');
  if (!ctx || typeof Path2D !== 'function') return null;
  let dpr = 1;
  const pathOf = (s: Scene, pi: number) => {
    const o = s.polys[2 * pi];
    const n = s.polys[2 * pi + 1];
    const P = s.pts;
    const path = new Path2D();
    for (let i = 0; i < n; i++) {
      const p = (o + i) * 3;
      if (P[p + 2] === 1) path.moveTo(P[p], P[p + 1]);
      else if (P[p + 2] === 2) path.lineTo(P[p], P[p + 1]);
    }
    return path;
  };
  return {
    kind: '2d',
    resize(W, H, r) {
      dpr = r;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
    },
    draw(s) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!s.ops.length) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const cache = new Map<number, Path2D>();
      const get = (pi: number) => {
        let p = cache.get(pi);
        if (!p) cache.set(pi, (p = pathOf(s, pi)));
        return p;
      };
      let ringPath: Path2D | null = null;
      const r = s.ring;
      if (r) {
        ringPath = new Path2D();
        ringPath.ellipse(r.x, r.y, r.ox, r.oy, r.rot, 0, Math.PI * 2);
        ringPath.ellipse(r.x, r.y, r.ix, r.iy, r.rot, 0, Math.PI * 2);
      }
      for (const op of s.ops) {
        if (op.t === 'img') {
          if (op.a <= 0.001) continue;
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.globalAlpha = cl(op.a);
          ctx.drawImage(op.src, 0, 0);
          ctx.globalAlpha = 1;
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          continue;
        }
        if (op.t === 'dot') {
          ctx.beginPath();
          ctx.arc(op.x, op.y, op.r, 0, Math.PI * 2);
          if (op.soft) {
            const gr = ctx.createRadialGradient(op.x, op.y, 0, op.x, op.y, op.r);
            gr.addColorStop(0, rgba(op.c));
            gr.addColorStop(1, rgba([op.c[0], op.c[1], op.c[2], 0]));
            ctx.fillStyle = gr;
          } else ctx.fillStyle = rgba(op.c);
          ctx.fill();
          continue;
        }
        if (op.t === 'band') {
          const o = s.polys[2 * op.p];
          const n = s.polys[2 * op.p + 1];
          if (n < 2) continue;
          const P = s.pts;
          const under = new Path2D();
          under.moveTo(P[o * 3], P[o * 3 + 1]);
          for (let i = 1; i < n; i++) under.lineTo(P[(o + i) * 3], P[(o + i) * 3 + 1]);
          for (let i = n - 1; i >= 0; i--)
            under.lineTo(P[(o + i) * 3] + s.nx * op.band, P[(o + i) * 3 + 1] + s.ny * op.band);
          under.closePath();
          ctx.globalCompositeOperation = 'destination-out';
          ctx.globalAlpha = cl(op.a);
          ctx.fillStyle = '#000';
          ctx.fill(under);
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
          continue;
        }
        if (op.ring) {
          if (!ringPath) continue;
          ctx.save();
          ctx.clip(ringPath, 'evenodd');
        }
        ctx.globalCompositeOperation = op.out ? 'destination-out' : 'source-over';
        if (op.g) {
          const g = op.g;
          const gr = ctx.createRadialGradient(g.x, g.y, 0, g.x, g.y, g.r);
          gr.addColorStop(0, rgba(g.s[0]));
          gr.addColorStop(0.55, rgba(g.s[1]));
          gr.addColorStop(1, rgba(g.s[2]));
          ctx.strokeStyle = gr;
        } else ctx.strokeStyle = rgba(op.c);
        ctx.lineWidth = op.w;
        if (op.dash) ctx.setLineDash(op.dash);
        else if (op.win) ctx.setLineDash([0, Math.max(0, op.win[0]), Math.max(0, op.win[1] - op.win[0]), 1e6]);
        ctx.stroke(get(op.p));
        if (op.dash || op.win) ctx.setLineDash([]);
        ctx.globalCompositeOperation = 'source-over';
        if (op.ring) ctx.restore();
      }
    },
  };
}
