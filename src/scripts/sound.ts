/* ─────────────────────────────────────────────────────────────
   环境声 · 全站机制（两态 BGM）
   · 两态各一条 loop 常驻并行、同相位（源同长同格；实测 mp3 解码后每一条的
     样点数与源 wav 逐个相等，故 loop=true 即刻无缝、且两态天然对齐）。
     醒度（reality.ts 的 wakeMix）驱动等功率交叉——长按入梦时，声音是跟着
     那根线一起换面，而不是切歌。
   · intro 接入 loop；关声＝直接淡出，不接 outro（见 docs/design/bgm.md §3.4：
     outro 成片留着备查，运行时不用）。
   · 相位用墙钟锚定（sessionStorage 存 epoch = 弧线零点对应的墙钟 ms）：
     站内换页、以及「关一下就回来」都落在同一条时间线上；但关了超过
     OFF_RESET_MS（10s）再打开，当作走远了——弧线弃掉，从零点重演开场。
   · 自动播放：首屏绝不出声（浏览器也拦）；用户点开过之后，站内换页尝试续播，
     被策略拦下就如实退回待开启态——不假装在播。
   · 未开启时一个字节都不取；开启后先要当前形态的 intro，另一态 loop 随后
     （闲时）预取，换面要交叉时不会晚。
   ───────────────────────────────────────────────────────────── */

import { clamp } from './lib';
import { BGM_VERSION } from '../data/bgm-assets';
import { getReality, wakeMix, type Reality } from './reality';

type Seg = 'intro' | 'loop';
const FORMS: Reality[] = ['wake', 'dream'];
const DIR = '/audio';
const STORE_KEY = 'xm-sound';
/* 成片文件名固定，换稿后路径不变——URL 上挂内容版本号，否则浏览器会把缓存里的
   旧曲子一直用下去（换音频后重跑 design/audio/normalize-bgm.mjs 会更新版本号） */
const url = (key: string) => `${DIR}/${key}.mp3?v=${BGM_VERSION}`;

/* ── 参数 ───────────────────────────────────────────── */
/** 出场淡入（秒）。点开是明确手势，不必太软 */
const FADE_IN = 1.1;
/** 关声淡出（秒）：直接收干净，不接 outro */
const FADE_OUT = 1.0;
/** 关声多久算「走远了」（ms）：超过它再打开就从弧线零点重来（开场重演），
     以内则当作暂时压掉，接着原相位续上 */
const OFF_RESET_MS = 10_000;
/** 换面被缓冲迟到拦下时，补上交叉的时长（秒） */
const LATE_GLIDE = 0.8;
/** 醒度采样间隔（ms）/ 跟手时间常数（秒） */
const MIX_POLL = 140;
const MIX_TAU = 0.14;
/** 切走标签页：世界悬停，声音退到这么轻（1 = 不压） */
const HIDDEN_DUCK = 0.22;
const HIDDEN_TAU = 1.2;
/** 交叉峰顶目标（线性）。两态瞬态同相相加会超 0 dBFS——实测最坏 +2.34 dBFS，
     故按素材峰值算一条 sin 余量曲线，把交叉中段按在峰顶之下。留 0.5 dB 吸收
     mp3 解码的采样间过冲。 */
const HEAD_ROOM = 0.94;
/** 阅读页（长文与关于）整体的退后量（dB）。页面用 BaseLayout 的 bgm="reading" 声明意图，
     具体数字只在这里一处，改它两态同时挪、等响关系不变 */
const READING_TRIM_DB = -5;

interface Stored {
  on: boolean;
  /** 弧线零点（intro 起点）对应的墙钟毫秒 */
  epoch: number;
  /** 关声那一刻的墙钟毫秒：再打开时据此判断该续上还是从头（见 OFF_RESET_MS） */
  offAt?: number;
  /** 段落时长（首次放出来后记下）：站内换页时缓冲还没到手也要能算相位 */
  durs?: { intro?: number; loop?: number };
}

/* ── 运行时 ─────────────────────────────────────────── */
let ctx: AudioContext | null = null;
let master: GainNode | null = null; // 进出场
let headroom: GainNode | null = null; // 交叉余量 × 悬停
let bedGain: GainNode | null = null; // bed 生命周期
let gIntro: GainNode | null = null;
const chain: Partial<Record<Reality, { gain: GainNode; src: AudioBufferSourceNode | null }>> = {};

const buffers = new Map<string, AudioBuffer>();
const inflight = new Map<string, Promise<AudioBuffer | null>>();

