/* ─────────────────────────────────────────────────────────────
   Ave 的星：一颗晶体三轴星（±x ±y ±z 六支，与左下工具栏那颗同形），
   压在对话框左上角后面、比框大一圈——框内被磨砂糊开，框外是清楚的。
   原型与取舍见 design/mocks/star-set/notes.md（r1–r5）与 design/mocks/ave-r2/NOTES.md。

   · 几何：一体成形，24 片风筝形刻面——每支的四个面一直延伸到相邻两支之间的凹点，没有单独的芯。
   · 材质：只画平面刻面。背面一遍（出射折射、三通道色散、全反射），正面一遍（菲涅耳反射 ×
     薄膜虹彩 + 一点正面折射 + 棱线；棱线到中心淡掉）。环境是程序化影棚：淡彩亮箱 + 暗卡。
   · 运动：同时绕几根轴转、叠成一条曲线（每一项到终点都是星的自身对称，所以落地与起点全同）；
     时间上先快后慢（四次缓动）；位姿只在节拍上跳（10 拍 / 秒）。静止时不渲染。
   · 原生 WebGL2，不引 three（为一颗星打一整个 three 进来不值）。拿不到 WebGL2 就返回 null，
     对话框照常，只是没有星。
   ───────────────────────────────────────────────────────────── */

type V3 = [number, number, number];
type Quat = [number, number, number, number]; // x y z w

/* ── 几何 ── */

/** 每个卦限里三片风筝形交在凹点 V 上；V 取在让风筝形恰好平整的那一点：v = wL / (2L − w) */
function starPolys(L = 1, w = 0.155): V3[][] {
  const v = (w * L) / (2 * L - w);
  const out: V3[][] = [];
  for (const sx of [1, -1])
    for (const sy of [1, -1])
      for (const sz of [1, -1]) {
        const V: V3 = [v * sx, v * sy, v * sz];
        const tx: V3 = [L * sx, 0, 0];
        const ty: V3 = [0, L * sy, 0];
        const tz: V3 = [0, 0, L * sz];
        const exy: V3 = [w * sx, w * sy, 0];
        const eyz: V3 = [0, w * sy, w * sz];
        const ezx: V3 = [w * sx, 0, w * sz];
        out.push([tx, exy, V, ezx], [ty, eyz, V, exy], [tz, ezx, V, eyz]);
      }
  return out;
}

/** 多边形刻面 → 三角形（平面法线；bary + emask 用来只在真棱上画线，扇形对角线不画） */
function buildMesh(polys: V3[][]) {
  const data: number[] = [];
  for (let p of polys) {
    const n: V3 = [0, 0, 0];
    const c: V3 = [0, 0, 0];
    for (let i = 0; i < p.length; i++) {
      const a = p[i];
      const b = p[(i + 1) % p.length];
      n[0] += (a[1] - b[1]) * (a[2] + b[2]);
      n[1] += (a[2] - b[2]) * (a[0] + b[0]);
      n[2] += (a[0] - b[0]) * (a[1] + b[1]);
      for (let k = 0; k < 3; k++) c[k] += a[k] / p.length;
    }
    const len = Math.hypot(...n);
    for (let k = 0; k < 3; k++) n[k] /= len;
    // 星形体：刻面中心总在原点外侧 → 让法线朝外、绕向为逆时针（正面）
    if (n[0] * c[0] + n[1] * c[1] + n[2] * c[2] < 0) {
      p = [...p].reverse();
      for (let k = 0; k < 3; k++) n[k] = -n[k];
    }
    for (let i = 1; i < p.length - 1; i++) {
      const tri = [p[0], p[i], p[i + 1]];
      const m = [1, i + 1 === p.length - 1 ? 1 : 0, i === 1 ? 1 : 0];
      tri.forEach((q, k) => data.push(...q, ...n, k === 0 ? 1 : 0, k === 1 ? 1 : 0, k === 2 ? 1 : 0, ...m));
    }
  }
  return { data: new Float32Array(data), count: data.length / 12 };
}

/* ── 着色器 ── */

