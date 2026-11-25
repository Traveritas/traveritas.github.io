# personal-website

AveritA 的昼梦叙集。Astro 纯静态站。整站只有一张画布：地面是像素化的流光场，物是星与水晶的干净透明，二者一体。
页与页之间不换背景，只平移地面、先粗再解析；画布、左下的星、右下的 Ave 跨页常驻（ClientRouter + transition:persist）。
2026-11-25 由 `next/` 替换上一版（漫游那一版），上一版的静态快照挂在 `/legacy/wander/`。

## 常用命令

```bash
npm install     # 安装依赖
npm run dev     # 本地开发（http://127.0.0.1:4321）
npm run build   # 构建到 dist/
npm run check   # 类型检查（astro check）
npm run preview # 预览构建产物
node scripts/shots.cjs [名字片段]   # 截一组画面到 .shots/（先 npm run dev；BASE=http://127.0.0.1:<端口> 换地址）
```

## 目录结构

```
src/
  content/            # 内容源（Markdown）：articles 断章 / moments 闪念（可带 1–9 张配图）/ projects 造物
  content.config.ts   # 内容集合定义与字段校验
  layouts/Base.astro  # 唯一的骨架：画布、左下的星、Ave 都在这里，跨页常驻
  components/
    chrome/           #   左下的星（Toolstar）与 Ave
    ListHead / Hits   #   名录页头、寻找页的结果
  pages/              # 主页 / 三处名录 / [sec]/[...slug] 阅读页 / find 寻找 / tags / gate（NEXUS 的门）/ 404 / rss
  scripts/
    ground.js         #   地面 / 玻璃 / 晶体（WebGL2）
    site.ts           #   路由、换页、开屏、逐帧、NEXUS 的门
    toolstar.ts ave*.ts sound.ts reality.ts lib.ts  # 左下的星、Ave、声音、昼夜
  data/               # Ave 台词表与人声清单、BGM 清单
  markdown/           # 构建期 markdown 插件（两态语法 twilight / 小节序号 ordinal / 代码配色）
  lib/                # 构建期小工具（条目、摘要、Ave 的条目台词）
  styles/             # tokens.css 令牌 / site.css 全站样式
legacy/wander/        # 上一版的静态快照（定格，不再改；构建时原样拷进 dist）
docs/                 # 写作手册、设计文档、待办
design/               # 原型与试验稿（design/mocks/remake 是这一版的原型，已停）
scripts/
  fonts.mjs           # 正文字体按用字自切（dev / build 前自动跑）
  new-article.mjs     # 新随笔脚手架
  shots.cjs           # 截图
.github/workflows/deploy.yml   # GitHub Pages 自动部署（类型检查 + 构建）
```

## 字体

正文与标题的 Noto Serif SC **按站内实际用字自切**，不走 `@fontsource`：

- `scripts/fonts.mjs` 扫描 `src/` 下全部源码与内容收字，从 Google Fonts 的可变字体切出 **500 / 600** 两个字重，
  每个字重分 5 包（核心包放拉丁字符、全部标点和最常用的字），每包一条带 `unicode-range` 的 `@font-face`，页面只下载用得到的包。
- `npm run dev` / `npm run build` 前自动跑（`predev` / `prebuild`）；用字没变就跳过。也可以单独 `npm run fonts`。
- 源字体（约 25MB）首次运行时下载到 `.cache/fonts/` 并校验 sha256；产物在 `public/fonts/noto-serif-sc/`。两者都不进仓库，CI 里缓存源字体。
- 全站只有 500 / 600：写 400 会落到 500，不要再写 300 / 700 / 900。

等宽（IBM Plex Mono 400）是拉丁字体，仍用 `@fontsource`。

## 写作

- 新随笔：`npm run new:article -- "标题" [slug]`（或手动在 `src/content/articles/` 新建 `yyyy-mm-dd-slug.md`），frontmatter 含 `title` / `date` / `description`（可选）/ `tags`（可选）/ `draft`（可选）/ `related`（可选）
- 新项目：在 `src/content/projects/` 新建 md，另支持 `status`（构想中/进行中/已完成）与 `links`
- **醒梦两态正文**：行内换字 `[[醒|梦]]`，块级换段 `:::dream` / `:::wake`，跟着昼夜（左下的星里切）换面——语法手册见 `docs/writing.md`

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
