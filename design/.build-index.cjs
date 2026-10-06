// 生成 design/index.html —— 主页探索总览（按轮次分组、缩略图+一句话详情）
// 用法：node design/.build-index.cjs
const fs = require('fs');
const path = require('path');

const A = 'archive/2026-09-phase2-4/';
const M = 'mocks/';

// status: done=已否决 | line=主线候选 | final=待终选 | pool=候选池 | part=积木/变体 | dropped=已弃
const ROUNDS = [
  {
    id: 'r1', round: '第 1 轮', name: 'Phase 2 · 静态方向稿', date: '2026-09-19',
    verdict: '六稿 + 图标四案全部被否（「过于规整、组成太简单且丑」；花三稿「都不喜欢」）。可保留构件汇入融合方案＝当前线上主页：醒/梦对角轴线、四块衬线文字碎片、竖排导航、磨砂材质、账目式列表。',
    groups: [
      { name: '三方向首稿', items: [
        ['p2-a-fragments', A, '碎屑与字', '层三明治骨架：四块衬线宣言碎片 + 巨构水晶骑跨醒梦边界', 'done'],
        ['p2-b-megastructure', A, '巨构尺度', '大水晶切出画面上/右缘——「尺度由世界承担」的供体', 'done'],
        ['p2-c-threshold', A, '醒梦边界', '对角轴线即参数：左上冷雾蓝 → 右下暖灰粉，无硬边界', 'done'],
      ]},
      { name: '花母题三方向（花被否后的对症稿）', items: [
        ['p2-d-giant-lily', A, '巨花', '抽象百合单体巨构', 'done'],
        ['p2-e-flower-field', A, '花田', '花铺满地面，不做「一朵花摆在那里」', 'done'],
        ['p2-f-flower-geometry', A, '花与几何', '花与几何巨构的组合', 'done'],
      ]},
      { name: '图标', items: [
        ['p2-icons', A, '图标四案', '花母题字标图标；后全站去图标化，不再需要', 'done'],
      ]},
    ],
  },
  {
    id: 'r2', round: '第 2 轮', name: 'Phase 3 · Three.js 活体稿', date: '2026-09-19',
    verdict: '参考 Kage 场景编排语法转向活体稿：氛围与水面语言达标，确立「单主体 + 局部规则 + 字被真实遮挡」语法；J 巨环深化为 J✦ 四时，成为主线候选。',
    groups: [
      { name: '五方向首稿（评审推荐 C 丰富度 / A 稳妥 / E 概念锐度）', items: [
        ['p3-a-still-water', A, 'A 水面剧场', '醒在水上、梦在水下的镜像世界，柱列 + 栈道尽头之椅', 'done'],
        ['p3-b-curtain', A, 'B 帷幕之后', '三重纱逐层稀释宣言，深处虚掩之门漏暖光（机制供体）', 'done'],
        ['p3-c-field', A, 'C 花是旷野', '花铺满旷野 + 立在花田中的巨门框，门内同田更暖', 'done'],
        ['p3-d-archive', A, 'D 字的档案馆', '宣言竖排成碑、回声碑走样——记忆不可靠（语言供体）', 'done'],
        ['p3-e-waking', A, 'E 醒来之前', '正俯瞰一张占满画面的床，褶皱压字、影子方向不一', 'done'],
      ]},
      { name: '水面深化', items: [
        ['p3-f-water-field', A, 'F 沉水花田', 'SVG 静态合成：水下比水上更盛', 'done'],
        ['p3-g-live-field', A, 'G 沉水花田·活体', 'Three.js 活体稿——「在场感必须活体验证」的分水岭', 'done'],
        ['p3-h-terrain-steles', A, 'H 画笔水面·沉城碑林', '等高线色带水面 + 水下沉城，字平面被柱列真实切割', 'done'],
        ['p3-i-terraces', A, 'I 台地字林', '阶梯台地 + 六列竖排字碑，右起左行渐淡', 'done'],
      ]},
      { name: '单主体四方向（用户裁定：氛围到位、要有明确主体）', items: [
        ['p3-j-giant-ring', A, 'J 巨环', '水上断环 + 水下更大更暖的完整环——梦补齐断环', 'line'],
        ['p3-k-giant-gate', A, 'K 巨门', '顶天门框，门洞后是「更深的雾」而非世界', 'done'],
        ['p3-l-needle-tower', A, 'L 通天之塔', '六棱针塔顶出画，塔顶悬石是全场景唯一动体', 'done'],
        ['p3-m-colossal-stele', A, 'M 字碑', '宣言六列竖排直接刻在倾斜巨碑上＝字碑合一', 'done'],
      ]},
      { name: '巨环变体（用户裁定：均不如原版 J）', compact: true, items: [
        ['p3-j2-linked-rings', A, 'J2 环环', '受光巨环 + 自发光小环互扣穿过环洞', 'part'],
        ['p3-j3-ring-axis', A, 'J3 环与轴', '巨环穿心六棱轴 + 悬石——浑天仪式无用途秩序', 'part'],
        ['p3-j4-sunken-ring', A, 'J4 沉环', '重心反转俯视：主角是水下更大更亮的完整暖环', 'part'],
      ]},
      { name: 'J✦ 配色五版（同一构图，仅色彩与光不同）', compact: true, items: [
        ['p3-j-cool', A, 'Jc 冷晨', '雾鼠尾草 × 暖玫瑰水下环——冷世界唯一的暖在梦里', 'part'],
        ['p3-j-rose', A, 'Jr 暮玫瑰', '粉雾 × 绛紫 × 暖玫瑰，最贴醒梦简报本源', 'part'],
        ['p3-j-gold', A, 'Jg 金晨', '香槟 × 蜂蜜 × 琥珀', 'part'],
        ['p3-j-night', A, 'Jn 夜青', '青灰夜 × 淡金灯环，最偏梦侧', 'part'],
      ]},
      { name: 'J✦ 四时（终稿候选）', items: [
        ['p3-j-cycle', A, 'J✦ 四时', '暮玫瑰→冷晨→夜青缓慢循环（约 3.7 分钟/轮），滚动拨快换季；旁注「颜色在换季，环从未动」', 'line'],
      ]},
      { name: '元素积木（可叠加进 J✦）', compact: true, items: [
        ['p3-jv1-shoal', A, 'V1 游光', '70 道水下暖色光痕巡游', 'part'],
        ['p3-jv2-ripples', A, 'V2 涟漪', '随机生灭扩散环 + 环脚呼吸涟漪', 'part'],
        ['p3-jv3-lanterns', A, 'V3 浮灯', '8 盏漂流小灯 + 柔光晕', 'part'],
        ['p3-jv4-mist', A, 'V4 低雾', '12 团贴水柔雾慢移呼吸', 'part'],
        ['p3-b1-terraces', A, 'B1 远山', '平面位移山脊剪影，正中留空给巨环', 'part'],
        ['p3-b2-skyring', A, 'B2 天环', '跨天空巨弧极缓摆动', 'part'],
        ['p3-f1-forestele', A, 'F1 近碑', '右下切入的暗色巨碑剪影（画框装置）', 'part'],
        ['p3-f2-threads', A, 'F2 垂线', '程序化线场：三层远近缓垂如分钟级慢雨', 'part'],
        ['p3-s3-arcs', A, 'S3 环冢', '前几世环的弧形残段与主环同族', 'part'],
        ['p3-s4-columns', A, 'S4 柱列', '六棱矮柱走进雾里，一根失序一根断矮', 'part'],
        ['p3-s1-fallenbeam', A, 'S1 倒梁', '斜倒半浸的巨梁（用户裁定：不好）', 'dropped'],
        ['p3-s2-isle', A, 'S2 浮岛', '底座小碑 + 碑顶微缩环（用户裁定：不好）', 'dropped'],
      ]},
    ],
  },
  {
    id: 'r3', round: '第 3 轮', name: 'Swarm 第 1 波 · P4 并行探索', date: '2026-09-19 深夜',
    verdict: '首开多会话并行（swarm）：悬浪 / 群浪 / 天缺三稿全部通过截图与 judge 验收，与 J✦ 同台待用户终选。',
    groups: [
      { name: '三会话三方向', items: [
        ['p4-suspended-wave', A, '悬浪', '一道悬停不落的巨浪——「正在发生的事」被暂停，水下浪影更盛', 'final'],
        ['p4-murmuration', A, '群浪', '3200 只活体聚成环与字又散开——醒时字能成形，入梦散作群', 'final'],
        ['p4-absence', A, '天缺', '天上裂开巨型空洞，世界从边缘持续剥落飘向缺口——缺从不扩大也从不愈合', 'final'],
      ]},
    ],
  },
  {
    id: 'r4', round: '第 4 轮', name: 'Swarm 第 2 波 · 主体母题大爆炸', date: '2026-09-20 凌晨',
    verdict: '八个会话、十四稿：主体母题全面铺开（镜/梯/花/线/影/门/雾/坠/眼……），全部通过截图验收，进入候选池。',
    groups: [
      { name: '', items: [
        ['p5-mirror', M, '镜渊', '宣言残缺于现实、完整于镜中倒影——「照错了时间的镜子」', 'pool'],
        ['p5-stairs', M, '融梯', '通天巨阶，脚下溶解、前方由雾凝出——每登一级来路少一级', 'pool'],
        ['p5-bloom', M, '玻璃园', '巨型玻璃百合永远「正在开」：花心始终合拢＝梦里那部分', 'pool'],
        ['p5-linescape', M, '线野', '世界没有面只有线：等高线即大地，线聚处凝成悬空巨环群', 'pool'],
        ['p5-echo', M, '叠影', '每个巨构旁漂着微错位的「上一次的自己」，页尾重合且比本体更真', 'pool'],
        ['p5-echo-vault', M, '回声穹骨', '身处七道巨拱穹笼内部，笼外漂着走样的回声残影', 'pool'],
        ['p5-veil', M, '织幔', '千余根垂线构成可穿过的巨型帷幕，穿越即由冷入暖', 'pool'],
        ['p5-submerged', M, '沉川', '整页沉在水下：水面是头顶发光的天花板，醒来在一步之遥', 'pool'],
        ['p5-frost', M, '呵雾', '整页隔着呵气玻璃，指针即呵气——擦开处留痕不重生', 'pool'],
        ['p5-descent', M, '坠', '滚动＝坠落：穿云井而下，井底之光永远差一步', 'pool'],
        ['p5-eyelid', M, '阖眼', '按住直到醒来：睁眼与世界成形是同一刻', 'pool'],
        ['p5-door', M, '过门', '「门」字巨构，镜头从字中穿过，门里比门外暖', 'pool'],
        ['p5-shadow', M, '巨影', '从未到场者的影子横陈雾原——以缺席在场；影子不服从光', 'pool'],
        ['p5-fleet', M, '浮眠', '仰躺开场看巨壳底面，滚动＝坐起，巨物群与你一起快醒', 'pool'],
      ]},
    ],
  },
  {
    id: 'r5', round: '第 5 轮', name: 'Swarm 第 3 波 · 入口机制', date: '2026-09-20',
    verdict: '四个会话、七稿：把「怎么进入一个网站」当作主角——转动、压破、横渡、降层、展开、注视门控、点亮。',
    groups: [
      { name: '', items: [
        ['p5-revolve', M, '旋门', '相机立于环形巨殿圆心不动，滚动＝转动整座世界，翼过即换章', 'pool'],
        ['p5-membrane', M, '天膜', '整页隔一层磨砂天膜，滚动加压至裂纹蔓延、破膜穿越', 'pool'],
        ['p5-ferry', M, '渡', '相机固定在岸，渡船队列横渡你面前——巨构是正在被搬走的', 'pool'],
        ['p5-frames', M, '重界', '雾原上无尽嵌套的方形巨框，滚动＝向内降层，最内层只有末句', 'pool'],
        ['p5-unfold', M, '折启', '世界是一封折起的信，滚动＝它为你展开（展开＝阅读＝醒来）', 'pool'],
        ['p5-somnambule', M, '梦游', '不被注视的东西才会移动：注视门控运动，页尾当面归位', 'pool'],
        ['p5-lantern', M, '巡灯', '灯到之处世界才被点亮；页尾领队灯驻停升起成为常亮站灯', 'pool'],
      ]},
    ],
  },
  {
    id: 'r6', round: '第 6 轮', name: 'Swarm 第 4 波 · 平面基底 × 3D', date: '2026-09-20',
    verdict: '五个会话、五稿：平面设计不再是背景而是世界本身——图纸、活字、标本册、舆图、散页，3D 只是纸上唯一活物。',
    groups: [
      { name: '', items: [
        ['p5-draft', M, '图纸', '工程总图上三个瓷件自线稿充气立起即入口；入梦后尺寸线测不准、比例 1:∞', 'pool'],
        ['p5-imprint', M, '压印', '磨砂活字「梦」压过纸面逐行压印宣言，末段沉入成版＋套金错版', 'pool'],
        ['p5-herbarium', M, '押花册', '加载页把整个世界压平成印痕，滚动逐件复浮——平面态与立体态并存', 'pool'],
        ['p5-atlas', M, '舆图', '世界只有被画下来的这一层：向南旅行，玻璃镇纸压住醒、封着梦', 'pool'],
        ['p5-paperroom', M, '纸间', '版台上悬浮散页印张堆 + 玻璃纸鹤（登记簿仅记开工，以实稿为准）', 'pool'],
      ]},
    ],
  },
  {
    id: 'r7', round: '第 7 轮', name: 'Swarm 第 5 波 · 平面 × artifact × 浮窗', date: '2026-09-20',
    verdict: '四个会话、四稿：在「网站本身是平面」的前提下，artifact 与浮窗成为入口语言——窗、风、光、放映。',
    groups: [
      { name: '', items: [
        ['p5-floatwin', M, '浮窗', '醒前的房间：可拖拽、可最小化成纸签的玻璃浮窗即入口，artifact 被窗玻璃真实磨砂', 'pool'],
        ['p5-casement', M, '悬窗', '雾中三扇有真实铰链的平开窗，巨窗框住纯平面剪纸世界——玻璃后面永远暖一格', 'pool'],
        ['p5-paperkite', M, '纸鸢', '滚动即风：天空海报上三只真纸鸢，尾段最小一只断线飞向印刷月亮', 'pool'],
        ['p5-projector', M, '幻灯', '印好平面设计的墙前一台老幻灯机在放映——梦活在光里，印着的网站活在亮里', 'pool'],
      ]},
    ],
  },
  {
    id: 'r8', round: '第 8 轮', name: 'Swarm 第 6 波 · 盘点 + 组合轮', date: '2026-09-20',
    verdict: '每会话先以一个视角盘点 73 稿的可用设计，再取料组合成完整方案（做出来看、再补再换）。首战三稿不约而同以「平面印刷基底 × J✦ 巨环基因」为主轴——海 / 卷 / 地三种基底解，均完成并截图验收，进入候选池。',
    groups: [
      { name: '', items: [
        ['p6-inktide', M, '印潮', '印刷之海做基底 + J✦ 断环做主体 + 镜渊真反射做局部规则：倒影里断环完整更暖；舆图信标入口、涨潮加载、四时调色', 'pool'],
        ['p6-handscroll', M, '长卷·渡', '网站是一幅横移展卷的手卷：装裱=真版式，画心开进真实景深；「绢停水走」双速；小舟渡向卷尾，卷收走世界', 'pool'],
        ['p6-sundial-garden', M, '晷园', '印刷园图做大地，J✦ 巨环改晷针——印的太阳支配真的影子；三只玻璃花罩做入口，夜里印刷层自发光', 'pool'],
      ]},
    ],
  },
  {
    id: 'r9', round: '第 9 轮', name: 'Swarm 第 7 波 · 内页叙事反哺主页 ＋ 新方向', date: '2026-09-20',
    verdict: '内页轮（design/explore/）四个认可叙事被带到主页尺度重新发明——缝 / 展 / 验（同题两解），另有两稿全新方向（晓线阅读系统、一夜睡眠图）。全部完成并截图验收，进入候选池。',
    groups: [
      { name: '认可叙事 → 主页（源稿见 design/explore/）', items: [
        ['p7-first-stitch', M, '落针', '醒梦缝在主页尺度重发明：醒与梦分立缝线两侧，访客亲手落下第一针', 'pool'],
        ['p7-vestibule', M, '序厅', '站点即常设展：主页是序厅——取入场券、看 1:1 馆舍模型、沿地面铜钉线走进各展厅', 'pool'],
        ['p7-verify', M, '现实检验 · 主页版', '主页不确定自己醒着还是做梦：按住玻璃锚点核验；按住不放，它会真的醒过来', 'pool'],
        ['p7-doorcheck', M, '入梦检验', '主页是门口，清醒梦的规矩是进门先检验：每句话写两遍（梦面/醒面），按住看它醒来', 'pool'],
      ]},
      { name: '全新方向', items: [
        ['p7-dawnline', M, '晓线', '阅读即破晓：晓线悬在眼前不动，滚动把未读之夜拉过线变成已读之昼；三夜客户端互切，证系统而非单页', 'pool'],
        ['p7-hypnogram', M, '一夜 · 睡眠图', '主页是一张整夜睡眠分期图：宣言碎片按入睡时刻挂在各睡眠期（N1→REM），走纸校准做加载页', 'pool'],
      ]},
    ],
  },
  {
    id: 'r10', round: '第 10 轮', name: '全站长按入梦检验机制 · 特效并行稿', date: '2026-09-21',
    verdict: '把 p7-doorcheck 的「检验现实 + 双色」升格为全站手势：空白处长按 2200ms 闩锁醒面（配色过渡 + data-morph 双文案换面），同手势 1300ms 回梦；不设按钮，键盘空格等价。四稿统一机制骨架与演示内容，仅特效语言不同，待终选后合入全站。',
    groups: [
      { name: 'P8 特效方案', items: [
        ['p8-thread', M, 'H · 拉线打结（终选修订）', '按住自指下抽出 -4° 细线、醒色沿线渗染、文字按线到换面；定格线收拢成 ◆ 结——环闪＋全页 2.2px 微沉一拍，线结随即散尽无滞留；发光收敛（去 blur 光带，描边环闪）', 'line'],
        ['p8-blink', M, 'I · 眨眼快门', '按住眼睑式暗角合拢＋退饱和；满程一次眨眼，黑暗中直换文案配色，睁眼即醒面、无过渡痕迹', 'final'],
        ['p8-develop', M, 'J · 显影定影', '醒面自按压点径向显影、文字逐字从噪点解出；满幅瞬间颗粒横扫「定影」，⚠ 翻 ✓ 亮一记琥珀', 'final'],
        ['p8-waterline', M, 'K · 水位线', '醒面水位自页底上涨、线下先醒、文字随水线掠过换面；漫顶一道波光扫过、水位隐去即闩锁', 'final'],
      ]},
    ],
  },
  {
    id: 'r11', round: '第 11 轮', name: 'H 拉线打结 · 变体轮（定格瞬间 × 全屏渐进）', date: '2026-09-21',
    verdict: '用户反馈定向优化：完成瞬间特效、全屏渐进、拉线质感微调；定格后屏幕不得残留任何元素；性能预算硬性（仅 transform/opacity/clip-path/CSS 变量，≤12 动画节点，scramble ≤3 并发带看门狗，各阶段墙钟兜底，__fx.perf() 自报帧成本）。三变体均通过浏览器全流程实测（帧成本 ~4.2ms）。',
    groups: [
      { name: '拉线变体', items: [
        ['p8-thread-retract', M, 'H2 · 收针出幕', '按压线作刮刀，拖动 -4° 宽幅醒面前沿横扫全页、文字按前沿换面；定格线沿原角出针离屏＋出针点琥珀脉冲，页面上什么都不剩', 'final'],
        ['p8-thread-snap', M, 'H3 · 张力弦断', '按住即上张力：松垂弦渐直、全页微颤＋退饱和；满张力在按压点崩断，两段鞭甩离屏＋1px 细环冲击波扫过完成换色，≤800ms 无痕', 'final'],
        ['p8-thread-weave', M, 'H4 · 经纬织幅', '8 根 -4° 经线随纬线扫过逐根缝亮、阶梯 clip-path 冷色层同步揭示；定格纬线全幅锁边一趟，经纬一起溶解，纯醒面无残留', 'final'],
      ]},
    ],
  },
  {
    id: 'r12', round: '第 12 轮', name: '自由探索轮（不定方向 + 短按点击特效）', date: '2026-09-22',
    verdict: '不预设方向，四会话自由发明特效语言；新增需求：短程点按空白处自然作为点击特效（有反馈、无状态变化、无残留）。三稿不约而同收敛到「印刷对版/套准」母题（规矩线/锁版/朱墨套印），一稿走「一炷香」。四稿均通过快速验收：短按 clicks+1 且不改状态、链接排除、双向闩锁、零残留、~4.2ms/帧、无报错。',
    groups: [
      { name: '自由探索', items: [
        ['p8-free-a', M, 'FREE-A · 规矩线对版', '梦是一张没套准的版：按住浮起十字规矩线，暖色重影的梦版被整版拉正，琥珀环与灰环重合即套准，揭版闩锁；轻点落一枚对版小记号', 'final'],
        ['p8-free-b', M, 'FREE-B · 锁版对位', '四枚规矩线角规自页面四角向指下收拢锁版，扫过之处句子逐个「套准」翻面；按满坐位、落琥珀「醒」印即隐；短按＝十字规矩线一圈轻叩', 'final'],
        ['p8-free-c', M, 'FREE-C · 朱墨对版', '梦是没套准的朱墨套印印张：按住即对版，规线合准、字自页首向页尾逐段落版、朱影归位；按满压印闩锁，痕迹尽散；轻点＝排版工试对', 'final'],
        ['p8-free-d', M, 'FREE-D · 一炷香', '按住点香：琥珀火点携页色顺行烧下，灰留身后、句随火换；香尽灰塌烟散闩锁醒面，回程灰被倒燃续香回梦；短按＝火苗明灭', 'final'],
      ]},
    ],
  },
  {
    id: 'r13', round: '第 13 轮', name: '拉线母题 · 自由轮（高完成度）', date: '2026-09-22',
    verdict: '母题锁定「一根线」，子方向不定、完成度要求可上线试穿级；定格瞬间与全屏渐进为打磨重点，短按点击特效沿用。A/B/C 不约而同收敛到「木工墨线·弹印」一族（墨斗弹线落印），D 独走铅垂线（悬坠）。产出后按用户要求跳过程序化测试、直接过目。',
    groups: [
      { name: '拉线自由稿', items: [
        ['p8-line-a', M, 'LINE-A · 弹墨', '按住放出一根浸墨活线：微垂轻摆、墨随线深；按满提线松手，整线拍上页面印出琥珀基准线＋三点墨溅，真值落定；回程干线虚线静收', 'final'],
        ['p8-line-b', M, 'LINE-B · 绷线弹墨', '墨线自指下抽出、先垂后绷，末段微颤；按满一瞬弹直落墨，满幅墨痕渗后隐去；回程松线垮落，梦无痕', 'final'],
        ['p8-line-c', M, 'LINE-C · 墨线一弹', '木工墨斗：按住张线（松垂→绷直→微颤→上提），按满松线，一道直墨印自指下弹落、闪现后渗定褪尽闩锁；回程镜像抽线离纸', 'final'],
        ['p8-line-d', M, 'LINE-D · 悬坠', '按住垂下一根带铅坠的垂线，摆动渐静、行文随线换面；按满归直、琥珀走线闩锁醒面；回程收线松成暖弧，痕迹皆散', 'final'],
      ]},
    ],
  },
  {
    id: 'r14', round: '第 14 轮', name: '页头重设计 · 名与入口', date: '2026-09-21',
    verdict: '顶部名字与导航入口重设计：三会话并行三案——A 缝上标签、B 横排针脚、C 线穿字间。用户终选 B（去「醒梦缝」字样），落地 SiteHeader：名与入口间 14° 短缝、针脚导航当前项琥珀；进页停在页头之下，上滚才露出。A/C 冻结。',
    groups: [
      { name: '页头三案', items: [
        ['p11-h-seamlabels', M, 'A · 缝上标签', '页头去横条化：14° 缝线贯穿头部，站名与导航分居线两侧（门检双标签语法升格全站页头），针脚导航当前项琥珀，站名双面 morph', 'done'],
        ['p11-h-stitchrow', M, 'B · 横排针脚（终选落地）', '稳健横排行：名与入口之间一段 14° 短缝把两者「缝」在一起，入口各带 +8° 小针脚（当前项琥珀、hover 拉长）；落地版去「醒梦缝」字样，进页停在页头之下', 'line'],
        ['p11-h-seamline', M, 'C · 线穿字间', '激进版：缝线水平穿过页头，只在字与字的间隙里露出、遇字被纸色垫片截断——线从名字后面穿行；当前项琥珀针脚，窄屏退化横排', 'done'],
      ]},
    ],
  },
];

