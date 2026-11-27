// Metadata for AveritA Sound Proposal Audition Lab (Batch 1 + Batch 2 + Batch 3)
window.SFX_CATALOG = {
  batches: [
    {
      id: "batch3",
      label: "第三批 · 醒梦灵感 (I–J)",
      dirs: ["i", "j"],
      bonusBatch: 3,
      note: "回到网站本身的气质：像素流光地面与玻璃插值的双质地（DIR I），以及绒槌微音与琉璃杯缘的微温透明（DIR J）；音高贴合站内实测 BGM（F 小调 / Bb 小调 / Ab 大调），用柔丝绒空间替代金属感混响。"
    },
    {
      id: "compare_b1",
      label: "横向对照 · I–J vs 第一批 (A / B / D)",
      dirs: ["i", "j", "a", "b", "d"],
      bonusBatch: 3,
      note: "把第三批（I / J）与第一批最贴近气质的 A / B / D 并排试听，直接对比质感、空气感与耐听度。"
    },
    {
      id: "batch1",
      label: "第一批 · 初始对照 (A–D)",
      dirs: ["a", "b", "c", "d"],
      bonusBatch: 1,
      note: "保留第一批完整 36 条带调性/FDN 混响的原始试验稿，便于回听对比。"
    },
    {
      id: "batch2",
      label: "第二批 · 反套路物理/干空间 (E–H)",
      dirs: ["e", "f", "g", "h"],
      bonusBatch: 2,
      note: "保留第二批无音高物理拟音与干空间试验稿。"
    },
    {
      id: "compare_d",
      label: "旧对照 · D vs E–H",
      dirs: ["d", "e", "f", "g", "h"],
      bonusBatch: 2,
      note: "保留此前 D 与 E–H 的横向对照视图。"
    }
  ],

  directions: [
    {
      id: "a", batch: 1, code: "DIR A", name: "晶棱回响", en: "Crystalline Hall",
      tagline: "第一批初始设想：石英模态泛音 + FDN 大厅混响",
      desc: "石英/薄玻璃物理模态泛音 + 空气瞬态起音 + 8 通道 Hadamard FDN 立体声大厅混响与八度微光尾音。",
      feel: "空灵 · 有音高 · 长混响",
      ref: "visionOS × Monument Valley × Sky"
    },
    {
      id: "b", batch: 1, code: "DIR B", name: "薄雾光格", en: "Optic Loom",
      tagline: "第一批节奏转译：100ms 像素分格步进谐波",
      desc: "把换页 PULSE (9×100ms) 与 NEXUS 门 DOOR (9×120ms) 步进节奏做成阶梯谐波颗粒 + 毛玻璃频扫。",
      feel: "光学 · 节奏同步 · 柔和",
      ref: "AveritA 视觉节拍 × NieR UI"
    },
    {
      id: "c", batch: 1, code: "DIR C", name: "水石微尘", en: "Mineral & Dew",
      tagline: "第一批自然声学：水琴窟气泡与空腔石钵",
      desc: "Minnaert 上扬气泡水滴 + 空腔石钵共振 + 玉石阻尼击打与庭院混响。",
      feel: "有机 · 清冽 · 水石共鸣",
      ref: "Zelda BotW × Gris × 水琴窟"
    },
    {
      id: "d", batch: 1, code: "DIR D", name: "星仪冷脉", en: "Celestial Tactile",
      tagline: "第一批优选：干脆近场微机械卡榫（但仍带微音高）",
      desc: "极短、干脆、零拖沓的表冠/星盘微机械卡榫；第二批 DIR E 即在其触感底盘上彻底去音高、去廉价混响演化而来。",
      feel: "精密 · 干脆 · 近场触点",
      ref: "PS5 系统 UI × Teenage Engineering"
    },
    {
      id: "e", batch: 2, code: "DIR E", name: "精密光机", en: "Optical Precision",
      tagline: "D 的高工艺进化：零音高、零混响尾、纯双耳早反射",
      desc: "粘滑表面微摩擦 (stick-slip) + 三段式光圈快门卡榫 + 15–38ms 零尾音双耳早反射 + 气压呼吸，质感接近徕卡镜头与蓝宝石表冠。",
      feel: "无音高 · 极致干脆 · 近场立体",
      ref: "Leica 镜头光圈 × Apple 触觉引擎"
    },
    {
      id: "f", batch: 2, code: "DIR F", name: "气动霜雾", en: "Aero Spectral",
      tagline: "不用混响和铃声也能做出的「高级空间空灵感」",
      desc: "用 STFT 相位弥散霜雾、双共振峰气帘扫频、反向负压吸气与石英微尘颗粒塑造冷冽透明的空间深度，完全告别 AI 叮叮声。",
      feel: "无音高 · 冷冽空气感 · 零混响泥糊",
      ref: "高山天文台玻璃呼吸 × 声音设计 Foley"
    },
    {
      id: "g", batch: 2, code: "DIR G", name: "哑光陶石", en: "Matte Ceramic",
      tagline: "高阻尼建筑材质拟音：素烧白瓷、湿润板岩与黑曜石",
      desc: "2D 非谐波薄板极短内阻尼击打（零金属余振）+ 石面滑动摩擦 + 干爽建筑室几何早反射，沉静、温厚、不廉价。",
      feel: "无音高 · 温厚哑光 · 建筑质感",
      ref: "京都庭院石材 × Bang & Olufsen 触感"
    },
    {
      id: "h", batch: 2, code: "DIR H", name: "频散晶箔", en: "Dispersive Foil",
      tagline: "非套路实验合成：高阶全通声波频散 × 重阻尼微箔",
      desc: "18–64 阶全通波导让高频跑得比低频快，形成类似冰裂/液态玻璃折射的奇异物理「频散拉链」感，配重阻尼微弦与干空间。",
      feel: "前卫 · 晶体折射感 · 非铃声非正弦",
      ref: "声学色散物理建模 × 4D 超立方折射"
    },
    {
      id: "i", batch: 3, code: "DIR I", name: "柔格折光", en: "Pixel & Glass",
      tagline: "从站点核心视觉生出：像素流光地面 × 玻璃双线性插值",
      desc: "用低通柔化的背光微格颗粒（绝不刺耳）作为起音，随触碰平滑「插值」融化成澄澈透明的玻璃泛音；换面与开门严格对齐 100ms / 120ms 像素粗化拍点。",
      feel: "像素微粒 → 透明玻璃 · 贴合站点语言",
      ref: "AveritA 像素地面 × OneShot / Nurture 柔微光"
    },
    {
      id: "j", batch: 3, code: "DIR J", name: "醒梦琉璃", en: "Felt & Starlight",
      tagline: "微温而易碎的亲密声景：绒槌钢片琴 × 玻璃杯缘气韵 × 丝绒薄雾",
      desc: "摒弃廉价正弦铃与金属感 FDN 混响，改用柔绒击打瞬态、轻微拍频的擦拭玻璃杯缘与干净丝绒卷积空间，像晨雾里轻轻落下的微光。",
      feel: "微温 · 透明 · 绒感亲密 · 久听不腻",
      ref: "Felt Piano / 坂本龙一玻璃音 × Gris / 素晴日星夜"
    }
  ],
  spots: [
    {
      id: "hover_crystal", key: "Q", name: "晶体 / 门悬停", priority: "P1",
      desc: "首页三颗晶体悬停加速旋转，或各页标题晶体轻拂",
      hook: "index.astro · site.ts hover",
      notes: {
        a: "双音轻拂 + 空气折射", b: "毛玻璃光扫 + 双颗粒",
        c: "清冽水滴落入空腔", d: "极轻星盘游丝微震",
        e: "磨砂镜面轻拭 + 蓝宝石轻触", f: "冷空气隙轻拂 + 石英霜雾",
        g: "指尖拂过素烧瓷 + 干板岩", h: "微观全通频散折射轻弹",
        i: "微格轻亮 → 插值澄澈晶芒", j: "极浅玻璃杯缘气韵 + 绒音轻拂"
      }
    },
    {
      id: "click_confirm", key: "W", name: "点按进入 / 确认", priority: "P0",
      desc: "点击晶体门、文章卡片、确认按钮或设置切换",
      hook: "site.ts · astro:before-preparation",
      notes: {
        a: "晶面轻叩 Ab5→Eb6", b: "38ms 双快门光学步进",
        c: "温石轻敲 + 清滴抬升", d: "清脆双段微机械确认",
        e: "旁轴快门二段阻尼卡榫", f: "冷石英轻点瞬化霜雾晕",
        g: "黑曜石刃 + 素瓷双叩落定", h: "折射轻响 + 立体声频散箔",
        i: "绒触玻珠 + 柔格溶入五度 F5→C6", j: "温润绒槌琉璃双音 Ab4·Eb5"
      }
    },
    {
      id: "star_open", key: "E", name: "左下星展开", priority: "P0",
      desc: "点击左下角 Toolstar，同心轨道与半透明盘面展开",
      hook: "toolstar.ts · open()",
      notes: {
        a: "四音晶棱扇形上扬", b: "12fps 四步光圈舒展",
        c: "三声水滴由左至右落钵", d: "四格表盘卡榫顺次弹开",
        e: "光圈叶片滑开 + 四格陶瓷卡扣", f: "环状冷气帘舒展 + 石英微尘",
        g: "板岩薄片滑展 + 三段素瓷停顿", h: "三道立体声频散晶箔依次展开",
        i: "轻雾舒展 + 12fps 四粒柔格折光", j: "三轴星舒展 · 绒音和声散开"
      }
    },
    {
      id: "star_close", key: "R", name: "左下星收拢", priority: "P0",
      desc: "收起 Toolstar 轨道菜单，退回静谧阅读态",
      hook: "toolstar.ts · close()",
      notes: {
        a: "三音柔落收束", b: "柔雾逆扫聚拢",
        c: "双石轻落归静", d: "干脆三格复位归零",
        e: "叶片内收 + 磁吸阻尼归位", f: "向心负压微吸 + 气囊轻合",
        g: "哑光石盖滑合 + 沉实落座", h: "逆向相位频散聚拢回点",
        i: "清光向内收拢化回像素暮地", j: "双音轻落绒面 · 柔声归静"
      }
    },
    {
      id: "ring_tick", key: "T", name: "轨道拨动 / 吸附刻度", priority: "P0",
      desc: "滚轮/拖拽拨动标签环、月份环、跳转环的 snap 刻度",
      hook: "toolstar.ts · snap() / wheel",
      notes: {
        a: "极短微晶轻点", b: "短光学快门颗粒",
        c: "河卵石轻叩一格", d: "表冠棘轮超清脆刻度",
        e: "徕卡光圈环极致干脆刻度", f: "气浮轴承羽量微气脉冲",
        g: "干卵石 / 陶瓷珠极短一叩", h: "微冰晶折射频散瞬点",
        i: "柔格玻璃珠轻叩（耐连滚）", j: "温润绒槌玻珠微点（零刺耳）"
      }
    },
    {
      id: "flip_dream", key: "Y", name: "昼 → 夜 · 入梦换面", priority: "P0",
      desc: "900ms 像素粗化重解 + BGM 淡入 dream-loop",
      hook: "site.ts · setFlipper() -> dream",
      notes: {
        a: "下行晶雾沉入 F 小调厅", b: "9×100ms 像素粗化脉冲",
        c: "水琴窟下行涟漪入井", d: "星盘步进下行锁入夜面",
        e: "滤光轮降档 + 负压呼气入夜", f: "零下气帘沉降 + 霜雾弥散",
        g: "厚重深板岩滑闭 + 低频沉落", h: "声学视界下弯频散 + 阻尼箔",
        i: "9×100ms 清光逐拍粗化沉入暮夜", j: "清透绒音缓落融进低频琉璃夜海"
      }
    },
    {
      id: "flip_wake", key: "U", name: "夜 → 昼 · 醒来换面", priority: "P0",
      desc: "900ms 像素重聚焦 + BGM 淡入 wake-loop",
      hook: "site.ts · setFlipper() -> wake",
      notes: {
        a: "晶光上行拨云清亮", b: "9×100ms 光格明晰对焦",
        c: "晨露水石上行清庭", d: "星盘上行棘轮清亮复位",
        e: "快门帘拉开 + 昼间气压展开", f: "双共振峰晨风拨散霜雾",
        g: "白瓷与洞石屏风滑开清朗", h: "正逆频散级联对焦回明",
        i: "9×100ms 像素微粒逐拍插值显影", j: "晨雾玻璃气韵拨开成澄澈绒音"
      }
    },
    {
      id: "gate_nexus", key: "I", name: "穿越 NEXUS 之门", priority: "P1",
      desc: "4D 超立方悬停减速后，1.34s 膨胀白化跃迁",
      hook: "gate.astro · DOOR = [1..40] × 120ms",
      notes: {
        a: "四维和声膨胀 + 阈值绽放", b: "9×120ms 精确同步光格跃迁",
        c: "深石神殿和弦 + 阶梯水琴", d: "加速擒纵脉冲 + 空间释放",
        e: "加速光机擒纵 + 真空吸合封门", f: "反向真空负压吸气 → 无音高霜白绽放",
        g: "黑曜石廊摩擦蓄势 → 干爽巨石封缄", h: "64 阶全通波导跃迁 → 超立方相位折断",
        i: "9×120ms 四维格栅步进 → 溶入纯白清光", j: "静谧四维玻璃合唱 → 轻盈化入白昼天光"
      }
    }
  ],

  bonusSlots: [
    { id: "sec_articles", name: "断章彩蛋" },
    { id: "sec_moments", name: "闪念彩蛋" },
    { id: "sec_projects", name: "造物彩蛋" },
    { id: "fx_unlock", name: "FX 启封" }
  ],

  bonus: [
    {
      id: "z2_sec_articles", batch: 3, badge: "三批新 · 断章 · 雾蓝棱镜 (无风噪)",
      name: "风过棱镜 · 雾蓝三音斜掠",
      desc: "彻底去掉风声噪声：用左→右斜向舒展的三枚绒音琉璃（C5→G5→Bb5）与极浅 C6 玻韵表现 14° 掠光感",
      hook: "articles/index.astro"
    },
    {
      id: "z3_sec_articles", batch: 3, badge: "三批新 · 断章 · 静页折光 (无风噪)",
      name: "玻璃书页 · 沉静五度微光",
      desc: "极轻绒珠轻点，随后柔格折光 F5 承接绒音 C6 与 G5 玻璃薄晕——克制、安静、更贴近长文阅读页",
      hook: "articles/index.astro"
    },
    {
      id: "z_sec_articles", batch: 3, badge: "三批原 · 断章 · 14° 风纹 × 玻璃页",
      name: "像素清风滑过玻璃阅读页（旧版）",
      desc: "带丝绒风噪扫频的旧版，保留作对照",
      hook: "articles/index.astro"
    },
    {
      id: "z_sec_moments", batch: 3, badge: "三批 · 闪念 · 逆升细雨 × 粉晕",
      name: "自下而上升起的晶露色晕",
      desc: "呼应闪念页「从下往上升的细雨」：三滴轻盈上扬晶露晕开淡粉玻光",
      hook: "moments/index.astro"
    },
    {
      id: "z_sec_projects", batch: 3, badge: "三批 · 造物 · 三层星尘 × 立方",
      name: "远中近星尘微呼吸与立方落槽",
      desc: "三层视差星尘由远及近轻点，琥珀绒音立方安稳落入 .pj-slot",
      hook: "projects/index.astro"
    },
    {
      id: "z_fx_unlock", batch: 3, badge: "三批 · FX 声道启封",
      name: "醒梦初响 · 微光应答",
      desc: "拉起 FX 弧线时的温柔问候（F5→C6→Bb5→Eb6 柔格折光），与 Ave 呼应",
      hook: "sound.ts · setLevel('fx')"
    },
    {
      id: "y_sec_articles", batch: 2, badge: "二批 · 断章 · 风 × 磨砂镜",
      name: "磨砂镜片扫过清风",
      desc: "双共振峰气帘 + 磨砂表面微摩擦 + 轻量折射边缘，零铃声",
      hook: "articles/index.astro"
    },
    {
      id: "y_sec_moments", batch: 2, badge: "二批 · 闪念 · 细雨 × 霜雾",
      name: "石英微雨散尘化雾",
      desc: "泊松随机细雨颗粒 + STFT 相位弥散水汽 + 素瓷轻吸",
      hook: "moments/index.astro"
    },
    {
      id: "y_sec_projects", batch: 2, badge: "二批 · 造物 · 晶格入槽",
      name: "精密滑移与陶瓷磁吸落槽",
      desc: "表面滑动引子 + 二段光机卡榫 + 阻尼陶石落座 .pj-slot",
      hook: "projects/index.astro"
    },
    {
      id: "y_fx_unlock", batch: 2, badge: "二批 · FX 声道激活",
      name: "空气校准与折射启封",
      desc: "气压舒展 + 干脆快门启封 + 频散晶箔微弧，取代传统叮咚音",
      hook: "sound.ts · setLevel('fx')"
    },
    {
      id: "x_sec_articles", batch: 1, badge: "一批 · 断章 · 风 × 玻璃",
      name: "雾蓝六棱双锥 / 镜片扫过",
      desc: "第一批带调性版本（C6 模态泛音 + FDN 混响）",
      hook: "articles/index.astro"
    },
    {
      id: "x_sec_moments", batch: 1, badge: "一批 · 闪念 · 雨 × 色晕",
      name: "淡粉碎晶 / 雨滴晕开",
      desc: "第一批带调性版本（水琴窟双滴 + 混响）",
      hook: "moments/index.astro"
    },
    {
      id: "x_sec_projects", batch: 1, badge: "一批 · 造物 · 星尘 × 立方",
      name: "琥珀立方 / 飞落槽位就位",
      desc: "第一批带调性版本（微脉冲 + 温石模态）",
      hook: "projects/index.astro"
    },
    {
      id: "x_fx_unlock", batch: 1, badge: "一批 · 声道交互 · FX 开启",
      name: "FX 环从 0 拉起试音",
      desc: "第一批带调性版本（F5–C6–Eb6 晶棱和弦）",
      hook: "sound.ts · setLevel('fx')"
    }
  ],

  presets: {
    batch3: {
      label: "第三批推荐混搭 (柔格折光 × 醒梦琉璃)",
      map: {
        hover_crystal: "j",
        click_confirm: "i",
        star_open: "i",
        star_close: "j",
        ring_tick: "i",
        flip_dream: "j",
        flip_wake: "i",
        gate_nexus: "j"
      }
    },
    batch2: {
      label: "第二批推荐混搭 (光机触点 × 霜雾空间 × 频散跃迁)",
      map: {
        hover_crystal: "e",
        click_confirm: "e",
        star_open: "f",
        star_close: "e",
        ring_tick: "e",
        flip_dream: "f",
        flip_wake: "f",
        gate_nexus: "h"
      }
    },
    hybrid: {
      label: "第一批原推荐混搭",
      map: {
        hover_crystal: "a",
        click_confirm: "a",
        star_open: "a",
        star_close: "a",
        ring_tick: "d",
        flip_dream: "b",
        flip_wake: "a",
        gate_nexus: "a"
      }
    }
  }
};