const VS = `#version 300 es
in vec3 aPos; in vec3 aNor; in vec3 aBary; in vec3 aMask;
uniform mat4 uProj, uView, uModel;
out vec3 vN; out vec3 vP; out vec3 vB; out vec3 vM; out float vR;
void main() {
  vR = length(aPos);
  vec4 wp = uModel * vec4(aPos, 1.0);
  vP = wp.xyz;
  vN = normalize(mat3(uModel) * aNor);
  vB = aBary; vM = aMask;
  gl_Position = uProj * uView * wp;
}`;

const FS = `#version 300 es
precision highp float;
uniform float uPass;   // 0 背面出射，1 正面
uniform float uDream;  // 0 醒 1 梦
uniform float uColor;  // 彩
uniform float uAlpha;  // 体的不透明度
uniform float uDark;   // 深底
uniform vec4 uMask;    // 框的矩形（画布像素，左下为原点）：x0 y0 x1 y1
uniform float uMaskK;  // 框的不透明度：框里那一块从实体过渡到线框
uniform vec3 uCam;
in vec3 vN; in vec3 vP; in vec3 vB; in vec3 vM; in float vR;
out vec4 o;
const float IOR = 1.6;

float box(vec3 d, vec3 c, float w, float h, float soft) {
  c = normalize(c);
  vec3 r = normalize(cross(vec3(0.0, 1.0, 0.0), c));
  vec3 u = cross(c, r);
  float k = dot(d, c);
  if (k <= 0.05) return 0.0;
  vec2 p = vec2(dot(d, r), dot(d, u)) / k;
  return (1.0 - smoothstep(w, w + soft, abs(p.x))) * (1.0 - smoothstep(h, h + soft, abs(p.y)));
}

vec3 env(vec3 d) {
  vec3 top = mix(vec3(0.92, 0.93, 0.98), vec3(0.95, 0.90, 0.97), uDream);
  vec3 hor = vec3(1.0, 0.985, 0.98);
  vec3 bot = mix(vec3(0.66, 0.65, 0.74), vec3(0.66, 0.58, 0.72), uDream);
  vec3 c = d.y > 0.0 ? mix(hor, top, smoothstep(0.0, 0.7, d.y)) : mix(hor, bot, smoothstep(0.0, 0.45, -d.y));
  vec3 ink = mix(vec3(0.42, 0.42, 0.52), vec3(0.46, 0.38, 0.54), uDream);
  float cs = 0.5 + 0.9 * uColor;
  vec3 ice = mix(vec3(1.0), vec3(0.70, 0.86, 1.0), cs);
  vec3 rose = mix(vec3(1.0), vec3(1.0, 0.74, 0.86), cs);
  vec3 mint = mix(vec3(1.0), vec3(0.76, 1.0, 0.90), cs);
  vec3 peach = mix(vec3(1.0), vec3(1.0, 0.86, 0.72), cs);
  vec3 lilac = mix(vec3(1.0), vec3(0.84, 0.76, 1.0), cs);
  c = mix(c, ink * 0.85, box(d, vec3(-0.95, -0.15, 0.35), 0.4, 0.8, 0.06));
  c = mix(c, ink, box(d, vec3(0.35, -0.25, -0.9), 0.45, 0.25, 0.10) * 0.7);
  c = mix(c, ink * 1.2, box(d, vec3(0.9, 0.55, 0.2), 0.12, 0.6, 0.04) * 0.7);
  c = mix(c, vec3(1.25) * lilac, box(d, vec3(-0.45, 0.7, 0.6), 0.45, 0.3, 0.03));
  c = mix(c, vec3(1.15) * ice, box(d, vec3(0.85, 0.05, 0.55), 0.09, 0.8, 0.02));
  c = mix(c, vec3(1.1) * rose, box(d, vec3(-0.25, 0.35, -0.9), 0.5, 0.25, 0.05));
  c = mix(c, vec3(1.05) * mint, box(d, vec3(-0.6, -0.55, -0.6), 0.35, 0.3, 0.06));
  c = mix(c, vec3(1.05) * peach, box(d, vec3(0.6, 0.6, -0.5), 0.25, 0.25, 0.10));
  c = mix(c, vec3(1.1) * ice, box(d, vec3(0.1, -0.8, 0.6), 0.5, 0.15, 0.05) * 0.8);
  return c;
}

vec3 film(float x) { return 0.5 + 0.5 * cos(6.2832 * (x * 1.7 + vec3(0.0, 0.33, 0.67))); }

float edge() {
  vec3 fw = fwidth(vB);
  vec3 eb = smoothstep(vec3(0.0), fw * 1.3, vB);
  vec3 em = mix(vec3(1.0), eb, vM);
  return 1.0 - min(min(em.x, em.y), em.z);
}

// 落在框里的那一块只画棱线：隔着磨砂看过去，星只剩轮廓
float wire() {
  vec2 p = gl_FragCoord.xy;
  float inside = step(uMask.x, p.x) * step(p.x, uMask.z) * step(uMask.y, p.y) * step(p.y, uMask.w);
  return inside * uMaskK;
}

void main() {
  vec3 I = normalize(vP - uCam);
  float w = wire();
  vec3 wc = mix(vec3(0.42, 0.40, 0.58), vec3(0.86, 0.86, 0.96), uDark); // 线框的墨色
  float wf = smoothstep(0.06, 0.3, vR); // 线框在中心也淡一点，但比实体那边留得多
  vec3 N = normalize(vN);
  vec3 tint = mix(vec3(0.96, 0.96, 1.0), vec3(0.99, 0.94, 1.0), uDream);
  float disp = mix(0.012, 0.045, uColor) * (1.0 + 0.6 * uDream);

  if (uPass < 0.5) {
    vec3 n = -N;
    vec3 col;
    for (int i = 0; i < 3; i++) {
      vec3 r = refract(I, n, IOR + (float(i) - 1.0) * disp);
      vec3 s = dot(r, r) < 1e-4 ? env(reflect(I, n)) * 0.85 : env(r);
      col[i] = i == 0 ? s.r : (i == 1 ? s.g : s.b);
    }
    float l = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(l), col, mix(0.55, 1.0, uColor)) * tint;
    float wb = edge() * 0.14 * wf; // 背面的棱：更淡，像透过去的那一层
    o = mix(vec4(col * uAlpha, uAlpha), vec4(wc * wb, wb), w);
    return;
  }

  float ndv = max(dot(-I, N), 0.0);
  float F = 0.06 + 0.94 * pow(1.0 - ndv, 5.0);
  vec3 R = reflect(I, N);
  vec3 refl = env(R) * mix(vec3(1.0), film(ndv), 0.15 + 0.4 * uColor);
  vec3 refr = env(refract(I, N, 1.0 / IOR)) * tint;
  float k = 0.12;
  vec3 col = refl * F + refr * k * (1.0 - F);
  float a = F + k * (1.0 - F);
  float spec = pow(max(dot(R, normalize(vec3(-0.45, 0.7, 0.6))), 0.0), 600.0) * 1.6;
  col += vec3(spec); a += spec;
  // 棱线：浅底上是淡薄暮灰（白棱在白底上会断），深底上是亮棱；中心不画线，一体由刻面明暗读出
  vec3 ec = mix(vec3(0.58, 0.56, 0.70), vec3(1.0), uDark);
  float e = edge();
  float ew = e * 0.42 * smoothstep(0.14, 0.5, vR);
  col = col * (1.0 - ew) + ec * ew;
  a = a * (1.0 - ew) + ew;
  float wl = e * 0.38 * wf;
  o = mix(vec4(col, clamp(a, 0.0, 1.0)), vec4(wc * wl, wl), w);
}`;

