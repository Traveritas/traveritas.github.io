/* 拾得 · 另外几种外壳（?shell=contour|text|moire|agate|glass|window；默认仍是 ornament.js 的放射细线）

   每一种和 ornament.js 同一个接口：
     build(item) → { tier, T, R, layers:[{ i, dz, rOut, rank, speed, phase, a, ... }] }
     draw(ctx, layer, px, angle, c, sheet, env)
       px 画布边长；c 完整度 0..1；env = { ink, light, tint, glass, item, lod }（缩略图里也传）
   层仍是一个个 DOM 元素、按 dz 放在不同深度——前后关系、视差、像素化都照旧。

   稀有度各自藏在哪：
     contour  等高线：圈数、坡度、副峰；最稀有一档中间是一个洼，物件坐在坑里
     text     字环：物件自己的两句话绕成圈，越稀有圈越多、字越小越密，最外圈多一句只有它有的
     moire    摩尔纹：几片细线栅叠着，层与层错开时干涉纹会流动；越稀有栅的种类越多
     agate    玛瑙带：低饱和的同心色带，从外往里长；越稀有带越多越细，中间出现晶洞
     glass    玻片：斜插的薄玻片，边缘接光；越稀有片越多，出现圆片、缺口片、蚀刻字
     window   一扇窗：物件住在一扇小窗里；越稀有套得越多层、转得越开，最稀有的外层只剩影子 */
