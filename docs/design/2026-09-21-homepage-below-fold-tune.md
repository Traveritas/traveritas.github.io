# 主页下部排版 · 并行微调轮（2026-09-21）

状态：三个 worktree 并行（`pw-tune-a` / `pw-tune-b` / `pw-tune-c`，分支 `tune/a-doorcheck-skeleton` / `tune/b-night-skeleton` / `tune/c-free-fusion`）；主线目录 4321 端口为当前基线，不动；各会话只改自己分支，用户终选后回 main 合并。

## 任务

调整**主页 hero 以下**的内容排版。参考稿：`design/mocks/p7-doorcheck.html`（醒梦 · 入梦检验——用户认定其下部排版目前最好）。目标：把当前实现的亮点与入梦检验的亮点**有机结合**，产出可直接上线的真实页面（真实数据、真实路由）。

## 两份源材料

### 当前实现（`src/pages/index.astro`，入夜·缝线版）

- 叙事骨架 = 一夜的睡眠分期：23:07 入夜 hero → N1–N2 浅梦·随笔 → N3 深眠·项目（圆圈群 WebGL 垫底）→ REM·试验场（五粒母题种子 + 玻璃签 WebGL）→ 06:31 晨醒·关于
- 亮点构件：`StitchHeader`（段名 + 分期 + 夜时刻）、`GlassChip` 玻璃片、ledger 账目列表 + 八针缝针表、`data-morph` 双声轨文案（醒/梦两种写法）、Rail 左轨、EEG/Grain/Seam 全站 chrome、`night.ts` 分期驱动 `body[data-stage]`（暗角呼吸速率随分期变化）
- WebGL：rings（N3 圆圈群）、slip（玻璃签）——均有静态回退与懒加载；性能纪律：实例化、DPR≤1.5、reduced-motion 静帧、隐藏标签页暂停

### 参考稿 p7-doorcheck（入梦检验）

- 下部骨架 = 入梦深度分层：醒·项目（能核验的事）→ 浅梦·随笔（写下时是醒的）→ 深梦·关于（不由分说的话）→ 最深处·试验场（还没有的东西）→ 出口·唤醒方式（联系方式清单）
- 排版装置：
  - 层间 **axis 分隔带**（层级名 + 一句判词，如「醒 · WAKE / 能核验的事」）
  - 每条内容带**可核验标记**（✓ 有仓库 / ✓ 有记录 / ✗ 暂无）
  - **复读行**：同一事实梦/醒两种读法并置 + ⚠ 漂移 / ✓ 已校准标记
  - 随笔**日期漂移**（2026-09-32、25:61）——「读出不对劲，说明你还在梦里」，且留一条未漂移的锚
  - 梦话引块（关于）、试验场 chips 含**划线否决项**（碎块、花）、出口区 link 行（名称/地址/用途三栏）
  - 玻璃锚点：按住逐字显出「醒着的一面」（与当前 data-morph 同源机制）
- 注意：稿中 `href="#"` 与全部数字（12 篇随笔、9 个项目等）均为示例；落地时必须换成 `getCollection` 真实数据与真实路由

## 硬约束

1. 只动 hero 以下（hero 允许衔接处微调，如滚动提示语）；改动限于 `src/pages/index.astro` 及其新增组件/样式；**不动**其他页面、`src/content/`、`BaseLayout` 与 chrome 体系（Rail/EEG/Grain/Seam/Hairline/BootVeil）
2. 数据与路由全真实（articles / projects collection；`/articles/`、`/projects/`、`/about/` 链接有效）
3. 当前实现已验证的构件至少保留三件，其中 WebGL 至少一件；`data-morph` 双声轨文案体系保留
4. 验收：桌面全页截图 + 移动端 390×844 + `prefers-reduced-motion` 各一组；控制台无错误；`npm run build` 通过
5. 完成后中文 commit 到当前分支；不 merge、不 push
6. dev 端口：A=4322 / B=4323 / C=4324（4321 是主线基线，勿占用；若它在跑，可 curl 对比）

## 三个角度

- **A · 门检骨架移植**（`tune/a-doorcheck-skeleton`）：hero 以下整体换成 p7 的深度分层骨架（含出口区），层级判词与核验标记按真实数据重写；当前构件（玻璃片 / 账目 / WebGL / morph）作为材料填进新骨架
- **B · 夜骨架保留**（`tune/b-night-skeleton`）：夜分期结构不动，逐段嫁接 p7 排版装置——axis 分隔带、可核验标记、复读行、漂移日期、出口区
- **C · 自由融合**（`tune/c-free-fusion`）：不预设哪边骨架，把下部重排为一条统一叙事（如「夜的分期 × 梦的深度」双轨合一）；可调段落顺序、发明混合语法，但真实数据 + 真实路由 + chrome 不破

## 背景速览（更早历史见 `docs/design/homepage-direction.md`）

- 母题否决史：碎块（过于规整）、花（三稿未成）——勿再引入
- 全站已去图标化；正文用 Noto Serif SC（思源宋）
- `homepage-direction.md` 顶部状态行写于入夜版之前，已过时；本轮以本文件为准
