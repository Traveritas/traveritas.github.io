# 环境声（BGM）· 两态音频与流水线

站点的背景音乐：醒 / 梦各一套 **开场（intro + 一遍 loop 的合并稿）→ loop（→ outro）**，
两态同长同格、并行同相位，长按入梦时不是「切歌」，而是**跟着那根 -4° 线一起交叉换面**。
开场把原来分开的 intro 与 loop 第一遍合成一条母带，intro→loop 的接缝修在母带内部；
开场演到尽头，运行时在同一采样点上由 loop 无缝续上。outro 成片目前**备而不用**（见 §3.3）。

---

## 1. 资产

成片在 `public/audio/`，六个文件，随站点一起发布：

| 文件 | 段落 | 时长 | 成片响度 | 真峰值 |
| --- | --- | --- | --- | --- |
| `wake-open.mp3` | 醒 · 开场（intro+一遍 loop） | 76.364s | −15.19 LUFS | −7.37 dBTP |
| `wake-loop.mp3` | 醒 · 循环 | 50.909s | −14.46 LUFS | −7.38 dBTP |
| `wake-outro.mp3` | 醒 · 收束（**运行时不用**） | 18.182s | −19.93 LUFS | −8.15 dBTP |
| `dream-open.mp3` | 梦 · 开场（intro+一遍 loop） | 76.364s | −15.38 LUFS | −0.83 dBTP |
| `dream-loop.mp3` | 梦 · 循环 | 50.909s | −14.38 LUFS | −0.77 dBTP |
| `dream-outro.mp3` | 梦 · 收束（**运行时不用**） | 19.091s | −18.52 LUFS | −5.48 dBTP |

源文件**不进仓库**（`D:\myDownloads\personalwebsite-<awake|dream>-<intro+loopAB|loopAB|outro>.wav`）。
开场是 `intro+loopAB` 合并母带、loop 是独立源，都是各自一整次渲染（接缝修在母带内部）；
醒面最近一轮换稿（2026-09-28 深夜的 `-newest`）**母带与 loop 同批换掉**，梦面与醒面的
outro 一字未动。换音频要重跑流水线，成片才跟着变；
仓库里存成片，是为了别处 clone 下来也能直接 build。
重跑会一并刷新 `src/data/bgm-assets.ts`（成片版本号 + `OPEN_SEAM`），**别漏提交它**——
它是换稿后浏览器肯取新曲子的唯一依据（详见 §2）。

> **换稿注意**：两态 open 与两态 loop **必须同长**，这是两态相位与 bed 时间轴的前提
> （`sound.ts` 取两态时长的较小者当共同长度，不等长会把另一边截胡）。
> 开场母带里 intro→loop 的边界目前定在 25.454562s（1221819 样本 @48k，经互相关核实：
> dream 的 intro 段与旧 intro 源逐样本一致正好到此，awake 的 loop 头窗也在同一位置
> 对齐），记在流水线的 `OPEN_SEAM_SAMPLE`。换稿重渲染母带若动了 intro 长度，要改它，
> 并用 `analyze.mjs` 的接缝体检重新核实。`-newest` 一稿按同法复核过：母带尾段与 loop 源
> 全长相关 0.80（旧稿 0.69），峰值仍落在旧稿同样的 +2 样本偏置上——边界未动。
> 醒侧换稿留档：`personalwebsite-awake-intro.old.*`（首版）→ `.prev.*`（第二版）→
> 独立 intro（第三版）→ 合并进 `intro+loopAB` 母带（第四版，接缝修在内部）→
> `-newest`（第五版母带 + 第四版 loop 源，2026-09-28 深夜，母带与 loop 同批换）。
> 第四版母带存档为 `personalwebsite-awake-intro+loopAB.v4.*`；第三版 loop 源仍是
> `awake-loopAB-new.wav`（与第五版换稿前的 `personalwebsite-awake-loopAB.wav` 逐字节相同）。

