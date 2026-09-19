# 技术选型决议

日期：2026-09-19 ｜ 状态：建议稿（待用户确认） ｜ 调研：两路并行智能体调研 + 官方来源核实

## 0. 背景与前提

- 站点构成：主页（2D 平面设计 + 3D、前后景层次的大胆 landing page，交互逻辑不落"导航栏+页面"俗套）、项目展示、文章/随笔，未来按兴趣加在线小工具/游戏/demo。
- 开发模式：**由 AI 智能体编写与迭代**，用户负责提需求与验收；代码对人类的可读性不作硬指标。
- 审美方向：见 `docs/design/aesthetic-direction.md`（醒梦：磨砂玻璃/半透明、低饱和蓝粉、雾、巨构+留白、"UI 像从画面中浮现"）。
- 版本事实（2026-09-19 核实）：Astro 7.3.3 / Next.js 16.3.5 / Svelte 5.57.1 / Nuxt 4.5.2（Nuxt 3 已于 2026-07-31 EOL）/ Vite 8.3.0 / GSAP 3.15.0（Webflow 收购后全插件免费含商用）/ Three.js r186 / Lenis 1.x。本机 Node v24.14.1。

## 1. 总原则

1. **纯静态、无后端起步**。个人站当前不需要服务器逻辑；评论、统计等需求出现时再加（外部服务或无后端方案）。
2. **内容与交互分层**：文章/项目等内容页默认零 JS（快、稳、SEO 好）；重交互集中在主页与将来的工具"岛"，互不拖累。
3. **动画/3D 层保持框架无关**：GSAP、Lenis、Three.js 以原生方式 import，不绑死在任何 UI 框架上，将来可整体搬迁。
4. **渐进增强 + 尊重系统偏好**：简单动效优先用新原生 CSS 能力；`prefers-reduced-motion`、移动端降级是硬性要求，不是可选项。
5. **（用户约束，2026-09-19）性能克制优先**：网站不得过于消耗性能。
6. **（用户约束，2026-09-19）穿插式 3D**：不做整页单一 3D 场景；3D 以"平面排版中穿插 3D 元素"的方式存在——页面主体是 DOM 排版，3D 元素贴入占位框、随滚动流动、与文字层叠。

## 2. 选型总表

| 层 | 选择 | 说明 |
|---|---|---|
| 站点框架 | **Astro 7**（+ TypeScript） | 内容站框架：构建期输出纯静态 HTML，islands 按需水合 |
| 内容管线 | Astro Content Collections + MDX | 文章/项目 = 仓库里的 Markdown 文件，带类型校验 |
| 样式 | 原生现代 CSS（.astro scoped）+ CSS 变量 design tokens | 高度定制的设计不适合 utility-class 优先；关键：`backdrop-filter`（磨砂）、`mask`、`@property`、scroll-driven animations |
| 动画 | **GSAP 3.15**（ScrollTrigger / SplitText / Flip，全部免费） | 滚动叙事、pin、文字编排动画、编排时间线的事实标准 |
| 平滑滚动 | **Lenis** | 与 ScrollTrigger 有官方标准接法；保留原生滚动语义 |
| 3D | **Three.js r186，vanilla 用法，WebGL2** | 穿插式元素：DOM 占位框 + 3D 贴入；雾（`scene.fog`）、磨砂质感（透明+粗糙度+柔光贴图的平价组合，昂贵的 transmission 慎用） |
| 原生渐进增强 | CSS scroll-driven animations（87% 支持）、View Transitions API（`@view-transition`，Firefox 未至） | 简单视差/reveal 不写 JS；多页过渡一行 CSS |
| 语言 | TypeScript（strict） | 智能体编写场景下显著减少低级错误 |
| 包管理 | npm（本机已装） | 无强烈理由引入 pnpm |
| 部署 | Cloudflare Pages（首选）/ Vercel / GitHub Pages | 全部免费、都支持 Astro 静态输出，可随时更换 |

## 3. 逐项理由

### 3.1 Astro（而不是 Next.js / SvelteKit / 纯 Vite）

