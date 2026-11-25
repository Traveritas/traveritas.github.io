/* ─────────────────────────────────────────────────────────────
   流光 {{…}} 的逐单元时间曲线（twilight.mjs 构建期用；样式预览页的 span 滑杆在浏览器里也用）。

   原写法：整段一张渐变（墨 0–33% → 峰 50% → 墨 67–100%，峰色 = color-mix(琥珀 hue, 墨)），
   background-size = S（span，默认 300%），background-position 100% → 0% 线性走一周期。
   换算到「整段排成一行」的横坐标 x ∈ [0, 1]（单位：段宽）：
     · 峰心位置 P(τ) = (1 − S/2) + (S − 1)·τ，τ ∈ [0, 1) 为周期内进度，周期末跳回起点；
     · 染色比例 f = max(0, 1 − |x − P| / (0.17·S))（33%→50% 这一截是 0.17 个背景宽）。
   现写法：段拆成单元（汉字一字一个、西文一词一个），单元中心 c 处的 f(τ) 就是它那层琥珀副本的
   不透明度 —— 与「峰色按 f 混进墨色」在 srgb 里同式。f(τ) 是一条三角折线，直接写成
   CSS linear() 缓动，配一条 opacity 0 → 1 的共用 keyframes，整条动画交给合成器。
   steps=N（原先是 background-position 的 steps(N, end)）：τ 先按 floor(τ·N)/N 取整。
   ───────────────────────────────────────────────────────────── */

const r4 = (v) => Math.round(v * 1e4) / 1e4;
const pct = (v) => `${Math.round(v * 1e4) / 100}%`;

/** 单元中心 c（0–1）在段宽倍率 S（如 3 ＝ 300%）下的 linear() 缓动；steps 为抽帧档数（可空） */
export function sheenEase(c, S, steps) {
  const span = Math.max(1.05, S); // S ≤ 1 时光带不走（原写法同样不动），给个下限免除以零
  const peak = (c - (1 - span / 2)) / (span - 1);
  const half = (0.17 * span) / (span - 1);
  const f = (t) => Math.max(0, 1 - Math.abs(t - peak) / half);

  const pts = [];
  if (steps > 0) {
    // 每档一段平台：[k/N, (k+1)/N) 取 f(k/N)；同一横坐标写两点 ＝ 跳变
    for (let k = 0; k < steps; k++) {
      const v = r4(f(k / steps));
      pts.push(`${v} ${pct(k / steps)}`, `${v} ${pct((k + 1) / steps)}`);
    }
  } else {
    const xs = [0, 1, peak - half, peak, peak + half].filter((t) => t >= 0 && t <= 1).sort((a, b) => a - b);
    for (const t of xs) pts.push(`${r4(f(t))} ${pct(t)}`);
  }
  return `linear(${pts.join(', ')})`;
}

/** 单元的宽度权重：汉字与全角符号 1，其余（西文字母数字、半角标点）0.55 —— 只用来估单元中心 c */
export function sheenWeight(ch) {
  return /[⺀-鿿豈-﫿︰-﹏＀-￯　-〿]/.test(ch) ? 1 : 0.55;
}