(() => {
  const TAU = Math.PI * 2;
  const { tierOf, TIERS } = window.CollectOrnament;
  const hash = (...n) => {
    let h = 2166136261;
    for (const v of n) {
      const s = String(v);
      for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
      h = Math.imul(h ^ 0x9e37, 2654435761);
    }
    return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
  };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const SERIF = `'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', SimSun, serif`;
  const MONO = `'IBM Plex Mono', ui-monospace, Consolas, monospace`;
  const fmtOdds = (n) => `1/${Math.round(n).toLocaleString('en-US')}`;
  /* 线色字符串里的 alpha：ctx.strokeStyle 由 collect.js 设好（rgb(r g b / a)），这里按比例换 */
  const withA = (style, k) => {
    const m = /rgba?\(([^)]+)\)/.exec(style);
    if (!m) return style;
    const parts = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    const a = parts.length > 3 ? parts[3] : 1;
    return `rgb(${parts[0]} ${parts[1]} ${parts[2]} / ${clamp(a * k, 0, 1).toFixed(3)})`;
  };
  const rgbA = (rgb, a) => `rgb(${rgb} / ${clamp(a, 0, 1).toFixed(3)})`;
  /* 层的画布：单位坐标 1 = 画布半边长的 0.92（和 ornament.js 一致） */
  const frame = (px) => ({ cx: px / 2, r: (px / 2) * 0.92 });
  const layerBase = (item, i, n, extra) => {
    const rank = n > 1 ? i / (n - 1) : 0;
    return Object.assign({ i, rank, a: 1, grow: false, phase: hash(item.id, i, 'ph') * TAU, speed: 0, dz: -0.015 + rank * 0.15 }, extra);
  };

  /* ════════════ 等高线 ════════════
     地形靠「走势」出形，不靠噪声：一座峰（物件在峰顶），往一个方向伸出山脊，一侧陡一侧缓；
     越稀有地形越复杂——山脊、鞍部、副峰，最稀有一档是火山口（物件坐在坑底）。
     每一道等高线各自一层，深度按高度给：高的朝镜头凸出来，低的退到后面；起伏的幅度也按档位变。
     计曲线（加粗的那几道）上写物件自己的话：字在哪儿，线就在哪儿让开一段。 */
  const contour = (() => {
    // levels 等高线道数；relief 最高与最低之间的深度差；ridge / spur / peaks / crater 地形的部件
    const CFG = [
      { levels: 5, relief: 0.05, elong: 1.15, skew: 0.1 },
      { levels: 7, relief: 0.07, elong: 1.35, skew: 0.25 },
      { levels: 9, relief: 0.1, elong: 1.4, skew: 0.3, ridge: 0.42 },
      { levels: 11, relief: 0.13, elong: 1.45, skew: 0.35, ridge: 0.5, peaks: 1 },
      { levels: 13, relief: 0.16, elong: 1.5, skew: 0.4, ridge: 0.54, spur: 1, peaks: 2 },
      { levels: 15, relief: 0.15, elong: 1.2, skew: 0.25, ridge: 0.48, spur: 1, peaks: 2, crater: 1 },
    ];
    const N = 168;
    const FS = 9.5; // 字号（世界 px）
    const smax = (a, b, k) => { const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1); return lerp(a, b, h) + k * h * (1 - h); };
    function field(item, C) {
      const rnd = (...k) => hash(item.id, 'ct2', ...k);
      const dir = rnd('dir') * TAU;
      const cd = Math.cos(dir), sd = Math.sin(dir);
      const bend = (rnd('bend') - 0.5) * 1.2;
      // 圆锥形的剖面：线距在坡上比较匀
      const cone = (d, w) => Math.max(0, 1 - d / w) ** 1.25;
      // 沿山脊方向的一串点（带一点弯）
      // 火山口那档：山脊从口沿外面长出去（不然全被口沿吞掉）
      const st = C.crater ? 0.26 : 0;
      const spine = (len, ang, k0) => {
        const pts = [];
        let a = ang, x = Math.cos(ang) * st, y = Math.sin(ang) * st;
        pts.push([x, y, 0]);
        for (let k = 1; k <= 8; k++) { a += bend / 8 + (k0 || 0); x += (Math.cos(a) * len) / 8; y += (Math.sin(a) * len) / 8; pts.push([x, y, k / 8]); }
        return pts;
      };
      const ridges = [];
      if (C.ridge) ridges.push(spine(C.ridge, dir, 0));
      if (C.spur) ridges.push(spine(C.ridge * 0.6, dir + (rnd('sp') < 0.5 ? 1 : -1) * (1.9 + 0.4 * rnd('sa')), -bend / 10));
      const peaks = [];
      for (let p = 0; p < (C.peaks || 0); p++) {
        const r = ridges[p % ridges.length] || spine(0.6, dir, 0);
        const [x, y] = r[r.length - 1];
        peaks.push({ x, y, h: 0.5 + 0.12 * rnd('ph', p), w: 0.2 + 0.05 * rnd('pw', p) });
      }
      const wob = Array.from({ length: 2 }, (_, k) => ({ f: 3 + k * 2, p: rnd('wb', k) * TAU }));
      return (x, y) => {
        // 主峰：沿山脊方向拉长，一侧陡一侧缓
        const u = x * cd + y * sd, v = -x * sd + y * cd;
        const uu = u > 0 ? u / C.elong : u * (1 + C.skew);
        const th = Math.atan2(y, x);
        let w = 0;
        for (const q of wob) w += Math.sin(q.f * th + q.p);
        const d0 = Math.hypot(uu, v * (1 + C.skew * 0.5)) * (1 + 0.025 * w);
        let h;
        if (C.crater) {
          // 火山口：口沿（d = 0.3）最高，往外是坡，往里一圈圈降到坑底；物件坐在坑底
          const RIM = 0.3;
          h = d0 > RIM ? cone(d0 - RIM, 0.24) : 1 - 0.5 * (1 - (d0 / RIM) ** 2);
        } else h = cone(d0, 0.62);
        // 山脊：到折线的距离（不是一串点，免得鼓成珠子），高度沿脊往外降
        for (const r of ridges) {
          let best = 9, bt = 0;
          for (let q = 1; q < r.length; q++) {
            const [ax, ay, at0] = r[q - 1], [bx, by, at1] = r[q];
            const dx = bx - ax, dy = by - ay;
            const t = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy), 0, 1);
            const d = Math.hypot(x - ax - dx * t, y - ay - dy * t);
            if (d < best) { best = d; bt = lerp(at0, at1, t); }
          }
          h = smax(h, cone(best, C.crater ? 0.22 : 0.3) * lerp(C.crater ? 0.62 : 0.8, 0.3, bt), 0.06);
        }
        for (const p of peaks) h = smax(h, p.h * cone(Math.hypot(x - p.x, y - p.y), p.w * 1.6), 0.06);
        const e = clamp((1 - Math.hypot(x, y)) / 0.2, 0, 1);
        return h * e * e * (3 - 2 * e);
      };
    }
    /* marching squares → 连成整条 → Chaikin 平滑 */
    function lines(g, level) {
      const at = (i) => -1.02 + (2.04 * i) / N;
      const v = (i, j) => g[j * (N + 1) + i] - level;
      const ip = (a, b) => a / (a - b);
      const segs = [];
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const a = v(i, j), b = v(i + 1, j), c = v(i + 1, j + 1), d = v(i, j + 1);
        const k = (a > 0) | ((b > 0) << 1) | ((c > 0) << 2) | ((d > 0) << 3);
        if (k === 0 || k === 15) continue;
        const x0 = at(i), x1 = at(i + 1), y0 = at(j), y1 = at(j + 1);
        const T = [x0 + (x1 - x0) * ip(a, b), y0];
        const R = [x1, y0 + (y1 - y0) * ip(b, c)];
        const B = [x0 + (x1 - x0) * ip(d, c), y1];
        const L = [x0, y0 + (y1 - y0) * ip(a, d)];
        const add = (p, q) => segs.push([p, q]);
        switch (k) {
          case 1: case 14: add(L, T); break;
          case 2: case 13: add(T, R); break;
          case 3: case 12: add(L, R); break;
          case 4: case 11: add(R, B); break;
          case 6: case 9: add(T, B); break;
          case 7: case 8: add(L, B); break;
          case 5: add(L, T); add(R, B); break;
          case 10: add(T, R); add(L, B); break;
        }
      }
      const key = (p) => `${Math.round(p[0] * 1e5)},${Math.round(p[1] * 1e5)}`;
      const adj = new Map();
      segs.forEach((s, n) => {
        for (const e of [0, 1]) {
          const kk = key(s[e]);
          if (!adj.has(kk)) adj.set(kk, []);
          adj.get(kk).push(n);
        }
      });
      const used = new Uint8Array(segs.length);
      const loops = [];
      for (let n = 0; n < segs.length; n++) {
        if (used[n]) continue;
        used[n] = 1;
        const pts = [segs[n][0], segs[n][1]];
        for (let guard = 0; guard < 20000; guard++) {
          const tail = pts[pts.length - 1];
          const nx = (adj.get(key(tail)) || []).find((m) => !used[m]);
          if (nx == null) break;
          used[nx] = 1;
          const s = segs[nx];
          pts.push(key(s[0]) === key(tail) ? s[1] : s[0]);
        }
        if (pts.length < 8) continue;
        let far = 0;
        for (const q of pts) far = Math.max(far, Math.hypot(q[0], q[1]));
        if (far > 0.93) continue; // 边界衰减出来的那圈，不是地形
        loops.push(chaikin(chaikin(pts)));
      }
      return loops;
    }
    function chaikin(p) {
      const o = [];
      const n = p.length - 1; // 闭合：首尾是同一点
      for (let i = 0; i < n; i++) {
        const a = p[i], b = p[i + 1];
        o.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
      }
      o.push(o[0]);
      return o;
    }
    const arcLen = (p) => {
      const s = [0];
      for (let i = 1; i < p.length; i++) s.push(s[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
      return s;
    };
    function sample(p, s, at) {
      let i = 1;
      while (i < s.length - 1 && s[i] < at) i++;
      const t = (at - s[i - 1]) / Math.max(1e-9, s[i] - s[i - 1]);
      const a = p[i - 1], b = p[i];
      return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), Math.atan2(b[1] - a[1], b[0] - a[0])];
    }
    /* 沿一条闭合线排一句话：以线上最靠下的点为中点，字总是正着读；返回字的位置和要让开的那一段 */
    function label(loop, text, gapU, phi = 0) {
      const s = arcLen(loop);
      const total = s[s.length - 1];
      const chars = Array.from(text);
      const wOf = (ch) => (ch.charCodeAt(0) < 0x2e80 ? 0.58 : 1) * gapU;
      const ws = chars.map(wOf);
      const need = ws.reduce((a, b) => a + b, 0);
      if (need > total * 0.8) return null;
      let mi = 0;
      // 以「偏下方、按 phi 转开一点」的那一点为中点：几句字不会叠在同一个方位
      const dx = Math.sin(phi), dy = Math.cos(phi);
      const sc = (q) => q[0] * dx + q[1] * dy;
      for (let i = 0; i < loop.length; i++) if (sc(loop[i]) > sc(loop[mi])) mi = i;
      const mid = s[mi];
      const ang = sample(loop, s, mid)[2];
      const rev = Math.cos(ang) < 0; // 朝左走的话倒过来排，字才是正的
      const out = [];
      let acc = 0;
      for (let k = 0; k < chars.length; k++) {
        const off = (acc + ws[k] / 2 - need / 2) * (rev ? -1 : 1);
        acc += ws[k];
        const at = (((mid + off) % total) + total) % total;
        const [x, y, a] = sample(loop, s, at);
        out.push({ ch: chars[k], x, y, a: rev ? a + Math.PI : a });
      }
      const pad = gapU * 0.7;
      return { chars: out, from: mid - need / 2 - pad, to: mid + need / 2 + pad };
    }
    /* 把闭合线按「让开的那一段」切成开放的折线 */
    function cut(loop, gap) {
      if (!gap) return [loop];
      const s = arcLen(loop);
      const T = s[s.length - 1];
      const inGap = (x) => (((x - gap.from) % T) + T) % T < gap.to - gap.from;
      const parts = [];
      let cur = [];
      for (let i = 0; i < loop.length; i++) {
        if (inGap(s[i])) { if (cur.length > 1) parts.push(cur); cur = []; } else cur.push(loop[i]);
      }
      if (cur.length > 1) parts.push(cur);
      // 首尾两段其实是连着的
      if (parts.length > 1 && !inGap(0)) { const last = parts.pop(); parts[0] = last.concat(parts[0]); }
      return parts;
    }
    function build(item) {
      const tier = tierOf(item.odds);
      const C = CFG[tier];
      const T = TIERS[tier];
      const R = T.R;
      const F = field(item, C);
      const g = new Float32Array((N + 1) * (N + 1));
      const at = (i) => -1.02 + (2.04 * i) / N;
      let max = 0;
      for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) { const h = F(at(i), at(j)); g[j * (N + 1) + i] = h; if (h > max) max = h; }
      const gapU = (FS * 1.12) / R;
      // 字从最里一道计曲线起放：额外那句 → 梦 → 醒
      const say = [];
      if (tier >= 3) say.push((item.extra && item.extra.more) || `${item.name}　${fmtOdds(item.odds)}`);
      if (tier >= 1) say.push(item.text.dream);
      say.push(item.text.wake);
      const n = C.levels;
      const levels = [];
      for (let k = 0; k < n; k++) {
        const hk = max * lerp(0.1, 0.95, k / (n - 1));
        // 计曲线：从上往下每第 3 道
        levels.push({ k, hk, idx: (n - 1 - k) % 3 === 1, loops: lines(g, hk) });
      }
      const lenOf = (p) => arcLen(p)[p.length - 1];
      let si = 0;
      for (let k = n - 1; k >= 0 && si < say.length; k--) {
        const L = levels[k];
        if (!L.idx || !L.loops.length) continue;
        const loop = L.loops.reduce((a, b) => (lenOf(b) > lenOf(a) ? b : a));
        const lb = label(loop, say[si], gapU, [0.15, -1.35, 1.55][si] + (hash(item.id, 'lb') - 0.5) * 0.6);
        if (!lb) continue;
        L.label = lb;
        L.labelLoop = loop;
        si++;
      }
      const layers = levels.map((L) => {
        const paths = [];
        for (const lp of L.loops) for (const part of cut(lp, lp === L.labelLoop ? L.label : null)) paths.push(part);
        let mU = 0.05;
        for (const p of paths) for (const q of p) mU = Math.max(mU, Math.hypot(q[0], q[1]));
        const rOut = R * mU * 1.04 + FS;
        const S = (rOut / 0.96) * 2;
        const hn = L.hk / max; // 0 低 → 1 高
        return {
          i: 0,
          rank: 1 - hn,
          a: 1,
          grow: false,
          phase: 0,
          speed: 0,
          // 高的朝镜头凸出来：最高一道略在物件前面，最低一道退到 relief 之后
          dz: -0.012 + (1 - hn) * C.relief,
          rOut,
          wk: R / S, // 单位坐标（1 = R）→ 画布边长的比例
          fsK: FS / S,
          idx: L.idx,
          sharp: !!L.label,
          hn,
          paths: paths.map((p) => Float32Array.from(p.flat())),
          chars: L.label ? L.label.chars : null,
        };
      });
      layers.sort((a, b) => a.dz - b.dz);
      layers.forEach((L, i) => { L.i = i; });
      return { tier, T, R, layers };
    }
    function draw(ctx, L, px, angle, c) {
      const cx = px / 2;
      const k = L.wk * px;
      // 靠近时从低往高一道道浮出来；完整度 1 时全在
      const show = clamp((lerp(0.3, 1.25, c) - L.hn) / 0.25, 0, 1);
      if (show <= 0) return;
      const st = ctx.strokeStyle;
      const base = ctx.lineWidth;
      ctx.lineWidth = base * (L.idx ? 1.35 : 0.75);
      ctx.strokeStyle = withA(st, (L.idx ? 1 : 0.7) * show);
      ctx.lineJoin = ctx.lineCap = 'round';
      ctx.beginPath();
      for (const p of L.paths) {
        ctx.moveTo(cx + p[0] * k, cx + p[1] * k);
        for (let j = 2; j < p.length; j += 2) ctx.lineTo(cx + p[j] * k, cx + p[j + 1] * k);
      }
      ctx.stroke();
      if (L.chars) {
        const fs = Math.max(3, L.fsK * px);
        ctx.fillStyle = withA(st, 0.95 * show);
        ctx.font = `400 ${fs.toFixed(2)}px ${SERIF}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (const q of L.chars) {
          ctx.save();
          ctx.translate(cx + q.x * k, cx + q.y * k);
          ctx.rotate(q.a);
          ctx.fillText(q.ch, 0, 0);
          ctx.restore();
        }
      }
      ctx.lineWidth = base;
      ctx.strokeStyle = st;
    }
    return { build, draw };
  })();

  /* ════════════ 字环 ════════════ */
  const text = (() => {
    // rings：圈数；fs：字号（世界 px）；spiral：最里一圈卷成螺旋的圈数
    const CFG = [
      { rings: 1, fs: 12, R: 112 },
      { rings: 2, fs: 11, R: 140 },
      { rings: 3, fs: 10, R: 170 },
      { rings: 4, fs: 9, R: 205, spiral: 1.6 },
      { rings: 5, fs: 8.5, R: 240, spiral: 2.2 },
      { rings: 6, fs: 8, R: 280, spiral: 3 },
    ];
    function build(item) {
      const tier = tierOf(item.odds);
      const C = CFG[tier];
      const T = TIERS[tier];
      const w = item.text.wake;
      const d = item.text.dream;
      const more = (item.extra && item.extra.more) || `${item.name}　${fmtOdds(item.odds)}`;
      // 一圈一句：醒、梦交替；最外一圈是「只有它有的」那句（原型里先放名字与几率）
      const srcs = [];
      for (let k = 0; k < C.rings; k++) srcs.push(k === C.rings - 1 && C.rings > 2 ? more : k % 2 ? d : w);
      const r0 = 0.3;
      const layers = srcs.map((s, i) => {
        const u0 = r0 + ((1 - r0) * i) / C.rings;
        const u1 = r0 + ((1 - r0) * (i + 1)) / C.rings;
        const ru = i === 0 && C.spiral ? u1 - 0.02 : (u0 + u1) / 2;
        return layerBase(item, i, C.rings, {
          rOut: C.R * u1 + C.fs * 1.2,
          src: s,
          ru: ru / u1, // 本层单位坐标里的半径
          spiral: i === 0 ? C.spiral || 0 : 0,
          rIn: (r0 * 0.7) / u1,
          fsU: C.fs / (C.R * u1),
          mono: i === C.rings - 1 && C.rings > 2,
          rule: tier >= 2,
          speed: (0.05 - tier * 0.007) * (i % 2 ? -1 : 1),
        });
      });
      return { tier, T: Object.assign({}, T, { R: C.R }), R: C.R, layers };
    }
    function draw(ctx, L, px, angle, c) {
      const { cx, r } = frame(px);
      const fs = Math.max(4, L.fsU * r);
      const st = ctx.strokeStyle;
      ctx.fillStyle = st;
      ctx.font = `${L.mono ? 400 : 400} ${(L.mono ? fs * 0.9 : fs).toFixed(2)}px ${L.mono ? MONO : SERIF}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const sep = L.mono ? '　·　' : '　';
      const chars = Array.from(L.src + sep);
      const gap = fs * (L.mono ? 0.78 : 1.12);
      // 沿路径排字：环 → 一圈填满（句子循环），螺旋 → 从外往里收
      const turns = L.spiral || 1;
      const rad = (u) => (L.spiral ? lerp(L.ru, L.rIn, u) : L.ru) * r;
      // 估总长
      let len = 0;
      for (let k = 0; k < 64; k++) len += (rad((k + 0.5) / 64) * TAU * turns) / 64;
      const n = Math.max(6, Math.floor(len / gap));
      const shown = Math.floor(n * lerp(0.55, 1, c));
      let u = 0;
      for (let k = 0; k < shown; k++) {
        const rr = rad(u);
        const a = angle + u * TAU * turns;
        ctx.save();
        ctx.translate(cx + Math.cos(a) * rr, cx + Math.sin(a) * rr);
        ctx.rotate(a + Math.PI / 2);
        ctx.fillText(chars[k % chars.length], 0, 0);
        ctx.restore();
        u += gap / (rr * TAU * turns);
        if (u >= 1) break;
      }
      if (L.rule && !L.spiral) {
        // 很淡的一道细线，衬在字下面，像钱币的边
        ctx.strokeStyle = withA(st, 0.35);
        ctx.beginPath();
        ctx.arc(cx, cx, L.ru * r - fs * 0.95, 0, TAU);
        ctx.stroke();
        ctx.strokeStyle = st;
      }
    }
    return { build, draw };
  })();

  /* ════════════ 摩尔纹 ════════════ */
  const moire = (() => {
    // 每层一片线栅：par 平行线、ring 同心圆、ray 放射线；sp 线距（世界 px）
    const CFG = [
      [{ k: 'par', ang: 0 }, { k: 'par', ang: 0.07 }],
      [{ k: 'par', ang: 0 }, { k: 'par', ang: 0.05 }, { k: 'par', ang: 1.1 }],
      [{ k: 'ring', o: [0, 0] }, { k: 'ring', o: [0.05, 0.02] }, { k: 'par', ang: 0.3 }],
      [{ k: 'ring', o: [0, 0] }, { k: 'ring', o: [0.06, -0.03] }, { k: 'ray', n: 72 }],
      [{ k: 'ring', o: [0, 0] }, { k: 'ray', n: 84 }, { k: 'ray', n: 88 }, { k: 'ring', o: [-0.05, 0.04] }],
      [{ k: 'ring', o: [0, 0] }, { k: 'ray', n: 96 }, { k: 'ring', o: [0.04, 0.05] }, { k: 'ray', n: 101 }, { k: 'par', ang: 0.6 }],
    ];
    function build(item) {
      const tier = tierOf(item.odds);
      const T = TIERS[tier];
      const list = CFG[tier];
      const R = T.R * 0.85;
      const layers = list.map((g, i) =>
        layerBase(item, i, list.length, Object.assign({}, g, {
          rOut: R,
          // 前后拉开：错开的视差就是让干涉纹流动的东西
          dz: -0.02 + (i / Math.max(1, list.length - 1)) * 0.12,
          spU: 6 / R,
          speed: (g.k === 'ring' ? 0 : 0.018) * (i % 2 ? -1 : 1) * (1 - tier * 0.12),
          phase: (g.ang || 0) + hash(item.id, i) * 0.02,
        })),
      );
      return { tier, T, R, layers };
    }
    function draw(ctx, L, px, angle, c) {
      const { cx, r } = frame(px);
      const rv = r * lerp(0.62, 1, c);
      const sp = Math.max(2, L.spU * r);
      const base = ctx.lineWidth;
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cx, rv, 0, TAU);
      ctx.clip();
      ctx.lineWidth = Math.max(0.6, base * 0.7);
      const st0 = ctx.strokeStyle;
      ctx.strokeStyle = withA(st0, 0.62);
      ctx.beginPath();
      if (L.k === 'par') {
        const ca = Math.cos(angle), sa = Math.sin(angle);
        for (let y = -rv; y <= rv; y += sp) {
          const h = Math.sqrt(Math.max(0, rv * rv - y * y));
          ctx.moveTo(cx + (-h * ca - y * sa), cx + (-h * sa + y * ca));
          ctx.lineTo(cx + (h * ca - y * sa), cx + (h * sa + y * ca));
        }
      } else if (L.k === 'ring') {
        const ox = cx + L.o[0] * r, oy = cx + L.o[1] * r;
        for (let rr = sp; rr < rv * 1.12; rr += sp) { ctx.moveTo(ox + rr, oy); ctx.arc(ox, oy, rr, 0, TAU); }
      } else {
        for (let k = 0; k < L.n; k++) {
          const a = angle + (k / L.n) * TAU;
          ctx.moveTo(cx + Math.cos(a) * rv * 0.08, cx + Math.sin(a) * rv * 0.08);
          ctx.lineTo(cx + Math.cos(a) * rv, cx + Math.sin(a) * rv);
        }
      }
      ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = st0;
      // 边缘渐隐：没有硬边
      ctx.save();
      ctx.globalCompositeOperation = 'destination-in';
      const g = ctx.createRadialGradient(cx, cx, rv * 0.55, cx, cx, rv);
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, px, px);
      ctx.restore();
      ctx.lineWidth = base;
    }
    return { build, draw };
  })();

  /* ════════════ 玛瑙带 ════════════ */
  const agate = (() => {
    const CFG = [
      { bands: 5, layers: 2, geode: 0 },
      { bands: 8, layers: 2, geode: 0 },
      { bands: 12, layers: 3, geode: 0 },
      { bands: 18, layers: 3, geode: 1 },
      { bands: 26, layers: 3, geode: 1 },
      { bands: 34, layers: 3, geode: 2 },
    ];
    function build(item) {
      const tier = tierOf(item.odds);
      const C = CFG[tier];
      const T = TIERS[tier];
      const R = T.R * 0.8;
      const rnd = (...k) => hash(item.id, 'ag', ...k);
      // 外轮廓：几阶正弦叠起来的不规则闭合曲线；往里每一道带都是它往里收、再各自扭一点
      const harm = Array.from({ length: 5 }, (_, k) => ({ k: k + 2, a: (0.05 + 0.05 * rnd('ha', k)) / (1 + k * 0.4), p: rnd('hp', k) * TAU }));
      const inner = C.geode ? 0.3 : 0.24;
      // 带宽不均：有宽有窄（玛瑙的带就是这样），厚度按随机权重分
      const wts = Array.from({ length: C.bands }, (_, b) => 0.35 + rnd('w', b) ** 2 * 1.6);
      const sum = wts.reduce((a, b) => a + b, 0);
      const curves = [];
      let u = 1;
      for (let b = 0; b <= C.bands; b++) {
        const tw = { a: rnd('tw', b) * TAU, m: 0.02 * (rnd('tm', b) - 0.5) };
        curves.push({ u, tw, tone: b % 2 ? 1 : rnd('tn', b) < 0.25 ? 2 : 0 });
        if (b < C.bands) u -= ((1 - inner) * wts[b]) / sum;
      }
      const shape = (u, tw, th) => {
        let s = 1;
        for (const h of harm) s += h.a * Math.sin(h.k * th + h.p) * (0.4 + 0.6 * u);
        s += tw.m * Math.sin(3 * th + tw.a);
        return u * s;
      };
      const per = Math.ceil(C.bands / C.layers);
      const layers = [];
      for (let i = 0; i < C.layers; i++) {
        // 外圈的带在后、里圈在前（带是从外往里长的）
        const lo = i * per;
        const hi = Math.min(C.bands, lo + per);
        const li = C.layers - 1 - i; // 0 = 最里（最前）
        layers[li] = layerBase(item, li, C.layers, {
          rOut: R * 1.12,
          from: lo, to: hi, curves, shape, geode: 0,
          dz: 0.006 + (li / Math.max(1, C.layers - 1)) * 0.13,
          phase: 0,
        });
      }
      // 晶洞只放在最前一层
      layers[0].geode = C.geode;
      layers[0].inner = inner;
      layers[0].seed = item.id;
      return { tier, T, R, layers };
    }
    function path(ctx, cx, r, L, cv, rev) {
      const M = 140;
      for (let m = 0; m <= M; m++) {
        const th = ((rev ? M - m : m) / M) * TAU;
        const s = L.shape(cv.u, cv.tw, th) * r;
        const x = cx + Math.cos(th) * s, y = cx + Math.sin(th) * s;
        m ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.closePath();
    }
    function draw(ctx, L, px, angle, c, sheet, env = {}) {
      const { cx, r } = frame(px);
      const tint = env.tint || '170 176 190';
      const light = env.light;
      // 三种色调：本色、淡（偏白）、深一点；整体很淡，窗能透过来
      const tone = (t) => {
        const [R, G, B] = tint.split(' ').map(Number);
        const mix = t === 1 ? 0.55 : t === 2 ? -0.18 : 0.1;
        const f = (v) => Math.round(mix > 0 ? lerp(v, 255, mix) : v * (1 + mix));
        return `${f(R)} ${f(G)} ${f(B)}`;
      };
      const st = ctx.strokeStyle;
      // 从外往里长：c 决定已经长到第几道
      const N = L.curves.length - 1;
      const grown = Math.ceil(N * lerp(0.45, 1, c));
      for (let b = L.from; b < L.to && b < grown; b++) {
        const o = L.curves[b], n = L.curves[b + 1];
        ctx.beginPath();
        path(ctx, cx, r, L, o, false);
        path(ctx, cx, r, L, n, true);
        ctx.fillStyle = rgbA(tone(o.tone), (light ? 0.34 : 0.28) * (o.tone === 1 ? 0.7 : 1));
        ctx.fill('evenodd');
        ctx.strokeStyle = withA(st, o.tone === 2 ? 0.5 : 0.32);
        ctx.beginPath();
        path(ctx, cx, r, L, o, false);
        ctx.stroke();
      }
      if (L.geode && grown >= N) {
        // 晶洞：最里一道带的内侧一圈细小的晶齿，尖朝里
        const cv = L.curves[N];
        const k = L.geode > 1 ? 54 : 36;
        ctx.strokeStyle = withA(st, 0.75);
        ctx.beginPath();
        for (let m = 0; m < k; m++) {
          const th = (m / k) * TAU + hash(L.seed, m) * 0.05;
          const s = L.shape(cv.u, cv.tw, th) * r;
          const len = s * (0.18 + 0.22 * hash(L.seed, 'gl', m)) * (L.geode > 1 ? 1.25 : 1);
          const w = (TAU / k) * 0.42;
          const s0 = s;
          ctx.moveTo(cx + Math.cos(th - w) * s0, cx + Math.sin(th - w) * s0);
          ctx.lineTo(cx + Math.cos(th) * (s0 - len), cx + Math.sin(th) * (s0 - len));
          ctx.lineTo(cx + Math.cos(th + w) * s0, cx + Math.sin(th + w) * s0);
        }
        ctx.stroke();
        ctx.fillStyle = rgbA(env.glass || '250 251 253', light ? 0.32 : 0.12);
        ctx.beginPath();
        path(ctx, cx, r, L, cv, false);
        ctx.fill();
      }
      ctx.strokeStyle = st;
    }
    return { build, draw };
  })();

  /* ════════════ 玻片 ════════════ */
  const glass = (() => {
    // 每一片：kind slide（载玻片 3:1）/ round（圆盖片）/ notch（带缺口）/ etched（蚀刻字）
    const CFG = [
      ['slide', 'slide'],
      ['slide', 'slide', 'slide'],
      ['slide', 'round', 'slide', 'slide'],
      ['slide', 'round', 'notch', 'slide', 'slide'],
      ['slide', 'round', 'notch', 'etched', 'slide', 'round'],
      ['etched', 'round', 'notch', 'slide', 'grid', 'slide', 'round'],
    ];
    function build(item) {
      const tier = tierOf(item.odds);
      const T = TIERS[tier];
      const list = CFG[tier];
      const R = T.R * 0.9;
      const rnd = (...k) => hash(item.id, 'gl', ...k);
      const layers = list.map((kind, i) => {
        const a = (i / list.length) * Math.PI + (rnd('a', i) - 0.5) * 0.5;
        const off = kind === 'round' ? 0.18 + 0.2 * rnd('o', i) : 0.05 + 0.18 * rnd('o', i);
        const oa = rnd('oa', i) * TAU;
        return layerBase(item, i, list.length, {
          rOut: R,
          kind,
          ox: Math.cos(oa) * off,
          oy: Math.sin(oa) * off,
          w: kind === 'round' ? 0.36 + 0.1 * rnd('w', i) : 0.95 + 0.25 * rnd('w', i),
          h: kind === 'round' ? 0 : 0.3 + 0.06 * rnd('h', i),
          phase: a,
          speed: 0.006 * (i % 2 ? -1 : 1),
          dz: 0.006 + (i / Math.max(1, list.length - 1)) * 0.16,
          label: kind === 'etched' ? (tier >= 5 ? item.text.dream : `${item.name}　${fmtOdds(item.odds)}`) : '',
        });
      });
      return { tier, T, R, layers };
    }
    function draw(ctx, L, px, angle, c, sheet, env = {}) {
      const { cx, r } = frame(px);
      const st = ctx.strokeStyle;
      const glassRGB = env.glass || '250 251 253';
      const light = env.light;
      ctx.save();
      ctx.translate(cx + L.ox * r, cx + L.oy * r);
      ctx.rotate(angle);
      const appear = clamp((c - 0.2) / 0.5 + L.rank * 0.0, 0, 1);
      ctx.globalAlpha = lerp(0.55, 1, appear);
      // 光从左上来：边与光的夹角决定亮度
      const lit = (nx) => 0.25 + 0.75 * Math.max(0, Math.cos(nx + angle + 2.4));
      if (L.kind === 'round') {
        const rr = L.w * r;
        ctx.fillStyle = rgbA(glassRGB, light ? 0.3 : 0.1);
        ctx.beginPath();
        ctx.arc(0, 0, rr, 0, TAU);
        ctx.fill();
        // 圆片的边：一边亮一边暗
        for (let k = 0; k < 24; k++) {
          const a0 = (k / 24) * TAU;
          ctx.strokeStyle = withA(st, lit(a0 - Math.PI / 2));
          ctx.beginPath();
          ctx.arc(0, 0, rr, a0, a0 + TAU / 24 + 0.01);
          ctx.stroke();
        }
      } else {
        const w = L.w * r, h = L.h * r;
        const notch = L.kind === 'notch';
        const pts = notch
          ? [[-w / 2, -h / 2], [w / 2 - h * 0.5, -h / 2], [w / 2, -h / 2 + h * 0.5], [w / 2, h / 2], [-w / 2, h / 2]]
          : [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
        ctx.beginPath();
        pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
        const g = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
        g.addColorStop(0, rgbA(glassRGB, light ? 0.42 : 0.16));
        g.addColorStop(0.45, rgbA(glassRGB, light ? 0.18 : 0.05));
        g.addColorStop(0.5, rgbA(glassRGB, light ? 0.4 : 0.14));
        g.addColorStop(1, rgbA(glassRGB, light ? 0.14 : 0.04));
        ctx.fillStyle = g;
        ctx.fill();
        // 每条边各自接光
        for (let k = 0; k < pts.length; k++) {
          const [x0, y0] = pts[k], [x1, y1] = pts[(k + 1) % pts.length];
          const nx = Math.atan2(x1 - x0, -(y1 - y0));
          ctx.strokeStyle = withA(st, lit(nx));
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(x1, y1);
          ctx.stroke();
        }
        if (L.kind === 'grid') {
          // 计数板：中间蚀刻一块细格
          ctx.strokeStyle = withA(st, 0.4);
          const gs = h * 0.7, n = 8;
          ctx.beginPath();
          for (let k = 0; k <= n; k++) {
            const t = -gs / 2 + (gs * k) / n;
            ctx.moveTo(-gs / 2, t); ctx.lineTo(gs / 2, t);
            ctx.moveTo(t, -gs / 2); ctx.lineTo(t, gs / 2);
          }
          ctx.stroke();
        }
        if (L.label) {
          // 蚀刻：左端一块磨砂，上面一行字
          const lw = w * 0.34;
          ctx.fillStyle = rgbA(glassRGB, light ? 0.5 : 0.2);
          ctx.fillRect(-w / 2 + h * 0.12, -h / 2 + h * 0.12, lw, h * 0.76);
          ctx.fillStyle = withA(st, 0.9);
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const s = L.label;
          const chars = Array.from(s);
          let fs = Math.max(3, Math.min((h * 0.76) / Math.ceil(chars.length / 2) * 0.95, lw * 0.36));
          ctx.font = `400 ${fs.toFixed(2)}px ${SERIF}`;
          // 竖排两列
          const per = Math.ceil(chars.length / 2);
          chars.forEach((ch, k) => {
            const col = Math.floor(k / per), row = k % per;
            ctx.fillText(ch, -w / 2 + h * 0.12 + lw * (0.68 - col * 0.36), -h / 2 + h * 0.12 + fs * (row + 0.6));
          });
        }
      }
      ctx.restore();
      ctx.strokeStyle = st;
    }
    return { build, draw };
  })();

  /* ════════════ 一扇窗 ════════════ */
  const win = (() => {
    // R：外层画布半径（世界 px）；最里一扇窗高 170（物件直径 108 + 窗头）
    const CFG = [
      { n: 1, rot: 0, R: 150 },
      { n: 2, rot: 0.03, R: 170 },
      { n: 3, rot: 0.05, R: 195 },
      { n: 4, rot: 0.07, R: 225 },
      { n: 5, rot: 0.09, R: 255 },
      { n: 5, rot: 0.12, R: 285, ghost: 2 },
    ];
    function build(item) {
      const tier = tierOf(item.odds);
      const C = CFG[tier];
      const T = TIERS[tier];
      const R = C.R;
      const unit = (R / 0.96) * 0.92; // 单位坐标 1 对应的世界 px
      const layers = Array.from({ length: C.n }, (_, i) => {
        const k = C.n > 1 ? i / (C.n - 1) : 0;
        return layerBase(item, i, C.n, {
          rOut: R,
          hU: lerp(170, unit * 1.18, k) / unit,
          asp: 1.28,
          head: i === 0,
          ghost: !!C.ghost && i >= C.n - C.ghost,
          phase: (i % 2 ? -1 : 1) * C.rot * i,
          speed: 0,
          dz: 0.006 + k * 0.16,
          odds: fmtOdds(item.odds),
          name: item.name,
        });
      });
      return { tier, T: Object.assign({}, T, { R }), R, layers };
    }
    function draw(ctx, L, px, angle, c, sheet, env = {}) {
      const { cx, r } = frame(px);
      const st = ctx.strokeStyle;
      const glassRGB = env.glass || '250 251 253';
      const light = env.light;
      const h = L.hU * r;
      const w = h * L.asp;
      ctx.save();
      ctx.translate(cx, cx);
      ctx.rotate(L.phase);
      const x = -w / 2, y = -h / 2;
      if (L.ghost) {
        // 只剩影子：画在画面外的一块，阴影投回来
        ctx.save();
        ctx.shadowColor = light ? 'rgba(40,50,70,.22)' : 'rgba(0,0,0,.5)';
        ctx.shadowBlur = Math.max(4, r * 0.06);
        ctx.shadowOffsetX = px * 3;
        ctx.shadowOffsetY = r * 0.03;
        ctx.fillStyle = '#000';
        ctx.fillRect(x - px * 3, y, w, h);
        ctx.restore();
      } else {
        ctx.fillStyle = rgbA(glassRGB, (light ? 0.34 : 0.22) * (L.head ? 1 : lerp(0.9, 0.5, L.rank)));
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = withA(st, L.head ? 0.85 : 0.6);
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
        if (L.head) {
          // 窗头：和网站的窗一样，一道细线、左边一个小圈、右边一行小字（几率）
          const th = Math.max(6, h * 0.11);
          ctx.strokeStyle = withA(st, 0.4);
          ctx.beginPath();
          ctx.moveTo(x, y + th);
          ctx.lineTo(x + w, y + th);
          ctx.stroke();
          const fs = Math.max(3.5, th * 0.5);
          ctx.beginPath();
          ctx.arc(x + th * 0.55, y + th / 2, fs * 0.36, 0, TAU);
          ctx.strokeStyle = withA(st, 0.7);
          ctx.stroke();
          ctx.fillStyle = withA(st, 0.8 * lerp(0.4, 1, c));
          ctx.font = `400 ${fs.toFixed(2)}px ${MONO}`;
          ctx.textAlign = 'right';
          ctx.textBaseline = 'middle';
          ctx.fillText(L.odds, x + w - th * 0.4, y + th / 2);
          ctx.textAlign = 'left';
          ctx.font = `400 ${(fs * 1.05).toFixed(2)}px ${SERIF}`;
          ctx.fillText(L.name, x + th * 1.05, y + th / 2 + fs * 0.04);
        }
      }
      ctx.restore();
      ctx.strokeStyle = st;
    }
    return { build, draw };
  })();

  window.CollectShells = { contour, text, moire, agate, glass, window: win };
})();
