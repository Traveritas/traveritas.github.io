/* ─────────────────────────────────────────────────────────────
   Ave · 右下角的旁白（组件 src/components/chrome/Ave.astro，台词 src/data/ave-lines.ts）
   · 什么时候说：
       enter  进某页 / 某版块后几秒（本页只取路径最具体的那一句）
       end    阅读页读到正文末尾
       event  别的脚本点名：dispatchEvent(new CustomEvent('xm:ave', { detail: { name } }))
       clock  访客本地时间在某段之内；与 idle 一起在空闲时抽，先抽它
       idle   随机池：每隔 IDLE_TICK 掷一次，概率 IDLE_CHANCE
   · 克制：随机句之间至少隔 IDLE_GAP、每次来访最多 SESSION_CAP 句；点名类（enter/end/event）
     只要求离上一句 CUE_GAP。间隔与计数存 sessionStorage，换页也算数。
     说过没有按台词的 once 记（session / ever / always）。
   · 出声：Ave 的音量不为 0 才出声（sound.ts 的 playVoice，工具栏「声音」里单独一圈），字幕跟着音节揭开；
     没开声音也按同一节奏揭开，只是安静。没有预渲染的句子整句直接出现。
   · 停留：揭开完再停 HOLD（按字数），鼠标停在上面不收；点 × 收起。
   · 位置：平时在右下角；台词带 at（或事件 detail.at 传了元素）就贴到那个元素旁边——
     右边放得下放右边，不行放左边，再不行放下面 / 上面；滚动时跟着走，元素滚出视口就收起。
     元素一开始就不在视口里（或找不到），照常在右下角。
   ───────────────────────────────────────────────────────────── */

import { AVE_LINES, type AveLine } from '../data/ave-lines';
import { AVE_VOICE, type AveVoiceClip } from '../data/ave-voice';
import { getReality } from './reality';
import { playVoice, preloadVoice } from './sound';
import { reducedMotion } from './lib';
import { createAveFlow } from './ave-flow';
import type { AvePageLine } from '../lib/ave-page';

/* ── 参数 ───────────────────────────────────────────── */
/** 进页后这么久之内不抽随机句（ms） */
const FIRST_QUIET = 20_000;
const IDLE_TICK = 25_000;
const IDLE_CHANCE = 0.35;
/** 两句随机句之间至少隔多久（ms，跨页算） */
const IDLE_GAP = 120_000;
/** 多久没动算「静置」（ms）：这时随机池优先抽 still 类的句子 */
const STILL_AFTER = 45_000;
/** 点名类离上一句至少隔多久（ms） */
const CUE_GAP = 20_000;
/** 每次来访最多说几句随机句（点名类不计） */
const SESSION_CAP = 6;
/** 揭开完再停多久：基础 + 每字，封顶（ms） */
const HOLD_BASE = 3200;
const HOLD_PER_CHAR = 130;
const HOLD_MAX = 9000;
/** 漫游里点开一篇后，窗长大完再过多久说它自带的那句（s，条目可用 after 改） */
const READ_AFTER = 3;
/* 每一篇自带的那句说几次、闲聊多少、字幕怎么出、停多久、贴不贴元素：都是访客的设置（PREFS，见下） */
/** 一段连着说的几句：上一句的声音说完后多久开始下一句（ms）。
    位置不变就原地换字；位置要变（贴到别处 / 回到角落）就收起再出现，收起的动画也算在这段里 */
const THEN_PAUSE = 2000;
/** 进页台词默认在开屏面纱打开后几秒说（s；台词可用 after 改） */
const ENTER_AFTER = 3;
/** 位置要变时：快速收起多久（ms，与样式里 .is-quick 的过渡对齐）、收起之后再隔多久出现 */
const QUICK_OUT = 250;
const THEN_GAP = 60;
/** 鼠标移开后再停多久（ms） */
const HOLD_AFTER_HOVER = 2400;
/** 贴元素时：句子离元素多远（牵线的最短长度，px）、离视口边至少多远 */
const ANCHOR_GAP = 28;
const VIEW_PAD = 14;

/** 表情头像（public/ave/face/）：定稿前关着，用组件里的占位人影 */
const USE_FACES = false;

const OFF_KEY = 'xm-ave'; // localStorage：'off' = 关掉
const EVER_KEY = 'xm-ave-ever'; // localStorage：once: 'ever' 说过的 id
const VISITED_KEY = 'xm-ave-visited'; // localStorage：来过（欢迎说出口时写上）
const SESSION_KEY = 'xm-ave'; // sessionStorage：本次来访的记录
const PREFS_KEY = 'xm-ave-prefs'; // localStorage：访客的设置（只存改过的项）

