# next/ · 新版（AveritA 的昼梦叙集）

重做原型 `design/mocks/remake/`（r1–r3）搬成的真站：Astro 预渲染每一页，换页走 ClientRouter，
画布、左下的星、右下的 Ave 跨页常驻——页与页之间不换背景，只平移地面、先粗再解析。
做到差不多时整体替换旧站（根目录 `src/`）。

## 跑

```sh
cd next
npx astro dev          # → http://127.0.0.1:4322（被占用时 Astro 往后挪，看终端）
npx astro build        # → next/dist/
node shots.cjs         # 截图 → _shots/，对照页 _shots/index.html（BASE=http://127.0.0.1:<端口> 指定地址）
```

依赖用仓库根目录的 `node_modules`（Node 往上找），不另装。正文字体 `public/fonts/noto-serif-sc/` 由根目录的 `npm run fonts` 生成（扫 `src/` 与 `next/src/`）。

## 什么是搬过来的，什么是借用的

**搬过来（在这里改）**

- `src/scripts/ground.js`：地面 / 玻璃 / 晶体（原型 ground.js）
- `src/scripts/site.ts`：路由、换页、逐帧（原型 app.js）
- `src/styles/site.css`：原型 style.css
- 左下的星 / Ave / 声音：`src/scripts/{toolstar,ave,ave-star,ave-flow,sound,lib}.ts`、`src/components/chrome/{Toolstar,Ave}.astro`、
  `src/data/{ave-lines,ave-voice,bgm-assets}.ts`、`src/lib/ave-page.ts`、`src/styles/tokens.css` ——
  原站原样复制。往后**改这里的**，不再从旧站打包（原型的 chrome/build-chrome.mjs 退役）。
  与原站的差别只有：`reality.ts` 换成原型的那一版（昼夜由 site.ts 决定）、
  `ave.ts` 末尾多一个 `aveEnterRoute`、工具栏的去处里三处只用梦面的名字、「旧处」改指旧站快照 /legacy/wander/、`initToolstar` 改由 site.ts 调。
- `src/markdown/`：醒梦正文语法与小节序号（与旧站同一套插件）

**借用旧站的（并行期间不复制，免得写两遍）**

- 内容：`../src/content`（`src/content.config.ts` 指过去）
- 静态资源：`../public`（`astro.config.mjs` 的 `publicDir`）

## 旧站快照（/legacy/wander/）

旧站（漫游那一版）存成静态快照：`node next/scripts/legacy-snapshot.mjs`（先在根目录 `npm run build`）→ `next/legacy/wander/`（入库）。
站内路径一律加了 `/legacy/wander` 前缀，每页 noindex；构建时原样拷进 dist，dev 时 astro.config.mjs 的 legacy 集成直接伺服。
旧站和新站同源，localStorage 是共用的（Ave 记得的「来过」、音量等）。

## 还没做

- 立体星新参数（star-primitive.md 的 0.26 粗细 + 磨砂）：对照页 `design/mocks/star-compare/`，等作者定；定了以后改 toolstar.ts 的 drawStar 与 favicon（`node design/mocks/star-compare/favicon.mjs`）

## 替换旧站时

1. 最后再跑一次快照（旧站停更的那一版）
2. `src/content`、`public/` 里用得到的挪进 `next/`，去掉借用的路径；字体切分脚本改扫新的 `src/`
3. `next/` 的内容提到根目录，替掉旧的 `src/`
