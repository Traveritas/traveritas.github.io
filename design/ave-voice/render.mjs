/* ─────────────────────────────────────────────────────────────
   Ave 的声音：按台词表预渲染成站点可用的短音频。

   入：src/data/ave-lines.ts（台词）+ design/ave-voice/recipe.json（声音配方，ave-recipe/2，
       采样库内嵌；当前是 ocvoice-re 的 ave-v1）
   出：public/audio/ave/<key>.mp3（进仓库）+ src/data/ave-voice.ts（生成物，必须一起提交）

   引擎是 just another new vocal thing（Ave Voice）的副本，放在 ./src/，未改一行；
   同一台词 + 配方 + 种子永远得到同一段 PCM。

   key = 引擎版本 + 配方内容 + 台词 + 语调 + 电平 的哈希。台词不改就不重渲染；
   台词改了、配方换了，key 变，旧文件随之清掉，URL 也跟着变（不会被浏览器缓存卡住）。

   电平：不逐句归一（引擎刻意保留「轻声更轻」）。用配方自带的那句示范台词量一次
   EBU R128 积分响度（去刺之后），得到一个全局增益，把它推到 TARGET_LUFS，所有台词共用这一个增益。

   用法：
     npm run ave                                 # 渲染缺的、清掉没用的
     node design/ave-voice/render.mjs --force    # 全部重渲
     node design/ave-voice/render.mjs --check    # 只报告哪些句子还没渲染（build 前自动跑）
   需要 PATH 上有 ffmpeg（--check 不需要）。
   ───────────────────────────────────────────────────────────── */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ENGINE_VERSION, encodeWav, renderVoice } from './src/engine.mjs';
import { loadNodeResources } from './src/node-resources.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(HERE, '../..');
const OUT_DIR = join(ROOT, 'public/audio/ave');
const MANIFEST = join(ROOT, 'src/data/ave-voice.ts');
const LINES = join(ROOT, 'src/data/ave-lines.ts');
const RECIPE = join(HERE, 'recipe.json');

/** 人声的积分响度目标（LUFS）。环境声整态在 −15 左右、阅读页再退 5 dB；
    Ave 说话时环境声照常不让开，这里比它略轻即可 */
const TARGET_LUFS = -22;
/** 站点上对配方的覆盖（配方文件本身保持确认时的原样）：
    speed 1.8 与配方相同（引擎上限 2）；stretch 是元音长度（配方 1.45），收短一点让语速比配方快一截。
    2026-10-26 作者嫌 speed 2 / stretch 1.25 偏快，放慢到现在的值 */
const SITE_OPTIONS = { speed: 1.8, expression: { stretch: 1.3 } };
/** 去刺：3.2 kHz 以上的高架收 6 dB，再在 9 kHz 处缓缓收顶（引擎的元音共振峰与采样亮部集中在 2.5–6 kHz） */
const TONE = 'highshelf=f=3200:g=-8:t=s:w=0.6,lowpass=f=9000:p=1';
/** 编码：单声道人声，VBR 6 档 ≈ 100 kbps 以内，一句一两秒只有十几 KB */
const LAME_Q = '6';

const args = new Set(process.argv.slice(2));
const CHECK = args.has('--check');
const FORCE = args.has('--force');

const recipeText = readFileSync(RECIPE, 'utf8');
const recipe = JSON.parse(recipeText);
const recipeHash = createHash('sha1').update(recipeText).digest('hex').slice(0, 12);
const { AVE_LINES } = await import(pathToFileURL(LINES).href);

/** 每句要渲染的形态：醒态一定有，梦态只在写了 dream 时才有。
    台词表之外，再加上文章 / 项目 frontmatter 里自带的 ave:（id 与 src/lib/ave-page.ts 一致） */
const jobs = [];
for (const line of [...AVE_LINES, ...pageLines()]) {
  jobs.push({ key: line.id, text: line.text, mood: line.mood });
  if (line.dream && line.dream !== line.text) jobs.push({ key: `${line.id}~dream`, text: line.dream, mood: line.mood });
}
const ids = new Set();
for (const j of jobs) {
  if (ids.has(j.key)) throw new Error(`台词 id 重复：${j.key}`);
  ids.add(j.key);
}
const fileOf = (j) =>
  createHash('sha1')
    .update(JSON.stringify([ENGINE_VERSION, recipeHash, SITE_OPTIONS, TONE, TARGET_LUFS, LAME_Q, j.text, j.mood ?? null]))
    .digest('hex')
    .slice(0, 12) + '.mp3';

