/* ─────────────────────────────────────────────────────────────
   无界平铺 · 越远的记得越少
   一个周期（W × H）里排着全站的内容；平面按周期无限重复。
   原件只有一份（周期 0,0），离它越远的副本记得越少：
   字被截短、配图降采样成更粗的像素、颜色褪向夜色，最远处只剩色块。
   ───────────────────────────────────────────────────────────── */
(() => {
  'use strict';
  const D = window.PLANE_DATA;
  const $ = (s, r = document) => r.querySelector(s);
  const root = document.documentElement;
  const stage = $('#stage');
  const field = $('#field');
  const recede = $('#recede');
  const world = $('#world');
  const haze = $('#haze');
  const dim = $('#dim');
  const chrome = $('#chrome');
  const homeBtn = $('#home-btn');
  const tocBtn = $('#toc-btn');
  const toc = $('#toc');
  const realBtn = $('#real-btn');
  const live = $('#live');
  const brand = $('#brand');
  const ctl = $('.ctl');

  const mqRM = matchMedia('(prefers-reduced-motion: reduce)');
  let RM = mqRM.matches;
  mqRM.addEventListener('change', (e) => (RM = e.matches));
  const dur = (ms) => (RM ? 0 : ms);

  /* ══ 1 · 周期与版图 ══ */
  const W = 2520;
  const H = 1720;
  // 起点：桌面看见随笔两篇、项目一件、关于与瞬间的边；手机竖屏落在随笔与关于这一列
  const START_D = { x: 960, y: 570 };
  const START_M = { x: 470, y: 700 };
  const START = { ...(innerWidth < 640 ? START_M : START_D) };

  const PAL = {
    shallow: { bg: [225, 231, 239], fg: [35, 40, 48] },
    deep: { bg: [20, 27, 41], fg: [230, 233, 239] },
    rem: { bg: [38, 33, 53], fg: [236, 230, 241] },
    dawn: { bg: [242, 235, 224], fg: [43, 38, 32] },
  };
  const NAMES = {
    shallow: ['随笔', '断章', '可言说的 · SAYABLE'],
    deep: ['项目', '造物', '可构造的 · BUILDABLE'],
    rem: ['瞬间', '闪念', '即逝的 · EPHEMERAL'],
    dawn: ['关于', '此身', '存在于此 · PRESENCE'],
  };
  /* 每个时辰的几处色心（周期内坐标）；底色按环面距离做高斯加权、再锐化，交界处自然洇开 */
  const ANCH = {
    shallow: [[420, 300], [860, 520], [200, 640]],
    deep: [[1640, 280], [2140, 470], [2400, 160]],
    rem: [[1560, 1140], [2060, 1300], [1420, 1460], [2340, 1080]],
    dawn: [[400, 1180], [720, 1420], [180, 1520]],
  };
  const SIG = 400;
  const SHARP = 4;

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
  // 随笔 · 浅梦
  add({ kind: 'label', r: 'shallow', x: 170, y: 150, w: 360, h: 40 });
  add({ kind: 'article', r: 'shallow', x: 170, y: 232, w: 452, h: 318, ref: A['co-creation-notes'], route: '/a/co-creation-notes' });
  add({ kind: 'article', r: 'shallow', x: 690, y: 376, w: 410, h: 304, ref: A['style-specimen'], route: '/a/style-specimen' });
  // 项目 · 深眠
  add({ kind: 'label', r: 'deep', x: 1330, y: 150, w: 360, h: 40 });
  add({ kind: 'project', r: 'deep', x: 1330, y: 232, w: 476, h: 340, ref: P['personal-website'], no: '01', route: '/p/personal-website' });
  add({ kind: 'project', r: 'deep', x: 1876, y: 392, w: 452, h: 322, ref: P['fancytext'], no: '02', route: '/p/fancytext' });
  // 瞬间 · 异相
  add({ kind: 'label', r: 'rem', x: 1330, y: 836, w: 360, h: 40 });
  imgTile('2026-10-04-lacuna-dream', 1, 1330, 918, 324);
  imgTile('2026-10-07-nexus-dev', 1, 1720, 892, 392);
  imgTile('2026-10-07-nexus-dev', 2, 2176, 966, 300);
  imgTile('2026-10-07-nexus-dev', 3, 1720, 1250, 300);
  imgTile('2026-10-07-nexus-dev', 4, 2084, 1300, 360);
  add({ kind: 'note', r: 'rem', x: 1330, y: 1340, w: 324, h: 204, ref: M['2026-10-03-hello-world'], route: '/m/2026-10-03-hello-world' });
  // 关于 · 晨光
  add({ kind: 'label', r: 'dawn', x: 300, y: 920, w: 360, h: 40 });
  add({ kind: 'about', r: 'dawn', x: 300, y: 1002, w: 500, h: 300, ref: D.about, route: '/about' });

  /* ══ 2 · 颜色 ══ */
  const lin = (c) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const gam = (c) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
  function toLab([r, g, b]) {
    r = lin(r); g = lin(g); b = lin(b);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
  }
  function fromLab([L, a, b]) {
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
    return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s].map((v) => Math.max(0, Math.min(255, Math.round(gam(v)))));
  }
  const mixLab = (a, b, t) => fromLab(toLab(a).map((v, i) => v + (toLab(b)[i] - v) * t));
  const rgb = (c, a = 1) => (a >= 1 ? `rgb(${c[0]} ${c[1]} ${c[2]})` : `rgb(${c[0]} ${c[1]} ${c[2]} / ${a.toFixed(3)})`);
  const mod = (a, n) => ((a % n) + n) % n;

  let LAB = {};
  const WARM = [196, 160, 124];
  function paletteFor(reality) {
    LAB = {};
    for (const r in PAL) {
      let c = PAL[r].bg;
      if (reality === 'dream') {
        // 梦面：整片暖一点、暗一点
        c = mixLab(c, WARM, 0.12);
        const lab = toLab(c);
        lab[0] *= 0.955;
        c = fromLab(lab);
      }
      LAB[r] = toLab(c);
    }
  }
  function weights(x, y) {
    const w = {};
    let sum = 0;
    for (const r in ANCH) {
      let a = 0;
      for (const [ax, ay] of ANCH[r]) {
        let dx = Math.abs(x - ax);
        dx = Math.min(dx, W - dx);
        let dy = Math.abs(y - ay);
        dy = Math.min(dy, H - dy);
        a += Math.exp(-(dx * dx + dy * dy) / (2 * SIG * SIG));
      }
      a = (a + 1e-9) ** SHARP;
      w[r] = a;
      sum += a;
    }
    for (const r in w) w[r] /= sum;
    return w;
  }
  function fieldLab(x, y) {
    const w = weights(mod(x, W), mod(y, H));
    const o = [0, 0, 0];
    for (const r in w) for (let i = 0; i < 3; i++) o[i] += LAB[r][i] * w[r];
    return o;
  }
  /* 一个周期的底色画成 290×200 的小图，作平铺背景放大；双线性放大本身就是柔边 */
  function paintField() {
    const gw = 290;
    const gh = 200;
    const c = document.createElement('canvas');
    c.width = gw;
    c.height = gh;
    const ctx = c.getContext('2d');
    const im = ctx.createImageData(gw, gh);
    for (let y = 0; y < gh; y++)
      for (let x = 0; x < gw; x++) {
        const col = fromLab(fieldLab(((x + 0.5) * W) / gw, ((y + 0.5) * H) / gh));
        const o = (y * gw + x) * 4;
        im.data[o] = col[0];
        im.data[o + 1] = col[1];
        im.data[o + 2] = col[2];
        im.data[o + 3] = 255;
      }
    ctx.putImageData(im, 0, 0);
    field.style.backgroundImage = `url(${c.toDataURL()})`;
  }

  /* ══ 3 · 遗忘：距离 → 记忆档 ══
     原件 0 档；副本至少 1 档，按副本中心到原件周期中心的距离（以周期为单位）逐档变粗。
     5 档以外不再变，只是色块越来越稀。 */
  const LV_START = 0.55;
  const LV_STEP = 0.62;
  function levelOf(t, i, j) {
    if (i === 0 && j === 0) return 0;
    const cx = (t.x + t.w / 2 + i * W - W / 2) / W;
    const cy = (t.y + t.h / 2 + j * H - H / 2) / H;
    const r = Math.hypot(cx, cy);
    return Math.max(1, Math.min(5, 1 + Math.floor((r - LV_START) / LV_STEP)));
  }
  function hash(a, b, c) {
    let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  const JITTER = [0, 0, 0, 7, 22, 52];

  /* 配图的各档副本：降采样 + 去饱和 + 褪向夜色，预先画好，不在大量元素上挂实时滤镜 */
  const BLOCK = [0, 10, 14, 32];
  const SAT = [1, 0.7, 0.48, 0.28];
  const FOG = [0, 0.14, 0.3, 0.46];
  const variants = new Map(); // `${slug}/${k}` → { 1: url, 2: url, 3: url, avg: [r,g,b] }
  async function buildVariants() {
    const fog = PAL.rem.bg;
    for (const t of TILES.filter((t) => t.kind === 'img')) {
      const im = t.ref.images[t.k - 1];
      const img = new Image();
      img.src = im.m;
      try { await img.decode(); } catch { continue; }
      const v = {};
      for (let lv = 1; lv <= 3; lv++) {
        const cw = Math.max(2, Math.round(t.w / BLOCK[lv]));
        const ch = Math.max(2, Math.round(t.ih / BLOCK[lv]));
        const bmp = await createImageBitmap(img, { resizeWidth: cw, resizeHeight: ch, resizeQuality: 'high' });
        const c = document.createElement('canvas');
        c.width = cw;
        c.height = ch;
        const ctx = c.getContext('2d');
        ctx.drawImage(bmp, 0, 0);
        const d = ctx.getImageData(0, 0, cw, ch);
        for (let p = 0; p < d.data.length; p += 4) {
          const [r, g, b] = [d.data[p], d.data[p + 1], d.data[p + 2]];
          const l = 0.3 * r + 0.59 * g + 0.11 * b;
          for (let q = 0; q < 3; q++) {
            const s = l + ([r, g, b][q] - l) * SAT[lv];
            d.data[p + q] = s * (1 - FOG[lv]) + fog[q] * FOG[lv];
          }
        }
        ctx.putImageData(d, 0, 0);
        v[lv] = await new Promise((res) => c.toBlob((b) => res(URL.createObjectURL(b))));
      }
      const one = await createImageBitmap(img, { resizeWidth: 1, resizeHeight: 1, resizeQuality: 'high' });
      const c1 = document.createElement('canvas');
      c1.width = c1.height = 1;
      c1.getContext('2d').drawImage(one, 0, 0);
      const px = c1.getContext('2d').getImageData(0, 0, 1, 1).data;
      v.avg = [px[0], px[1], px[2]];
      variants.set(`${t.ref.slug}/${t.k}`, v);
    }
    for (const rec of nodes.values()) if (rec.t.kind === 'img') { rec.drawn = -1; apply(rec); }
  }

  /* ══ 4 · 方块的各档写法 ══ */
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const chars = (s) => Array.from(s);
  const cut = (s, n) => chars(s).slice(0, n).join('');
  const cutPct = (s, p, min = 3) => cut(s, Math.max(min, Math.ceil(chars(s).length * p)));
  const dot = (d) => d.slice(0, 10).replace(/-/g, ' · ');
  const ym = (d) => d.slice(0, 7).replace(/-/g, ' · ');
  const trail = (s) => `<span class="trail">${esc(s)}</span>`;
  const bars = (ws) => `<span class="bars" aria-hidden="true">${ws.map((w) => `<i style="width:${w}%"></i>`).join('')}</span>`;
  const sec = (r) => NAMES[r][root.dataset.reality === 'dream' ? 1 : 0];
  const titleAt = (s, lv) => (lv === 0 ? esc(s) : lv === 1 ? trail(cutPct(s, 0.6, 4)) : lv === 2 ? esc(cut(s, 3)) : esc(cut(s, 1)));
  const paras = (s) => s.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);

  function inner(t, lv) {
    const a = t.ref;
    switch (t.kind) {
      case 'label':
        if (lv === 0) return `<span class="nm">${sec(t.r)}</span><span class="pr">${NAMES[t.r][2]}</span><span class="rule"></span>`;
        if (lv === 1) return `<span class="nm">${sec(t.r)}</span><span class="rule"></span>`;
        return `<span class="rule"></span>`;
      case 'article':
        if (lv === 0)
          return `<div class="t-in"><p class="meta" data-f="meta"><span class="sec">${sec(t.r)}</span><time>${dot(a.date)}</time></p><h3 class="ttl" data-f="title">${esc(a.title)}</h3><p class="desc" data-f="desc">${esc(a.desc)}</p><p class="foot"><span>${a.chars} 字</span><span>${a.tags.slice(0, 2).map(esc).join(' · ')}</span></p></div>`;
        if (lv === 1) return `<div class="t-in"><p class="meta" data-f="meta"><time>${ym(a.date)}</time></p><h3 class="ttl" data-f="title">${titleAt(a.title, 1)}</h3><p class="desc" data-f="desc">${trail(cutPct(a.desc, 0.4))}</p></div>`;
        if (lv === 2) return `<div class="t-in"><p class="meta" data-f="meta"><time>${a.date.slice(0, 4)}</time></p><h3 class="ttl" data-f="title">${titleAt(a.title, 2)}</h3>${bars([86, 58])}</div>`;
        return `<div class="t-in"><h3 class="ttl" data-f="title">${titleAt(a.title, 3)}</h3>${bars([52])}</div>`;
      case 'project': {
        const ghost = lv <= 2 ? `<span class="ghost" aria-hidden="true">${t.no}</span>` : '';
        if (lv === 0)
          return `${ghost}<div class="t-in"><p class="meta" data-f="meta"><span class="sec">${sec(t.r)}</span><time>${dot(a.date)}</time></p><h3 class="ttl" data-f="title">${esc(a.title)}</h3><p class="desc" data-f="desc">${esc(a.desc)}</p><p class="foot"><span class="status">${esc(a.status)}</span></p></div>`;
        if (lv === 1) return `${ghost}<div class="t-in"><p class="meta" data-f="meta"><time>${ym(a.date)}</time></p><h3 class="ttl" data-f="title">${titleAt(a.title, 1)}</h3><p class="desc" data-f="desc">${trail(cutPct(a.desc, 0.4))}</p></div>`;
        if (lv === 2) return `${ghost}<div class="t-in"><p class="meta" data-f="meta"><time>${a.date.slice(0, 4)}</time></p><h3 class="ttl" data-f="title">${titleAt(a.title, 2)}</h3>${bars([80, 50])}</div>`;
        return `<div class="t-in"><h3 class="ttl" data-f="title">${titleAt(a.title, 3)}</h3>${bars([48])}</div>`;
      }
      case 'img': {
        const im = a.images[t.k - 1];
        const v = variants.get(`${a.slug}/${t.k}`);
        const cap = a.images.length > 1 ? `${a.title} · ${im.alt}` : a.title;
        const src = lv === 0 ? im.m : v ? v[lv] : '';
        const img = src ? `<img ${lv ? `class="${lv >= 2 ? 'px' : ''}" alt=""` : `alt="${esc(im.alt)}"`} src="${src}" draggable="false" decoding="async">` : '';
        const ph = `<div class="ph" data-f="img" style="height:${t.ih}px">${img}</div>`;
        if (lv === 0) return `${ph}<p class="cap"><b data-f="title">${esc(cap)}</b><span data-f="meta">${dot(a.date).slice(7)}</span></p>`;
        if (lv === 1) return `${ph}<p class="cap"><b data-f="title">${trail(cutPct(cap, 0.5, 3))}</b><span data-f="meta">${dot(a.date).slice(7, 9)}</span></p>`;
        if (lv === 2) return `${ph}<p class="cap"><b data-f="title">${esc(cut(cap, 2))}</b></p>`;
        return ph;
      }
      case 'note': {
        const [l1 = '', l2 = ''] = paras(a.text);
        if (lv === 0) return `<div class="t-in"><p class="meta" data-f="meta"><span class="sec">${sec(t.r)}</span><time>${dot(a.date)}</time></p><p class="line" data-f="line">${esc(l1)}</p><p class="sheen-line">${esc(l2)}</p></div>`;
        if (lv === 1) return `<div class="t-in"><p class="meta" data-f="meta"><time>${ym(a.date)}</time></p><p class="line" data-f="line">${trail(cutPct(l1, 0.45))}</p></div>`;
        if (lv === 2) return `<div class="t-in"><p class="line" data-f="line">${esc(cut(l1, 2))}</p>${bars([70])}</div>`;
        return `<div class="t-in">${bars([60, 34])}</div>`;
      }
      case 'about':
        if (lv === 0) return `<div class="t-in"><p class="meta" data-f="meta"><span class="sec">${sec(t.r)}</span><span>${NAMES.dawn[2]}</span></p><h3 class="ttl" data-f="title">${esc(a.title)}</h3><p class="q" data-f="q">${esc(a.question)}</p></div>`;
        if (lv === 1) return `<div class="t-in"><p class="meta" data-f="meta"><span class="sec">${sec(t.r)}</span></p><h3 class="ttl" data-f="title">${titleAt(a.title, 1)}</h3><p class="q" data-f="q">${trail(cutPct(a.question, 0.45))}</p></div>`;
        if (lv === 2) return `<div class="t-in"><h3 class="ttl" data-f="title">${titleAt(a.title, 2)}</h3>${bars([74, 46])}</div>`;
        return `<div class="t-in"><h3 class="ttl" data-f="title">${titleAt(a.title, 3)}</h3>${bars([44])}</div>`;
    }
    return '';
  }
  function patchColor(t, lv) {
    const bg = PAL[t.r].bg;
    if (t.kind === 'img') {
      const v = variants.get(`${t.ref.slug}/${t.k}`);
      const base = v ? v.avg : mixLab(bg, PAL[t.r].fg, 0.2);
      return rgb(mixLab(base, bg, lv === 4 ? 0.6 : 0.66), lv === 4 ? 0.72 : 0.5);
    }
    const light = bg[0] > 128;
    return rgb(mixLab(bg, light ? PAL[t.r].fg : [190, 200, 225], light ? 0.1 : 0.1), lv === 4 ? 0.9 : 0.6);
  }

  /* ══ 5 · 视口与虚拟化 ══ */
  let vw = innerWidth;
  let vh = innerHeight;
  let z = 1;
  const cam = { x: START.x, y: START.y };
  const vel = { x: 0, y: 0 };
  const pend = { x: 0, y: 0 };
  let pendTau = 70;
  const nodes = new Map();
  const pool = new Map();
  let frameNo = 0;
  let hoverRec = null;

  const zoomFor = (w) => (w < 640 ? 0.6 : w < 1000 ? 0.78 : w < 1700 ? 0.88 : 1);

  function geometry(rec) {
    const { t, lv } = rec;
    let x = t.x + rec.i * W;
    let y = t.y + rec.j * H;
    let w = t.w;
    let h = t.h;
    const jt = JITTER[lv];
    if (jt) {
      x += (hash(t.idx, rec.i, rec.j) - 0.5) * 2 * jt;
      y += (hash(rec.j, t.idx, rec.i) - 0.5) * 2 * jt;
    }
    if (lv >= 4 && t.kind !== 'label') {
      const s = lv === 4 ? 0.88 : 0.62;
      const hh = t.kind === 'img' ? t.ih : h;
      x += (w * (1 - s)) / 2;
      y += (hh * (1 - s)) / 2;
      w *= s;
      h = hh * s;
    }
    return { x, y, w, h };
  }

  function effLevel(rec) {
    return Math.max(0, Math.min(5, rec.lv + (rec.extra || 0) - (rec === hoverRec && !reading ? 1 : 0)));
  }

  function apply(rec) {
    const eff = effLevel(rec);
    const el = rec.el;
    if (rec.drawn !== eff) {
      const t = rec.t;
      const patch = eff >= 4 && t.kind !== 'label';
      el.className = `t t-${t.kind} lv-${eff}${rec.orig ? ' orig' : ''}${patch ? ' t-patch' : ''}${!patch && t.kind !== 'label' && t.kind !== 'img' ? ' card' : ''}`;
      el.innerHTML = patch ? '' : inner(t, eff);
      const pc = patch ? patchColor(t, eff) : '';
      el.style.background = pc;
      el.style.boxShadow = pc ? `0 0 ${eff === 4 ? 12 : 40}px ${eff === 4 ? -2 : 14}px ${pc}` : '';
      if (rec.drawn !== undefined && rec.drawn !== -1 && Math.abs(rec.drawn - eff) === 1 && !RM && !rec.quiet) {
        el.classList.remove('focus-in');
        void el.offsetWidth;
        el.classList.add('focus-in');
      }
      rec.drawn = eff;
    }
    const g = geometry(rec);
    rec.g = g;
    el.style.transform = `translate3d(${g.x}px,${g.y}px,0)`;
    el.style.width = `${g.w}px`;
    el.style.height = `${g.h}px`;
  }

  function makeRec(t, i, j) {
    const orig = i === 0 && j === 0;
    let el;
    const key = `${t.idx}:${i}:${j}`;
    if (orig) {
      el = document.createElement(t.kind === 'label' ? 'div' : 'a');
      if (t.kind !== 'label') el.href = `#${t.route}`;
      else el.setAttribute('role', 'presentation');
    } else {
      const p = pool.get(t.idx);
      el = (p && p.pop()) || document.createElement('div');
      el.setAttribute('aria-hidden', 'true');
      el.hidden = false;
    }
    el.dataset.k = key;
    el.dataset.r = t.r;
    const rec = { key, t, i, j, el, orig, lv: levelOf(t, i, j), drawn: undefined, extra: 0 };
    nodes.set(key, rec);
    if (!el.parentNode) world.appendChild(el);
    apply(rec);
    return rec;
  }
  function release(rec) {
    nodes.delete(rec.key);
    if (rec === hoverRec) hoverRec = null;
    rec.el.hidden = true;
    rec.el.classList.remove('focus-in');
    if (!pool.has(rec.t.idx)) pool.set(rec.t.idx, []);
    pool.get(rec.t.idx).push(rec.el);
  }

  const MARGIN = 260;
  function sync() {
    frameNo++;
    const hw = vw / 2 / z + MARGIN;
    const hh = vh / 2 / z + MARGIN;
    const x0 = cam.x - hw;
    const x1 = cam.x + hw;
    const y0 = cam.y - hh;
    const y1 = cam.y + hh;
    const i0 = Math.floor(x0 / W) - 1;
    const i1 = Math.floor(x1 / W);
    const j0 = Math.floor(y0 / H) - 1;
    const j1 = Math.floor(y1 / H);
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        if (i === 0 && j === 0) continue;
        for (const t of TILES) {
          const wx = t.x + i * W;
          const wy = t.y + j * H;
          if (wx > x1 || wx + t.w < x0 || wy > y1 || wy + t.h < y0) continue;
          const lv = levelOf(t, i, j);
          if (t.kind === 'label' && lv >= 3) continue;
          if (lv === 5 && hash(t.idx + 7, i, j) < 0.45) continue; // 最远处的色块也时有时无
          const key = `${t.idx}:${i}:${j}`;
          const rec = nodes.get(key) || makeRec(t, i, j);
          rec.seen = frameNo;
        }
      }
    for (const rec of nodes.values()) if (!rec.orig && rec.seen !== frameNo) release(rec);
  }

  function origin() {
    return { x: vw / 2 - cam.x * z, y: vh / 2 - cam.y * z };
  }
  function render() {
    const o = origin();
    world.style.transform = `translate3d(${o.x}px,${o.y}px,0) scale(${z})`;
    const pw = W * z;
    const ph = H * z;
    field.style.transform = `translate3d(${mod(o.x, pw) - pw}px,${mod(o.y, ph) - ph}px,0)`;
    sync();
    // 走远了，整片蒙上一层薄雾
    const d = Math.hypot((cam.x - W / 2) / W, (cam.y - H / 2) / H);
    haze.style.opacity = Math.max(0, Math.min(0.12, (d - 1.2) / 5)).toFixed(3);
    const far = Math.hypot((cam.x - START.x) / W, (cam.y - START.y) / H) > 0.85;
    if (homeBtn.hidden === far) homeBtn.hidden = !far;
    toneChrome();
  }
  function toneChrome() {
    const at = (sx, sy) => fromLab(fieldLab(cam.x + (sx - vw / 2) / z, cam.y + (sy - vh / 2) / z));
    const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    for (const [el, sx] of [[brand, 70], [ctl, vw - 130]]) {
      const tone = lum(at(sx, 40)) < 125 ? 'dark' : 'light';
      if (el.dataset.tone !== tone) el.dataset.tone = tone;
    }
  }
  function resize() {
    vw = innerWidth;
    vh = innerHeight;
    z = zoomFor(vw);
    field.style.width = `${vw + W * z}px`;
    field.style.height = `${vh + H * z}px`;
    field.style.backgroundSize = `${W * z}px ${H * z}px`;
    render();
  }

  /* ══ 6 · 运动：拖拽、惯性、滚轮、方向键 ══ */
  let raf = 0;
  let last = 0;
  const TAU = 330; // 惯性的衰减时间常数（ms）
  function kick() {
    if (!raf) {
      last = performance.now();
      raf = requestAnimationFrame(tick);
    }
  }
  function tick(now) {
    raf = 0;
    const dt = Math.min(48, now - last);
    last = now;
    let moving = false;
    if (!drag && (vel.x || vel.y)) {
      cam.x += vel.x * dt;
      cam.y += vel.y * dt;
      const k = Math.exp(-dt / TAU);
      vel.x *= k;
      vel.y *= k;
      if (Math.hypot(vel.x, vel.y) * z < 0.012) vel.x = vel.y = 0;
      else moving = true;
    }
    if (pend.x || pend.y) {
      const k = RM ? 1 : 1 - Math.exp(-dt / pendTau);
      cam.x += pend.x * k;
      cam.y += pend.y * k;
      pend.x -= pend.x * k;
      pend.y -= pend.y * k;
      if (Math.hypot(pend.x, pend.y) * z < 0.3) {
        cam.x += pend.x;
        cam.y += pend.y;
        pend.x = pend.y = 0;
        pendTau = 70;
      } else moving = true;
    }
    render();
    if (moving || dirty) {
      dirty = false;
      raf = requestAnimationFrame(tick);
    }
  }
  let dirty = false;
  const stopMotion = () => { vel.x = vel.y = 0; pend.x = pend.y = 0; };
  function flyTo(x, y, tau = 150) {
    stopMotion();
    pendTau = tau;
    pend.x = x - cam.x;
    pend.y = y - cam.y;
    kick();
  }

  let drag = null;
  let suppressClick = false;
  stage.addEventListener('pointerdown', (e) => {
    if (reading || e.button > 0) return;
    vel.x = vel.y = 0;
    pend.x = pend.y = 0;
    drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY, moved: false, s: [{ t: e.timeStamp, x: e.clientX, y: e.clientY }] };
    suppressClick = false;
  });
  addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 5) {
      drag.moved = true;
      root.classList.add('dragging');
      try { stage.setPointerCapture(e.pointerId); } catch {}
      setHover(null);
    }
    if (drag.moved) {
      cam.x -= (e.clientX - drag.lx) / z;
      cam.y -= (e.clientY - drag.ly) / z;
      drag.s.push({ t: e.timeStamp, x: e.clientX, y: e.clientY });
      while (drag.s.length > 2 && e.timeStamp - drag.s[0].t > 90) drag.s.shift();
      dirty = true;
      kick();
    }
    drag.lx = e.clientX;
    drag.ly = e.clientY;
  });
  function endDrag(e) {
    if (!drag || e.pointerId !== drag.id) return;
    if (drag.moved) {
      suppressClick = true;
      const a = drag.s[0];
      const b = drag.s[drag.s.length - 1];
      const dt = Math.max(16, b.t - a.t);
      if (!RM && e.timeStamp - b.t < 60) {
        vel.x = -(b.x - a.x) / dt / z;
        vel.y = -(b.y - a.y) / dt / z;
        kick();
      }
      root.classList.remove('dragging');
    }
    drag = null;
  }
  addEventListener('pointerup', endDrag);
  addEventListener('pointercancel', endDrag);

  stage.addEventListener(
    'wheel',
    (e) => {
      if (reading) return;
      e.preventDefault();
      if (e.ctrlKey) return;
      let dx = e.deltaX;
      let dy = e.deltaY;
      if (e.deltaMode === 1) { dx *= 32; dy *= 32; }
      else if (e.deltaMode === 2) { dx *= vw; dy *= vh; }
      if (e.shiftKey && !dx) { dx = dy; dy = 0; }
      vel.x = vel.y = 0;
      pendTau = 70;
      pend.x += dx / z;
      pend.y += dy / z;
      kick();
    },
    { passive: false },
  );

  addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (reading) { e.preventDefault(); requestClose(); }
      else if (toc.classList.contains('open')) { setToc(false); tocBtn.focus(); }
      return;
    }
    if (reading || e.altKey || e.ctrlKey || e.metaKey) return;
    if (toc.contains(document.activeElement)) return;
    const step = (e.shiftKey ? 620 : 300) / z;
    const map = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (map[e.key]) {
      e.preventDefault();
      vel.x = vel.y = 0;
      pendTau = 110;
      pend.x += map[e.key][0];
      pend.y += map[e.key][1];
      kick();
    } else if (e.key === 'Home') {
      e.preventDefault();
      flyTo(START.x, START.y);
    }
  });

  /* ══ 7 · 悬停：副本被想起一档 ══ */
  function setHover(rec) {
    if (rec === hoverRec) return;
    const prev = hoverRec;
    hoverRec = rec;
    if (prev && nodes.get(prev.key) === prev) apply(prev);
    if (rec) apply(rec);
  }
  world.addEventListener('pointerover', (e) => {
    if (drag?.moved || reading || e.pointerType === 'touch') return;
    const el = e.target.closest('.t');
    const rec = el && nodes.get(el.dataset.k);
    setHover(rec && !rec.orig && rec.lv <= 4 && rec.t.kind !== 'label' ? rec : null);
  });
  world.addEventListener('pointerleave', () => setHover(null));

  let quietFocus = false;
  /* 键盘：原件获得焦点时，把它带进视野 */
  world.addEventListener('focusin', (e) => {
    const el = e.target.closest('.t.orig');
    const rec = el && nodes.get(el.dataset.k);
    if (!rec || reading || quietFocus) return;
    const r = screenRect(rec);
    const m = 70;
    if (r.left < m || r.top < m + 40 || r.right > vw - m || r.bottom > vh - m) flyTo(rec.g.x + rec.g.w / 2, rec.g.y + rec.g.h / 2, 120);
  });

  function screenRect(rec) {
    const o = origin();
    const g = rec.g;
    const left = o.x + g.x * z;
    const top = o.y + g.y * z;
    return { left, top, width: g.w * z, height: g.h * z, right: left + g.w * z, bottom: top + g.h * z };
  }

  /* ══ 8 · 打开：方块在原处展开成阅读层 ══ */
  let reading = null;
  const ROUTES = new Map();
  const origRec = (route) => [...nodes.values()].find((r) => r.orig && r.t.route === route);

  world.addEventListener('click', (e) => {
    const el = e.target.closest('.t');
    if (el && el.tagName === 'A') e.preventDefault();
    if (suppressClick || reading) return;
    const rec = el && nodes.get(el.dataset.k);
    if (!rec || rec.t.kind === 'label' || rec.lv >= 5) return;
    open(rec);
  });

  const EASE_OPEN = 'cubic-bezier(0.32, 0.72, 0, 1)';
  const EASE_CLOSE = 'cubic-bezier(0.45, 0, 0.2, 1)';
  const OPEN_MS = 720;
  const CLOSE_MS = 600;

  function link(href) {
    let m = href.match(/^\/articles\/([^/]+)\/?$/);
    if (m) return `#/a/${m[1]}`;
    m = href.match(/^\/projects\/([^/]+)\/?$/);
    if (m) return `#/p/${m[1]}`;
    return href;
  }
  const ext = (h) => /^https?:/.test(h) ? ' target="_blank" rel="noopener"' : '';

  function buildDetail(rec, k) {
    const t = rec.t;
    const a = t.ref;
    const dt = document.createElement('div');
    dt.className = 'dt';
    dt.dataset.r = t.r;
    dt.setAttribute('role', 'dialog');
    dt.setAttribute('aria-modal', 'true');
    let body = '';
    let kind = 'reading';
    if (t.kind === 'article') {
      body = `<article class="dt-col"><p class="dt-meta" data-f="meta"><span class="sec">${sec(t.r)}</span><time>${dot(a.date)}</time><span>${a.chars} 字</span><span>${a.tags.map(esc).join(' · ')}</span></p>
        <h1 class="dt-title" data-f="title" tabindex="-1">${esc(a.title)}</h1><p class="dt-lede" data-f="desc">${esc(a.desc)}</p><hr class="dt-rule">
        <div class="md">${a.html}</div>
        ${a.related.length ? `<nav class="dt-rel"><h2>关联篇章</h2><ul>${a.related.map((r) => `<li><a href="${link(r.href)}">${esc(r.label)}</a></li>`).join('')}</ul></nav>` : ''}</article>`;
    } else if (t.kind === 'project') {
      body = `<article class="dt-col"><p class="dt-meta" data-f="meta"><span class="sec">${sec(t.r)}</span><time>${dot(a.date)}</time><span>${esc(a.status)}</span></p>
        <h1 class="dt-title" data-f="title" tabindex="-1">${esc(a.title)}</h1><p class="dt-lede" data-f="desc">${esc(a.desc)}</p>
        ${a.links.length ? `<ul class="dt-links">${a.links.map((l) => `<li><a href="${esc(l.href)}"${ext(l.href)}>${esc(l.label)} ↗</a></li>`).join('')}</ul>` : ''}<hr class="dt-rule">
        <div class="md">${a.html}</div>
        ${a.note ? `<p class="dt-note"><span data-w>${esc(a.note.awake)}</span><span data-d>${esc(a.note.dream)}</span></p>` : ''}</article>`;
    } else if (t.kind === 'img') {
      kind = 'moment';
      const im = a.images[k - 1];
      const box = fitImage(im);
      const sibs = a.images.length > 1 ? `<div class="dt-sibs" role="group" aria-label="同一则里的其他图">${a.images.map((s, n) => `<button type="button" data-k="${n + 1}" aria-current="${n + 1 === k}" aria-label="${esc(s.alt || `第 ${n + 1} 张`)}"><img src="${s.m}" alt=""></button>`).join('')}</div>` : '';
      body = `<figure class="dt-fig"><div class="dt-img" data-f="img" style="width:${box.w}px;height:${box.h}px"><img src="${im.l}" alt="${esc(im.alt)}"></div>
        <figcaption class="dt-cap" style="width:${box.w}px"><h1 class="dt-title" data-f="title" tabindex="-1">${esc(a.title)}</h1><p class="dt-meta" data-f="meta"><span class="sec">${sec(t.r)}</span><time>${dot(a.date)}</time></p>
        ${a.images.length > 1 ? `<p class="alt">${esc(im.alt)}</p>` : ''}${a.text ? `<div class="txt">${paras(a.text).map((p) => `<p>${esc(p)}</p>`).join('')}</div>` : ''}</figcaption>${sibs}</figure>`;
    } else if (t.kind === 'note') {
      kind = 'short';
      const [l1 = '', l2 = ''] = paras(a.text);
      body = `<article class="dt-col"><p class="dt-meta" data-f="meta"><span class="sec">${sec(t.r)}</span><time>${a.date.replace('T', ' · ').replace(/-/g, ' · ')}</time></p>
        <h1 class="dt-title" tabindex="-1">${esc(a.title)}</h1><p class="big" data-f="line">${esc(l1)}</p><p class="sheen-line">${esc(l2)}</p>
        <p class="dt-meta" style="margin-top:40px">${a.tags.map(esc).join(' · ')}</p></article>`;
    } else if (t.kind === 'about') {
      kind = 'short';
      body = `<article class="dt-col"><p class="dt-meta" data-f="meta"><span class="sec">${sec(t.r)}</span><span>${NAMES.dawn[2]}</span></p>
        <h1 class="dt-title" data-f="title" tabindex="-1">${esc(a.title)}</h1><p class="big" data-f="q">${esc(a.question)}</p><hr class="dt-rule">
        <p class="dt-lede"><span data-w>${esc(a.line)}</span><span data-d>${esc(a.dreamLine)}</span></p>
        <ul class="dt-links">${a.links.map((l) => `<li><a href="${esc(l.href)}"${ext(l.href)}>${esc(l.label)} ↗</a></li>`).join('')}</ul></article>`;
    }
    dt.classList.add(`dt-${kind}`);
    dt.setAttribute('aria-label', t.kind === 'about' ? '关于' : a.title);
    dt.innerHTML = `<div class="dt-win"><div class="dt-bg"></div><div class="dt-scroll">${body}</div></div><button type="button" class="dt-close">返回</button>`;
    return { dt, kind };
  }

  function fitImage(im) {
    const small = vw < 640;
    const maxW = Math.min(vw - (small ? 32 : 96), 1120);
    const maxH = vh - (small ? 76 : 92) - (small ? 150 : 170);
    let w = maxW;
    let h = (w * im.h) / im.w;
    if (h > maxH) { h = maxH; w = (h * im.w) / im.h; }
    return { w: Math.round(w), h: Math.round(h) };
  }

  /* 这一刻屏幕上有哪些方块、离起点多远 —— 用来排「向外遗忘」的涟漪 */
  function ripple(src, on, base, perPx, cap) {
    const c = screenRect(src);
    const cx = c.left + c.width / 2;
    const cy = c.top + c.height / 2;
    const timers = [];
    for (const rec of nodes.values()) {
      if (rec === src) continue;
      const r = screenRect(rec);
      if (r.right < -80 || r.left > vw + 80 || r.bottom < -80 || r.top > vh + 80) {
        rec.extra = on ? 1 : 0;
        rec.quiet = true;
        apply(rec);
        rec.quiet = false;
        continue;
      }
      const d = Math.hypot(r.left + r.width / 2 - cx, r.top + r.height / 2 - cy);
      const go = () => { rec.extra = on ? 1 : 0; apply(rec); };
      if (RM) go();
      else timers.push(setTimeout(go, base + Math.min(cap, d * perPx)));
    }
    return timers;
  }

  function animate(el, kf, o) {
    if (!el) return null;
    return el.animate(kf, { fill: 'both', ...o, duration: dur(o.duration ?? 0), delay: dur(o.delay ?? 0) });
  }

  function flipPairs(rec, dt) {
    const pairs = [];
    for (const to of dt.querySelectorAll('[data-f]')) {
      const from = rec.el.querySelector(`[data-f="${to.dataset.f}"]`);
      if (!from) continue;
      const a = from.getBoundingClientRect();
      if (!a.width) continue;
      pairs.push({ name: to.dataset.f, to, a, fs: parseFloat(getComputedStyle(from).fontSize) });
    }
    return pairs;
  }
  function flipFrom(p) {
    const b = p.to.getBoundingClientRect();
    if (p.name === 'img') return `translate(${p.a.left - b.left}px,${p.a.top - b.top}px) scale(${p.a.width / b.width},${p.a.height / b.height})`;
    const s = p.fs / parseFloat(getComputedStyle(p.to).fontSize);
    return `translate(${p.a.left - b.left}px,${p.a.top - b.top}px) scale(${s})`;
  }

  function open(rec, { push = true, k } = {}) {
    if (reading || !rec) return;
    stopMotion();
    setHover(null);
    setToc(false);
    const t = rec.t;
    k = k || t.k;
    const tileRect = screenRect(rec);
    const { dt, kind } = buildDetail(rec, k);
    document.body.appendChild(dt);
    const win = dt.querySelector('.dt-win');
    const closeBtn = dt.querySelector('.dt-close');
    const route = t.kind === 'img' ? `/m/${t.ref.slug}/${k}` : t.route;
    if (push) history.pushState({ pl: route }, '', `#${route}`);
    root.classList.add('reading');
    stage.setAttribute('aria-hidden', 'true');
    stage.inert = true;
    toc.inert = true;

    // 阅读层的落点
    let sheet;
    if (kind === 'reading') {
      const cw = Math.min(vw, 880);
      sheet = { left: (vw - cw) / 2, top: 0, width: cw, height: vh };
    } else sheet = { left: 0, top: 0, width: vw, height: vh };
    const inset = (r, round) => `inset(${r.top}px ${vw - r.left - r.width}px ${vh - r.top - r.height}px ${r.left}px round ${round}px)`;
    const fromClip = inset(tileRect, 2);
    const toClip = inset(sheet, 0);

    const fp = flipPairs(rec, dt);
    const lvFrom = rec.drawn;
    rec.el.style.visibility = 'hidden';

    reading = { rec, dt, win, kind, sheet, inset, fromClip, toClip, route, k, timers: [], anims: [] };

    // ① 平面后退：缩小、变虚、压暗，同时从被点的方块向外再忘一档
    recede.style.transformOrigin = `${tileRect.left + tileRect.width / 2}px ${tileRect.top + tileRect.height / 2}px`;
    dim.style.background = rgb(PAL[t.r].bg);
    animate(recede, [{ transform: 'scale(1)', filter: 'blur(0px)' }, { transform: 'scale(0.94)', filter: 'blur(2.5px)' }], { duration: 820, easing: EASE_OPEN });
    animate(dim, [{ opacity: 0 }, { opacity: kind === 'reading' ? 0.5 : 0.35 }], { duration: 760, easing: 'ease-out' });
    reading.timers = ripple(rec, true, 40, 0.32, 420);

    // ② 窗口：从方块的轮廓展开到阅读层
    animate(win, [{ clipPath: fromClip }, { clipPath: toClip }], { duration: OPEN_MS, easing: EASE_OPEN });
    if (kind !== 'reading') animate(dt.querySelector('.dt-bg'), [{ opacity: 0.65 }, { opacity: 1 }], { duration: OPEN_MS, easing: 'ease-out' });

    // ③ 同名元素从方块里的位置飞到阅读层里的位置
    for (const p of fp) {
      animate(p.to, [{ transform: flipFrom(p), transformOrigin: '0 0' }, { transform: 'none', transformOrigin: '0 0' }], { duration: OPEN_MS, easing: EASE_OPEN });
      if (p.name !== 'img' && lvFrom > 0) animate(p.to, [{ opacity: 0.4 }, { opacity: 1 }], { duration: 520, easing: 'ease-out' });
    }
    // 从远处的副本打开时，图是从粗像素一点点想起来的
    if (t.kind === 'img' && lvFrom > 0) {
      const v = variants.get(`${t.ref.slug}/${k}`);
      const box = dt.querySelector('.dt-img');
      if (v && box) {
        const px = document.createElement('img');
        px.className = lvFrom >= 2 ? 'px' : '';
        px.src = v[Math.min(3, lvFrom)];
        px.alt = '';
        px.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:2px';
        if (lvFrom >= 2) px.style.imageRendering = 'pixelated';
        box.appendChild(px);
        animate(px, [{ opacity: 1 }, { opacity: 0 }], { duration: 640, delay: 260, easing: 'ease-in-out' });
      }
    }

    // ④ 其余的字依次浮现
    const rest = [...dt.querySelectorAll('.dt-col > :not([data-f]), .md > *, .dt-cap > :not([data-f]), .dt-sibs')].filter((el) => !el.closest('[data-f]'));
    let n = 0;
    for (const el of rest) {
      if (el.classList.contains('md')) continue;
      const r = el.getBoundingClientRect();
      const visible = r.top < vh * 1.15;
      const delay = visible ? 360 + Math.min(n++, 10) * 48 : 700;
      if (el.classList.contains('dt-rule')) animate(el, [{ transform: 'scaleX(0)', opacity: 0 }, { transform: 'scaleX(1)', opacity: 1 }], { duration: 760, delay: 300, easing: EASE_OPEN });
      else animate(el, [{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }], { duration: visible ? 640 : 300, delay, easing: EASE_OPEN });
    }
    animate(closeBtn, [{ opacity: 0, transform: 'translateX(-6px)' }, { opacity: 1, transform: 'none' }], { duration: 500, delay: 480, easing: EASE_OPEN });

    // 交互
    closeBtn.addEventListener('click', requestClose);
    dt.addEventListener('click', (e) => {
      const a = e.target.closest('a[href^="#/"]');
      if (a) { e.preventDefault(); return jump(a.getAttribute('href').slice(1)); }
      const sib = e.target.closest('.dt-sibs button');
      if (sib) return swapImage(+sib.dataset.k);
      if (e.target.closest('.dt-col, .dt-img, .dt-cap, .dt-sibs, .dt-close')) return;
      requestClose();
    });
    // 栏外（被裁掉的两侧）滚轮照样滚正文
    const scroller = dt.querySelector('.dt-scroll');
    dt.addEventListener('wheel', (e) => { if (e.target === dt) scroller.scrollTop += e.deltaY; }, { passive: true });
    setTimeout(() => (dt.querySelector('.dt-title') || closeBtn).focus({ preventScroll: true }), dur(OPEN_MS));
    live.textContent = '';
  }

  function swapImage(k) {
    const R = reading;
    if (!R || R.k === k) return;
    const a = R.rec.t.ref;
    const im = a.images[k - 1];
    const box = R.dt.querySelector('.dt-img');
    const fit = fitImage(im);
    const img = box.querySelector('img');
    animate(img, [{ opacity: 1 }, { opacity: 0 }], { duration: 180, easing: 'ease-in' }).finished.then(() => {
      img.src = im.l;
      img.alt = im.alt;
      box.style.width = `${fit.w}px`;
      box.style.height = `${fit.h}px`;
      const alt = R.dt.querySelector('.alt');
      if (alt) alt.textContent = im.alt;
      animate(img, [{ opacity: 0 }, { opacity: 1 }], { duration: 360, easing: 'ease-out' });
    });
    R.dt.querySelectorAll('.dt-sibs button').forEach((b) => b.setAttribute('aria-current', String(+b.dataset.k === k)));
    // 关上时回到同一处周期里对应的那一块
    const tile = TILES.find((t) => t.kind === 'img' && t.ref === a && t.k === k);
    const sibling = tile && nodes.get(`${tile.idx}:${R.rec.i}:${R.rec.j}`);
    if (sibling) {
      R.rec.el.style.visibility = '';
      R.rec = sibling;
      sibling.el.style.visibility = 'hidden';
      sibling.extra = 0;
      apply(sibling);
    }
    R.k = k;
    R.route = `/m/${a.slug}/${k}`;
    history.replaceState({ pl: R.route }, '', `#${R.route}`);
  }

  function requestClose() {
    if (!reading || reading.closing) return;
    if (history.state && history.state.pl) history.back();
    else close();
  }

  function close({ then } = {}) {
    const R = reading;
    if (!R || R.closing) return Promise.resolve();
    R.closing = true;
    R.timers.forEach(clearTimeout);
    const { rec, dt, win } = R;
    const tileRect = screenRect(rec);
    const toClip = R.inset(tileRect, 2);
    // 方块里同名元素的落点：平面此刻还缩在后退里，按「未缩放的方块框 ÷ 实测方块框」把实测位置换算回去
    const elRect = rec.el.getBoundingClientRect();
    const ratio = elRect.width ? tileRect.width / elRect.width : 1;
    const pairs = [];
    for (const to of dt.querySelectorAll('[data-f]')) {
      const tileEl = rec.el.querySelector(`[data-f="${to.dataset.f}"]`);
      if (!tileEl) continue;
      const c = tileEl.getBoundingClientRect();
      if (!c.width) continue;
      const left = tileRect.left + (c.left - elRect.left) * ratio;
      const top = tileRect.top + (c.top - elRect.top) * ratio;
      pairs.push({ name: to.dataset.f, to, a: { left, top, width: c.width * ratio, height: c.height * ratio }, fs: parseFloat(getComputedStyle(tileEl).fontSize) });
    }

    // ① 正文先退
    const rest = [...dt.querySelectorAll('.dt-col > :not([data-f]), .md, .dt-cap > :not([data-f]), .dt-sibs, .dt-close')];
    for (const el of rest) animate(el, [{ opacity: getComputedStyle(el).opacity }, { opacity: 0 }], { duration: 200, easing: 'ease-in' });
    // ② 同名元素飞回方块
    for (const p of pairs) {
      p.to.getAnimations().forEach((x) => x.cancel());
      animate(p.to, [{ transform: 'none', transformOrigin: '0 0' }, { transform: flipFrom(p), transformOrigin: '0 0' }], { duration: CLOSE_MS, delay: 110, easing: EASE_CLOSE });
    }
    // ③ 窗口收回方块的轮廓
    const w = animate(win, [{ clipPath: R.toClip }, { clipPath: toClip }], { duration: CLOSE_MS, delay: 110, easing: EASE_CLOSE });
    // ④ 平面回来，就近先想起
    const cur = getComputedStyle(recede).transform;
    recede.getAnimations().forEach((a) => a.cancel());
    animate(recede, [{ transform: cur === 'none' ? 'scale(0.94)' : cur, filter: 'blur(2.5px)' }, { transform: 'scale(1)', filter: 'blur(0px)' }], { duration: CLOSE_MS + 80, delay: 110, easing: EASE_CLOSE });
    const dimNow = getComputedStyle(dim).opacity;
    dim.getAnimations().forEach((a) => a.cancel());
    animate(dim, [{ opacity: dimNow }, { opacity: 0 }], { duration: CLOSE_MS, delay: 110, easing: 'ease-in-out' });
    const back = ripple(rec, false, 220, 0.22, 360);

    const done = (w ? w.finished : Promise.resolve()).then(() => {
      back.forEach(clearTimeout);
      for (const r of nodes.values()) if (r.extra) { r.extra = 0; r.quiet = true; apply(r); r.quiet = false; }
      rec.el.style.visibility = '';
      dt.remove();
      recede.getAnimations().forEach((a) => a.cancel());
      dim.getAnimations().forEach((a) => a.cancel());
      reading = null;
      root.classList.remove('reading');
      stage.removeAttribute('aria-hidden');
      stage.inert = false;
      toc.inert = false;
      if (rec.orig && !then) { quietFocus = true; rec.el.focus({ preventScroll: true }); quietFocus = false; }
      if (then) then();
    });
    return done;
  }

  /* 阅读层里的站内互链：先合上，再从那篇的原件打开 */
  function jump(hashRoute) {
    const route = hashRoute.replace(/^#/, '');
    const target = origRec(route);
    if (!target) return;
    close({
      then: () => {
        history.replaceState({ pl: route }, '', `#${route}`);
        const g = target.g;
        flyTo(g.x + g.w / 2, g.y + g.h / 2, 120);
        setTimeout(() => open(target, { push: false }), dur(560));
      },
    });
  }

  addEventListener('popstate', (e) => {
    const st = e.state;
    if (reading && !(st && st.pl)) close();
    else if (!reading && st && st.pl) openRoute(st.pl, false);
  });

  function openRoute(route, push) {
    const m = route.match(/^\/m\/([^/]+)\/(\d+)$/);
    const rec = origRec(m ? `/m/${m[1]}/${m[2]}` : route);
    if (!rec) return;
    const r = screenRect(rec);
    if (r.right < 0 || r.left > vw || r.bottom < 0 || r.top > vh) {
      cam.x = rec.g.x + rec.g.w / 2;
      cam.y = rec.g.y + rec.g.h / 2;
      render();
    }
    open(rec, { push });
  }

  /* ══ 9 · 外框：目录、回到中央、醒梦 ══ */
  function setToc(on) {
    toc.classList.toggle('open', on);
    tocBtn.setAttribute('aria-expanded', String(on));
  }
  tocBtn.addEventListener('click', () => {
    const on = !toc.classList.contains('open');
    setToc(on);
    if (on) setTimeout(() => toc.querySelector('a')?.focus({ preventScroll: true }), 60);
  });
  toc.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#/"]');
    if (!a) return;
    e.preventDefault();
    const route = a.getAttribute('href').slice(1);
    const rec = origRec(route);
    setToc(false);
    if (!rec) return;
    const g = rec.g;
    flyTo(g.x + g.w / 2, g.y + g.h / 2, 130);
    setTimeout(() => open(rec), dur(Math.min(900, 300 + Math.hypot(pend.x, pend.y) * 0.08)));
  });
  addEventListener('pointerdown', (e) => {
    if (toc.classList.contains('open') && !toc.contains(e.target) && e.target !== tocBtn) setToc(false);
  });
  homeBtn.addEventListener('click', () => flyTo(START.x, START.y, 170));
  brand.addEventListener('click', (e) => { e.preventDefault(); flyTo(START.x, START.y, 170); });
  realBtn.addEventListener('click', () => {
    const dream = root.dataset.reality !== 'dream';
    root.dataset.reality = dream ? 'dream' : 'wake';
    realBtn.setAttribute('aria-pressed', String(dream));
    paletteFor(root.dataset.reality);
    paintField();
    for (const rec of nodes.values()) { rec.drawn = -1; rec.quiet = true; apply(rec); rec.quiet = false; }
    toneChrome();
  });

  /* ══ 10 · 起始 ══ */
  paletteFor('wake');
  paintField();
  resize();
  // 原件常驻 DOM（按版块的阅读顺序），Tab 只经过它们
  for (const t of TILES) makeRec(t, 0, 0);
  render();
  addEventListener('resize', () => { resize(); });
  buildVariants();

  // 原件从画面里浮现：由近及远，淡入、去虚
  if (!RM && !location.hash) {
    const c = { x: vw / 2, y: vh / 2 };
    for (const rec of nodes.values()) {
      const r = screenRect(rec);
      const d = Math.hypot(r.left + r.width / 2 - c.x, r.top + r.height / 2 - c.y);
      rec.el.animate([{ opacity: 0, filter: 'blur(6px)' }, { opacity: 1, filter: 'blur(0px)' }], { duration: 1100, delay: 120 + d * 0.5, easing: 'cubic-bezier(.3,.6,.2,1)', fill: 'backwards' });
    }
  }

  // 直接带着路由进来：先垫一条平面的历史，再打开（「返回」回到平面）
  const initial = location.hash.slice(1);
  if (initial.startsWith('/')) {
    history.replaceState(null, '', location.pathname);
    history.pushState({ pl: initial }, '', `#${initial}`);
    requestAnimationFrame(() => openRoute(initial, false));
  }

  window.__plane = { cam, flyTo, open: (route) => openRoute(route, true), close: requestClose, nodes, render, get reading() { return reading; } };
})();
