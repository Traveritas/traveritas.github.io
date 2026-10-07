# Backlog

只收**还没做**的事项，按处置方式分组。每条尽量带位置、证据与修法，供排期或转交直接取用。
已解决、已拍板、已作废的条目，连同各轮的测量记录与附录（夜读性攻坚、三段平台、换面卡顿、低端机卡顿），
都在 [`docs/archive/backlog-2026-09-21.md`](archive/backlog-2026-09-21.md)。2026-10-07 那次逐条拍板的决议也记在那里。

---

## 一、主页相关

1. **主页脚本出错时的揭幕兜底（待复核）**：新主页由 `html.booted` 门控，无脚本时题记直接落定；但「脚本加载了却在揭幕前抛错」时，首屏各块（`.q .c`、`.pin`、`.s-hero .rise` 等）是否会停在 `opacity:0`，需要复核，必要时补 CSS keyframes 兜底。
2. **`.sr-only` 各写一份**（主页、404）：提取进 `global.css` 全站复用。
3. **新导览轨小字对比度未普查**：`Rail.astro` / `Gauge.astro` 的半隐小字没按合成后的不透明度测过，可用 `design/.sweep-night.cjs` 的 C 段补测。
4. ghost 重影标签在暗底上的观感，待观察。

## 二、等 BaseLayout 改动一起做

1. **og:image + JSON-LD**：BaseLayout 加 `og:image`（先做一张 1200×630 默认图放进 `public/og/`），`twitter:card` 升为 `summary_large_image`，加 `og:locale zh_CN`。JSON-LD 最小集：主页 `WebSite` + `Person`，文章页 `BlogPosting`。
2. **article:published_time / modified_time**：BaseLayout 加可选 props，文章页传 `date.toISOString()`；content schema 加可选的 `updated`。
3. **skip link**：BaseLayout 的 body 首位加 `.sr-only`「跳到正文」。
4. **`scripts/overnight.ts` 改动态 import**（只有主页用得到）：静态页现在白白多载约 1.5KB gzip。
5. **五个 init 没有异常隔离**：`initBoot(); initChrome(); initNight(); initMorph(); initReality();` 顺序裸调，一个抛错后面全挂。各自加 try/catch。
6. **揭幕期焦点被面纱遮住**（WCAG 2.4.11）：进门时给 `.page` 设 `inert`，`booted` 后移除。
7. **面包屑 + BreadcrumbList**（文章 / 项目详情页），和 1 的 JSON-LD 一起做。

## 三、性能（可独立排期）

1. **新主页第 2 幕偶发首次显影卡顿**：滚到造物幕（scrollY≈2900）时偶尔出一帧约 180ms，是玻璃板模糊滤镜第一次进入视口时的光栅化。可试：给 `.slab .win svg` 预先加 `will-change: filter`；或者把滚动驱动的 `filter: blur()` 换成静态两层交叉淡化。
2. **文章页构块场并进 WebGL 画布**（2026-10-03 暂缓，阅读页目前够流畅）：160 块方块画进脑电线那张全屏画布（`eeg-worker.ts`），去掉 160 个合成层，需要逐像素对照。注意「滚出视口就暂停」已验证无效，别再试。
3. **线景地形几何搬进顶点着色器**（低优先）：Worker 里每帧约 4–5ms，已经不占主线程。
4. 回退字体 `size-adjust` / `ascent-override` 调参（低优先）。
5. 测量备忘：两版主页的 TBT 数字不能直接比，要比首帧排版的 trace 时长。复测脚本是 `design/.perf-home.cjs`。不要往页面里注入 rAF 循环来测帧率，注入本身就会逼出主线程帧。

## 四、验证欠账

- 全部性能结论都是实验室级（没有 CrUX/RUM）。上线 `web-vitals` 一方 RUM 后，复验字体 P0 和 LCP。
- GitHub Pages 实际的 Cache-Control / br 支持没有线上验证过。
- 没用真实屏幕阅读器（NVDA/VoiceOver）测过；200% 缩放、Windows 高对比度模式也没测。
