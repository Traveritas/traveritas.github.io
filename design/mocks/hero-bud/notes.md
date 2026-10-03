# 晶苞 · 首屏圆区主体

已接入 `/new/`：`src/scripts/home-bud.ts` 播放 `public/hero-bud/` 的逐帧 WebP。

## 形态

- 醒：六方双锥冰晶，12 片厚玻璃板拼成，中空，内含一团淡暖光。12fps 连续自转。
- 梦：折面瓣（`DREAM_MODE = "fold"`）。上六片三长三短，在中段一道直折痕处外折（外轮 62°、内轮 42°），下托松开下沉，暖光上浮。4fps 跳格，3° 一格。
- v1（平滑外卷）在 `v1/`；四种梦面形态对比在 `compare/`。

## 帧与循环

| 序列 | 渲染 | 站点用 | 角度 |
| --- | --- | --- | --- |
| wake | 40 帧 | 40 帧 | 0–60°，六重对称循环 |
| open | 40 帧 | 40 帧 | 0–60°，醒 → 梦，旋转不停 |
| dream | 80 帧（1.5°/帧） | 40 帧（隔帧取） | 60–180°，三重对称循环 |
| close | 40 帧 | 40 帧 | 60–120°，梦 → 醒 |

首尾衔接：open 首帧 = wake 首帧；open 末帧 → dream 首帧；close 首帧 = dream 首帧；close 末帧 → wake 首帧。

## 改模型后重渲

```sh
# 场景、材质、姿态都在 bud.py；bud.blend 是 build() 后的醒面静帧场景，仅供手动查看
BUD_DIR=<本目录> BUD_MODE=fold BUD_SAMPLES=96 BUD_RES=800 \
  blender -b --factory-startup -P render_seq.py -- <本目录>/frames wake open dream close
sh convert.sh          # → frames-webp/（本目录 mock 页用）
sh export-public.sh    # → public/hero-bud/（站点用，Q=78，梦面隔帧取）
```

- `render_seq.py` 跳过已存在的帧；重渲某段前先删掉 `frames/<段>/`。
- 醒面与 `DREAM_MODE` 无关，换梦面形态只需重渲 open / dream / close。
- RTX 4060 + CUDA 约 10 秒一帧（OptiX 内核在本机加载失败）。
- `frames/` 是 PNG 中间产物（约 70MB），不入库。

## 性能

- 页面 load 后空闲时开始拉帧，4 路并发；先醒面，再 open / dream / close。共 160 帧约 2.8MB。
- 只常驻压缩数据，按需 `createImageBitmap` 解码，最多缓存 10 张位图。
- 收拢（`html.ls-folded`）或标签页隐藏时停帧；`prefers-reduced-motion` / 省流量只画当前面一张静帧。
- 实测（1440×900，DPR 1，dev 服务器）：梦面每 4 秒脚本约 15ms，醒面约 21ms；收拢后约 0。
