/* ─────────────────────────────────────────────────────────────
   首屏圆区主体 · 晶苞（原型与源文件：design/mocks/hero-bud/）
   · 素材是 Blender Cycles 离线渲染的逐帧 WebP（public/hero-bud/），本脚本只在一张 canvas 上播放，
     不做任何着色计算。
   · 醒：12fps 连续自转，60° 一循环 40 帧（六重对称），相邻帧混合补间。
     梦：4fps 跳格，3° 一格，120° 一循环 40 帧（三长三短，三重对称），不补间。
   · 换面：先转到循环点，再播绽开 / 收拢（各 40 帧），首尾分别接在两个循环的起点。
     长按一过短按判定就开始对齐（reality.ts 的 holdIntent 给出去向与剩余时间），按满时恰好到点：
     醒面按「剩余帧 ÷ 剩余时间」平滑变速（至多 ×2.4），早到就停在循环点上等；
     梦面主要靠加大步幅跳格（节奏至多提到 6 跳/秒），早到同样定住。松手即恢复原速。
     没有长按的换面（预览页开关、开场）给一个短截止时间，同样走这套变速。
     开场总从醒面起，若当前已是梦面则随即绽开（与入梦同拍）。
   · 帧率渐变：梦度 d 在绽开后段 0→1、收拢前段 1→0，同时驱动刷新间隔（30→4fps，对数插值）、
     帧间混合的软硬（线性补间→整帧切换）与播放速率（18°/s→12°/s）；
     d = 1 时每 1/4 秒正好推进 3°，与梦面跳格无缝相接。
   · 内存：只常驻压缩数据（Blob，约 2.8MB），按需 createImageBitmap 解码，位图缓存不超过 CACHE 张。
   · 收拢（html.ls-folded）或标签页隐藏时停帧；prefers-reduced-motion / 省流量：只画当前面的一张静帧。
   ───────────────────────────────────────────────────────────── */

import { holdIntent, onRealityChange, type Reality } from "./reality";
import { reducedMotion } from "./lib";

const SEQ = { wake: 40, open: 40, dream: 40, close: 40 } as const;
type Seq = keyof typeof SEQ;
const FPS = 12;
const DREAM_FPS = 4;
const V_MAX = 2.4; // 醒面赶往循环点的速度上限
const WAKE_GRACE = 0.35; // 长按落定后醒面还可再赶的秒数（免得为了准点转得太急）
const WAKE_LEAVE = 0.9; // 无长按换面时的截止时间（秒）
const DREAM_LEAVE = 1.2;
const MAX_JUMP = 8; // 梦面赶点时单跳上限（格，3°/格）
const DRAW_FPS = 30; // 醒面补间需要比 12fps 更密的绘制
const CACHE = 10;
const MAX_PX = 800; // 素材边长

