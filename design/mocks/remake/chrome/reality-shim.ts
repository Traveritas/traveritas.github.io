/* 原型里的 reality：原站的工具栏 / Ave / 声音照搬，只把「面」换成这里的昼夜。
   醒 = 昼，梦 = 夜。翻面由原型的 app.js 决定（地面从格粗一拍拍解析回来），
   这里只负责记住当前面、广播、并像原版一样写 body[data-reality] 与几枚强调色令牌。 */
import { hexToRgb } from '../../../../src/scripts/lib';

export type Reality = 'wake' | 'dream';
export type RealityListener = (r: Reality) => void;

const ACCENT: Record<string, [number[], number[]]> = {
  '--amber': [hexToRgb('#9a86c4'), hexToRgb('#a7b1ba')],
  '--umber': [hexToRgb('#4f4a66'), hexToRgb('#556270')],
  '--ghost-ink': [hexToRgb('#817ba3'), hexToRgb('#8e9aa6')],
  '--dream': [hexToRgb('#9389ae'), hexToRgb('#a39c92')],
};
const mixRgb = (a: number[], b: number[], t: number) =>
  `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`;

let reality: Reality = 'dream';
let c = 0;
const listeners: RealityListener[] = [];
const mixListeners: (() => void)[] = [];
let flipper: ((x: number, y: number) => void) | null = null;

function setTint(t: number) {
  c = t;
  const d = document.documentElement;
  for (const k in ACCENT) d.style.setProperty(k, mixRgb(ACCENT[k][0], ACCENT[k][1], t));
  d.style.setProperty('--reality-mix', t.toFixed(3));
  for (const fn of mixListeners) fn();
}

/** 原型 app.js 调：落定某一面 */
export function setFace(r: Reality) {
  reality = r;
  document.body.dataset.reality = r;
  for (const fn of listeners) fn(r);
}
/** 原型 app.js 调：逐帧的醒度（0 夜 → 1 昼） */
export function setMix(t: number) {
  if (Math.abs(t - c) > 0.0005) setTint(t);
}
/** 原型 app.js 调：工具栏「换面」点下去时由它接手 */
export function setFlipper(fn: (x: number, y: number) => void) {
  flipper = fn;
}

export function onRealityChange(fn: RealityListener) {
  listeners.push(fn);
  fn(reality);
}
export function getReality(): Reality {
  return reality;
}
export function flipFrom(x: number, y: number) {
  flipper?.(x, y);
}
export function onMixChange(fn: () => void) {
  mixListeners.push(fn);
}
export function wakeMix(): number {
  return c;
}
export function holdIntent() {
  return null;
}
export function forceReality(r: Reality) {
  setFace(r);
}
export function setRingRenderer() {}
export function initReality() {}
