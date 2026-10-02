# Backlog —— 2026-09-21 全站六维审查产出

来源：六个并行子智能体审查（无障碍 / 性能 / SEO / 代码质量 / 视觉响应式 / 脚本健壮性），
基线 HEAD `6c8c9aa`。本轮已修的见文末；此处只收录**未修**项，按处置方式分组。
每条尽量带 位置 / 证据 / 修法，供后续排期或转交直接取用。

---

## 一、转交主页重设计线程（与在飞的首屏重设计强耦合，勿在别处单独修）

1. ~~**P0 · 过夜夜段可读性**~~ **已解决（2026-09-22 夜读性攻坚）**
   - `src/data/night.ts` PALETTE 重校准为 13 站：**每一站 ink/soft 对（7% 洗染后）bg ≥4.5:1**（两洗染态取小，design/.calib-night.cjs 验证）；换面重排为「黄昏 m34→41 熄天开灯、黎明 m388→395 关灯见晨」两个 ~7 分钟窄窗。
   - `src/scripts/night.ts` paletteAt 加**对比度护栏**：插值后 ink/bg < 3.4、soft/bg < 3.0 时沿所在侧推离 bg 亮度（换面瞬间 ink 必经 bg 亮度区，纯插值物理无解）。全夜实测（design/.sweep-night.cjs，140 步 + 六段元素普查）：fg ≥3.28 / soft ≥3.35，窗外整夜 ≥4.5，醒态抽查 fg ≥4.28。
   - **勘误**：前一日「fg-soft 全夜 2.4–2.9」为测量伪影——评估脚本把 `color(srgb …)` 的 gamma 坐标当线性值二次编码，bg 亮度被平方级放大。停靠点级失败（旧 m48 站 2.11、m412 站 1.37 等）是真实的，已随重校准消除。
2. ~~**P0 · GlassChip 白玻璃深夜不可读**~~ **已解决**：夜间分期（n1/n2/n3/rem/waso）玻璃下限抬至 `.80+`（昼夜「白玻深字」策略保留）；chip-meta #6d7681→#4c5560。含玻璃合成的元素级普查通过（此前测量漏算渐变背景，实况好于旧读数）。
   本轮一并修复：主页 vtag 62/38、50/50 → **15/85**；`.note-stamp/.wa-why/.tick-na/.pill-skin.dead small` faint→soft；`.dawn-time/.axis-l` umber→soft（静态 umber 跨暗亮两相必失一头）；`window.__ps` 已 DEV 门控（与 `__fx` 同标准）。
   仍遗留：主页 `.tick-ok` 50/50 与 projects 页 30/70 不一致（两处各自达标，纯一致性问题）；`user-select:none` 决议待记；多时钟并存（rail 时刻 vs 段范围 vs 页脚钟）建议给 rail 时刻加「此刻」标注；ghost 重影标签暗底观感待观察。
3. **主页 `[data-boot]` 无脚本失败兜底**：JS 挂时面纱 6s 自动揭开但首屏元素永久 `opacity:0` = 空页（HEAD `index.astro` 门控样式）。给 `[data-boot]` 补与 BootVeil 兜底同节拍的 CSS keyframes（2026-10-02 起面纱改为碎晶放射：`.bootveil:not(.go)` 3.2s 起淡出）。
4. **300/900 字重下沉**：仅主页使用（标题/巨字），从 BaseLayout 挪进 index 自己 import——字体 P0（见下）的止血配合项。
5. ~~**night 每帧写 root 级 CSS 变量**~~ **已解决（2026-09-22 三段平台）**：`documentElement` 上改继承变量 = 每帧全页 style recalc（实测值变化时 ~5ms/帧、值不变 0.07ms/帧，差 ~70×）。改为三段平台 + 值变才写：全页遍历只剩 2 次写入、空闲 0 次（此前 ~1.3 次/秒）。见附三。
6. **首访揭幕 ≥3.1s 把首个 PV 的 LCP 顶过 2.5s**（boot.ts 两档均不可跳过）：设计决策，可选折中——子页首访走快版 / 允许点击跳过 / 压缩到 ~1.8s。
7. ~~**vtag 判词签对比度**~~ 已解决（见上，15/85）。
8. ~~`index.astro` 的外链 `rel="noopener"` 补 `noreferrer`~~ 已随 347331b 补上。
9. `.sr-only` 目前各自为战（index scoped 一份、404 本轮新加一份）：建议提取进 global.css 供全站复用。
10. **左轨微标签对比度不足（既有，2026-09-22 普查修正后浮出）**：`design/.sweep-night.cjs` 的 C 段原先跳过 `opMul < 0.98` 的元素、且按未合成的不透明度算字色，漏掉了这批半隐小字。按合成后重测：`span.rail-en`（竖排 NIGHTFALL）、`span.meter-label.l1/.l2/.l3`（浅梦/深眠/晨醒刻度）、`span.swap`（轨上分期读数）在 9–10px、不透明度 0.58–0.72 下为 **2.57–4.46:1**（亮面 2.57 最低、夜面 4.21 左右）。修法：抬不透明度下限或改用 `--fg-soft` 实色。同批 `span.ghost`（随笔/晨醒行的日期重影，2.43）是 `aria-hidden` 的刻意重影、与旁边实字同源，按装饰豁免、不建议动。

## 二、被阻塞——等 BaseLayout / index 在飞改动合并后再动