- **本项目的三需求恰好对应 Astro 三张牌**：博客（content collections + MDX 是候选中最省事的内容工作流）、性能（内容页默认零 JS）、定制 landing（页面主体就是 HTML/CSS，3D 与动画以原生 script 接入，或包成 `client:visible` 岛屿懒加载）。
- **对智能体迭代友好**：没有 RSC/"use client" 这类心智雷区，改动隔离在单个 `.astro` 文件内（scoped style + 同文件 script），反复修改不易引入全局性回归。
- **官方中文文档**；大版本迭代快（一年约两个 major）是唯一代价，跟着升级指南走即可。
- 对比结论：Next.js 16 对本场景过度复杂（RSC 学习/调试成本、静态导出限制多）；SvelteKit 适合"想学一个运行时框架"的场景，本项目不需要；纯 Vite 零框架但路由/博客/构建全手工，长期是维护负担。**React 不弃用**：将来某个工具/游戏确实需要组件状态管理时，以 Astro 岛屿形式局部引入 React（甚至 React Three Fiber），无需迁移。

### 3.2 GSAP + Lenis（动画与滚动）

- GSAP 自 2025-05 Webflow 收购后**全插件免费（含商用）**：ScrollTrigger（pin/scrub/水平滚动叙事）、SplitText（大标题文字动画）、Flip、MorphSVG 等一套覆盖 80% 需求。
- Lenis 是平滑滚动的事实标准，与 ScrollTrigger 官方五接线法集成；对键盘/锚点/无障碍友好。
- 与"醒梦"UI 原则天然对齐：轻淡入、线条延展、缓慢呼吸、微弱漂浮——全是 GSAP 擅长的编排型动画。

### 3.3 Three.js（vanilla，WebGL2，穿插式元素）

- **架构：DOM 优先、3D 点缀**。页面主体是普通排版；每个 3D 元素对应一个 DOM 占位框，随滚动流动、与文字自由层叠。两种贴入模式按需混用：
  - **共享画布**：全站一个 WebGL 上下文，用 scissor/viewport 把各元素画到各自占位框区域（three.js 官方示例技法），元素多时用；
  - **内嵌小画布**：元素自带小 canvas 嵌入排版（浏览器画布总数有上限，仅少量重点元素用），与 DOM 层叠最自然。
- 质感清单与风格对齐：`scene.fog`（雾）、**玻璃/水晶碎块**用棱面低多边形几何 + 透明/低粗糙度/环境贴图/虹彩（iridescence）的平价组合；**transmission 折射材质昂贵、默认不用**（最多留给一两个主视觉元素）；贴图光晕/CSS 模糊替代全屏 bloom 后处理；低饱和雾蓝/灰粉。环/门/框几何可用但非首选（用户 2026-09-19 补充）。
- **按需渲染是穿插式的核心红利**：IntersectionObserver 检测元素可见性，滚出屏即休眠；静止元素不重画；环境微动效（漂浮/呼吸）限 30fps。
- **WebGPU 暂不用**：2026 年浏览器覆盖与 Three 生态（材质/后处理）未稳，WebGL2 全覆盖且够用；Three 的 WebGPURenderer 以后可平滑切换。
- Spline（无代码 3D）免费版带水印、自托管导出付费，不作为核心；OGL 留作日后极限减重选项。

### 3.4 原生 CSS 为何"够用且更好"

现代 CSS 已具备：`backdrop-filter`（磨砂玻璃 UI 的关键）、CSS 变量（全局色彩系统 = "醒/梦"两套 token 一键切换）、scroll-driven animations（视差/reveal 免 JS）、`@view-transition`（多页过渡）、container queries、`@property`（可动画的自定义属性）。高度定制的艺术向设计里，这些比引入 Tailwind 更直接。

### 3.5 页面独立改版性（用户要求：任何页面可单独用智能体大幅改视觉）

架构规则，建站时即执行，保证"改一页"物理上不波及其他页：

1. **每页自包含**：一个页面 = 一个 `.astro` 文件（scoped style + 本页专属 script 模块，如 `src/scripts/<page>/`）。大幅改版只重写该文件。
2. **Design tokens 全局默认 + 页面级覆盖**：全局 `tokens.css` 定义色彩/字体/间距；任何页面可用局部变量覆盖。整站换肤与单页定制并存。
3. **内容与模板分离**：文章/项目内容 = Markdown/MDX 文件，与视觉完全解耦；页面改版对内容零风险。单篇想换样式用 MDX 覆盖。
4. **共享组件最小化**：仅导航/页脚等天然全站统一物共享；其余一律页内实现。
5. **git 兜底**：大改一律独立分支，验收后合并；改砸可整体回滚。

已知边界（特性而非缺陷）：全局导航/字体/色彩体系改动天然全站生效；文章列表页共用阅读版式（保证 100 篇文章样式统一），单篇定制走 MDX。



## 4. 风格 → 技术映射（速查）