/* ── 访客设置（工具栏「设置 → Ave」：[data-ave-opt] 点一下换到下一档，ave.ts 管值与文案） ──
   点一下按 opts 的顺序换到下一档（转到头回到第一档）。闲聊的「常」就是原先的固定参数；
   文章里默认每次都说（2026-10-26 作者定） */
const PREFS = {
  chat: {
    def: 'mid',
    opts: [
      ['off', '不闲聊'],
      ['low', '少'],
      ['mid', '常'],
      ['high', '多'],
    ],
  },
  page: {
    def: 'always',
    opts: [
      ['off', '不说'],
      ['ever', '第一次'],
      ['always', '每次'],
    ],
  },
  reveal: {
    def: 'step',
    opts: [
      ['step', '逐字'],
      ['whole', '整句'],
    ],
  },
  hold: {
    def: 'mid',
    opts: [
      ['short', '短'],
      ['mid', '常'],
      ['long', '长'],
    ],
  },
  anchor: {
    def: 'on',
    opts: [
      ['on', '贴着说'],
      ['off', '右下角'],
    ],
  },
} as const;
type PrefKey = keyof typeof PREFS;
type PrefVal<K extends PrefKey> = (typeof PREFS)[K]['opts'][number][0];
function pref<K extends PrefKey>(k: K): PrefVal<K> {
  const v = store.get<Record<string, string>>(localStorage, PREFS_KEY, {})[k];
  return (PREFS[k].opts.some(([x]) => x === v) ? v : PREFS[k].def) as PrefVal<K>;
}
function setPref(k: PrefKey, v: string) {
  const all = store.get<Record<string, string>>(localStorage, PREFS_KEY, {});
  if (v === PREFS[k].def) delete all[k];
  else all[k] = v;
  store.set(localStorage, PREFS_KEY, all);
}
/** 闲聊各档：掷中的概率、两句之间至少隔多久（ms）、每次来访最多几句。不闲聊 = 随机池（含按时段、静置）整个不掷 */
const CHAT = {
  low: { chance: 0.2, gap: 240_000, cap: 3 },
  mid: { chance: IDLE_CHANCE, gap: IDLE_GAP, cap: SESSION_CAP },
  high: { chance: 0.5, gap: 60_000, cap: 10 },
} as const;
/** 停留各档：揭开完再停的时长乘这个数 */
const HOLD_K = { short: 0.6, mid: 1, long: 1.6 } as const;

interface Session {
  seen: string[];
  /** 随机句说了几句 */
  n: number;
  /** 上一句出现的墙钟毫秒 */
  last: number;
  /** 这次来访是以新访客的身份开始的（欢迎说过了）：整次来访都不算「回来」 */
  newcomer?: boolean;
}

/* ── 状态 ───────────────────────────────────────────── */
let root: HTMLElement;
let face: HTMLImageElement;
let card: HTMLElement;
let textEl: HTMLElement;
let lead: HTMLElement;
let sr: HTMLElement;
/** 台词表 + 本页自带的那句 */
const lines: AveLine[] = [...AVE_LINES];
/** 本句逐字的 span */
let chars: HTMLElement[] = [];
/** 正贴着的元素 */
let anchor: Element | null = null;
let placeRaf = 0;
/** 这句的声音（或没有声音时按同一节奏的字幕）预计在什么时候说完（performance.now 毫秒） */
let speakEnd = 0;
/** 漫游里正点开着一篇（xm:read）：这时进页句子和随机句子都不插进来 */
let reading = false;
let current: AveLine | null = null;
let pending: { line: AveLine; at?: Element | null; gap?: number } | null = null;
let holdT = 0;
let hideT = 0;
let revealRaf = 0;
let revealDone = false;
let hovering = false;
let stopVoice: (() => void) | null = null;
let showToken = 0;
let flow: ReturnType<typeof createAveFlow> = null;
const pageStart = Date.now();
/** 访客上一次动（移鼠标 / 滚 / 按键 / 触摸）的墙钟毫秒，判断「静置」用 */
let lastActive = Date.now();

