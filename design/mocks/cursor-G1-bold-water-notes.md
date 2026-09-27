# 变体 G1-Bold · 大胆重晕流体水形与无缝连续性 · 实测笔记

## 1. 核心主张与审美升级
基于 G1 重晕光轮（Double-Halo）演进，响应用户对于“形变更大胆、更像真实水滴、杜绝高速骤停突变、悬停微克制”的诉求：
突破传统椭圆凸轮廓（Convex Ellipse），重构内外双层为具有水腰微内凹（Concave Waist）与后曳微弧水裙（Trailing Water Skirt）的非对称水流形态；引入连续二阶光滑耗散动力学，实现高速移动到静止的无缝物理衰减。

## 2. 大胆水形与非凸流体算法（Bold Organic Water Flow）
- **内核水滴凝露（.water-inner-dew + .water-inner-tail）**：
  直径 20px 高凝聚度基底。运动时后曳水滴尖尾平滑显影，沿流线形成前圆后敛、两侧微向内束（Concave Waist）的真实水滴轮廓，最大拉伸 clamp $\le 1.14\times$。
- **外轮微弧水裙（.water-outer-halo + .water-outer-skirt）**：
  直径 46px 月晕环。随流速增大，被表面张力甩出一圈非对称轻柔水波与外展水裙（$Y=\pm 23\text{px} \to 17\text{px}$ 束腰 $\to 24\text{px}$ 裙翼），并叠加迎风微幅谐波摆动（$\text{waverAmp} \le 3.5^\circ$），呈现真实水面张力撕扯与涌动感。
- **悬停等比克制（Hover Link）**：
  摒弃扁平化变形，外轮严格等比扩至 $1.18\times$（$54.3\text{px}$），内核等比 $1.12\times$（$22.4\text{px}$），内晕泛起淡淡琥珀温光，取景框圆润克制，绝不压扁或突兀。

## 3. 连续光滑耗散模型（彻底消除停下突变 Pop）
- **流体真实物理位移微分**：废弃依赖浏览器鼠标事件离散间隔的粗暴 $\Delta x/\Delta t$（消除 40ms 延迟死区），改由内核层连续平滑轨迹微分得出即时流速 $\vec{v}_{\text{fluid}}$ 与流向角 $\theta_{\text{flow}}$。
- **连续二阶耗散滤波器**：停下手感不再硬切。指针骤停时，流体按时间常数 $\tau_{\text{outer}} = 115\text{ms}$、$\tau_{\text{inner}} = 80\text{ms}$ 继续平滑推移与微过冲缓冲；形变因子 $f_{\text{skirt}}$ 与拉伸张力沿连续指数曲线自然耗散归零。
- **绝对连续变换矩阵**：DOM 变换结构恒定为 `translate3d(x,y,0) rotate(θ) scale(sx,sy)`，杜绝 `rotate` 条件剔除导致的 1 帧跳跃；收敛阈值达到严密亚像素精度（误差 $< 0.06\text{px}$）后自然休眠，人眼全过程零感知断层。

## 4. 实测与自检数据（.shot-cursor.cjs 验证）
- **自动化测试**：控制台错误 0 · 页面错误 0 · 失败请求 0。
- **热点同帧偏差**：`dx: 0 · dy: 0 · dist: 0.00px`（1:1 同步定锚，零延迟）。
- **静息性能**：停止移动后平稳收敛，静息 5s 内严格 0 次 rAF（`rafLast5s: 0`），收敛时 `will-change: auto`。
- **DOM 纪律**：逐帧严格只写 `transform` 与 `opacity`，节点池固定为 16 个元素，零每帧对象分配。
- **全矩阵状态覆盖**：
  1. `rest`：正向双层微呼吸，内核凝润，外轮柔和吐纳（3.6s 纯 CSS 驱动）；
  2. `move`：非凸双层水形涌现，微内凹水腰与微弧水裙迎风轻摆（图 `11-move.png`）；
  3. `hover-link`：外轮等比扩至 1.18x，内核等比 1.12x，琥珀温光隐现（图 `05-hover-link.png`）；
  4. `hover-text / input`：外轮隐退，内核缩为 1.8px 磨砂光导线，文字 100% 畅通（图 `06-hover-text.png`）；
  5. `click`：内核微缩，外轮荡开极细衍射波纹（图 `07-click.png`）；
  6. `hold / latch`：外轮超速坍缩穿透内核，满格瞬间凝铸为 45° 实心琥珀结 ◆（图 `08-hold.png`, `09-latch.png`）；
  7. 降级：`cursor=off`、`reduced=1`、`forced-colors`、触控/笔全线安全回退原生指针。
