# 四芒星 · 扁平原型（flat four-point star primitive）

2026-11-10 ｜ 目录：`design/mocks/star-flat/` ｜ 端口：4651

```
node design/mocks/star-flat/serve.cjs     → http://localhost:4651/star-flat/
node design/mocks/star-flat/.shot.cjs     → .shots/
ONLY=02,05 node design/mocks/star-flat/.shot.cjs
```

站内现在有**四份互不相识的手绘星形**：`Cursor.astro` 的两份曲线 path、`BootVeil.astro` 的另一份等臂曲线、`Ave.astro` 的直边 `clip-path`，外加 `Cursor.astro` 里那枚中心结。这份原型把它们收成一个函数，并逐份量了偏差。

---

## 1. 一份函数，四种写法

轮廓是「每四分之一段、每段两条二次曲线」：尖端 ─Q─ 肩点 ─Q─ 尖端，八条半弧绕一圈闭合。

- **肩点** `S = (shoulder·arm, ±shoulder·arm)`：落在 45° 射线上，就是那个「腰」。
- **尖端那半条弧的控制点** = 弦中点与尖峰位置的插值，插值量 = `pinch`。
  - `pinch = 0` 控制点落在弦中点 → 这条边是**直线**，星面是多边形（Ave 即是）
  - `pinch = 1` 控制点落在尖峰 → **内凹曲边**，芒不穿过形心（Cursor / BootVeil 即是）
- **`turn`**：尖峰控制点沿切向的偏移 / arm。`turn = 0` 时尖端切线严格垂直于轴；三个原件的曲率差就落在这个参数上。

```js
starPath({ arm: 10, waist: 6.5, pinch: 1, shoulder: 0.214, turn: 0.024 })  // Cursor
starPath({ arm: 10, waist: 10,  pinch: 1, shoulder: 0.246, turn: 0.03  })  // BootVeil
starPath({ arm: 50, waist: 50,  pinch: 0, shoulder: 0.22, turn: 0     })  // Ave
```

## 2. 实测偏差

判据：**对称 Hausdorff 距离**（两条轮廓互相「最远够不着多远」），用格点法算，另用 O(n²) 暴力算校验过，两者到 6 位小数一致。`wall(200)` 即 200px 下 1u ≈ 9–10px。

| 原件 | 偏差 | % 臂长 | % 总高 | 200px 下 | 最大偏差出现处 |
|---|---|---|---|---|---|
| `Cursor.astro` | 0.0545 u | 0.545% | 0.273% | 0.55 px | 在原件上 |
| `BootVeil.astro` | 0.0389 u | 0.389% | 0.194% | 0.39 px | 在复刻上 |
| `Ave.astro` | **0.0000 u** | **0%** | **0%** | **0 px** | — |
| 中心结 `knotPath(7)` | 0.001 u | — | — | — | — |

Ave 的 `clip-path` 是逐点相同的（多边形本来就是这条曲线在 `pinch = 0` 时的特例）。两份曲线原件都落在 1px 以下，**肉眼不可分辨**。

### 2.1 但一份默认参数不能同时满足三份

各预设套到三份原件上的偏差（单位 u）：

| 预设 | Cursor | BootVeil | Ave |
|---|---|---|---|
| `spire` | **0.74** | 4.91 | 6.51 |
| `equal` | 4.84 | **0.39** | 4.75 |
| `facet` | 6.34 | 4.65 | **0.00** |
| `tick`（折中） | 9.69 | 7.54 | 5.66 |
| `starPath()` 默认值 | 2.98 | 2.37 | 5.48 |

**这是这一路最该记住的一条：`star.js` 只在「给每份原件它自己那组参数」时才精确。** 想用一个共享默认值覆盖全部，minimax 最优解是各摊 ~2.4% 臂长的残差——也就是 `turn` 这个参数本质是个**妥协**，不是发现。落地时要么「每个用途各自一组参数」，要么接受 2.4%。

## 3. 尺寸阈值（真实光栅化实测）

量的是**腰深**——45° 那处内凹有多少像素可以塌下去。塌不满一格，四个芒就压成横竖两条，退成加号。

| 尺寸 | 8 | 12 | 16 | 24 | 32 | 48 | 96 | 160 |
|---|---|---|---|---|---|---|---|---|
| 腰深 px | 1.00 | 1.49 | 1.99 | 2.99 | 3.98 | 5.97 | 11.95 | 19.91 |