const STATUS = {
  done:    ['已否', 'st-done'],
  line:    ['主线候选', 'st-line'],
  final:   ['待终选', 'st-final'],
  pool:    ['候选池', 'st-pool'],
  part:    ['积木/变体', 'st-part'],
  dropped: ['已弃', 'st-dropped'],
};

const count = ROUNDS.reduce((n, r) => n + r.groups.reduce((m, g) => m + g.items.length, 0), 0);

const card = (slug, base, zh, desc, st, compact) => {
  const [label, cls] = STATUS[st];
  const img = `index-shots/${slug}.jpg`;
  return `<a class="card${compact ? ' compact' : ''} st-${cls}" href="${base}${slug}.html" target="_blank" rel="noopener">
    <figure><img src="${img}" alt="${zh}" loading="lazy" onerror="this.classList.add('missing')"></figure>
    <div class="meta"><div class="row"><span class="zh">${zh}</span><span class="tag">${label}</span></div>
    <p class="slug">${slug.replace(/^p[0-9]-/, '').replace(/^p5-/, '')}</p>
    <p class="desc">${desc}</p></div></a>`;
};

const sections = ROUNDS.map(r => `
  <section class="round" id="${r.id}">
    <header class="round-head">
      <p class="round-no">${r.round} · ${r.date}</p>
      <h2>${r.name}</h2>
      <p class="verdict">${r.verdict}</p>
    </header>
    ${r.groups.map(g => `
      ${g.name ? `<h3 class="gname${g.compact ? ' compact' : ''}">${g.name}</h3>` : ''}
      <div class="grid${g.compact ? ' compact' : ''}">${g.items.map(it => card(...it, g.compact)).join('\n')}</div>`).join('\n')}
  </section>`).join('\n');

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>主页探索总览 · Home Direction Atlas</title>
<link rel="preconnect" href="https://fastly.jsdelivr.net">
<link rel="stylesheet" href="https://fastly.jsdelivr.net/npm/@fontsource/noto-serif-sc@5.2.5/500.css">
<link rel="stylesheet" href="https://fastly.jsdelivr.net/npm/@fontsource/noto-serif-sc@5.2.5/600.css">
<style>
  :root {
    --paper: #f4efe7;
    --ink: #3d4148;
    --ink-faint: #8a8f96;
    --line: #ddd5c8;
    --rose: #a9738a;
    --gold: #a8842f;
    --blue: #5b7d99;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html { scroll-behavior: smooth; }
  body {
    background: linear-gradient(160deg, #e9edf2 0%, var(--paper) 42%, #efe3dd 100%);
    color: var(--ink);
    font-family: 'Noto Serif SC', '思源宋体', serif;
    font-weight: 500;
    padding: 0 24px 96px;
  }
  .wrap { max-width: 1240px; margin: 0 auto; }
  header.masthead { padding: 72px 0 8px; }
  .kicker { font-size: 12px; letter-spacing: 0.35em; color: var(--ink-faint); margin-bottom: 14px; }
  h1 { font-weight: 600; font-size: clamp(30px, 4.6vw, 46px); letter-spacing: 0.06em; }
  .masthead .sub { margin-top: 12px; color: var(--ink-faint); font-size: 14px; letter-spacing: 0.08em; }
  .statebar {
    margin-top: 26px; padding: 16px 20px;
    border: 1px solid var(--line); background: rgba(255,255,255,0.5);
    font-size: 13.5px; line-height: 1.9; letter-spacing: 0.04em;
  }
  .statebar b { font-weight: 600; }
  nav.toc { display: flex; flex-wrap: wrap; gap: 10px 22px; margin: 18px 0 8px; font-size: 13px; }
  nav.toc a { color: var(--ink); text-decoration: none; border-bottom: 1px solid var(--line); padding-bottom: 2px; }
  nav.toc a:hover { border-color: var(--rose); color: var(--rose); }
  section.round { margin-top: 72px; }
  .round-head { border-top: 1px solid var(--ink); padding-top: 18px; margin-bottom: 8px; }
  .round-no { font-size: 12px; letter-spacing: 0.3em; color: var(--ink-faint); margin-bottom: 8px; }
  h2 { font-weight: 600; font-size: 24px; letter-spacing: 0.05em; }
  .verdict { margin-top: 10px; max-width: 880px; font-size: 13.5px; line-height: 2; color: #5c6169; }
  h3.gname { margin: 34px 0 14px; font-size: 14px; font-weight: 600; letter-spacing: 0.18em; color: var(--ink-faint); }
  h3.gname.compact { margin-top: 26px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 20px; }
  .grid.compact { grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 14px; }
  .card {
    display: flex; flex-direction: column; text-decoration: none; color: inherit;
    background: rgba(255,255,255,0.62); border: 1px solid var(--line);
    transition: transform .25s ease, box-shadow .25s ease, border-color .25s ease;
  }
  .card:hover { transform: translateY(-3px); border-color: #c9bfae; box-shadow: 0 14px 30px -18px rgba(61,65,72,0.35); }
  .card figure { aspect-ratio: 8 / 5; overflow: hidden; border-bottom: 1px solid var(--line); background: #fff; position: relative; }
  .card img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .card img.missing { visibility: hidden; }
  .card figure::after {
    content: '截图缺失'; position: absolute; inset: 0; display: none;
    align-items: center; justify-content: center; color: var(--ink-faint); font-size: 12px; letter-spacing: .3em;
  }
  .card:has(img.missing) figure::after { display: flex; }
  .card .meta { padding: 12px 14px 14px; display: flex; flex-direction: column; gap: 5px; flex: 1; }
  .card .row { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
  .card .zh { font-weight: 600; font-size: 15.5px; letter-spacing: 0.05em; }
  .card .tag { flex: none; font-size: 10.5px; letter-spacing: 0.14em; padding: 2px 7px; border: 1px solid currentColor; border-radius: 999px; opacity: 0.85; }
  .card .slug { font-size: 10.5px; letter-spacing: 0.12em; color: var(--ink-faint); }
  .card .desc { font-size: 12.5px; line-height: 1.85; color: #5c6169; }
  .card.compact .zh { font-size: 13.5px; }
  .card.compact .desc { display: none; }
  .card.compact .meta { padding: 10px 12px 11px; gap: 3px; }
  /* 状态色 */
  .st-done .tag { color: var(--ink-faint); }
  .st-dropped .tag { color: var(--ink-faint); border-style: dashed; }
  .st-line .tag { color: var(--gold); }
  .st-final .tag { color: var(--rose); }
  .st-pool .tag { color: var(--blue); }
  .st-part .tag { color: var(--ink-faint); }
  .card.st-line { border-color: #d9c48a; background: rgba(255,252,244,0.75); }
  .card.st-dropped { opacity: 0.62; }
  footer { margin-top: 96px; border-top: 1px solid var(--line); padding-top: 18px;
    font-size: 12px; line-height: 2; color: var(--ink-faint); letter-spacing: 0.06em; }
  footer a { color: inherit; }
  @media (max-width: 640px) { body { padding: 0 14px 64px; } .grid { grid-template-columns: 1fr 1fr; gap: 12px; } .grid.compact { grid-template-columns: 1fr 1fr; } }
</style>
</head>
<body>
<div class="wrap">
  <header class="masthead">
    <p class="kicker">醒与梦 · 主页重做</p>
    <h1>主页探索总览</h1>
    <p class="sub">${ROUNDS.length} 轮探索 · ${count} 稿 · 2026-09-19 → 09-20 · 点击卡片打开原稿</p>
    <div class="statebar">
      <b>当前状态</b>：线上主页仍为 Phase 2 融合方案（醒/梦轴线 × 文字碎片 × 磨砂水晶）。<br>
      <b>终选池</b>：J✦ 四时巨环 ＋ P4 三稿（悬浪/群浪/天缺）＋ 第 2–6 波 p5 稿（方向大爆炸，尚无比选）＋ 第 6 波组合稿（印潮/长卷·渡/晷园）＋ 第 9 轮 p7 稿（内页叙事反哺：落针/序厅/现实检验/入梦检验；新方向：晓线/睡眠图）。全部稿件已归档于 <a href="archive/2026-09-phase2-4/p3-index.html" target="_blank" rel="noopener">design/archive/2026-09-phase2-4/</a> 与 <a href="mocks/p5-atlas.html" target="_blank" rel="noopener">design/mocks/</a>。
    </div>
    <nav class="toc">${ROUNDS.map(r => `<a href="#${r.id}">${r.round.replace('第 ', '').replace(' 轮', '')} ${r.name.split(' · ')[1] || r.name}</a>`).join('')}</nav>
  </header>
  ${sections}
  <footer>
    缩略图由无头浏览器按各稿锁态参数截取（1440×900，多数为醒/首屏侧；滚动入梦态请点开原稿体验）。<br>
    各轮结论与踩坑登记：landingpage_swarm*.md（design/archive/2026-09-swarm-logs/）；探索史：docs/design/homepage-direction.md。<br>内页（随笔/项目/关于/标签/404）探索总览：<a href="explore/index.html" target="_blank" rel="noopener">explore/index.html</a>。本页由 design/.build-index.cjs 生成。
  </footer>
</div>
</body>
</html>`;

fs.writeFileSync(path.join(__dirname, 'index.html'), html);
console.log(`written design/index.html (${count} mocks, ${ROUNDS.length} rounds)`);
