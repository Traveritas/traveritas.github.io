/* ─────────────────────────────────────────────────────────────
 below · 体验小样共用：真的「继续往下翻」

 第一屏是检索页（流光三栏 + 栏头卡片）。往下滚，它像普通网页一样被推上去，
 下面那一屏（#exp）跟着从底下上来——到这里为止和普通滚动一模一样；
 接着再往下滚，滚动就不再移动页面，而是交给下面那个体验（depth）。

 滚动是自己接的（虚拟滚动 + 一点惯性），所以每个小样可以给滚动换一个意思。
 ?p=3.2 直接停在某个位置（截图用）。
 另附 quad()：一张全屏的片元着色器。
 ───────────────────────────────────────────────────────────── */
import { createLight } from './light.js';
import { layout, INK, TAN, clamp, RM } from './common.js';

export function scrub({ max = 30, rate = 1, onFrame }) {
  const q = new URLSearchParams(location.search);
  const pre = document.getElementById('pre');
  const exp = document.getElementById('exp');
  const pageEl = document.getElementById('page');
  const glc = document.getElementById('light');
  const light = createLight(glc, 5, { wind: true });
  let vw = innerWidth, vh = innerHeight;
  function buildPage() {
    pageEl.innerHTML = '';
    const L = layout(vw, vh);
    for (const h of L.heads) {
      const el = document.createElement('div');
      el.className = 'pg-head';
      el.style.cssText = `left:${h.x}px;top:${h.y}px;color:${INK[h.k].fg}`;
      el.innerHTML = `<span class="no">${h.no}</span><b>${h.t}</b><i>${h.en}</i>`;
      pageEl.appendChild(el);
    }
    for (const c of L.cards) {
      const ink = INK[c.k];
      const el = document.createElement('div');
      el.className = 'pg-card';
      el.style.cssText = `left:${c.x}px;top:${c.y}px;width:${c.w}px;height:${c.h}px;background:${ink.glass};border-color:${ink.edge};color:${ink.fg}`;
      el.innerHTML = `<b>${c.title}</b><time style="color:${ink.soft}">${c.date}</time>`;
      pageEl.appendChild(el);
    }
  }
  buildPage();
  addEventListener('resize', () => { vw = innerWidth; vh = innerHeight; light?.resize(); buildPage(); });

  let p = q.has('p') ? +q.get('p') : 0;
  let target = p;
  const lim = (v) => clamp(v, 0, max + 1);
  addEventListener('wheel', (e) => {
    e.preventDefault();
    let d = e.deltaY;
    if (e.deltaMode === 1) d *= 32;
    target = lim(target + (d / vh) * (target > 1 ? rate : 1));
  }, { passive: false });
  let ty = null;
  addEventListener('touchstart', (e) => { ty = e.touches[0].clientY; }, { passive: true });
  addEventListener('touchmove', (e) => {
    if (ty === null) return;
    const y = e.touches[0].clientY;
    target = lim(target + ((ty - y) / vh) * 1.6 * (target > 1 ? rate : 1));
    ty = y;
  }, { passive: true });
  addEventListener('keydown', (e) => {
    const step = { ArrowDown: 0.12, PageDown: 0.8, ' ': 0.8, ArrowUp: -0.12, PageUp: -0.8 }[e.key];
    if (step !== undefined) { e.preventDefault(); target = lim(target + step * (target > 1 ? rate : 1)); }
    if (e.key === 'Home') target = 0;
  });
  const mouse = { x: 0.5, y: 0.5, down: false };
  addEventListener('pointermove', (e) => { mouse.x = e.clientX / vw; mouse.y = e.clientY / vh; });
  addEventListener('pointerdown', () => (mouse.down = true));
  addEventListener('pointerup', () => (mouse.down = false));

  let last = performance.now(), clock = 0;
  const hint = document.querySelector('.hint');
  function tick(ts) {
    const dt = Math.min(0.05, (ts - last) / 1000);
    last = ts;
    clock += dt;
    p += (target - p) * (RM ? 1 : 1 - Math.exp(-dt * 7));
    const lift = Math.min(1, p); // 第一屏被推上去了多少
    pre.style.transform = `translate3d(0, ${(-lift * vh).toFixed(1)}px, 0)`;
    exp.style.transform = `translate3d(0, ${((1 - lift) * vh).toFixed(1)}px, 0)`;
    pre.style.visibility = lift >= 1 ? 'hidden' : '';
    if (hint) hint.style.opacity = p > 0.02 ? 0 : '';
    if (light && lift < 1) {
      light.draw({
        t: clock, pan: { x: 0, y: 0 }, zoom: 0.35, mouse: { x: -9999, y: -9999 }, dim: 0,
        seam: { p: [[vw / 3, vh / 2], [(vw * 2) / 3, vh / 2]], n: [1 / Math.hypot(1, TAN), TAN / Math.hypot(1, TAN)] },
        split: 1, bias: [0, 0, 0], lift: [0, 0, 0], ring: null, face: 0,
      });
    }
    onFrame({ t: clock, dt, p, depth: Math.max(0, p - 1), shown: lift, vw, vh, mouse });
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
  return { get p() { return p; } };
}

/* 一张全屏片元着色器。scale < 1 时按比例降分辨率（CSS 拉满） */
export function quad(canvas, frag, { scale = 0.5 } = {}) {
  const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true });
  const sh = (t, src) => {
    const s = gl.createShader(t);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const pr = gl.createProgram();
  gl.attachShader(pr, sh(gl.VERTEX_SHADER, '#version 300 es\nin vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }'));
  gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, '#version 300 es\nprecision highp float;\nout vec4 o;\n' + frag));
  gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
  gl.useProgram(pr);
  const b = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, b);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(pr, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = {};
  const u = (n) => (U[n] ??= gl.getUniformLocation(pr, n));
  function resize() {
    canvas.width = Math.ceil(innerWidth * scale);
    canvas.height = Math.ceil(innerHeight * scale);
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  resize();
  addEventListener('resize', resize);
  return {
    gl, prog: pr, loc: u,
    set(n, ...v) { const l = u(n); if (!l) return; [gl.uniform1f, gl.uniform2f, gl.uniform3f, gl.uniform4f][v.length - 1].call(gl, l, ...v); },
    draw() { gl.uniform2f(u('uRes'), canvas.width, canvas.height); gl.drawArrays(gl.TRIANGLES, 0, 3); },
  };
}

/* 四个小样共用的页面骨架（检索页那一屏 + 下面那一屏） */
export const SHELL_CSS = `
  #pre, #exp { position: fixed; inset: 0; will-change: transform; }
  #pre { z-index: 2; }
  #exp { z-index: 1; overflow: hidden; background: #07080d; }
  #light { position: absolute; inset: 0; width: 100%; height: 100%; image-rendering: pixelated; }
  #page { position: absolute; inset: 0; pointer-events: none; }
  #gl { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
`;
