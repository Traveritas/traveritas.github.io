/* 小东西数据 · 校验
   node design/mocks/somewhere/toys/check.cjs           全部
   node design/mocks/somewhere/toys/check.cjs A-1 B-2   只看这几个文件

   查：id 与文件名对不对得上、枚举值有没有打错、字数上限、重复的醒态名、方向内编号是否连续。
   退出码非 0 表示有问题——作者在交付前必须跑通。 */
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const DATA = path.join(HERE, 'data');
const TRIGGER = ['靠近', '停留', '悬停', '点击', '长按', '拖动', '滚轮', '离开', '无人', '输入'];
const REPLY = ['光', '形', '字', '位移', '声音', '静默'];
const MEMORY = ['无', '本次', '跨次'];
const TIME = ['无', '夜里', '随夜分期', '每分钟', '累积'];
const EFFORT = ['S', 'M', 'L'];
const FIELDS = ['id', 'scene', 'awake', 'dream', 'what', 'trigger', 'reply', 'intensity', 'memory', 'time', 'effort'];

function load(file) {
  window = { TOYS: [] };
  const src = fs.readFileSync(file, 'utf8');
  new Function('window', src)(window);
  return window.TOYS;
}

function main() {
  const only = process.argv.slice(2);
  if (!fs.existsSync(DATA)) {
    console.error('缺 data/ 目录');
    process.exit(1);
  }
  const files = fs
    .readdirSync(DATA)
    .filter((f) => /^[A-J]-\d+\.js$/.test(f))
    .filter((f) => !only.length || only.some((k) => f === `${k}.js`))
    .sort();

  const errs = [];
  const seen = new Map(); // awake → id
  const seenDream = new Map(); // dream → id
  const byScene = {};
  const totals = { trigger: {}, reply: {}, effort: {}, intensity: {} };
  let all = 0;

  for (const f of files) {
    const tag = f.replace('.js', '');
    const letter = tag.split('-')[0];
    let list;
    try {
      list = load(path.join(DATA, f));
    } catch (e) {
      errs.push(`${tag}: 读不出来 —— ${e.message}`);
      continue;
    }
    if (!Array.isArray(list) || !list.length) {
      errs.push(`${tag}: 没有条目`);
      continue;
    }
    /* 起始号从本文件第一条 id 取（文件名里的 1/2 只是分卷，不代表编号） */
    const start = parseInt(String(list[0].id || '').slice(2), 10) || 0;
    const ids = [];
    for (const t of list) {
      const at = `${tag} › ${t.id || '?'}${t.awake ? ' ' + t.awake : ''}`;
      for (const k of FIELDS) if (t[k] === undefined || t[k] === '') errs.push(`${at}: 缺字段 ${k}`);
      if (t.scene !== letter) errs.push(`${at}: scene 应为 ${letter}`);
      if (!/^[A-J]-\d{3}$/.test(t.id || '')) errs.push(`${at}: id 格式不对`);
      else if (!t.id.startsWith(`${letter}-`)) errs.push(`${at}: id 前缀与文件不符`);
      for (const k of ['awake', 'dream']) {
        const v = t[k] || '';
        if (v.length < 2 || v.length > 6) errs.push(`${at}: ${k}「${v}」字数 ${v.length}，要 2–6`);
      }
      if ((t.what || '').length > 42) errs.push(`${at}: what ${t.what.length} 字，上限 42`);
      if (t.note && t.note.length > 40) errs.push(`${at}: note ${t.note.length} 字，上限 40`);
      if (!TRIGGER.includes(t.trigger)) errs.push(`${at}: trigger「${t.trigger}」不在枚举里`);
      if (!Array.isArray(t.reply) || t.reply.length < 1 || t.reply.length > 2) errs.push(`${at}: reply 要 1–2 个`);
      else for (const r of t.reply) if (!REPLY.includes(r)) errs.push(`${at}: reply「${r}」不在枚举里`);
      if (![1, 2, 3].includes(t.intensity)) errs.push(`${at}: intensity 要 1/2/3`);
      if (!MEMORY.includes(t.memory)) errs.push(`${at}: memory「${t.memory}」不在枚举里`);
      if (!TIME.includes(t.time)) errs.push(`${at}: time「${t.time}」不在枚举里`);
      if (!EFFORT.includes(t.effort)) errs.push(`${at}: effort「${t.effort}」不在枚举里`);
      if (seen.has(t.awake)) errs.push(`${at}: 醒态名「${t.awake}」与 ${seen.get(t.awake)} 重复`);
      else seen.set(t.awake, t.id);
      /* 梦态名同样要唯一：两样不同的东西不该有同一个说法 */
      if (seenDream.has(t.dream)) errs.push(`${at}: 梦态名「${t.dream}」与 ${seenDream.get(t.dream)} 重复`);
      else seenDream.set(t.dream, t.id);
      ids.push(parseInt(String(t.id).slice(2), 10));
      all++;
      byScene[letter] = (byScene[letter] || 0) + 1;
      const bump = (bag, k) => (bag[k] = (bag[k] || 0) + 1);
      bump(totals.trigger, t.trigger);
      (t.reply || []).forEach((r) => bump(totals.reply, r));
      bump(totals.effort, t.effort);
      bump(totals.intensity, t.intensity);
    }
    ids.sort((a, b) => a - b);
    for (let i = 0; i < ids.length; i++) {
      if (ids[i] !== start + i) {
        errs.push(`${tag}: 编号从 ${start} 起不连续（第 ${i + 1} 条是 ${ids[i]}）`);
        break;
      }
    }
  }

  console.log(`文件 ${files.length} · 条目 ${all}`);
  console.log('按方向：', Object.keys(byScene).sort().map((k) => `${k} ${byScene[k]}`).join(' · '));
  console.log('触发：', Object.entries(totals.trigger).map(([k, v]) => `${k} ${v}`).join(' · '));
  console.log('回应：', Object.entries(totals.reply).map(([k, v]) => `${k} ${v}`).join(' · '));
  console.log('强度：', Object.entries(totals.intensity).map(([k, v]) => `${k} ${v}`).join(' · '));
  console.log('工程量：', Object.entries(totals.effort).map(([k, v]) => `${k} ${v}`).join(' · '));

  if (errs.length) {
    console.error(`\n✗ ${errs.length} 个问题：`);
    for (const e of errs.slice(0, 120)) console.error('  ' + e);
    if (errs.length > 120) console.error(`  ……还有 ${errs.length - 120} 条`);
    process.exit(1);
  }
  console.log('\n✓ 全部通过');
}

main();
