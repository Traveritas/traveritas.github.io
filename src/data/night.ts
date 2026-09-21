/* ─────────────────────────────────────────────────────────────
   一夜的数据源（服务端渲染轨图与客户端插值共用）
   23:07 入睡 → 06:31 天亮，共 444 分钟。
   主页滚动即过夜：段落按睡眠深度驻扎。
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

/** 昼夜色板停靠点（分钟 → 页面三色） */
export const PALETTE = [
  { m: 0, bg: '#e9ecef', ink: '#262c33', soft: '#59626c' },
  { m: 16, bg: '#c9ced4', ink: '#2c333b', soft: '#5d6670' },
  { m: 34, bg: '#99a1ab', ink: '#333b43', soft: '#6a737c' },
  { m: 48, bg: '#525a66', ink: '#d9d4c8', soft: '#b4ae9f' },
  { m: 62, bg: '#414a58', ink: '#d9d4c8', soft: '#b9b3a4' },
  { m: 78, bg: '#22272f', ink: '#e5e0d2', soft: '#b9b3a4' },
  { m: 100, bg: '#171b24', ink: '#e5e0d2', soft: '#b9b3a4' },
  { m: 330, bg: '#171b24', ink: '#e5e0d2', soft: '#b9b3a4' },
  { m: 352, bg: '#231e26', ink: '#e5e0d2', soft: '#b9b3a4' },
  { m: 373, bg: '#3a3340', ink: '#e5e0d2', soft: '#b9b3a4' },
  { m: 394, bg: '#6e655f', ink: '#e0d8c6', soft: '#b9b3a4' },
  { m: 412, bg: '#b9b1a1', ink: '#4f4a3c', soft: '#7a7364' },
  { m: 424, bg: '#cbc4b6', ink: '#5d564a', soft: '#7a7364' },
  { m: 444, bg: '#efe9dd', ink: '#55503f', soft: '#7a7364' },
];

/** 阶段锚站：阶跃只在这些整站之间发生，其余停靠点弃用——
    滚动节奏为「长段稳定＋少数几次快速换站」：入夜三站（昼→暮灰→夜蓝）
    → 深夜一长站（随笔尾＋项目＋异相全程）→ 黎明三站（暖暗→灰白→纸色） */
export const STAGE_MS = [0, 34, 62, 100, 394, 412, 424, 444];

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
