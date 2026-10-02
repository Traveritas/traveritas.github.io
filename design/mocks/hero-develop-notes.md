# 首屏原型 · develop（显影 / 光层扫过）

页面：`/mock/hero-develop/`（`src/pages/mock/hero-develop.astro`，脚本 `src/scripts/proto/hero-develop.ts`）。
只重做了场 0 的大字，其余四幕、线、色板与 `/new/` 相同。

## 思路

醒 / 梦两字平时几乎看不见，像磨砂玻璃上没散的水汽字、未显影的相纸。
一条与线平行（14°）的宽柔光带从线出发，沿法向扫过字形：扫到哪里，字就在哪里被记起；
光带后面拖一段尾，字在尾里慢慢淡回去。
- 醒：冷墨色，窄，往上走（离开线），11s 一轮，前沿较清楚、拖尾短。
- 梦：暖赭，宽（1.5 倍字高），往下走，19s 一轮，前后都软、拖尾长。
两条节拍互质，偶尔同亮，大多数时候一明一暗。

## 层次（每字三层）

| 层 | 内容 | 动不动 |
|---|---|---|
| `.lt` 潜影 | 字本身，醒 5.5% / 梦 5% 不透明度，极轻 text-shadow | 静止（只在双态切换时改一次） |
| `.lm` 遮罩容器 | `mask: var(--gl-mask)`：脚本把字画进画布一次得到的字形图 | 静止 |
| `.lm s` 光带 | 旋 14° 的渐变条，`transform` 平移 | 合成层动画 |
| `.lm::after` 颗粒 | feTurbulence 生成的近白细颗粒（SVG data URL），压在光带上像银盐 | 静止 |

双态：`--still` 只调两层的不透明度。梦面梦字更显、醒字更淡，醒面相反。

## 性能做法

- 去掉膜：不再逐帧写 `clip-path`，开屏不再有 30fps 的 rAF 节拍；`frame()` 只在滚动与入场画线时跑。
- 去掉所有滤镜：无 `feMorphology` 描边、无 blur 残影、无 drop-shadow。入场的 `home-develop` 也改成纯 opacity。
- 光带是遮罩容器里的 `transform` 动画，遮罩图静止，合成器直接挪，不重绘。
- 开屏滚走（pos > 1.05）后，给 `html` 加 `hero-off`，暂停光带动画。
- 实测（dev server，1440×900，醒面，入场结束后静置 3s，CDP Performance.getMetrics）：
  hero-develop：RecalcStyle 0 次、Layout 0 次、Script 0ms、主线程任务 5ms；
  同口径 `/new/`（含未提交的优化）：RecalcStyle 87 次、Script 41ms、主线程任务 262ms。
  这只是主线程口径，`/new/` 的滤镜重栅格化开销在 raster / GPU 侧，没算进来。

## 截图

`design/mocks/_shots-hero/`（文件名里两个数字是醒 / 梦光带所处的相位，截图时用 `getAnimations()` 定住）：
- `develop-desk-wake-0.22-0.3.png`：醒字光带走到下半，梦字未亮
- `develop-desk-wake-0.36-0.5.png`：醒字上半被记起，梦字整体暖亮
- `develop-desk-dream-0.22-0.3.png` / `develop-desk-dream-0.36-0.5.png`：梦面
- `develop-mob-wake-0.3-0.42.png`：390×844

## 已知问题 / 可继续调

- 醒字光带的前沿仍偏「实」，扫过时像一块切面，冷光的轻盈感不够；可再降峰值，或把前沿换成两条极细的亮线。
- 梦面的梦字在光带不在时很淡，有几秒画面只剩线与问句。这符合「随时可能消失」，但第一眼可能找不到主体。
- 遮罩依赖字体就绪后的画布绘制：字体未就绪前只显示潜影（`.lm` 透明），不会闪出错位。
- 减动效：光带定格在字中段（静态显影一截），无动画。
- 光带与线的波形不同步（线由 Worker 画，光带是 CSS 节拍），概念上是「线发光」，实际并不读线的状态。