/* ── 小数学 ── */

const D = Math.PI / 180;
const qAxis = (x: number, y: number, z: number, deg: number): Quat => {
  const l = Math.hypot(x, y, z);
  const s = Math.sin((deg * D) / 2) / l;
  return [x * s, y * s, z * s, Math.cos((deg * D) / 2)];
};
const qMul = (a: Quat, b: Quat): Quat => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
/** 旋转 × 均匀缩放 → 列主序 4×4 */
function modelMatrix(q: Quat, s: number) {
  const [x, y, z, w] = q;
  return new Float32Array([
    (1 - 2 * (y * y + z * z)) * s, 2 * (x * y + z * w) * s, 2 * (x * z - y * w) * s, 0,
    2 * (x * y - z * w) * s, (1 - 2 * (x * x + z * z)) * s, 2 * (y * z + x * w) * s, 0,
    2 * (x * z + y * w) * s, 2 * (y * z - x * w) * s, (1 - 2 * (x * x + y * y)) * s, 0,
    0, 0, 0, 1,
  ]);
}

/* ── 姿态与转动 ── */

/** 停的那一格：先绕 y 支转 45°，再仰 35.264°——沿体对角线看过去，六支投影成正六芒（与 toolstar.ts 同一套角） */
const REST = qMul(qAxis(1, 0, 0, 35.264), qAxis(0, 1, 0, 45));
const AXES: V3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 1, 1]];
const pick = <T,>(xs: T[]) => xs[(Math.random() * xs.length) | 0];