const store = {
  get<T>(s: Storage, k: string, d: T): T {
    try {
      const v = s.getItem(k);
      return v ? (JSON.parse(v) as T) : d;
    } catch {
      return d;
    }
  },
  set(s: Storage, k: string, v: unknown) {
    try {
      s.setItem(k, JSON.stringify(v));
    } catch {
      /* 存不下就算了 */
    }
  },
};
const session = (): Session => ({ seen: [], n: 0, last: 0, ...store.get<Partial<Session>>(sessionStorage, SESSION_KEY, {}) });
const ever = () => store.get<string[]>(localStorage, EVER_KEY, []);

function isOff() {
  try {
    return localStorage.getItem(OFF_KEY) === 'off';
  } catch {
    return false;
  }
}

/* ── 选句 ───────────────────────────────────────────── */
const here = () => location.pathname;
const pathHits = (p?: string) => !p || (p === '/' ? here() === '/' : here().startsWith(p));

function fresh(line: AveLine) {
  const once = line.once ?? 'session';
  if (once === 'always') return true;
  if (once === 'ever') return !ever().includes(line.id);
  return !session().seen.includes(line.id);
}

function minutes(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
}
function inClock(from: string, to: string) {
  const d = new Date();
  const t = d.getHours() * 60 + d.getMinutes();
  const a = minutes(from);
  const b = minutes(to);
  return a <= b ? t >= a && t < b : t >= a || t < b;
}

function pick(lines: AveLine[]) {
  return lines.length ? lines[Math.floor(Math.random() * lines.length)] : null;
}

/* ── 显示 ───────────────────────────────────────────── */
function clipOf(line: AveLine): { text: string; clip: AveVoiceClip | null } {
  const dream = getReality() === 'dream' && !!line.dream;
  const text = dream ? line.dream! : line.text;
  const c = AVE_VOICE[dream ? `${line.id}~dream` : line.id];
  // 台词改了还没重渲染：声音对不上字，宁可不出声
  return { text, clip: c && c.text === text ? c : null };
}

function remember(line: AveLine, idle: boolean) {
  const s = session();
  const ids = [line.id, ...(line.covers ?? [])];
  for (const id of ids) if (!s.seen.includes(id)) s.seen.push(id);
  if (idle) s.n++;
  s.last = Date.now();
  if (line.when.on === 'enter' && line.when.visitor === 'new') {
    s.newcomer = true;
    try {
      localStorage.setItem(VISITED_KEY, '1');
    } catch {
      /* 存不下就算了：下次还当新访客 */
    }
  }
  store.set(sessionStorage, SESSION_KEY, s);
  // covers 里的句子不管自己是哪种 once，都当这台设备上说过了
  const e = ever();
  const add = [...(line.once === 'ever' ? [line.id] : []), ...(line.covers ?? [])].filter((id) => !e.includes(id));
  if (add.length) store.set(localStorage, EVER_KEY, [...e, ...add]);
}

/** 老访客：以前来过，并且这次来访不是以新访客开始的 */
function returning() {
  let visited = false;
  try {
    visited = localStorage.getItem(VISITED_KEY) === '1';
  } catch {
    /* 读不到就当新访客 */
  }
  return visited && !session().newcomer;
}
const visitorOk = (l: AveLine) => l.when.on !== 'enter' || !l.when.visitor || (l.when.visitor === 'returning') === returning();

/** 把一句话拆成逐字的 span（.c），末尾接三截碎屑（.ave-tail） */
function build(text: string) {
  textEl.textContent = '';
  chars = [...text].map((ch, i) => {
    const c = document.createElement('span');
    c.className = 'c';
    c.textContent = ch;
    c.style.setProperty('--i', String(i));
    return c;
  });
  const tail = document.createElement('span');
  tail.className = 'ave-tail';
  tail.innerHTML = '<i></i><i></i><i></i>';
  // 碎屑和最后一个字绑在一起：要换行就一起换，别让碎屑单独掉到下一行
  const end = document.createElement('span');
  end.className = 'ave-end';
  end.append(chars[chars.length - 1] ?? '', tail);
  textEl.append(...chars.slice(0, -1), end);
}

/** 折成几行时，把字栏收到各行差不多长（框跟着收窄），别让最后一行只剩一两个字。
    逐字的 span 让 text-wrap: balance / pretty 都不可靠，所以自己量 */
function balance() {
  textEl.style.maxWidth = '';
  const lines = () => new Set(chars.map((c) => Math.round(c.offsetTop))).size;
  const n = lines();
  if (n < 2) return;
  const tail = textEl.querySelector<HTMLElement>('.ave-tail');
  const total = chars.reduce((w, c) => w + c.offsetWidth, 0) + (tail?.offsetWidth ?? 0);
  const em = chars[0].offsetWidth;
  // 从平均行宽起，一次放宽一个字，直到行数不比原来多
  for (let k = 1; k <= 4; k++) {
    textEl.style.maxWidth = `${Math.ceil(total / n + em * k)}px`;
    if (lines() <= n) return;
  }
  textEl.style.maxWidth = '';
}

