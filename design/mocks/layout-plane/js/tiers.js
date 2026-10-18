/* ─────────────────────────────────────────────────────────────
   记忆档：一块内容从 0 档（原样）到 5 档（只剩稀薄色块）的六种写法。
   这里只管「某一档长什么样」，不管「为什么是这一档」——那是规则的事。
   遗忘（距离 → 档）、读者的记忆（来过 → 档）都可以共用这一套。
   ───────────────────────────────────────────────────────────── */
(() => {
  'use strict';
  const K = window.PlaneKit;
  const { mixLab, rgb } = K.color;
  const { esc, cut, cutPct, dot, ym, paras } = K.text;
  const { PAL, NAMES, TILES, sec } = K.world;

  const JITTER = [0, 0, 0, 7, 22, 52];
  const BLOCK = [0, 10, 14, 32];
  const SAT = [1, 0.7, 0.48, 0.28];
  const FOG = [0, 0.14, 0.3, 0.46];

  /* 配图的各档副本：降采样 + 去饱和 + 褪向夜色，预先画好，不在大量元素上挂实时滤镜 */
  const variants = new Map(); // `${slug}/${k}` → { 1: url, 2: url, 3: url, avg: [r,g,b] }
  async function buildVariants(onEach) {
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
    onEach && onEach();
  }

  const trail = (s) => `<span class="trail">${esc(s)}</span>`;
  const bars = (ws) => `<span class="bars" aria-hidden="true">${ws.map((w) => `<i style="width:${w}%"></i>`).join('')}</span>`;
  const titleAt = (s, lv) => (lv === 0 ? esc(s) : lv === 1 ? trail(cutPct(s, 0.6, 4)) : lv === 2 ? esc(cut(s, 3)) : esc(cut(s, 1)));

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
    return rgb(mixLab(bg, light ? PAL[t.r].fg : [190, 200, 225], 0.1), lv === 4 ? 0.9 : 0.6);
  }

  /* 画成第 lv 档。prev 与 lv 只差一档、又不是静默重画时，补一次 0.42s 的去虚 */
  function paint(rec, lv, prev, quiet, RM) {
    const el = rec.el;
    const t = rec.t;
    const patch = lv >= 4 && t.kind !== 'label';
    el.className = `t t-${t.kind} lv-${lv}${rec.orig ? ' orig' : ''}${patch ? ' t-patch' : ''}${!patch && t.kind !== 'label' && t.kind !== 'img' ? ' card' : ''}`;
    el.innerHTML = patch ? '' : inner(t, lv);
    const pc = patch ? patchColor(t, lv) : '';
    el.style.background = pc;
    el.style.boxShadow = pc ? `0 0 ${lv === 4 ? 12 : 40}px ${lv === 4 ? -2 : 14}px ${pc}` : '';
    if (typeof prev === 'number' && prev >= 0 && Math.abs(prev - lv) === 1 && !RM && !quiet) {
      el.classList.remove('focus-in');
      void el.offsetWidth;
      el.classList.add('focus-in');
    }
  }

  /* 第 lv 档的框：3 档起位置抖开，4 档起缩成色块（平面坐标，规则交给内核前再斜切） */
  function box(rec, lv, b) {
    const t = rec.t;
    const jt = JITTER[lv];
    if (jt) {
      b.x += (K.hash(t.idx, rec.i, rec.j) - 0.5) * 2 * jt;
      b.y += (K.hash(rec.j, t.idx, rec.i) - 0.5) * 2 * jt;
    }
    if (lv >= 4 && t.kind !== 'label') {
      const s = lv === 4 ? 0.88 : 0.62;
      const hh = t.kind === 'img' ? t.ih : b.h;
      b.x += (b.w * (1 - s)) / 2;
      b.y += (hh * (1 - s)) / 2;
      b.w *= s;
      b.h = hh * s;
    }
    return b;
  }

  /* 从第 lv 档的副本打开一张图：先以那一档的粗像素铺在大图上，再慢慢褪去——图是一路被想起来的 */
  function recall(rec, dt, k, lv, animate) {
    const t = rec.t;
    if (t.kind !== 'img' || lv <= 0) return;
    const v = variants.get(`${t.ref.slug}/${k}`);
    const boxEl = dt.querySelector('.dt-img');
    if (!v || !boxEl) return;
    const px = document.createElement('img');
    px.className = lv >= 2 ? 'px' : '';
    px.src = v[Math.min(3, lv)];
    px.alt = '';
    px.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:2px';
    if (lv >= 2) px.style.imageRendering = 'pixelated';
    boxEl.appendChild(px);
    animate(px, [{ opacity: 1 }, { opacity: 0 }], { duration: 640, delay: 260, easing: 'ease-in-out' });
  }

  K.tiers = { MAX: 5, buildVariants, variants, inner, paint, box, recall };
})();
