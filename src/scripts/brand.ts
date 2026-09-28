/* ─────────────────────────────────────────────────────────────
   左上角品牌名（Traveritas ↔ AveritA）醒梦双态转换引擎
   · 醒态：静态展示标准 Traveritas（展示衬线体，无动效）
   · 梦态：AveritA（展示衬线体），独立字符 Celeste 风格简谐位置量化浮动
     + 琥珀微扰，按「7步轮转 + 3秒呼吸停歇」循环步进
     · 浮动振幅与琥珀灼点随 --still 收放（SiteHeader.astro 的 keyframes）：
       长按回醒的那 2.2s 里，字渐渐落定；同时这里停住「字母轮转」——
       振幅归零之后，每秒一次的换字就不再是浮动的一部分，只会变成一下突兀的
       跳动。世界在醒，词就先定住，闩锁后再由磨砂溶变换回 Traveritas。
   · 双态切换：磨砂微晕溶变过渡（Frosted Dissolve），如水汽融聚
   · prefers-reduced-motion：停止过渡与轮转，仅做即时文字切换
   ───────────────────────────────────────────────────────────── */

import { reducedMotion } from './lib';
import { onRealityChange, wakeMix, type Reality } from './reality';

const WAKE_WORD = 'Traveritas';
// 梦态 7 字符环形序列：两端始终大写，中间全部小写
const CYCLE_WORDS = [
  'AveritA',
  'VeritaA',
  'EritaaV',
  'RitaavE',
  'ItaaveR',
  'TaaverI',
  'AaveriT',
];

const CADENCE_MS = 1000;
const BREATH_PAUSE_MS = 3000;
const FADE_DUR_MS = 180;
/* 醒度低于此值才算「还在梦里」：长按一过判定窗（260ms）醒度就开始爬升，
   约 40ms 后越过这条线，字母随即停转；中途松手退回梦面时又自动接上。 */
const SETTLED = 0.02;
const SETTLE_POLL_MS = 240;

export function initBrand() {
  const brand = document.querySelector<HTMLElement>('.brand');
  if (!brand) return;
  const el = brand;

  const RM = reducedMotion();
  let step = 0;
  let cycleTimer: number | undefined;
  let transitionTimer: number | undefined;
  let currentReality: Reality = 'wake';
  let isInitialized = false;

  function ensureSpans(length: number) {
    const existing = el.querySelectorAll<HTMLSpanElement>('.brand-char');
    if (existing.length === length) {
      return existing;
    }
    el.innerHTML = '';
    for (let i = 0; i < length; i++) {
      const span = document.createElement('span');
      span.className = 'brand-char';
      span.style.setProperty('--i', String(i));
      el.appendChild(span);
    }
    return el.querySelectorAll<HTMLSpanElement>('.brand-char');
  }

  function updateChars(word: string) {
    const spans = ensureSpans(word.length);
    for (let i = 0; i < word.length; i++) {
      if (spans[i].textContent !== word[i]) {
        spans[i].textContent = word[i];
        spans[i].dataset.ch = word[i]; // 琥珀灼点副本（SiteHeader.astro 的 ::after）
      }
    }
  }

  function tick() {
    if (currentReality !== 'dream' || RM) return;
    // 世界正在醒（长按已过判定窗）：字母原地停转，位移由 --still 收干净。
    // 不换字、也不改 step —— 中途松手退回梦面时从同一个词接着轮转。
    if (wakeMix() > SETTLED) {
      cycleTimer = window.setTimeout(tick, SETTLE_POLL_MS);
      return;
    }
    step = (step + 1) % CYCLE_WORDS.length;
    updateChars(CYCLE_WORDS[step]);

    if (step === 0) {
      // 7 步满一轮，静止呼吸 3 秒
      cycleTimer = window.setTimeout(tick, BREATH_PAUSE_MS);
    } else {
      cycleTimer = window.setTimeout(tick, CADENCE_MS);
    }
  }

  function applyDreamState() {
    window.clearTimeout(cycleTimer);
    step = 0;
    el.classList.remove('is-wake');
    el.classList.add('is-dream');

    if (RM) {
      el.textContent = CYCLE_WORDS[0];
      return;
    }

    updateChars(CYCLE_WORDS[0]);
    cycleTimer = window.setTimeout(tick, CADENCE_MS);
  }

  function applyWakeState() {
    window.clearTimeout(cycleTimer);
    el.classList.remove('is-dream');
    el.classList.add('is-wake');
    el.textContent = WAKE_WORD;
  }

  function transitionTo(r: Reality) {
    window.clearTimeout(transitionTimer);

    // 首次进入页面或开启减弱动画偏好时不播过渡，直接落定
    if (!isInitialized || RM) {
      isInitialized = true;
      if (r === 'dream') applyDreamState();
      else applyWakeState();
      return;
    }

    // 磨砂水汽溶变：先淡出并微虚化
    el.classList.add('is-morphing');
    transitionTimer = window.setTimeout(() => {
      if (r === 'dream') {
        applyDreamState();
      } else {
        applyWakeState();
      }
      // 换完文本后淡入复原
      el.classList.remove('is-morphing');
    }, FADE_DUR_MS);
  }

  onRealityChange((r) => {
    if (isInitialized && currentReality === r) return;
    currentReality = r;
    transitionTo(r);
  });
}
