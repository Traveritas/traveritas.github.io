/* ─────────────────────────────────────────────────────────────
   主页 · 颗粒开屏（二 · 从粗到细 B，2026-10-28 接入；同日第二版「整个界面」）

   第一版：只把真首页自己的 WebGL 流光从「一格 = 整屏」连续收到 1 画布 px，
   界面（字 / 线）自己是清楚的——于是粗格还在的时候，字已经锐利地立在那儿。

   第二版：把界面也交给同一张格。开屏期把字、栏头、时刻、出口、底注与脑电线
   重画进一张和流光「同格」的低分辨率画布（src/scripts/grain-raster.ts），
   开屏末段再把真 DOM 带 blur 站起来——屏幕上于是是「整张画面（光 + 字 + 线）
   一起从粗到细」，而不是只有背景在收细。

   时间轴（ms）：
     0–120        一整块（格比视口还大）
     120–1720     格宽对数式收细到 5 屏 px（= 26 阶）；抖动同时长出来
     380–1300     字的时间轴（栅格拿它们的 alpha 当字多亮；此时真字 visibility: hidden）
     560–1380     脑电线从中心往两端展开
     1480         打 html.booted（入梦 / Ave / 缝线接上）
     1540–1762    交接：栅格淡出、真界面带 blur 站起来（html.grain-handover）
     1780         摘层：还原 inline 样式、交给首页自己

   判定（放不放）在 index.astro 的 <head> 内联脚本里（首帧前执行）；本文件只负责演出。
   window.__grainCtl（截图与验收用）：{ total, ready, pause(), seek(ms), resume() }
   ───────────────────────────────────────────────────────────── */

import { createUiRaster, type UiRaster } from './grain-raster';

interface GrainState {
  cellPx: number;
  lv: number;
  dither: number;
}

interface WanderBootApi {
  setGrain(g: GrainState | null): void;
  setReveal(v: number | null): void;
  finishReveal(): void;
  readonly lightReady: boolean;
  startLightNow(): void;
}

interface GrainCtl {
  total: number;
  ready: boolean;
  pause(): void;
  seek(ms: number): void;
  resume(): void;
}

type GrainWindow = Window & {
  __grainBoot?: boolean;
  __wander?: WanderBootApi;
  __grainCtl?: GrainCtl;
  __grainFallback?: number;
};

const TOTAL = 1780;
const REVEAL_AT = 1480;
const RISE0 = 120; // 起始粗格停住的时间
const RISE1 = 1720; // 收细到 5 屏 px 的时间
const HAND0 = 1540; // 交接开始：真界面露出来、栅格开始淡出
const HAND1 = 1762; // 交接结束：栅格没了，字也回到 0 blur
const BLUR_MAX = 3.0; // 交接起点的真实 blur（≈ 交接时的格宽的一半）

/* 交接时要一起对焦的东西（真界面）；栅格期它们由 GrainBoot.astro 藏住。
   栏头拆成三个 .w-rh 各自成层：给整屏的 #w-heads 挂 blur 等于每帧过滤一张 1440×900 的层。 */
const HAND_SEL = [
  '.w-home-title',
  '.w-rh',
  '.w-home-clock',
  '.w-home-exits',
  '.w-home-hint',
  '#site-eeg-group',
];

const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
const clamp01 = (x: number) => clamp(x, 0, 1);
const seg = (ms: number, a: number, b: number) => clamp01((ms - a) / (b - a));
const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const sstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

