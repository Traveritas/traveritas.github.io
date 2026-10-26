/* ─────────────────────────────────────────────────────────────
   工具栏 · 星与同心轨道（标记与样式在 Toolstar.astro，原型在 design/mocks/tool-star/）
   · 角度 θ 以星心为原点：0° 在星正右，90° 在星正上；列表从上往下顺时针读。
     每一圈能看见的弧按半径算（离星越近，弧越宽：星贴着屏幕左下角，弧两端没进屏幕边）。
   · 首尾相接的圈（data-loop）：项少时复制几份，周期总大于可见弧，转出去的从另一头回来。
     复制件 aria-hidden、不进 Tab 序，点它等于点原件；文字逐帧跟原件对齐（梦面换字时也跟着）。
   · 滚轮 / 拖动转圈，松手吸附到最近一格。
   · 工具圈：第一件（换面）点了就切，后面的会展开，两组之间多空出 0.7 格。
   · 设置：分类一圈，点一类在再外一圈摆出它的项（与标签 / 年月一样，外圈跟着里圈最长的字往外让）。
   · 声音：三圈音量弧（环境声 / Ave / 音效），图标在每圈最下面，点它开关；拖弧、滚轮、方向键调音量。
   · 寻找：标签与年月都是检索框里的一个词（漫游空间的检索要求每个词都命中），点一下加上，再点去掉。
   · 帧循环只在有东西在动时运转：开合、转圈、梦面里星的自转（梦面自转降到约 24fps）。
   ───────────────────────────────────────────────────────────── */

import { clamp, reducedMotion } from './lib';
import { flipFrom, onRealityChange, type Reality } from './reality';
import { getLevel, isLive, onLevels, rememberLevel, setLevel, toggleLevel, type Channel } from './sound';

const DEG = Math.PI / 180;
const mod = (a: number, n: number) => ((a % n) + n) % n;
const SVGNS = 'http://www.w3.org/2000/svg';
/** 跳到目录里某一节时，那一节停在视口上方这么一截处（与导览轨一致） */
const LEAD = 0.16;

type Tool = 'sound' | 'go' | 'find' | 'page' | 'set';

/* 三圈音量：基准半径（由内到外）；图标中心到滑条起点的弧长（px） */
const VOL_R = [150, 188, 226];
const VOL_GAP = 22;

interface Item {
  el: HTMLElement;
  k: number;
  ray: boolean;
  src?: HTMLElement; // 复制件对应的原件
}

/* 星心（视口坐标）与半径缩放：窄屏、矮屏收一点 */
const C = { x: 46, y: 0 };
const scaleK = () => clamp(Math.min(innerWidth, innerHeight * 1.2) / 760, 0.72, 1);

class Ring {
  el: HTMLElement;
  R0: number;
  R = 0;
  step: number;
  baseStep: number;
  loop: boolean;
  start: number;
  startPref?: number;
  lo = 0;
  hi = 90;
  P = 0;
  offset = 0;
  target = 0;
  alpha = 0;
  alphaTo = 0;
  items: Item[] = [];
  originals: HTMLElement[];
  snapT = 0;
  hideT = 0;
  /** 第几项之后多空 0.7 格（-1 = 不空） */
  gapAfter: number;
  /** 条目从轨道往外伸出的最长距离（放射的字有多长；显形时量） */
  extent = 20;

  constructor(el: HTMLElement, R: number, step: number, start?: number, gapAfter = -1) {
    this.gapAfter = gapAfter;
    this.el = el;
    this.R0 = R;
    this.baseStep = this.step = step;
    this.loop = el.hasAttribute('data-loop');
    this.startPref = start;
    this.start = start ?? 84;
    this.originals = [...el.querySelectorAll<HTMLElement>(':scope > .ts-item')];
    this.layout();
  }

  /** 尺寸变了重新算弧与复制件 */
  layout() {
    this.R = this.R0 * scaleK();
    const m = Math.asin(clamp((C.x - 6) / this.R, 0, 1)) / DEG;
    this.lo = -m;
    this.hi = 90 + m;
    this.start = this.startPref ?? Math.min(84, this.hi - 6);
    const N = this.originals.length;
    for (const it of this.items) if (it.src) it.el.remove();
    this.items = this.originals.map((el, i) => ({ el, k: i, ray: el.classList.contains('ts-ray') }));
    if (!this.loop || !N) {
      this.P = 0;
      return;
    }
    const span = this.hi - this.lo + 24;
    let copies = Math.max(1, Math.ceil(span / (N * this.baseStep)));
    this.step = Math.max(this.baseStep, span / (N * copies));
    // 一份就够、但步长被拉得太开时，复制一份让间距回到原样
    if (copies === 1 && this.step > this.baseStep * 1.6) {
      copies = 2;
      this.step = Math.max(this.baseStep, span / (N * copies));
    }
    this.P = this.step * N * copies;
    for (let c = 1; c < copies; c++) {
      this.originals.forEach((src, i) => {
        const el = src.cloneNode(true) as HTMLElement;
        el.setAttribute('aria-hidden', 'true');
        el.tabIndex = -1;
        el.removeAttribute('data-morph');
        el.querySelectorAll('[data-morph]').forEach((x) => x.removeAttribute('data-morph'));
        el.addEventListener('click', (e) => {
          e.preventDefault();
          src.click();
        });
        this.el.append(el);
        this.items.push({ el, k: c * N + i, ray: true, src });
      });
    }
  }