| 醒梦风格要求 | 技术实现 |
|---|---|
| 磨砂玻璃 / 半透明树脂 | CSS `backdrop-filter: blur()`；Three `MeshPhysicalMaterial` transmission/roughness |
| 雾 / 颜色被轻微稀释 | `scene.fog` + 全局低饱和 tokens + 贴图光晕/CSS 模糊层（不用全屏后处理）；CSS 大面积留白与半透明层 |
| 巨构/碎块（玻璃、晶面、门框备选） | Three 棱面低模几何（碎块/棱柱/晶面体）+ DOM 层叠实现前后景穿插 |
| UI"从画面中浮现" | GSAP：opacity/clip 轻淡入、SVG 线条延展（stroke-dashoffset）、缓慢呼吸循环 |
| 醒/梦两种状态渐变 | 全局状态（data-theme）→ CSS tokens 过渡 + 场景雾色/光照参数插值，无硬切换 |
| 大面积留白 + 一个现实锚点 | 版式系统：克制的网格 + 单一高对比元素（也是landing 排版原则） |

## 5. 明确不选 / 暂不选

- **Next.js / React 全家桶**（现阶段）：过重；React 仅作将来局部岛屿选项。
- **Nuxt**：偏全栈应用方向，Nuxt 3 刚 EOL。
- **Spline / 无代码 3D**：水印+付费墙，且失去程序化控制。
- **WebGPU**：等覆盖与生态成熟。
- **Headless CMS / 数据库 / 自建后端**：无需求，Markdown in repo 即内容源。

## 6. 部署说明

- 首选 Cloudflare Pages 免费层（全球 CDN、构建额度充足、自定义域名方便）；Vercel/GitHub Pages 均为一键可换的备选。
- **大陆访问的现实**：无备案的免费托管（CF/Vercel/GH）在大陆速度一般且不稳定。先接受（主要受众为自己+海外访客）；若将来需要大陆稳定访问，再考虑备案+国内 CDN，静态站搬迁成本极低。

## 7. 风险与对策

**性能预算（硬性，对应用户"不得过于消耗性能"的约束）**：
- 内容页零 JS；3D/动画代码全部懒加载（动态 import / `client:visible`），首屏不为 3D 付出任何成本
- 每个穿插式 3D 元素：滚出屏休眠、静止不重画、微动效 ≤30fps、DPR 上限 1.5–1.75
- 材质平价化：默认禁用 transmission 折射与全屏后处理，磨砂用透明+粗糙度+贴图 / CSS 替代
- 移动端降级阶梯：完整 3D → 简化场景 → 静态图；`prefers-reduced-motion` 一律静帧

| 风险 | 对策 |
|---|---|
| 3D 拖垮加载与 Lighthouse | 见上方性能预算；模型 meshopt/Draco 压缩、固定 canvas 尺寸防 CLS |
| 动画引发无障碍/晕动问题 | `gsap.matchMedia()` 响应 `prefers-reduced-motion`；reduced 模式渲染静态帧 |
| 低端移动设备 | 特性检测后降级：轻量场景 / 静态图或短视频回退 |
| Astro 大版本升级 | 锁定次版本，升级照官方指南，改动面小 |
| 交互逻辑独特 → 维护复杂 | 交互动效集中在独立模块（如 `src/scripts/landing/`），与内容页物理隔离 |

## 8. 路线图（建议顺序）

1. **Phase 1｜骨架与内容**：Astro 脚手架、内容集合（文章/项目）、基础版式与色彩 tokens、部署上线（先有"能看的站"）。
2. **Phase 2｜主页 2D 设计**：先出静态视觉稿（排版/层次/留白），用已装的 design skills（frontend-design / design-taste-frontend）审校后切片实现。
3. **Phase 3｜动效与穿插 3D**：GSAP+Lenis 滚动叙事 → 穿插式 3D 元素小样（占位框 + 雾 + 环/门几何 + 平价磨砂质感 + 休眠机制，先验证一个元素跑通，再铺开）→ 与 2D 排版的层叠合成。
4. **Phase 4｜工具/游戏岛**：按兴趣逐个加，互不影响（必要时局部 React 岛屿）。

## 9. 关键来源

- GSAP 免费化：gsap.com/pricing 、 webflow.com/blog/webflow-makes-gsap-100-percent-free
- Astro：docs.astro.build（islands、content collections、GitHub Pages 部署、中文文档）
- Three.js：github.com/mrdoob/three.js/releases（r186；WebGPURenderer 现状）
- Lenis：github.com/darkroomengineering/lenis
- 兼容性：caniuse（animation-timeline 87%）、MDN View Transitions API
- 参考生态：awwwards.com/websites/gsap/ 、tympanus.net/codrops（Astro+GSAP 案例与教程）
