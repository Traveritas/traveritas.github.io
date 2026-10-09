/* ─────────────────────────────────────────────────────────────
   关于页 · 截面（通往 NEXUS 的门；原型与对照截图：design/mocks/nexus-slice/）
   · 一枚四维 24 胞体落在三维里的一层切面。醒：切面贴着一个胞，是一枚八面体，缓慢自转；
     梦：看不见的整体在四维里转动，切面随之换形（截角八面体、立方八面体与其间无名的形），从不破碎。
   · 几何：24 个半空间投到切面上逐面裁剪，每帧不到 0.1ms。着色全在片元里：切面永远是凸体，
     每个像素沿折射光线求出射面（至多三次体内全反射），光程决定丁香色吸收的深浅，光核按光线离它的距离积分。
   · 醒梦跟随入梦检验的醒度（reality.ts 的 wakeMix），自身再平滑一道，换面不跳。
   · 门（nexus-door.ts）：悬停时缓缓停转（hover）；点下去后 enter 0→1：
     画布挪到 body 上铺满整屏（离轴投影，晶体留在原处原大），镜头推进晶体，光核漫开、化白。
   · 关于页退场（about-exit.ts）经 .nexus-slice 元素上的 nexus 属性（NexusCtl）驱动两件事：
     grow —— 晶体「从一个点长出来」（切面从顶点方向转回胞方向、同时往体内推进；0 时什么也不画）；
     line —— 脑电线落成的切面线，也写进环境里，透过晶体看到的是被折弯、错位的那一段。
   · 性能：共享 30fps 帧钟，醒面只要 15fps；位图边长 ≤ 900px；离屏 / 标签页隐藏即停。
     软件渲染（failIfMajorPerformanceCaveat）、没有 WebGL2、着色器失败时，留在静帧图上。
     prefers-reduced-motion：只在醒度变化时画一帧，不自转。
     实测（Radeon 610M 核显，1040px 位图）每帧约 3ms；软件渲染要 25–45ms，所以拒用。
   ───────────────────────────────────────────────────────────── */

import { onMixChange, wakeMix } from './reality';
import { onFrame30, reducedMotion } from './lib';
import { sliceAt, cross, dot, len, norm, sub, add, mul, smooth, type Face, type V3 } from './cell24';

/** 挂在 .nexus-slice 元素上的外部输入（about-exit.ts 写，本脚本每帧读） */
export interface NexusCtl {
  /** 长出来的进度 0..1；1 ＝ 常态 */
  grow: number;
  /** 切面线在晶体背后的可见度 0..1 */
  line: number;
  /** 门：悬停 0/1（本脚本自己平滑） */
  hover?: number;
  /** 门：进入的进度 0..1（nexus-door.ts 逐帧写，写完调 draw） */
  enter?: number;
  /** 本脚本装上：按当前状态立即画一帧（画布没起来时不装） */
  draw?: () => void;
}
export type NexusEl = HTMLElement & { nexus?: NexusCtl };

const MAXP = 24;
const VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNor;
uniform mat4 uView, uProj;
out vec3 vW; out vec3 vN;
void main(){ vW = aPos; vN = aNor; gl_Position = uProj * uView * vec4(aPos, 1.); }`;

const FS = `#version 300 es
precision highp float;
#define MAXP ${MAXP}
in vec3 vW; in vec3 vN;
uniform vec3 uCam;
uniform vec4 uPl[MAXP];     // 世界坐标里的半空间：xyz·p ≤ w
uniform int uNP;
uniform float uPw[MAXP];    // 每面的圆角权重：面将消失时趋于 0，棱上的光随之收掉
uniform float uDream;       // 0 醒 · 1 梦
uniform float uCore;        // 光核强度
uniform vec3 uCoreC;
uniform float uRough;       // 体内磨砂度
uniform float uLine;        // 切面线可见度（关于页退场）
uniform float uLineY;       // 切面线在环境里的仰角（相机看向晶体中心的方向）
uniform float uEnter;       // 门：进入的进度 0..1
out vec4 o;