let introSrc: AudioBufferSourceNode | null = null;
let introForm: Reality = 'dream';
/** bed 时间轴：ctx 时间 bedAtCtx 处对应弧线里的 introDur（即 loop 的 0） */
let bedAtCtx: number | null = null;
let epoch: number | null = null;
let offAt: number | null = null;
let on = false;
let mixWanted = 0; // 目标醒度（reality 给的值）
let mixApplied = 0; // 实际落下的醒度（缓冲迟到时会被拦在能听到的那一面）
let duckDepth = 0;
let hidden = false;
let pollTimer: ReturnType<typeof setInterval> | 0 = 0;
let els: HTMLButtonElement[] = [];
let storedDurs: Partial<Record<Seg, number>> = {};
/** 本页的页面级电平（阅读页退后一档），进场时由 body[data-bgm] 定下 */
let pageGain = 1;

const mod = (a: number, b: number) => ((a % b) + b) % b;
const now = () => (ctx ? ctx.currentTime : 0);
const arcNow = () => (epoch === null ? 0 : (Date.now() - epoch) / 1000);
const buf = (form: Reality, seg: Seg) => buffers.get(`${form}-${seg}`);
/** 时长：优先用已解码的缓冲；缓冲还没到手就用存下来的值，否则算不出相位 */
const durOf = (seg: Seg, form: Reality) => buf(form, seg)?.duration ?? storedDurs[seg] ?? Infinity;
/** 两态同长（源保证；实测解码后逐条相等）。取短的那个当共同长度，防外扩 */
const introDur = () => Math.min(...FORMS.map((f) => durOf('intro', f)));
const loopDur = () => Math.min(...FORMS.map((f) => durOf('loop', f)));

/* ── 取音频（只在开启后发生）─────────────────────────── */
function load(form: Reality, seg: Seg): Promise<AudioBuffer | null> {
  const key = `${form}-${seg}`;
  const got = buffers.get(key);
  if (got) return Promise.resolve(got);
  const flying = inflight.get(key);
  if (flying) return flying;
  const p = (async () => {
    if (!ctx) return null;
    const res = await fetch(url(key));
    if (!res.ok) throw new Error(`${key}: HTTP ${res.status}`);
    const decoded = await ctx.decodeAudioData(await res.arrayBuffer());
    buffers.set(key, decoded);
    if (seg === 'loop') peaks.set(key, peakOf(decoded));
    if (seg === 'intro' || seg === 'loop') {
      const cur = storedDurs[seg];
      if (!cur || decoded.duration < cur) {
        storedDurs[seg] = decoded.duration;
        persist();
      }
    }
    measureHeadroom();
    ensureBed(); // loop 迟到时，到了就按时间轴补进相位
    return decoded;
  })().catch((e) => {
    console.warn('[sound]', e);
    return null;
  });
  inflight.set(key, p);
  return p;
}

/* ── 交叉余量：按实际素材峰值算，素材换了自动跟着换 ─────── */
const peaks = new Map<string, number>();
function peakOf(b: AudioBuffer) {
  let p = 0;
  for (let c = 0; c < b.numberOfChannels; c++) {
    const d = b.getChannelData(c);
    // 全样本扫描：窄峰（高频瞬态）就在相邻样本之间，跳采样会低估十个 dB
    for (let i = 0; i < d.length; i++) {
      const a = d[i] < 0 ? -d[i] : d[i];
      if (a > p) p = a;
    }
  }
  return p;
}
function measureHeadroom() {
  const pw = peaks.get('wake-loop');
  const pd = peaks.get('dream-loop');
  const known = Math.max(pw ?? 0, pd ?? 0);
  // 缺哪一态就先按已知峰值保守估（多压一点无害，压太浅会削顶）
  const a = pw ?? known;
  const b = pd ?? known;
  let depth = 0;
  for (let k = 0; k <= 32; k++) {
    const m = k / 32;
    const sum = Math.sin((m * Math.PI) / 2) * a + Math.cos((m * Math.PI) / 2) * b;
    const s = Math.sin(Math.PI * m);
    if (sum > HEAD_ROOM && s > 1e-3) depth = Math.max(depth, (sum - HEAD_ROOM) / (sum * s));
  }
  duckDepth = Math.min(0.6, depth);
}

/* ── 图：各源 → headroom → master → 输出 ───────────── */
function buildGraph() {
  if (!ctx || master) return;
  master = ctx.createGain();
  headroom = ctx.createGain();
  bedGain = ctx.createGain();
  gIntro = ctx.createGain();
  master.gain.value = 0;
  headroom.gain.value = 1;
  bedGain.gain.value = 1;
  gIntro.gain.value = 0;
  for (const f of FORMS) {
    const g = ctx.createGain();
    g.gain.value = 0;
    g.connect(bedGain);
    chain[f] = { gain: g, src: null };
  }
  bedGain.connect(headroom);
  gIntro.connect(headroom);
  headroom.connect(master);
  master.connect(ctx.destination);
}

