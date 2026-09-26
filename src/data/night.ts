/* ─────────────────────────────────────────────────────────────
   一夜的数据源（服务端渲染轨图与客户端推进时钟共用）
   23:07 入睡 → 06:31 天亮，共 444 分钟。
   主页滚动即过夜：段落按睡眠深度驻扎，底色分三段平台。
   ───────────────────────────────────────────────────────────── */

export const NIGHT_START_MIN = 23 * 60 + 7; // 1387
export const NIGHT_LEN = 444;

export type Stage = 'W' | 'REM' | 'N1' | 'N2' | 'N3' | 'WASO';

export interface Segment {
  from: number;
  stage: Stage;
}

/** 分期段（from 起持续到下一段的 from；末段到 444） */
export const SEGMENTS: Segment[] = [
  { from: 0, stage: 'W' },
  { from: 12, stage: 'N1' },
  { from: 27, stage: 'N2' },
  { from: 52, stage: 'N3' },
  { from: 84, stage: 'N2' },
  { from: 124, stage: 'N3' },
  { from: 163, stage: 'WASO' },
  { from: 167, stage: 'N3' },
  { from: 181, stage: 'REM' },
  { from: 229, stage: 'N2' },
  { from: 258, stage: 'REM' },
  { from: 287, stage: 'N1' },
  { from: 316, stage: 'REM' },
  { from: 352, stage: 'N2' },
  { from: 373, stage: 'REM' },
  { from: 394, stage: 'N1' },
  { from: 412, stage: 'W' },
];

export const STAGE_INFO: Record<Stage, { zh: string; wave: string; lane: number }> = {
  W: { zh: '清醒', wave: 'β 波', lane: 0 },
  WASO: { zh: '微觉醒', wave: 'WASO', lane: 0 },
  N1: { zh: '浅梦', wave: 'θ 波', lane: 2 },
  N2: { zh: '浅梦', wave: '纺锤波', lane: 3 },
  N3: { zh: '深眠', wave: 'δ 波', lane: 4 },
  REM: { zh: '异相', wave: '眼动', lane: 1 },
};

/** 主页五段：id 与过夜分钟区间（脚本按实际 DOM 位置插值时刻） */
export const SECTIONS = [
  { id: 'ns-hero', from: 0, to: 12 },
  { id: 'ns-essays', from: 12, to: 124 },
  { id: 'ns-projects', from: 124, to: 181 },
  { id: 'ns-rem', from: 181, to: 352 },
  { id: 'ns-dawn', from: 352, to: 444 },
] as const;

/* ── 过夜色板：三段平台 ──────────────────────────────────────
   页面底色不再随滚动连续漂移：全程只有三个稳定状态，颜色只在两次
   换面（熄灯 / 见晨）时改变。三段落位：光面＝入夜·初刻（首屏千层纸的
   上半程）；夜面＝首屏下半程 → 浅梦·随笔 → 深眠·项目 → 异相·试验场；
   纸面＝晨醒·关于后半程。首屏横跨两段，故「千层纸」有昼/夜两套外观，
   两套都须可读（普查槽位：首屏顶、首屏腰·暗面）。
   三次取色都取自上一版 13 站色板中已校准的站点，故每段的 ink/soft 对
   （7% 洗染后、梦/醒两态取小）bg 均 ≥4.5:1——平台是读者会久留的地方，
   必须整段可读。校验：design/.calib-night.cjs
   两次换面由全屏幕布盖住（components/chrome/NightVeil.astro）：四色在
   「全遮」的那一拍里一次换掉，所以不存在 bg 与 ink 亮度交错、半途
   谁也读不清的过渡态。 */

type SectionId = (typeof SECTIONS)[number]['id'];

export interface Zone {
  name: 'light' | 'deep' | 'paper';
  bg: string;
  ink: string;
  soft: string;
  /** 与 ink 同色、0.16 的器线（--line） */
  line: string;
  /** 进入本段的时机：enter.section 的段顶到达视口 enter.vh 处即换面。
      正值＝还没进场（如 0.85：段顶在视口下缘）——比 SECTIONS 的锚点
      （段顶到视口中心）早，免得换面正压在段首 StitchHeader 上；
      负值＝段顶已越过视口顶端（如 -0.12：上一屏彻底离场后才换）。
      首段为 null。 */
  enter: { section: SectionId; vh: number } | null;
}

export const ZONES: Zone[] = [
  {
    name: 'light',
    bg: '#f0f3f6',
    ink: '#232830',
    soft: '#56606d',
    line: 'rgba(35, 40, 48, 0.12)',
    enter: null,
  },
  {
    name: 'deep',
    bg: '#c4ceda',
    ink: '#232830',
    soft: '#56606d',
    line: 'rgba(35, 40, 48, 0.12)',
    // 换面在「随笔段顶走到视口 38%」处
    enter: { section: 'ns-essays', vh: 0.38 },
  },
  {
    name: 'paper',
    bg: '#f5f2eb',
    ink: '#232830',
    soft: '#56606d',
    line: 'rgba(35, 40, 48, 0.12)',
    enter: { section: 'ns-dawn', vh: 0.5 },
  },
];

/** 换面滞回（滚动像素）：读者停在边界上来回蹭时不反复重放淡变 */
export const ZONE_HYSTERESIS = 120;

/* ── 轨图几何（SVG viewBox 48 × 300；时间向下） ── */
export const HY_W = 48;
export const HY_H = 300;
const Y_PAD = 8;
const LANES_X = [7, 15.5, 24, 32.5, 41]; // W REM N1 N2 N3，冷→暖

export function hypnoY(m: number): number {
  return Y_PAD + (Math.min(Math.max(m, 0), NIGHT_LEN) / NIGHT_LEN) * (HY_H - Y_PAD * 2);
}

export function laneX(stage: Stage): number {
  return LANES_X[STAGE_INFO[stage].lane];
}

/** 整夜折线（阶梯：每段一条竖线 + 段间横向过渡） */
export function hypnoPath(): string {
  let d = '';
  SEGMENTS.forEach((seg, i) => {
    const to = i + 1 < SEGMENTS.length ? SEGMENTS[i + 1].from : NIGHT_LEN;
    const x = laneX(seg.stage);
    const y1 = hypnoY(seg.from);
    const y2 = hypnoY(to);
    if (i === 0) d += `M ${x} ${y1}`;
    else d += ` L ${x} ${y1}`; // 从上段末端横移到本段泳道
    d += ` L ${x} ${y2}`;
  });
  return d;
}

/** 某分钟在折线上的点（供笔尖定位） */
export function hypnoPoint(m: number): { x: number; y: number } {
  const seg = SEGMENTS.filter((s, i) => {
    const to = i + 1 < SEGMENTS.length ? SEGMENTS[i + 1].from : NIGHT_LEN;
    return m >= s.from && m < to;
  })[0];
  if (!seg) return { x: laneX('W'), y: hypnoY(m) };
  return { x: laneX(seg.stage), y: hypnoY(m) };
}

export function stageAt(m: number): Stage {
  const seg = SEGMENTS.filter((s, i) => {
    const to = i + 1 < SEGMENTS.length ? SEGMENTS[i + 1].from : NIGHT_LEN;
    return m >= s.from && m < to;
  })[0];
  return seg ? seg.stage : 'W';
}

/** 夜里时刻 → 「01:42」 */
export function fmtNightTime(m: number): string {
  const total = NIGHT_START_MIN + Math.min(Math.max(m, 0), NIGHT_LEN);
  const h = Math.floor(total / 60) % 24;
  const mm = Math.floor(total % 60);
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