const oldManifest = readOldManifest();

if (CHECK) {
  const stale = jobs.filter((j) => oldManifest[j.key]?.src !== `/audio/ave/${fileOf(j)}`);
  if (stale.length) {
    console.log(`[ave] ${stale.length} 句还没有声音（先照常显示文字）：${stale.map((j) => j.key).join('、')}`);
    console.log('[ave] 跑 `npm run ave` 补上。');
  }
  process.exit(0);
}

/* ---------- 渲染 ---------- */
mkdirSync(OUT_DIR, { recursive: true });
const resources = await loadNodeResources([recipe.options], recipe.resources ?? {});
const tmp = join(tmpdir(), `ave-voice-${process.pid}`);
mkdirSync(tmp, { recursive: true });

const gainDb = +(TARGET_LUFS - measureLufs(recipe.text || '祢回来啦！今天也有好事发生哦。')).toFixed(2);
console.log(`[ave] 配方 ${recipeHash} · 引擎 ${ENGINE_VERSION} · 全局增益 ${gainDb >= 0 ? '+' : ''}${gainDb} dB`);

const manifest = {};
let made = 0;
for (const j of jobs) {
  const file = fileOf(j);
  const dest = join(OUT_DIR, file);
  const old = oldManifest[j.key];
  if (!FORCE && existsSync(dest) && old?.src === `/audio/ave/${file}`) {
    manifest[j.key] = old;
    continue;
  }
  const { samples, metadata } = render(j);
  const wav = join(tmp, `${file}.wav`);
  writeFileSync(wav, encodeWav(samples, metadata.sampleRate, 24));
  ffmpeg(['-y', '-i', wav, '-af', `${TONE},volume=${gainDb}dB,alimiter=limit=0.89:level=false`, '-ac', '1', '-c:a', 'libmp3lame', '-q:a', LAME_Q, dest]);
  unlinkSync(wav);
  manifest[j.key] = { text: j.text, src: `/audio/ave/${file}`, dur: +metadata.duration.toFixed(3), steps: stepsOf(metadata) };
  made++;
  console.log(`[ave] ${j.key} · ${metadata.duration.toFixed(2)}s · ${j.text}`);
}

/* 清掉不再被引用的成片 */
const keep = new Set(Object.values(manifest).map((m) => m.src.split('/').pop()));
let removed = 0;
for (const f of readdirSync(OUT_DIR)) {
  if (f.endsWith('.mp3') && !keep.has(f)) {
    unlinkSync(join(OUT_DIR, f));
    removed++;
  }
}
writeCredits();
writeManifest(manifest);
console.log(`[ave] 新渲染 ${made} 句，沿用 ${jobs.length - made} 句，清掉 ${removed} 个旧文件。`);

/* ---------- 工具 ---------- */

/** 扫 src/content/{articles,projects,moments} 的 frontmatter，取 ave:。
    只认两种写法（与 src/lib/ave-page.ts 的 schema 对应）：
      ave: 一句话
      ave:
        text: 一句话
        dream: 梦态那句
        mood: …
    不引 YAML 库：值是单行字符串，两端的引号去掉即可。瞬间也扫（漫游里点开时说） */