1. **og:image + JSON-LD（SEO P1 两项）**：BaseLayout head 加 `og:image`（需先做一张 1200×630 默认图进 public/og/）、`twitter:card` 升 `summary_large_image`、`og:locale zh_CN`；JSON-LD 最小集 = 主页 `WebSite`+`Person`、文章页 `BlogPosting`。
2. **article:published_time / modified_time**：BaseLayout 加可选 props，文章页传 `date.toISOString()`；content schema 加可选 `updated`。
3. **skip link**：BaseLayout body 首位加 `.sr-only`「跳到正文」。
4. **night.ts 改动态 import**：静态页白载 ~1.5KB gzip/页；`import('../scripts/night')` 或挪进主页自己的 script。
5. **五个 init 无异常隔离**：`initBoot(); initChrome(); initNight(); initMorph(); initReality();` 顺序裸调，任一抛错连坐其后全部——各自 try/catch。
6. ~~**BaseLayout `rail` Props 缺 `readout` 字段**~~ 已随 347331b 补上；`astro check` 现 **0 错误**，deploy.yml 可挂 `npm run check`（见五.1）。
7. **Boot 揭幕期焦点被面纱遮蔽**（WCAG 2.4.11）：进门给 `.page` 设 `inert`，`booted` 后移除（BootVeil + BaseLayout 配合）。
8. **字体 P0 主体——全站共享 CSS 501KB / gzip 211KB，97% 是 @font-face**（409 个声明，Noto Serif SC 4 字重 ×101 子集）：/about 字体实载 ≈805KB、文章页 ≈1MB。治本 = `cn-font-split` 按全站实际用字自切（CSS 可 <50KB gzip）；顺带只输出 woff2 单格式（现 dist 带 397 个冗余 .woff，31MB）。
   - 2026-10-03 复测（主页转正前的性能评估）：新旧主页首帧排版都要 ~250–270ms（核显本机，1440×900@1.5），DOM 只有 470–670 个元素，大头疑为这批阻塞渲染的 CSS（现约 540KB：`400.*.css` 261KB + `BaseLayout.*.css` 278KB）与 CJK 回退排字。是新主页 TBT 仍有 ~350ms 的主要来源；治本后应复测。

## 三、性能 P1/P2（独立可排期）

1. **three.js 527KB（gzip 130KB）为一块装饰玻璃签**：`src/scripts/slip.ts:8` `import *` 拖进大半个核心，实际只用 7 个类。改 `three/webgl` 副入口 + `three.core`，或裸 WebGL 仿写（~200 行）。注意：若重设计弃用 slip 则本条作废。
2. ~~**Eeg 全站常驻 30fps rAF 重绘全视口 SVG**~~ 已改（2026-09-28，见附五）：绘制搬进 Worker 里的 OffscreenCanvas，主线程零帧；「预生成 path + translateX」不可行——两层正弦相速度不同（≈497 / 578 px/s），合起来不是刚体平移。
3. ~~`chrome.ts` anchorLoop 每帧写 `left`~~ 已改（2026-09-28，见附五）：游走交给 CSS（三层嵌套正弦），JS 只剩换站滑行、落定即停，且写 `translate` 不写 `left`。
4. `three-common.ts:70` 的 900ms 轮询 `setInterval` 永不清理（makeLoop 无停止路径）。
5. **字重策略收敛**：文章正文请求 400 只载 500（隐性匹配、多下一套 CJK 子集）；`projects/[slug]` 请求 700 匹配到 900；SiteHeader/StitchHeader 的 mono 用 500/600 但只载 IBM Plex Mono 400（伪粗体）。终态建议全站 2 个字重 + 补 `@fontsource/ibm-plex-mono/500.css`。
6. 回退字体 `size-adjust/ascent-override` 调参（低优先）。
7. **BaseLayout 初始化里一次 ~78ms 的强制排版**（2026-10-03，/new/ 加载期 trace：`Layout` 栈顶在 BaseLayout 脚本、经 `lib.ts` 的一个函数；旧主页对应一次 ~45ms 的样式重算）。全站每页都付。查法：`npm run build` 时关掉压缩（或 dev 下）重抓带栈的 trace，定位是哪个 init 在首帧前读布局，改成放进 rAF / 读缓存值。
8. **新主页中段偶发的首次显影卡顿**（2026-10-03）：滚到第 2 幕（造物，scrollY≈2900）时偶尔出一帧 ~180ms，trace 里是 GPU 主线程上一次 116ms 的 `RendererRasterWorker` 光栅化 —— 该幕玻璃板（`filter: blur` 随 `--p` 变化、晶板窗里的 SVG 百合带 14px 模糊）首次进入视口时的一次性成本，两次实测只出现一次。可试：给 `.slab .win svg` 预先 `will-change: filter` 或在接近该幕时提前显影；滚动时 `--p` 驱动的 `filter: blur()` 改为只动 opacity（模糊做成静态两层交叉淡化）。
9. **线景地形 Worker 的几何仍在 JS 里逐帧算**（每帧 ~4–5ms、7–8k 点；2560 宽 ~7.7ms）：已不占主线程也不占 GPU 主线程（2026-10-03 起由 WebGL2 画，见 `home-linescape-gl.ts`），属低优先。要再省可把波形 / 地势 / 透视搬进顶点着色器（骨架折线放进一张小纹理），每帧只传 uniform。
10. **测量口径备忘**：同一套脚本里旧主页的 longtask 观察器没记到它自己那次 ~250ms 首帧排版（TBT 读数 0），而新主页记到了 —— 两页 TBT 数字不可直接比，比首帧排版的 trace 时长更可靠。复测脚本：`design/.perf-home.cjs`。