/** 一条曲线：q(s) = REST · Rx(θx s) · Ry(θy s) · Rz(θz s) · R(1,1,1)(θd s)。
    θ 取 90° / 120° 的整数倍，两三项、合计 270–450°（一到一圈半，再多就成了陀螺） */
function planCurve(): number[] {
  for (;;) {
    const th = [pick([0, 90, 180]), pick([0, 90, 180, 270]), pick([0, 90, 180]), pick([0, 0, 120])].map((d) => d * (Math.random() < 0.5 ? -1 : 1));
    const live = th.filter((d) => d).length;
    const sum = th.reduce((a, d) => a + Math.abs(d), 0);
    if (live >= 2 && live <= 3 && sum >= 270 && sum <= 450) return th;
  }
}
function curveAt(th: number[], s: number): Quat {
  let q = REST;
  th.forEach((d, i) => d && (q = qMul(q, qAxis(...AXES[i], d * s))));
  return q;
}
/** 先快后慢 */
const easeOut = (t: number) => 1 - Math.pow(1 - t, 4);
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

const FPS = 10;
const ENTER_S = 2;
const SPIN_S = 1.6;

type Kind = 'enter' | 'spin' | 'exit';
interface Anim {
  kind: Kind;
  th: number[];
  dur: number;
  t0: number;
  beat: number;
  done?: () => void;
}

export interface AveStar {
  /** 进场：从小长到原大，沿一条曲线先快后慢地转进来 */
  enter(): void;
  /** 已经在了、换一句：原地转一下 */
  spin(): void;
  /** 退场：反过来先慢后快地转走、缩没；sec 给多久 */
  leave(sec: number, done?: () => void): void;
  /** 深底 / 梦面（下一次渲染起生效） */
  look(dark: boolean, dream: boolean): void;
}

