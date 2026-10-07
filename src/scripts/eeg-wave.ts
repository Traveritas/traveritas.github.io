/* ─────────────────────────────────────────────────────────────
   脑电波的路径算法（Eeg.astro 的两个渲染端共用：Worker 里的 OffscreenCanvas，
   以及不支持它时主线程上的 SVG 回退）。只产出 SVG 路径字符串，不碰 DOM ——
   Canvas 端用 Path2D 直接描同一串，两端的线形因此逐点相同。
   两态读法、参数来历见 Eeg.astro 顶部注释。
   ───────────────────────────────────────────────────────────── */

const TAU = Math.PI * 2;
// 线上主波的四个原始参数：醒态必须与今天逐字一致
const AMP = 3.6;
const FREQ = 0.5;
const SPD = 2.6;
const STEP = 26;
/* 梦态增益（梦态振幅 ＝ AMP × GAIN_D × 各道 gain）：不给增益，4px 格就没有级数可数
   （p14-B 实测）。GAIN_D 4.8 ＝ 醒态增益的两倍；两道**阶梯波**在各自的 gain 上再收
   两成（主波 0.8、灰道 0.5）—— 摆得太大时阶梯的级数会糊成一片。醒态不受影响
   （d=0 时 A 恒为 AMP，与 GAIN_D / gain 无关）。 */
const GAIN_D = 4.8;
const Q_MAIN = 4;
const STEP_LV = [0.75, 1, 1.25]; // 格的 3 秒分级跳变（与 brand.ts 的 3 秒呼吸同源）

interface Voice {
  step: number;
  beats: number;
  dy: number;
  gain: number;
  q: number;
  grid: number;
  smooth?: boolean;
}

/* 三道残影声部：step ＝ 采样步长倍率 / beats ＝ 延迟（单位：拍）/ dy ＝ 满梦时的
   法向分离(px) / gain ＝ 相对振幅 / q ＝ 量化基准格 /
   grid ＝ 自己的采样格相对基准格的偏移（单位：拍）/ smooth ＝ 不采样也不量化
   （路径退化成连续曲线，两道有色的走这条）
   grid：只有灰道给半格（0.5）—— 它与主波是同一套阶梯读法，半个格错开之后
   **两个阶梯波交错运动**（这一格主波跳、下一格灰道跳）；有色两道不跟拍钟，给 0。
   dy 只给一点小偏移（−8 / −4 / 0 / +4，主波仍留在轴线上）＝ 一道一条小车道：
   束主要仍靠读法（相位延迟、步长、量化、虚线）撑开，位置只错开一点点；
   beats 取 2.5 / 5.2 / 7.8 拍（0.625 / 1.3 / 1.95s ＝ 一个波周期的 26% / 54% / 82%，
   一拍收紧到 0.25s 后重编过号，绝对秒数与上一版逐数相同）—— 三道错开摆，不与主波
   同相。dy 乘梦度 ⇒ 醒态四道照样精确重合回轴上。
   顺序与 Eeg.astro 里的 .eeg-echo-1/2/3 一一对应。 */
const VOICES: Voice[] = [
  { step: 2, beats: 2.5, dy: -4, gain: 0.9, q: 4, grid: 0, smooth: true },
  { step: 3, beats: 5.2, dy: 4, gain: 0.5, q: 5, grid: 0.5, smooth: false },
  { step: 5, beats: 7.8, dy: -8, gain: 0.42, q: 6, grid: 0, smooth: true },
];
// 主波：dy 留在 0（轴线上那一条）、grid 0（基准格，灰道才带半格偏移），gain 收两成
const MAIN_V: Voice = { step: 1, beats: 0, dy: 0, gain: 0.8, q: Q_MAIN, grid: 0 };

/* 残影游走（路径坐标里的法向位移，px；负 ＝ 朝上），乘梦度（醒态为 0）：
   · 灰道阶跃：5 档 × 1 拍，落后半拍起步（与它自己那条路径的半格偏移对齐 ⇒ 与路径同一帧换格）
   · 有色两道连续：16 拍（4s）一个 0 → −3 → 0 的线性往返
   原先是 path 上的 CSS 动画；SVG 动画走主线程，醒态位移为 0 也逐帧照跑，故挪进路径里算。 */
const WALK = [0, -1, -2, -1, -3];

export const EEG_ECHO_COUNT = VOICES.length;