export function initGrainBoot(): void {
  const w = window as GrainWindow;
  if (!w.__grainBoot) return; // 不放（reduced-motion / 本会话已看过 / 强制关）：交给 initBoot

  const DOC = document.documentElement;
  const box = document.querySelector<HTMLElement>('.w-home-brand-box');
  const title = document.querySelector<HTMLElement>('.w-home-title');
  const kicker = document.querySelector<HTMLElement>('.w-home-kicker');
  const heads = document.getElementById('w-heads');
  const stage = document.getElementById('w-stage');
  const clock = document.querySelector<HTMLElement>('.w-home-clock');
  const exits = document.querySelector<HTMLElement>('.w-home-exits');
  const hint = document.querySelector<HTMLElement>('.w-home-hint');
  const ts = document.getElementById('ts');
  const lightCv = document.getElementById('w-light');
  const rasterCv = document.getElementById('grain-ui') as HTMLCanvasElement | null;
  const raster: UiRaster | null = rasterCv ? createUiRaster(rasterCv) : null;
  const handEls = HAND_SEL.flatMap((s) => [...document.querySelectorAll<HTMLElement>(s)]);

  let wander: WanderBootApi | null = null;
  let done = false;
  let booted = false;
  let handStarted = false;
  let paused = false;
  let time = 0;
  let startAt = 0;
  let raf = 0;
  /* 字体没到之前先不揭字（流光照常走）；到了再按当前进度显示，避免闪 fallback 字形 */
  let fontsReady = false;
  document.fonts.ready.then(
    () => {
      fontsReady = true;
      raster?.sync();
    },
    () => {
      fontsReady = true;
      raster?.sync();
    },
  );

  const foot = [clock, exits, hint];

  function setOpacity(el: Element | null, v: number | string): void {
    if (el instanceof HTMLElement) el.style.opacity = String(v);
  }

  let lastBlur = -1;
  let lastOp = 1;
  function setHandBlur(px: number): void {
    const q = Math.round(px * 10) / 10;
    if (q === lastBlur) return;
    lastBlur = q;
    const css = q > 0.05 ? `blur(${q.toFixed(1)}px)` : '';
    for (const el of handEls) el.style.filter = css;
  }

  function clearInline(): void {
    for (const el of [title, box, kicker, heads, stage, clock, exits, hint, ts, lightCv]) {
      if (el instanceof HTMLElement) {
        el.style.opacity = '';
        if (el === box) el.style.filter = '';
      }
    }
    for (const el of handEls) el.style.filter = '';
    if (rasterCv) rasterCv.style.opacity = '';
    lastBlur = -1;
    lastOp = 1;
  }

  function markSeen(): void {
    try {
      sessionStorage.setItem('xm-boot-seen', '1');
    } catch {
      /* 隐私模式静默 */
    }
  }

  function cleanup(): void {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    removeEventListener('resize', onResize);
  }

  function finish(): void {
    if (done) return;
    done = true;
    cleanup();
    /* 先加「已开过」的类再摘 data-grain-boot：否则 w-home-focus 的 CSS 动画会补演一次 */
    DOC.classList.add('grain-boot-done');
    DOC.classList.remove('grain-handover');
    DOC.removeAttribute('data-grain-boot');
    DOC.classList.add('booted');
    clearInline();
    raster?.clear();
    wander?.setGrain(null);
    wander?.finishReveal();
    markSeen();
  }

  function bail(reason: string): void {
    if (done) return;
    // eslint-disable-next-line no-console
    console.warn('[grain-boot]', reason);
    cleanup();
    DOC.classList.add('grain-boot-done');
    DOC.classList.remove('grain-handover');
    DOC.removeAttribute('data-grain-boot');
    DOC.classList.add('booted');
    clearInline();
    raster?.clear();
    wander?.setGrain(null);
    wander?.finishReveal();
    markSeen();
    done = true;
  }

  function onResize(): void {
    raster?.sync();
  }

  /* 一帧一帧写：grain 参数给真首页的 WebGL；字 / 线 / 栅格按毫秒写 */
  function apply(ms: number): void {
    const t = clamp(ms, 0, TOTAL);

    /* 流光画布从第一帧就交给开屏；CSS 在 data-grain-boot 期把它藏着，防细流光先闪一帧 */
    setOpacity(lightCv, 1);

    /* 字：这几条 alpha 既是真界面的 opacity，也是栅格里的字有多亮 */
    if (title) title.style.opacity = '1';
    const brandA = fontsReady ? easeInOut(seg(t, 420, 1300)) : 0;
    const kickerA = fontsReady ? easeOut(seg(t, 380, 700)) : 0;
    const headsA = fontsReady ? easeOut(seg(t, 820, 1180)) : 0;
    const footA = fontsReady ? easeOut(seg(t, 1120, 1420)) : 0;
    if (box) {
      box.style.opacity = String(brandA);
      box.style.filter = brandA >= 0.999 ? '' : `blur(${((1 - brandA) * 14).toFixed(2)}px)`;
    }
    setOpacity(kicker, kickerA);
    setOpacity(heads, headsA);
    setOpacity(stage, easeOut(seg(t, 1080, 1480)));
    for (const el of foot) setOpacity(el, footA);
    setOpacity(ts, easeOut(seg(t, 1300, 1560)));

    /* 流光：格宽从「比视口还大」收到 5 屏 px；阶数 3 → 26；抖动从 0 长出来 */
    const p = clamp01((t - RISE0) / (RISE1 - RISE0));
    const startCell = Math.max(innerWidth, innerHeight) * 1.2;
    /* 格宽在很大的范围里变化，用对数插值：人眼看到的「变细速度」才均匀，
       不会前 1 秒都停在很大的块上 */
    const cell = 5 * Math.pow(startCell / 5, 1 - p);
    /* 粗段至少给 16 阶：首页的夜很暗，阶数太低会让整屏色相一跳一跳 */
    const lv = 16 + 10 * Math.pow(p, 2.2);
    const dither = sstep(0.1, 0.72, p);
    wander?.setGrain({ cellPx: cell, lv, dither });

    /* 脑电线：真线由 worker 逐帧画（reveal 决定画到哪儿），栅格里只做降采样 */
    const reveal = easeOut(seg(t, 560, 1380));
    wander?.setReveal(reveal);

    /* 界面栅格：整屏同格；交接段淡出，同时把真界面的 blur 收掉 */
    const hand = easeInOut(seg(t, HAND0, HAND1));
    if (!handStarted && t >= HAND0) {
      handStarted = true;
      DOC.classList.add('grain-handover');
      raster?.sync();
    }
    if (raster && rasterCv) {
      if (hand < 0.999) {
        raster.draw(cell, {
          kicker: kickerA,
          brand: brandA,
          heads: headsA,
          foot: footA,
          line: reveal > 0.001 ? 1 : 0,
        });
        const op = 1 - hand;
        if (Math.abs(op - lastOp) > 0.004) {
          lastOp = op;
          rasterCv.style.opacity = String(op);
        }
      } else if (lastOp !== 0) {
        lastOp = 0;
        raster.clear();
        rasterCv.style.opacity = '0';
      }
    }
    /* 真界面的 blur 只在交接段写：栅格期它们都藏着，提前挂过滤层只是白烧合成 */
    if (t >= HAND0) setHandBlur(hand < 0.999 ? BLUR_MAX * (1 - hand) : 0);
    else if (lastBlur !== 0) setHandBlur(0);

    /* 开屏结束前的最后一段：让页面自己的揭示接上（入梦、Ave、别处） */
    if (t >= REVEAL_AT && !booted) {
      booted = true;
      DOC.classList.add('booted');
    }

    if (t >= TOTAL) finish();
  }

  function loop(now: number): void {
    if (paused) return;
    time = now - startAt;
    apply(time);
    if (time >= TOTAL) {
      finish();
      return;
    }
    raf = requestAnimationFrame(loop);
  }

  function exposeCtl(): void {
    const ctl: GrainCtl = {
      total: TOTAL,
      ready: false,
      pause() {
        paused = true;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
      },
      seek(ms: number) {
        paused = true;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        time = clamp(ms, 0, TOTAL);
        startAt = performance.now() - time;
        apply(time);
      },
      resume() {
        if (done) return;
        paused = false;
        startAt = performance.now() - time;
        raf = requestAnimationFrame(loop);
      },
    };
    w.__grainCtl = ctl;
    requestAnimationFrame(() => {
      ctl.ready = true;
    });
  }

  function whenWander(timeout = 6000): Promise<WanderBootApi | null> {
    return new Promise((resolve) => {
      const t0 = performance.now();
      const tick = () => {
        const api = w.__wander;
        if (api) return resolve(api);
        if (performance.now() - t0 > timeout) return resolve(null);
        setTimeout(tick, 30);
      };
      tick();
    });
  }

  function waitLight(api: WanderBootApi, timeout = 4000): Promise<boolean> {
    return new Promise((resolve) => {
      const t0 = performance.now();
      const tick = () => {
        if (api.lightReady) {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)));
          return;
        }
        if (performance.now() - t0 > timeout) return resolve(false);
        requestAnimationFrame(tick);
      };
      tick();
    });
  }

  async function run(): Promise<void> {
    /* 脚本已经起来了：撤掉 head 里 4.5s 的兜底（它只负责「脚本根本没跑」） */
    if (w.__grainFallback) {
      clearTimeout(w.__grainFallback);
      w.__grainFallback = undefined;
    }
    const api = await whenWander();
    if (!api) {
      bail('wander 没有就绪');
      return;
    }
    wander = api;

    /* 在首帧就把它推到最粗、把线收到中心：不等 WebGL，避免中间闪一帧细流光 */
    api.setGrain({ cellPx: Math.max(innerWidth, innerHeight) * 1.2, lv: 16, dither: 0 });
    api.setReveal(0);

    /* 先量一遍界面的位置（字体到了会再量一次）：开屏首帧就有一张可画的格子 */
    raster?.sync();
    addEventListener('resize', onResize, { passive: true });

    /* 真站的 WebGL 流光是 idle 才编译的；开屏要它，就现在编译（若 wander 已在开屏期
       提前点亮，这里会立刻返回）。编译期间主线程被占住，页面停在「一整块夜」上。 */
    api.startLightNow();
    const ok = await waitLight(api);
    if (!ok) {
      // 没有 WebGL2：退回 CSS 渐变；仍然把界面按时间轴揭开，不把首页藏死
      console.warn('[grain-boot] 没有可用的 WebGL 流光，退化为栅格 + 文字入场');
    }

    raster?.sync();
    time = 0;
    startAt = performance.now();
    exposeCtl();
    apply(0);
    /* 验收用：?grain-pause=1 起播即停在第 0ms，避免网络/字体等加载把时间跑过去 */
    if (/[?&]grain-pause=1/.test(location.search)) {
      paused = true;
    } else {
      if (!done) raf = requestAnimationFrame(loop);
    }
  }

  run().catch((err) => bail(String(err)));
}