## 2. 等响流水线

```
node design/audio/normalize-bgm.mjs              # 重跑：测量 → 定增益 → 编码 → 自检
node design/audio/normalize-bgm.mjs --check      # 只测量不写文件
node design/audio/normalize-bgm.mjs --src <目录>  # 换源目录
```

- **量什么**：EBU R128 积分响度（LUFS）＋真峰值，用 `loudnorm` 只读一遍。
  不用 RMS：K 加权计入高频，而两态的音色分工正是「醒＝更清晰、梦＝更模糊」，
  同样 RMS 下更亮的那条听起来更响，按 LUFS 才是听感对齐。
- **怎么对齐**：默认 `--align whole`——把一态的 **open+outro** 拼成一段 programme
  量积分响度（loop 已包含在 open 里，不重复计入），两态之间用**一个**增益差对齐。
  这样整态的内部起伏（intro→loop 的落差）原样保留，不重写编曲。
  代价是逐段仍有小残差，本轮实测 open 差 0.22 dB、loop 差 0.51 dB——loop 占播放
  时间的绝大部分，听感上足够。
  另有一档 `--align segment`：open/loop/outro 逐段各自对齐，换面时任何时刻都不跳音量，
  但会把 awake 自己的 intro→loop 落差改成 dream 的。
  **用户 2026-09-27 选定「先整体对齐」**，故默认 whole。
- **增益已收拢**：2026-09-28 深夜换 `-newest` 稿后全量重跑，awake 落在 **−7.89 dB**
  （新母带比上一版热约 2 dB，故比冻结期的 −5.87 dB 更退）；dream 是参考态，仍 0 dB。
  成片整态差 0.01 dB，逐段残差最大 1.41 dB（outro 段，整体对齐的必然代价）。
- **参考形态**：`dream`。它的电平即目标，一个 bit 不动；只调另一态。
- **编码**：始终从无损源编一次（`libmp3lame -q:a 4` ≈165 kbps），不二次编码；
  编完再量一遍，偏差超 0.25 dB 就用残余量从源重编。
- **自检**：最后拿真正要发布的六个文件拼成整态再量一次，两态差值与容差一起打印，
  报告落在 `design/audio/out/normalize-report.json`。
- **成片版本号与 OPEN_SEAM**：成片文件名是固定的（`wake-loop.mp3` 等），换稿后 URL
  不变，浏览器就会一直拿缓存里的旧曲子——早先 `fetch` 还带着 `force-cache`，更不回源，
  于是出现「线上文件明明已更新，耳朵听到的还是上一版」。故流水线按六个成片内容算
  一个短版本号，写进 **`src/data/bgm-assets.ts`**（生成物，**必须一起提交**），运行时
  装进 URL 查询串：`/audio/wake-loop.mp3?v=bc55ed38`。内容一变 URL 就变，缓存自然失效。
  同文件还带 `OPEN_SEAM`（开场母带里 intro→loop 的边界，秒）：开场中段被换面拦下时，
  运行时用它从 bed 接上 loop 的当前相位（见 §3.3）。

顺带一个体检脚本：`node design/audio/analyze.mjs <目录>`——看开场母带内部接缝、
开场尽头→loop 文件开头的虚拟接缝（bed 的接力点）、loop 自身循环边界、分段包络。
**换音频后建议先跑它**：循环文件若在末尾淡出、或长度不成整小节，`loop=true` 会在
接缝处留一记咔或错拍。

## 3. 运行时

`src/scripts/sound.ts`（`BaseLayout` 里在 `initReality()` 之后调用），微章在
`src/components/chrome/Sound.astro`（左下角常驻）。

### 3.1 时间线：一条弧线 + 墙钟锚点

弧线零点（`epoch`）＝ 开场开始那一刻的**墙钟毫秒**，存在 `sessionStorage['xm-sound']`：