## 四、SEO / 内容（独立可排期）

1. RSS 仅摘要：`rss.xml.js` 加全文输出（Astro 7 `experimental.content` 容器方案，或最简 `item.content = article.body`）。
2. sitemap 无 lastmod：`sitemap({ serialize })` 用集合 `date` 生成。
3. 面包屑 + BreadcrumbList（文章/项目详情页，与 JSON-LD 一起做）。
4. `description` 可选的静默回退陷阱：schema 改必填（推荐），或详情/列表页给带标题的生成式回退。
5. 主页 title 过短无定位词（`Traveritas` → 如 `Traveritas — 在醒与梦之间 · 随笔与项目`）。
6. 404 的 canonical/og:url 指向不存在的 `/404/`：传标志省略或输出 noindex。
7. 未来日期无过滤（静态站无定时发布）：writing.md 写明用 draft 控制。

## 五、工程与仓库卫生（独立可排期）

1. **deploy.yml 加固**：permissions 下沉 job 级最小化；三个 action pin 提交 SHA；加 `concurrency: group: pages, cancel-in-progress: true`；`npm run check` 挂进 build 前（等 backlog 二.6 完成后）。
2. **跑一次 `npm audit`**（本轮禁装网络验证）。
3. 死代码：`ShardMark.astro` 整组件无引用；`content.config.ts` 的 `cover` 字段无任何模板渲染（顺带清 picsum 外链依赖）；index `data-faces` 三面文案死特性；`global.css` `.morph` 规则无元素挂载；`articles/[slug].astro:7-8` 顶层 SEG_FROM/TO 是被遮蔽的死常量。
4. 重复实现抽公共模块：`countChars`/`fmt`/`cn`/`pinsOf` 在 4 个页面文件间复制，`SEG_FROM/SEG_TO` 三处魔数——集中到 `src/lib/` 或 night 数据导出。
5. `morph.ts` 顶层 `setInterval(clockTick, 5000)` 挪进 `initMorph`；`ambientTick` 里 `driftTo` 三元两支等价可简化；`reality.ts` RM 偏好模块期固化（`const RM = reducedMotion()`）。
6. `rss.xml.js` 改 `.ts` + `APIContext` 标注；`src/scripts/night.ts` 与 `src/data/night.ts` 同名易混（建议前者改 `overnight.ts`）。
7. slug/标签 schema 校验：`tags` 加 `regex(/^[^/\s]+$/)`；frontmatter 链接 `links/related.href` 加 `^https?:|^/` refine（zod `.url()` 放行 `javascript:`）。
8. 仓库清理（建议删除）：根目录 `dom-dbg.html`、`landingpage_swarm*.md`×6、`swarm5.md`、`pages-swarm.md`（~150KB 过程稿）；`design/mocks/.shots$1.png`/`.shots$name.png`（历史 shell 变量未展开的字面量文件，需 `git rm --cached`）。
9. 仓库清理（建议归档）：两份入库的 `three.min.js`（mock/vendor 与 archive/vendor，1.2MB）；`design/index-shots/` 1.86MB 截图；design 下 ~40 个一次性 `.serve-/.probe-/.cdp-/.shot-*.cjs`（.gitignore 可补 `design/**/.{serve,shot,probe,cdp,verify,hold}-*.cjs` 模式，否则下轮还会再进一批）。
10. 文档脱节：README 目录结构缺 `src/scripts/`、`src/data/`、`src/markdown/`、tokens.css；README「Agent Skills」一段整段重复粘贴；`docs/writing.md` 的 `src/remark/twilight.mjs（remark-directive 挂入）` 应为 `src/markdown/twilight.mjs`（Sätteri features.directive 挂入）。
11. 可选：`<meta http-equiv="Content-Security-Policy">` 严档（本站无外链脚本/字体，是少数能上 `default-src 'self'` 的站）。

## 六、视觉打磨（P2，视觉审查实测数据）

1. h1 字号两套 clamp 中档发散：`prose-head` `clamp(1.5rem,4vw,2.05rem)` vs `page-head` `clamp(1.5rem,3.5vw,2rem)`，768 档差 ~4px——统一或写明设计决议。
2. 触控目标：nav 链接 43×32、tag chips ≈24.5px 踩线——padding 加一档（`.site-nav a` padding-block 0.3→0.55rem）。
3. 标签页仍用旧款 `.ledger`，与随笔页 `essay-ledger` 两代方言并存——降配复用或记录「结页从简」。
4. 页脚钟无 JS 停 `--:--`：SSR 写死构建时刻或保持现状（诚实显示）皆可，需拍板。
5. 404 无 Rail 仪表（全站唯一断档）：补 `rail={{ station: '失线 · 断口' }}` 或明确记录有意免轨。
6. 390 档正文 18.7–21.4 字/行（理想 30–45）：≤640px 字号再放大半档。手机物理宽度所限，非破相。
7. （记录）子页进页自动滚过页头、滚动条整站隐藏——均为既定决议，观察使用反馈即可。
8. 内页正文排版已分层为「公共层 + 随笔/项目两个变体」（`global.css`「内容页排版」一节，地图见 `docs/design/content-typography.md`）。`h3` / `ol` / `table` / `figure` 尚未设计；两态块边距 1.5em vs 1.35em、列宽随笔 629px vs 项目 544px 待拍板。

## 七、验证欠账

