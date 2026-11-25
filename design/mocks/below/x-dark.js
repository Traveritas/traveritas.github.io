/* ─────────────────────────────────────────────────────────────
 below · 闭上眼睛

 往下滚，画面越来越暗，最后几乎全黑。体验交给声音：鼠标的位置就是你「听」的位置。
 黑暗里散着五个声源，靠近哪一个，它就清楚起来（左右声道也跟着偏），同时在那里浮出一点点轮廓——
   低低的嗡声 → 几圈慢慢的环；玻璃的叮 → 敲一下亮一下的一颗星；水 → 几道横着的波纹；
   一个人在哼 → 一个淡淡的身影；很高很细的颤音 → 一撮闪烁的点。
 声音全部用 WebAudio 现场合成（不用音频文件）。浏览器要求先点一下才能出声。
 ───────────────────────────────────────────────────────────── */
import { scrub } from './scrub.js';

const cv = document.getElementById('gl');
const g = cv.getContext('2d');
const ui = document.getElementById('ui');
ui.innerHTML = '<p class="tip" id="tip">点一下，然后用耳朵找</p>';
const tip = document.getElementById('tip');

const SRC = [
  { id: 'drone', x: 0.22, y: 0.32 },
  { id: 'chime', x: 0.76, y: 0.26 },
  { id: 'water', x: 0.52, y: 0.78 },
  { id: 'hum', x: 0.86, y: 0.7 },
  { id: 'shimmer', x: 0.12, y: 0.8 },
];

/* ══ 声音 ══ */
let ac = null;
function startAudio() {
  if (ac) return;
  ac = new AudioContext();
  const master = ac.createGain();
  master.gain.value = 0;
  master.connect(ac.destination);
  SRC.forEach((s) => {
    s.gain = ac.createGain();
    s.gain.gain.value = 0;
    s.pan = ac.createStereoPanner();
    s.gain.connect(s.pan).connect(master);
  });
  const osc = (type, f) => { const o = ac.createOscillator(); o.type = type; o.frequency.value = f; o.start(); return o; };
  // 嗡：两根略微失谐的低正弦 + 一点五度
  { const s = SRC[0], lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400; lp.connect(s.gain);
    for (const [f, a] of [[98, 0.5], [98.6, 0.5], [147, 0.18]]) { const o = osc('sine', f), gg = ac.createGain(); gg.gain.value = a; o.connect(gg).connect(lp); } }
  // 叮：五声音阶里随机挑一个音，三角波 + 很快的衰减，隔一会儿敲一下
  { const s = SRC[1], notes = [880, 988, 1175, 1319, 1568];
    const strike = () => {
      const t = ac.currentTime, o = osc('triangle', notes[(Math.random() * notes.length) | 0]), e = ac.createGain();
      e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(0.5, t + 0.01); e.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
      o.connect(e).connect(s.gain); o.stop(t + 2.5); s.flash = performance.now();
      setTimeout(strike, 1400 + Math.random() * 2200);
    };
    strike(); }
  // 水：白噪声过一个缓缓扫动的带通
  { const s = SRC[2], n = ac.createBufferSource(), buf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    n.buffer = buf; n.loop = true; n.start();
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 1.4;
    const lfo = osc('sine', 0.13), lg = ac.createGain(); lg.gain.value = 380; lfo.connect(lg).connect(bp.frequency);
    const ng = ac.createGain(); ng.gain.value = 0.5; n.connect(bp).connect(ng).connect(s.gain); }
  // 哼：锯齿波过两个共振峰，音高慢慢走
  { const s = SRC[3], o = osc('sawtooth', 196), f1 = ac.createBiquadFilter(), f2 = ac.createBiquadFilter(), mix = ac.createGain();
    f1.type = f2.type = 'bandpass'; f1.frequency.value = 600; f2.frequency.value = 1040; f1.Q.value = f2.Q.value = 6; mix.gain.value = 0.35;
    o.connect(f1).connect(mix); o.connect(f2).connect(mix); mix.connect(s.gain);
    const melody = [196, 220, 196, 175, 196, 165, 175, 196];
    let i = 0; setInterval(() => { o.frequency.setTargetAtTime(melody[i++ % melody.length], ac.currentTime, 0.12); }, 900); }
  // 颤音：很高的正弦 + 震音
  { const s = SRC[4], o = osc('sine', 2093), tg = ac.createGain(), lfo = osc('sine', 5.5), lg = ac.createGain();
    tg.gain.value = 0.12; lg.gain.value = 0.1; lfo.connect(lg).connect(tg.gain); o.connect(tg).connect(s.gain); }
  startAudio.master = master;
}
addEventListener('pointerdown', () => { startAudio(); ac?.resume(); });
addEventListener('keydown', () => { startAudio(); ac?.resume(); });

