/* ─────────────────────────────────────────────────────────────
   乱码字引擎（来自 p7-verify「现实检验」，氛围化改造）
   · [data-morph]：双文案元素。平时安静，每 9–14 秒随机一处
     可视元素「走神漂移」几个字再归位；focus 即刻归位。
     （鼠标悬浮换字已移除——梦/醒双态由入梦检验承担）
   · [data-morph][data-dream]：梦/醒双面元素（入梦检验机制用，
     见 reality.ts）。当前现实面由 setMorphReality 决定：
     梦态走神＝纯乱码扰动；醒态不参与走神。
   · [data-clock]：钟。换分时梦态有概率乱码一下——钟在梦里漂移，
     醒态稳定。
   无 JS / 读屏时始终呈现醒面真文案（aria-label 固定）。
   ───────────────────────────────────────────────────────────── */

import { easeOut } from './lib';

export type MorphReality = 'dream' | 'wake';

export interface Dual {
  el: HTMLElement;
  dream: string;
  wake: string;
  /** 线到达其横向位置的距离阈值（reality.ts 按压时测量） */
  dx: number;
  flipped: boolean;
}

const POOL = '醒梦之间夜深空site0123456789abcdefghijklmnopqrstuvwxyz·—';
const RM = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

let realityFace: MorphReality = 'wake';
let holdPause = false; // 入梦检验按住/定格期间暂停走神（reality.ts 控制）
const duals: Dual[] = [];

interface MEl {
  el: HTMLElement;
  faces: string[];
  idx: number;
  cur: string;
  raf: number;
  to: number;
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
  if (dur <= 0) {
    finish();
    return;
  }
  const t0 = performance.now();
  let lastTick = 0;
  const step = (now: number) => {
    const p = Math.min((now - t0) / dur, 1);
    if (p >= 1) {
      finish();
      return;
    }
    // 节流至 ~30fps（约 32ms 间隔）：大幅削减 DOM 文本高频重排，且走神字符跳变更加清晰有节奏
    if (now - lastTick >= 32) {
      lastTick = now;
      m.el.textContent = render(target, easeOut(p));
    }
    if (!finished) m.raf = requestAnimationFrame(step);
  };
  m.raf = requestAnimationFrame(step);
  // 看门狗：rAF 被节流/停转时按时落定，绝不卡在半乱码
  m.to = setTimeout(finish, dur + 400) as unknown as number;
}

function settle(m: MEl) {
  animate(m, faceOf(m), 640);
  m.el.classList.add('is-lit');
  setTimeout(() => m.el.classList.remove('is-lit'), 900);
}

/** 当前现实面下该元素应呈现的文案（非 dual 维持原轮换逻辑） */
function faceOf(m: MEl): string {
  if (m.el.dataset.dream !== undefined) {
    return realityFace === 'dream' ? m.el.dataset.dream : (m.faces[m.idx] ?? m.cur);
  }
  return m.faces[m.idx] ?? m.cur;
}

/** 供入梦检验机制（reality.ts）使用的现实面切换 */
export function setMorphReality(face: MorphReality) {
  realityFace = face;
}

/** 按住/定格期间暂停走神（避免与线的逐个换面打架） */
export function setMorphPause(v: boolean) {
  holdPause = v;
}

/** 双面元素清单（含线到达阈值与翻转状态，由 reality.ts 驱动） */
export function getDuals(): Dual[] {
  return duals;
}

/** 对任意注册元素执行一次乱码过渡（dur=0 或 RM 直接落定） */
export function morphText(el: HTMLElement, target: string, dur: number) {
  const m = els.find((x) => x.el === el);
  if (!m) {
    el.textContent = target;
    return;
  }
  animate(m, target, dur);
}

function visible(m: MEl): boolean {
  const r = m.el.getBoundingClientRect();
  return r.bottom > 0 && r.top < innerHeight && r.width > 0;
}

function ambientTick() {
  if (holdPause) {
    setTimeout(ambientTick, 9000 + rand(5000));
    return;
  }
  // 进场归位过的元素（文章标题等）不再随机走神；
  // 醒态下双面元素不参与走神（醒面该是稳的）
  const pool = els.filter(
    (m) =>
      visible(m) &&
      !m.el.dataset.faces &&
      m.el.dataset.entrance === undefined &&
      !(m.el.dataset.dream !== undefined && realityFace === 'wake'),
  );
  if (pool.length) {
    const m = pool[rand(pool.length)];
    // 走神＝纯乱码扰动，再归回当前面（双面元素此刻只会在梦面，见上方 pool 的过滤）
    animate(m, scrambleFace(m.cur), 520, () => {
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
    // 文本可能正处乱码漂移，读屏时刻以 aria-label 为准
    const label = `当前时刻 ${t}`;
    if (el.getAttribute('aria-label') !== label) el.setAttribute('aria-label', label);
    if (el.textContent.trim() === t) continue;
    const m = els.find((x) => x.el === el);
    if (!m || RM()) {
      el.textContent = t;
      continue;
    }
    // 钟在梦里漂移：乱码换分只在梦态发生，醒态钟是稳的
    if (realityFace === 'dream' && Math.random() < 0.4) animate(m, t, 420);
    else {
      m.cur = t;
      el.textContent = t;
    }
  }
}

export function initMorph() {
  clockTick();
  setInterval(clockTick, 5000);

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
    };
    el.textContent = faces[0];
    els.push(m);
    if (el.dataset.dream !== undefined) {
      duals.push({ el, dream: el.dataset.dream, wake: faces[0] ?? el.textContent.trim(), dx: 1e4, flipped: false });
    }

    // 进场归位：先漂一下再落回当前现实面（文章标题等）
    if (el.dataset.entrance !== undefined && !RM()) {
      const scrambled = scrambleFace(faces[0]);
      setTimeout(() => {
        animate(m, scrambled, 460, () => setTimeout(() => animate(m, faceOf(m), 640), 160));
      }, 260);
    }

    el.addEventListener('focus', () => {
      if (!RM() && m.cur !== faceOf(m)) settle(m);
    });
  }

  if (RM()) return;
  setTimeout(ambientTick, 3500 + rand(3000));
}