/** 前 n 个字念到了；最后念到的两个字是「线头」 */
function paint(n: number) {
  chars.forEach((c, i) => {
    c.classList.toggle('on', i < n);
    c.classList.toggle('head', i < n && i >= n - 2);
  });
}

function show(line: AveLine, idle = false, at?: Element | null) {
  if (isOff()) return;
  if (current) {
    if (!idle) pending = { line, at }; // 点名的话排一句，等这句收了再说
    return;
  }
  clearTimeout(hideT);
  current = line;
  const token = ++showToken;
  remember(line, idle);

  const { text, clip } = clipOf(line);
  // 连说：这句一开口就把下一句的声音取好、解好，接上时不用等
  const nextClip = line.then ? clipOf(lines.find((l) => l.id === line.then) ?? line).clip : null;
  if (nextClip) preloadVoice(nextClip.src);
  if (USE_FACES) face.src = `/ave/face/${line.face ?? 'smile'}.webp`;
  sr.textContent = `Ave：${text}`;
  revealDone = false;
  build(text);
  // 访客选了整句出现、或不要动效：不逐字揭开（有声音照样放）
  const whole = reducedMotion() || pref('reveal') === 'whole';
  paint(clip && !whole ? 0 : chars.length);

  root.classList.remove('is-leaving', 'is-done', 'is-quick');
  root.hidden = false;
  balance();
  anchor = resolveAnchor(at ?? line.at);
  root.classList.toggle('is-anchored', !!anchor);
  if (anchor) place();
  else root.style.left = root.style.top = '';
  void root.offsetWidth; // 先落下 hidden=false 再起过渡
  root.classList.add('is-on');
  if (anchor) follow();
  if (!USE_FACES) flow?.start();

  if (!clip || whole) {
    // 没有节奏可跟（或不逐字）：整句直接出现；有声音照样放
    speakEnd = performance.now() + (clip ? clip.dur * 1000 + 60 : 0);
    if (clip) void playVoice(clip.src).then((v) => token === showToken && v && (stopVoice = v.stop));
    finishReveal(chars.length);
    return;
  }
  void playVoice(clip.src).then((v) => {
    if (token !== showToken) return v?.stop();
    if (v) stopVoice = v.stop;
    const delay = v ? v.delayMs : 120;
    speakEnd = performance.now() + delay + clip.dur * 1000;
    reveal(clip.steps, delay, token);
  });
}

function reveal(steps: number[], delayMs: number, token: number) {
  const t0 = performance.now() + delayMs;
  let i = 0;
  const frame = () => {
    if (token !== showToken) return;
    const t = performance.now() - t0;
    let n = -1;
    while (i < steps.length && steps[i] <= t) {
      n = steps[i + 1];
      i += 2;
    }
    if (n >= 0) paint(n);
    if (i >= steps.length) return finishReveal(chars.length);
    revealRaf = requestAnimationFrame(frame);
  };
  revealRaf = requestAnimationFrame(frame);
}

function finishReveal(len: number) {
  revealDone = true;
  paint(len);
  root.classList.add('is-done');
  const next = current?.then ? lines.find((l) => l.id === current!.then) : undefined;
  if (next && fresh(next)) {
    // 一段连说的中途：声音说完 THEN_PAUSE 后就是下一句。鼠标停在上面就先不走，移开再接（hide(true) 会接上）
    if (hovering) return;
    const same = (next.at ?? '') === (current!.at ?? '');
    const left = Math.max(0, speakEnd - performance.now());
    clearTimeout(holdT);
    // 要挪位置：框照样留到接近 THEN_PAUSE，再快速收起（QUICK_OUT）、隔 THEN_GAP 在新位置出现——
    // 两种接法的节奏一致：都是声音说完约 THEN_PAUSE 后下一句开口
    holdT = window.setTimeout(() => (same ? swapTo(next) : hide(true, true)), left + (same ? THEN_PAUSE : Math.max(0, THEN_PAUSE - QUICK_OUT - THEN_GAP)));
    return;
  }
  if (!hovering) hold(Math.min(HOLD_MAX, HOLD_BASE + len * HOLD_PER_CHAR) * HOLD_K[pref('hold')]);
}