真实栅格上的墨迹（最近邻 ×11 放大后数中心轴）：8px → 9×9，12px → 14×14，16px → 18×18，24px → 27×27，32px → 36×36；四角恒空。

**结论：**
- **8 / 12 / 16px 退回加号。** 腰深 1–2px，圆角一压就把两根横竖并起来。
- **24px 勉强**，腰 3.0px，芒刚刚分开——正好是「说得出形状，但一秒内读不出来」的那条线。
- **32px 起是稳的。** 之前 `cursor-I-notes.md` 记的「3–5px 糊成 +」与这里一致：不是形状问题，是腰深不够。

## 4. 一个与 brief 相反的设计发现

brief 里写「平面星的转动是**可读**的，立体星做不到」。**只对等臂版成立。**

见 `.shots/06-aim.png`：

- **等臂（`equal`）转 45°** → 干净地换了一种朝向，读作「它转过去了」。
- **竖长横短（`spire`）转 45°** → 长芒荡到斜线上，短芒换到另一条斜线。**读起来是「歪了」，不是「转过去了」。**

也就是说站内主星（`spire`，10 : 6.5 那个）恰恰是**不能靠转动表意**的那个。这条削弱了 brief 的前提，但比只摆好看的例子有用：**要表达「指向」就用 `equal`；`spire` 只用于「就在这里」**，别让它转。

## 5. 预设

| 预设 | 参数 | 用途 |
|---|---|---|
| `spire` | arm 10 · waist 6.5 · pinch 1 · shoulder .214 · turn .024 | 站内主星（光标）。竖长横短 |
| `equal` | arm 10 · waist 10 · pinch 1 · shoulder .246 · turn .03 | 开屏星环里的星芒。等臂，可转 |
| `facet` | arm 10 · waist 10 · pinch 0 · shoulder .22 · turn 0 | Ave 晶柱的直边星 |
| `tick` | arm 10 · waist 10 · pinch 1 · shoulder .232 · turn 0 | 中立折中，12–32px 的标点 |
| `lock` | arm 7 · waist 4.6 · pinch 0 · shoulder 4.6/11.6 | 闩锁菱形 ◆（`starPath` 的退化极限） |

`starPath` 另有 `minor / minorScale / rotate`：副芒（转 45°、缩到 0.5，Cursor 用的就是 0.5）与整枚旋转。`starParts()` 分开给两枚芒（要各自上色时用）。

## 6. 文件

| 文件 | 作用 |
|---|---|
| `star.js` | 原语本体：`starPath` / `starParts` / `knotPath` / `diamondPath` / `PRESETS`；另挂 `window.StarFlat` 供非模块页用 |
| `measure.js` | 对称 Hausdorff（格点法）；`.brute.mjs` 是 O(n²) 参照实现 |
| `index.html` | 预览页：对照墙 / 参数 / 材质 / 尺寸梯 / 指向 |
| `serve.cjs` | 静态服务，端口 4651 |
| `.shot.cjs` | 截图 + 自检（不依赖 puppeteer），出 `.shots/report.json` |
| `.measure.mjs` `.fit.mjs` `.minimax.mjs` `.grid.mjs` `.notch.mjs` | 拟合与测量脚本，产出 `.measure.json` |
| `.probe-size.*` | 真实栅格化尺寸探针，产出 `.shots/size-probe.json` |

自检读数：`.shots/report.json`（各节的偏差、腰深、当前参数）与 `.shots/size-probe.json`。控制台错误 0 · 页面错误 0 · 失败请求 0。

## 7. 没做的

- **没接进站内**。`src/` 未动；要不要把 `Cursor.astro` / `BootVeil.astro` / `Ave.astro` 改调 `star.js`，是下一步的决定（改动会碰到光标与开屏两处已经验收过的画面）。
- **`star.js` 是 ESM + `window.StarFlat` 双份**。站内是 Astro/Vite，直接 `import` 即可；`window` 那份只是为了 `file://` 下能开预览页，落地时可以删。
- **`turn` 的语义没完全咬死**。它目前只是「调节两份原件曲率差」的旋钮，几何上不构成一个独立可解释的量。若将来要写进文档做正式参数，需要重新命名或拆成两个。