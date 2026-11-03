/* ─────────────────────────────────────────────────────────────
   昼雾 · 文章页的地面
   撤掉 14° 缝线之后，长文页底下不再有线条，只剩一场走得很慢的光。
   这套场与漫游空间（wander/light.js）、DSH 主题的「流光」是同一支：
   域扭曲 fbm 当明暗场，四档色板（底 / 暗面 / 光带 / 亮芯），一格 5 个 CSS 像素、
   按像素放大，再按 4×4 Bayer 抖动量化 —— 近看是一层细噪点，远看是一片雾，不是渐变。

   与漫游那一片只差一件事：**正文列里这场光是压平的**。
   uCalm 给出那一条静域（中心 / 半宽 / 羽化），列里的明暗差压到约十分之一，列外满幅。
   字落在最安静的地方，光在字够不着的地方走 —— 缝线时代「正文列避让缝线」的那条纪律，
   换到这片场上就是「正文列避让流动」。

   配色恒定在昼雾一侧：底就是本页时辰的底色，梦面只把光带与亮芯往紫里推一点点
   （--reality-mix，读 wakeMix()）。不让整页翻深，是因为正文对比度不该随入梦检验跳。

   节流：12fps，不是每帧。一片雾本来就该慢；顺带把主线程占住的时间压到可以忽略
   （一帧就是一次 288×180 的三角形，加上几个 uniform）。页面隐藏 / 上下文丢失即停。

   没有 WebGL2、或只有软件渲染（SwiftShader / Basic Render Driver）时不建场，
   canvas 露出 Mist.astro 里的静态雾 —— 同样一条静域，只是不再走。
   ───────────────────────────────────────────────────────────── */

import { hexToRgb, reducedMotion } from './lib';
import { onMixChange, wakeMix } from './reality';

/* 一格 5 个 CSS 像素：1440 宽的屏上画布只有 288×180 —— 这是整套方案便宜的原因 */
const CELL = 5;
/* 场的整体尺度：越大雾团越大越疏 */
const ZOOM = 0.62;
/* 12fps：雾的速度是秒级，12 帧足够连续 */
const FRAME_MS = 1000 / 12;

/* 四档色：底 · 暗面 · 光带 · 亮芯。醒面取昼雾：纸白为底，冷雾色的光带从纸上流过
   （不是把整页压成一块灰 —— 与 DSH 主题里「流光」的浅色默认是同一种读法：
   大部分面积落在前两档，深色只落在第 2 / 3 档的窄带上） */
const WAKE = ['#fdfeff', '#f2f7fc', '#dbe5f1', '#9db0c4'];
/* 梦面只动后两档：光带与亮芯各往紫里偏一点，不是另一套夜色 */
const DREAM = ['#fdfeff', '#f5f3fb', '#e0d8ee', '#b2a5c9'];

const toFloats = (hex: string) => {
  const [r, g, b] = hexToRgb(hex);
  return [r / 255, g / 255, b / 255];
};
const mixFloats = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t);

