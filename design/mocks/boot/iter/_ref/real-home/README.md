# 真首页参考截图（Lead · 2026-10-28）

来源：`npx astro dev --port 4670`，`http://127.0.0.1:4670/`，Playwright + Chrome，1440×900 / 390×844。
截图前摘掉旧 `#bootveil` 并补上 `booted / w-ready`；等梦态大字轮到 `AveritA` 时拍。**这是首页默认的梦态**（`reality.ts` 默认入梦，`brand.ts` 每秒轮转），不是醒态 `Traveritas`。

| 文件 | 内容 |
|---|---|
| `home-desktop.png` | 桌面整页静置（含 Ave 旁白、左下工具星、三栏头、14° 双线） |
| `home-mobile.png` | 手机整页静置 |
| `home-desktop-flow.png` | 只留流光（隐藏 DOM 字与 UI），供二的颗粒构图对齐 |
| `home-desktop-brand.png` | 大字「反相窗」局部 |

注意：
- 假首页（`_shared/home-fragment.html`）只是替身，流光比真站亮/饱和；**五的终帧与接缝按这里的真首页设计**，二最终也要对齐真站的 `light.js`。
- 真站大字默认是梦态 `AveritA` + 每秒轮转，最后一拍如果落在静态 `Traveritas` 上，接入时会看到一次换面；接入方案见 `../INTEGRATION.md`。
- 真站有 Ave 旁白、工具星、底部声音条等 chrome，mock 未还原；开屏层接入时它们仍在 `z-index` 之下，不需要开屏处理。

复拍：`node design/mocks/boot/iter/_ref/real-home/.shot-real.cjs`（需要 dev server 4670）。
