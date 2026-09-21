# Backlog —— 2026-09-21 全站六维审查产出

来源：六个并行子智能体审查（无障碍 / 性能 / SEO / 代码质量 / 视觉响应式 / 脚本健壮性），
基线 HEAD `6c8c9aa`。本轮已修的见文末；此处只收录**未修**项，按处置方式分组。
每条尽量带 位置 / 证据 / 修法，供后续排期或转交直接取用。

---

## 一、转交主页重设计线程（与在飞的首屏重设计强耦合，勿在别处单独修）

1. **P0 · 过夜夜段可读性（未解决，2026-09-22 生产构建实测）**
   `src/scripts/night.ts`（paletteAt/hexLerp）+ `src/data/night.ts`（PALETTE 停靠点）。
   生产实测（4399 构建产物，梦态 26 停靠点全夜扫描）：
   - 主文（fg）在 05:36–05:54 段跌至 **1.67–1.84:1**（黎明交叉带仍在）；
   - **fg-soft 全夜 2.4–2.9:1**（01:12–03:38 恒 2.88 平台）——比审查模型预测的更广；
   - vtag 判签 1.1–4.3；GlassChip meta 最低 **1.09:1**（00:29）；dawn 段 wa-why(faint) 1.8–2.8；
   - 新增的 `--wash` 洗染未解决此问题（梦端 #8a5a30 把底色往中间调拉，交叉带略变差）；
   - 观感佐证：深夜白玻璃卡成「亮岛」（明暗断层），ghost 重影标签在暗底上被误读为渲染瑕疵。
   修法思路：PALETTE 各停靠点做**逐对可读性校准**（每个 m 站的 fg/fg-soft 对 bg ≥4.5:1 才入表——本质是给 soft 的夜间端留更高亮度差，而不是与 fg 同步沉没）；或插值加对比度守恒约束。
   一并解决：`--fg-faint` / `--amber` / `--umber` 夜间**不随 PALETTE 插值**——静态强调色压在插值底上，深夜端必然失配。
2. **P0 · GlassChip 白玻璃深夜不可读**（生产实测 chip-meta 1.09:1 @ 00:29、chip-desc 1.26–4.4）：`src/components/home/GlassChip.astro`。设计决定「昼夜全程白玻深字」保留——但深夜玻璃成亮岛断层 + meta 消失。修法：玻璃 alpha 随 bg 亮度联动，或 chip-meta 深夜换 `--fg` 级色。
   附带新发现：主页 vtag 仍 62/38、主页 `.tick-ok` 仍 50/50（projects 列表页已修 30/70，两处不一致）；`window.__ps` 调试抓手未做 DEV 门控（`__fx` 已门控，标准应一致）；主页 `user-select:none` 全站文字不可选（有意为之，建议记录决议）；左轨/rail 深夜 2.4–2.9:1 几乎不可见；多个时钟并存（rail 时刻 vs 段范围 vs 页脚钟）初见像数据错误，建议至少给 rail 时刻加「此刻」标注。
3. **主页 `[data-boot]` 无脚本失败兜底**：JS 挂时面纱 6s 自动揭开但首屏元素永久 `opacity:0` = 空页（HEAD `index.astro` 门控样式）。给 `[data-boot]` 补与 BootVeil `boot-auto` 同节拍的 CSS keyframes 兜底。
4. **300/900 字重下沉**：仅主页使用（标题/巨字），从 BaseLayout 挪进 index 自己 import——字体 P0（见下）的止血配合项。
5. **night 每帧写 root 级 CSS 变量**：`documentElement` 上改继承变量 = 每帧全页 style recalc。重设计时把消费子树收窄（如 `.page`）或按阈值节流。
6. **首访揭幕 ≥3.1s 把首个 PV 的 LCP 顶过 2.5s**（boot.ts 两档均不可跳过）：设计决策，可选折中——子页首访走快版 / 允许点击跳过 / 压缩到 ~1.8s。
7. **vtag 判词签对比度**（昼面 3.5–3.8:1）：同本轮 projects 列表签的修法，`color-mix` 里 `--fg` 占比 ≥70%。
8. `index.astro` 的外链 `rel="noopener"` 补 `noreferrer`（本轮已修 about/projects 两处，主页这处随重设计带上）。
9. `.sr-only` 目前各自为战（index scoped 一份、404 本轮新加一份）：建议提取进 global.css 供全站复用。