- 全部性能结论为实验室级（无 CrUX/RUM）；上线 `web-vitals` 一方 RUM 后复验字体 P0 与 LCP。
- GitHub Pages 实际 Cache-Control / br 支持未线上验证（平台不可自定义头，已知限制）。
- 真实屏幕阅读器（NVDA/VoiceOver）未实测；200% 缩放、Windows 高对比度模式未测。

## 八、样式预览页（/styleguide/）首轮浮现（2026-09-25）

新建 `/styleguide/` 把共用样式摊开后，头一次被摆到台面上的几件事：

1. ~~**代码块是深色的**~~ **已解决（2026-09-25）**：原先 `<pre>` 由 Shiki 的 `github-dark` 上色，
   元素上带 `style="background-color:#24292e;color:#e1e4e8"`，行内样式盖掉 `.prose pre` 的底。
   现改为自写主题 `src/markdown/shiki-theme.mjs`：`editor.background` 写成与 `.md pre` 同一条
   `color-mix(in srgb, var(--fg) 4%, transparent)`。**不能写 `transparent`** —— 主题的值是
   **行内**样式，永远压过样式表，写 `transparent` 只会把代码块的底抹掉，而不是「交回 CSS」，
   所以两边必须同值。token 颜色写成 `var(--umber)` / `var(--ghost-ink)` / `var(--fg-soft)`
   这类字符串 —— Shiki 原样写进行内样式，于是代码配色跟着醒梦两态与夜色走。
   实测 `dist/styleguide/index.html` 里 `#24292e` 出现 0 次、
   `<pre>` 的行内底为 `color-mix(in srgb, var(--fg) 4%, transparent)`、`const` → `var(--umber)`、
   类型 `number` → `var(--ghost-ink)`。琥珀在代码里一次都不出现（数字与运算符回到中性 `--fg`）。
2. **页面专属块进不了预览**（Astro `<style>` 作用域隔离）：`.essay-ledger` / `.prj-ledger` /
   `.coverband` / `.wake-card` / `.link-list` / `.signal-list` / `.pill` / `.wake-anchor` /
   `.lost` / 首页千层纸，眼下只能给实物入口。要进预览得先抽成组件或挪进公共表，
   两条路与各自代价写在 `docs/design/styleguide.md` 第五节 —— 需要一次拍板。
   预览页第六节那张索引表就是这条的临时答案。
3. **三处注释与实现脱节**（本轮顺带发现，均无功能影响）：
   - `styles/tokens.css:49` 说 `--echo` 由 `chrome.ts` 按滚动更新——`chrome.ts` 里已无此逻辑，
     全站没有脚本写 `--echo`，它现在恒为 0（预览页给它配了一支滑杆，这条机制才看得见）；
   - `data/night.ts:65` 提到 `components/chrome/NightVeil.astro`——该组件不存在；
     同文件的 `ZONES` 也没有消费方；
   - `scripts/chrome.ts:2` 的头部注释仍写「叠影 --echo」。
4. **同一个块两页各写一份的老问题仍在**：`.tick` 在 `index.astro`（0.66rem）与
   `projects/index.astro`（0.64rem）各定义一次；`.vtag` 在 `index.astro`（0.58rem）与
   `about.astro`（0.62rem）各定义一次，配色配比也不同。抽组件时一并收敛。
5. **预览页自身的维护点**：新增可预览样式要同时更新 `src/pages/styleguide.astro`
   与（正文层）`src/styleguide/specimens/*.md`；第 2 条未决前，专属块索引表也得手动补行。
6. ~~**列表记号不分 ul / ol**~~ **已解决（2026-09-25）**：随笔的 14° 刻度与项目的 mono ○ 原先写在
   `.md li::before` 上，`ol` 一被用上就会「原生数字 + 记号」同场，且记号相对 `li` 定位
   （`li` 从原生序号之后才起）⇒ 琥珀刻度压在每项首字上。现全部收窄成 `ul > li::before`，
   施工清单同步改成 `ul > li:has(input)`。证据（前 / 后）：`design/.shots-p19/19-legacy-ol.png`
   与 3× 裁片 `zb4-li-essay-legacy.png`（刻度压在「先／再／最」上）对 `zb5-li-essay-fixed.png`。
   经过见 `design/mocks/p19-notes.md`。
7. ~~**行内 code 漏到 `pre > code`**~~ **已解决（2026-09-25）**：行内规则全部改写成
   `:not(pre) > code`（公共层 + 两个变体层），底与字号不再漏进 `pre`（原先项目侧每行多一条底带、
   随笔侧字号被二次缩到 `.71em`）。证据：`design/.shots-p19/20-legacy-code.png` 对 `z10-code-project.png`。
8. **正文元素补齐：已裁决并落地（2026-09-25）**。裁决与落地映射见 `design/mocks/p19-notes.md` 首节：
   `ol` 取 B（保留原生序号 + mono）、`table` / `figure` / `code` 取 A，
   **图注不自动编号**（内容由正文自己写），`h3` 与小节序号**本体不做**、留给自制的「小节」组件。
   三处例外也已裁决（同日）：引文**保持两页同款**（不加差别，仅改正误记）、两态块边距项目侧改为 1.3em、
   起笔标尺**不做**（随笔页原有那枚已移除）。见 `docs/design/content-typography.md` 第三节。