  angle(k: number) {
    if (!this.P) return this.start - (k + (this.gapAfter >= 0 && k > this.gapAfter ? 0.7 : 0)) * this.step + this.offset;
    const hiE = this.hi + 12;
    return hiE - mod(k * this.step - this.offset + (hiE - this.start), this.P);
  }

  /** 推进一帧；返回是否还在动 */
  frame(rm: boolean): boolean {
    const k = rm ? 1 : 0.16;
    this.offset += (this.target - this.offset) * k;
    this.alpha += (this.alphaTo - this.alpha) * (rm ? 1 : 0.18);
    if (Math.abs(this.target - this.offset) < 0.01) this.offset = this.target;
    if (Math.abs(this.alphaTo - this.alpha) < 0.005) this.alpha = this.alphaTo;
    for (const it of this.items) {
      const a = this.angle(it.k);
      const x = C.x + this.R * Math.cos(a * DEG);
      const y = C.y - this.R * Math.sin(a * DEG);
      const edge = clamp((a - (this.lo - 10)) / 12, 0, 1) * clamp((this.hi + 10 - a) / 12, 0, 1);
      const o = this.alpha * edge;
      const s = it.el.style;
      s.opacity = o.toFixed(3);
      s.visibility = o < 0.02 ? 'hidden' : 'visible';
      if (it.ray) s.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) rotate(${(-a).toFixed(2)}deg) translate(0,-50%)`;
      else {
        s.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-50%)`;
        s.setProperty('--ts-a', a.toFixed(2)); // 名字与外侧小刻沿这个角度往外
      }
      if (it.src) {
        if (it.el.textContent !== it.src.textContent) it.el.innerHTML = it.src.innerHTML;
        for (const attr of ['aria-pressed', 'aria-current']) {
          const v = it.src.getAttribute(attr);
          if (v !== it.el.getAttribute(attr)) v == null ? it.el.removeAttribute(attr) : it.el.setAttribute(attr, v);
        }
      }
    }
    return this.offset !== this.target || this.alpha !== this.alphaTo;
  }

  show(rm: boolean) {
    clearTimeout(this.hideT);
    this.el.hidden = false;
    this.measure();
    this.alphaTo = 1;
    this.target = 0;
    if (this.alpha === 0) this.offset = rm ? 0 : -50;
  }

  hide(rm: boolean) {
    this.alphaTo = 0;
    if (!rm) this.target -= 30;
    clearTimeout(this.hideT);
    this.hideT = window.setTimeout(
      () => {
        if (this.alphaTo === 0) {
          this.el.hidden = true;
          this.alpha = 0;
          this.target = this.offset = 0;
        }
      },
      rm ? 0 : 420,
    );
  }

  /** 量放射条目的长度（宽度不受 transform 影响；隐藏时量不到，所以在显形时量） */
  measure() {
    if (!this.originals[0]?.classList.contains('ts-ray')) return;
    this.extent = Math.max(0, ...this.originals.map((el) => el.offsetWidth));
  }

  get visible() {
    return this.alphaTo > 0;
  }

  nudge(d: number) {
    if (this.P) this.target += d;
    else this.target = clamp(this.target + d, -20, 20);
    clearTimeout(this.snapT);
    this.snapT = window.setTimeout(() => this.snap(), 160);
  }

  snap() {
    this.target = this.P ? Math.round(this.target / this.step) * this.step : 0;
  }
}

