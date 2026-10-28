/* ─────────────────────────────────────────────────────────────
   开屏 · 整屏同格（二 · 从粗到细，2026-10-28 第二版）

   背景（流光）是 WebGL，格宽就是着色器里一个数；界面却是 DOM 矢量字，浏览器没有
   「整页低分辨率栅格」。所以要在开屏期让「整个界面」也一起从粗到细，只能自己按格
   重采样一次：文字在 1/cell 的变换下 fillText（等于真的按这个分辨率渲染），
   脑电线把 worker 画好的整屏画布 drawImage 缩下来（面积平均，细线断成点）。

   和背景严格同格：画布后备尺寸 = ⌈视口 / cell⌉，CSS 拉满视口、pixelated 上采样，
   原点都在视口左上——界面里的每一块正好落在流光的那一块上。
   开屏结束前这张画布淡出、真界面带 blur 站起来（时间轴在 grain-boot.ts）。

   字号比格还小的字，在这个分辨率下本来就不存在（最后才浮出来）——这是物理，不是 bug。
   不进栅格的（1–2px 级，或开屏期本来就藏着）：栏头前那颗琥珀点（伪元素）、
   底注下那根细竖线、NEXUS 的小菱形图标、工具星与光标。
   ───────────────────────────────────────────────────────────── */

export type RasterGroup = 'kicker' | 'brand' | 'heads' | 'foot';

export interface RasterAlpha {
  kicker: number;
  brand: number;
  heads: number;
  foot: number;
  line: number;
}

interface Run {
  node: Text;
  group: RasterGroup;
  x: number;
  y: number;
  font: string;
  ls: string;
  color: string;
  alpha: number;
}

const ROOTS = ['.w-home-title', '#w-heads', '.w-home-clock', '.w-home-exits', '.w-home-hint'];

/* rgba(r, g, b, a) / rgb(r g b / a) 里的 alpha；没有就 1 */
function colorAlpha(css: string): number {
  const m = /rgba?\(([^)]+)\)/.exec(css);
  if (!m) return 1;
  const p = m[1].split(/[,\s/]+/).filter(Boolean);
  return p.length >= 4 ? Number(p[3]) || 0 : 1;
}

export interface UiRaster {
  /* 量一遍字的位置 / 字体 / 墨色（字体到了、换词、resize 之后要重来） */
  sync(): void;
  /* 按当前格宽重画；alpha 由开屏时间轴给 */
  draw(cell: number, a: RasterAlpha): void;
  /* 画布内容清掉（交接结束、摘层时） */
  clear(): void;
}

export function createUiRaster(canvas: HTMLCanvasElement): UiRaster {
  const ctx = canvas.getContext('2d');
  const runs: Run[] = [];
  let eeg: HTMLCanvasElement | null = null;

  function groupOf(el: Element): RasterGroup {
    if (el.closest('.w-home-kicker')) return 'kicker';
    if (el.closest('.w-home-brand-box')) return 'brand';
    if (el.closest('#w-heads')) return 'heads';
    return 'foot';
  }

  /* 墨：栏头与角落小字走 background-clip: text 的横向渐变（wander/ink.js），
     color 是透明的；取它那条渐变的平均色当整段的墨，粗格下看不出来差别。 */
  function inkOf(cs: CSSStyleDeclaration): { color: string; alpha: number } {
    const a0 = colorAlpha(cs.color);
    if (a0 > 0.004) return { color: cs.color, alpha: 1 };
    const bg = cs.backgroundImage;
    if (bg && bg.startsWith('linear-gradient')) {
      const re = /rgba?\(([^)]+)\)/g;
      let m: RegExpExecArray | null;
      let r = 0;
      let g = 0;
      let b = 0;
      let sum = 0;
      let n = 0;
      while ((m = re.exec(bg))) {
        const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
        r += p[0];
        g += p[1];
        b += p[2];
        sum += p.length >= 4 ? p[3] : 1;
        n++;
      }
      if (n) {
        return {
          color: `rgb(${Math.round(r / n)} ${Math.round(g / n)} ${Math.round(b / n)})`,
          alpha: sum / n,
        };
      }
    }
    /* 兜底：ink 的浅墨（与 wander/ink.js 的 LIGHT 同值） */
    return { color: 'rgb(239 234 244)', alpha: 0.8 };
  }

  function sync(): void {
    runs.length = 0;
    for (const sel of ROOTS) {
      const root = document.querySelector(sel);
      if (!root) continue;
      const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let n: Node | null;
      while ((n = tw.nextNode())) {
        const text = n.nodeValue;
        if (!text || !text.trim()) continue;
        const el = n.parentElement;
        if (!el) continue;
        const cs = getComputedStyle(el);
        if (cs.display === 'none') continue;
        const rg = document.createRange();
        rg.selectNodeContents(n);
        const r = rg.getBoundingClientRect();
        if (r.width < 0.5 || r.height < 0.5) continue;
        const ink = inkOf(cs);
        runs.push({
          node: n as Text,
          group: groupOf(el),
          x: r.left,
          y: r.top + r.height / 2,
          font: `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`,
          ls: cs.letterSpacing,
          color: ink.color,
          alpha: ink.alpha,
        });
      }
    }
  }

  function draw(cell: number, a: RasterAlpha): void {
    if (!ctx) return;
    const vw = innerWidth;
    const vh = innerHeight;
    const c = Math.max(2, cell);
    const w = Math.max(1, Math.ceil(vw / c));
    const h = Math.max(1, Math.ceil(vh / c));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.scale(1 / c, 1 / c);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';

    /* 脑电线：worker 已经按 reveal 画在整屏画布上，这里只负责把它缩成低分辨率 */
    if (a.line > 0.002) {
      if (!eeg) eeg = document.getElementById('site-eeg-canvas') as HTMLCanvasElement | null;
      if (eeg && !eeg.hidden && eeg.width && eeg.height) {
        ctx.globalAlpha = Math.min(1, a.line);
        try {
          ctx.drawImage(eeg, 0, 0, vw, vh);
        } catch {
          /* 画布被转交 / 还没起来：这一段线先不进栅格 */
        }
      }
    }

    for (const run of runs) {
      const alpha = a[run.group] * run.alpha;
      if (alpha < 0.004) continue;
      const text = run.node.nodeValue;
      if (!text || !text.trim()) continue;
      ctx.globalAlpha = Math.min(1, alpha);
      ctx.fillStyle = run.color;
      ctx.font = run.font;
      try {
        (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = run.ls;
      } catch {
        /* 老浏览器没有 canvas 字距：会略紧一点，粗格下看不出来 */
      }
      ctx.fillText(text.trim(), run.x, run.y);
    }
    ctx.globalAlpha = 1;
  }

  function clear(): void {
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  return { sync, draw, clear };
}
