/* ─────────────────────────────────────────────────────────────
   版图：一个周期里排什么、排在哪；周期怎样铺开。
   与规则无关——任何规则都在同一张版图上工作。

   平面坐标 (u, v)：周期是 W × H 的矩形，原件在周期 (0, 0)。
   屏上坐标 (x, y)：整张平面沿 14° 斜切（skewY），y = v + SK·(u − XC)。
   于是周期内水平的明暗交界，在屏上就是全站那条 14° 的发丝线；
   方块本身不斜，只按中心的 u 整块下沉，所以一排方块是一级级的台阶。
   ───────────────────────────────────────────────────────────── */
(() => {
  'use strict';
  const K = window.PlaneKit;
  const D = window.PLANE_DATA;

  const W = 2520;
  const H = 1780;
  const SK = Math.tan((14 * Math.PI) / 180);
  const XC = W / 2;

  /* 交界：周期内两条水平线（平面坐标 v）。上半是亮带（浅梦 | 晨光），下半是暗带（深眠 | 异相）。
     一夜绕周期走一圈：浅梦 ↓ 深眠 → 异相 ↑ 晨光 → 下一个周期的浅梦。 */
  const SEAMS = [{ v: 780, light: 'above' }, { v: 0, light: 'below' }];
  const isLightV = (v) => K.color.mod(v, H) < SEAMS[0].v;

  const PAL = {
    shallow: { bg: [225, 231, 239], fg: [35, 40, 48], light: true },
    deep: { bg: [20, 27, 41], fg: [230, 233, 239], light: false },
    rem: { bg: [38, 33, 53], fg: [236, 230, 241], light: false },
    dawn: { bg: [242, 235, 224], fg: [43, 38, 32], light: true },
  };
  const NAMES = {
    shallow: ['随笔', '断章', '可言说的 · SAYABLE'],
    deep: ['项目', '造物', '可构造的 · BUILDABLE'],
    rem: ['瞬间', '闪念', '即逝的 · EPHEMERAL'],
    dawn: ['关于', '此身', '存在于此 · PRESENCE'],
  };
  /* 每个时辰的几处色心（平面坐标）；同侧的时辰之间按高斯加权洇开 */
  const ANCH = {
    shallow: [[420, 300], [860, 500], [200, 620]],
    dawn: [[1800, 380], [2250, 560], [1550, 180]],
    deep: [[420, 1150], [900, 1350], [200, 1550]],
    rem: [[1600, 1180], [2060, 1320], [1450, 1560], [2340, 1060]],
  };

  const A = Object.fromEntries(D.articles.map((a) => [a.slug, a]));
  const P = Object.fromEntries(D.projects.map((p) => [p.slug, p]));
  const M = Object.fromEntries(D.moments.map((m) => [m.slug, m]));
  const CAP = 46; // 图像瞬间下方说明的高度

  const TILES = [];
  const add = (o) => TILES.push({ ...o, idx: TILES.length });
  const imgTile = (slug, k, x, y, w) => {
    const m = M[slug];
    const im = m.images[k - 1];
    const ih = Math.round((w * im.h) / im.w);
    add({ kind: 'img', r: 'rem', x, y, w, h: ih + CAP, ih, ref: m, k, route: `/m/${slug}/${k}` });
  };
  // 随笔 · 浅梦（亮带左）
  add({ kind: 'label', r: 'shallow', x: 170, y: 140, w: 360, h: 40 });
  add({ kind: 'article', r: 'shallow', x: 170, y: 222, w: 452, h: 318, ref: A['co-creation-notes'], route: '/a/co-creation-notes' });
  add({ kind: 'article', r: 'shallow', x: 690, y: 366, w: 410, h: 304, ref: A['style-specimen'], route: '/a/style-specimen' });
  // 关于 · 晨光（亮带右，四周大面积留白）
  add({ kind: 'label', r: 'dawn', x: 1640, y: 190, w: 360, h: 40 });
  add({ kind: 'about', r: 'dawn', x: 1640, y: 272, w: 500, h: 300, ref: D.about, route: '/about' });
  // 项目 · 深眠（暗带左）
  add({ kind: 'label', r: 'deep', x: 170, y: 900, w: 360, h: 40 });
  add({ kind: 'project', r: 'deep', x: 170, y: 982, w: 476, h: 340, ref: P['personal-website'], no: '01', route: '/p/personal-website' });
  add({ kind: 'project', r: 'deep', x: 716, y: 1142, w: 452, h: 322, ref: P['fancytext'], no: '02', route: '/p/fancytext' });
  // 瞬间 · 异相（暗带右）
  add({ kind: 'label', r: 'rem', x: 1330, y: 900, w: 360, h: 40 });
  imgTile('2026-10-04-lacuna-dream', 1, 1330, 982, 324);
  imgTile('2026-10-07-nexus-dev', 1, 1720, 956, 392);
  imgTile('2026-10-07-nexus-dev', 2, 2176, 1030, 300);
  imgTile('2026-10-07-nexus-dev', 3, 1720, 1314, 300);
  imgTile('2026-10-07-nexus-dev', 4, 2084, 1364, 360);
  add({ kind: 'note', r: 'rem', x: 1330, y: 1404, w: 324, h: 204, ref: M['2026-10-03-hello-world'], route: '/m/2026-10-03-hello-world' });

  /* 平面 ↔ 屏上 */
  const drop = (u) => SK * (u - XC);
  const toScreen = (u, v) => ({ x: u, y: v + drop(u) });
  const toPlane = (x, y) => ({ u: x, v: y - drop(x) });

  // 起点（平面坐标）：桌面看见随笔两篇、晨光的一角、交界下深眠的边；手机落在随笔这一列
  const START_P = innerWidth < 640 ? { u: 420, v: 400 } : { u: 880, v: 393 };
  const START = toScreen(START_P.u, START_P.v);

  const sec = (r) => NAMES[r][document.documentElement.dataset.reality === 'dream' ? 1 : 0];

  K.world = { W, H, SK, XC, SEAMS, isLightV, PAL, NAMES, ANCH, TILES, CAP, START, drop, toScreen, toPlane, sec };
})();
