/* ─────────────────────────────────────────────────────────────
   乱码字引擎（来自 p7-verify「现实检验」，氛围化改造）
   · [data-morph]：双文案元素。平时安静，每 9–14 秒随机一处
     可视元素「走神漂移」几个字再归位；hover / focus 即刻归位。
   · [data-morph][data-faces]：轮换文案（| 分隔），鼠标悬浮时
     乱码过渡到下一面。
   · [data-clock]：钟。换分时有概率乱码一下——钟在梦里漂移。
   无 JS / 读屏时始终呈现醒面真文案（aria-label 固定）。
   ───────────────────────────────────────────────────────────── */

import { easeOut } from './lib';

const POOL = '醒梦之间夜深空site0123456789abcdefghijklmnopqrstuvwxyz·—';
const RM = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

interface MEl {
  el: HTMLElement;
  faces: string[];
  idx: number;
  cur: string;
  raf: number;
  to: number;
  lastHover: number;
}

const els: MEl[] = [];
const rand = (n: number) => Math.floor(Math.random() * n);
const pick = () => POOL[rand(POOL.length)];

function render(target: string, p: number): string {
  const n = Math.floor(p * target.length);
  let out = '';
  for (let i = 0; i < target.length; i++) {
    if (i < n) out += target[i];
    else out += Math.random() < 0.55 ? target[i] : pick();
  }
  return out;
}

function scrambleFace(src: string): string {
  let out = '';
  for (const ch of src) out += Math.random() < 0.55 ? pick() : ch;
  return out;
}

function animate(m: MEl, target: string, dur: number, done?: () => void) {
  cancelAnimationFrame(m.raf);
  clearTimeout(m.to);
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    m.el.textContent = target;
    m.cur = target;
    done?.();
  };
  const t0 = performance.now();
  const step = (now: number) => {
    const p = Math.min((now - t0) / dur, 1);
    m.el.textContent = render(target, easeOut(p));
    if (p < 1 && !finished) m.raf = requestAnimationFrame(step);
    else finish();
  };
  m.raf = requestAnimationFrame(step);
  // 看门狗：rAF 被节流/停转时按时落定，绝不卡在半乱码
  m.to = setTimeout(finish, dur + 400) as unknown as number;
}

function settle(m: MEl) {
  animate(m, m.faces[m.idx] ?? m.cur, 640);
  m.el.classList.add('is-lit');
  setTimeout(() => m.el.classList.remove('is-lit'), 900);
}

function visible(m: MEl): boolean {
  const r = m.el.getBoundingClientRect();
  return r.bottom > 0 && r.top < innerHeight && r.width > 0;
}

function ambientTick() {
  // 进场归位过的元素（文章标题等）不再随机走神；轮换型交给 hover
  const pool = els.filter(
    (m) => visible(m) && !m.el.dataset.faces && m.el.dataset.entrance === undefined,
  );
  if (pool.length) {
    const m = pool[rand(pool.length)];
    const driftTo = m.el.dataset.dream || scrambleFace(m.cur);
    animate(m, driftTo, 520, () => {
      setTimeout(() => {
        if (visible(m)) settle(m);
      }, 950);
    });
  }
  setTimeout(ambientTick, 9000 + rand(5000));
}

function clockTick() {
  for (const el of document.querySelectorAll<HTMLElement>('[data-clock]')) {
    const d = new Date();
    const t = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    if (el.textContent.trim() === t) continue;
    const m = els.find((x) => x.el === el);
    if (!m || RM()) {
      el.textContent = t;
      continue;
    }
    if (Math.random() < 0.4) animate(m, t, 420);
    else {
      m.cur = t;
      el.textContent = t;
    }
  }
}

export function initMorph() {
  for (const el of document.querySelectorAll<HTMLElement>('[data-morph]')) {
    const faces = el.dataset.faces
      ? el.dataset.faces.split('|').map((s) => s.trim())
      : [el.dataset.true || el.textContent.trim()];
    if (!el.getAttribute('aria-label')) el.setAttribute('aria-label', faces[0]);
    const m: MEl = {
      el,
      faces,
      idx: 0,
      cur: faces[0],
      raf: 0,
      to: 0,
      lastHover: 0,
    };
    el.textContent = faces[0];
    els.push(m);

    // 进场归位：先漂一下再落回真文案（文章标题等）
    if (el.dataset.entrance !== undefined && !RM()) {
      const scrambled = scrambleFace(faces[0]);
      setTimeout(() => {
        animate(m, scrambled, 460, () => setTimeout(() => animate(m, faces[0], 640), 160));
      }, 260);
    }

    el.addEventListener('pointerenter', () => {
      if (RM()) return;
      if (el.dataset.faces) {
        const now = performance.now();
        if (now - m.lastHover < 1600) return;
        m.lastHover = now;
        m.idx = (m.idx + 1) % faces.length;
        animate(m, faces[m.idx], 640);
        el.classList.add('is-lit');
        setTimeout(() => el.classList.remove('is-lit'), 900);
      } else if (m.cur !== faces[m.idx]) {
        settle(m);
      }
    });
    el.addEventListener('focus', () => {
      if (!RM() && m.cur !== faces[m.idx]) settle(m);
    });
  }

  if (RM()) return;
  setTimeout(ambientTick, 3500 + rand(3000));
}

if (typeof document !== 'undefined') {
  clockTick();
  setInterval(clockTick, 5000);
}
