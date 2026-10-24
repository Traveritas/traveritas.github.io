# 项目页补充草稿 · GitHub 上的造物

> **2026-10-24 已按本稿落成。** 写进了 `src/content/projects/`：`petween.md`（date 取家族里最早的 2026-08-21）、
> `memepanel.md`、`nexus.md`、`kimi-code-theme-editor.md`、`inkprint.md`，五份都已去掉 `draft`（正文留空，先上页面）；
> `FancyText 样式包` 按批注并进了 `fancytext.md` 的 `links`；`PhysForge`、`AgentHub` 标注「不加」，未落。
> 编号实测：Kimi Code 配色编辑器 PRJ-01（08-19）、Petween PRJ-02（08-21）、
> 昼梦叙集 PRJ-03（09-19）、FancyText PRJ-04（09-20）、MemePanel PRJ-05（09-21）、NEXUS PRJ-06（10-07）、Inkprint PRJ-07（10-23）。
> 正文与 `note` 还没写，之后补上即可。

只写**题目与简介**（外加 `date` / `links` 两个必要字段），正文留到后面再写。
确认哪些要收之后，把下面每一块复制成 `src/content/projects/<文件名>.md`，补上正文，再把 `draft` 改成 `false`。

两点提醒：

- **编号按 `date` 先后自动排**（最旧的 PRJ-01）。站上现有两条是 `personal-website`（2026-09-19）与 `fancytext`（2026-09-20）；若照仓库创建日填，`kimi-code-theme-editor` 等会插到它们前面，把现有编号整体后移。想保持现状，就给新条目填 2026-09-21 之后的日期。
- **状态与链接标签按自己的口吻写**。`INDEV` / `ALPHA` / 情绪短句都行；链接标签写仓库名或「GitHub 仓库」，不贴被动状态签。
- 已归档的 `petween-dsh` / `petween-desktop` / `petween-physics` 不单列条目，只作为 Petween 的链接出现。

---

## 一、建议收录

### 1 · Petween

```yaml
title: Petween
description: 跨 agent、高自由度插件化的桌面宠物
date: 2026-10-21
links:
  - label: GitHub 仓库
    href: https://github.com/Traveritas/petween
  - label: petween-dsh（前身）
    href: https://github.com/Traveritas/petween-dsh
  - label: petween-desktop（前身）
    href: https://github.com/Traveritas/petween-desktop
  - label: petween-physics（插件前身）
    href: https://github.com/Traveritas/petween-physics
status: INDEV
draft: true
```

正文可写的方向：宠物读的是 agent 的真实状态（思考 / 写码 / 跑命令 / 等授权 / 成功 / 出错）、
少量静态图交给程序化 Motion Engine 生成漫画式过渡、宠物包与动画包可以分享、几乎一切功能都是插件。
若要拆成三条（独立桌面版 / DSH 插件 / 抛掷物理），也可以，但三个仓库里有两个已经归档。

### 2 · MemePanel

```yaml
title: MemePanel
description: 极致轻量的表情包抽屉
date: 2026-09-21
links:
  - label: GitHub 仓库
    href: https://github.com/Traveritas/MemePanel
status: ALPHA
draft: true
```

### 3 · NEXUS

```yaml
title: NEXUS
description: 𝙽✦𝙴✦𝚇✦𝚄✦𝚂
date: 2026-10-07
links:
  - label: GitHub 仓库
    href: https://github.com/Traveritas/nexus
status: ALPHA
draft: true
```

### 4 · Kimi Code 配色编辑器

```yaml
title: Kimi Code 配色编辑器
description: Kimi Code CLI 实时预览配色工具
date: 2026-08-19
links:
  - label: GitHub 仓库
    href: https://github.com/Traveritas/kimi-code-theme-editor
  - label: 在线页面
    href: https://traveritas.github.io/kimi-code-theme-editor/
status: ARCHIVED
draft: true
```

标题也可以用仓库名 `kimi-code-theme-editor`；`在线页面` 这条与仓库地址同源，要精简就只留仓库。

### 5 · FancyText 样式包

```yaml

```

不单列，改成现有 `fancytext.md` 里的一条 `links`。

### 6 · Inkprint

```yaml
title: Inkprint
description: 个人文风skill：学习你的文字风格。
date: 2026-10-23
draft: true   # 仓库尚未公开，先不给链接
```

仓库现在是私有的：要么先写进草稿、置 `draft: true` 不公开，要么等公开后再补 `links`。

### 7 · PhysForge

```yaml
不加
```

### 8 · AgentHub

```yaml
不加
```

---

## 二、要你拍板的几条

| 项 | 情况 | 待定 |
| --- | --- | --- |
| Pebrel | 是 `Kuddev/pebrel` 的 fork，本地却挂着 `Traveritas` 的远端 | 当自己的项目写，还是当参与的项目写，还是不提 |
| YourTJ-Hub / YourTJ-Wiki | 同济校园社区的论坛与知识库，均为 fork（上游 `YourTongji`） | 同上 |
| OpenAI4S | fork（上游北大—元空实验室） | 一般不收，除非你要写「参与/跟进」 |
| SOB-Quant | 公开仓库，但 README 只有 `TBA` | 要么补一句它是什么，要么先不收 |
| TRAVERITAS-legacy | 旧站（Vite + React，已归档） | 是否留一条「旧址」，或干脆不提 |
| collision / phy-collisionlab / PhyexperimentCollection / Fill-rectangle-with-polygons | 早期零散练习，私有 | 默认不收 |

---

## 三、可选的正文骨架

若之后要顺手把正文补上，项目页的常用骨架是：

```md
一句话说明这个项目要做什么。

## 意图
- 它要解决什么、为什么值得做
- 边界：明确不做什么

## 形态 / 路径
- 关键机制或技术选择
- [x] 已经完成的一步
- [ ] 正在进行的一步
```

`:::wake` / `:::dream` 块与 `[[醒|梦]]` 换字在项目页同样可用（写法见 `docs/writing.md`）。