/* ── 混合（等功率）+ 余量 + 悬停 ───────────────────── */
function applyMix(m: number, tau = MIX_TAU) {
  const w = chain.wake;
  const d = chain.dream;
  if (!ctx || !w || !d || !headroom) return;
  const t = now();
  w.gain.gain.setTargetAtTime(Math.sin((m * Math.PI) / 2), t, tau);
  d.gain.gain.setTargetAtTime(Math.cos((m * Math.PI) / 2), t, tau);
  headroom.gain.setTargetAtTime(
    (1 - duckDepth * Math.sin(Math.PI * m)) * (hidden ? HIDDEN_DUCK : 1),
    t,
    tau,
  );
}
/** 目标那一态的 loop 还没到：先留在还听得到的那一面，别把声音换进虚空 */
function availableMix(m: number) {
  const want: Reality = m >= 0.5 ? 'wake' : 'dream';
  const other: Reality = want === 'wake' ? 'dream' : 'wake';
  if (chain[want]?.src || !chain[other]?.src) return m;
  return want === 'wake' ? 0 : 1;
}
function setMix(m: number) {
  const applied = availableMix(m);
  mixApplied = applied;
  applyMix(applied, applied === m ? MIX_TAU : LATE_GLIDE);
}

/* ── 时间轴 ───────────────────────────────────────── */
function startLoop(form: Reality, at: number, offset: number) {
  const c = chain[form];
  const b = buf(form, 'loop');
  if (!ctx || !c || !b) return;
  stopLoop(form);
  const src = ctx.createBufferSource();
  src.buffer = b;
  src.loop = true;
  src.loopStart = 0;
  src.loopEnd = b.duration;
  src.connect(c.gain);
  src.start(at, mod(offset, b.duration));
  c.src = src;
}
function stopLoop(form: Reality) {
  const c = chain[form];
  if (!c?.src) return;
  const src = c.src;
  c.src = null;
  try {
    src.stop();
  } catch {
    /* 已停 */
  }
  src.disconnect();
}
/** 两条 loop 都追上 bed 时间轴；缓冲迟到就等它到（offset 由时间轴推出） */
function ensureBed() {
  if (!ctx || bedAtCtx === null) return;
  if (introSrc && now() < bedAtCtx) return; // 开场还没走完
  for (const f of FORMS) {
    if (chain[f]?.src || !buf(f, 'loop')) continue;
    const at = Math.max(bedAtCtx, now() + 0.06);
    startLoop(f, at, at - bedAtCtx);
  }
}
/** 把 bed 时间轴挪到「ctx 时间 at 处 = 弧线 introDur 处」（提前切掉开场时用） */
function anchorBed(at: number) {
  epoch = Date.now() + (at - now()) * 1000 - introDur() * 1000;
  persist();
}
/** 从弧线当前所在的位置接入：intro 里就接着放开场，过了就直接落 bed */
function startFromArc() {
  if (!ctx || !gIntro) return;
  const a = arcNow();
  const id = introDur();
  if (Number.isFinite(id) && a < id && !introSrc) {
    const b = buf(getReality(), 'intro');
    if (b) {
      introForm = getReality();
      const at = now() + 0.06;
      const src = ctx.createBufferSource();
      src.buffer = b;
      src.connect(gIntro);
      src.start(at, a);
      src.onended = () => {
        if (introSrc === src) introSrc = null;
      };
      introSrc = src;
      gIntro.gain.cancelScheduledValues(at);
      gIntro.gain.setValueAtTime(0, at);
      gIntro.gain.linearRampToValueAtTime(1, at + FADE_IN);
      bedAtCtx = at + (id - a); // 开场尽头正好落在 loop 的 0
      ensureBed();
      return;
    }
  }
  // 直接落 bed：相位由时间轴推出
  const off = Number.isFinite(id) && Number.isFinite(loopDur()) ? a - id : 0;
  bedAtCtx = now() + 0.06 - off;
  ensureBed();
}
function stopIntro(fade: number) {
  const src = introSrc;
  if (!ctx || !gIntro || !src) return;
  introSrc = null;
  const t = now();
  gIntro.gain.cancelScheduledValues(t);
  // τ = fade/3 ⇒ fade*2 处已落到 e⁻⁶ ≈ 0.2%，此时停源不留咔
  gIntro.gain.setTargetAtTime(0, t, Math.max(0.05, fade / 3));
  src.stop(t + fade * 2);
  setTimeout(() => src.disconnect(), fade * 2000 + 300);
}