## 二、被阻塞——等 BaseLayout / index 在飞改动合并后再动

1. **og:image + JSON-LD（SEO P1 两项）**：BaseLayout head 加 `og:image`（需先做一张 1200×630 默认图进 public/og/）、`twitter:card` 升 `summary_large_image`、`og:locale zh_CN`；JSON-LD 最小集 = 主页 `WebSite`+`Person`、文章页 `BlogPosting`。
2. **article:published_time / modified_time**：BaseLayout 加可选 props，文章页传 `date.toISOString()`；content schema 加可选 `updated`。
3. **skip link**：BaseLayout body 首位加 `.sr-only`「跳到正文」。
4. **night.ts 改动态 import**：静态页白载 ~1.5KB gzip/页；`import('../scripts/night')` 或挪进主页自己的 script。
5. **五个 init 无异常隔离**：`initBoot(); initChrome(); initNight(); initMorph(); initReality();` 顺序裸调，任一抛错连坐其后全部——各自 try/catch。
6. **BaseLayout `rail` Props 缺 `readout` 字段**（文章页已在传、Rail 组件已声明）：补上后 `npm run check` 即可挂进 deploy.yml（本轮已装好 astro check 工具链与脚本）。
7. **Boot 揭幕期焦点被面纱遮蔽**（WCAG 2.4.11）：进门给 `.page` 设 `inert`，`booted` 后移除（BootVeil + BaseLayout 配合）。
8. **字体 P0 主体——全站共享 CSS 501KB / gzip 211KB，97% 是 @font-face**（409 个声明，Noto Serif SC 4 字重 ×101 子集）：/about 字体实载 ≈805KB、文章页 ≈1MB。治本 = `cn-font-split` 按全站实际用字自切（CSS 可 <50KB gzip）；顺带只输出 woff2 单格式（现 dist 带 397 个冗余 .woff，31MB）。

## 三、性能 P1/P2（独立可排期）

1. **three.js 527KB（gzip 130KB）为一块装饰玻璃签**：`src/scripts/slip.ts:8` `import *` 拖进大半个核心，实际只用 7 个类。改 `three/webgl` 副入口 + `three.core`，或裸 WebGL 仿写（~200 行）。注意：若重设计弃用 slip 则本条作废。
2. **Eeg 全站常驻 30fps rAF 重绘全视口 SVG**：波形是两层定频正弦——预生成 path + CSS `translateX` 循环平移可完全去掉 rAF；或降 12fps。
3. `chrome.ts` anchorLoop 每帧写 `left`（布局属性）→ 改 `transform: translateX()`；rAF 循环加 `document.hidden` 门控（Eeg 已有，chrome 没有）。
4. `three-common.ts:70` 的 900ms 轮询 `setInterval` 永不清理（makeLoop 无停止路径）。
5. **字重策略收敛**：文章正文请求 400 只载 500（隐性匹配、多下一套 CJK 子集）；`projects/[slug]` 请求 700 匹配到 900；SiteHeader/StitchHeader 的 mono 用 500/600 但只载 IBM Plex Mono 400（伪粗体）。终态建议全站 2 个字重 + 补 `@fontsource/ibm-plex-mono/500.css`。
6. 回退字体 `size-adjust/ascent-override` 调参（低优先）。

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

## 七、验证欠账

- 全部性能结论为实验室级（无 CrUX/RUM）；上线 `web-vitals` 一方 RUM 后复验字体 P0 与 LCP。
- GitHub Pages 实际 Cache-Control / br 支持未线上验证（平台不可自定义头，已知限制）。
- 真实屏幕阅读器（NVDA/VoiceOver）未实测；200% 缩放、Windows 高对比度模式未测。

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