9. ~~**小节序号（h2）**~~ **已解决（2026-09-25）**：「小节」组件的第一层落地，形制取
   **定格漂浮**——醒与梦**共用同一套字**（序号吃标题自己的字，不另起字体），两面只差动与不动：
   醒面零位移，梦面每枚数字按 1px 整像素阶跃定格漂浮（与品牌字标同一条曲线）。由
   `src/markdown/ordinal.mjs` 在构建期注入（把数字拆成一枚一个 span），内容页仍然零客户端 JS。
   原先的 `content: counter(sec, cjk-ideographic)`（汉字序号）一并退役。**仍空着**：`h3` 那一层的记号。
   证据：`design/.shot-ordinal.cjs`（31 条断言：醒面动画常驻而位移为零、梦面逐枚错相、波峰浮到 −3px、
   两面之间占位与标题文字起点逐像素相同、序号与 h2 同字、无 JS ＝ 醒面）+ `design/.shots-ordinal/*.png`。
   经过与四条踩坑见 `docs/design/content-typography.md` 第二、五节（含「做过又撤掉的点阵显影一版」）。
   同日追加：动画改为**常驻**、振幅乘 `--still`，换面时不再有一下骤停（原写法是按面开关动画，
   长按一激活整族从当前档位一步拽回基线，实测随笔页 109 帧停在「动画已被摘掉」、最大一帧跳 3px）。
   品牌字标与正文 `((浮起))` 同改；构块场 `.fld-sq` 160 枚量级不同，仍按面开关。
   对照脚本 `design/.probe-float-ramp.cjs`，见同节「定格漂浮族 · 换面的连续性」。
10. **`<caption>` 与 `figure` 的来源**：两者的样式都已就位，但 markdown 出不了这几个标签，
   只有正文里写原始 HTML 才吃到。若希望纯 markdown 也能出图注，得给 Sätteri 加一个小插件
   （把图片的 title 升为 figcaption）——做法与取舍见 `p19-notes.md`。

---

## 附：本轮已修清单（2026-09-21，全部经数值验证或活体验证）

- `night.ts`：`data-stage` 小写化——「分期呼吸」特性自上线以来从未生效（'N3' vs 'n3'）
- `reality.ts`：空格手势改 **Shift＋空格**（裸空格还给滚屏，三份报告独立确认的键盘劫持）；`__fx` 调试接口包 `import.meta.env.DEV`；ACCENT umber 梦端/醒端更新为达标值
- `global.css`：焦点环 `var(--amber)` → `currentColor`（原浅底 1.8–1.9:1，键盘用户找不到焦点）；全站文字用途 `--fg-faint` → `--fg-soft`（faint 令牌保留给主页夜色系统处置）
- `tokens.css`：`--umber` #8a6a4f → **#765640**（浅底全档 4.9–5.6:1）
- `reality.ts` 醒面闩锁 umber 端点 #77828c → **#556270**（暖渐变底最差 4.62:1）
- `projects/index.astro`：状态签/核验列 color-mix 配比 55/45→**30/70**、62/38→**35/65**（全档 ≥5.3:1）
- `articles/[slug]` + `projects/[slug]`：**markdown 正文 scoped 样式整体未生效修复**——`<Content/>` 包 `.md` 容器 + 全部选择器 `:global()` 化（文章链接色/针脚列表/任务清单勾选/引言漂移此前全是浏览器默认样式）
- `morph.ts`：时钟 `aria-label` 随 `clockTick` 更新（读屏不再恒读「当前时刻」）
- `404.astro`：补 sr-only h1（.lost-line 带 data-morph 会乱码，不能当 h1）
- 外链 `rel="noopener noreferrer"`：about ×2、projects/[slug] ×1（主页 1 处转交）
- `scripts/new-article.mjs`：frontmatter title 加引号转义（含冒号标题不再产出非法 YAML）
- `.gitignore`：`.env`/`.env.production` → `.env*`（补 .env.local 等常见秘密文件名）
- `package.json`：显式声明幻影依赖 `@astrojs/markdown-satteri@0.4.1`；新增 `check` 脚本 + `typescript@6.0.3`/`@astrojs/check@0.9.10` devDeps（此前全链路零类型检查，且有过 0f6a004 运行时事故）

## 附二：2026-09-22 夜读性攻坚（全部经 .calib-night.cjs 数学验证 + .sweep-night.cjs 活体复验）

- `src/data/night.ts`：PALETTE 14→13 站逐对校准（每站 ink/soft ≥4.5，梦/醒两洗染态）；黄昏/黎明换面各压成 ~7 分钟窄窗
- `src/scripts/night.ts`：paletteAt 改 RGB 数组插值＋**对比度护栏**（ink 3.4 / soft 3.0，沿所在侧推离 bg）；顺带修掉 hexLerp 依赖
- `src/pages/index.astro`：faint→soft ×4（note-stamp/wa-why/tick-na/pill-dead-small）、dawn-time umber→soft、vtag 15/85 ×2、夜间分期玻璃下限 .80+
- `src/components/home/GlassChip.astro`：chip-meta 加深 #6d7681→#4c5560
- `src/components/home/StitchHeader.astro`：axis-l umber→soft（静态 umber 跨暗亮两相必失一头）
- `src/scripts/paperstack.ts`：`__ps` 调试抓手 DEV 门控（与 `__fx` 同标准）
- 工具沉淀：`design/.calib-night.cjs`（色板纯数学扫描，含护栏模拟）、`design/.sweep-night.cjs`（CDP 活体全夜 token+元素普查，含渐变/洗染/面纱合成）——后续改色板请跑这两个

## 附三：2026-09-22 过夜三段平台（用户裁定：连续渐变既难受又每帧写 token）