const VERT = `#version 300 es
in vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;

uniform vec2 uRes;
uniform float uTime;
uniform float uZoom;
uniform float uGlow;
uniform vec3 uP[4];
/* 静域：x = 中心（画布 px，自左） · y = 半宽 · z = 羽化（都是画布 px） */
uniform vec3 uCalm;
/* 1 = 窄屏：正文列几乎占满宽度，静域改为「中间一条安静的带」，雾从上下两头渗进来 */
uniform float uLeak;
/* 洞：xy = 中心（画布 px，自下往上） · z = 半径；w > 0 才画（404 那一页） */
uniform vec4 uHole;

out vec4 o;

float h21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(h21(i), h21(i + vec2(1.0, 0.0)), u.x),
    mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}
float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 4; i++) {
    s += a * vnoise(p);
    p = r * p * 2.03 + 11.7;
    a *= 0.5;
  }
  return s;
}
/* 与 wander/light.js 的 field() 逐行对应：两次域扭曲，再取第三次 fbm */
float field(vec2 p, float t) {
  vec2 q = vec2(fbm(p + vec2(0.0, t * 0.05)), fbm(p + vec2(5.2, 1.3) - t * 0.04));
  vec2 r = vec2(
    fbm(p + 2.0 * q + vec2(1.7, 9.2) + t * 0.03),
    fbm(p + 2.0 * q + vec2(8.3, 2.8) - t * 0.025)
  );
  return fbm(p + 1.9 * r);
}
float bayer4(vec2 p) {
  ivec2 i = ivec2(mod(p, 4.0));
  const int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(m[i.y * 4 + i.x]) + 0.5) / 16.0;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  /* 场自己走得很慢，再叠一点整体平移，免得盯着像静止 */
  vec2 pan = vec2(uTime * 0.0042 + 12.4, uTime * -0.0031 - 7.9);
  float t = uTime * 0.55;
  /* 实测：这套 fbm 的取值基本落在 0.06–0.50（均值 0.24、标准差 0.09）。
     直接按 0.30/0.42 截会几乎全落进第 0 档、画面是一片白 —— 这里把它的 10–90 分位铺满 0–1，
     雾才有明暗。 */
  float raw = field(uv * (1.05 * uZoom) + pan, t);
  float v = clamp((raw - 0.10) / 0.34, 0.0, 1.0);

  /* 整体不走到最亮芯：外侧也只是一层浅雾，静域与外侧才不像两种材料 */
  v *= 0.72;

  /* 正文列：雾在字底下只留一口气 —— 不是压成一块平色，是把起伏收到十二分之一，
     边界沿纵轴缓慢起伏、羽化很宽，看不出边在哪。
     要做到这一点的关键是：羽化比正文列本身宽得多，两段过渡叠在一起就没有界线。 */
  float wob = (vnoise(vec2(gl_FragCoord.y * 0.0017, uTime * 0.015)) - 0.5) * uCalm.z * 2.4;
  float dx = abs(gl_FragCoord.x - uCalm.x - wob);
  /* uCalm.y < 0 = 这一页没有正文列（404）：不压静域，整片照常走 */
  float calm = uCalm.y < 0.0 ? 0.0 : 1.0 - smoothstep(uCalm.y * 0.72, uCalm.y + uCalm.z, dx);
  /* 窄屏：静下来的不只是中间那条列，而是整片正文；雾从上下的边缘进来，
     离上下边缘越近越像原来那场雾 */
  if (uLeak > 0.5) {
    float dTop = gl_FragCoord.y / uRes.y;
    float edge = 1.0 - smoothstep(0.0, 0.42, min(dTop, 1.0 - dTop));
    calm *= 1.0 - edge * 0.92;
  }
  v = mix(v, 0.30 + (v - 0.30) * 0.16, calm);

  vec3 col = mix(uP[0], uP[1], smoothstep(0.10, 0.54, v));
  col = mix(col, uP[2], smoothstep(0.54, 0.90, v));
  float band = smoothstep(0.62, 0.76, v) * (1.0 - smoothstep(0.80, 0.96, v));
  col = mix(col, uP[3], band * 0.55 * uGlow);
  col = mix(col, uP[3], smoothstep(0.90, 1.0, v) * uGlow * 0.6);
  col = min(col, vec3(1.0));

  /* 洞（404）：同一片雾在正中塌成一个安静的坑 —— 没有边、没有圈，
     只是那一片的起伏被抹平、整体沉下去一点，边界沿角向与噪声一起不规则地挪。
     读到的应该是「这里什么都没有」，不是「这里盖了一个圆」。 */
  if (uHole.w > 0.5) {
    float dh = length(gl_FragCoord.xy - uHole.xy);
    float ang = atan(gl_FragCoord.y - uHole.y, gl_FragCoord.x - uHole.x);
    /* 边界随角度慢慢起伏，再叠一层场自己的噪声：过渡带很宽，看不出线在哪 */
    float rz = uHole.z * (1.06 + 0.10 * sin(ang * 2.0 + 1.7) + 0.055 * sin(ang * 3.0 - 0.6) + 0.05 * (raw - 0.24));
    float inside = 1.0 - smoothstep(rz * 0.34, rz * 1.16, dh);
    /* 坑底是「沉下去」的那种暗：比周围的雾暗一线，而且起伏被抹平 */
    /* 沉下去的那一层仍是雾色，只是更低更平 —— 压过头就变成一块灰板，
       字要落在雾上，不是落在板上 */
    vec3 floorCol = mix(uP[1], uP[2], 0.36);
    /* 坑心再亮一点、坑沿略暗一点：读起来是一处被雾绕开的空地，
       而不是一块压暗的补丁（补丁会跟字抢注意力） */
    col = mix(col, mix(floorCol, uP[0], 0.34), inside * 0.95);
  }

  /* 32 阶 + 4×4 Bayer：低分辨率放大后不出色带，近看是细噪点 */
  float q = 32.0;
  col = floor(col * q + 0.5 + (bayer4(gl_FragCoord.xy) - 0.5) * 0.6) / q;

  o = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

/** 静域 = 本页正文列（.page-body 就是那条列），两侧各留一段羽化 */
function calmZone(host: HTMLElement | null): [number, number, number] {
  const vw = window.innerWidth || 1;
  if (host?.dataset.calm === 'none') return [vw / 2, -1, 1];
  const width = host ? host.getBoundingClientRect().width : Math.min(vw - 48, 672);
  return [vw / 2, width / 2, Math.max(150, width * 0.30)];
}

export function initMist(): () => void {
  const canvas = document.querySelector<HTMLCanvasElement>('#mist');
  if (!canvas) return () => {};

  const el = canvas;
  const ctx = hardwareContext(el);
  if (!ctx) return () => {}; // 静态雾留在 CSS 上

  const program = link(ctx, VERT, FRAG);
  if (!program) return () => {};
  ctx.useProgram(program);

  const buffer = ctx.createBuffer();
  ctx.bindBuffer(ctx.ARRAY_BUFFER, buffer);
  ctx.bufferData(ctx.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), ctx.STATIC_DRAW);
  const attr = ctx.getAttribLocation(program, 'p');
  ctx.enableVertexAttribArray(attr);
  ctx.vertexAttribPointer(attr, 2, ctx.FLOAT, false, 0, 0);

  const u = {
    res: ctx.getUniformLocation(program, 'uRes'),
    time: ctx.getUniformLocation(program, 'uTime'),
    zoom: ctx.getUniformLocation(program, 'uZoom'),
    glow: ctx.getUniformLocation(program, 'uGlow'),
    palette: ctx.getUniformLocation(program, 'uP'),
    calm: ctx.getUniformLocation(program, 'uCalm'),
    leak: ctx.getUniformLocation(program, 'uLeak'),
    hole: ctx.getUniformLocation(program, 'uHole'),
  };

  const WAKE_F = WAKE.map(toFloats);
  const DREAM_F = DREAM.map(toFloats);

  /* 醒度变了才重算四档色（一次 12 个数，不重建画布） */
  const paintPalette = () => {
    const m = wakeMix();
    const flat = WAKE_F.flatMap((c, i) => mixFloats(DREAM_F[i], c, m));
    ctx.uniform3fv(u.palette, new Float32Array(flat));
  };
  paintPalette();
  ctx.uniform1f(u.zoom, ZOOM);
  ctx.uniform1f(u.glow, 1);

  const calmHost =
    el.dataset.calm === 'none'
      ? el
      : document.querySelector<HTMLElement>(el.dataset.calm ?? '.page-body');

  const resize = () => {
    const w = Math.max(2, Math.ceil((window.innerWidth || 1) / CELL));
    const h = Math.max(2, Math.ceil((window.innerHeight || 1) / CELL));
    if (el.width !== w || el.height !== h) {
      el.width = w;
      el.height = h;
    }
    ctx.viewport(0, 0, w, h);
    ctx.uniform2f(u.res, w, h);
    const zone = calmZone(calmHost).map((n) => n / CELL);
    ctx.uniform3f(u.calm, zone[0], zone[1], zone[2]);
    ctx.uniform1f(u.leak, (window.innerWidth || 1) < 760 ? 1 : 0);
    /* 洞：404 用；坑心在视口正中，半径跟着屏宽走（手机上小一点） */
    const hole = el.dataset.hole === '1';
    const r = Math.max(34, Math.min(window.innerWidth || 1, 900) * 0.20) / CELL;
    ctx.uniform4f(u.hole, w / 2, h * 0.52, r, hole ? 1 : 0);
  };
  resize();

  /* 时间只往前走：一页停在雾里，雾不重来 */
  let t = 33.7;
  let drawnAt = 0;
  const draw = (now: number) => {
    if (drawnAt) t += Math.min(now - drawnAt, 250) / 1000;
    drawnAt = now;
    ctx.uniform1f(u.time, t);
    ctx.drawArrays(ctx.TRIANGLES, 0, 3);
  };

  let timer = 0;
  let raf = 0;
  let running = true;
  const tick = (now: number) => {
    raf = 0;
    if (!running) return;
    draw(now);
    timer = window.setTimeout(() => {
      timer = 0;
      if (running) raf = requestAnimationFrame(tick);
    }, FRAME_MS);
  };
  const start = () => {
    if (!running || timer || raf) return;
    timer = window.setTimeout(() => {
      timer = 0;
      if (running) raf = requestAnimationFrame(tick);
    }, FRAME_MS);
  };
  const stop = () => {
    running = false;
    clearTimeout(timer);
    timer = 0;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  };

  const onVisibility = () => {
    if (document.hidden) {
      stop();
    } else {
      drawnAt = 0; // 回来时不补算离开的那段时间（雾不追帧）
      running = true;
      start();
    }
  };

  /* 醒度订阅没有退订口（reality.ts 的 mixListeners 是只增的）：用一个闸门关掉它 */
  let alive = true;
  onMixChange(() => {
    if (alive) paintPalette();
  });
  window.addEventListener('resize', resize, { passive: true });
  document.addEventListener('visibilitychange', onVisibility);

  const release = () => {
    alive = false;
    stop();
    window.removeEventListener('resize', resize);
    document.removeEventListener('visibilitychange', onVisibility);
    el.removeEventListener('webglcontextlost', onLost);
  };

  /* 上下文丢了：整场退成静态雾，不重建（一片地面不值得来回重建两次） */
  function onLost(e: Event) {
    e.preventDefault();
    release();
    /* 上下文没了，画布上那层像素也不可信：摘掉画布，让 Mist.astro 的静态雾露出来 */
    el.hidden = true;
  }
  el.addEventListener('webglcontextlost', onLost);

  if (reducedMotion()) {
    /* 减弱动效：只落一帧，之后不再走 */
    draw(performance.now());
    running = false;
  } else {
    start();
  }

  return release;
}

/* 只要硬件渲染：软件渲染跑这个场会把 CPU 吃满，不如退回静态雾 */
function hardwareContext(canvas: HTMLCanvasElement): WebGL2RenderingContext | null {
  let gl: WebGL2RenderingContext | null = null;
  try {
    gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
      powerPreference: 'low-power',
    });
  } catch {
    return null;
  }
  if (!gl) return null;
  let name = '';
  try {
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    name = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
  } catch {
    /* 拿不到渲染器名，按硬件渲染处理 */
  }
  if (/swiftshader|llvmpipe|softpipe|basic render|software/i.test(name)) return null;
  return gl;
}

function link(gl: WebGL2RenderingContext, vert: string, frag: string): WebGLProgram | null {
  const compile = (type: number, src: string) => {
    const sh = gl.createShader(type);
    if (!sh) return null;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.warn('[mist] shader: ' + gl.getShaderInfoLog(sh));
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  };
  const vs = compile(gl.VERTEX_SHADER, vert);
  const fs = compile(gl.FRAGMENT_SHADER, frag);
  if (!vs || !fs) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn('[mist] link: ' + gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }
  return program;
}