export function initToolstar() {
  const root = document.getElementById('ts');
  if (!root) return;
  const star = root.querySelector<HTMLButtonElement>('.ts-star')!;
  const starG = root.querySelector<SVGGElement>('.ts-star-g')!;
  const orbit = root.querySelector<HTMLElement>('.ts-orbit')!;
  const tracks = root.querySelector<SVGSVGElement>('.ts-tracks')!;
  const ringEl = (n: string) => root.querySelector<HTMLElement>(`[data-ring="${n}"]`)!;
  const sheet = (n: string) => root.querySelector<HTMLElement>(`[data-sheet="${n}"]`);
  const findSheet = sheet('find')!;
  const pageSheet = sheet('page');
  const field = findSheet.querySelector<HTMLInputElement>('.ts-field')!;
  const count = findSheet.querySelector<HTMLElement>('.ts-count')!;
  const inWander = !!document.getElementById('w-host');

  let RM = reducedMotion();
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => (RM = e.matches));

  const toolsN = root.querySelectorAll('[data-ring="tools"] > .ts-item').length;
  const rings = {
    tools: new Ring(ringEl('tools'), 104, 88 / Math.max(1, toolsN - 1 + 0.7), 92, 0),
    go: new Ring(ringEl('go'), 180, 17),
    tags: new Ring(ringEl('tags'), 170, 15),
    months: new Ring(ringEl('months'), 246, 12, 62),
    set: new Ring(ringEl('set'), 168, 19, 66),
    setUi: new Ring(ringEl('set-ui'), 240, 14, 70),
    setRead: new Ring(ringEl('set-read'), 240, 14, 70),
    setAve: new Ring(ringEl('set-ave'), 240, 12, 84),
  };
  const OUTER: Record<Tool, (keyof typeof rings)[]> = { sound: [], go: ['go'], find: ['tags', 'months'], page: [], set: ['set'] };
  /* 设置：第二圈是分类，点一类在第三圈摆出它的项（再点同一类收起） */
  type SetCat = 'ui' | 'read' | 'ave';
  const CAT_RING: Record<SetCat, keyof typeof rings> = { ui: 'setUi', read: 'setRead', ave: 'setAve' };
  let setCat: SetCat | null = null;

  let open = false;
  let tool: Tool | null = null;
  let reality: Reality = 'wake';

  /* ── 星：±x ±y ±z 六支，正等轴视角（yaw 45°、pitch 35.264°）投影 ── */
  const ST = { auto: 0, spin: 0, spinTo: 0, wob: 0 };
  function drawStar(dt: number, now: number) {
    const dream = reality === 'dream' && !RM;
    if (dream) ST.auto += dt * 12;
    else ST.auto += (Math.round(ST.auto / 90) * 90 - ST.auto) * Math.min(1, dt * 3);
    ST.spin += (ST.spinTo - ST.spin) * Math.min(1, RM ? 1 : dt * 7);
    const wob = dream ? Math.sin(now / 2300) * 6 : 0;
    const yaw = (45 + ST.auto + ST.spin) * DEG;
    const pit = (35.264 + wob) * DEG;
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const cp = Math.cos(pit);
    const sp = Math.sin(pit);
    const spikes: { x: number; y: number; z: number }[] = [];
    for (const [ax, ay, az] of [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ]) {
      for (const s of [1, -1]) {
        const x0 = ax * s;
        const y0 = ay * s;
        const z0 = az * s;
        const x1 = x0 * cy + z0 * sy;
        const z1 = -x0 * sy + z0 * cy;
        const y2 = y0 * cp - z1 * sp;
        const z2 = y0 * sp + z1 * cp;
        spikes.push({ x: x1 * 16, y: -y2 * 16, z: z2 });
      }
    }
    spikes.sort((a, b) => a.z - b.z);
    let out = '';
    for (const p of spikes) {
      const L = Math.hypot(p.x, p.y);
      if (L < 0.6) continue;
      const ux = p.x / L;
      const uy = p.y / L;
      const w = 1.9;
      const op = (0.38 + (0.5 * (p.z + 1)) / 2).toFixed(3);
      out += `<path d="M${(-uy * w).toFixed(2)} ${(ux * w).toFixed(2)}L${p.x.toFixed(2)} ${p.y.toFixed(2)}L${(uy * w).toFixed(2)} ${(-ux * w).toFixed(2)}L${(-ux * 1.4).toFixed(2)} ${(-uy * 1.4).toFixed(2)}Z" fill="currentColor" fill-opacity="${op}"/>`;
    }
    out += '<circle class="ts-hub" r="1.7"/>';
    starG.innerHTML = out;
    return dream || Math.abs(ST.spinTo - ST.spin) > 0.05 || Math.abs(Math.round(ST.auto / 90) * 90 - ST.auto) > 0.05;
  }

  /* ── 帧循环 ── */
  let raf = 0;
  let lastStar = performance.now();
  // 歇过之后重新起跑：第一帧按一帧算。否则歇着的那段时间整个记成 dt（封顶 0.1s），
  // 一按下去星头一帧就跳过大半个 90°，看上去是抖一下而不是转过去
  let fresh = true;
  function kick() {
    if (!raf) {
      fresh = true;
      raf = requestAnimationFrame(loop);
    }
  }
  function loop(now: number) {
    raf = 0;
    let busy = false;
    for (const r of Object.values(rings)) if (!r.el.hidden) busy = r.frame(RM) || busy;
    if (!volBox.hidden) busy = frameVols(RM) || busy;
    // 星：开合 / 回正时每帧画；梦面里只是慢慢自转，降到约 24fps
    const dream = reality === 'dream' && !RM;
    if (Math.abs(ST.spinTo - ST.spin) > 0.05 || !dream || now - lastStar > 41) {
      const dt = fresh ? 1 / 60 : Math.min(0.1, Math.max(0, (now - lastStar) / 1000));
      fresh = false;
      busy = drawStar(dt, now) || busy;
      lastStar = now;
    }
    if (dream) busy = true;
    if (busy && !document.hidden) raf = requestAnimationFrame(loop);
  }
  document.addEventListener('visibilitychange', () => !document.hidden && kick());

  /* ── 轨道与底色 ── */
  function place() {
    const r = star.getBoundingClientRect();
    C.x = r.left + r.width / 2;
    C.y = r.top + r.height / 2;
  }
  function drawTracks() {
    tracks.replaceChildren();
    if (!open) {
      orbit.style.setProperty('--ts-sr', '24px');
      orbit.classList.remove('is-veiled');
      return;
    }
    const add = (attrs: Record<string, string | number>) => {
      const el = document.createElementNS(SVGNS, 'circle');
      for (const k in attrs) el.setAttribute(k, String(attrs[k]));
      tracks.append(el);
      return el;
    };
    add({ class: 'ts-trk is-dash', cx: C.x, cy: C.y, r: 30 });
    for (const ring of Object.values(rings)) {
      if (!ring.visible) continue;
      add({ class: 'ts-trk', cx: C.x, cy: C.y, r: ring.R });
      const band = add({ class: 'ts-band', cx: C.x, cy: C.y, r: ring.R, 'data-nofx': '' });
      bindTurn(band as unknown as HTMLElement, ring);
    }
    orbit.style.setProperty('--ts-sr', `${discR().toFixed(1)}px`);
    orbit.style.setProperty('--ts-cx', `${C.x}px`);
    orbit.style.setProperty('--ts-cy', `${C.y}px`);
    orbit.classList.add('is-veiled');
  }

  /** 圆盘半径：只开了工具圈时刚好托住那一圈；外圈展开时托住放射出去的最长那几个字 */
  function discR() {
    let outer = 0;
    for (const ring of Object.values(rings)) if (ring !== rings.tools && ring.visible) outer = Math.max(outer, ring.R + ring.extent);
    if (open && tool === 'sound') outer = Math.max(outer, VOL_R[VOL_R.length - 1] * scaleK() + 6);
    return outer ? outer + 24 : rings.tools.R + 34;
  }

  /* ── 转圈：指针绕星心转过的角度直接加到 offset 上；动了就不算点击 ── */
  let drag: { ring: Ring; a: number; x: number; y: number; moved: boolean; el: Element } | null = null;
  const ptrAngle = (e: PointerEvent) => Math.atan2(C.y - e.clientY, e.clientX - C.x) / DEG;
  const swallow = new WeakSet<Element>();
  function bindTurn(el: Element, ring: Ring) {
    el.addEventListener('pointerdown', (e) => {
      const pe = e as PointerEvent;
      if (pe.button !== 0) return;
      drag = { ring, a: ptrAngle(pe), x: pe.clientX, y: pe.clientY, moved: false, el };
    });
    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        ring.nudge(-(e as WheelEvent).deltaY * 0.06);
        kick();
      },
      { passive: false },
    );
  }
  for (const ring of Object.values(rings)) {
    if (ring === rings.tools) continue;
    for (const it of ring.items) bindTurn(it.el, ring);
    ring.el.addEventListener(
      'click',
      (e) => {
        const t = (e.target as Element).closest('.ts-item');
        if (t && swallow.has(t)) {
          swallow.delete(t);
          e.preventDefault();
          e.stopImmediatePropagation();
        }
      },
      true,
    );
  }
  addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 5) return;
    drag.moved = true;
    const a = ptrAngle(e);
    let d = a - drag.a;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    drag.a = a;
    if (drag.ring.P) {
      drag.ring.target += d;
      drag.ring.offset += d;
    } else drag.ring.target = clamp(drag.ring.target + d, -20, 20);
    kick();
  });
  addEventListener('pointerup', () => {
    if (!drag) return;
    if (drag.moved) {
      const item = drag.el.closest?.('.ts-item');
      if (item) swallow.add(item);
      drag.ring.snap();
      kick();
    }
    drag = null;
  });

  /* ── 声音：三圈音量 ──
     角度同上（0° 星正右，往上逆时针增）。图标钉在 0°，滑条从 0° 往后让出 VOL_GAP 的弧长起步；
     最内一圈的滑条走 90°，外圈与它等长、角度相应短一些。 */
  const volBox = root.querySelector<HTMLElement>('.ts-vols')!;
  const vols = [...volBox.querySelectorAll<SVGGElement>('.ts-vol')].map((g, i) => ({
    ch: g.dataset.ch as Channel,
    i,
    g,
    track: g.querySelector<SVGPathElement>('.ts-vol-track')!,
    fill: g.querySelector<SVGPathElement>('.ts-vol-fill')!,
    thumb: g.querySelector<SVGCircleElement>('.ts-vol-thumb')!,
    hit: g.querySelector<SVGPathElement>('.ts-vol-hit')!,
    btn: volBox.querySelector<HTMLButtonElement>(`.ts-vch[data-ch="${g.dataset.ch}"]`)!,
    R: 0,
    s: 0, // 滑条起点（弧度）
    span: 0, // 滑条张角（弧度）
  }));
  type Vol = (typeof vols)[number];
  const polar = (R: number, a: number) => [C.x + R * Math.cos(a), C.y - R * Math.sin(a)] as const;
  function layoutVols() {
    const k = scaleK();
    const L = (VOL_R[0] * k * Math.PI) / 2;
    for (const v of vols) {
      v.R = VOL_R[v.i] * k;
      v.s = VOL_GAP / v.R;
      v.span = L / v.R;
      const [x0, y0] = polar(v.R, v.s);
      const [x1, y1] = polar(v.R, v.s + v.span);
      const d = `M${x0.toFixed(1)} ${y0.toFixed(1)}A${v.R.toFixed(1)} ${v.R.toFixed(1)} 0 0 0 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
      v.track.setAttribute('d', d);
      v.fill.setAttribute('d', d);
      v.hit.setAttribute('d', d);
      const [bx, by] = polar(v.R, 0);
      v.btn.style.transform = `translate(${bx.toFixed(1)}px,${by.toFixed(1)}px)`;
    }
    paintVols();
  }
  function paintVols() {
    for (const v of vols) {
      const x = getLevel(v.ch);
      const live = isLive(v.ch);
      const [tx, ty] = polar(v.R, v.s + x * v.span);
      v.thumb.setAttribute('cx', tx.toFixed(1));
      v.thumb.setAttribute('cy', ty.toFixed(1));
      v.fill.style.strokeDasharray = `${x.toFixed(4)} 1`;
      const n = Math.round(x * 100);
      v.g.setAttribute('aria-valuenow', String(n));
      v.g.setAttribute('aria-valuetext', n ? `${n}%` : '关');
      v.g.classList.toggle('is-waiting', x > 0 && !live && v.ch !== 'fx');
      v.btn.setAttribute('aria-pressed', String(x > 0));
      v.btn.classList.toggle('is-live', live);
    }
  }
  onLevels(paintVols);

  /* 拖：指针绕星心的角度换成音量；起点之下算 0，终点之外算满 */
  let volDrag: { v: Vol; from: number; id: number } | null = null;
  const volAt = (v: Vol, e: PointerEvent) => {
    const a = Math.atan2(C.y - e.clientY, e.clientX - C.x);
    return clamp((a - v.s) / v.span, 0, 1);
  };
  for (const v of vols) {
    v.g.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      v.g.setPointerCapture(e.pointerId);
      volDrag = { v, from: getLevel(v.ch), id: e.pointerId };
      v.g.classList.add('is-drag');
      v.btn.classList.add('is-drag');
      v.g.focus({ preventScroll: true });
      setLevel(v.ch, volAt(v, e));
    });
    v.g.addEventListener('pointermove', (e) => {
      if (volDrag?.v === v && e.pointerId === volDrag.id) setLevel(v.ch, volAt(v, e));
    });
    const end = (e: PointerEvent) => {
      if (volDrag?.v !== v || e.pointerId !== volDrag.id) return;
      // 拖到 0：记下拖之前的值，点图标再打开回到它
      if (getLevel(v.ch) === 0) rememberLevel(v.ch, volDrag.from);
      volDrag = null;
      v.g.classList.remove('is-drag');
      v.btn.classList.remove('is-drag');
    };
    v.g.addEventListener('pointerup', end);
    v.g.addEventListener('pointercancel', end);
    v.g.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        setLevel(v.ch, clamp(getLevel(v.ch) - e.deltaY * 0.0006, 0, 1));
      },
      { passive: false },
    );
    v.g.addEventListener('keydown', (e) => {
      const x = getLevel(v.ch);
      const to: Record<string, number> = {
        ArrowUp: x + 0.05,
        ArrowRight: x + 0.05,
        ArrowDown: x - 0.05,
        ArrowLeft: x - 0.05,
        PageUp: x + 0.2,
        PageDown: x - 0.2,
        Home: 0,
        End: 1,
      };
      if (!(e.key in to)) return;
      e.preventDefault();
      if (to[e.key] <= 0.005 && x > 0) rememberLevel(v.ch, x);
      setLevel(v.ch, clamp(to[e.key], 0, 1));
    });
    v.btn.addEventListener('click', () => toggleLevel(v.ch));
  }

  /* 显隐与别的圈同一套：从顺时针 50° 处转进来，收起时再往前转 30° 淡掉（见 Ring.show / hide / frame）。
     三圈一起转，整块绕星心旋转即可 */
  const VA = { offset: 0, target: 0, alpha: 0, alphaTo: 0, hideT: 0 };
  function showVols(on: boolean) {
    if (on) {
      if (VA.alphaTo === 1) return;
      clearTimeout(VA.hideT);
      if (volBox.hidden) layoutVols();
      volBox.hidden = false;
      VA.alphaTo = 1;
      VA.target = 0;
      if (VA.alpha === 0) VA.offset = RM ? 0 : -50;
    } else {
      if (volBox.hidden || VA.alphaTo === 0) return;
      VA.alphaTo = 0;
      if (!RM) VA.target -= 30;
      clearTimeout(VA.hideT);
      VA.hideT = window.setTimeout(
        () => {
          if (VA.alphaTo === 0) {
            volBox.hidden = true;
            VA.alpha = 0;
            VA.target = VA.offset = 0;
          }
        },
        RM ? 0 : 420,
      );
    }
  }
  function frameVols(rm: boolean): boolean {
    VA.offset += (VA.target - VA.offset) * (rm ? 1 : 0.16);
    VA.alpha += (VA.alphaTo - VA.alpha) * (rm ? 1 : 0.18);
    if (Math.abs(VA.target - VA.offset) < 0.01) VA.offset = VA.target;
    if (Math.abs(VA.alphaTo - VA.alpha) < 0.005) VA.alpha = VA.alphaTo;
    volBox.style.opacity = VA.alpha.toFixed(3);
    // 角度往小走 = 屏幕上顺时针 = CSS 的正向旋转
    volBox.style.transform = VA.offset ? `rotate(${(-VA.offset).toFixed(2)}deg)` : '';
    return VA.offset !== VA.target || VA.alpha !== VA.alphaTo;
  }

  /* ── 开合与切换 ── */
  const toolBtns = [...root.querySelectorAll<HTMLButtonElement>('.ts-tool')];
  const catBtns = [...root.querySelectorAll<HTMLButtonElement>('[data-set-cat]')];
  function sync() {
    place();
    star.setAttribute('aria-expanded', String(open));
    for (const b of toolBtns) if (b.hasAttribute('aria-expanded')) b.setAttribute('aria-expanded', String(open && tool === b.dataset.t));
    const want = new Set<keyof typeof rings>(open ? ['tools', ...(tool ? OUTER[tool] : [])] : []);
    if (open && tool === 'set' && setCat) want.add(CAT_RING[setCat]);
    for (const b of catBtns) b.setAttribute('aria-pressed', String(b.dataset.setCat === setCat));
    // 外一圈跟着里一圈最长的那枚往外让：字长了不压上去（年月让标签，设置项让分类）
    const outside = (inner: Ring, outer: Ring) => {
      if (!inner.visible) inner.show(RM);
      const R0 = (inner.R + inner.extent + 26) / scaleK();
      if (Math.abs(R0 - outer.R0) > 0.5) {
        outer.R0 = R0;
        outer.layout();
      }
    };
    if (want.has('months')) outside(rings.tags, rings.months);
    for (const c of Object.values(CAT_RING)) if (want.has(c)) outside(rings.set, rings[c]);
    for (const [name, ring] of Object.entries(rings) as [keyof typeof rings, Ring][]) {
      if (want.has(name) && !ring.visible) ring.show(RM);
      else if (!want.has(name) && ring.visible) ring.hide(RM);
    }
    showVols(open && tool === 'sound');
    showSheet(findSheet, open && tool === 'find', discR() + 14);
    if (pageSheet) showSheet(pageSheet, open && tool === 'page', rings.tools.R + 34 + 14);
    drawTracks();
    kick();
  }
  function showSheet(el: HTMLElement, on: boolean, above: number) {
    if (on) {
      el.hidden = false;
      el.style.bottom = `${innerHeight - C.y + above}px`;
      requestAnimationFrame(() => el.classList.add('is-on'));
    } else if (!el.hidden) {
      el.classList.remove('is-on');
      setTimeout(() => !el.classList.contains('is-on') && (el.hidden = true), RM ? 0 : 380);
    }
  }
  function setOpen(v: boolean) {
    if (v === open) return;
    open = v;
    if (!v) tool = null;
    ST.spinTo += 90;
    sync();
  }
  function setTool(t: Tool | null) {
    tool = t;
    sync();
    if (t === 'find') setTimeout(() => field.focus({ preventScroll: true }), 60);
    if (t === 'page') markToc();
  }
  star.addEventListener('click', () => setOpen(!open));
  for (const b of toolBtns) {
    b.addEventListener('click', () => {
      const t = b.dataset.t!;
      if (t === 'face') {
        const r = b.getBoundingClientRect();
        b.classList.add('is-turning'); // 图标里那道线点下去就开始转，换面落定时摘掉（见 onRealityChange）
        clearTimeout(turnT);
        turnT = window.setTimeout(() => b.classList.remove('is-turning'), 2400);
        flipFrom(r.left + r.width / 2, r.top + r.height / 2);
        return;
      }
      setTool(tool === t ? null : (t as Tool));
    });
  }
  for (const b of catBtns) {
    b.addEventListener('click', () => {
      const c = b.dataset.setCat as SetCat;
      setCat = setCat === c ? null : c;
      sync();
    });
  }
  // 设置里「音量 → 声音」：直接换到声音那三圈
  for (const b of root.querySelectorAll<HTMLButtonElement>('[data-goto]')) {
    b.addEventListener('click', () => setTool(b.dataset.goto as Tool));
  }

  addEventListener('keydown', (e) => {
    const typing = e.target instanceof Element && !!e.target.closest('input, textarea, [contenteditable]');
    if (e.key === 'Escape' && open) {
      if (tool) setTool(null);
      else setOpen(false);
      star.focus({ preventScroll: true });
    } else if (e.key === '/' && !typing && !e.altKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      if (!open) setOpen(true);
      if (tool !== 'find') setTool('find');
      else field.focus({ preventScroll: true });
    }
  });
  document.addEventListener('pointerdown', (e) => {
    if (!open || root.contains(e.target as Node)) return;
    setOpen(false);
  });
  let resizeT = 0;
  addEventListener('resize', () => {
    clearTimeout(resizeT);
    resizeT = window.setTimeout(() => {
      place();
      layoutVols();
      for (const r of Object.values(rings)) {
        r.layout();
        for (const it of r.items) if (it.src && r !== rings.tools) bindTurn(it.el, r);
      }
      sync();
    }, 120);
  });

  let turnT = 0;
  onRealityChange((r) => {
    reality = r;
    root.querySelector('.ts-tool[data-t="face"]')?.classList.remove('is-turning');
    kick();
  });

  /* ── 寻找 ── */
  const wordBtns = [...root.querySelectorAll<HTMLButtonElement>('[data-word]:not([aria-hidden])')];
  // 检索框里的词（保留原样的大小写；比对时一律小写）
  const words = () => field.value.trim().split(/\s+/).filter(Boolean);
  const has = (ws: string[], w: string) => ws.some((x) => x.toLowerCase() === w.toLowerCase());
  const paintWords = () => {
    const ws = words();
    for (const b of wordBtns) b.setAttribute('aria-pressed', String(has(ws, b.dataset.word!)));
    kick(); // 循环圈里的复制件在帧里跟着原件换高亮
  };
  const toIndex = (q: string) => (location.href = `/articles/?q=${encodeURIComponent(q)}`);
  let findT = 0;
  function find(q: string) {
    paintWords();
    if (!inWander) {
      count.textContent = q.trim() ? '回车 · 到目录里找' : '';
      return;
    }
    clearTimeout(findT);
    findT = window.setTimeout(() => dispatchEvent(new CustomEvent('xm:find', { detail: { query: q } })), 120);
  }
  field.addEventListener('input', () => find(field.value));
  field.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !inWander && field.value.trim()) toIndex(field.value.trim());
  });
  addEventListener('xm:found', (e) => {
    const d = (e as CustomEvent<{ query: string; hits: number; total: number }>).detail;
    count.textContent = d.query ? `${d.hits} / ${d.total}` : '';
  });
  const isMonth = (w: string) => /^\d{4}-\d{2}$/.test(w);
  for (const b of wordBtns) {
    b.addEventListener('click', () => {
      const w = b.dataset.word!;
      if (!inWander) return toIndex(w);
      let ws = words();
      if (has(ws, w)) ws = ws.filter((x) => x.toLowerCase() !== w.toLowerCase());
      else ws = [...(isMonth(w) ? ws.filter((x) => !isMonth(x)) : ws), w]; // 年月一次只取一个
      field.value = ws.join(' ');
      find(field.value);
    });
  }
  // 从别的页带着 ?q= 进来：输入框里也写上
  const q0 = new URLSearchParams(location.search).get('q');
  if (q0) {
    field.value = q0;
    paintWords();
  }

  /* ── 设置：记住面（光标那一项由 cursor.ts 接管） ── */
  const keep = root.querySelector<HTMLButtonElement>('[data-keep-face]');
  if (keep) {
    const read = () => {
      try {
        return localStorage.getItem('xm-keep-face') !== 'off';
      } catch {
        return true;
      }
    };
    keep.setAttribute('aria-pressed', String(read()));
    keep.addEventListener('click', () => {
      const v = !read();
      try {
        if (v) localStorage.removeItem('xm-keep-face');
        else localStorage.setItem('xm-keep-face', 'off');
      } catch {
        /* 存不下就算了 */
      }
      keep.setAttribute('aria-pressed', String(v));
    });
  }

  /* 多图瞬间怎么排：网格 / 并排 / 轮播（点一下换到下一种）。阅读窗现读；窗面由 wander.js 收到 xm-multi 就地重画 */
  const multi = root.querySelector<HTMLButtonElement>('[data-multi]');
  if (multi) {
    const KINDS = [
      ['grid', '网格'],
      ['row', '并排'],
      ['car', '轮播'],
    ];
    let cur = 0;
    try {
      const i = KINDS.findIndex(([k]) => k === localStorage.getItem('xm-multi'));
      if (i > 0) cur = i;
    } catch {
      /* 读不到就用网格 */
    }
    const v = multi.querySelector('[data-multi-v]')!;
    v.textContent = KINDS[cur][1];
    multi.addEventListener('click', () => {
      cur = (cur + 1) % KINDS.length;
      try {
        if (cur) localStorage.setItem('xm-multi', KINDS[cur][0]);
        else localStorage.removeItem('xm-multi');
      } catch {
        /* 存不下就算了 */
      }
      v.textContent = KINDS[cur][1];
      // 漫游 / 检索里的窗就地重画（wander.js 接）
      dispatchEvent(new CustomEvent('xm-multi'));
    });
  }

  /* ── 本页：目录 + 字号 / 行距（只在阅读页） ── */
  const tocLinks: { a: HTMLAnchorElement; el: HTMLElement }[] = [];
  function markToc() {
    let cur: HTMLAnchorElement | null = null;
    for (const { a, el } of tocLinks) if (el.getBoundingClientRect().top <= innerHeight * LEAD + 8) cur = a;
    for (const { a } of tocLinks) a.classList.toggle('is-current', a === cur);
  }
  if (pageSheet) {
    const toc = pageSheet.querySelector<HTMLElement>('.ts-toc')!;
    const heads = [...document.querySelectorAll<HTMLElement>('article.prose .md h2, article.prose .md h3')];
    if (!heads.length) {
      toc.previousElementSibling?.remove();
      toc.remove();
      pageSheet.querySelector('.ts-sec')?.classList.remove('ts-sec');
    }
    for (const el of heads) {
      const c = el.cloneNode(true) as HTMLElement;
      c.querySelectorAll('.ord, .ghost, [aria-hidden="true"]').forEach((x) => x.remove());
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = el.id ? `#${el.id}` : '#';
      a.textContent = (c.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (el.tagName === 'H3') a.className = 'is-sub';
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const top = el.getBoundingClientRect().top + scrollY - innerHeight * LEAD;
        scrollTo({ top, behavior: RM ? 'instant' : 'smooth' });
      });
      li.append(a);
      toc.append(li);
      tocLinks.push({ a, el });
    }
    addEventListener('scroll', () => tool === 'page' && markToc(), { passive: true });

    const html = document.documentElement;
    for (const seg of pageSheet.querySelectorAll<HTMLElement>('.ts-seg[data-key]')) {
      const key = seg.dataset.key!; // size | lead
      const attr = key === 'size' ? 'readSize' : 'readLead';
      const btns = [...seg.querySelectorAll<HTMLButtonElement>('button[data-v]')];
      const paint = () => {
        const v = html.dataset[attr] || 'm';
        for (const b of btns) b.setAttribute('aria-pressed', String(b.dataset.v === v));
      };
      for (const b of btns) {
        b.addEventListener('click', () => {
          const v = b.dataset.v!;
          if (v === 'm') delete html.dataset[attr];
          else html.dataset[attr] = v;
          try {
            if (v === 'm') localStorage.removeItem(`xm-read-${key}`);
            else localStorage.setItem(`xm-read-${key}`, v);
          } catch {
            /* 存不下就只管本页 */
          }
          paint();
        });
      }
      paint();
    }
  }

  place();
  drawStar(0, performance.now());
  kick();
}