/* ── 播放生命周期 ─────────────────────────────────── */
async function startPlayback() {
  if (!ctx) return;
  const form = getReality();
  void load(form, 'loop'); // loop 永远要，先并行起步
  // 只有真要演开场（弧线还在 intro 段内）才等 intro；否则等 loop 到手再出声，
  // 免得淡入追上一片空场（站内换页时开场多半已经演过了）
  if (arcNow() < introDur()) await load(form, 'intro');
  else await load(form, 'loop');
  if (!on || !ctx) return;
  mixWanted = mixApplied = form === 'wake' ? 1 : 0;
  const t = now();
  master?.gain.cancelScheduledValues(t);
  master?.gain.setTargetAtTime(pageGain, t, FADE_IN / 3);
  bedGain?.gain.cancelScheduledValues(t);
  bedGain?.gain.setTargetAtTime(1, t, 0.2);
  applyMix(mixApplied, 0.4);
  startFromArc();
  startPoll();
  prefetchRest();
  paint();
}

/** 关声：master 直接淡出（intro / loop 一起收），随后停源挂起。
    挂的是 master 而非 bed，所以开场演到一半关声也是同一条淡出。 */
function haltPlayback() {
  stopPoll();
  if (!ctx) return;
  stopIntro(0.4);
  const t = now();
  master?.gain.cancelScheduledValues(t);
  master?.gain.setTargetAtTime(0, t, FADE_OUT / 3);
  setTimeout(
    () => {
      if (on) return;
      for (const f of FORMS) stopLoop(f);
      bedAtCtx = null;
      ctx?.suspend().catch(() => {});
    },
    FADE_OUT * 2000 + 250,
  );
}

async function turnOn() {
  on = true;
  // 关了太久（> OFF_RESET_MS）再打开：旧的弧线弃掉，从零点重来（开场重演）；
  // 关一下就回来则接着原相位续上，不打断
  if (offAt !== null && Date.now() - offAt > OFF_RESET_MS) {
    epoch = Date.now();
    bedAtCtx = null;
  }
  offAt = null;
  persist();
  if (!ctx) {
    // 不锁采样率：iOS 的实际输出率随路由漂移（蓝牙 44.1k、语音会话残留等），
    // 锁 48k 就得走 WebKit 的实时重采样——那是出名的失真路径（WebKit Bug 154538，
    // 症状即「声音变成很小的杂音」）。默认创建让 ctx 跟着设备走，decodeAudioData
    // 会把 48k 素材对齐到 ctx 率（Core Audio 离线重采样，质量可靠），全程零实时重采样。
    ctx = new AudioContext();
    buildGraph();
  }
  if (ctx.state !== 'running') {
    try {
      await ctx.resume();
    } catch {
      /* 按 state 判定 */
    }
  }
  if (ctx.state !== 'running') {
    on = false; // 被自动播放策略拦下：如实退回待开启态（epoch 留着，点开即续上）
    persist();
    paint();
    return;
  }
  paint();
  if (epoch === null) epoch = Date.now();
  await startPlayback();
}

function turnOff() {
  on = false;
  offAt = Date.now();
  persist();
  paint();
  haltPlayback();
}

/** 闲时把另一态的 loop 取回来（换面要交叉，到时才取就晚了）。页面常驻动画会把
    requestIdleCallback 饿住，故带 timeout 兜底，再补一道定时器；load 自身去重。 */
function prefetchRest() {
  const later = () => {
    for (const f of FORMS) void load(f, 'loop');
  };
  const ric = (
    window as unknown as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    }
  ).requestIdleCallback;
  if (ric) ric(later, { timeout: 2500 });
  else setTimeout(later, 1500);
  setTimeout(later, 3000);
}

/* ── 醒度跟手：长按那两秒里，声音与线一起走 ────────────── */
function startPoll() {
  stopPoll();
  pollTimer = setInterval(() => {
    if (!ctx || !on || ctx.state !== 'running') return;
    ensureBed();
    const m = clamp(wakeMix(), 0, 1);
    if (Math.abs(m - mixWanted) > 0.008) {
      mixWanted = m;
      setMix(m);
    }
    // 开场还在演、人已换到对面：收掉开场，bed 立刻接上（并把这半段弧线抹掉）
    if (introSrc && Math.abs(mixWanted - (introForm === 'wake' ? 1 : 0)) > 0.55) {
      const at = now() + 0.5;
      stopIntro(0.45);
      anchorBed(at);
      bedAtCtx = at;
      ensureBed();
      persist();
    }
  }, MIX_POLL);
}
function stopPoll() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = 0;
}