// 环境：淡丁香天顶、近白地平亮带、偏紫的下半球；左上柔光箱与左侧暗卡给轮廓，右后一盏很淡的粉白小灯
// r：粗糙度 0..1 —— 表面反射用 0（清楚），体内透射用较大值（光斑化开、暗卡变浅）
vec3 env(vec3 d, float r){
  float w = 1.0 + 3.0 * r;
  float y = d.y;
  vec3 top = vec3(0.90, 0.895, 0.97), hor = vec3(1.0, 0.975, 0.965), low = vec3(0.78, 0.745, 0.80);
  top = mix(top, vec3(0.94, 0.90, 0.95), uDream);
  vec3 c = y > 0.0 ? mix(hor, top, smoothstep(0.0, 0.65 * w, y)) : mix(hor, low, smoothstep(0.0, 0.5 * w, -y));
  c += vec3(0.12, 0.10, 0.09) * exp(-pow(y / (0.06 * w), 2.0));
  c *= mix(1.0, 0.92, smoothstep(0.15, 0.95, d.z));
  float k = 1.0 - r * 0.6;
  c *= 1.0 - 0.30 * k * smoothstep(1.0 - 0.20 * w, 0.97, dot(d, normalize(vec3(-0.95, 0.05, -0.30))));
  c *= 1.0 - 0.15 * k * smoothstep(1.0 - 0.25 * w, 0.97, dot(d, normalize(vec3(0.85, -0.25, 0.45))));
  float key = smoothstep(1.0 - 0.10 * w, 0.975, dot(d, normalize(vec3(-0.50, 0.70, 0.50))));
  c += vec3(1.0, 0.99, 0.97) * 0.75 * k * key;
  c += vec3(1.0, 0.94, 0.96) * 0.30 * k * smoothstep(1.0 - 0.07 * w, 0.99, dot(d, normalize(vec3(0.75, 0.25, -0.60))));
  // 切面线：只在晶体背后那半边，细、偏丁香灰；粗糙时化开变淡
  if (uLine > 0.0) {
    float lw = 0.0035 * (1.0 + 4.0 * r);
    float ln = exp(-pow((y - uLineY) / lw, 2.0)) * smoothstep(0.1, -0.3, d.z) / (1.0 + 3.0 * r);
    c = mix(c, vec3(0.36, 0.34, 0.42), clamp(ln * uLine * 0.75, 0.0, 1.0));
  }
  return c;
}

// 射线 P + tT 在凸体内到出射面的距离；ni = 出射面序号
float exitT(vec3 P, vec3 T, out int ni){
  float tm = 1e9; ni = -1;
  for (int i = 0; i < MAXP; i++) {
    if (i >= uNP) break;
    float dn = dot(uPl[i].xyz, T);
    if (dn > 1e-5) {
      float t = (uPl[i].w - dot(uPl[i].xyz, P)) / dn;
      if (t < tm) { tm = t; ni = i; }
    }
  }
  return max(tm, 0.0);
}

// 面上点到最近棱的距离（沿面量），nb = 那条棱另一侧的面法向
float edgeDist(vec3 P, vec3 N, out vec3 nb){
  float best = 1e9; nb = N;
  for (int i = 0; i < MAXP; i++) {
    if (i >= uNP) break;
    vec3 n = uPl[i].xyz;
    float c = dot(n, N);
    if (c > 0.9995) continue;
    float e = (uPl[i].w - dot(n, P)) / sqrt(max(1e-4, 1.0 - c * c)) / max(uPw[i], 1e-3);
    if (e < best) { best = e; nb = n; }
  }
  return best;
}

