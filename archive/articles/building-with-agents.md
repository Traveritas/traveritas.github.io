---
title: 与智能体一起造一个网站
description: 记录这个站点的另一种建造方式：我出方向，智能体出手。
date: 2026-09-19
tags: [建站, 智能体]
---

这个网站不是我一个人写出来的——准确地说，一行代码都不是我写的。

## 分工

我的角色是：描述我想要什么、判断什么是对的。智能体的角色是：调研技术方案、写代码、修 bug、验收页面。我了解 HTML/CSS/JS 的基本原理，足以让我看懂它在做什么、提出正确的问题；但产出全部来自智能体。

这个模式有趣的地方在于，选型的逻辑变了。我们最终的选择（Astro、GSAP、Three.js、零后端）不是因为它们对人类新手最友好，而是因为它们**经得起智能体的反复修改**：每一页自包含、内容与样式分离、改任何一处都不容易碰坏别处。

## 一页只说自己是什么

落到文件上，一页只说清三件事：取什么数据、它是什么、正文放在哪。排版不写在这一页里。

```astro
---
const { entry } = Astro.props;
const stage = STAGE_INFO[stageAt(nightMin(entry))];
---

<BaseLayout title={entry.data.title} type="article" rail={{ mode: 'depth', station: '入梦 · 阅读' }}>
  <article class="prose prose--essay">
    <h1 data-morph data-true={entry.data.title}>{entry.data.title}</h1>
    <div class="md"><Content /></div>
  </article>
</BaseLayout>
```

文案、栏目、这一页的排版，改动分别落在三个文件里。所以它可以被反复改版，而每次改版都不必从头相信一遍整站。

## 它会变成什么

我预计这个网站会经历很多次大幅改版——可能某天醒来觉得首页整个不对，就让它重来一遍。传统手工作坊式的网站经不起这样折腾，而「版本控制 + 智能体」的方式可以。

这是这个站点的小小实验之一：**把网站当作可以反复梦见的物体**，而不是一次成型的交付物。
