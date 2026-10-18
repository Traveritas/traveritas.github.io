/* ─────────────────────────────────────────────────────────────
   底色与交界。
   底色在平面坐标里算（周期是矩形），画成一张小图平铺，再整层 skewY(14°)。

   交界的三种画法（?seam=）：
     line（默认）亮带与暗带之间是一条利落的边，边上一道发丝线；同侧两个时辰之间仍然洇开
     bare        同上，但不画发丝线
     soft        四个时辰一起做高斯加权（旧版的画法），只是版图换成了斜切的这一张
   ───────────────────────────────────────────────────────────── */
(() => {
  'use strict';
  const K = window.PlaneKit;
  const { toLab, fromLab, mixLab, mod } = K.color;
  const { W, H, SK, XC, SEAMS, PAL, ANCH, drop } = K.world;

  const SIG = 400;
  const SHARP = 4;
  const EDGE = 9; // 明暗交界的半宽（平面 px）：够窄，看不出灰紫的中间带；又不至于在缩放后起锯齿
  const WARM = [196, 160, 124];
  const SVGNS = 'http://www.w3.org/2000/svg';

  K.createField = function createField({ stage, el, mode = 'line' }) {
    let LAB = {};
    let z = 1;
    let vw = innerWidth;
    let vh = innerHeight;

    function palette(reality) {
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

    function weights(u, v, only) {
      const w = {};
      let sum = 0;
      for (const r in ANCH) {
        if (only && PAL[r].light !== only.light) continue;
        let a = 0;
        for (const [ax, ay] of ANCH[r]) {
          let dx = Math.abs(u - ax);
          dx = Math.min(dx, W - dx);
          let dy = Math.abs(v - ay);
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
    const blend = (w) => {
      const o = [0, 0, 0];
      for (const r in w) for (let i = 0; i < 3; i++) o[i] += LAB[r][i] * w[r];
      return o;
    };
    const sstep = (x) => {
      const t = Math.max(0, Math.min(1, (x + EDGE) / (2 * EDGE)));
      return t * t * (3 - 2 * t);
    };
    /* 亮度归属：1 = 亮带，0 = 暗带 */
    function lightness(v) {
      v = mod(v, H);
      const a = SEAMS[0].v;
      const vb = v > (a + H) / 2 ? v - H : v; // 相对下一条交界（v = 0 ≡ H）的有符号距离
      return sstep(vb) * sstep(a - v);
    }
    /* 平面坐标 → oklab */
    function labAt(u, v) {
      u = mod(u, W);
      v = mod(v, H);
      if (mode === 'soft') return blend(weights(u, v));
      const l = lightness(v);
      if (l >= 1) return blend(weights(u, v, { light: true }));
      if (l <= 0) return blend(weights(u, v, { light: false }));
      const a = blend(weights(u, v, { light: true }));
      const b = blend(weights(u, v, { light: false }));
      return a.map((x, i) => b[i] + (x - b[i]) * l);
    }

    /* 一个周期画成小图：横向 8px 一格就够（同侧洇色本来就糊），纵向 2px 一格，交界才利落 */
    function paint(reality) {
      palette(reality);
      const gw = Math.round(W / 8);
      const gh = mode === 'soft' ? 200 : Math.round(H / 2);
      const c = document.createElement('canvas');
      c.width = gw;
      c.height = gh;
      const ctx = c.getContext('2d');
      const im = ctx.createImageData(gw, gh);
      for (let y = 0; y < gh; y++)
        for (let x = 0; x < gw; x++) {
          const col = fromLab(labAt(((x + 0.5) * W) / gw, ((y + 0.5) * H) / gh));
          const o = (y * gw + x) * 4;
          im.data[o] = col[0];
          im.data[o + 1] = col[1];
          im.data[o + 2] = col[2];
          im.data[o + 3] = 255;
        }
      ctx.putImageData(im, 0, 0);
      el.style.backgroundImage = `url(${c.toDataURL()})`;
    }

    /* 发丝线：屏幕空间的 SVG，只画视口里那几条，每帧改端点 */
    const svg = document.createElementNS(SVGNS, 'svg');
    svg.id = 'seams';
    svg.setAttribute('aria-hidden', 'true');
    el.after(svg);
    const lines = [];
    function line(n) {
      while (lines.length <= n) {
        const g = document.createElementNS(SVGNS, 'g');
        const glow = document.createElementNS(SVGNS, 'line');
        glow.setAttribute('class', 'seam-glow');
        const hair = document.createElementNS(SVGNS, 'line');
        hair.setAttribute('class', 'seam-hair');
        g.append(glow, hair);
        svg.appendChild(g);
        lines.push({ g, glow, hair });
      }
      return lines[n];
    }

    function resize(nz, nvw, nvh) {
      z = nz;
      vw = nvw;
      vh = nvh;
      el.style.transformOrigin = '0 0';
      el.style.width = `${Math.ceil(vw + W * z)}px`;
      el.style.height = `${Math.ceil(vh + H * z + SK * (vw + W * z))}px`;
      el.style.backgroundSize = `${W * z}px ${H * z}px`;
      svg.setAttribute('viewBox', `0 0 ${vw} ${vh}`);
      svg.setAttribute('width', vw);
      svg.setAttribute('height', vh);
    }

    /* o：平面原点在屏幕上的位置（屏上坐标 = o + z·(x, y)） */
    function place(o) {
      // 底色层：局部原点对准平面上的 (u0, v0)，u0、v0 取周期的整数倍，平铺的图就对齐了
      const uL = -o.x / z;
      const uR = (vw - o.x) / z;
      const u0 = W * Math.floor(uL / W);
      const vmin = -o.y / z - drop(uR);
      const v0 = H * Math.floor(vmin / H);
      const tx = o.x + z * u0;
      const ty = o.y + z * (v0 + drop(u0));
      el.style.transform = `translate3d(${tx}px,${ty}px,0) skewY(${(Math.atan(SK) * 180) / Math.PI}deg)`;

      let n = 0;
      if (mode === 'line') {
        const vmax = (vh - o.y) / z - drop(uL);
        const xa = -20;
        const xb = vw + 20;
        const ua = (xa - o.x) / z;
        const ub = (xb - o.x) / z;
        for (const s of SEAMS)
          for (let j = Math.floor((vmin - s.v) / H); s.v + j * H <= vmax; j++) {
            const v = s.v + j * H;
            const ya = o.y + z * (v + drop(ua));
            const yb = o.y + z * (v + drop(ub));
            const L = line(n++);
            for (const ln of [L.glow, L.hair]) {
              ln.setAttribute('x1', xa);
              ln.setAttribute('y1', ya.toFixed(2));
              ln.setAttribute('x2', xb);
              ln.setAttribute('y2', yb.toFixed(2));
            }
            L.g.dataset.light = s.light;
            L.g.style.display = '';
          }
      }
      for (let i = n; i < lines.length; i++) lines[i].g.style.display = 'none';
    }

    /* 屏上坐标（平面单位，未乘 z）处的底色，给外框选墨色用 */
    function colorAt(x, y) {
      return fromLab(labAt(x, y - drop(x)));
    }

    stage.dataset.seam = mode;
    return { paint, resize, place, colorAt };
  };
})();