**动因**（实测，1440×804，全页 4801px/5.97 屏）：原设计并非均匀渐变——m100→330 那 2.75 屏本就是同一颜色；真正在动的是 3 条漂移带（昼→暮 679px、夜蓝渐深 743px、黎明 926px）＋ 2 次仅 0.1 屏的换面闪（熄灯 88px、开灯 70px），而换面窗里正文正被护栏按在 3.4:1 / 3.0:1 的地板上。即「该定住的地方在慢慢动、该是一次事件的地方却一闪」。

**改法**：三段平台 + 两次淡变换面。
- `src/data/night.ts`：`PALETTE`（13 站）→ `ZONES`（light `#e9ecef/#262c33/#59626c`、deep `#171b24/#e5e0d2/#b9b3a4`、paper `#efe9dd/#55503f/#665f50`，三组都取自上一轮已校准 ≥4.5 的站点，含 `--line`）+ `ZONE_HYSTERESIS = 120`。**边界（终选值）**：熄灯＝`ns-essays` 段顶到视口 **38%**（`vh: 0.38`，y≈498）；见晨＝`ns-dawn` 段顶到视口 **50%**（`vh: 0.5`，y≈3875，即站点自己的段锚点／StitchHeader 所在）。`enter.vh` 正值＝还没进场、负值＝段顶已越过视口顶端（也曾用过 -0.12，即「上一屏彻底离场才换」，后按用户「提前约半屏」改回正值）。
  **段位（用户二次裁定）**：光面＝首屏入夜·初刻的**上半程**；夜面＝首屏下半程 → 浅梦·随笔 → 深眠·项目 → 异相·试验场；纸面＝晨醒·关于的**后半程**。原先把随笔留在光面（理由是「浅梦段标题写着 LIGHT」），用户改为随笔归夜面；随后又按用户要求把熄灯提前约半屏、见晨滞后约 1/3 屏，于是**首屏与关于段各自横跨两段**。
  **由此带出的必改项**：首屏被看见两程后，手记纸 `color-mix(--bg 65%, #f7f7f7)` 在夜面下混成中灰 #656565，纸上的字只剩 4.42:1（`--fg`）／2.79:1（`--fg-soft` 的 `.f2/.f3`）——观感发虚。已加 `:global(body[data-zone='deep']) .note-paper { background: color-mix(in srgb, var(--bg) 82%, #f7f7f7) }`（夜面下纸贴着夜底）：实测纸色 #3f434a，ink 7.54:1、soft 4.75:1、醒/梦巨字 10.43/6.95，四张纸的明暗层次也保住。另：随笔段的玻璃片走 n1/n2 分期，而「白玻增实」本就是为夜底设计的，归夜面后反而对口。
- `src/scripts/night.ts`：`paletteAt` 插值＋护栏退役，改 `zoneAt(y, cur)`（越触发点 +1，回撤需退出 120px 死区）+ **值变才写**（zone/stage/时钟/轨道点全部比对后才落 DOM）。首帧先瞬时落色、下一帧才挂 `.night-fade`，避免刷新在页中段先闪昼面。
- `src/styles/tokens.css`：`@property` 注册 `--bg/--fg/--fg-soft/--line` 为可动画颜色 + `html.night-fade` 0.35s 淡变（RM 下 `transition: none` 硬切）。**注意**：这三段之外的旧「阶段式」尝试（c0d3742/e57685a/f96431f）失败在锚站太多（13→8 站）＋逐站 0.3s 淡变 = 读起来像加速渐变；本次只换两次，淡变才成立。
  **追补（同日，卡顿取证后）**：上述 `@property` 淡变**已退役**——它本身就是「每帧写 root 颜色变量」，0.35s 里约 21 帧全文档重算＋整视口重绘（玻璃片的 backdrop-filter 每帧重新取样），正是滚动卡顿的同一根因（见附四）。改为**全屏幕布下瞬时换色**：`components/chrome/NightVeil.astro`（`position: fixed` z190，放在 `.page` 外，只动 opacity 的合成器动画）+ `night.ts` 的 `changeZone()` 在「全遮」那一拍（130ms）里写一次四色。实测每次换面 root 底色**只变化 1 帧、无中间色**（此前约 21 帧），且没有「bg 与 ink 亮度交错」的过渡态——A 段普查自此零低值带。
- 实测验收：全页遍历 `--bg` 写入 **2 次**（改前近乎每帧）、空闲 6s **0 次**（改前 ~1.3 次/秒）；RM 采样确认瞬时硬切；滞回 1590→深 / 1450→深 / 1390→浅。`design/.sweep-night.cjs`：换面两侧静稳态 fg 10.88/12.43/6.11、soft 4.78/7.84/4.79，六段元素普查全部达标。（换面过渡态的可读性结论已被附四推翻——淡变退役后 A 段零低值带。）
- 工具同步：`design/.calib-night.cjs` 改为**三段平台校验**（退役连续路径扫描与护栏模拟）；`design/.sweep-night.cjs` 的 B 段改为**换面两侧静稳态**（原「换面窗中点护栏点」已随机制退役），B 段的换面边界改为**从 `ZONES` 解析**（原先手抄 `ns-projects`/0.85，边界一挪就指错地方）；新增普查槽位「首屏腰·暗面」（首屏从此横跨两段）。另修掉 C 段一个**诚实性缺口**：原先 `opMul < 0.98` 的元素被整片跳过、且字色未按不透明度合成，半隐小字因此被高估——改为 `over()` 合成后判（跳过阈值降到 0.15），由此浮出一批既有问题（见一.10）。

## 附四：2026-09-22 换面卡顿取证与幕布改法（同一个根因的残余量）

