/* ─────────────────────────────────────────────────────────────
 反相窗：主页大字不是「墨」，而是那片流光的一扇窗。

 把大字底下的那一小块流光拷进一张小画布，反相、再把色相转回来
（CSS 的 filter: invert(1) hue-rotate(180deg)），按字形遮罩。字于是读起来是池子自己的一道影：
亮池上是池子同色的暗字，暗处是池子同色的亮字，随池子漂过去而换。

 为什么不写成 backdrop-filter：Chrome 不会把 backdrop-filter 的结果交给本元素的 mask，
那样写只会得到一整块矩形（实测记在 design/mocks/title-ink/NOTES.md）。所以是「底的第二份拷贝」。

 拷贝只有大字那么大：流光画布是 1/5 分辨率的（1440×900 下大字那一块在它上面约 127×27 像素），
每帧一次 drawImage 实测 0.20 ms/帧；滤镜也只作用在大字那么大的合成层上。
反面做法是把滤镜挂到一份整屏的流光拷贝上——那要每帧过滤一两百万像素，不要那样做。

 遮罩按文本缓存，名义字号固定（反正要按 mask-size 拉满，比例一样，与真实字号无关）。
梦态下字在几个词之间轮转，文本一变就得换遮罩（一次约 7 ms），
所以把词表交给 warm()，起步后在空闲时先烘好。
 ───────────────────────────────────────────────────────────── */

const DPR = 2; // 遮罩按两倍出图，字形边缘才干净
const NOMINAL = 128; // 名义字号
const LH = 0.86; // .w-home-brand 的行高比

export interface Inverse {
  step(): void;
  warm(): void;
}

export function createInverse({
  light,
  target,
  canvas,
  words = [],
}: {
  light: HTMLCanvasElement;
  target: HTMLElement;
  canvas: HTMLCanvasElement;
  words?: string[];
}): Inverse {
  const root = document.documentElement;
  const ctx = canvas.getContext('2d');
  const cache = new Map<string, string>();
  let sig = ''; // 上一次的「文本 + 醒梦面」
  let painted = false;

  /* 醒 / 梦 两面的字距（wander.css 的 .w-home-brand 与 .is-dream），按 em 归一 */
  function lsEm(): number {
    const cs = getComputedStyle(target);
    const fs = parseFloat(cs.fontSize) || NOMINAL;
    const ls = parseFloat(cs.letterSpacing);
    return Number.isFinite(ls) ? ls / fs : 0;
  }

  /* 字形遮罩：底留空、只画白字。
     注意 PNG 遮罩走的是 alpha 通道而不是亮度，填成不透明黑就整片不透明、等于没遮。 */
  function bake(text: string, em: number): string {
    const h = NOMINAL * LH;
    const font = `${getComputedStyle(target).fontWeight} ${NOMINAL}px ${getComputedStyle(target).fontFamily}`;
    const ls = `${(em * NOMINAL).toFixed(3)}px`;
    const c = document.createElement('canvas');
    let x = c.getContext('2d');
    if (!x) return '';
    x.font = font;
    try {
      x.letterSpacing = ls;
    } catch {
      /* 老浏览器没有 canvas 字距：遮罩的横向比例会差一点，字被略拉宽，不至于不可用 */
    }
    const w = Math.ceil(x.measureText(text).width) + 2;
    c.width = Math.max(1, Math.ceil(w * DPR));
    c.height = Math.max(1, Math.ceil(h * DPR));
    x = c.getContext('2d');
    if (!x) return '';
    x.scale(DPR, DPR);
    x.font = font;
    try {
      x.letterSpacing = ls;
    } catch {
      /* 同上 */
    }
    x.fillStyle = '#fff';
    x.textBaseline = 'alphabetic';
    const m = x.measureText(text);
    const A = m.fontBoundingBoxAscent ?? NOMINAL * 0.88;
    const D = m.fontBoundingBoxDescent ?? NOMINAL * 0.22;
    x.fillText(text, 0, (h - (A + D)) / 2 + A); // 与单行块内文字同一套半行距算法
    return c.toDataURL('image/png');
  }

  function use(text: string): void {
    const em = lsEm();
    const k = `${text}|${em.toFixed(4)}`;
    let url = cache.get(k);
    if (!url) {
      url = bake(text, em);
      if (!url) return;
      cache.set(k, url);
    }
    canvas.style.webkitMaskImage = `url(${url})`;
    canvas.style.maskImage = `url(${url})`;
  }

  function step(): void {
    // 大字飞成左上角小字之后这一层就收了（那时 .w-home 也 hidden）
    if (root.classList.contains('w-brand-small')) return;
    const r = target.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return;

    const px = light.width / innerWidth;
    const py = light.height / innerHeight;
    // 画布按大字的布局尺寸（client 尺寸不受 transform 影响），随窗口变
    const cw = Math.max(1, Math.round(target.clientWidth * px));
    const ch = Math.max(1, Math.round(target.clientHeight * py));
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }
    // 只拷大字底下那一小块；r 是变换后的位置，所以飞出去的那一段也跟着走
    ctx?.drawImage(light, r.left * px, r.top * py, r.width * px, r.height * py, 0, 0, cw, ch);

    // 文本或醒梦面变了才重取遮罩（换面的溶变会把字淡掉，那一下换掉看不见）
    const next = `${target.textContent}${target.classList.contains('is-dream') ? 'D' : 'W'}`;
    if (next !== sig) {
      sig = next;
      use(target.textContent ?? '');
    }
    // 真的画起来了，字自己才让位（没起来就还是原来的墨色，不至于整块不见）
    if (!painted) {
      painted = true;
      root.classList.add('w-win');
    }
  }

  /* 空闲时把词表里每一个都先烘好，免得梦态里每次换词卡一下 */
  function warm(): void {
    const idle: (fn: () => void) => void =
      typeof window.requestIdleCallback === 'function'
        ? (fn) => window.requestIdleCallback(() => fn())
        : (fn) => void setTimeout(fn, 240);
    const ems = [0.035, 0.05]; // 醒 / 梦 两面的字距
    const jobs: [string, number][] = [];
    for (const t of words) for (const e of ems) jobs.push([t, e]);
    let i = 0;
    const next = () => {
      if (i >= jobs.length) return;
      const [t, e] = jobs[i++];
      const k = `${t}|${e.toFixed(4)}`;
      if (!cache.has(k)) {
        const url = bake(t, e);
        if (url) cache.set(k, url);
      }
      idle(next);
    };
    idle(next);
  }

  return { step, warm };
}