/** 连说时位置不变：框不收起，原地换成下一句 */
function swapTo(next: AveLine) {
  if (!current || reading || isOff() || !fresh(next)) return hide();
  showToken++;
  cancelAnimationFrame(revealRaf);
  clearTimeout(holdT);
  stopVoice?.();
  stopVoice = null;
  current = null;
  show(next);
}

function hold(ms: number) {
  clearTimeout(holdT);
  holdT = window.setTimeout(() => hide(true), ms);
}

/** natural = 停留时间到了自然收起（只有这样才接 then；点 ×、关掉、被别的打断都不接）；
    quick = 连说中途换位置：快速收起，不演线一字一字退的那段 */
function hide(natural = false, quick = false) {
  if (!current) return;
  const then = natural && !reading && current.then ? lines.find((l) => l.id === current!.then) : undefined;
  if (then && fresh(then)) pending = { line: then, gap: THEN_GAP };
  showToken++;
  cancelAnimationFrame(revealRaf);
  clearTimeout(holdT);
  stopVoice?.();
  stopVoice = null;
  current = null;
  cancelAnimationFrame(placeRaf);
  placeRaf = 0;
  removeEventListener('scroll', onMove);
  removeEventListener('resize', onMove);
  root.classList.toggle('is-quick', quick);
  root.classList.add('is-leaving');
  root.classList.remove('is-on');
  // 收起多久：平时先让线退掉再淡出（--ave-out），换位置时快收
  const out = quick ? QUICK_OUT : Number(getComputedStyle(root).getPropertyValue('--ave-out')) || 520;
  hideT = window.setTimeout(() => {
    root.hidden = true;
    root.classList.remove('is-leaving', 'is-done', 'is-anchored', 'is-quick');
    root.style.maxWidth = '';
    anchor = null;
    flow?.stop();
    const next = pending;
    pending = null;
    if (next && fresh(next.line)) setTimeout(() => show(next.line, false, next.at), next.gap ?? 900);
  }, out);
}

/* ── 贴元素 ─────────────────────────────────────────── */
function inView(r: DOMRect) {
  return r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth && r.width + r.height > 0;
}

