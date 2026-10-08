/* ─────────────────────────────────────────────────────────────
   关于页 · 退场演出（方案 A「线成为切面」；故事板：design/mocks/about-exit/）
   正文读完后整页钉住，继续下滑只推进进度 p（0→1），往回滚即倒放：
     仪器（缝线、顶部进度线）退、背景音乐开始淡出 → 方块场由外向内一簇簇熄 → 正文自下而上逐字散去 → 标题、页头
     → 脑电线收平、从 14° 转平（经 eeg-spine 的骨架通道，线始终是全站那一根）
     → 晶体从一个点长出来（nexus-slice.ts 的 grow）→ 线下水面亮起碎光 → 线上切片由内向外 → NEXUS。
   钉住：.about-sheet 与 .about-stage 都是 sticky，共用 .about-run 这一段跑道
   （正文高 + RUNWAY 屏演出 + HOLD 屏留驻），跑道走完两者一起滚走、页脚接上；线跟着舞台中心一起走。
   演出走完（p 到 1）后的 HOLD 屏里进度不再推进、舞台也不上移：晶体页定住，多滑这一段才落到页脚。
   只写变量与少量内联样式，且一律写在**消费元素自己**身上：
     .seam-wrap / .hairline 的 --exit-chrome，#site-eeg-group 的 --exit-floor / --exit-edge，
     .about-sky 的 --exit-sky / --sky-y，.about-stage 的 --water / --grow，
     逐字各 span 自己的 --k（只写这一帧变了的那些），方块簇的 opacity 只在变了时写。
     ★ 不写根节点：自定义属性是继承的，往 <html> 写一次就把整棵文档树标记为待重算 ——
     实测单帧样式重算 42ms（构块场 194 块与逐字 328 字全在里面），退场段因此掉到 27fps、
     并成串出现 50–90ms 长任务；改写在消费元素上之后同一次写入只值 0.1ms。
   减动效 / 无脚本：不开演出，正文之后就是静止的晶体页（about.astro 的默认排法）。
   ───────────────────────────────────────────────────────────── */

import { setEegSpine } from './eeg-spine';
import { onScrollRaf, reducedMotion } from './lib';
import type { NexusEl } from './nexus-slice';
import type { DecorEl } from './about-decor';

/* 时间轴：全部以 p 表示，一处改节奏（与故事板一致） */
const T = {
  chrome: [0.0, 0.1],
  music: [0.04, 0.6], // 背景音乐随世界一起退到无
  sky: [0.2, 0.6], // 天色漫上来（about.astro 的 .about-sky）
  field: [0.03, 0.36], // 方块簇由外向内
  text: [0.1, 0.46], // 正文自下而上逐字
  title: [0.4, 0.52],
  head: [0.44, 0.54],
  floor: [0.3, 0.5], // 正文列对线的消隐合拢
  calm: [0.34, 0.62], // 脑电线收平
  level: [0.4, 0.64], // 转平
  grow: [0.64, 0.92], // 晶体从一个点长出来
  water: [0.6, 0.84], // 线下水面（about-decor.ts）
  slices: [0.74, 0.96], // 切片列由内向外
  tag: [0.92, 1.0],
} as const;
const RUNWAY = 2.6; // 钉住后再滑多少屏走完演出
const HOLD = 1.6; // 演出走完后再钉住多少屏：晶体页定住，之后才滚向页脚
const SEAM_DEG = 14;

