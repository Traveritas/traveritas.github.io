# 主页方向决议（Phase 2）

日期：2026-09-19 ｜ 状态：融合方案已实现上线（用户未显式选择，按评审共识代选，可随时更换）

## 过程

三个静态方向稿在 `design/mocks/`（p2-a / p2-b / p2-c），两份独立评审（均先读了 design skills 与醒梦简报）结论：
两票 A>C>B、一票 C>A>B；三方一致：B 只作元素供体、A 的层三明治与 clip-path 磨砂实现必须继承、C 的"轴线即参数"是最有价值的交互语法、B 的巨构尺度要做大。

## 已实现的融合方案（src/pages/index.astro，样式全 scoped）

- **骨架 = C**：对角醒/梦轴线底色（左上冷雾蓝→右下暖灰粉，无硬边界）；"dream depth"将是 Phase 3 的全局交互参数
- **层次 = A**：宣言拆四块衬线文字碎片（大/小回声/小/大），末句没入巨构磨砂侧——"最后一层世界"恰是被稀释的字
- **尺度 = B**：巨构水晶切出画面上/右缘，骑跨边界；多晶面透明度差 + 1px 晶棱（non-scaling-stroke）+ 虚线错位晶面；梦侧 clip-path div + backdrop-blur 磨砂（弃 foreignObject）
- **导航 = C 竖排**：单列 vertical-rl + 短引线，hover 延伸（Phase 3 交互种子）
- 锚点照片贴巨构醒侧（picsum 占位，待换真照片）

## 评审必修项落实情况

✅ h1 语义（aria-label 完整宣言）｜✅ --ink-faint→#5f6a75、新增 --blush-ink #7c6068｜✅ blur 13→9px｜✅ reduced-transparency 回退｜✅ 矮视口（≤640h）回退｜✅ 移动端碎片流内化、照片 static、导航横排

## 待办（Phase 3 或以后）

- [ ] 思源宋体子集 webfont（Windows 下 SimSun 合成加粗观感差；宣言用字仅几十字，子集很小）
- [ ] 锚点照片换真实照片（处理已定：grayscale 0.85 + 白框）
- [ ] "哈气擦霜"交互：指针靠近巨构磨砂区局部除雾（hover 过渡版已具备升级路径）
- [ ] 醒/梦轴线参数化：--threshold 变量驱动渐变极点/磨砂强度/（Phase 3）3D 碎块材质
- [ ] 换方向备份：用户若偏好 A/B/C 原样，对应 mock 在 design/mocks/，一句话可切换实现