function resolveAnchor(at?: Element | string | null) {
  if (!at || pref('anchor') === 'off') return null; // 访客选了总在右下角
  const el = typeof at === 'string' ? document.querySelector(at) : at;
  return el && inView(el.getBoundingClientRect()) ? el : null;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** 量元素和句子，挑一侧放下，再把牵线从元素边上拉到句子的线上 */
/** 元素里字实际占到哪（标题这类块元素整行宽，牵线要从字的末尾牵出，不是从块边） */
function inkRect(el: Element, box: DOMRect) {
  const range = document.createRange();
  range.selectNodeContents(el);
  const t = range.getBoundingClientRect();
  return t.width && t.height ? t : box;
}

function place() {
  if (!anchor) return;
  // 放哪一侧按元素的盒子算（句子留在页边、不压正文），牵线从字上起
  const r = anchor.getBoundingClientRect();
  const ink = inkRect(anchor, r);
  const cy = r.top + r.height / 2;
  const roomR = innerWidth - r.right - ANCHOR_GAP - VIEW_PAD;
  const roomL = r.left - ANCHOR_GAP - VIEW_PAD;
  // 先按自然宽度挑一侧；那一侧不够宽、但还放得下一句短话，就把薄片收窄到那么宽
  root.style.maxWidth = '';
  root.style.left = '0px'; // 量自然宽度时别让上一次的位置把它挤窄
  const w0 = card.offsetWidth;
  const MIN = 220;
  const side = roomR >= w0 ? 'r' : roomL >= w0 ? 'l' : roomR >= MIN && roomR >= roomL ? 'r' : roomL >= MIN ? 'l' : 'v';
  if (side === 'r' && roomR < w0) root.style.maxWidth = `${roomR}px`;
  if (side === 'l' && roomL < w0) root.style.maxWidth = `${roomL}px`;
  if (root.style.maxWidth) balance();
  const w = card.offsetWidth;
  const h = card.offsetHeight;
  // 第一行字的线在卡片里的位置（句子的线从这里起）
  const c0 = chars[0]?.getBoundingClientRect();
  const k = card.getBoundingClientRect();
  const lineY = c0 ? c0.bottom - k.top : h / 2;
  const lineX = c0 ? c0.left - k.left : 0;

  let x: number;
  let y: number;
  let from: [number, number];
  let to: [number, number];
  if (side === 'r') {
    // 右边：第一行的线和元素的中线对齐，牵线水平接进句子
    x = r.right + ANCHOR_GAP;
    y = clamp(cy - lineY, VIEW_PAD, innerHeight - h - VIEW_PAD);
    to = [x, y + lineY]; // 接到薄片的左边上（第一行线的高度）
    from = [ink.right + 10, clamp(to[1], ink.top, ink.bottom)];
  } else if (side === 'l') {
    // 左边：牵线从元素左缘接到薄片右边
    x = r.left - ANCHOR_GAP - w;
    y = clamp(cy - lineY, VIEW_PAD, innerHeight - h - VIEW_PAD);
    from = [ink.left - 10, clamp(y + lineY, ink.top, ink.bottom)];
    to = [x + w, y + lineY];
  } else {
    // 上下：元素太宽，放在下面（下面放不下就上面），左缘对齐元素
    x = clamp(r.left, VIEW_PAD, innerWidth - w - VIEW_PAD);
    const below = innerHeight - r.bottom - ANCHOR_GAP - VIEW_PAD >= h;
    y = below ? r.bottom + ANCHOR_GAP : r.top - ANCHOR_GAP - h;
    const fx = clamp(x + lineX + 6, ink.left + 4, ink.right - 4);
    from = [fx, below ? r.bottom + 4 : r.top - 4];
    to = [fx, below ? y + 2 : y + h - 2];
  }
  root.style.left = `${Math.round(x)}px`;
  root.style.top = `${Math.round(y)}px`;

  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  lead.style.width = `${Math.hypot(dx, dy)}px`;
  lead.style.transform = `translate(${from[0]}px, ${from[1]}px) rotate(${Math.atan2(dy, dx)}rad)`;
}

function onMove() {
  if (placeRaf) return;
  placeRaf = requestAnimationFrame(() => {
    placeRaf = 0;
    if (!current || !anchor) return;
    // 元素滚出视口：话题已经过去了，收起
    if (!inView(anchor.getBoundingClientRect())) return hide();
    place();
  });
}

function follow() {
  addEventListener('scroll', onMove, { passive: true });
  addEventListener('resize', onMove);
}

/* ── 触发 ───────────────────────────────────────────── */
function cue(line: AveLine, at?: Element | null) {
  if (isOff() || reading || !fresh(line)) return;
  if (Date.now() - session().last < CUE_GAP && !current) return;
  show(line, false, at);
}

function idleTick() {
  if (isOff() || reading || current || pending || document.hidden) return;
  if (Date.now() - pageStart < FIRST_QUIET) return;
  const chat = pref('chat');
  if (chat === 'off') return;
  const c = CHAT[chat];
  const s = session();
  if (s.n >= c.cap || Date.now() - s.last < c.gap) return;
  if (Math.random() > c.chance) return;
  const ok = (l: AveLine) => fresh(l) && pathHits('path' in l.when ? l.when.path : undefined);
  const clock = AVE_LINES.filter((l) => l.when.on === 'clock' && ok(l) && inClock(l.when.from, l.when.to));
  // 静置时优先抽 still 类；still 类也只在静置时出现
  const still = Date.now() - lastActive >= STILL_AFTER ? AVE_LINES.filter((l) => l.when.on === 'still' && ok(l)) : [];
  const line = pick(clock) ?? pick(still) ?? pick(AVE_LINES.filter((l) => l.when.on === 'idle' && ok(l)));
  if (line) show(line, true);
}

function watchEnd(lines: AveLine[]) {
  const main = document.querySelector('main');
  if (!main || !lines.length) return;
  let done = false;
  const check = () => {
    if (done) return;
    // 正文末尾进入视口（页很短、一进来就看得到底的不算「读完」）
    if (scrollY > 200 && main.getBoundingClientRect().bottom <= innerHeight + 40) {
      done = true;
      removeEventListener('scroll', onScroll);
      const line = pick(lines.filter(fresh));
      if (line) setTimeout(() => cue(line), 1200);
    }
  };
  let raf = 0;
  const onScroll = () => {
    if (!raf) raf = requestAnimationFrame(() => ((raf = 0), check()));
  };
  addEventListener('scroll', onScroll, { passive: true });
}

function initToggle() {
  const btns = document.querySelectorAll<HTMLButtonElement>('[data-ave-toggle]');
  // html[data-ave="off"]：设置里依附于「说话」的那几项跟着变淡
  const mark = () => {
    if (isOff()) document.documentElement.dataset.ave = 'off';
    else delete document.documentElement.dataset.ave;
  };
  mark();
  for (const b of btns) b.addEventListener('click', () => setTimeout(mark));
  initPrefs();
  for (const b of btns) {
    b.setAttribute('aria-pressed', String(!isOff()));
    b.addEventListener('click', () => {
      const off = !isOff();
      try {
        if (off) localStorage.setItem(OFF_KEY, 'off');
        else localStorage.removeItem(OFF_KEY);
      } catch {
        /* 存不下就算了 */
      }
      for (const x of btns) x.setAttribute('aria-pressed', String(!off));
      if (off) {
        pending = null;
        hide();
      }
    });
  }
}

/** 设置里的各项：[data-ave-opt="<项>"] 点一下换到下一档，<b data-v> 写当前那档的字；
    [data-ave-reset] 再认识一次——忘掉说过的话和「来过」，下次进主页重新欢迎 */
function initPrefs() {
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-ave-opt]')) {
    const k = b.dataset.aveOpt as PrefKey;
    if (!(k in PREFS)) continue;
    const v = b.querySelector<HTMLElement>('[data-v]');
    const opts = PREFS[k].opts as readonly (readonly [string, string])[];
    const paint = () => {
      const cur = pref(k);
      if (v) v.textContent = opts.find(([x]) => x === cur)?.[1] ?? '';
    };
    paint();
    b.addEventListener('click', () => {
      const i = opts.findIndex(([x]) => x === pref(k));
      setPref(k, opts[(i + 1) % opts.length][0]);
      paint();
    });
  }
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-ave-reset]')) {
    const v = b.querySelector<HTMLElement>('[data-v]');
    let t = 0;
    b.addEventListener('click', () => {
      try {
        sessionStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(EVER_KEY);
        localStorage.removeItem(VISITED_KEY);
      } catch {
        /* 清不掉就算了 */
      }
      if (v) v.textContent = '好';
      clearTimeout(t);
      t = window.setTimeout(() => v && (v.textContent = ''), 1800);
    });
  }
}

