/* 显影：一张还没显影的相纸（一层乳剂）。
   未显影的它是灰的、平的，只有乳剂自己的东西——极细的颗粒、涂不匀的涂层、边沿积厚的那一圈。
   内容一直在纸里面，只是还没出来。

   显影由「光落下的那一点」定先后：指针落在哪儿，就从哪儿往外走，像光在乳剂上落了一下。
   所以它不是一整片滤镜淡入——每一次显影都有源头、有方向、有前峰。
   悬停只走到一小片；聚焦从光点走遍大半张、只显到一半；展开才走到底。
   三种光只是走得快慢不同：随笔快，项目慢，瞬间显影时偏暖。

   世界的让位也走同一条路：聚焦时周围的碎片不是被推暗，是重新退回灰里（`--yield`）。
   乳剂没有边界，整张一起变清楚——这是它与「有边界在退」的那类遮蔽物最大的不同。 */
(() => {
  'use strict';
  const { hash, rgba } = DriftReg;

  /* ── 乳剂的颗粒 ──
     一小块真噪声。重复的渐变格在缩放时会织出摩尔纹，而乳剂的颗粒本来就不成行。 */
  const GRAIN = (() => {
    const N = 64;
    const cv = document.createElement('canvas');
    cv.width = cv.height = N;
    const ctx = cv.getContext('2d');
    const d = ctx.createImageData(N, N);
    for (let i = 0; i < N * N; i++) {
      const a = hash('grain.a', i);
      const b = hash('grain.b', i);
      const dark = b < 0.54;
      d.data[i * 4] = dark ? 44 : 255;
      d.data[i * 4 + 1] = dark ? 46 : 252;
      d.data[i * 4 + 2] = dark ? 52 : 246;
      d.data[i * 4 + 3] = a < 0.44 ? 0 : Math.round((a - 0.44) * 58);
    }
    ctx.putImageData(d, 0, 0);
    return cv.toDataURL('image/png');
  })();

  /* 三种光显影的快慢：随笔快、项目慢、瞬间在中间。
     front 是前峰走遍整张要多久，dev 是悬停那一小片长出来的时间常数。 */
  const SPEED = {
    essay: { dev: 165, front: 430 },
    project: { dev: 430, front: 900 },
    moment: { dev: 270, front: 640 },
  };
  const HALF = 0.60; // 聚焦时离光点最近的那一片显影到这儿：像成形了，又还发闷
  const HOVER_R = 0.32; // 悬停那一小片的范围（相对最远角的比例）
  const FOCUS_R = 0.78; // 聚焦时前峰停在半路——离光点远的那一边还是灰的
  const OPEN_R = 1.3; // 展开时前峰走出纸外，整张都落到显影里
  const EASE_OPEN = 'cubic-bezier(0.32, 0.72, 0, 1)';
  const EASE_CLOSE = 'cubic-bezier(0.45, 0, 0.2, 1)';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* ══ 一张纸此刻显影到哪儿 ══
     光点是纸面上的百分比；--da/--ma 是洞心与过渡带的浓度，--ra/--rb/--rc 是前峰的三段半径。
     蒙版是「还没显影的那一层」的不透明度：洞里淡下去，露出来的就是纸里面的东西。 */
  const live = new Map(); // rec → 状态
  const VARS = ['--lx', '--ly', '--da', '--ma', '--ra', '--rb', '--rc', '--glow'];
  let lastYield = -1;

  function put(el, lx, ly, dev, r, glow) {
    el.style.setProperty('--lx', `${lx.toFixed(2)}%`);
    el.style.setProperty('--ly', `${ly.toFixed(2)}%`);
    el.style.setProperty('--da', Math.max(0, 1 - dev).toFixed(3));
    el.style.setProperty('--ma', Math.max(0, 1 - dev * 0.62).toFixed(3));
    el.style.setProperty('--ra', `${(r * 58).toFixed(2)}%`);
    el.style.setProperty('--rb', `${(r * 86).toFixed(2)}%`);
    el.style.setProperty('--rc', `${(r * 118).toFixed(2)}%`);
    el.style.setProperty('--glow', glow.toFixed(3));
  }
  const wipe = (el) => VARS.forEach((k) => el.style.removeProperty(k));

  function sheetOf(rec) {
    let s = live.get(rec);
    if (!s) {
      s = { rec, key: rec.key, scene: rec.it.scene, dev: 0, r: 0, glow: 0, tDev: 0, tR: 0, tau: 220, mode: 'hover', t0: 0, d0: 0, r0: 0, dBase: HALF, rBase: FOCUS_R, lx: 50, ly: 50, lit: false };
      live.set(rec, s);
    }
    return s;
  }

  /* 指针此刻落在纸面上的哪一处（百分比）。落点在纸外就收到边上，
     免得光打在纸沿上、显影只有半个圆。 */
  function lightOf(rec, mouse) {
    const it = rec.it;
    const sc = rec.s || 1;
    const M = it.M || 0;
    return {
      x: clamp((mouse.x - (rec.x - (it.cw * sc) / 2 + M * sc)) / (it.w * sc), 0.06, 0.94) * 100,
      y: clamp((mouse.y - (rec.y - (it.ch * sc) / 2 + M * sc)) / (it.h * sc), 0.06, 0.94) * 100,
    };
  }

  /* 每帧推一下。副本会被回收再派给别的条目，所以先确认这块 DOM 还是它的：
     不确认的话，一块刚滚出去的纸会把上一张的显影状态带给下一个用它的条目。 */
  function step(dt, now, RM) {
    for (const [rec, s] of live) {
      if (rec.el.dataset.key !== s.key || rec.el.style.opacity === '0') {
        wipe(rec.el);
        live.delete(rec);
        continue;
      }
      const sp = SPEED[s.scene] || SPEED.essay;
      if (s.mode === 'focus') {
        // 从此刻显影到哪儿接着走：悬停那一小片不会先退掉再重来一遍
        const e = RM ? 1 : 1 - Math.exp(-3 * Math.max(0, (now - s.t0) / sp.front));
        s.dev = s.d0 + (s.dBase - s.d0) * Math.min(1, e * 1.08);
        s.r = s.r0 + (s.rBase - s.r0) * Math.min(1, e * 1.14);
      } else if (s.mode === 'decay') {
        const e = RM ? 1 : 1 - Math.exp(-3.4 * Math.max(0, (now - s.t0) / (sp.front * 0.6)));
        s.dev = s.d0 * (1 - e);
        s.r = s.r0 * (1 - e);
        if (e > 0.985) {
          wipe(rec.el);
          live.delete(rec);
          continue;
        }
      } else {
        const k = RM ? 1 : 1 - Math.exp((-dt * 1000) / s.tau);
        const kr = RM ? 1 : 1 - Math.exp((-dt * 1000) / (s.tau * 1.45));
        s.dev += (s.tDev - s.dev) * k;
        s.r += (s.tR - s.r) * kr;
        if (!s.tDev && !s.tR && s.dev < 0.006 && s.r < 0.006) {
          wipe(rec.el);
          live.delete(rec);
          continue;
        }
      }
      // 光落上去的那一下：很快亮起，然后被乳剂吃掉
      s.glow *= RM ? 0 : Math.exp((-dt * 1000) / 430);
      if (s.glow < 0.003) s.glow = 0;
      put(rec.el, s.lx, s.ly, s.dev, s.r, s.glow);
    }
  }

  /* ══ 展开：把这一层乳剂挪到阅读面上 ══ */
  let layer = null;
  let reading = null; // 读着的那一张：光点要留着，收回来时还落在同一处
  let raf = 0;
  const timers = [];
  const stop = () => {
    timers.forEach(clearTimeout);
    timers.length = 0;
    cancelAnimationFrame(raf);
    raf = 0;
    // 走到一半就被收回时，那层还停在半显影上——不带走的话它会一直盖在面板上
    if (layer) {
      layer.remove();
      layer = null;
    }
  };
  const panelOf = (api) => {
    const w = Math.min(760, api.vw - 24);
    const top = api.vw < 640 ? 64 : 72;
    return { left: (api.vw - w) / 2, top, width: w, height: api.vh - top - 20 };
  };
  const flip = (from, to) => `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`;

  function veilEl(pr, lx, ly, dev, r) {
    const wrap = document.createElement('div');
    wrap.className = 'develop-layer';
    const v = document.createElement('div');
    v.className = 'develop-veil';
    // 落位就在面板上：FLIP 的位移是按「已经站在面板矩形上」算的
    Object.assign(v.style, { left: `${pr.left}px`, top: `${pr.top}px`, width: `${pr.width}px`, height: `${pr.height}px`, transformOrigin: '0 0' });
    put(v, lx, ly, dev, r, 0);
    wrap.appendChild(v);
    document.body.appendChild(wrap);
    layer = wrap;
    return v;
  }

  /* 其余碎片：被这一张的显影推开，同时退一档焦。
     它们重新退回灰里那件事由 --yield 管，所以这里不把它们压暗——世界不是变黑，是变回没有内容。 */
  function fxOf(api, cx, cy) {
    return {
      cx,
      cy,
      target(rec, fx, h) {
        const dx = rec.x - fx.cx;
        const dy = rec.y - fx.cy;
        const d = Math.hypot(dx, dy) || 1;
        const push = fx.amt * 86 * h.G * Math.max(0.16, 1 - d / (h.vw * 1.15));
        return { dx: (dx / d) * push, dy: (dy / d) * push * 0.72, s: 1 - 0.035 * fx.amt };
      },
      lod(rec, lod, fx) {
        const d = Math.hypot(rec.x - fx.cx, rec.y - fx.cy);
        return lod + (d < api.vw * 0.5 ? Math.round(fx.amt) : 0);
      },
    };
  }

  const hex2rgb = (h) => {
    const v = parseInt(h.slice(1), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  };
  const mix = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
  const seedOf = (it) => {
    let s = 2166136261;
    for (let i = 0; i < it.id.length; i++) s = Math.imul(s ^ it.id.charCodeAt(i), 16777619);
    return s >>> 0;
  };

  DriftReg.scheme('develop', {
    label: '显影',

    /* ══ 物：一张相纸 ══
       画的是显影完成之后的那一面——暖白的纸、涂不匀的涂层、边沿积厚的一圈、乳剂自己的颗粒。
       上面那层灰由 CSS 那一层管（见 css）。 */
    look: {
      margin: 16,
      inset: 0,
      paper: true, // 相纸上的墨：三种光下都压深，深底浅底都读得清

      surface(ctx, it, c, M) {
        const { w, h } = it;
        const s = seedOf(it);
        const paper = hex2rgb(c.paper);

        // 纸浮着一点，边上的暗很软
        ctx.save();
        ctx.filter = 'blur(7px)';
        ctx.translate(5, 9);
        ctx.fillStyle = rgba(c.drop, it.scene === 'essay' ? 0.32 : 0.46);
        ctx.fillRect(M, M, w, h);
        ctx.restore();

        // 纸面：上沿接光，往下沉一点
        const base = ctx.createLinearGradient(0, M, 0, M + h);
        base.addColorStop(0, rgba(mix(paper, [255, 255, 255], 0.42), 1));
        base.addColorStop(0.58, rgba(paper, 1));
        base.addColorStop(1, rgba(mix(paper, [118, 102, 84], 0.13), 1));
        ctx.fillStyle = base;
        ctx.fillRect(M, M, w, h);

        // 涂层不匀：两三团极淡的偏色。乳剂从来涂不匀，那是它唯一的花纹
        for (let i = 0; i < 3; i++) {
          const x = M + (0.16 + hash(s, i * 3) * 0.68) * w;
          const y = M + (0.16 + hash(s, i * 3 + 1) * 0.68) * h;
          const r = (0.3 + hash(s, i * 3 + 2) * 0.36) * Math.max(w, h);
          const g = ctx.createRadialGradient(x, y, 0, x, y, r);
          const tone = i % 2 ? [188, 172, 150] : [164, 170, 182];
          g.addColorStop(0, rgba(tone, 0.055));
          g.addColorStop(1, rgba(tone, 0));
          ctx.fillStyle = g;
          ctx.fillRect(M, M, w, h);
        }

        // 颗粒：乳剂自己的，比纸纹更细更密
        const n = Math.round((w * h) / 26);
        for (let i = 0; i < n; i++) {
          const a = 0.03 + hash(s, 900 + i) * 0.05;
          const dark = hash(s, 4000 + i) < 0.62;
          ctx.fillStyle = dark ? `rgba(96, 84, 68, ${a.toFixed(3)})` : `rgba(255, 252, 244, ${(a * 0.9).toFixed(3)})`;
          ctx.fillRect(M + Math.floor(hash(s, i) * w), M + Math.floor(hash(s, 2000 + i) * h), 1, 1);
        }

        // 边上厚一点：乳剂在边沿积起来，所以边比心沉、也比心实
        ctx.save();
        ctx.beginPath();
        ctx.rect(M, M, w, h);
        ctx.clip();
        ctx.strokeStyle = 'rgba(120, 104, 84, 0.10)';
        ctx.lineWidth = 8;
        ctx.strokeRect(M + 4, M + 4, w - 8, h - 8);
        ctx.strokeStyle = 'rgba(112, 98, 80, 0.15)';
        ctx.lineWidth = 2;
        ctx.strokeRect(M + 1, M + 1, w - 2, h - 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.fillRect(M, M, w, 1);
        ctx.restore();
      },
    },

    /* ══ 悬停：光在乳剂上落了一下 ══
       指针附近的一小片先显影。门槛用默认那份（lod ≤ 1）——
       远处只剩色块，在那里化开一小片没有意义。 */
    hover: {
      clear: true, // 那一小片要真的清楚：显影是把纸里面的东西拿出来

      enter(rec, api) {
        const st = sheetOf(rec);
        const p = lightOf(rec, api.mouse);
        st.mode = 'hover';
        st.tau = (SPEED[rec.it.scene] || SPEED.essay).dev;
        st.lx = p.x;
        st.ly = p.y;
        st.lit = true;
        st.tDev = 1;
        st.tR = HOVER_R;
        st.glow = 1;
      },

      leave(rec) {
        // 聚焦态由 focus 接管：那时指针移开不该把它重新蒙上
        if (rec.el.classList.contains('focused')) return;
        const st = live.get(rec);
        if (!st) return;
        st.mode = 'hover';
        st.tDev = 0;
        st.tR = 0;
        st.glow = 0;
      },

      tick(dt, t, api) {
        // 悬停与聚焦两个 tick 每帧都会被调到，所以推进只放在这一处
        const hr = api.hoverRec;
        if (hr && !api.reading && !hr.el.classList.contains('focused')) {
          // 光跟着指针走，显影稍慢一步跟上——所以指针划过去会留下一道正在成形的痕。
          // 聚焦之后光就落定了：镜头把纸推到指针底下，不该再把光点一起拖过去。
          const st = live.get(hr);
          if (st) {
            const p = lightOf(hr, api.mouse);
            const k = api.RM ? 1 : 1 - Math.exp((-dt * 1000) / 80);
            st.lx += (p.x - st.lx) * k;
            st.ly += (p.y - st.ly) * k;
          }
        }
        step(dt, t, api.RM);
      },

      /* 邻近的碎片跟着让开一点：显影处的那点光，周围也感到了一点 */
      neighbor(rec, hr, api) {
        const dx = rec.x - hr.x;
        const dy = rec.y - hr.y;
        const d = Math.hypot(dx, dy);
        const R = api.vw * 0.42;
        if (d > R || d < 1) return null;
        const f = (1 - d / R) ** 2;
        return { dx: (dx / d) * 5 * f * api.G, dy: (dy / d) * 5 * f * api.G };
      },
    },

    /* ══ 聚焦：光落上去，从那一处往外成形，只到一半 ══
       前峰从光点走遍大半张，浓度停在半路——成形了，还没完成；
       离光点远的那一边还是灰的，所以「只到一半」是看得见方向的。 */
    focus: {
      on(rec, api) {
        const st = sheetOf(rec);
        if (!st.lit) {
          // 没有指针落过（触屏）：光落在每张纸自己的那一处
          st.lx = 22 + hash(rec.key, 'light.x') * 56;
          st.ly = 20 + hash(rec.key, 'light.y') * 60;
        }
        st.mode = 'focus';
        st.t0 = api.now();
        st.d0 = st.dev; // 从悬停留下的那一小片接着走
        st.r0 = st.r;
        st.dBase = HALF;
        st.rBase = FOCUS_R;
        st.glow = 1;
      },

      off(rec, api) {
        const st = live.get(rec);
        if (!st) return;
        st.mode = 'decay';
        st.t0 = api.now();
        st.d0 = st.dev;
        st.r0 = st.r;
        st.glow = 0;
      },

      tick(dt, t, api) {
        // 让位的进度：周围的碎片一起退回灰里。量化到二十分之一，免得每帧重算整片场景
        const q = api.rec ? Math.round(api.on * 20) / 20 : 0;
        if (q !== lastYield) {
          lastYield = q;
          api.root.style.setProperty('--yield', String(q));
        }
      },

      /* 让位不靠压暗：周围碎片的乳剂重新变实，它们退回没有内容的状态 */
      yield(rec, on) {
        return { alpha: 1 - 0.16 * on };
      },
    },

    /* ══ 展开：显影到底，整张放大成读面 ══
       字从灰里浮出来：面板长上来的同时，盖在上面的那层乳剂接着光点继续往外走，
       走到把整张盖住，浓度落到零，字就出来了。 */
    open: {
      run(api) {
        const rec = api.rec;
        const r = api.rectOf();
        const pr = panelOf(api);
        const cx = r ? r.left + r.width / 2 : api.vw / 2;
        const cy = r ? r.top + r.height / 2 : api.vh / 2;
        stop();
        api.setFx(fxOf(api, cx, cy));
        // 碎片此刻显影到哪儿：光点、范围、浓度都带进这一层，藏起碎片的那一帧才看不出换了东西
        const st = live.get(rec);
        const lx = st ? st.lx : 50;
        const ly = st ? st.ly : 50;
        const dev = st ? st.dev : HALF;
        const rad = st ? st.r : FOCUS_R;
        if (st) {
          wipe(rec.el);
          live.delete(rec);
        }
        reading = { rec, lx, ly }; // 光点留着：收回时字要从同一处褪回灰里
        api.hide();
        if (api.RM || !r) {
          api.openReader(pr);
          return;
        }
        const veil = veilEl(pr, lx, ly, dev, rad);
        // 与面板同一段 FLIP（同一时长、同一条曲线），所以这一层始终贴着阅读面
        veil.animate([{ transform: flip(r, pr) }, { transform: 'none' }], { duration: 780, easing: EASE_OPEN, fill: 'both' });
        api.openReader(r, { mode: 'grow' });
        // 接着往前走：光点不动，前峰走出纸外，浓度落到零——灰是从光点那一侧先退的
        const t0 = api.now();
        const DUR = 940;
        const walk = () => {
          const p = Math.min(1, (api.now() - t0) / DUR);
          // 两条都慢起：灰要在读面上待得住，字才是从灰里浮出来的，不是一开就散
          const ef = Math.pow(p, 1.4); // 前峰往外走
          const ed = Math.pow(p, 1.7); // 浓度落下去
          put(veil, lx, ly, dev + (1 - dev) * ed, rad + (OPEN_R - rad) * ef, 0);
          if (p < 1) raf = requestAnimationFrame(walk);
          else veil.style.setProperty('--vo', '0');
        };
        raf = requestAnimationFrame(walk);
        timers.push(setTimeout(() => {
          if (layer && layer.firstChild === veil) {
            layer.remove();
            layer = null;
          }
        }, 1900));
      },

      /* 收回：正文重新压回灰里，这一层跟着面板缩回碎片 */
      closing(api) {
        const rec = api.rec;
        const r = api.rectOf();
        const pr = panelOf(api);
        stop();
        api.setFx(Object.assign(fxOf(api, r ? r.left + r.width / 2 : api.vw / 2, r ? r.top + r.height / 2 : api.vh / 2), { goal: 0 }));
        if (api.RM || !r) return;
        const lx = reading ? reading.lx : 50;
        const ly = reading ? reading.ly : 50;
        const veil = veilEl(pr, lx, ly, 1, OPEN_R);
        veil.animate([{ transform: 'none' }, { transform: flip(r, pr) }], { duration: 600, delay: 90, easing: EASE_CLOSE, fill: 'both' });
        const t0 = api.now();
        const DUR = 620;
        const back = () => {
          const p = Math.min(1, (api.now() - t0) / DUR);
          const e = 1 - Math.pow(1 - p, 1.8);
          put(veil, lx, ly, 1 - (1 - HALF) * e, OPEN_R - (OPEN_R - FOCUS_R) * e, 0);
          if (p < 1) raf = requestAnimationFrame(back);
        };
        raf = requestAnimationFrame(back);
      },

      closed(api) {
        stop();
        const rec = api.rec;
        const lx = reading ? reading.lx : null;
        const ly = reading ? reading.ly : null;
        reading = null;
        // 回到聚焦态：碎片重新出现时，就该停在刚才褪回去的那一半
        if (rec && rec.el.classList.contains('focused')) {
          const st = sheetOf(rec);
          st.lit = true;
          if (lx != null) {
            st.lx = lx;
            st.ly = ly;
          } else {
            st.lx = 22 + hash(rec.key, 'light.x') * 56;
            st.ly = 20 + hash(rec.key, 'light.y') * 60;
          }
          st.mode = 'focus';
          st.t0 = api.now() - 1e5; // 已经显影到那一半了，不用再演一次
          st.d0 = HALF;
          st.r0 = FOCUS_R;
          st.dBase = HALF;
          st.rBase = FOCUS_R;
          st.glow = 0;
          put(rec.el, st.lx, st.ly, HALF, FOCUS_R, 0);
        }
      },
    },

    css: `
/* 乳剂：整张相纸压着一层还没显影的灰。
   显影从「光落下的那一点」往外走，所以蒙版是一个跟着光点的径向洞：
   --da / --ma 是洞心与过渡带的浓度（1 = 还没显影），--ra / --rb / --rc 是前峰的三段半径。 */
html[data-scheme='develop'] .frag::before,
html[data-scheme='develop'] .develop-veil {
  content: '';
  position: absolute;
  inset: var(--m, 0px);
  transform-origin: 0 0;
  pointer-events: none;
  image-rendering: pixelated;
  background-color: rgb(var(--latent, 148 155 166));
  background-image:
    url('${GRAIN}'),
    radial-gradient(72% 60% at 26% 16%, rgb(255 255 255 / .085), rgb(255 255 255 / 0) 74%),
    radial-gradient(48% 42% at 74% 80%, rgb(var(--coat, 84 94 112) / .12), rgb(var(--coat, 84 94 112) / 0) 78%),
    linear-gradient(180deg, rgb(var(--coat, 84 94 112) / 0) 40%, rgb(var(--coat, 84 94 112) / .17) 100%);
  background-size: 140px 140px, 100% 100%, 100% 100%, 100% 100%;
  background-repeat: repeat, no-repeat, no-repeat, no-repeat;
  box-shadow:
    inset 0 0 0 2px rgb(var(--coat, 84 94 112) / .40),
    inset 0 0 26px rgb(var(--coat, 84 94 112) / .22);
  -webkit-mask-image: radial-gradient(circle at var(--lx, 50%) var(--ly, 50%),
    rgb(0 0 0 / var(--da, 1)) 0 var(--ra, 0%),
    rgb(0 0 0 / var(--ma, 1)) var(--rb, 0%),
    rgb(0 0 0 / 1) var(--rc, 0%));
  mask-image: radial-gradient(circle at var(--lx, 50%) var(--ly, 50%),
    rgb(0 0 0 / var(--da, 1)) 0 var(--ra, 0%),
    rgb(0 0 0 / var(--ma, 1)) var(--rb, 0%),
    rgb(0 0 0 / 1) var(--rc, 0%));
}
/* 未显影的浓度：--yield 是「世界让开」的进度，周围的碎片跟着变实、退回灰里 */
html[data-scheme='develop'] .frag::before {
  opacity: calc(var(--lat0, .86) + (1 - var(--lat0, .86)) * var(--yield, 0));
}

/* 光落在乳剂上的那一下：很快亮起，然后被吃掉 */
html[data-scheme='develop'] .frag::after {
  content: '';
  position: absolute;
  inset: var(--m, 0px);
  pointer-events: none;
  opacity: var(--glow, 0);
  background: radial-gradient(circle at var(--lx, 50%) var(--ly, 50%),
    rgb(var(--devexp, 246 244 236) / .46) 0 5%,
    rgb(var(--devexp, 246 244 236) / .15) 24%,
    rgb(var(--devexp, 246 244 236) / 0) 60%);
}

html[data-scheme='develop'] .develop-layer { position: fixed; inset: 0; z-index: 24; pointer-events: none; }
html[data-scheme='develop'] .develop-veil { opacity: var(--vo, 1); transition: opacity .28s linear; }

/* 三种光：随笔显影得快，是一层薄乳剂；项目慢，厚而沉；瞬间的乳剂带一点暖 */
html[data-scheme='develop'][data-scene='essay'] { --latent: 148 155 166; --coat: 84 94 112; --devexp: 246 244 236; --lat0: .91; }
html[data-scheme='develop'][data-scene='project'] { --latent: 88 96 116; --coat: 30 40 60; --devexp: 190 214 226; --lat0: .95; }
html[data-scheme='develop'][data-scene='moment'] { --latent: 142 130 148; --coat: 72 58 74; --devexp: 255 206 156; --lat0: .93; }
`,
  });
})();
