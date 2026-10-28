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

   加载幕（2026-10-28 追加）：页面从首帧起盖着一层首页夜色的纯色（#boot-load，见 GrainBoot.astro），
    直到「地面」画出来才揭。流光要等脚本与 WebGL 编译，在那之前 body 是浅灰 #f0f3f6，
    首页的字压在上面几乎看不见——慢加载时看到的其实不是「没有开屏」，是一张发灰的空页。
    开门条件：wander 就绪 + 流光编译完 + 字体到位（后两者各有上限）；门一开先写入开屏第 0 帧，
    再把幕淡掉，于是「纯色 → 一整块夜」之间没有接缝。每次进主页都放演出（2026-10-28 起）；
    不开演出时（减弱动效 / ?grain=0）也走这道幕，只是等地面就绪就揭，不跑时间轴。

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
  /* 兜底已撤幕（脚本迟到）：不再补放开屏 */
  __grainLate?: boolean;
};

const TOTAL = 1780;
const REVEAL_AT = 1480;
const RISE0 = 120; // 起始粗格停住的时间
const RISE1 = 1720; // 收细到 5 屏 px 的时间
const HAND0 = 1540; // 交接开始：真界面露出来、栅格开始淡出
const HAND1 = 1762; // 交接结束：栅格没了，字也回到 0 blur
/* 加载幕：开门条件里「字体到位」最多等这么久（等不到也开门，栅格会在字体到了之后再量一次）；
   淡出时长与 GrainBoot.astro 里 #boot-load 的 transition 对齐 */
const FONT_WAIT = 2500;
const COVER_FADE = 260;

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
  const play = !!w.__grainBoot; // 放不放开屏。不放也有事做：加载幕还等地面就绪才揭（见 run）

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
  const raster: UiRaster | null = play && rasterCv ? createUiRaster(rasterCv) : null;
  /* 加载幕（#boot-load，样式内联在 GrainBoot.astro 里；?load=0 时不点亮，元素还在） */
  const cover = document.getElementById('boot-load');
  const handEls = HAND_SEL.flatMap((s) => [...document.querySelectorAll<HTMLElement>(s)]);

  let wander: WanderBootApi | null = null;
  let coverDown = false;
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

  /* 只在放完之后写这一笔：主页自己不再读它（每次进主页都放），
     但其它页的 BootVeil 靠它决定「会话首访才放碎晶开屏」。半路失败不写（见 bail）。 */
  function markSeen(): void {
    try {
      sessionStorage.setItem('xm-boot-seen', '1');
    } catch {
      /* 隐私模式静默 */
    }
  }

  /* 撤掉加载幕。撤之前手上应该已经有东西可看（开屏第 0 帧 / 地面），否则会露一帧空页。
     head 里的兜底只负责「脚本根本没跑」：这里一动手就把它撤掉，免得它中途把幕摘了。 */
  function liftCover(): void {
    if (w.__grainFallback) {
      clearTimeout(w.__grainFallback);
      w.__grainFallback = undefined;
    }
    if (coverDown) return;
    coverDown = true;
    if (cover) cover.style.opacity = '0';
    setTimeout(() => {
      if (cover) cover.style.display = 'none';
      DOC.removeAttribute('data-boot-load');
    }, COVER_FADE + 30);
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
    liftCover();
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
    /* 半路起不来不写 xm-boot-seen：这次没放成，下次该放还得放 */
    liftCover();
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

  /* 字体到位也是开门条件之一（栅格里的字按真字形量）。等不到也开门——栅格会在字体到了再量一次。 */
  function waitFonts(timeout = FONT_WAIT): Promise<void> {
    if (!document.fonts) return Promise.resolve();
    return new Promise((resolve) => {
      const t = setTimeout(resolve, timeout);
      const done = () => {
        clearTimeout(t);
        resolve();
      };
      document.fonts.ready.then(done, done);
    });
  }

  async function run(): Promise<void> {
    /* head 里的 12s 兜底已经先撤过幕：页面亮着，只把该补的类补上，不再补放一版残缺的开屏 */
    if (w.__grainLate) {
      DOC.classList.add('grain-boot-done');
      DOC.removeAttribute('data-grain-boot');
      DOC.classList.add('booted');
      liftCover();
      return;
    }

    /* 这次不放演出：幕仍然要盖到地面画出来为止——慢加载时先露出的是一张浅灰空页。
       ?load=0 没有幕，直接交给页面。 */
    if (!play) {
      if (!DOC.hasAttribute('data-boot-load')) return;
      const g = await whenWander();
      if (g) {
        g.startLightNow();
        await waitLight(g);
      }
      liftCover();
      return;
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

    /* 开门：地面（WebGL 流光）编译完 + 字体到位，两样各有上限。编译期间主线程被占住，
       屏幕停在那层纯色上——这正是它该在的位置。 */
    api.startLightNow();
    const [lightOk] = await Promise.all([waitLight(api), waitFonts()]);
    if (!lightOk) {
      // 没有 WebGL2：退回 CSS 渐变；仍然把界面按时间轴揭开，不把首页藏死
      console.warn('[grain-boot] 没有可用的 WebGL 流光，退化为栅格 + 文字入场');
    }

    /* 等门的时候兜底把幕撤了（12s 到了）：画面已经亮着，不再补放 */
    if (w.__grainLate) {
      bail('加载幕已按兜底撤下');
      return;
    }

    raster?.sync();
    time = 0;
    startAt = performance.now();
    exposeCtl();
    /* 先把开屏第 0 帧写进去，再揭幕：屏幕上就是「纯色 → 一整块夜」的接力，中间不露空页 */
    apply(0);
    liftCover();
    /* 验收用：?grain-pause=1 起播即停在第 0ms，避免网络/字体等加载把时间跑过去 */
    if (/[?&]grain-pause=1/.test(location.search)) {
      paused = true;
    } else {
      if (!done) raf = requestAnimationFrame(loop);
    }
  }

  run().catch((err) => bail(String(err)));
}
