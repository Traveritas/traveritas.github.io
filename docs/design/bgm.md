# 环境声（BGM）· 两态音频与流水线

站点的背景音乐：醒 / 梦各一套 **intro → loop（→ outro）**，两态同长同格、并行同相位，
长按入梦时不是「切歌」，而是**跟着那根 -4° 线一起交叉换面**。
outro 成片目前**备而不用**（见 §3.3）。

---

## 1. 资产

成片在 `public/audio/`，六个文件，随站点一起发布：

| 文件 | 段落 | 时长 | 成片响度 | 真峰值 |
| --- | --- | --- | --- | --- |
| `wake-intro.mp3` | 醒 · 开场 | 25.455s | −18.43 LUFS | −6.32 dBTP |
| `wake-loop.mp3` | 醒 · 循环 | 50.909s | −14.79 LUFS | −5.62 dBTP |
| `wake-outro.mp3` | 醒 · 收束（**运行时不用**） | 18.182s | −17.98 LUFS | −6.26 dBTP |
| `dream-intro.mp3` | 梦 · 开场 | 25.455s | −19.77 LUFS | −6.64 dBTP |
| `dream-loop.mp3` | 梦 · 循环 | 50.909s | −14.38 LUFS | −0.77 dBTP |
| `dream-outro.mp3` | 梦 · 收束（**运行时不用**） | 19.091s | −18.52 LUFS | −5.48 dBTP |

源文件**不进仓库**（`D:\myDownloads\personalwebsite-<awake|dream>-<intro|loopAB|outro>.wav`）。
换音频要重跑流水线，成片才跟着变；仓库里存成片，是为了别处 clone 下来也能直接 build。

> **换稿注意**：两态 intro 必须同长，这是两态相位与 bed 时间轴的前提
> （`sound.ts` 取两态时长的较小者当共同长度，不等长会把另一边截胡）。
> 2026-09-28 醒的开场换过一稿：旧稿在源目录里留档为 `personalwebsite-awake-intro.old.wav/.mp3`，
> 当前 `personalwebsite-awake-intro.wav` ＝ 用户给的 `awake-intro-fixed.wav`（同为 25.454562s）。
> 换完 awake 全段增益由 −6.02 变 −5.95 dB（新稿本身轻约 0.7 dB，整体对齐自动吸收）。

## 2. 等响流水线

```
node design/audio/normalize-bgm.mjs              # 重跑：测量 → 定增益 → 编码 → 自检
node design/audio/normalize-bgm.mjs --check      # 只测量不写文件
node design/audio/normalize-bgm.mjs --src <目录>  # 换源目录
```

- **量什么**：EBU R128 积分响度（LUFS）＋真峰值，用 `loudnorm` 只读一遍。
  不用 RMS：K 加权计入高频，而两态的音色分工正是「醒＝更清晰、梦＝更模糊」，
  同样 RMS 下更亮的那条听起来更响，按 LUFS 才是听感对齐。
- **怎么对齐**：默认 `--align whole`——把一态的 intro+loop+outro 拼成一段 programme
  量积分响度，两态之间用**一个**增益差对齐（本片源：awake 全段 −5.95 dB）。
  这样整态的内部起伏（intro→loop 的落差）原样保留，不重写编曲。
  代价是逐段仍有小残差，实测 loop 差 0.41 dB、intro 差 1.34 dB——loop 占播放时间的
  绝大部分，听感上足够。
  另有一档 `--align segment`：intro/loop/outro 逐段各自对齐，换面时任何时刻都不跳音量，
  但会把 awake 自己的 intro→loop 落差（3.0 dB）改成 dream 的（5.6 dB）。
  **用户 2026-09-27 选定「先整体对齐」**，故默认 whole。
- **参考形态**：`dream`。它的电平即目标，一个 bit 不动；只调另一态。
- **编码**：始终从无损源编一次（`libmp3lame -q:a 4` ≈165 kbps），不二次编码；
  编完再量一遍，偏差超 0.25 dB 就用残余量从源重编。
- **自检**：最后拿真正要发布的六个文件拼成整态再量一次，两态差值与容差一起打印，
  报告落在 `design/audio/out/normalize-report.json`。

顺带一个体检脚本：`node design/audio/analyze.mjs <目录>`——看循环边界连续性、
intro 与 loop 的关系、分段包络。**换音频后建议先跑它**：循环文件若在末尾淡出、
或长度不成整小节，`loop=true` 会在接缝处留一记咔或错拍。

## 3. 运行时

`src/scripts/sound.ts`（`BaseLayout` 里在 `initReality()` 之后调用），微章在
`src/components/chrome/Sound.astro`（左下角常驻）。

### 3.1 时间线：一条弧线 + 墙钟锚点

弧线零点（`epoch`）＝ intro 开始那一刻的**墙钟毫秒**，存在 `sessionStorage['xm-sound']`：

```
t = (Date.now() − epoch) / 1000
t <  introDur        → 开场，从 intro 的 t 秒处接上
t ≥  introDur        → loop，相位 = (t − introDur) mod loopDur
```

于是站内换页、以及「关一下就回来」，音乐都落在**同一条时间线上**，
不会每次从零重来——「它可能随时消失，又随时可能重新被记起」。
**例外**：关声超过 `OFF_RESET_MS`（10 秒）再打开，就当人走远了——弧线弃掉
（`epoch` 重设），从零点重演开场。关了多久由存下来的 `offAt` 判断，跨页也有效。
段落时长也一并存下，换页时缓冲还没到手也能算准相位（否则会退化成从 loop 头重来）。

### 3.2 两态并行、等功率交叉