/* ── 存储与外观 ───────────────────────────────────── */
function persist() {
  if (epoch === null) return;
  const rec: Stored = { on, epoch };
  if (offAt !== null) rec.offAt = offAt;
  if (storedDurs.intro || storedDurs.loop) {
    rec.durs = { intro: storedDurs.intro, loop: storedDurs.loop };
  }
  try {
    sessionStorage.setItem(STORE_KEY, JSON.stringify(rec));
  } catch {
    /* 隐私模式静默 */
  }
}
function paint() {
  if (on) document.documentElement.dataset.sound = 'on';
  else delete document.documentElement.dataset.sound;
  for (const b of els) b.setAttribute('aria-pressed', on ? 'true' : 'false');
}

/* ── 初始化 ───────────────────────────────────────── */
export function initSound(): void {
  // 可能不止一颗（样式预览页把它当样张又摆了一份）：都接上，状态由 html[data-sound] 统一驱动
  els = [...document.querySelectorAll<HTMLButtonElement>('[data-sound-toggle]')];
  if (!els.length) return;
  hidden = document.hidden;
  pageGain = document.body.dataset.bgm === 'reading' ? 10 ** (READING_TRIM_DB / 20) : 1;

  for (const b of els) {
    b.addEventListener('click', () => {
      if (on) turnOff();
      else void turnOn();
    });
  }
  document.addEventListener('visibilitychange', () => {
    hidden = document.hidden;
    if (ctx && on) applyMix(mixApplied, HIDDEN_TAU);
  });
  addEventListener('pagehide', persist);

  if (import.meta.env.DEV) {
    let probeNode: AnalyserNode | null = null;
    (window as unknown as { __sound?: unknown }).__sound = {
      state: () => ({
        on,
        ctx: ctx?.state ?? null,
        arc: +arcNow().toFixed(2),
        mix: +mixApplied.toFixed(3),
        duck: +duckDepth.toFixed(3),
        loaded: [...buffers.keys()],
        loops: FORMS.map((f) => `${f}:${chain[f]?.src ? 'run' : '-'}`),
        /* 真实落下的值（gain 参数），与 mix 的目标值区分开看 */
        gains: FORMS.map((f) => +(chain[f]?.gain.gain.value ?? 0).toFixed(3)),
        head: +(headroom?.gain.value ?? 0).toFixed(3),
        master: +(master?.gain.value ?? 0).toFixed(4),
        pageGain: +pageGain.toFixed(4),
        bed: +(bedGain?.gain.value ?? 0).toFixed(3),
        intro: +(gIntro?.gain.value ?? 0).toFixed(3),
        bedIn: bedAtCtx === null ? null : +(bedAtCtx - now()).toFixed(2),
        offFor: offAt === null ? null : +((Date.now() - offAt) / 1000).toFixed(2),
      }),
      /* 量输出端实际电平：只看调度不算数，要看到样本在流 */
      probe: async (ms = 320) => {
        if (!ctx || !master) return null;
        if (!probeNode) {
          probeNode = ctx.createAnalyser();
          probeNode.fftSize = 2048;
          master.connect(probeNode);
        }
        const buf = new Float32Array(probeNode.fftSize);
        let peak = 0;
        const t0 = performance.now();
        while (performance.now() - t0 < ms) {
          probeNode.getFloatTimeDomainData(buf);
          for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]));
          await new Promise((r) => setTimeout(r, 25));
        }
        return { peak: +peak.toFixed(5), peakDb: peak > 0 ? +(20 * Math.log10(peak)).toFixed(2) : -Infinity };
      },
    };
  }

  // 站内换页续播：点开过才尝试；浏览器若拦（未取得该域的播放许可），
  // turnOn 自己会退回待开启态，与「从未点开」呈现一致。
  let wanted = false;
  try {
    const raw = sessionStorage.getItem(STORE_KEY);
    if (raw) {
      const rec = JSON.parse(raw) as Stored;
      epoch = rec.epoch;
      offAt = rec.offAt ?? null;
      storedDurs = { intro: rec.durs?.intro || undefined, loop: rec.durs?.loop || undefined };
      wanted = rec.on === true;
    }
  } catch {
    /* 隐私模式静默 */
  }
  if (wanted) void turnOn();
  else paint();
}