function pageLines() {
  const out = [];
  for (const col of ['articles', 'projects', 'moments']) {
    const dir = join(ROOT, 'src/content', col);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (f.startsWith('_')) continue;
      // 一个文件一篇（<id>.md），或一个文件夹一篇（<id>/index.md，配图放在旁边）
      const file = /\.mdx?$/.test(f) ? join(dir, f) : ['index.md', 'index.mdx'].map((n) => join(dir, f, n)).find(existsSync);
      if (!file) continue;
      const fm = readFileSync(file, 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/);
      if (!fm) continue;
      const rows = fm[1].split(/\r?\n/);
      const i = rows.findIndex((r) => /^ave:/.test(r));
      if (i < 0) continue;
      const unq = (v) => v.trim().replace(/^(['"])(.*)\1$/, '$2');
      const id = `page:${col}/${f.replace(/\.mdx?$/, '')}`;
      const inline = unq(rows[i].slice(4));
      if (inline) {
        out.push({ id, text: inline });
        continue;
      }
      const line = { id };
      for (const r of rows.slice(i + 1)) {
        const m = r.match(/^\s+(\w+):\s*(.*)$/);
        if (!m) break;
        line[m[1]] = unq(m[2]);
      }
      if (line.text) out.push(line);
    }
  }
  return out;
}
function render(j) {
  return renderVoice(j.text, siteOptions(j.mood), resources);
}

function siteOptions(mood) {
  const o = recipe.options;
  return { ...o, ...SITE_OPTIONS, expression: { ...o.expression, ...SITE_OPTIONS.expression }, ...(mood ? { mood } : {}) };
}

/** 字幕随音节揭开：[毫秒, 已露出的字数] 两两一组。
    引擎的事件按原文顺序一一覆盖全部字符（音节 + 标点/停顿），所以累加 text 长度即可；
    同一时刻的几步（标点紧跟在音节后）并成一步 */
function stepsOf(metadata) {
  const out = [];
  let n = 0;
  for (const e of metadata.events) {
    n += [...e.text].length;
    const ms = Math.round(e.start * 1000);
    if (out.length && out[out.length - 2] === ms) out[out.length - 1] = n;
    else out.push(ms, n);
  }
  return out;
}

function measureLufs(text) {
  const { samples, metadata } = renderVoice(text, siteOptions(), resources);
  const wav = join(tmp, 'ref.wav');
  writeFileSync(wav, encodeWav(samples, metadata.sampleRate, 24));
  const r = ffmpeg(['-hide_banner', '-nostats', '-i', wav, '-af', `${TONE},ebur128`, '-f', 'null', '-']);
  unlinkSync(wav);
  const m = [...r.stderr.matchAll(/I:\s+(-?[\d.]+) LUFS/g)].pop();
  if (!m) throw new Error('量不出响度：\n' + r.stderr.slice(-800));
  return +m[1];
}

function ffmpeg(argv) {
  const r = spawnSync('ffmpeg', argv, { encoding: 'utf8', maxBuffer: 1 << 26 });
  if (r.error) throw new Error('找不到 ffmpeg（需要在 PATH 上）');
  if (r.status !== 0) throw new Error(`ffmpeg 失败：\n${r.stderr.slice(-800)}`);
  return r;
}

function readOldManifest() {
  if (!existsSync(MANIFEST)) return {};
  const m = readFileSync(MANIFEST, 'utf8').match(/\/\* DATA \*\/([\s\S]*)\/\* END \*\//);
  try {
    return m ? JSON.parse(m[1]) : {};
  } catch {
    return {};
  }
}

function writeManifest(data) {
  // steps 一句一行，别把文件撑成几百行
  const body = JSON.stringify(data, null, 2).replace(/\[\s*([\d,\s]+?)\s*\]/g, (_, s) => `[${s.split(/[\s,]+/).join(', ')}]`);
  writeFileSync(
    MANIFEST,
    `/* 生成物：design/ave-voice/render.mjs（\`npm run ave\`）写出，别手改；改台词后重跑，并与 public/audio/ave/ 一起提交。
   键 = 台词 id（梦态是 id~dream）。text 用来认出「台词改了但还没重渲染」——对不上就当没有声音。
   steps = [毫秒, 已露出的字数] 两两一组，字幕跟着音节揭开。 */

export interface AveVoiceClip {
  text: string;
  src: string;
  dur: number;
  steps: number[];
}

export const AVE_VOICE: Record<string, AveVoiceClip> = /* DATA */ ${body} /* END */;
`,
  );
}

function writeCredits() {
  const notes = recipe.resources?.banks ? Object.values(recipe.resources.banks).map((b) => `- ${b.id}：${b.name ?? ''}`).join('\n') : '';
  writeFileSync(
    join(OUT_DIR, 'CREDITS.txt'),
    `Ave 的声音由 Ave Voice 引擎（${ENGINE_VERSION}）按台词离线合成，配方 ${recipeHash}。
采样库：
${notes}
来源与许可见仓库 design/ave-voice/recipe-notes.md。
`,
  );
}