/** mask：压在星上面的那块框——星落在它矩形里的部分画成线框（随它的不透明度过渡） */
export function createAveStar(canvas: HTMLCanvasElement, reduced: () => boolean, mask?: HTMLElement): AveStar | null {
  const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: true });
  if (!gl) return null;

  const sh = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
    return s;
  };
  let prog: WebGLProgram;
  try {
    prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || 'link');
  } catch (e) {
    console.warn('[ave-star]', e);
    return null;
  }
  gl.useProgram(prog);

  const mesh = buildMesh(starPolys());
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, mesh.data, gl.STATIC_DRAW);
  ['aPos', 'aNor', 'aBary', 'aMask'].forEach((name, i) => {
    const loc = gl.getAttribLocation(prog, name);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 48, i * 12);
  });
  const U = (n: string) => gl.getUniformLocation(prog, n);
  const u = {
    proj: U('uProj'), view: U('uView'), model: U('uModel'), cam: U('uCam'),
    pass: U('uPass'), dream: U('uDream'), color: U('uColor'), alpha: U('uAlpha'), dark: U('uDark'), mask: U('uMask'), maskK: U('uMaskK'),
  };

  // 相机：16° 视角，退到半径 1.04 恰好填满
  const dist = 1.04 / Math.tan(8 * D);
  const f = 1 / Math.tan(8 * D);
  const near = 0.1;
  const far = 50;
  gl.uniformMatrix4fv(u.proj, false, new Float32Array([f, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, (2 * far * near) / (near - far), 0]));
  gl.uniformMatrix4fv(u.view, false, new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -dist, 1]));
  gl.uniform3f(u.cam, 0, 0, dist);
  gl.uniform1f(u.color, 0.9); // 浓
  gl.uniform1f(u.alpha, 0.38); // 很透
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);
  gl.clearColor(0, 0, 0, 0);

  let q: Quat = REST;
  let scale = 0;
  let anim: Anim | null = null;
  let raf = 0;

  function resize() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    const w = Math.round(canvas.clientWidth * dpr);
    if (w && canvas.width !== w) canvas.width = canvas.height = w;
  }

  function draw() {
    resize();
    gl!.viewport(0, 0, canvas.width, canvas.height);
    gl!.clear(gl!.COLOR_BUFFER_BIT | gl!.DEPTH_BUFFER_BIT);
    if (scale < 0.002) return;
    gl!.uniformMatrix4fv(u.model, false, modelMatrix(q, scale));
    if (mask) {
      const c = canvas.getBoundingClientRect();
      const k = mask.getBoundingClientRect();
      const sx = canvas.width / (c.width || 1);
      const H = canvas.height;
      gl!.uniform4f(u.mask, (k.left - c.left) * sx, H - (k.bottom - c.top) * sx, (k.right - c.left) * sx, H - (k.top - c.top) * sx);
      gl!.uniform1f(u.maskK, Number(getComputedStyle(mask).opacity) || 0);
    }
    // 背面：出射
    gl!.cullFace(gl!.FRONT);
    gl!.depthFunc(gl!.LESS);
    gl!.depthMask(true);
    gl!.colorMask(true, true, true, true);
    gl!.uniform1f(u.pass, 0);
    gl!.drawArrays(gl!.TRIANGLES, 0, mesh.count);
    // 正面：先只写深度，再只画最近的那一层
    gl!.clear(gl!.DEPTH_BUFFER_BIT);
    gl!.cullFace(gl!.BACK);
    gl!.colorMask(false, false, false, false);
    gl!.drawArrays(gl!.TRIANGLES, 0, mesh.count);
    gl!.colorMask(true, true, true, true);
    gl!.depthMask(false);
    gl!.depthFunc(gl!.LEQUAL);
    gl!.uniform1f(u.pass, 1);
    gl!.drawArrays(gl!.TRIANGLES, 0, mesh.count);
  }

  function frame(now: number) {
    raf = 0;
    const a = anim;
    if (!a) return;
    // 第一拍立刻动；之后每拍跳一次（定格）
    const beat = Math.floor(((now - a.t0) / 1000) * FPS) + 1;
    if (beat !== a.beat) {
      a.beat = beat;
      const t = Math.min(1, beat / FPS / a.dur);
      if (a.kind === 'exit') {
        q = curveAt(a.th, 1 - easeOut(1 - t)); // 镜像：先慢后快
        scale = 1 - Math.pow(Math.max(0, (t - 0.55) / 0.45), 2);
      } else {
        q = curveAt(a.th, easeOut(t));
        if (a.kind === 'enter') scale = easeOutCubic(Math.min(1, t / 0.45));
      }
      if (t >= 1) {
        q = REST; // 每条曲线的终点都是自身对称，归位不跳
        scale = a.kind === 'exit' ? 0 : 1;
        anim = null;
        draw();
        a.done?.();
        return;
      }
      draw();
    }
    raf = requestAnimationFrame(frame);
  }

  function run(kind: Kind, dur: number, done?: () => void) {
    anim = { kind, th: planCurve(), dur, t0: performance.now(), beat: -1, done };
    if (kind === 'enter') {
      scale = 0.001;
      draw();
    }
    if (!raf) raf = requestAnimationFrame(frame);
  }

  return {
    enter() {
      if (reduced()) {
        anim = null;
        q = REST;
        scale = 1;
        draw();
        setTimeout(draw, 400); // 框淡入（0.3s）之后再画一次，框里那块换成线框
        return;
      }
      run('enter', ENTER_S);
    },
    spin() {
      if (reduced() || scale < 0.5) return;
      run('spin', SPIN_S);
    },
    leave(sec, done) {
      if (reduced() || sec <= 0 || scale < 0.002) {
        anim = null;
        scale = 0;
        draw();
        return done?.();
      }
      run('exit', sec, done);
    },
    look(dark, dream) {
      gl.uniform1f(u.dark, dark ? 1 : 0);
      gl.uniform1f(u.dream, dream ? 1 : 0);
      if (scale > 0.002 && !anim) draw();
    },
  };
}
