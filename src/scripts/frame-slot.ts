/* ─────────────────────────────────────────────────────────────
   离屏 Worker 的共同出帧时隙（全站脑电线 eeg-worker.ts、主页地形 home-linescape-worker.ts）。
   两张画布各约 30fps；若各自「等 24ms 再等一帧」，相位互不相干，合成器几乎每个 vsync
   都要收一张新画布、把整屏所有图层重画一遍 —— 首屏静置时 GPU 主线程常驻的开销大半在此。
   这里把出帧对齐到墙钟上的同一组时隙（33⅓ms 的整数倍）：两边的定时器在同一刻到点、
   再各等一个 rAF，于是落在同一个 vsync 上一起提交，合成帧减半。
   墙钟取 timeOrigin + now：各 Worker 的 timeOrigin 不同，但这个和在所有上下文里是同一个时刻。
   ───────────────────────────────────────────────────────────── */

export const SLOT = 1000 / 30;

/** 到下一个时隙还要等多久（ms）：提前 6ms 到点，留给随后的 rAF 对上那一拍；
    离得太近（刚画完、下一个时隙就在眼前）就让过这一个，免得两帧挤在相邻两个 vsync 上 */
export function slotWait(period = SLOT): number {
  const now = performance.timeOrigin + performance.now();
  let w = period - (now % period) - 6;
  if (w < 8) w += period;
  return w;
}
