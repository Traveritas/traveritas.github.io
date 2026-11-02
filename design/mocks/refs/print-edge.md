# 印刷与编辑气质 · 边怎么做出味道

2026-11-02 · 参考调研，只读。
对象：`cards-r5` 那张卡（三栏底图 / 衬线标题 / 系统无衬线正文 / 左下 1.25px 星）。

---

## 0 先量一件事：底图是 5px 的网点

`cards-r5/shared/plate-1440.png` 不是连续调图像，它是一张 **288×180 的方块网点图被整数放大 5 倍**得到的：

| 检查 | 结果 |
| --- | --- |
| 5px 网格内同色率 | **98.4%** |
| 2px / 3px / 4px / 6px 网格 | 15% / 23% / 32% / 48%（不同色） |

三栏实测色：冷灰 `#b9c6d9`，薄暮紫 `#271d31`，深蓝 `#14273b`。在薄暮紫栏横向采样，亮度只有 39 / 42 / 46 / 49 / 52 五档，每 5px 跳一次。

**推论（后面每一招都从这里来）：**

1. 这张图上任何「面」的边界，最小单位是 **5px**。卡片现在那条 1px 的描边，比底图的像素栅格还细五倍——它读起来像贴上去的，不是审美分歧，是分辨率分歧。
2. 0.5px 是最坏的位置：既不够锐利到当矢量，也不够宽到当纸。
3. 唯一**应该**锐利到 1px 的东西是内容：标题、正文、那颗星。它们本来就是刻上去的。

所以「一个边」要成立只有两条路：把边的过渡铺到 ≥4px，让它落回这张图的栅格里；或者明说它是矢量物，只留给星。

---

## 1 候选清单 12 条