两条 loop 常驻并行、**同相位**，醒度（`reality.ts` 的 `wakeMix()`）每 140 ms 采一次，
驱动 `sin/cos` 等功率交叉（τ = 0.14 s）。长按那 2.2 秒里，声音与线同步走，
中途松手也会跟着退回原面——不是「闩锁时才换歌」。

**交叉余量**：两态 loop 实测近乎不相关（r = 0.013）但瞬态峰值对齐，等功率相加会
冲到 +2.34 dBFS。故按解码后素材的真实峰值算一条 `1 − D·sin(πm)` 余量曲线
（本片源 D ≈ 0.16，交叉中段压到 0.86），把峰按在 −0.5 dB 之下。素材换了会自动重算。

### 3.3 intro

- **intro**：一态一套。首次开启按当时那一面从 0 接入；弧线还在 intro 段内就接着放
  （关一下就回来时，开场也从中断处续上），过了就直接落 loop。1.1 s 淡入。
  若开场还在演而人已长按换到对面，开场收掉、bed 立刻接上并把这半段弧线抹掉。
- **outro：运行时不用**（2026-09-27 用户裁定「结束时直接淡出，不需要再切换到 outro」）。
  关声＝ `master` 直接淡出 1.0 s（intro / loop 一起收，所以开场演到一半关声也是同一条淡出），
  随后停源并 `ctx.suspend()`。`public/audio/*-outro.mp3` 与流水线里的 outro 一格留着备查，
  但站上一个字节都不会请求它；要用回来，改 `haltPlayback()` 一处。

### 3.4 自动播放与省流

- **首屏绝不出声**，也不假装在播：首次开启必须是一次点击（浏览器策略）。
- 点开过之后，站内换页尝试直接续播；被策略拦下就**如实退回待开启态**（epoch 留着，点开即续上）。
- 未开启时**一个字节都不取**；开启后先要当前形态的 intro（真要演开场时才等它），
  loop 并行起步，另一态 loop 随后预取（`requestIdleCallback` 带 timeout 兜底，
  页面常驻动画会把纯 idle 回调饿住）。outro 不在预取之列。
- 切走标签页：声音退到 0.22（「世界在此处悬停」），回来即复原；时间轴不中断。
- 关声后 `ctx.suspend()`，不留后台音频。

### 3.5 阅读页的页面级电平

长文页与关于页用 `BaseLayout` 的 `bgm="reading"` 声明意图（落到 `body[data-bgm="reading"]`），
整支曲子退 **−5 dB**（`sound.ts` 的 `READING_TRIM_DB`）——只是让开路，不是换一套音。
挂的是 `master`（进场包络那个节点），所以 intro / loop 一起退，两态等响关系不变。
数字只在那一个常数里，改它两态同时挪。项目详情页若也想要，加同一个 prop 即可。

### 3.6 微章

左下角常驻（左中留给 Rail、首屏右下留给入梦检验标尺）。静＝中空细环 + `SILENT`，
响＝琥珀微核呼吸 + `AUDIBLE`。文案双态：醒「开启/关闭环境声」↔ 梦「让声音浮起/沉落」，
随长按换面（`data-morph` + `data-dream`）；开关态只由 `html[data-sound="on"]` 决定呈现哪一组，
脚本不重写文案，免得与 morph 引擎抢注册表。醒面琥珀会被 `reality.ts` 的强调色插值褪成冷灰，
故亮/不亮由状态决定，不靠色相本身区分。无 JS 时整块隐藏。样张在 `/styleguide/` §五。

## 4. 验收

```
npm run build                        # 必须 100% 静态编译通过
node design/.shot-styleguide.cjs     # 样式预览页截图（含微章样张）
node design/audio/normalize-bgm.mjs --check   # 换音频后：先确认两态仍等响
```

浏览器实测要点（dev 上有 `window.__sound.state() / .probe(ms)` 调试口）：

1. 点击开声 → `ctx: running`，`bedIn` ≈ 25.4（开场在演、bed 已排在弧线 25.455 处）；
2. 开场走完 → `loops: wake:run dream:run`，两态同相位；
3. 长按入梦 → 2.2 秒内 `mix` 0→1、两态增益沿 sin/cos 交叉、余量同步下压；
4. 换页 → `arc` 连续、不开场重演；
5. 关声 → `master` 直接归零（不接 outro）、`ctx: suspended`、探针电平为 0；
6. 关 3 秒再开 → `arc` 接着走（不重置）；关 12 秒再开 → `arc` 重置到 ~0、开场从头；
7. 长文页 / 关于页 → `state().master` ≈ 0.562（−5 dB），首页为 1。

## 5. 已知取舍

- 两态的 intro 是**不同形状**：dream 从近乎无声（−32 dB）涨起来，awake 一上来就在
  （−14 dB）。整体等响对齐的是积分响度，故开场头几秒两态仍差约 10 dB——这是编曲的
  性格差异（醒＝边界明确、梦＝模糊），不是没对齐。
- `dream-loop` 的真峰值 −0.77 dBTP，是全场最紧的一处；若要再压低整体，
  改 `normalize-bgm.mjs` 的 `ABSOLUTE_TARGETS`（一组数，两态一起挪）。
- 运行时不做整体衰减（`master` 从 1 起），交付的就是用户自己的电平；
  若嫌作为阅读背景偏响，在 `sound.ts` 的 `master` 上挂一个常数即可（两态同时降，等响关系不变）。
- mp3 的无缝依赖解码器按 LAME 标签裁掉编码填充：**Chromium 实测六条样点数与源 wav 逐个相等**
  （`design/audio/out/normalize-report.json` 的 `samples` 字段），故 `loop=true` 即刻无缝。
  换格式（如 ogg/opus）需重新验证这一条。