```
t <  openDur        → 开场，从 open 的 t 秒处接上
t ≥  openDur        → loop，相位 = (t − openDur) mod loopDur
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

### 3.3 开场（open）

- **open**：一态一条（intro+一遍 loop 的合并稿）。首次开启按当时那一面从 0 接入；
  弧线还在 open 段内就接着放（关一下就回来时，开场也从中断处续上），过了就直接落
  bed。1.1 s 淡入。
- **预排接力**：bed 的起点在开场起步时就按音频钟排到开场尽头的那个采样点——
  Web Audio 本就支持排未来时刻，轮询只负责补迟到的缓冲。开场→loop 之间没有空档。
  （旧实现等 140ms 轮询在开场结束后补排 loop，会漏出 60–200ms 的静音，2026-09-28 修掉。）
- **开场中段换面**：intro 段内（弧线位置 < `OPEN_SEAM`）→ 收掉开场、bed 从 loop 0
  接上、这半段弧线抹掉；已在开场自带的 loop 一遍里 → 开场硬停、bed 按当前相位无缝
  续上、弧线向后挪一整个 loop——音乐不回头、不重播刚听过的那一段。
- **outro：运行时不用**（2026-09-27 用户裁定「结束时直接淡出，不需要再切换到 outro」）。
  关声＝ `master` 直接淡出 1.0 s（open / loop 一起收，所以开场演到一半关声也是同一条
  淡出），随后停源并 `ctx.suspend()`。`public/audio/*-outro.mp3` 与流水线里的 outro
  一格留着备查，但站上一个字节都不会请求它；要用回来，改 `haltPlayback()` 一处。

### 3.4 自动播放与省流

- **首屏绝不出声**，也不假装在播：首次开启必须是一次点击（浏览器策略）。
- 点开过之后，站内换页尝试直接续播；被策略拦下就**如实退回待开启态**（epoch 留着，点开即续上）。
- 未开启时**一个字节都不取**；开启后先要当前形态的 open（真要演开场时才等它），
  loop 并行起步，另一态 loop 随后预取（`requestIdleCallback` 带 timeout 兜底，
  页面常驻动画会把纯 idle 回调饿住）。outro 不在预取之列。
- 切走标签页：声音退到 0.22（「世界在此处悬停」），回来即复原；时间轴不中断。
- 关声后 `ctx.suspend()`，不留后台音频。

### 3.5 阅读页的页面级电平

长文页与关于页用 `BaseLayout` 的 `bgm="reading"` 声明意图（落到 `body[data-bgm="reading"]`），
整支曲子退 **−5 dB**（`sound.ts` 的 `READING_TRIM_DB`）——只是让开路，不是换一套音。
挂的是 `master`（进场包络那个节点），所以 open / loop 一起退，两态等响关系不变。
数字只在那一个常数里，改它两态同时挪。项目详情页若也想要，加同一个 prop 即可。

### 3.6 微章

左下角常驻（左中留给 Rail、首屏右下留给入梦检验标尺）。构型为**音律微弦 · 悬停舒展微章**（32×30px 半透明磨砂树脂微体）。
内部为 3 根极细（1.25px）光学声学发丝：静＝平卧浅灰短点（2.5px），响＝琥珀流光随质数周期呼吸起伏，梦面带有混响柔焦（`filter: blur(0.35px)`）。
常态零文字干扰；光标移入或聚焦时向右平滑舒展至 98px，文字恒定保持：醒面「环境声」↔ 梦面「回响」，开/关状态由后方徽标（ON/OFF）及微弦振幅呈现。文案随长按换面（`data-morph` + `data-dream`）；开关态由 `html[data-sound="on"]` 统一驱动，阅读页（`body[data-bgm="reading"]`）整颗自动退避至 48% 透明度。无 JS 时整块隐藏。样张在 `/styleguide/` §五。



## 4. 验收

```
npm run build                        # 必须 100% 静态编译通过
node design/.shot-styleguide.cjs     # 样式预览页截图（含微章样张）
node design/audio/normalize-bgm.mjs --check   # 换音频后：先确认两态仍等响
node design/audio/analyze.mjs        # 换音频后：接缝与循环边界体检
```

浏览器实测要点（dev 上有 `window.__sound.state() / .probe(ms)` 调试口）：

1. 点击开声 → `ctx: running`，`bedIn` ≈ 76.36（开场在演、bed 已预排在弧线 76.364 处）；
2. 开场走完 → `loops: wake:run dream:run`，两态同相位，接力处听感连续无空档；
3. 长按入梦 → 2.2 秒内 `mix` 0→1、两态增益沿 sin/cos 交叉、余量同步下压；
4. 开场中段换面 → intro 段内：bed 从 loop 0 接上、`arc` 重锚；loop 段内：
   `bedPhase` > 0、`arc` 向前跳一整个 loop（音乐不回头）；
5. 换页 → `arc` 连续、不开场重演；
6. 关声 → `master` 直接归零（不接 outro）、`ctx: suspended`、探针电平为 0；
7. 关 3 秒再开 → `arc` 接着走（不重置）；关 12 秒再开 → `arc` 重置到 ~0、开场从头；
8. 长文页 / 关于页 → `state().master` ≈ 0.562（−5 dB），首页为 1。

## 5. 已知取舍

- 两态的 open 是**不同形状**：dream 从近乎无声涨起来，awake 一上来就在。
  整体等响对齐的是积分响度，故开场头几秒两态仍有明显落差——这是编曲的性格差异
  （醒＝边界明确、梦＝模糊），不是没对齐。
- `awake-open` 的源母带真峰值 +0.16 dBTP（超界）；套上本态增益 −7.89 dB 后成片
  −7.37 dBTP，安全。若未来把 awake 调回 0 dB 附近，需先在源上留峰顶余量。
- 母带里的 loop 一遍与独立的 loop 源**不是逐样本同一渲染**（重渲染差异；两处边界
  实测与 loop 自身循环边界几乎一致，接力点成立，见 `analyze.mjs`）。若实听开场→loop
  的接力仍有可闻错位，后备方案：流水线改为从母带按 `OPEN_SEAM_SAMPLE` 切出 loop 成片
  （三处接缝同源），换稿时一并裁定。
- `dream-loop` 的真峰值 −0.77 dBTP，是全场最紧的一处；若要再压低整体，
  改 `normalize-bgm.mjs` 的 `ABSOLUTE_TARGETS`（一组数，两态一起挪）。
- 运行时不做整体衰减（`master` 从 1 起），交付的就是用户自己的电平；
  若嫌作为阅读背景偏响，在 `sound.ts` 的 `master` 上挂一个常数即可（两态同时降，等响关系不变）。
- **iOS 的侧边静音拨片会连 Web Audio 一起静掉**（`<video>` 不受影响、Web Audio 受影响）：
  拨片开着时页面管线照常运转、耳朵里却是无声，某些版本上是极低电平的失真残余
  （听感即「很小的杂音」）。JS 读不到拨片状态，属系统行为——排查「iOS 没声音」先看拨片
  （2026-09-28 实测归因：iOS 18.7 诊断数据全绿，ctx 恒 48k、mp3 解码样本数与源 wav
  逐样本一致、信号管线完好，而拨片开着时全程无声）。同日 AudioContext 改为随设备
  采样率创建（原先锁 48000）：锁固定率就得走 WebKit 的实时重采样（Bug 154538 一族
  的失真路径），跟随设备让 `decodeAudioData` 的离线重采样把 48k 素材对齐过去，更稳。
- mp3 的无缝依赖解码器按 LAME 标签裁掉编码填充：**Chromium 实测样点数与源 wav 逐个相等**
  （`design/audio/out/normalize-report.json` 的 `samples` 字段），故 `loop=true` 即刻无缝。
  换格式（如 ogg/opus）需重新验证这一条。