/* ══ 画 ══ */
function resize() { cv.width = innerWidth; cv.height = innerHeight; }
resize();
addEventListener('resize', resize);
const ear = { x: 0.5, y: 0.5 };
const W = '244,226,206';
function shape(s, a, t, vw, vh) {
  if (a < 0.01) return;
  const x = s.x * vw, y = s.y * vh, R = Math.min(vw, vh);
  g.save();
  g.strokeStyle = `rgba(${W},${a})`;
  g.fillStyle = `rgba(${W},${a})`;
  g.lineWidth = 1;
  if (s.id === 'drone') for (let i = 0; i < 4; i++) { g.globalAlpha = 1 - i * 0.22; g.beginPath(); g.arc(x, y, R * (0.03 + i * 0.03) + Math.sin(t * 0.8 + i) * 2, 0, Math.PI * 2); g.stroke(); }
  if (s.id === 'chime') {
    const fl = s.flash ? Math.exp(-(performance.now() - s.flash) / 600) : 0.3;
    g.globalAlpha = 0.35 + 0.65 * fl;
    const r = R * 0.04;
    for (let k = 0; k < 2; k++) { g.beginPath(); for (let i = 0; i <= 3; i++) { const an = (i / 3) * Math.PI * 2 + (k ? Math.PI : 0) - Math.PI / 2; g[i ? 'lineTo' : 'moveTo'](x + Math.cos(an) * r, y + Math.sin(an) * r); } g.stroke(); }
  }
  if (s.id === 'water') for (let i = -3; i <= 3; i++) { g.globalAlpha = 1 - Math.abs(i) * 0.25; g.beginPath(); const w = R * (0.12 - Math.abs(i) * 0.02); for (let u = -w; u <= w; u += 4) g.lineTo(x + u, y + i * 9 + Math.sin(u * 0.05 + t * 1.5 + i) * 2.5); g.stroke(); }
  if (s.id === 'hum') { g.beginPath(); g.moveTo(x - 9, y + 34); g.lineTo(x - 5, y - 14); g.lineTo(x + 5, y - 14); g.lineTo(x + 9, y + 34); g.closePath(); g.globalAlpha = 0.5; g.fill(); g.globalAlpha = 1; g.beginPath(); g.arc(x, y - 24, 7 + Math.sin(t * 2) * 0.5, 0, Math.PI * 2); g.fill(); }
  if (s.id === 'shimmer') for (let i = 0; i < 18; i++) { const an = i * 2.4, rr = 6 + (i * 7.3) % 40; g.globalAlpha = 0.5 + 0.5 * Math.sin(t * 6 + i * 1.7); g.fillRect(x + Math.cos(an) * rr, y + Math.sin(an) * rr, 1.6, 1.6); }
  g.restore();
}
scrub({
  max: 6,
  onFrame({ t, depth, mouse, vw, vh }) {
    ear.x += (mouse.x - ear.x) * 0.08;
    ear.y += (mouse.y - ear.y) * 0.08;
    const dark = Math.min(1, depth / 0.8); // 越往下越暗
    // 底：还剩一点点光，往下就灭了
    g.fillStyle = '#07080d';
    g.fillRect(0, 0, vw, vh);
    const gr = g.createRadialGradient(vw * 0.5, vh * 0.4, 0, vw * 0.5, vh * 0.4, Math.max(vw, vh) * 0.7);
    gr.addColorStop(0, `rgba(58,54,92,${0.9 * (1 - dark)})`);
    gr.addColorStop(1, 'rgba(7,8,13,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, vw, vh);
    // 耳朵：一团很淡的光
    const ex = ear.x * vw, ey = ear.y * vh;
    const eg = g.createRadialGradient(ex, ey, 0, ex, ey, 90);
    eg.addColorStop(0, `rgba(${W},${0.07 * dark})`);
    eg.addColorStop(1, `rgba(${W},0)`);
    g.fillStyle = eg;
    g.fillRect(ex - 90, ey - 90, 180, 180);
    for (const s of SRC) {
      const dx = (s.x - ear.x) * (vw / vh), dy = s.y - ear.y, d2 = dx * dx + dy * dy;
      const near = Math.exp(-d2 / 0.028);
      shape(s, near * 0.9 * dark, t, vw, vh);
      if (ac && s.gain) {
        s.gain.gain.setTargetAtTime(0.02 + near * 0.9, ac.currentTime, 0.08);
        s.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, dx * 2.4)), ac.currentTime, 0.08);
      }
    }
    if (ac && startAudio.master) startAudio.master.gain.setTargetAtTime(0.35 * Math.min(1, depth / 0.5), ac.currentTime, 0.2);
    tip.style.opacity = ac ? 0 : depth > 0.05 ? 1 : 0;
  },
});
