/* ─────────────────────────────────────────────────────────────
   脑电线的「骨架」通道（仅主页使用）。
   主页的故事板脚本（home-storyboard.ts）按滚动算出线在视口里的姿态，
   经这里交给 Eeg.astro，再由它转发给 Worker（或 SVG 回退端）。
   关于页的退场演出（about-exit.ts）也走这里：把线转平、收平，落成晶体的切面线。
   其余页面从不调用 setEegSpine ⇒ 线仍是过视口中心的 14° 直线，与改动前逐字一致。
   挂在 globalThis 上：两个 <script> 各自打包时也共用同一份状态。
   ───────────────────────────────────────────────────────────── */

export interface SpineState {
  /** 视口坐标的骨架折线 [x0,y0,x1,y1,…]；null ＝ 14° 直线 */
  xy: Float32Array | null;
  /** 背景明暗 0..1（暗场里主波往浅处混） */
  dark: number;
  /** 开屏「从中心往两端画出」的进度，1 ＝ 画满 */
  reveal: number;
  /** 骨架上一粒琥珀点 [弧长比例, 不透明度] */
  dot: [number, number] | null;
  /** 振幅倍率 0..1（关于页退场：线收平成切面线）；1 ＝ 原样 */
  amp: number;
}

type Listener = (s: SpineState) => void;

interface Hub {
  state: SpineState;
  listeners: Listener[];
}

const G = globalThis as typeof globalThis & { __eegSpine?: Hub };
const hub: Hub = (G.__eegSpine ??= {
  state: { xy: null, dark: 0, reveal: 1, dot: null, amp: 1 },
  listeners: [],
});

export function setEegSpine(patch: Partial<SpineState>) {
  Object.assign(hub.state, patch);
  for (const fn of hub.listeners) fn(hub.state);
}

/** 订阅；已有骨架时立即回放一次（订阅晚于首页脚本也不丢） */
export function onEegSpine(fn: Listener) {
  hub.listeners.push(fn);
  if (hub.state.xy) fn(hub.state);
}
