# Backlog

只收**还没做**的事项，按处置方式分组。每条尽量带位置、证据与修法，供排期或转交直接取用。
已解决、已拍板、已作废的条目，连同各轮的测量记录与附录（夜读性攻坚、三段平台、换面卡顿、低端机卡顿），
都在 [`docs/archive/backlog-2026-09-21.md`](archive/backlog-2026-09-21.md)。2026-10-07 那次逐条拍板的决议也记在那里。

---

## 一、主页相关

1. **主页脚本出错时的揭幕兜底（待复核）**：新主页由 `html.booted` 门控，无脚本时题记直接落定；但「脚本加载了却在揭幕前抛错」时，首屏各块（`.q .c`、`.pin`、`.s-hero .rise` 等）是否会停在 `opacity:0`，需要复核，必要时补 CSS keyframes 兜底。
2. **300/900 字重下沉**：只有主页用（标题 / 巨字），从 BaseLayout 挪进 `index.astro` 自己 import。是字体 P0（二.1）的止血配合项。
3. **`.sr-only` 各写一份**（主页、404、`/legacy/`）：提取进 `global.css` 全站复用。
4. **新导览轨小字对比度未普查**：`Rail.astro` / `Gauge.astro` 的半隐小字没按合成后的不透明度测过，可用 `design/.sweep-night.cjs` 的 C 段补测。
5. ghost 重影标签在暗底上的观感，待观察。

## 二、等 BaseLayout 改动一起做

1. **字体 P0**：全站共享 CSS 约 540KB，绝大部分是 @font-face（Noto Serif SC 4 字重 ×101 子集），/about 字体实载约 805KB、文章页约 1MB。治本办法是用 `cn-font-split` 按全站实际用字自切（CSS 可压到 50KB gzip 以下），并且只输出 woff2（现在 dist 里有 397 个多余的 .woff，共 31MB）。
   - 2026-10-03 逐项剥离测得：首帧排版的大头是**冷启动时中文字形的首次初始化**，不是 @font-face 声明数。自切能省掉字体到位后那次约 100ms 的重排和下载量，但别指望它单独解决首帧。新主页屏外四幕已加 `content-visibility: auto`。
2. **og:image + JSON-LD**：BaseLayout 加 `og:image`（先做一张 1200×630 默认图放进 `public/og/`），`twitter:card` 升为 `summary_large_image`，加 `og:locale zh_CN`。JSON-LD 最小集：主页 `WebSite` + `Person`，文章页 `BlogPosting`。
3. **article:published_time / modified_time**：BaseLayout 加可选 props，文章页传 `date.toISOString()`；content schema 加可选的 `updated`。
4. **skip link**：BaseLayout 的 body 首位加 `.sr-only`「跳到正文」。
5. **night.ts 改动态 import**：静态页现在白白多载约 1.5KB gzip。
6. **五个 init 没有异常隔离**：`initBoot(); initChrome(); initNight(); initMorph(); initReality();` 顺序裸调，一个抛错后面全挂。各自加 try/catch。
7. **揭幕期焦点被面纱遮住**（WCAG 2.4.11）：进门时给 `.page` 设 `inert`，`booted` 后移除。
8. **面包屑 + BreadcrumbList**（文章 / 项目详情页），和 2 的 JSON-LD 一起做。

## 三、性能（可独立排期）

1. **字重收敛**：文章正文请求 400 实际只载了 500（隐性匹配，多下一套 CJK 子集）；`projects/[slug]` 请求 700 匹配到 900；SiteHeader 的 mono 用了 500/600，但只载了 IBM Plex Mono 400（伪粗体）。终态：全站 2 个字重，并补上 `@fontsource/ibm-plex-mono/500.css`。
2. **新主页第 2 幕偶发首次显影卡顿**：滚到造物幕（scrollY≈2900）时偶尔出一帧约 180ms，是玻璃板模糊滤镜第一次进入视口时的光栅化。可试：给 `.slab .win svg` 预先加 `will-change: filter`；或者把滚动驱动的 `filter: blur()` 换成静态两层交叉淡化。
3. **文章页构块场并进 WebGL 画布**（2026-10-03 暂缓，阅读页目前够流畅）：160 块方块画进脑电线那张全屏画布（`eeg-worker.ts`），去掉 160 个合成层，需要逐像素对照。注意「滚出视口就暂停」已验证无效，别再试。
4. **线景地形几何搬进顶点着色器**（低优先）：Worker 里每帧约 4–5ms，已经不占主线程。
5. 回退字体 `size-adjust` / `ascent-override` 调参（低优先）。
6. 测量备忘：两版主页的 TBT 数字不能直接比，要比首帧排版的 trace 时长。复测脚本是 `design/.perf-home.cjs`。不要往页面里注入 rAF 循环来测帧率，注入本身就会逼出主线程帧。

## 四、验证欠账

- 全部性能结论都是实验室级（没有 CrUX/RUM）。上线 `web-vitals` 一方 RUM 后，复验字体 P0 和 LCP。
- GitHub Pages 实际的 Cache-Control / br 支持没有线上验证过。
- 没用真实屏幕阅读器（NVDA/VoiceOver）测过；200% 缩放、Windows 高对比度模式也没测。