export interface EegFrame {
  /** 本帧需要重写的主波路径；null ＝ 沿用上一帧 */
  main: string | null;
  /** 三道残影各自需要重写的路径；null ＝ 沿用上一帧 */
  echoes: (string | null)[];
  /** 梦度 > 0.02 才画残影（醒态跳过：不比重写主波多一次循环） */
  echoesOn: boolean;
}

/* ── 曲线骨架（仅主页用）：线不再是「过视口中心的 14° 直线」，而是视口坐标里的一条折线，
   声部沿它的弧长采样、向法线偏移。法线 ＝ 前进方向左转 90°，与直线版转 14° 之后的 +y 同向，
   所以骨架恰为那条 14° 直线时，曲线版与直线版画出的是同一条线。 */
export interface Spine {
  xy: Float32Array; // x0,y0,x1,y1,…（视口 px）
  L: Float32Array; // 累计弧长
  len: number;
  /** 振幅倍率 0..1（关于页退场把线收平：波幅、残影分离与游走一起乘它；1 ＝ 原样） */
  amp: number;
}

export function makeSpine(xy: Float32Array, amp = 1): Spine {
  const n = xy.length / 2;
  const L = new Float32Array(n);
  for (let i = 1; i < n; i++) L[i] = L[i - 1] + Math.hypot(xy[2 * i] - xy[2 * i - 2], xy[2 * i + 1] - xy[2 * i - 1]);
  return { xy, L, len: L[n - 1], amp };
}