const base = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/hero-bud/`;
const url = (s: Seq, i: number) =>
  `${base}${s}/${String(i).padStart(3, "0")}.webp`;

export function initHeroBud() {
  const el = document.querySelector<HTMLCanvasElement>("#ls-bud");
  const c2d = el?.getContext("2d");
  if (!el || !c2d || !("createImageBitmap" in window)) return;
  const cv: HTMLCanvasElement = el;
  const ctx: CanvasRenderingContext2D = c2d;
  const root = document.documentElement;
  const nav = navigator as Navigator & { connection?: { saveData?: boolean } };
  const still = reducedMotion() || !!nav.connection?.saveData;

  /* ── 数据：压缩帧常驻，位图按需解码、少量缓存 ── */
  const blobs: Record<Seq, (Blob | undefined)[]> = {
    wake: [],
    open: [],
    dream: [],
    close: [],
  };
  const ready: Record<Seq, boolean> = {
    wake: false,
    open: false,
    dream: false,
    close: false,
  };
  const bitmaps = new Map<string, ImageBitmap>();
  const decoding = new Set<string>();

  function bitmap(s: Seq, i: number): ImageBitmap | undefined {
    const key = `${s}${i}`;
    const bm = bitmaps.get(key);
    if (bm) {
      bitmaps.delete(key); // 挪到最近使用
      bitmaps.set(key, bm);
      return bm;
    }
    const blob = blobs[s][i];
    if (blob && !decoding.has(key)) {
      decoding.add(key);
      createImageBitmap(blob)
        .then((b) => {
          bitmaps.set(key, b);
          while (bitmaps.size > CACHE) {
            const [k, old] = bitmaps.entries().next().value as [
              string,
              ImageBitmap,
            ];
            bitmaps.delete(k);
            old.close();
          }
        })
        .catch(() => {})
        .finally(() => decoding.delete(key));
    }
    return undefined;
  }

  async function fetchSeq(s: Seq, only?: number[]) {
    const idx = only ?? [...Array(SEQ[s]).keys()];
    let k = 0;
    const lane = async () => {
      while (k < idx.length) {
        const i = idx[k++];
        try {
          const r = await fetch(url(s, i));
          if (r.ok) blobs[s][i] = await r.blob();
        } catch {
          /* 单帧失败：播放时该帧停在上一张 */
        }
      }
    };
    await Promise.all([lane(), lane(), lane(), lane()]); // 4 路并发，别挤占页面其余请求
    if (!only) ready[s] = true;
  }

  /* ── 尺寸：画布随圆半径（--sr）缩放，位图边长不超过素材 ── */
  const fit = () => {
    const css = cv.clientWidth;
    const px = Math.min(
      MAX_PX,
      Math.round(css * Math.min(devicePixelRatio || 1, 2)),
    );
    if (px > 0 && cv.width !== px) {
      cv.width = cv.height = px;
      dirty = true;
      if (still && shown) drawStill();
    }
  };

  /* ── 状态机：wake ⇄ dream，经 open / close ──
     d：梦度（0 醒 … 1 梦），决定画面刷新间隔、帧间混合的软硬与播放速率；
     open / close 里随进度渐变，两端分别与醒面、梦面的节奏完全吻合 */
  let seq: Seq = "wake";
  let pos = 0; // 当前序列内的帧位置（醒 / 过渡为浮点，梦为整格）
  let want: Reality = "wake";
  let v = 1; // 醒面 / 过渡的速度倍率（平滑跟随目标）
  let leaveBy = 0; // 应到达循环点的时刻（秒，0 = 无去意）
  let dreamAcc = 0;
  let dirty = true;
  let shown = false;

  const loopOf = (r: Reality): Seq => (r === "wake" ? "wake" : "dream");
  const canLeave = () =>
    seq === "wake"
      ? ready.open && ready.dream
      : seq === "dream"
        ? ready.close && ready.wake
        : true;
  const ss = (a: number, b: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const dreamness = () =>
    seq === "wake"
      ? 0
      : seq === "dream"
        ? 1
        : seq === "open"
          ? ss(0.3, 1, pos / SEQ.open)
          : 1 - ss(0, 0.65, pos / SEQ.close);

  function frameAt(s: Seq, i: number): [Seq, number] {
    if (i < SEQ[s]) return [s, i];
    const next: Seq = s === "open" ? "dream" : s === "close" ? "wake" : s;
    return [next, (i - SEQ[s]) % SEQ[next]];
  }

  function step(dt: number, now: number) {
    // 去意：长按进行中看手势要去的面，否则看已落定的面
    const hold = holdIntent();
    const target = hold?.to ?? want;
    const going =
      (seq === "wake" || seq === "dream") &&
      seq !== loopOf(target) &&
      canLeave();
    const latched = going && want === target && !hold;
    if (!going) leaveBy = 0;
    else if (hold) leaveBy = now + hold.eta + (seq === "wake" ? WAKE_GRACE : 0);
    else if (!leaveBy) leaveBy = now + (seq === "wake" ? WAKE_LEAVE : DREAM_LEAVE);

    if (seq === "dream") {
      // 梦面不加快节奏，只加大步幅：每一跳把剩余距离均摊到截止前剩下的跳数上；
      // 先到了而手势未落定，就停在循环点上等
      const cad = latched ? 6 : DREAM_FPS;
      dreamAcc += dt;
      if (dreamAcc < 1 / cad) return;
      dreamAcc = 0;
      let jump = 1;
      if (going) {
        const left = SEQ.dream - pos;
        if (left <= 0) {
          if (latched) {
            seq = "close";
            pos = 0;
            acc = 0;
            dirty = true;
          }
          return;
        }
        const steps = Math.max(1, Math.floor((leaveBy - now) * cad));
        jump = Math.min(left, MAX_JUMP, Math.max(1, Math.ceil(left / steps)));
      }
      // 目标格还没解码好：退到已解码的较近一格；一格都没有就原地等一拍，不跳空
      if (!bitmap(...frameAt("dream", pos + jump))) {
        while (jump > 0 && !bitmaps.has(frameAt("dream", pos + jump).join("")))
          jump--;
        if (!jump) return;
      }
      pos += jump;
      dirty = true;
      if (going) bitmap(...frameAt("dream", pos + jump)); // 预解码下一跳
      if (pos >= SEQ.dream && !going) pos -= SEQ.dream;
      else if (pos >= SEQ.dream && latched) {
        seq = "close";
        pos = 0;
        acc = 0;
      }
      return;
    }

    // 醒面：按「剩余帧 ÷ 剩余时间」求目标速度，恰在截止时刻到循环点；
    // 先到而手势未落定，则缓缓停在循环点上（醒静）
    let vt = 1;
    if (going) {
      const left = SEQ.wake - pos;
      const t = Math.max(0.05, leaveBy - now);
      vt = left < 0.01 ? 0 : Math.min(V_MAX, left / (FPS * t));
    }
    v += (vt - v) * (1 - Math.exp(-dt / 0.2));
    const d = dreamness();
    const next = pos + dt * FPS * v * (1 - d / 3); // 12 帧/秒 → 8 帧/秒（18°/s → 梦面 12°/s）
    const [ns, ni] = frameAt(seq, Math.floor(next) + 1);
    if (!bitmap(ns, ni)) return; // 前方帧未就绪：停住等它
    pos = next;
    dirty = true;
    if (seq === "wake" && pos >= SEQ.wake) {
      if (latched) {
        seq = "open";
        pos -= SEQ.wake;
      } else if (going) pos = SEQ.wake;
      else pos -= SEQ.wake;
    } else if (pos >= SEQ[seq]) {
      pos -= SEQ[seq];
      if (seq === "open") {
        // 屏上还是绽开末帧（≈ 梦面第 -1 格）：不立即重画，按过渡末段的跳格相位，下一拍落到梦面第 0 格
        seq = "dream";
        pos = SEQ.dream - 1;
        dreamAcc = acc;
        dirty = false;
      } else seq = "wake";
    }
  }

  function draw() {
    const i = Math.floor(pos);
    const [s0, i0] = frameAt(seq, i);
    const a = bitmap(s0, i0);
    if (!a) return;
    // 预取后三帧
    const [s1, i1] = frameAt(seq, i + 1);
    const b = bitmap(s1, i1);
    bitmap(...frameAt(seq, i + 2));
    bitmap(...frameAt(seq, i + 3));
    const w = cv.width;
    ctx.clearRect(0, 0, w, w);
    ctx.globalAlpha = 1;
    ctx.drawImage(a, 0, 0, w, w);
    // 帧间混合随梦度变硬：醒时线性补间，梦时整帧切换
    const d = dreamness();
    const k = 1 / Math.max(0.001, 1 - d);
    const f = Math.min(1, Math.max(0, (pos - i - 0.5) * k + 0.5));
    if (seq !== "dream" && b && f > 0.02) {
      ctx.globalAlpha = f;
      ctx.drawImage(b, 0, 0, w, w);
      ctx.globalAlpha = 1;
    }
    dirty = false;
    if (!shown) {
      shown = true;
      cv.classList.add("on");
    }
  }

  /* ── 循环：只在可见且未收拢时转 ──
     刷新间隔随梦度在 1/30s 与 1/4s 之间按对数插值（30→20→13→9→6→4 fps 这样渐疏） */
  let raf = 0;
  let last = 0;
  let acc = 0;
  const active = () =>
    !document.hidden && !root.classList.contains("ls-folded");
  const tick = (now: number) => {
    raf = 0;
    if (!active()) return;
    raf = requestAnimationFrame(tick);
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    step(dt, now / 1000);
    acc += dt;
    if (!dirty) return;
    if (seq === "dream") {
      acc = 0;
      draw();
      return;
    }
    const gap = Math.exp(
      Math.log(1 / DRAW_FPS) + dreamness() * Math.log(DRAW_FPS / DREAM_FPS),
    );
    if (acc >= gap - 0.002) {
      acc = acc - gap > gap ? 0 : Math.max(0, acc - gap);
      draw();
    }
  };
  const run = () => {
    if (still || raf || !active()) return;
    last = 0;
    raf = requestAnimationFrame(tick);
  };

  /* ── 静帧模式：当前面的第 0 帧 ── */
  const drawStill = () => {
    const s = loopOf(want);
    if (bitmap(s, 0)) draw();
    else setTimeout(drawStill, 60);
  };

  onRealityChange((r) => {
    want = r;
    if (still) {
      seq = loopOf(r);
      pos = 0;
      if (blobs[seq][0]) drawStill();
    }
  });

  new ResizeObserver(fit).observe(cv);
  document.addEventListener("visibilitychange", run);
  new MutationObserver(run).observe(root, {
    attributes: true,
    attributeFilter: ["class"],
  });

  /* ── 加载：页面 load 之后的空闲时段开始拉；先当前面所需，再其余 ── */
  const start = async () => {
    fit();
    if (still) {
      await Promise.all([fetchSeq("wake", [0]), fetchSeq("dream", [0])]);
      seq = loopOf(want);
      drawStill();
      return;
    }
    await fetchSeq("wake");
    run();
    await fetchSeq("open");
    await fetchSeq("dream");
    await fetchSeq("close");
  };
  const idle = (cb: () => void) =>
    "requestIdleCallback" in window
      ? requestIdleCallback(cb, { timeout: 1500 })
      : setTimeout(cb, 200);
  if (document.readyState === "complete") idle(start);
  else addEventListener("load", () => idle(start), { once: true });
}