| # | 名称 | 来源 | 链接 | 一句话 |
| --- | --- | --- | --- | --- |
| 1 | Rembrandt《三棵树》1643 | 铜版画（美国国会图书馆藏本） | [Commons](https://commons.wikimedia.org/wiki/File:The_three_trees%29_-_Rembrandt_f_1643_LCCN96507706.jpg) | 边的原型：铜版压进纸里，留下的不是线，是一条内深外浅的压痕。 |
| 2 | 18 世纪《公祷书》书口烫金（已开裂） | 装帧实物 | [Commons](https://commons.wikimedia.org/wiki/File:Book_of_common_prayer_-_Fore_edge_%28c66b20%29.jpg) | 边是材料的断面：金面、纸叠、板芯三层挤在同一毫米里。 |
| 3 | 手工亚麻纸毛边 | 造纸 | [Commons](https://commons.wikimedia.org/wiki/File:Deckle_edge_flax_paper.jpg) | 毛边不是「糙」，是厚度递减到透光——边比面更亮更薄。 |
| 4 | Hansje van Halem | 荷兰设计师 / 丝网 | [hansje.net](https://www.hansje.net) | 字大到被裁切线切掉：字和边不是两个东西。 |
| 5 | Karel Martens《Untitled》2015 | Walker Reader / CCVA | [站](https://www.walkerart.org/reader/karl-martens-prem-krishnamurthy-project-projects-p) · [展页](https://carpenter.center/program/karel-martens-monoprints) | 凸版单印在**捡来的卡**上：边属于被印的那张卡，不属于设计。 |
| 6 | Irma Boom《Sheila Hicks: Weaving as Metaphor》2006 | MoMA 藏 | [MoMA](https://www.moma.org/collection/works/110944) | 厚的书芯本身就是设计；合上时你先看见的是那叠纸的切边。 |
| 7 | Josef Albers《Graphic Tecture》1942 | 盲压版画集 | [Albers Foundation](https://www.albersfoundation.org/art) | 完全不落墨的边——只有纸被压下去的形，斜光才看得见。 |
| 8 | Roma Publications | 荷兰出版社 | [romapublications.org](https://www.romapublications.org) | 书目做成严格表格：编辑气质来自栏线的克制，不是装饰。 |
| 9 | libraryman | 瑞典摄影书出版社 | [libraryman.se](https://libraryman.se) | 每张图都给足白边，边由「留给纸的空」承担。 |
| 10 | The Serving Library | Dexter Sinister | [servinglibrary.org](https://www.servinglibrary.org) | 出血、裁切线、装裱框被当成版面语法用，而不是工艺标记。 |
| 11 | Corita Kent | 丝网版画 / Corita Art Center | [corita.org](https://www.corita.org) | 套色错开半毫米，颜色自己长出一条边。 |
| 12 | Letterform Archive | 印刷品档案 | [letterformarchive.org](https://www.letterformarchive.org) | 高清扫描能看清纸边、压痕、油墨渗进纤维的那 2px。 |

---

## 2 深读 5 条：边是怎么长出来的

五种机制：**压 / 镀 / 撕 / 错 / 留**。

### 压 · Rembrandt《三棵树》(1643)

![铜版压痕](shots/ref-01-platemark.jpg)

原图 `shots/_src-rembrandt.jpg`（约 9,280×6,768 的国会图书馆扫描，[Commons 页](https://commons.wikimedia.org/wiki/File:The_three_trees%29_-_Rembrandt_f_1643_LCCN96507706.jpg)）。

- **边**：画面之外没有「线」，只有一条 0.5–1px 的压痕，压痕外面是 3–6px 的极淡灰晕——纸被压薄了，透出下面的底。四边**不等重**：下缘最重，右缘几乎只剩一道。它是压出来的，不是描出来的。
- **面**：纸是暖米色，墨是冷棕黑。墨最浓的地方不在边上；边是「半压半透」的那一段，深浅靠纸的形变，不靠墨量。
- **字**：画面里没有字。可借的只有一条——内容一直压到版口，不留内边距。
- **味道在哪**：边上有「力气」的痕迹，所以它属于这张纸，不属于这张图。

### 镀 · 18 世纪《公祷书》书口

![书口烫金](shots/ref-02-foreedge.jpg)

原图 `shots/_src-foreedge.jpg`（书口正视 + 比例尺，[Commons 页](https://commons.wikimedia.org/wiki/File:Book_of_common_prayer_-_Fore_edge_%28c66b20%29.jpg)）。

- **边**：三层挤在一个毫米里——烫金面（镜面）、纸叠的竖纹（透光）、板和金之间的裂缝（露出深棕的板芯）。金在四个角上碎了；**碎掉的地方比完整的地方好看**。
- **面**：金不是一种颜色，是一面镜子；它在暗处是暗的，在光下才亮。所以这条边在深色底上会「消失」，在亮处会「跳」。
- **字**：书口这一面完全没有字，字全部退到板上去。留白是实打实的一块材料。
- **味道在哪**：边是断面——你能看出这本书是由什么做的。

### 撕 · 手工纸毛边

![毛边](shots/ref-03-deckle.jpg)

原图 `shots/_src-deckle.jpg`（亚麻纸，[Commons 页](https://commons.wikimedia.org/wiki/File:Deckle_edge_flax_paper.jpg)）。

- **边**：纤维一根根断开，振幅 1–3px。但关键不是「糙」，是边缘的纸**变薄**——所以它比纸面更亮、更透、还带一点透光的暖。它下面那层毡子透上来，边上是两种材料在混。
- **面**：纸面本身有云状的厚薄差（云斑），边只是这个厚薄差走到尽头。
- **字**：无。
- **味道在哪**：毛边的味道来自「变薄」，不是「变糙」。糙是装出来的，薄是真的。

### 错 · Hansje van Halem

![海报堆叠](shots/ref-04-hansje-stack.png) ![套印错位](shots/ref-04b-hansje-misreg.png)

全页 `shots/hansje.png`（[hansje.net](https://www.hansje.net)）。

- **边**：两处。一处是两层颜色错开 0.5–2mm，边自己长出第三种颜色（红压绿出褐）。另一处是**三张同样的海报错开叠着**——边变成一组平行线，而不是一根线。
- **面**：荧光油墨不透明，叠一次换一次色；纸面是哑的，所以亮色不反光，只有明度在跳。
- **字**：字大到被裁切线切掉。字母的下缘齐着纸边消失，字直接成为边的一部分。
- **味道在哪**：错误（错位）被留下来了，所以它看起来是「印过」，不是「画过」。

### 留 · libraryman（Halard 画册页）

![画册页边](shots/libraryman.png)

[libraryman.se](https://libraryman.se) 首页（原页标注：pigment ink on 186 gsm matte non-woven paper）。

- **边**：没有线。每张图外面是一圈 8–12px 的白，这圈白和页面的白是同一块——边由「空」承担。
- **面**：图是颜料墨印在哑光无纺纸上；纸的白偏暖，图里的黑偏冷。冷暖差本身就在划边。
- **字**：图注极小、极靠边、字距拉开，位置在图的下缘外侧，绝不进入图。
- **味道在哪**：你分不清哪里是图的边、哪里是纸的边——这正是「印在纸上」的证据。

---

## 3 可借的三招

### 招一 · 把边做成「压痕带」，不是描边

一根线的边是「画的」；一条带的边是「压的」。做法：内层渗墨 + 外层落影，铺开到 4–5px（正好是底图的栅格），再按底色的极性换符号。

```css
/* 浅底（#b9c6d9）：墨往外渗——内侧一根墨线，外侧淡开 */
.card-l{
  box-shadow:
    inset 0 -0.6px 0 rgba(26,20,30,.30),   /* 下缘墨池 */
    inset 0 0 1.6px rgba(26,20,30,.10),    /* 内侧渗墨 */
    0 0 1.5px rgba(26,20,30,.10),          /* 外侧开始散 */
    0 0 4px  rgba(26,20,30,.05);           /* 散到 4px */
}
/* 深底（#271d31 / #14273b）：墨压不出更暗，边只能是「纸芯露出来」 */
.card-d{
  box-shadow:
    0 0 0 .5px rgba(190,212,255,.15),      /* 纸芯：一圈 0.5px 的亮 */
    0 0 2px rgba(0,0,0,.35),               /* 紧贴外沿的落影 */
    inset 0 -.6px 0 rgba(0,0,0,.60),
    inset 0 0 1.8px rgba(0,0,0,.30);
}
```

同一个物理故事，两种符号：浅底是「墨往纸里渗」，深底是「纸芯露出来」。深底的亮线 **15% 是上限**，20% 起立刻变回描边。

三栏要三组数（这是实测出来的，不能共用）：

| 栏 | 外圈 0.5px 亮 | 外落影 | 下缘墨池 | 内侧渗墨 |
| --- | --- | --- | --- | --- |
| 冷灰 `#b9c6d9` | — | `0 0 1.5px rgba(26,20,30,.10)` + `0 0 4px rgba(26,20,30,.05)` | `inset 0 -.6px 0 rgba(26,20,30,.30)` | `inset 0 0 1.6px rgba(26,20,30,.10)` |
| 薄暮紫 `#271d31` | `0 0 0 .5px rgba(255,255,255,.13)` | `0 0 2px rgba(8,5,12,.30)` | `inset 0 -.6px 0 rgba(8,5,12,.55)` | `inset 0 0 1.6px rgba(8,5,12,.22)` |
| 深蓝 `#14273b` | `0 0 0 .5px rgba(190,212,255,.15)` | `0 0 2px rgba(0,0,0,.35)` | `inset 0 -.6px 0 rgba(0,0,0,.60)` | `inset 0 0 1.8px rgba(0,0,0,.30)` |

### 招二 · 版口：外面 6–7px 再压一条 0.5px

压痕不是一条，是「画面边界 + 外面的那圈压力」。加一条离边 7px 的 0.5px 线，透明度只有内层的三分之一，卡片就从「浮在画面上的面板」变成「印在这张纸上的一个版」。

```css
.card::after{
  content:""; position:absolute; inset:-7px;
  border-radius:10px; border:.5px solid rgba(255,255,255,.07);
}
.card-l::after{ border-color: rgba(26,20,30,.08); }   /* 浅底反号 */
.card-d::after{ border-color: rgba(255,255,255,.07); }
```

硬规则：**外层 α ≤ 内层的 1/2，间距 ≥ 6px**。间距缩到 4px 或 α 过 8%，它立刻变成「双描边」，味道全丢。

### 招三 · 只给星做套印错位

整张卡都锐利时，1.25px 是错的；只有一处锐利时，它是「刻」的。所以把错位只放在星上：同一根 1.25px 的线画两遍，第二遍错 0.6px、换成暖色，读起来是油墨没对准，不是加了描边。

```css
.star path.real  { stroke:#d3e0f2; stroke-width:1.25; }
.star path.ghost { stroke:rgba(236,158,120,.42); stroke-width:1.25;
                   transform:translate(.6px,.6px); }
/* 薄暮紫栏降到 .34；浅灰栏反过来，用冷色 ghost */
```

实测 `shots/_crop-star-d.png`（带错位）vs `shots/_crop-star-plain.png`（单根线）：放大 6 倍才看得见星右下那半毫米的暖边；1x 下看不见「两条线」，只看见「颜色不干净」——要的就是这个。0.6px 是关键数字：到 1px 就成了重影，小到 0.3px 又读不出来。

---

## 4 一条别学

**别做「纸感滤镜」四件套：噪点层 + 撕边 + 四角裁切标记 + 暖棕调色。**

具体到这张底图，有两个硬理由，不是口味问题：

1. 底图已经是 **5px 的方块网点**。再叠一层 1px 的噪点，是两种颗粒在同一张图上打架，结果只有一个字：脏。真正的印刷颗粒会服从同一个栅格，不会叠第二套。
2. 三栏靠的是冷色（`#b9c6d9` / `#271d31` / `#14273b`）。「做旧」的动作全都是往暖棕拉——蓝色先死，然后那颗星的冷白也一起死。

最隐蔽的一种变异是**把版口做成四角的裁切标记**（crop marks）：那是印厂给刀看的，不是给读者看的。搬上卡片，就是把工艺的**记号**当成了工艺本身。

---

## 5 附：四个变体的实测

页面 `probe.html` / `probe2.html` / `probe3.html`，截图 `shots/probe*.png`，3 倍放大对比见 `shots/_sheet-mid.png`。

| 变体 | 做法 | 结果 |
| --- | --- | --- |
| 对照 | `border:1px solid rgba(255,255,255,.18)` + 半透底 | 一根均匀的线，**读作 UI**，和底图不在一个栅格里。 |
| V1 压痕 | 内墨 + 外光，不对称 | 唯一读作「材料」的一条。**但三栏要三组数**：同一组数值在浅底和深底上差 3 倍以上。 |
| V2 书口 | 外面再叠两根递减的线（`0 0 0 1.5px / 2.5px`） | 3 倍放大很好看，**1x 退化成双描边**——正是第 4 节说的俗套。看着好，用不了。 |
| V3 套印 | 卡片边缘两层错 0.5px 的色环 | 卡片尺度上几乎不可见，只有一点浑。**所以套印只给星。** |

需要说清的一条矛盾：极简要求「一个边、一组数」，而这张底图要求「三种纸、三组数」。这个矛盾没法靠调参消掉，只能靠**把边的定义从「一条线」换成「一条带」**——一条带可以有方向，方向可以随栏变，而线不能。