/** 背景音乐的页内压声（sound.ts 挂在 globalThis 上的那一份；声音没开时只记下数） */
function setSoundScene(level: number) {
  const G = globalThis as typeof globalThis & { __xmScene?: { level: number; apply: (() => void) | null } };
  const hub = (G.__xmScene ??= { level: 1, apply: null });
  if (hub.level === level) return;
  hub.level = level;
  hub.apply?.();
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const smooth = (x: number) => x * x * (3 - 2 * x);
const seg = (p: number, [a, b]: readonly [number, number]) => clamp((p - a) / (b - a), 0, 1);

/** 一个逐字：自己的阈值 a（p 走到这里开始散）与上一帧写下的 k（0 实 → 1 散） */
interface Char {
  el: HTMLElement;
  a: number;
  k: number;
}

export function initAboutExit() {
  const run = document.querySelector<HTMLElement>('.about-run');
  const sheet = run?.querySelector<HTMLElement>('.about-sheet');
  const stage = run?.querySelector<DecorEl>('.about-stage');
  if (!run || !sheet || !stage || reducedMotion()) return;

  const root = document.documentElement;
  root.setAttribute('data-exit-on', '');

  /* 退场的三个变量写在**各自的消费元素**上，不写根节点（见文件头）。
     消费方只有三处：.seam-wrap 与 .hairline 读 --exit-chrome（见各组件），
     #site-eeg-group 读 --exit-floor / --exit-edge（Eeg.astro 的中央消隐合拢与两端渐隐）。 */
  const chromeEls = [
    document.querySelector<HTMLElement>('.seam-wrap'),
    document.querySelector<HTMLElement>('.hairline'),
  ];
  const eegGroup = document.getElementById('site-eeg-group');

  const header = document.querySelector<HTMLElement>('.site-header');
  const title = sheet.querySelector<HTMLElement>('.page-head');
  const prose = sheet.querySelector<HTMLElement>('.about-prose');
  const slices = [...stage.querySelectorAll<SVGSVGElement>('.about-slice')];
  const decor = (stage.decor ??= { show: 1 });
  const tag = stage.querySelector<HTMLElement>('.about-tag');
  const sky = run.querySelector<HTMLElement>('.about-sky');
  const crystal = stage.querySelector<NexusEl>('.nexus-slice');
  const ctl = crystal ? (crystal.nexus ??= { grow: 1, line: 0 }) : null;
  if (ctl) ctl.grow = 0;

  /* ── 正文逐字：文本节点拆成一字一个 span，阈值 a 按段落自下而上 + 段内随机 ──
     阈值只留在 JS 侧的这张表里，不再挂到字上：每帧由 apply 按 p 算出 k，
     只写真正在变的那些字（见那里的逐字段）。 */
  let chars: Char[] | null = null;
  if (prose) {
    const list: Char[] = [];
    const blocks = [...prose.children] as HTMLElement[];
    let seed = 11;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const [t0, t1] = T.text;
    blocks.forEach((el, bi) => {
      const order = (blocks.length - 1 - bi) / Math.max(1, blocks.length - 1); // 最后一段先走
      const base = t0 + order * (t1 - t0 - 0.1);
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const nodes: Text[] = [];
      while (walker.nextNode()) nodes.push(walker.currentNode as Text);
      for (const tn of nodes) {
        const frag = document.createDocumentFragment();
        for (const ch of tn.data) {
          if (/\s/.test(ch)) {
            frag.append(ch);
            continue;
          }
          const s = document.createElement('span');
          s.className = 'xc';
          s.textContent = ch;
          frag.append(s);
          list.push({ el: s, a: +(base + rnd() * 0.06).toFixed(3), k: 0 });
        }
        tn.replaceWith(frag);
      }
    });
    chars = list;
  }

  /* ── 钉住的几何 ── */
  let sheetH = 0;
  let pinStart = 0;
  let pinEnd = 0; // 演出 + 留驻都走完、舞台开始随页面上移的那一刻
  function layout() {
    sheetH = sheet!.offsetHeight;
    const H = innerHeight;
    sheet!.style.top = Math.min(0, H - sheetH) + 'px';
    run!.style.height = sheetH + H * (RUNWAY + HOLD) + 'px';
    pinStart = run!.getBoundingClientRect().top + scrollY + sheetH - H;
    pinEnd = pinStart + H * (RUNWAY + HOLD);
  }

  /* ── 方块簇：进入演出时按到画面中心的距离排一次名，远的先熄 ── */
  let clusters: { el: HTMLElement; rank: number; last: number }[] | null = null;
  function rankClusters() {
    const W = innerWidth,
      H = innerHeight;
    const all = [...document.querySelectorAll<HTMLElement>('.fld-cl')].map((el) => {
      const r = el.getBoundingClientRect();
      const d = Math.hypot(r.left / W - 0.5, (r.top / H - 0.5) * 0.62);
      return { el, d, rank: 0, last: 1 };
    });
    const sorted = [...all].sort((a, b) => b.d - a.d);
    sorted.forEach((c, i) => (c.rank = i / Math.max(1, sorted.length - 1)));
    return all;
  }
  function releaseClusters() {
    if (!clusters) return;
    for (const c of clusters) c.el.style.opacity = '';
    clusters = null;
  }

  /* ── 应用一个进度 ── */
  let spineOn = false;
  let lastP = -1;
  function apply() {
    const H = innerHeight,
      W = innerWidth;
    const p = clamp((scrollY - pinStart) / (H * RUNWAY), 0, 1);
    // 舞台中心：钉住期间（含走完后的 HOLD 段）在视口正中，跑道走完后随舞台一起上移（按滚动算，不读布局）
    const cy = H / 2 - Math.max(0, scrollY - pinEnd);

    // 线：p > 0 才接管骨架；回到 0 交还给默认的 14° 直线（与没有演出时逐字一致）
    if (p > 0) {
      const lv = smooth(seg(p, T.level));
      const ang = (SEAM_DEG * (1 - lv) * Math.PI) / 180;
      const half = Math.hypot(W, H) / 2 + 60;
      const dx = Math.cos(ang) * half,
        dy = Math.sin(ang) * half;
      setEegSpine({
        xy: new Float32Array([W / 2 - dx, cy - dy, W / 2 + dx, cy + dy]),
        amp: 1 - smooth(seg(p, T.calm)),
        dark: 0,
        reveal: 1,
        dot: null,
      });
      spineOn = true;
    } else if (spineOn) {
      setEegSpine({ xy: null, amp: 1 });
      spineOn = false;
    }
    if (ctl) ctl.line = smooth(seg(p, T.level));
    sky?.style.setProperty('--sky-y', (cy - H / 2).toFixed(1) + 'px');

    if (p === lastP) return;
    lastP = p;

    setSoundScene(+((1 - smooth(seg(p, T.music))) ** 2).toFixed(3)); // 平方：听感上匀着退
    const kChrome = smooth(seg(p, T.chrome)).toFixed(3);
    for (const el of chromeEls) el?.style.setProperty('--exit-chrome', kChrome);
    sky?.style.setProperty('--exit-sky', smooth(seg(p, T.sky)).toFixed(3));
    eegGroup?.style.setProperty('--exit-floor', smooth(seg(p, T.floor)).toFixed(3));
    eegGroup?.style.setProperty('--exit-edge', smooth(seg(p, T.level)).toFixed(3));

    // 方块簇
    if (p > 0) {
      clusters ??= rankClusters();
      const [f0, f1] = T.field;
      for (const c of clusters) {
        const a = f0 + c.rank * (f1 - f0 - 0.06);
        const o = 1 - smooth(clamp((p - a) / 0.06, 0, 1));
        if (Math.abs(o - c.last) > 0.004) {
          c.el.style.opacity = o >= 1 ? '' : o.toFixed(3);
          c.last = o;
        }
      }
    } else releaseClusters();

    // 文字：k 的斜率是 25（一个字约两三帧走完），任一时刻在过渡的只有三四十个 ——
    // 写全部 328 个等于每帧多花 13ms 的样式重算，所以只写这一帧真的变了的
    if (chars) {
      for (const c of chars) {
        const k = clamp((p - c.a) * 25, 0, 1);
        if (Math.abs(k - c.k) > 0.004) {
          c.el.style.setProperty('--k', k.toFixed(3));
          c.k = k;
        }
      }
    }
    const tk = smooth(seg(p, T.title));
    if (title) {
      title.style.opacity = tk ? String(1 - tk) : '';
      title.style.filter = tk ? `blur(${(tk * 3).toFixed(2)}px)` : '';
    }
    const hk = smooth(seg(p, T.head));
    if (header) header.style.opacity = hk ? String(1 - hk) : '';

    // 舞台
    const wv = smooth(seg(p, T.water));
    stage!.style.setProperty('--water', wv.toFixed(3));
    decor.show = Math.max(wv, seg(p, T.slices)); // 两样都还没显现时，about-decor 不画
    const [k0, k1] = T.slices;
    for (const el of slices) {
      const i = Number(el.dataset.i ?? 0);
      const a = k0 + (i / 4) * (k1 - k0 - 0.06);
      el.style.opacity = smooth(clamp((p - a) / 0.06, 0, 1)).toFixed(3);
    }
    if (tag) tag.style.opacity = smooth(seg(p, T.tag)).toFixed(3);
    const g = seg(p, T.grow);
    if (ctl) ctl.grow = g;
    stage!.style.setProperty('--grow', smooth(g).toFixed(3)); // 静帧图（画布没起来时）跟着淡入
  }

  layout();
  apply();
  onScrollRaf(() => {
    if (sheetH !== sheet.offsetHeight) layout();
    apply();
  });
  addEventListener('resize', () => {
    layout();
    lastP = -1;
    apply();
  });
  new ResizeObserver(() => {
    layout();
    lastP = -1;
    apply();
  }).observe(sheet);
  // 字体换上后正文会变高：上面的 ResizeObserver 接得住；这里只是兜底
  document.fonts?.ready.then(() => {
    layout();
    lastP = -1;
    apply();
  });
}

