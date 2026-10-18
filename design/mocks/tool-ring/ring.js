/* ─────────────────────────────────────────────────────────────
   罗盘环 · 合拢 / 绽开
   · 静息：指针旁一圈极淡的刻度环（十二道刻度＝十二件工具）。环慢转，随移动速度多转一点。
   · 按住 / 点开：刻度一道道亮起，环绽开成花瓣状的工具列——四片宽的（读面）+ 八片窄的（行止）。
   · 靠近一片瓣，它张开自己的花瓣玻璃；指针离开这一圈，环合拢，回到指针上。
   三条召唤路径（唤出的是同一个面）：
     ① 常驻边缘露头（触屏 / 指针停住）② 指针跟随（主路径）③ 快捷键 R（唤到中央直接绽开）
   接住站内已有的凝露光核：这里复刻 Cursor.astro 的星与三环，位置由本文件逐帧写。
   ───────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const RM = matchMedia('(prefers-reduced-motion: reduce)');
  const params = new URLSearchParams(location.search);
  const TOOLS = window.RING.TOOLS;
  const panels = window.RING.panels;

  const ring = document.getElementById('ring');
  const compass = document.getElementById('compass');
  const petalBox = document.getElementById('petals');
  const panel = document.getElementById('panel');
  const veil = document.getElementById('veil');
  const peek = document.getElementById('peek');
  const coreLayer = document.getElementById('core-layer');
  const hint = document.getElementById('hint');

  /* ── 借光：每一套夜色的墨、玻璃与纱（表在 scene.js 里，环只取用） ── */
  const PAL = window.__scene.PAL;

  let palName = '';

  function applyPal(name) {
    if (palName === name || !PAL[name]) return;
    palName = name;
    const p = PAL[name];
    const set = (el) => {
      el.style.setProperty('--rfg', p.fg);
      el.style.setProperty('--rsoft', p.soft);
      el.style.setProperty('--rink', p.ink);
      el.style.setProperty('--rbg', p.bg);
      el.style.setProperty('--dark', String(p.dark));
      el.style.setProperty('--glass-0', p.g[0]);
      el.style.setProperty('--glass-1', p.g[1]);
      el.style.setProperty('--glass-2', p.g[2]);
      el.style.setProperty('--panel-a', p.pa);
      el.style.setProperty('--panel-b', p.pb);
      el.style.setProperty('--panel-fill', p.fill);
      el.style.setProperty('--petal-lift', p.lift);
      el.style.setProperty('--edge', `color-mix(in srgb, ${p.fg} 30%, transparent)`);
      el.style.setProperty('--edge-soft', `color-mix(in srgb, ${p.fg} 16%, transparent)`);
      el.style.setProperty('--ring-ink', `color-mix(in srgb, ${p.fg} 62%, #d9a05b)`);
    };
    set(ring);
    set(panel);
    set(peek);
    set(coreLayer);
  }

  /* 对照度自查要能强换一套夜色量一次，量完换回来 */
  function forcePal(name) {
    palName = '';
    applyPal(name);
  }

  /* ── 几何：十二片瓣。长度 / 开角 / 侧弯都带一点抖动，不做机械放射对称 ──
     a 的约定：0 = 上，顺时针。瓣形画在本地坐标里（底在中下、尖朝上），旋转叠在上面。 */
  const TIER = {
    broad: { r0: 20, r1: 58, L: 62, W: 30 },
    narrow: { r0: 34, r1: 100, L: 42, W: 13 },
  };
  const PAD = 0.3; /* 瓣腹比 W 宽，viewBox 两侧留出余量，免得被裁成一颗药丸 */
  const prand = (i, k) => {
    const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
    return x - Math.floor(x);
  };

  /* 百合式的瓣：窄基、宽腹、收尖，两侧略不对称 */
  function lilyPath(L, W, bow) {
    const h = W / 2;
    const x = W / 2;
    const b = bow * W * 0.5;
    const f = (n) => n.toFixed(2);
    return (
      `M ${f(x)} ${f(L)}` +
      ` C ${f(x + h * 0.55)} ${f(L - L * 0.08)} ${f(x + h * 1.15 + b)} ${f(L - L * 0.45)} ${f(x + h * 0.75 + b)} ${f(L - L * 0.8)}` +
      ` C ${f(x + h * 0.45 + b)} ${f(L - L * 0.92)} ${f(x + b)} ${f(L * 0.06)} ${f(x + b)} 0` +
      ` C ${f(x + b)} ${f(L * 0.06)} ${f(x - h * 0.45 + b)} ${f(L - L * 0.92)} ${f(x - h * 0.75 + b)} ${f(L - L * 0.8)}` +
      ` C ${f(x - h * 1.15 + b)} ${f(L - L * 0.45)} ${f(x - h * 0.55)} ${f(L - L * 0.08)} ${f(x)} ${f(L)} Z`
    );
  }
  const veinPath = (L, W, bow) => {
    const x = W / 2;
    const b = bow * W * 0.5;
    return `M ${x.toFixed(2)} ${(L - 2).toFixed(2)} Q ${(x + b * 0.5).toFixed(2)} ${(L * 0.5).toFixed(2)} ${(x + b).toFixed(2)} 3`;
  };

  const geo = TOOLS.map((t, i) => {
    const tier = TIER[t.tier];
    const jl = 0.92 + prand(i, 1) * 0.16;
    const jw = 0.9 + prand(i, 2) * 0.2;
    const ja = (prand(i, 3) - 0.5) * 9;
    const bow = (prand(i, 4) - 0.5) * 0.5;
    return {
      id: t.id, tool: t, tier: t.tier,
      a: t.a + ja,
      r0: tier.r0, r1: tier.r1,
      L: tier.L * jl, W: tier.W * jw, bow,
    };
  });

  /* ── 造：环 + 刻度 + 十二片瓣 ── */
  function buildCompass() {
    /* 刻度与瓣同一个角度约定：0 = 上，顺时针 */
    const pt = (r, deg) => {
      const a = (deg * Math.PI) / 180;
      return [r * Math.sin(a), -r * Math.cos(a)];
    };
    let s = '<g class="c-spin">';
    s += '<circle class="c-hair" r="46"></circle>';
    geo.forEach((g, i) => {
      const long = g.tier === 'broad';
      const [x1, y1] = pt(long ? 40 : 42, g.a);
      const [x2, y2] = pt(long ? 52 : 49, g.a);
      s += `<line class="c-tick${long ? ' is-long' : ''}" data-t="${i}" x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}"></line>`;
    });
    s += '</g>';
    s += '<circle class="c-prog" r="46" transform="rotate(-90)"></circle>';
    s += '<circle class="c-hold" r="38" transform="rotate(-90)"></circle>';
    compass.innerHTML = s;
    compass.spin = compass.querySelector('.c-spin');
    compass.prog = compass.querySelector('.c-prog');
    compass.hold = compass.querySelector('.c-hold');
    compass.ticks = [...compass.querySelectorAll('.c-tick')];
  }

  function buildPetals() {
    petalBox.innerHTML = geo
      .map((g) => {
        const t = g.tool;
        const L = g.L;
        const W = g.W;
        const pad = W * PAD;
        const vw = W + 2 * pad;
        return `<div class="petal${g.tier === 'broad' ? ' is-wide' : ''}" data-id="${t.id}">
          <div class="p-shape">
            <svg width="${vw.toFixed(1)}" height="${L.toFixed(1)}" viewBox="${(-pad).toFixed(1)} 0 ${vw.toFixed(1)} ${L.toFixed(1)}"
                 style="left:${(-(W / 2 + pad)).toFixed(1)}px;bottom:0" aria-hidden="true" focusable="false">
              <path class="p-fill" d="${lilyPath(L, W, g.bow)}"></path>
              <path class="p-vein" d="${veinPath(L, W, g.bow)}"></path>
            </svg>
          </div>
          <div class="p-label"><span class="p-in"><b>${t.cn}</b><i class="mono">${t.en}</i></span></div>
          <button class="p-hit" type="button" tabindex="-1" data-id="${t.id}" aria-label="${t.cn} · ${t.en}">
            <i style="width:${(W * 1.3 + 18).toFixed(0)}px;height:${(L + 22).toFixed(0)}px"></i>
          </button>
        </div>`;
      })
      .join('');
    geo.forEach((g, i) => {
      g.el = petalBox.querySelector(`.petal[data-id="${g.id}"]`);
      g.shape = g.el.querySelector('.p-shape');
      g.label = g.el.querySelector('.p-label');
      g.hit = g.el.querySelector('.p-hit');
      g.labelText = g.el.querySelector('.p-in b');
      g.hit.addEventListener('mouseenter', () => {
        if (S.V > 0.5) setFocus(g.id);
      });
      g.hit.addEventListener('focus', () => {
        if (S.V > 0.5) setFocus(g.id);
      });
      g.hit.addEventListener('click', (e) => {
        e.preventDefault();
        if (S.V < 0.5) return;
        if (g.tool.kind === 'act') {
          act(g.id);
        } else if (S.focus !== g.id) {
          setFocus(g.id);
        }
      });
      g.hit.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
          const first = panel.querySelector('input, button, a[href]');
          if (first && S.focus === g.id) {
            e.preventDefault();
            first.focus();
          }
        }
      });
    });
  }

  /* ── 凝露光核：复刻 Cursor.astro 的星与三环 ── */
  const STAR = 'M0,-10C0.5,-3 2,-0.9 6.5,0C2,0.9 0.5,3 0,10C-0.5,3 -2,0.9 -6.5,0C-2,-0.9 -0.5,-3 0,-10Z';
  const RINGS = [
    { r: 11, gap: 48 },
    { r: 17.5, gap: 40 },
    { r: 24.5, gap: 34 },
  ].map(({ r, gap }) => {
    const c = 2 * Math.PI * r;
    const g = (c * gap) / 360;
    return { r, dash: `${(c - g).toFixed(2)} ${g.toFixed(2)}`, half: gap / 2 };
  });
  const CORE = [{ w: 26, cap: 4, scroll: 5 }, { w: 19, cap: 7, scroll: 8 }, { w: 14, cap: 10, scroll: 11 }];

  function buildCore() {
    coreLayer.innerHTML =
      '<div class="core">' +
      RINGS.map(
        (r, i) =>
          `<div class="c-ring c${i}" data-ring="${i}"><div class="ring-tilt"><div class="ring-spin"><svg viewBox="-30 -30 60 60" width="60" height="60" aria-hidden="true"><circle r="${r.r}" stroke-dasharray="${r.dash}"></circle><path class="gap-star" d="${STAR}" style="transform:rotate(${-r.half}deg) translate(${r.r}px,0) rotate(${r.half}deg) scale(var(--gs))"></path></svg></div></div></div>`,
      ).join('') +
      `<div class="caret"><svg viewBox="-12 -12 24 24" width="24" height="24" aria-hidden="true"><path d="M0,-11V-4.6M0,4.6V11"></path></svg></div>` +
      `<div class="star"><div class="star-tilt"><div class="star-halo"></div><svg class="star-svg" viewBox="-12.8 -12.8 25.6 25.6" width="16" height="16" aria-hidden="true"><path class="s-minor" transform="rotate(45) scale(0.5)" d="${STAR}"></path><path class="s-main" d="${STAR}"></path><path class="s-main-amber" d="${STAR}"></path></svg></div></div>` +
      '</div>';
    core = {
      star: coreLayer.querySelector('.star'),
      caret: coreLayer.querySelector('.caret'),
      rings: [...coreLayer.querySelectorAll('.c-ring')].map((el, i) => ({
        ...CORE[i], el, p: { x: -200, y: -200 }, v: { x: 0, y: 0 },
      })),
    };
  }
  let core = null;

  /* ── 状态 ── */
  const S = {
    ax: innerWidth / 2, ay: innerHeight / 2,
    px: -200, py: -200,
    V: 0, Vt: 0, pv: 0,
    rot: 0, speed: 0, k: 1,
    open: false, focus: null,
    seen: false, peek: false, peekEdge: 'right', peekPos: 0,
    lastMove: 0, holdT0: 0, holding: false, holdX: 0, holdY: 0, holdP: 0, holdFlip: false,
    downT0: 0, downX: 0, downY: 0, swallow: false,
    openPx: 0, openPy: 0, openMoved: false, leaveT0: 0,
    frozen: false, verbHold: null, holdLock: null, stars: [],
  };

  const kFor = () => (innerWidth < 620 ? 0.76 : innerWidth < 900 ? 0.88 : 1);
  S.k = kFor();

  const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);

  /* ── 绽开 / 合拢 ── */
  function bloom(x, y) {
    if (S.verbHold != null) return;
    if (typeof x === 'number') {
      S.ax = x;
      S.ay = y;
    }
    S.open = true;
    S.Vt = 1;
    S.seen = true;
    S.peek = false;
    S.openPx = S.px;
    S.openPy = S.py;
    S.openMoved = false;
    inkPetals();
    syncPeek();
    ring.dataset.open = 'true';
    geo.forEach((g) => (g.hit.tabIndex = 0));
    if (hint) hint.classList.add('is-gone');
  }

  function close(focusId) {
    S.open = false;
    S.Vt = 0;
    if (focusId !== false) setFocus(null);
    ring.dataset.open = 'false';
    geo.forEach((g) => (g.hit.tabIndex = -1));
  }

  function setFocus(id) {
    if (S.focus === id) return;
    S.focus = id;
    if (id) mountPanel(id);
    geo.forEach((g) => {
      if (g.tool.kind !== 'act') return;
      g.labelText.textContent = window.RING.titleOf(g.tool);
    });
  }

  /* 逐片借光：每一片瓣按自己底下的地面取墨，所以瓣名跨过两种夜色也读得清 */
  function inkPetals() {
    geo.forEach((g) => {
      const ang = (g.a + S.rot) * (Math.PI / 180);
      const dx = Math.sin(ang);
      const dy = -Math.cos(ang);
      const d = (g.r1 + g.L * 0.6) * S.k;
      const p = PAL[window.__scene.paletteAt(S.ax + dx * d, S.ay + dy * d)] || PAL.shallow;
      g.el.style.setProperty('--rfg', p.fg);
      g.el.style.setProperty('--rsoft', p.soft);
      g.el.style.setProperty('--rink', p.ink);
      g.el.style.setProperty('--edge', `color-mix(in srgb, ${p.fg} 30%, transparent)`);
      g.el.style.setProperty('--edge-soft', `color-mix(in srgb, ${p.fg} 16%, transparent)`);
    });
  }

  /* ── 面板 ── */
  function mountPanel(id) {
    const t = TOOLS.find((x) => x.id === id);
    if (!t) return;
    const built = panels[id]();
    panel.innerHTML = built.html;
    built.bind(panel);
    panel.removeAttribute('hidden');
    placePanel();
  }

  function placePanel() {
    if (!S.focus) return;
    const i = TOOLS.findIndex((x) => x.id === S.focus);
    const g = geo[i];
    if (!g) return;
    const ang = ((g.a + S.rot) * Math.PI) / 180;
    /* a 的约定是 0 = 上，所以方向向量是 (sin, -cos) */
    const dx = Math.sin(ang);
    const dy = -Math.cos(ang);
    const tipD = (g.r1 + g.L + 7) * S.k;
    const tx = S.ax + dx * tipD;
    const ty = S.ay + dy * tipD;
    const w = panel.offsetWidth;
    const h = panel.offsetHeight;
    const m = 14;
    let left = tx + (dx > 0.2 ? 10 : dx < -0.2 ? -w - 10 : -w / 2);
    let top = ty + (dy > 0.2 ? 10 : dy < -0.2 ? -h - 10 : -h / 2);
    left = clamp(left, m, Math.max(m, innerWidth - w - m));
    top = clamp(top, m, Math.max(m, innerHeight - h - m));
    panel.dataset.ax = String(dx > 0.2 ? 'l' : dx < -0.2 ? 'r' : 'c');
    panel.dataset.ay = String(dy > 0.2 ? 't' : dy < -0.2 ? 'b' : 'c');
    panel.style.transformOrigin = `${dx > 0.2 ? '0%' : dx < -0.2 ? '100%' : '50%'} ${
      dy > 0.2 ? '0%' : dy < -0.2 ? '100%' : '50%'
    }`;
    panel.style.transform = `translate3d(${left.toFixed(1)}px,${top.toFixed(1)}px,0) scale(${(0.96 + 0.04 * S.pv).toFixed(3)})`;
    panel._left = left;
    panel._top = top;
    panel._rect = { left, top, right: left + w, bottom: top + h };
  }

  const panelRO = new ResizeObserver(() => placePanel());

  /* ── 动作：act 类瓣点下就成 ── */
  function act(id) {
    const SC = window.__scene;
    if (id === 'home') SC.setCtx('home');
    else if (id === 'gate') SC.setCtx('gate');
    else if (id === 'view') SC.toggleView();
    else if (id === 'scene') SC.cycleScene();
    else if (id === 'face') SC.toggleFace();
    else if (id === 'sound') SC.toggleSound();
  }

  /* ── 边缘露头 ── */
  function syncPeek() {
    const on = S.peek && !S.open && S.verbHold == null;
    peek.classList.toggle('is-here', on);
    if (on) placePeek();
  }

  function placePeek() {
    const e = S.peekEdge;
    const cx = e === 'left' ? -8 : e === 'right' ? innerWidth + 8 : innerWidth / 2;
    const cy = e === 'top' ? -8 : e === 'bottom' ? innerHeight + 8 : innerHeight / 2;
    peek.style.left = `${(cx - 60).toFixed(1)}px`;
    peek.style.top = `${(cy - 60).toFixed(1)}px`;
    const dir = { right: 180, bottom: 270, left: 0, top: 90 }[e];
    const r = 46;
    const p = (deg) => {
      const a = (deg * Math.PI) / 180;
      return [60 + r * Math.cos(a), 60 + r * Math.sin(a)];
    };
    const [x0, y0] = p(dir - 48);
    const [x1, y1] = p(dir + 48);
    peek.querySelector('.pk-arc').setAttribute('d', `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`);
    peek.querySelector('.pk-ticks').innerHTML = [-26, 0, 26]
      .map((d) => {
        const [ax, ay] = p(dir + d);
        const [ix, iy] = [60 + 42 * Math.cos(((dir + d) * Math.PI) / 180), 60 + 42 * Math.sin(((dir + d) * Math.PI) / 180)];
        return `<line class="pk-tick" x1="${ix.toFixed(2)}" y1="${iy.toFixed(2)}" x2="${ax.toFixed(2)}" y2="${ay.toFixed(2)}"></line>`;
      })
      .join('');
    peek.querySelector('.pk-dot').setAttribute('cx', String(60 + (r - 6) * Math.cos((dir * Math.PI) / 180)));
    peek.querySelector('.pk-dot').setAttribute('cy', String(60 + (r - 6) * Math.sin((dir * Math.PI) / 180)));
    const tag = peek.querySelector('.pk-tag');
    const T = {
      right: ['left:10px;top:50%;transform:translate(-100%,-50%);align-items:flex-end', '-14px 0'],
      bottom: ['left:50%;top:10px;transform:translate(-50%,-100%);align-items:center', '0 -14px'],
      left: ['left:110px;top:50%;transform:translate(0,-50%);align-items:flex-start', '14px 0'],
      top: ['left:50%;top:110px;transform:translate(-50%,0);align-items:center', '0 14px'],
    }[e];
    tag.setAttribute('style', T[0]);
    peek.style.setProperty('--pk-in', T[1]);
  }

  function chooseEdge() {
    if (RM.matches && innerWidth < 700) return 'bottom';
    const near = [
      { e: 'left', d: S.px },
      { e: 'right', d: innerWidth - S.px },
      { e: 'top', d: S.py },
      { e: 'bottom', d: innerHeight - S.py },
    ].sort((a, b) => a.d - b.d)[0];
    return near.e;
  }

  /* ── 逐帧 ── */
  function step(ms) {
    const SC = window.__scene;
    const dt = Math.min(ms, 34) / 1000;
    const now = performance.now();

    S.k = kFor();
    S.speed *= Math.exp(-dt / 0.22);

    /* 动词：合拢 ↔ 绽开 */
    if (S.verbHold != null) {
      S.V = S.verbHold;
    } else {
      const tau = RM.matches ? 0.001 : S.Vt > S.V ? 0.15 : 0.2;
      S.V += (S.Vt - S.V) * (1 - Math.exp(-dt / tau));
      if (Math.abs(S.Vt - S.V) < 0.0015) S.V = S.Vt;
    }

    /* 环转：合拢时慢转、随速度多转；绽开时把转过的角度收回整数圈（瓣落在正位上） */
    if (!RM.matches) {
      if (S.V > 0.02) {
        const target = Math.round(S.rot / 360) * 360;
        S.rot += (target - S.rot) * (1 - Math.exp(-dt / 0.24));
      } else {
        S.rot += (3.4 + Math.min(S.speed, 1600) / 1600 * 30) * dt;
      }
    }

    /* 锚点：合拢时轻轻跟着指针（略欠阻尼，微微拖尾）；绽开后钉住不动 */
    if (!S.open && S.seen) {
      const k = 1 - Math.exp(-dt / (RM.matches ? 0.001 : 0.05));
      S.ax += (S.px - S.ax) * k;
      S.ay += (S.py - S.ay) * k;
    }

    /* 按住：刻度一道道亮起 → 绽开 → 继续按住翻面 */
    if (S.holdLock != null) {
      S.holdP = S.holdLock;
    } else if (S.holding && S.verbHold == null) {
      const el = now - S.holdT0;
      S.holdP = clamp(el / 260, 0, 1);
      if (S.holdP >= 1 && !S.open) bloom();
      if (S.open && el > 1400 && !S.holdFlip) {
        S.holdFlip = true;
        S.swallow = true;
        window.__scene.toggleFace();
        close();
        S.holding = false;
      }
    } else {
      S.holdP += (0 - S.holdP) * (1 - Math.exp(-dt / 0.12));
    }

    /* 指针离开这一圈就合拢（键盘唤出的不算：要等指针真的动过） */
    if (S.open && S.seen && lastType === 'mouse') {
      if (Math.hypot(S.px - S.openPx, S.py - S.openPy) > 12) S.openMoved = true;
      const d = Math.hypot(S.px - S.ax, S.py - S.ay);
      const inBloom = d < g_outer() * S.k * 1.5;
      const r = panel._rect;
      const inPanel =
        S.openMoved && S.pv > 0.2 && r &&
        S.px > r.left - 18 && S.px < r.right + 18 && S.py > r.top - 18 && S.py < r.bottom + 18;
      if (S.openMoved && !inBloom && !inPanel && !S.holding) {
        if (!S.leaveT0) S.leaveT0 = now;
        else if (now - S.leaveT0 > 320) {
          S.leaveT0 = 0;
          close();
        }
      } else S.leaveT0 = 0;
    }

    /* 指针停住 → 环离开指针，贴到最近的一缘 */
    if (S.seen && !S.open && S.verbHold == null) {
      const idle = now - S.lastMove;
      const want = idle > 2200;
      if (want !== S.peek) {
        S.peek = want;
        if (want) S.peekEdge = chooseEdge();
        syncPeek();
      }
    }

    /* 面板的浮现量 */
    const pvT = S.focus && S.V > 0.45 ? 1 : 0;
    S.pv += (pvT - S.pv) * (1 - Math.exp(-dt / (RM.matches ? 0.001 : 0.14)));
    if (Math.abs(pvT - S.pv) < 0.004) S.pv = pvT;

    render(now, dt);
  }

  const g_outer = () => Math.max(...geo.map((g) => g.r1 + g.L));

  function render(now, dt) {
    const SC = window.__scene;

    /* 环 */
    ring.style.opacity = S.seen && !S.peek ? '1' : '0';
    ring.style.transform = `translate3d(${S.ax.toFixed(1)}px,${S.ay.toFixed(1)}px,0)`;
    ring.dataset.v = S.V > 0.02 ? '1' : '0';
    compass.spin.setAttribute('transform', `rotate(${S.rot.toFixed(3)})`);

    /* 环上的琥珀弧：整夜 23:07 → 06:31 走到了哪里 */
    const C = 2 * Math.PI * 46;
    const p = clamp(SC.state.p || 0, 0, 1);
    compass.prog.setAttribute('stroke-dasharray', `${(C * p).toFixed(2)} ${C.toFixed(2)}`);

    /* 按住时环内侧那道亮起的弧 */
    const C2 = 2 * Math.PI * 38;
    compass.hold.style.opacity = String(S.holdP * 0.9);
    compass.hold.setAttribute('stroke-dasharray', `${(C2 * S.holdP).toFixed(2)} ${C2.toFixed(2)}`);

    /* 刻度：按住时一道道亮起 */
    const lit = Math.ceil(S.holdP * geo.length);
    compass.ticks.forEach((el, i) => el.classList.toggle('is-hot', i < lit && S.holdP > 0.02));

    /* 瓣 */
    const focused = S.focus;
    geo.forEach((g, i) => {
      const vp = clamp((S.V - i * 0.018) / 0.82, 0, 1);
      const e = easeOut(vp);
      const r = (g.r0 + (g.r1 - g.r0) * e) * S.k;
      const sc = (0.16 + 0.84 * e) * S.k;
      const dim = focused && focused !== g.id;
      const so = focused === g.id ? 1.05 : dim ? 0.9 : 1;
      const rr = focused === g.id ? r + 5 : dim ? r - 8 : r;
      const a = g.a + S.rot;
      g.shape.style.transform = `rotate(${a.toFixed(2)}deg) translateY(${(-rr).toFixed(2)}px) scale(${(sc * so).toFixed(3)})`;
      g.shape.style.opacity = (e * (dim ? 0.28 : 1)).toFixed(3);
      g.hit.style.transform = `rotate(${a.toFixed(2)}deg) translateY(${(-(rr + (g.L * sc) / 2)).toFixed(2)}px)`;
      g.hit.style.opacity = e.toFixed(3);
      const d = rr + g.L * sc + 9;
      g.label.style.transform = `rotate(${a.toFixed(2)}deg) translateY(${(-d).toFixed(2)}px) rotate(${(-a).toFixed(2)}deg)`;
      g.label.style.opacity = (e * (focused === g.id ? 0 : dim ? 0.22 : 1)).toFixed(3);
      if (g.isFocus !== (focused === g.id)) {
        g.isFocus = focused === g.id;
        g.el.classList.toggle('is-focus', g.isFocus);
      }
    });

    /* 面板 */
    if (S.pv > 0.02 && panel._left != null) {
      panel.classList.add('is-live');
      panel.style.opacity = S.pv.toFixed(3);
      panel.style.transform = `translate3d(${panel._left.toFixed(1)}px,${panel._top.toFixed(1)}px,0) scale(${(
        0.96 +
        0.04 * S.pv
      ).toFixed(3)})`;
    } else if (S.pv <= 0.02) {
      panel.classList.remove('is-live');
      panel.style.opacity = '0';
      if (!S.focus && panel.innerHTML) panel.innerHTML = '';
    }

    veil.style.opacity = (S.V * 0.85).toFixed(3);

    /* 凝露光核 */
    if (core) {
      const z = 0.62;
      core.rings.forEach((R) => {
        const tx = S.px;
        const ty = S.py;
        for (let j = 0; j < 2; j++) {
          const h = dt / 2;
          R.v.x += (R.w * R.w * (tx - R.p.x) - 2 * z * R.w * R.v.x) * h;
          R.v.y += (R.w * R.w * (ty - R.p.y) - 2 * z * R.w * R.v.y) * h;
          R.p.x += R.v.x * h;
          R.p.y += R.v.y * h;
        }
        let dx = R.p.x - S.px;
        let dy = R.p.y - S.py;
        let m = Math.hypot(dx, dy);
        const hard = R.cap * 1.6;
        if (m > hard) {
          R.p.x = S.px + (dx / m) * hard;
          R.p.y = S.py + (dy / m) * hard;
          dx = R.p.x - S.px;
          dy = R.p.y - S.py;
          m = hard;
        }
        const has = m > 1e-4;
        const mEff = has ? R.cap * Math.tanh(m / R.cap) : 0;
        const rx = S.px + (has ? (dx / m) * mEff : 0);
        const ry = S.py + (has ? (dy / m) * mEff : 0);
        const shrink = S.V > 0.02 ? 0.45 : 1;
        R.s = R.s == null ? shrink : R.s + (shrink - R.s) * (1 - Math.exp(-dt / 0.18));
        R.el.style.transform = `translate3d(${rx.toFixed(2)}px,${ry.toFixed(2)}px,0) scale(${R.s.toFixed(3)})`;
      });
      core.star.style.transform = `translate3d(${S.px.toFixed(2)}px,${S.py.toFixed(2)}px,0) scale(${(
        S.V > 0.02 ? 1.18 : 1
      ).toFixed(3)})`;
      core.caret.style.transform = `translate3d(${S.px.toFixed(2)}px,${S.py.toFixed(2)}px,0)`;
    }
  }

  /* ── 帧循环（可冻结，便于拍确定的中间帧） ── */
  let raf = 0;
  let lastT = 0;
  function loop(t) {
    if (S.frozen) {
      raf = 0;
      return;
    }
    raf = requestAnimationFrame(loop);
    const dt = lastT ? t - lastT : 16;
    lastT = t;
    step(dt);
  }
  const start = () => {
    if (!raf && !S.frozen) raf = requestAnimationFrame(loop);
  };

  /* ── 输入 ── */
  let lastMoveT = 0;
  const onMove = (x, y) => {
    const t = performance.now();
    if (S.px > -100 && lastMoveT) {
      const d = Math.hypot(x - S.px, y - S.py);
      const dts = Math.max(0.008, (t - lastMoveT) / 1000);
      S.speed = Math.min(2400, S.speed * 0.55 + 0.45 * (d / dts));
    }
    lastMoveT = t;
    S.px = x;
    S.py = y;
    S.lastMove = t;
    if (!S.seen) {
      S.seen = true;
      S.ax = x;
      S.ay = y;
    }
    if (S.holding && Math.hypot(x - S.holdX, y - S.holdY) > 8) {
      S.holding = false;
      S.holdP = 0;
    }
  };

  document.addEventListener(
    'pointermove',
    (e) => {
      onPointerType(e);
      if (e.pointerType !== 'mouse') return;
      onMove(e.clientX, e.clientY);
      start();
    },
    { passive: true },
  );

  let lastType = '';
  function onPointerType(e) {
    if (e.pointerType === lastType) return;
    lastType = e.pointerType;
    syncGate();
    if (e.pointerType !== 'mouse' && !S.seen) {
      /* 触屏：指针不在场，环从下缘露头等着 */
      S.seen = false;
      S.peek = true;
      S.peekEdge = 'bottom';
      syncPeek();
    }
  }

  const gateOpen = () => lastType === 'mouse' && !RM.matches && !matchMedia('(forced-colors: active)').matches;
  function syncGate() {
    document.documentElement.classList.toggle('fx-cursor-on', gateOpen());
  }
  RM.addEventListener('change', () => {
    syncGate();
    if (RM.matches) {
      S.rot = Math.round(S.rot / 360) * 360;
      close();
    }
  });

  document.addEventListener(
    'pointerdown',
    (e) => {
      onPointerType(e);
      if (e.button !== 0) return;
      /* 瓣上与面板上的按下不算「按住唤开」 */
      if (e.target && e.target.nodeType === 1 && e.target.closest('#ring, #panel')) return;
      S.downT0 = performance.now();
      S.downX = e.clientX;
      S.downY = e.clientY;
      S.holdT0 = S.downT0;
      S.holdX = e.clientX;
      S.holdY = e.clientY;
      S.holdFlip = false;
      S.holding = true;
      start();
    },
    { passive: true, capture: true },
  );

  document.addEventListener(
    'pointerup',
    (e) => {
      if (e.button !== 0) return;
      const el = performance.now() - S.downT0;
      const moved = Math.hypot(e.clientX - S.downX, e.clientY - S.downY);
      const wasHolding = S.holding;
      S.holding = false;
      /* ① 按住了（≥260ms 没怎么动）：环已经开了，吞掉这一下点按 */
      if (wasHolding && S.open && el >= 260 && moved < 8) S.swallow = true;
      /* ② 快按：落在环的那一圈刻度上也算「点开」 */
      else if (el < 240 && moved < 6 && !S.open) {
        const d = Math.hypot(e.clientX - S.ax, e.clientY - S.ay);
        if (d > 26 && d < 62) {
          S.swallow = true;
          bloom();
        }
      }
      start();
    },
    { passive: true, capture: true },
  );

  document.addEventListener(
    'click',
    (e) => {
      if (!S.swallow) return;
      S.swallow = false;
      e.preventDefault();
      e.stopPropagation();
    },
    { capture: true },
  );

  document.addEventListener(
    'pointerover',
    (e) => {
      const el = e.target;
      if (!el || el.nodeType !== 1) return;
      const text = el.closest('p, li, h1, h2, h3, h4, blockquote, figcaption, code, dd, dt, td');
      document.documentElement.dataset.core = text && !el.closest('#ring, #panel, #peek') ? 'text' : '';
    },
    { passive: true },
  );

  document.addEventListener('mouseout', (e) => {
    if (!e.relatedTarget) document.documentElement.classList.add('fx-cursor-out');
  });
  document.addEventListener('mouseover', () => document.documentElement.classList.remove('fx-cursor-out'));

  peek.addEventListener('click', () => {
    const e = S.peekEdge;
    const x = e === 'left' ? 150 : e === 'right' ? innerWidth - 150 : innerWidth / 2;
    const y = e === 'top' ? 150 : e === 'bottom' ? innerHeight - 150 : innerHeight / 2;
    S.seen = true;
    S.ax = x;
    S.ay = y;
    S.peek = false;
    syncPeek();
    bloom();
  });

  addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea, [contenteditable]')) {
      if (e.key === 'Escape') e.target.blur();
      return;
    }
    if (e.key === 'r' || e.key === 'R') {
      e.preventDefault();
      S.seen = true;
      S.ax = innerWidth / 2;
      S.ay = Math.min(innerHeight / 2, innerHeight - 260);
      bloom();
      const first = geo.find((g) => g.tool.kind === 'act') || geo[0];
      if (first) first.hit.focus();
      return;
    }
    if (e.key === 'Escape') {
      if (S.open) close();
      else if (window.__scene.state.ctx !== 'home') window.__scene.setCtx('home');
      return;
    }
    if (!S.open) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const cur = geo.findIndex((g) => g.id === S.focus);
      const step2 = e.key === 'ArrowRight' ? 1 : -1;
      const next = geo[((cur < 0 ? 0 : cur + step2) + geo.length) % geo.length];
      setFocus(next.id);
      next.hit.focus();
    }
  });

  addEventListener('resize', () => {
    S.k = kFor();
    placePeek();
    placePanel();
    inkPetals();
  });

  /* ── 起 ── */
  buildCompass();
  buildPetals();
  buildCore();
  panelRO.observe(panel);
  applyPal(window.__scene.paletteOf());
  window.__scene.on(() => {
    applyPal(window.__scene.paletteOf());
    geo.forEach((g) => (g.labelText.textContent = window.RING.titleOf(g.tool)));
    inkPetals();
    if (S.focus) {
      mountPanel(S.focus);
      placePanel();
    }
  });

  /* 指针一动就按底下的夜色借光（band 的矩形已在 scene.js 里缓存，这里只是判定） */
  addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType !== 'mouse') return;
      applyPal(window.__scene.paletteAt(e.clientX, e.clientY));
    },
    { passive: true },
  );

  /* 起手：触屏直接露头；给了 ?verb 就把环摆在中央停住 */
  const verb = params.get('verb');
  if (verb != null && !Number.isNaN(parseFloat(verb))) {
    S.verbHold = clamp(parseFloat(verb), 0, 1);
    S.open = true;
    S.seen = true;
    S.ax = innerWidth / 2;
    S.ay = Math.min(innerHeight / 2, innerHeight - 260);
    S.rot = 0;
    ring.dataset.open = 'true';
    geo.forEach((g) => (g.hit.tabIndex = 0));
    inkPetals();
  } else if (matchMedia('(hover: none)').matches || innerWidth < 700) {
    S.peek = true;
    S.peekEdge = 'bottom';
    syncPeek();
  }
  syncGate();
  start();

  /* ── 给截图脚本的口子 ── */
  window.__ring = {
    state: S,
    geo,
    applyPal: forcePal,
    palName: () => palName,
    bloom: (x, y) => {
      S.seen = true;
      bloom(x, y);
      start();
    },
    close: () => {
      close();
      start();
    },
    focus: (id) => {
      setFocus(id);
      placePanel();
    },
    peek: (on, edge) => {
      S.peek = !!on;
      if (edge) S.peekEdge = edge;
      syncPeek();
    },
    setVerb: (v) => {
      S.verbHold = clamp(Number(v), 0, 1);
      S.open = true;
      S.seen = true;
      if (S.ax < 0) {
        S.ax = innerWidth / 2;
        S.ay = innerHeight / 2;
      }
      inkPetals();
      render(0, 0.016);
    },
    release: () => {
      S.verbHold = null;
    },
    holdAt: (v) => {
      S.holdLock = v == null ? null : clamp(Number(v), 0, 1);
      render(0, 0.016);
    },
    freeze: () => {
      S.frozen = true;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    },
    advance: (ms) => step(ms),
    resume: () => {
      S.frozen = false;
      lastT = 0;
      start();
    },
    move: (x, y) => {
      onMove(x, y);
      start();
    },
    paint: () => render(0, 0.016),
  };
})();