/* ── 读到某一篇（条目自带的那句） ─────────────────────── */
/** Ave.astro 构建时收齐、内联进来的各条目台词，键 = <集合>/<条目 id> */
function readPages(el: HTMLElement): Record<string, AvePageLine> {
  try {
    return JSON.parse(el.querySelector('script.ave-pages')?.textContent || '{}');
  } catch {
    return {};
  }
}

/** 条目的地址 → 键：/articles/<id>/、/projects/<id>/、/moments/#<id> */
function keyOfHref(href: string) {
  const m = href.match(/^\/(articles|projects)\/([^/#?]+)/) || href.match(/^\/(moments)\/#(.+)$/);
  return m ? `${m[1]}/${decodeURIComponent(m[2])}` : '';
}

/** 条目自带的那句；访客选了「文章里不说」就没有。「第一次」= 这台设备上只说一次 */
function pageToLine(p: AvePageLine, after: number): AveLine | null {
  const mode = pref('page');
  if (mode === 'off') return null;
  const once = mode === 'ever' ? 'ever' : 'always';
  return { id: p.id, text: p.text, dream: p.dream, face: p.face, mood: p.mood, at: p.at, once, when: { on: 'enter', path: here(), after: p.after ?? after } };
}

/** 漫游里点开的那一篇（reader.js 发 xm:read）：窗长大之后几秒说它自带的那句；
    翻到别的一条、或收起时，没说出口的作罢，正在说的这一句收起 */
function watchReading(pages: Record<string, AvePageLine>) {
  let t = 0;
  let line: AveLine | null = null;
  addEventListener('xm:read', (e) => {
    clearTimeout(t);
    // 换了一篇 / 收起：上一篇那句正在说的收起，排着队还没说出口的作废
    if (line && pending?.line.id === line.id) pending = null;
    if (current && line && current.id === line.id) hide();
    const href = (e as CustomEvent<{ href?: string | null }>).detail?.href;
    reading = !!href;
    if (reading) pending = null;
    const p = href ? pages[keyOfHref(href)] : undefined;
    line = p ? pageToLine(p, READ_AFTER) : null;
    if (!line || isOff() || !fresh(line)) return;
    const l = line;
    if (!lines.some((x) => x.id === l.id)) lines.push(l);
    // 不看 CUE_GAP，也不排在别的话后面：点开就是想读这一篇，正在说别的就先收掉那句，再说这篇的
    t = window.setTimeout(() => {
      if (line !== l || isOff() || !fresh(l)) return;
      if (current && current.id !== l.id) {
        pending = { line: l };
        hide();
      } else show(l);
    }, (l.when.on === 'enter' ? l.when.after ?? READ_AFTER : READ_AFTER) * 1000);
  });
}

/** 开屏面纱打开（html.booted）之后再计时：首访面纱要演三秒，别在面纱底下开口。
    不带面纱的页可能一直不打 booted，最多等 BOOT_WAIT 就照常开始 */
const BOOT_WAIT = 4000;
function afterBoot(fn: () => void) {
  const h = document.documentElement;
  if (h.classList.contains('booted')) return fn();
  let done = false;
  const go = () => {
    if (done) return;
    done = true;
    mo.disconnect();
    fn();
  };
  const mo = new MutationObserver(() => h.classList.contains('booted') && go());
  mo.observe(h, { attributes: true, attributeFilter: ['class'] });
  setTimeout(go, BOOT_WAIT);
}

/* ── 初始化 ─────────────────────────────────────────── */
export function initAve(): void {
  initToggle();
  const el = document.getElementById('ave');
  if (!el) return;
  root = el;
  // 各条目自带的那句；本页若是某一篇自己那一整页（data-entry），它就是这页的进页台词
  const pages = readPages(el);
  const entry = el.dataset.entry;
  const page = entry && pages[entry] ? pageToLine(pages[entry], ENTER_AFTER) : null;
  if (page) lines.push(page);
  face = el.querySelector('.ave-face')!;
  card = el.querySelector('.ave-card')!;
  textEl = el.querySelector('.ave-text')!;
  lead = el.querySelector('.ave-lead')!;
  sr = el.querySelector('.ave-sr')!;
  if (!USE_FACES) flow = createAveFlow(el.querySelector('.ave-flow')!);

  el.querySelector('.ave-x')!.addEventListener('click', () => {
    pending = null;
    hide();
  });
  card.addEventListener('pointerenter', () => {
    hovering = true;
    clearTimeout(holdT);
  });
  card.addEventListener('pointerleave', () => {
    hovering = false;
    if (current && revealDone) hold(HOLD_AFTER_HOVER);
  });
  card.addEventListener('focusin', () => clearTimeout(holdT));

  // 进页：随笔 / 项目自己那一整页只说它自带的那句，没写就不说；其余页按路径挑最具体的那一句
  const enter = (page && fresh(page) ? [page] : []).concat(entry !== undefined ? [] : AVE_LINES.filter((l) => l.when.on === 'enter' && pathHits(l.when.path) && visitorOk(l) && fresh(l)).sort(
    (a, b) => ('path' in b.when ? b.when.path!.length : 0) - ('path' in a.when ? a.when.path!.length : 0),
  ))[0];
  if (enter && enter.when.on === 'enter') {
    const wait = (enter.when.after ?? ENTER_AFTER) * 1000;
    afterBoot(() => setTimeout(() => (enter === page ? !isOff() && !reading && fresh(enter) && show(enter) : cue(enter)), wait));
  }

  if (document.body.dataset.pageType === 'article') {
    watchEnd(AVE_LINES.filter((l) => l.when.on === 'end' && pathHits(l.when.path)));
  }

  addEventListener('xm:ave', (e) => {
    const d = (e as CustomEvent<{ name?: string; at?: Element }>).detail;
    const line = pick(AVE_LINES.filter((l) => l.when.on === 'event' && l.when.name === d?.name && fresh(l)));
    if (line && !isOff() && fresh(line)) show(line, false, d?.at);
  });

  watchReading(pages);
  const active = () => (lastActive = Date.now());
  for (const ev of ['pointermove', 'pointerdown', 'keydown', 'wheel', 'scroll', 'touchstart'])
    addEventListener(ev, active, { passive: true });

  setInterval(idleTick, IDLE_TICK);

  if (import.meta.env.DEV) {
    (window as unknown as { __ave?: unknown }).__ave = {
      /** 立刻说某一句（不看间隔与说过没有）；at 给选择器就贴到那个元素旁边 */
      say: (id: string, at?: string) => {
        const l = lines.find((x) => x.id === id);
        if (!l) return `没有 ${id}`;
        pending = null;
        const go = () => show(l, false, at ? document.querySelector(at) : undefined);
        if (current) {
          hide();
          setTimeout(go, 950);
        } else go();
      },
      hide: () => hide(),
      /** 清掉说过的记录、间隔和「来过」（刷新后就是新访客） */
      reset: () => {
        sessionStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(EVER_KEY);
        localStorage.removeItem(VISITED_KEY);
      },
      lines: lines.map((l) => l.id),
    };
  }
}
