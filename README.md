# personal-website

Traveritas 的个人网站。Astro 纯静态站，「醒梦」审美方向（见 `docs/design/aesthetic-direction.md`），技术选型决议见 `docs/tech-stack-decision.md`。由智能体与 Traveritas 共同建造。

## 常用命令

```bash
npm install     # 安装依赖
npm run dev     # 本地开发（http://localhost:4321）
npm run build   # 构建到 dist/
npm run check   # 类型检查（astro check）
npm run preview # 预览构建产物
```

## 目录结构

```
src/
  content/            # 内容源（Markdown）
    articles/         #   随笔
    projects/         #   项目
    moments/          #   瞬间（可带 1–9 张配图）
  content.config.ts   # 内容集合定义与字段校验
  layouts/            # 页面骨架（BaseLayout：head / 开屏 / 全站仪器层）
  components/         # 组件
    chrome/           #   全站仪器层（缝线 / 脑电 / 构块场 / 导览轨 / 开屏 / 环境声）
    home/             #   主页与旧主页存档用的块
    index/            #   目录行（随笔 / 项目目录页、标签页共用）
    article/ project/ about/  #   各内容页的专属块
    styleguide/       #   样式预览的样张原语
  pages/              # 路由页面（styleguide.astro = 样式预览工作台）
  scripts/            # 客户端脚本（入梦检验 reality / 双声轨 morph / 导览轨 gauge / 主页故事板等）
  data/               # 数据源（night.ts：23:07 → 06:31 的一夜时间轴）
  markdown/           # 构建期 markdown 插件（两态语法 twilight / 小节序号 ordinal / 代码配色）
  lib/                # 构建期小工具（excerpt：description 回退摘要）
  styleguide/         # 样式预览用的 markdown 样张
  styles/tokens.css   # 设计令牌（醒梦色彩 / 字体栈 / 度量）
  styles/global.css   # 全局样式（排版分层 / 内容页正文 / 行内光景）
  styles/styleguide.css  # 只在 /styleguide/ 载入的工具样式
docs/
  backlog.md               # 待办（已完成的在 docs/archive/）
  writing.md               # 写作手册（两态语法 / 发布规则）
  tech-stack-decision.md   # 技术选型决议
  design/aesthetic-direction.md  # 审美方向简报
  design/content-typography.md   # 内页正文排版分层地图
  design/styleguide.md           # 样式预览页怎么用、怎么加新样张
  design/bgm.md                  # 环境声与两态 BGM
scripts/
  fonts.mjs                # 正文字体按用字自切（dev / build 前自动跑）
  new-article.mjs          # 新随笔脚手架
.github/workflows/deploy.yml   # GitHub Pages 自动部署（类型检查 + 构建）
```

## 字体

正文与标题的 Noto Serif SC **按站内实际用字自切**，不走 `@fontsource`：

- `scripts/fonts.mjs` 扫描 `src/` 下全部源码与内容收字（约一千六百字），从 Google Fonts 的可变字体切出 **500 / 600** 两个字重，
  每个字重分 5 包（核心包放拉丁字符、全部标点和最常用的字），每包一条带 `unicode-range` 的 `@font-face`，页面只下载用得到的包。
- `npm run dev` / `npm run build` 前自动跑（`predev` / `prebuild`）；用字没变就跳过。也可以单独 `npm run fonts`。
- 源字体（约 25MB）首次运行时下载到 `.cache/fonts/` 并校验 sha256；产物在 `public/fonts/noto-serif-sc/`。两者都不进仓库，CI 里缓存源字体。
- 全站只有 500 / 600：写 400 会落到 500，不要再写 300 / 700 / 900。
- 新写的字会在下次 dev / build 时自动收进来，不用手动处理。

等宽（IBM Plex Mono 400）与像素字（Silkscreen）是拉丁字体，仍用 `@fontsource`。

## 样式预览

`/styleguide/` 是摊开全站共用样式与变体的工作台：令牌、内容页正文的三层管道、
通用构件、醒梦双态、全站仪器层。不进 sitemap、robots 禁止收录、站内无入口。

```bash
npm run dev   # → http://localhost:4321/styleguide/
```

加新样张的约定见 `docs/design/styleguide.md`。

## 写作

- 新随笔：`npm run new:article -- "标题" [slug]`（或手动在 `src/content/articles/` 新建 `yyyy-mm-dd-slug.md`），frontmatter 含 `title` / `date` / `description`（可选）/ `tags`（可选）/ `draft`（可选）/ `related`（可选）
- 新项目：在 `src/content/projects/` 新建 md，另支持 `status`（构想中/进行中/已完成）与 `links`
- **醒梦两态正文**：行内换字 `[[醒|梦]]`，块级换段 `:::dream` / `:::wake`，随全站长按入梦检验换面——语法手册见 `docs/writing.md`

## 部署

推送 `main` 分支即触发 GitHub Pages 自动部署（Actions）。站点地址：https://traveritas.github.io

## 已安装的项目级 Agent Skills（.agents/skills/）

仅在本项目内生效（在 ZCode 中打开本目录后自动发现）；想改为全局生效，把对应文件夹移到 `C:\Users\Traveritas\.agents\skills\` 即可。

| Skill | 来源 | 用途 |
|---|---|---|
| `frontend-design` | anthropics/skills（官方） | 写 UI 前先定设计方向，反「AI 味」审美 |
| `design-taste-frontend` | Leonxlnx/taste-skill | 作品集/落地页美学，先推断设计方向再产出 |
| `impeccable` | pbakaus/impeccable | 成站后系统性精修：间距/对比度/层次逐项修复 |
| `accessibility` | addyosmani/web-quality-skills | WCAG 2.2 可访问性审计 |
| `core-web-vitals` | 同上 | LCP/INP/CLS 优化 |
| `performance` | 同上 | 加载性能优化 |
| `best-practices` | 同上 | 安全/兼容/代码质量 |
| `seo` | 同上 | meta/结构化数据/sitemap |
| `web-quality-audit` | 同上 | 综合质量审计入口 |

安装日期：2026-09-19（各上游仓库当日版本）。

## 注意事项

- **impeccable 首次运行**会从官方 GitHub Releases（pbakaus/impeccable，带 SHA256 校验）下载引擎二进制到 `C:\Users\Traveritas\.impeccable\bin\`。介意可预先手动下载放入该目录，或删除 `.agents/skills/impeccable` 卸载。
- skill 靠 description 自动触发，也可以在对话里点名调用（如「用 impeccable 修一下首页」）。
- 改动 skill 无效果时，检查是否被用户级同名 skill 遮蔽（用户级优先级更高）。