**结论**：换色时的卡顿与 `sess_76adeeec` 那次滚动卡顿**是同一个问题**——只要 root 上的颜色变量一变，就是全文档样式重算＋整视口重绘；那次会话的 A/B（屏蔽 4 个变量：200% 压力下坏帧 12→2、p95 13ms→8ms）已把它钉死，且证明重灾区正是 y600–3000（首屏跨界带＋随笔段）：那里在屏的是最贵的内容——三张 `backdrop-filter: blur(13px)` 玻璃片、两张 drop-shadow 纸、72vmin 模糊幽灵字。

**残余量的来源**：三段平台把「每滚动帧写」降成「每次换面写 2 次」，但当时选的**淡变本身就是每帧改 root 变量**——0.35s ≈ 21 帧全文档重算＋整视口重绘，成本只是从「整段滚动」压缩到「两次换面」，所以用户感觉「换色时卡」。

**改法**：全屏幕布下瞬时换色。
- 新增 `src/components/chrome/NightVeil.astro`（`position: fixed; inset: 0; z-index: 190`；`background: color-mix(in srgb, var(--nv) 93%, var(--wash))` 与 body 底色同源，揭开不跳色；放在 `.page` 之外——微沉会给 `.page` 加 transform 并劫持 fixed 后代）。层序 bootveil 200 > nightveil 190 > rail 50。只动 `opacity`（0%→26% 盖住 →58% 起揭开 →100%，共 0.34s），是合成器动画，主线程零成本。
- `src/scripts/night.ts`：`applyZone()`（写四色）＋**一幕一次**的换面状态机 `requestZone()`/`startBlink()`：盖住 → **读到幕布真到 opacity 1** 才落色 → **等新色真画出来**（连两帧 rAF）→ 揭开 → 幕布演出中改主意只记 `wantZone`，绝不改幕布色、不瞬时落色，由上一幕结束时接续演下一幕；首帧与 RM 走瞬时分支。
  **修 A（用户报「触控板从 deep 上滑到 light 会先变亮→再变暗→瞬间变亮」，第一轮）**：旧版 `changeZone()` 里有一条「检测到幕布正在演 → 改幕布颜色 + 清除待落色 + 瞬时落色」的快速通道，本意是处理「快速连跨两处」，但它正好能造出三段式：幕布已以**亮**色盖住（先变亮）→ 该通道把幕布色改成**暗**并瞬时落暗色（再变暗）→ 再一次跨越命中同一通道、瞬时落亮色（瞬间变亮）。触控板能连续回穿 120px 滞回死区（滚轮一跳 ~100px、不易回穿），所以只有触控板复现。已删掉该通道，改为「一次只演一幕」。
  **修 B（用户复现仍未消，且「窗口小一些就不发生、与负载有关」）**：用户贴在真机记录的时序暴露了真因——不是二次跨越（触发器全程恒定、`--bg` 只有两次落色），而是**时序竞态**：旧版靠**定时器猜**（130ms 落色 / 380ms 揭开），而负载重时帧间隔会拉到 50–200ms，于是「落色后新一屏的重绘」可能还没画出来，幕布却已按真实时间淡完 → 幕布先透明、屏上还是旧色（再变暗），新帧到齐才补上（瞬间变亮）。窗口小 = 重绘便宜 = 追得上，所以小窗口不复现。改为**观测替代猜测**：①落色前轮询计算值直到 `opacity ≥ 0.995`（600ms 兜底）；②落色后连等两帧 rAF；③揭开时长按实测帧间隔 ×6 自适应（260–560ms 夹取，写入 `--reveal`）。生产构建实测（`npm run preview`）：**落色那一刻幕布透明度恒为 1.000**（1× 与 8× 负载各 6 次）；揭开时长 1× 为 0.26s、8× 拉到 0.56s（自适应生效）；盖住→落色 1× 142ms、8× 259ms。**排查坑**：这些结论一度被 dev server 的**组件样式模块缓存**带偏（浏览器拿到旧版 `NightVeil.astro` 的 CSS，`.cover` 规则不存在，读数恒 0），改在 `npm run preview` 上验才准——改组件 `<style>` 后请重启 dev server。
- 另修：重测（`resize`/`load`/`fonts.ready`/1.2s/3s 五个入口）改走 `measureSoon()`——**滚动中挂起，滚停 200ms 后再测**。触发点按滚动像素存，若在滚动途中重测而段界恰有挪动，读者会看到一次「无故换面」（触控板连续滚动里尤其明显）。
- `src/styles/tokens.css`：`@property` 注册与 `html.night-fade` 全部退役（不再需要可动画 token）。
- 实测：每次换面 root 底色**只变化 1 帧、无中间色**（此前 ~21 帧）；全页遍历写入 3 次（含测试序列里的回撤换面）、空闲 6s 0 次；滞回与静稳态对比度不回退；`astro check` 0 error、`npm run build` 15 页通过；`design/.sweep-night.cjs` A 段自此**零低值带**（过渡态消失，顺带消除了「半途谁也读不清」）。
- 未动（另案）：`chrome.ts` 的 `--echo` 仍每滚动帧写一次（值随滚动连续变，去重只在空闲时有效），以及它写 `hairline.style.width` 后再读 `getBoundingClientRect` 的强制同步布局——旧会话已记为次因，量级远小于换色那一项。（2026-09-28：发丝线已改写 `transform: scaleX()`，不再进布局，见附五。）

## 附五：2026-09-28 低端机「进页卡顿」——稳态主线程被环境动效占满