float glowSeg(vec3 A, vec3 B){
  vec3 ab = B - A;
  float t = clamp(dot(uCoreC - A, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
  vec3 q = A + ab * t - uCoreC;
  return exp(-dot(q, q) / 0.12) * length(ab);
}

void main(){
  vec3 N = normalize(vN);
  vec3 I = normalize(vW - uCam);
  vec3 V = -I;

  // 圆角棱：靠近棱时法线朝邻面弯过去
  vec3 nb;
  float e = edgeDist(vW, N, nb);
  float tb = 1.0 - smoothstep(0.0, 0.028, e);
  vec3 Nb = normalize(mix(N, normalize(N + nb), tb * tb));

  float ndv = clamp(dot(Nb, V), 0.0, 1.0);
  float F = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);
  vec3 refl = env(reflect(I, Nb), 0.0);

  // 透射：入射 → 至多三次体内全反射 → 出射
  float ior = 1.52;
  vec3 T = refract(I, Nb, 1.0 / ior);
  vec3 P = vW;
  float L = 0.0, g = 0.0, inner = 0.0;
  vec3 trans = vec3(0.0);
  bool done = false;
  float disp = mix(0.006, 0.018, uDream) * (1.0 + 3.0 * uEnter);
  for (int b = 0; b < 4; b++) {
    int ni;
    float t = exitT(P, T, ni);
    vec3 Q = P + T * t;
    L += t; g += glowSeg(P, Q);
    if (ni < 0) break;
    vec3 Ne = uPl[ni].xyz;
    if (b == 0) {
      vec3 dummy;
      inner = exp(-pow(edgeDist(Q, Ne, dummy) / 0.010, 2.0));
    }
    vec3 Tg = refract(T, -Ne, ior);
    if (dot(Tg, Tg) > 0.0) {
      vec3 Tr = refract(T, -Ne, ior - disp);
      vec3 Tb = refract(T, -Ne, ior + disp);
      if (dot(Tr, Tr) == 0.0) Tr = Tg;
      if (dot(Tb, Tb) == 0.0) Tb = Tg;
      float Fe = 0.04 + 0.96 * pow(1.0 - clamp(dot(Ne, Tg), 0.0, 1.0), 5.0);
      trans = vec3(env(Tr, uRough).r, env(Tg, uRough).g, env(Tb, uRough).b) * (1.0 - Fe);
      done = true;
      break;
    }
    T = reflect(T, -Ne);
    P = Q + T * 1e-4;
  }
  if (!done) trans = env(T, uRough) * 0.85;

  // 吸收：丁香色，梦里偏一点粉；光程越长越深
  vec3 k = mix(vec3(0.060, 0.064, 0.012), vec3(0.030, 0.058, 0.030), uDream);
  trans *= exp(-k * L) * 1.03;
  trans *= 1.0 - inner * 0.16;
  // 光核：沿光程积分后饱和，一团近白的微温
  float gc = 1.0 - exp(-g * uCore);
  vec3 glow = mix(vec3(1.0, 0.975, 0.955), vec3(1.0, 0.955, 0.965), uDream);
  trans = mix(trans, glow * 1.05, gc * mix(0.55, 0.95, uEnter));

  // 薄膜虹彩，只上在反射里
  vec3 film = 0.5 + 0.5 * cos(6.2832 * (vec3(0.0, 0.33, 0.67) + 1.8 * (1.0 - ndv)));
  refl *= mix(vec3(1.0), film, 0.16);
  vec3 col = mix(trans, refl, F);
  vec3 Lk = normalize(vec3(-0.50, 0.70, 0.50));
  float spec = pow(max(dot(Nb, normalize(Lk + V)), 0.0), 260.0);
  col += vec3(1.0) * spec * (0.9 + 0.6 * tb);
  col = mix(col, glow * 1.05, smoothstep(0.55, 1.0, uEnter));
  o = vec4(col, 1.0);
}`;

function persp(fov: number, asp: number, n: number, f: number) {
  const t = 1 / Math.tan(fov / 2);
  return [t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, (2 * f * n) / (n - f), 0];
}
function lookAt(e: V3, c: V3, up: V3) {
  const z = norm(sub(e, c)),
    x = norm(cross(up, z)),
    y = cross(z, x);
  return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, e), -dot(y, e), -dot(z, e), 1];
}
const CAM: V3 = [0, 0.55, 6.2];
const VIEW = lookAt(CAM, [0, 0, 0], [0, 1, 0]);
const PROJ = persp(0.62, 1, 0.1, 50);
function frustum(l: number, r: number, b: number, t: number, n: number, f: number) {
  return [(2 * n) / (r - l), 0, 0, 0, 0, (2 * n) / (t - b), 0, 0, (r + l) / (r - l), (t + b) / (t - b), (f + n) / (n - f), -1, 0, 0, (2 * f * n) / (n - f), 0];
}
const MAX_PX = 900;
const FULL_PX = 1600; // 铺满整屏时位图长边上限（只撑一秒的进门）
const DOLLY = 0.2; // 进门推到底时相机离晶体中心的距离比（6.2 → 1.25，还在体外）
const LINE_Y = -CAM[1] / Math.hypot(CAM[1], CAM[2]);

export function initNexusSlice() {
  const root = document.querySelector<NexusEl>('.nexus-slice');
  const cv = root?.querySelector<HTMLCanvasElement>('canvas');
  if (!root || !cv) return;
  const ctl: NexusCtl = (root.nexus ??= { grow: 1, line: 0 });
  const glc = cv.getContext('webgl2', {
    antialias: true,
    alpha: true,
    premultipliedAlpha: true,
    failIfMajorPerformanceCaveat: true,
  });
  if (!glc) return; // 留在静帧图上
  const gl: WebGL2RenderingContext = glc;
  // failIfMajorPerformanceCaveat 不一定拦得住软件渲染（实测 SwiftShader 照样给上下文），按渲染器名再挡一道
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
  if (/swiftshader|llvmpipe|softpipe|software|basic render/i.test(renderer)) return;

  /* ── 着色器 ── */
  const prog = gl.createProgram()!;
  for (const [t, s] of [
    [gl.VERTEX_SHADER, VS],
    [gl.FRAGMENT_SHADER, FS],
  ] as const) {
    const sh = gl.createShader(t)!;
    gl.shaderSource(sh, s);
    gl.compileShader(sh);
    gl.attachShader(prog, sh);
  }
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
  const U: Record<string, WebGLUniformLocation | null> = {};
  for (const name of ['uView', 'uProj', 'uCam', 'uPl', 'uNP', 'uPw', 'uDream', 'uCore', 'uCoreC', 'uRough', 'uLine', 'uLineY', 'uEnter'])
    U[name] = gl.getUniformLocation(prog, name);

  const STRIDE = 6;
  const vdata = new Float32Array(24 * 12 * 3 * STRIDE);
  const pl = new Float32Array(MAXP * 4);
  const pw = new Float32Array(MAXP);
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, vdata.byteLength, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, STRIDE * 4, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, STRIDE * 4, 12);

  /* ── 状态 ── */
  let dream = 1 - wakeMix(); // 0 醒 · 1 梦（自身平滑后的值）
  let tau = 0; // 四维转动的内在时钟：只在梦里走
  let yaw = 0.4;
  let hv = 0; // 悬停（平滑后）
  let heldFrame = false; // 悬停停稳后已画过那一帧

  /** e：长出来的进度（已缓动），1 ＝ 常态（形状见 cell24.ts 的 sliceAt） */
  const slice = (e = 1) => sliceAt(e, tau, smooth(dream));

  /* 面 → 世界坐标的顶点与半空间（模型矩阵烘进去，着色器全程在世界坐标里算）。
     fixedInv：长出来的过程沿用常态形状的缩放，截面就是它真实的大小（从一个点长大）；
     不给则按体积归一（常态：换形时不胀不缩） */
  function build(faces: Face[], fixedInv?: number) {
    const d = smooth(dream);
    // 中心取按面积加权的面心：将消失的小面权重趋于 0，面数增减时整体不跳
    let c: V3 = [0, 0, 0],
      wsum = 0;
    for (const f of faces) {
      let fc: V3 = [0, 0, 0];
      for (const p of f.pts) fc = add(fc, p);
      c = add(c, mul(fc, f.area / f.pts.length));
      wsum += f.area;
    }
    c = mul(c, 1 / Math.max(1e-9, wsum));
    // 按体积归一：换形时不胀不缩
    let vol = 0;
    for (const f of faces) vol += (f.area * Math.abs(dot(f.n, sub(f.pts[0], c)))) / 3;
    const inv = fixedInv ?? Math.cbrt(4 / 3 / (vol || 1));
    const s = 1.1,
      sy = 1.28 - 0.16 * d;
    const cy = Math.cos(yaw),
      sw = Math.sin(yaw);
    const R = (v: V3): V3 => [cy * v[0] - sw * v[2], v[1], sw * v[0] + cy * v[2]];
    const toW = (p: V3) => R([p[0] * s, p[1] * s * sy, p[2] * s]);
    let k = 0;
    faces.forEach((f, fi) => {
      const nl = R([f.n[0] / s, f.n[1] / (s * sy), f.n[2] / s]);
      const L = len(nl),
        nw = mul(nl, 1 / L);
      pl.set([nw[0], nw[1], nw[2], ((f.d - dot(f.n, c)) * inv) / L], fi * 4);
      pw[fi] = smooth(Math.min(1, (f.area * inv * inv) / 0.03));
      const pts = f.pts.map((p) => toW(mul(sub(p, c), inv)));
      for (let i = 1; i + 1 < pts.length; i++)
        for (const p of [pts[0], pts[i], pts[i + 1]]) {
          vdata.set([p[0], p[1], p[2], nw[0], nw[1], nw[2]], k);
          k += STRIDE;
        }
    });
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, vdata, 0, k);
    return k / STRIDE;
  }

  /* 进门：画布挪到 body 上铺满整屏；记下原来那一格的屏幕位置，离轴投影让晶体留在原处原大 */
  let full: { cx: number; cy: number; w: number } | null = null;
  function setFull(on: boolean) {
    if (on === !!full) return;
    if (on) {
      const r = root!.getBoundingClientRect();
      full = { cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width };
      cv!.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:1000;opacity:1;pointer-events:none';
      document.body.append(cv!);
    } else {
      full = null;
      cv!.style.cssText = '';
      root!.append(cv!);
    }
  }

  function resize() {
    if (full) {
      const k = Math.min(2, devicePixelRatio || 1, FULL_PX / Math.max(innerWidth, innerHeight));
      const w = Math.round(innerWidth * k),
        h = Math.round(innerHeight * k);
      if (cv!.width !== w || cv!.height !== h) {
        cv!.width = w;
        cv!.height = h;
      }
      return;
    }
    const w = cv!.clientWidth;
    const px = Math.max(64, Math.min(MAX_PX, Math.round(w * Math.min(2, devicePixelRatio || 1))));
    if (cv!.width !== px || cv!.height !== px) cv!.width = cv!.height = px;
  }

  function volInvOf(faces: Face[]) {
    let c: V3 = [0, 0, 0],
      wsum = 0;
    for (const f of faces) {
      let fc: V3 = [0, 0, 0];
      for (const p of f.pts) fc = add(fc, p);
      c = add(c, mul(fc, f.area / f.pts.length));
      wsum += f.area;
    }
    c = mul(c, 1 / Math.max(1e-9, wsum));
    let vol = 0;
    for (const f of faces) vol += (f.area * Math.abs(dot(f.n, sub(f.pts[0], c)))) / 3;
    return Math.cbrt(4 / 3 / (vol || 1));
  }

  let drewEmpty = false;
  function render() {
    const en = Math.max(0, Math.min(1, ctl.enter ?? 0));
    setFull(en > 0);
    resize();
    const e = smooth(Math.max(0, Math.min(1, ctl.grow)));
    const faces = e > 0.002 ? slice(e) : [];
    gl.viewport(0, 0, cv!.width, cv!.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (faces.length < 4) {
      drewEmpty = true;
      return;
    }
    drewEmpty = false;
    const n = build(faces, e < 1 ? volInvOf(slice(1)) : undefined);
    const d = smooth(dream);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.useProgram(prog);
    gl.bindVertexArray(vao);
    // 进门：沿视线推近（先慢后快，像被吸进去），投影换成整屏的离轴截锥
    const cam = en > 0 ? mul(CAM, 1 - (1 - DOLLY) * en ** 1.6) : CAM;
    let proj = PROJ;
    if (full) {
      const u = (2 * 0.1 * Math.tan(0.31)) / full.w; // 每 CSS 像素在近平面上的长度
      proj = frustum(-full.cx * u, (innerWidth - full.cx) * u, (full.cy - innerHeight) * u, full.cy * u, 0.1, 50);
    }
    gl.uniformMatrix4fv(U.uView, false, en > 0 ? lookAt(cam, [0, 0, 0], [0, 1, 0]) : VIEW);
    gl.uniformMatrix4fv(U.uProj, false, proj);
    gl.uniform3fv(U.uCam, cam);
    gl.uniform4fv(U.uPl, pl);
    gl.uniform1i(U.uNP, faces.length);
    gl.uniform1fv(U.uPw, pw);
    gl.uniform1f(U.uDream, d);
    gl.uniform1f(U.uCore, 0.5 + 0.95 * d + 3 * en);
    gl.uniform3fv(U.uCoreC, [0, 0.04 + 0.1 * d, 0]);
    gl.uniform1f(U.uRough, 0.45 - 0.12 * d);
    gl.uniform1f(U.uLine, ctl.line);
    gl.uniform1f(U.uLineY, LINE_Y);
    gl.uniform1f(U.uEnter, en);
    gl.drawArrays(gl.TRIANGLES, 0, n);
  }

  /* ── 帧循环：共享 30fps 帧钟；醒面隔帧画（15fps） ── */
  const still = reducedMotion();
  let stop: (() => void) | null = null;
  let last = 0,
    acc = 0,
    onscreen = false,
    ready = false,
    lost = false;

  // 等一帧再起：本脚本可能先于 BaseLayout 的 initReality 执行，那时醒度还没从会话里恢复
  requestAnimationFrame(() => {
    dream = 1 - wakeMix();
    render();
    root.classList.add('is-live'); // 画布接管，静帧图退场
    ready = true;
    ctl.draw = () => {
      if (!lost) render();
    };
    sync();
  });

  function frame(ts: number) {
    const dt = last ? Math.min(0.1, (ts - last) / 1000) : 1 / 30;
    last = ts;
    const target = 1 - wakeMix();
    dream += Math.sign(target - dream) * Math.min(Math.abs(target - dream), dt / 1.2);
    const d = smooth(dream);
    // 悬停：自转与四维转动一起缓缓停下（约 0.7s），移开再缓缓转起来
    const ht = ctl.hover ?? 0;
    hv += Math.sign(ht - hv) * Math.min(Math.abs(ht - hv), dt / 0.7);
    const spin = 1 - smooth(hv);
    tau += dt * d * spin;
    yaw += dt * (0.06 + 0.16 * d) * spin;
    acc += dt;
    if ((ctl.enter ?? 0) > 0) return; // 进门由 nexus-door.ts 逐帧调 draw
    // 停稳了且醒度没在变：画面不会再变，不画
    const held = spin === 0 && dream === target && ctl.grow >= 1;
    if (held && heldFrame) return;
    heldFrame = held;
    if (ctl.grow <= 0.002 && drewEmpty) return; // 还没长出来：不画
    // 醒面静置 15fps 足够；长出来的过程跟着滚动走，要满 30fps
    if (d < 0.02 && ctl.grow >= 1 && hv === ht && acc < 1 / 15 - 0.004) return;
    acc = 0;
    render();
  }
  function sync() {
    const run = ready && !lost && onscreen && !document.hidden && !still;
    if (run && !stop) {
      last = 0;
      stop = onFrame30(frame);
    } else if (!run && stop) {
      stop();
      stop = null;
    }
  }
  new IntersectionObserver((es) => {
    onscreen = es[0].isIntersecting;
    sync();
  }).observe(cv);
  document.addEventListener('visibilitychange', sync);

  // 减少动效：不自转，只在醒度变化时直接画到位
  if (still)
    onMixChange(() => {
      if (!ready || lost) return;
      dream = 1 - wakeMix();
      render();
    });

  // 丢了 GPU 上下文就退回静帧图，不再重建
  cv.addEventListener('webglcontextlost', () => {
    lost = true;
    ctl.draw = undefined;
    setFull(false);
    root.classList.remove('is-live');
    sync();
  });
}