/** beat：拍长（秒），与 CSS 同源（.eeg-group 上的 --fld-beat） */
export function createEegWave(beat: number) {
  const BEAT = beat;

  const waveAt = (u: number, ph: number, A: number) =>
    Math.sin(u * FREQ * TAU + ph * SPD) * A + Math.sin(u * FREQ * 2.7 + ph * 1.3) * A * 0.4;

  const walkAt = (ph: number) => {
    const k = Math.floor((ph - 0.5 * BEAT) / BEAT) % WALK.length;
    return WALK[(k + WALK.length) % WALK.length];
  };
  const driftAt = (ph: number) => {
    const P = BEAT * 16;
    const f = (((ph % P) + P) % P) / P;
    return -3 * (f < 0.5 ? f * 2 : 2 - f * 2);
  };

  /* 单个声部的路径。主波 ＝ {step:1, beats:0, dy:0, gain:.8, q:Q_MAIN}（gain 收两成）；
     梦度 0 时恒等退化成线上那一行（同一套算式与 toFixed）。walk ＝ 残影游走（已乘梦度） */
  function voicePath(ph: number, d: number, v: Voice, W: number, H: number, walk = 0) {
    const cy = H * 0.5;
    const half = Math.sqrt(W * W + H * H) / 2 + 60;
    const step = STEP * v.step;
    const lvl = STEP_LV[Math.min(2, Math.floor(((ph % 3) / 3) * 3))];
    /* 阶梯由两件事合起来：hold 决定「横段＋竖阶」的画法，q 把 y 吸到格上让横段
       更长、台阶更高。smooth 的声部两样都关掉 ⇒ 一路 L 的普通折线（连续曲线）。 */
    const q = v.smooth ? 0 : v.q * lvl * Math.max(0, Math.min(1, (d - 0.1) / 0.9)); // 格随梦度连续长出
    const hold = v.smooth ? 0 : step * d; // 零阶保持
    const A = AMP * (1 + (GAIN_D * v.gain - 1) * d); // 分级振幅
    const phv = ph - v.beats * BEAT * d; // 声部延迟（时间轴，≥1 拍）
    const dy = v.dy * d + walk; // 法向分离（dy 是单独展开某一道的旋钮）+ 残影游走
    const full = hold >= step - 0.6; // 满保持＝直角阶梯
    let s = '';
    let first = true;
    let px = 0;
    let py = 0;
    let lastY = 0;
    for (let x = -half; x <= half; x += step) {
      const u = x / 600;
      let y = waveAt(u, phv, A);
      if (q > 0.05) y = Math.round(y / q) * q;
      const X = W / 2 + x;
      const Y = cy + y + dy;
      if (first) {
        s = 'M' + X.toFixed(1) + ' ' + Y.toFixed(1);
        lastY = Y;
        first = false;
      } else if (full && Math.abs(Y - lastY) < 0.05) s += 'H' + X.toFixed(1); // 同级平台并成一条 H
      else if (full) {
        s += 'H' + X.toFixed(1) + 'V' + Y.toFixed(1); // 直角阶梯
        lastY = Y;
      } else {
        if (hold > 0.5) s += 'L' + (px + hold).toFixed(1) + ' ' + py.toFixed(1); // 半保持：折线∪阶梯的中间态
        s += 'L' + X.toFixed(1) + ' ' + Y.toFixed(1);
        lastY = Y;
      }
      px = X;
      py = Y;
    }
    return s;
  }

  /* 某个声部的拍钟读数：把采样格整体挪 off 拍再取 floor（off 乘梦度 ⇒ 醒态 off=0，
     与「不做 floor+frac 再求和」的醒态口径一致）。主波用 off=0 的基准格；灰道给半格
     （grid 0.5）⇒ **两个阶梯波交错运动**：这一格主波跳、下一格灰道跳，不再同时抽动。 */
  const gridAt = (v: Voice, d: number, ph: number) => {
    const off = v.grid * BEAT * d;
    const g = Math.floor((ph - off) / BEAT) * BEAT + off;
    return d === 0 ? ph : g + (1 - d) * (ph - g);
  };

  /* ── 曲线版声部：与 voicePath 同一套采样 / 量化 / 保持 / 延迟 / 游走，只是坐标换成
     「弧长 s 沿骨架 + 法线偏移」。u 以骨架中点为 0（直线骨架时 ＝ 直线版的 x / 600）。
     返回视口坐标的扁平点列 [x0,y0,x1,y1,…]；阶梯的横段 / 竖阶在弧长—法线坐标里生成，
     因而沿曲线弯折。 */
  function voiceCurve(ph: number, d: number, v: Voice, sp: Spine, walk = 0): number[] {
    const step = STEP * v.step;
    const lvl = STEP_LV[Math.min(2, Math.floor(((ph % 3) / 3) * 3))];
    const q = v.smooth ? 0 : v.q * lvl * Math.max(0, Math.min(1, (d - 0.1) / 0.9));
    const hold = v.smooth ? 0 : step * d;
    const A = AMP * (1 + (GAIN_D * v.gain - 1) * d) * sp.amp;
    const phv = ph - v.beats * BEAT * d;
    const dy = (v.dy * d + walk) * sp.amp;
    const full = hold >= step - 0.6;
    const { xy, L, len } = sp;
    const last = L.length - 1;
    let j = 1; // 弧长单调递增 ⇒ 段索引只往前走
    const out: number[] = [];
    const put = (s: number, y: number) => {
      while (j < last && L[j] < s) j++;
      const i0 = j - 1;
      const seg = L[j] - L[i0] || 1;
      const t = Math.max(0, Math.min(1, (s - L[i0]) / seg));
      const dx = xy[2 * j] - xy[2 * i0];
      const dyS = xy[2 * j + 1] - xy[2 * i0 + 1];
      const l = Math.hypot(dx, dyS) || 1;
      out.push(xy[2 * i0] + dx * t - (dyS / l) * y, xy[2 * i0 + 1] + dyS * t + (dx / l) * y);
    };
    const c = len / 2;
    let first = true;
    let ps = 0;
    let py = 0;
    let lastY = 0;
    for (let s = 0; s <= len; s += step) {
      let y = waveAt((s - c) / 600, phv, A);
      if (q > 0.05) y = Math.round(y / q) * q;
      const Y = y + dy;
      if (first) {
        put(s, Y);
        lastY = Y;
        first = false;
      } else if (full && Math.abs(Y - lastY) < 0.05) put(s, Y);
      else if (full) {
        put(s, lastY);
        put(s, Y);
        lastY = Y;
      } else {
        if (hold > 0.5) put(ps + hold, py);
        put(s, Y);
        lastY = Y;
      }
      ps = s;
      py = Y;
    }
    return out;
  }
  const toPath = (p: number[]) => {
    let s = '';
    for (let i = 0; i < p.length; i += 2) s += (i ? 'L' : 'M') + p[i].toFixed(1) + ' ' + p[i + 1].toFixed(1);
    return s;
  };

  let lastMainGrid = NaN;
  const lastGrid = VOICES.map(() => NaN);
  const lastWalk = VOICES.map(() => NaN);
  let lastPh = NaN;
  let lastD = NaN;
  let lastW = NaN;
  let lastH = NaN;
  let lastVer = NaN;

  return {
    /** 推进一帧（ph ＝ 秒针，d ＝ 梦度 0..1）。同一时刻、同一梦度、同一视口的重复调用返回 null。 */
    step(ph: number, d: number, W: number, H: number): EegFrame | null {
      const dChanged = d !== lastD || W !== lastW || H !== lastH;
      if (!dChanged && ph === lastPh) return null;
      lastPh = ph;
      lastD = d;
      lastW = W;
      lastH = H;
      lastVer = NaN; // 从直线版切回曲线版时强制重算
      /* 两个时钟：
         · 拍钟 gridAt() ＝ 每 0.25s 采一次样并零阶保持 —— 两个阶梯波（主波与灰道）跟它走，
           各自的格位分开记，谁走格谁重写（灰道带半格偏移 ⇒ 与主波交错）；
         · 秒针 ph ＝ 逐帧推进 —— 有色两道（smooth）不受拍钟影响，连续流动。
         醒态（d=0）直接取 ph：不做 floor+frac 的再求和，否则浮点重结合会让最后几位
         变化，醒态就不是「与今天逐字一致」了。中间态是解析的：采样率连续收紧。 */
      const out: EegFrame = { main: null, echoes: VOICES.map(() => null), echoesOn: d > 0.02 };
      const mainGrid = gridAt(MAIN_V, d, ph);
      if (dChanged || mainGrid !== lastMainGrid) {
        lastMainGrid = mainGrid;
        out.main = voicePath(mainGrid, d, MAIN_V, W, H);
      }
      if (out.echoesOn) {
        for (let i = 0; i < VOICES.length; i++) {
          const v = VOICES[i];
          if (v.smooth) {
            // 有色两道跟秒针：每帧都重写，一直流动
            out.echoes[i] = voicePath(ph, d, v, W, H, driftAt(ph) * d);
            continue;
          }
          // 灰道跟拍钟：只在它自己那一格走动（或游走换档）的帧里重写
          const gv = gridAt(v, d, ph);
          const wk = walkAt(ph);
          if (dChanged || gv !== lastGrid[i] || wk !== lastWalk[i]) {
            lastGrid[i] = gv;
            lastWalk[i] = wk;
            out.echoes[i] = voicePath(gv, d, v, W, H, wk * d);
          }
        }
      }
      return out;
    },

    /** 曲线骨架版的一帧（主页）。骨架每次变化都带一个新的 ver；读法与 step() 相同：
        主波与灰道跟拍钟、有色两道跟秒针。 */
    stepCurve(ph: number, d: number, sp: Spine, ver: number): EegFrame | null {
      const changed = d !== lastD || ver !== lastVer;
      if (!changed && ph === lastPh) return null;
      lastPh = ph;
      lastD = d;
      lastVer = ver;
      lastW = NaN; // 回到直线版时强制重算
      const out: EegFrame = { main: null, echoes: VOICES.map(() => null), echoesOn: d > 0.02 };
      const mainGrid = gridAt(MAIN_V, d, ph);
      if (changed || mainGrid !== lastMainGrid) {
        lastMainGrid = mainGrid;
        out.main = toPath(voiceCurve(mainGrid, d, MAIN_V, sp));
      }
      if (out.echoesOn) {
        for (let i = 0; i < VOICES.length; i++) {
          const v = VOICES[i];
          if (v.smooth) {
            out.echoes[i] = toPath(voiceCurve(ph, d, v, sp, driftAt(ph) * d));
            continue;
          }
          const gv = gridAt(v, d, ph);
          const wk = walkAt(ph);
          if (changed || gv !== lastGrid[i] || wk !== lastWalk[i]) {
            lastGrid[i] = gv;
            lastWalk[i] = wk;
            out.echoes[i] = toPath(voiceCurve(gv, d, v, sp, wk * d));
          }
        }
      }
      return out;
    },

    /** 主波在骨架上的实际点列（视口坐标）：主页开屏用它裁切醒 / 梦两字，保证切口与画出的线一致 */
    mainCurve(ph: number, d: number, sp: Spine): number[] {
      return voiceCurve(gridAt(MAIN_V, d, ph), d, MAIN_V, sp);
    },
  };
}
