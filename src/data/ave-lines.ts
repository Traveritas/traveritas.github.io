/* ─────────────────────────────────────────────────────────────
   Ave 的台词表：右下角那只小小的旁白。
   · 改了台词（或换了配方）要重跑 `npm run ave`：按台词预渲染声音到 public/audio/ave/，
     并刷新 src/data/ave-voice.ts（生成物，与成片一起提交）。没重跑也不会坏——
     那句只是没有声音、字直接整句出现；build 前会打印哪几句还没渲染。
   · 这个文件也被 design/ave-voice/render.mjs 用 Node 直接读（类型擦除），
     所以这里只写类型和数据，不 import 别的东西、不用 enum。
   · 机制与参数说明：docs/design/ave.md
   ───────────────────────────────────────────────────────────── */

/** 表情 = public/ave/face/<face>.webp */
export type AveFace = 'smile' | 'happy' | 'beam' | 'surprised' | 'shy' | 'hurt' | 'sulk' | 'yawn';

/** 引擎的语调（配方默认 natural；除 natural 以外都还没有按 ave-v1 调过） */
export type AveMood =
  | 'natural'
  | 'bright'
  | 'curious'
  | 'soft'
  | 'inquiring'
  | 'delighted'
  | 'musing'
  | 'playful'
  | 'wondering';

/** 路径规则：'/' 只指主页；其余按前缀匹配（'/articles' 含所有随笔页） */
export type AveWhen =
  /** 随机池：在页上待一阵后，偶尔从池里抽一句 */
  | { on: 'idle'; path?: string }
  /** 静置：访客一阵子没动（没移鼠标、没滚、没按键）时，随机池掷中就优先从这些里抽 */
  | { on: 'still'; path?: string }
  /** 进入某页 / 某版块后 after 秒（从开屏面纱打开算，默认 3） */
  | { on: 'enter'; path: string; after?: number; visitor?: 'new' | 'returning' }
  /** 访客本地时间落在 from–to 之间（可跨午夜，如 '23:00'–'05:00'）；与随机池一起抽，但优先 */
  | { on: 'clock'; from: string; to: string; path?: string }
  /** 读到页尾（正文末尾进入视口） */
  | { on: 'end'; path?: string }
  /** 别的脚本点名：dispatchEvent(new CustomEvent('xm:ave', { detail: { name, at? } }))，
      at 可以直接传元素，盖过台词自己的 at */
  | { on: 'event'; name: string }
  /** 只由别的句子的 then 接过来，自己不单独出现 */
  | { on: 'then' };

export interface AveLine {
  /** 稳定的 id：声音文件、「说过没有」的记录都挂在它上面 */
  id: string;
  /** 醒态说的话 */
  text: string;
  /** 梦态换一句（可省：两态同一句） */
  dream?: string;
  face?: AveFace;
  mood?: AveMood;
  when: AveWhen;
  /** 贴着哪个元素说（CSS 选择器）：不在视口里、或找不到，就照常在右下角 */
  at?: string;
  /** 多久说一次：session（默认）= 每次来访最多一次；ever = 这台设备上只说一次；always = 不记 */
  once?: 'session' | 'ever' | 'always';
  /** 这句自然说完（不是被 × 或别的打断）之后，接着说哪一句（id）：几句连成一段 */
  then?: string;
  /** 说了这句，就当这些（id）也说过了：内容重叠的句子别再冒出来 */
  covers?: string[];
}

/* 以下几句是占位，用来把整条链路跑通；按你的口吻改写或整段替换即可 */
export const AVE_LINES: AveLine[] = [
  {
    id: 'home-hello',
    text: '祢回来啦！',
    face: 'happy',
    when: { on: 'enter', path: '/', after: 1.5, visitor: 'returning' },
  },
  /* 新访客第一次到主页：四句连着说，第三句贴着星（visitor 的判定见 docs/design/ave.md） */
  {
    id: 'welcome-1',
    text: '初次见面！我是Ave',
    face: 'happy',
    when: { on: 'enter', path: '/', after: 1.5, visitor: 'new' },
    once: 'ever',
    then: 'welcome-2',
  },
  {
    id: 'welcome-2',
    text: '欢迎来到这里，这里有不少有意思的东西哦~',
    face: 'beam',
    when: { on: 'then' },
    once: 'ever',
    then: 'welcome-3',
  },
  {
    id: 'welcome-3',
    text: '这颗星星里有很多有用的东西，比如说：让祢听到我的声音',
    face: 'smile',
    when: { on: 'then' },
    at: '.ts-star',
    once: 'ever',
    then: 'welcome-4',
  },
  {
    id: 'welcome-4',
    text: '剩下的mmm祢可以自己探索~',
    face: 'happy',
    when: { on: 'then' },
    once: 'ever',
  },
  /* 人声从没有到有（用户把 Ave 的音量从 0 拉起来时发） */
  {
    id: 'voice-hello',
    text: '哈喽，能听见吗~',
    face: 'beam',
    when: { on: 'event', name: 'voice-on' },
  },
  {
    id: 'articles-enter',
    text: '这边是随笔，长一些的字都放在这里。',
    dream: '这边是断章，长一些的字都放在这里。',
    face: 'smile',
    when: { on: 'enter', path: '/articles' },
  },
  {
    id: 'projects-enter',
    text: '这边是项目，做完的和还在做的都在。',
    dream: '这边是造物，做完的和还在做的都在。',
    face: 'beam',
    when: { on: 'enter', path: '/projects' },
  },
  {
    id: 'moments-enter',
    text: '瞬间都很短，一张图，或者一两句话。',
    dream: '闪念都很短，一张图，或者一两句话。',
    face: 'smile',
    when: { on: 'enter', path: '/moments' },
  },
  {
    id: 'read-end',
    text: '读完啦。要不要去别处看看？',
    face: 'beam',
    when: { on: 'end', path: '/articles' },
  },
  {
    id: 'late-night',
    text: '已经很晚了呢。',
    face: 'yawn',
    mood: 'soft',
    when: { on: 'clock', from: '01:00', to: '05:00' },
  },
  {
    id: 'dawn',
    text: '天快亮了呢。',
    face: 'smile',
    mood: 'soft',
    when: { on: 'clock', from: '05:00', to: '07:00' },
  },
  {
    id: 'noon',
    text: '中午啦，记得吃饭哦。',
    face: 'beam',
    when: { on: 'clock', from: '11:30', to: '13:00' },
  },
  {
    id: 'evening',
    text: '嗯，已经晚上了呢。',
    face: 'smile',
    when: { on: 'clock', from: '18:00', to: '23:00' },
  },
  {
    id: 'idle-nap',
    text: '我刚才是不是打了个盹……没被看到吧？',
    face: 'shy',
    when: { on: 'idle' },
  },
  {
    id: 'still-hush',
    text: '嘘——这里好安静。',
    face: 'smile',
    mood: 'soft',
    when: { on: 'still' },
  },
  {
    id: 'still-look',
    text: '祢在看什么呢？我也想看。',
    face: 'surprised',
    when: { on: 'still' },
  },
  {
    id: 'still-there',
    text: '祢还在吗？',
    face: 'surprised',
    when: { on: 'still' },
  },
  {
    id: 'still-daze',
    text: '发呆也很好呀，我陪祢一起。',
    face: 'happy',
    when: { on: 'still' },
  },
];