**现象**：低端设备进页后持续卡顿。CPU 4× 节流（`Emulation.setCPUThrottlingRate`）下，改前**所有页面**进页 9–13s 的稳态主线程占用都是 99–100%，首页稳态长任务 49 个 / 4s。

**根因（一条链）**：Blink 每跑一个**主线程帧**，都要为页面上**每一个正在运行的 CSS 动画元素**重算一次样式——哪怕这些动画本身已交给合成器。构块场有 160 块浮动方块，加上漂移、字标等，每帧 ~375 个元素、桌面 ~2.4ms，再加 ~200 个合成层的分层提交。而改前每一帧都有主线程帧，驱动源有三类：
1. **主线程 CSS 动画**（只要有一条在跑，就每 vsync 出一帧）：字标 `brand-char` 的 `color`、缝线锚点与引导点的 `box-shadow` 呼吸、Eeg 三道残影的 SVG `transform`、光标 `star-twinkle`（SVG；**触屏上光标根本不显示也在跑**）、正文逐字浮起 `float-ch` 的 `color`（默认 tint 0%，颜色其实不变）。
2. **常驻 rAF**：`chrome.ts` anchorLoop（60fps 写 `left`，文章页锚点 `display:none` 也照跑）、Eeg（「每帧请求 rAF + 33ms 早退」——请求 rAF 本身就逼出主线程帧，早退省不掉）。
3. **静置空跑的兜底轮询**：`onScrollRaf` 每 ~0.7s 无条件执行一次回调，回调里的 `getBoundingClientRect` 强制同步刷新（每次都连带重算全部动画元素）。

隔离验证：160 块可合成方块单独跑 = 0 次重算；旁边加一个字的 `color` 动画 = 2s 内 481 次重算。

**改法**（视觉不变）：
- 主线程动画全部改成只动 `opacity` / `translate` 的写法：`box-shadow` 呼吸 → 谷值/峰值两层光晕交叉淡变（`Seam.astro`、`RealityGuide.astro`）；字标与 `float-ch` 的琥珀灼点 → 叠一层琥珀色同字副本（`::after`，`content: attr(data-ch)`）只动 opacity，srgb 里与原 `color-mix` 同式；`float-ch` 只在写了 `tint` 的段落才挂副本（`twilight.mjs` 输出 `.float-run--tint` / `data-ch` / `--float-tint-a`）；光标自转与微烁只在 `html.fx-cursor-on` 下声明。
- Eeg：算法抽到 `src/scripts/eeg-wave.ts`（只产出路径字符串），首选 `src/scripts/eeg-worker.ts` 在 OffscreenCanvas 上用 `Path2D` 描同一串，主线程零帧；不支持时回退主线程 SVG（由 `lib.ts` 的 `onFrame30` 共享帧钟驱动，24ms + rAF ≈ 30fps）。残影的两种游走由 CSS 动画挪进路径的 `dy`。⚠ 线宽/不透明度/虚线在 Worker 里有一份照抄（`MAIN_STYLE` / `ECHO_STYLE`），改 CSS 要两处一起改。
- 缝线锚点：游走 = 三层嵌套 `.seam-wander`，各一条 easeInOutSine 往返（＝一条余弦），时长/负延迟按原式 ω、φ 换算，振幅乘 `--still`；JS 只剩换站滑行、落定退订帧钟。
- 构块场方块：8 个 `--sq-*` 变量驱动的一条 keyframes → 生成器烘焙的 16 条字面值 keyframes（`SQ_TIERS`），每块内联 `animation`，醒面/长按由 `!important` 摘掉动画名。单次重算实测约快一倍。
- `onScrollRaf` 兜底轮询只在「有事件排着、400ms 未被 rAF 消化」时执行；发丝线写 `scaleX` 不写 `width`。

**实测**（CPU 4×，3 次中位，稳态 = 进页 9–13s；`entry` = 0–7s）：

| 页面 | 稳态主线程占用 | 稳态长任务 | 进页长任务 |
| --- | --- | --- | --- |
| 首页 | 99% → 15% | 49 → 1 | 48 → 31 |
| 关于 | 99% → 14% | 3 → 0 | 19 → 11 |
| 文章 hello-xingmeng | 99% → 9% | 0 → 0 | 6 → 4 |
| 闪念（含 `{{流光}}`） | 99% → 98%（流光改后 → 3%） | 2 → 0 | 5 → 4 |

**剩余（另案）**：
1. ~~**`{{流光}}`（`.sheen-run`）仍是主线程动画**~~ 已改（同日）：构建期拆字、逐字琥珀副本只动 opacity（曲线见 `src/markdown/sheen-timing.mjs`），闪念页稳态 99% → 3%、样张页 99% → 14%、`building-with-agents` 99% → 7%。原记录：（`background-position`），用到它的页面（闪念、样张、`building-with-agents` 的那一段）稳态仍满载。难点是它支持跨行折行、每行各取一截渐变，改成可合成写法（遮罩窗 + 反向平移）会丢掉这一点。可选：进出视口才挂动画（IntersectionObserver），或接受。
2. **进页首个 Layout 很贵**（4× 下 ~800ms）：主体是 Windows 上中文系统回退字体按字重逐一初始化（最小页面实验：同一段中文，1 个字重 47ms、4 个字重 170–210ms；字体栈长短只占两成）。与二.8、三.5 的字重收敛是同一件事。
3. 测法：别往页面里注 rAF 循环测帧率——注入本身就逼出主线程帧，会把「减少主线程帧」的收益整个盖住；读 trace 即可。
