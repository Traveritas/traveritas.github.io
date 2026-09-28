/* ─────────────────────────────────────────────────────────────
   等响流水线：把两态 BGM 源文件处理成站点可用的等响成片。

   源（默认 D:/myDownloads，不进仓库）：
     personalwebsite-<awake|dream>-intro+loopAB.<wav|mp3>  开场母带：intro + 一遍 loop
                                                           （接缝修在母带内部，一整次渲染）
     personalwebsite-<awake|dream>-loopAB.<wav|mp3>        循环段（与母带里的 loop 同编曲）
     personalwebsite-<awake|dream>-outro.<wav|mp3>         收束（运行时不用，备查）
   出（public/audio/，进仓库）：
     <wake|dream>-open.mp3 / -loop.mp3 / -outro.mp3
   醒面在代码里叫 wake（src/scripts/reality.ts 的 Reality = 'wake' | 'dream'），
   故源里的 awake 落到站点文件名 wake。

   开场与循环的关系：运行时先放 open（intro+一遍 loop，76.364s），走到尽头由 bed
   无缝续上 loop（见 src/scripts/sound.ts）。所以 open 必须与本态 loop **同电平**，
   否则开场尽头会跳一下音量——两态各自的增益是整态统一的那一个，天然满足。

   对齐方式（ALIGN）：
     · whole（默认）：把一态的 open+outro 拼成一段 programme 量积分响度（loop 已在
       open 里，不重复计入），两态之间用**一个**增益差对齐。整态的内部起伏
       （intro→loop 的落差）原样保留，不重写编曲；代价是逐段仍有小残差。
     · segment：open/loop/outro 逐段对齐到参考形态的对应段落，换面时任何时刻都不跳
       音量，代价是会把 awake 自己的 intro→loop 落差改成 dream 的落差。
       审美简报要求「醒与梦之间不应有明显开关」，所以这个模式在需要「任意时刻可换面」
       时更贴题；而整体对齐更尊重编曲。默认整体，按需切换。

   用什么量「响度」：EBU R128 积分响度（LUFS），取 K 加权——两态的音色分工正是
   「醒=更清晰、梦=更模糊」，同样 RMS 下更亮的那条听起来更响，按 LUFS 才是听感对齐。
   参考形态（默认 dream）保持原始电平不动，只调另一态。

   用法：
     node design/audio/normalize-bgm.mjs                       # 整体对齐，写入 public/audio/
     node design/audio/normalize-bgm.mjs --align segment
     node design/audio/normalize-bgm.mjs --src <目录>
     node design/audio/normalize-bgm.mjs --check               # 只测量，不写文件
     node design/audio/normalize-bgm.mjs --quality 2           # LAME VBR 档（默认 4 ≈165kbps）
   ───────────────────────────────────────────────────────────── */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/* ---------- 可调参数 ---------- */
const DEFAULTS = {
  src: 'D:/myDownloads',
  out: 'public/audio',
  align: 'whole', // whole | segment
  ref: 'dream', // 参考形态：实测电平即目标，保持不动
  quality: '4', // libmp3lame VBR 档，4 ≈ 165 kbps
  tolerance: 0.25, // 成片实测与目标的允许偏差（dB），超出则用残余量从源再编一次
};
/* 绝对目标（LUFS）。null = 跟随参考形态的实测值。
   想让两态整体更靠后（例如作为阅读背景），填一组数即可，如
   { whole: -20 } 或 { open: -20, loop: -16, outro: -20 }（按 ALIGN 取用）。 */
const ABSOLUTE_TARGETS = null;

const SR = 48000;
/* 开场母带里 intro→loop 的边界（样本数，48k；25.454562s 处，与旧 intro 源同长，
   经互相关核实：dream 的 intro 段与旧源逐样本一致正好到此，awake 的 loop 头窗也
   在同一位置对齐）。它随 OPEN_SEAM 写进 src/data/bgm-assets.ts，运行时在开场中段
   被换面拦下时，用它从 bed 接上 loop 的当前相位。
   ⚠ 换稿若重渲染了母带，边界可能移动：改这里，并可用
   node design/audio/analyze.mjs 里的接缝体检（或互相关）重新核实。 */
const OPEN_SEAM_SAMPLE = 1221819;

const FORMS = ['awake', 'dream'];
/* 源后缀 → 站点段落名。loopAB 是独立循环源（成片保持既有电平），不参与母带切分 */
const SEGS = [
  { src: 'intro+loopAB', out: 'open' },
  { src: 'loopAB', out: 'loop' },
  { src: 'outro', out: 'outro' },
];
const FORM_OUT = { awake: 'wake', dream: 'dream' }; // 源形态 → 代码形态
/** 整态 programme 的构成：loop 已包含在 open（母带 = intro+一遍 loop）里，不重复计入 */
const PROGRAMME = ['open', 'outro'];

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};
const SRC = resolve(opt('src', DEFAULTS.src));
const OUT = resolve(opt('out', DEFAULTS.out));
const ALIGN = opt('align', DEFAULTS.align);
const REF = opt('ref', DEFAULTS.ref);
const QUALITY = opt('quality', DEFAULTS.quality);
const CHECK_ONLY = args.includes('--check');
if (!['whole', 'segment'].includes(ALIGN)) throw new Error(`--align 只能是 whole 或 segment，收到 ${ALIGN}`);
if (!FORMS.includes(REF)) throw new Error(`--ref 只能是 ${FORMS.join(' / ')}`);

const run = (bin, argv) => {
  const r = spawnSync(bin, argv, { encoding: 'utf8', maxBuffer: 1 << 28 });
  if (r.error) throw r.error;
  return r;
};
const ffmpeg = (argv) => {
  const r = run('ffmpeg', ['-hide_banner', '-nostats', ...argv]);
  if (r.status !== 0) throw new Error(`ffmpeg 失败 (${r.status}):\n${r.stderr.slice(-1500)}`);
  return r;
};

/** 单次解码量积分响度与真峰值（loudnorm 第一遍：只读不处理）。trim = 起始样本数 */
function measure(file, trim) {
  const af = trim ? `atrim=start_sample=${trim},asetpts=PTS-STARTPTS,` : '';
  const r = ffmpeg(['-i', file, '-af', `${af}loudnorm=print_format=json`, '-f', 'null', '-']);
  const m = r.stderr.match(/\{[\s\S]*"input_i"[\s\S]*\}/);
  if (!m) throw new Error(`读不到 loudnorm 输出：${file}\n${r.stderr.slice(-600)}`);
  const j = JSON.parse(m[0]);
  return { lufs: Number(j.input_i), tp: Number(j.input_tp), lra: Number(j.input_lra) };
}

/** 采样帧数：供运行时核对 mp3 解码后有没有干净裁掉编码填充（循环无缝的前提） */
function probe(file) {
  const r = run('ffprobe', [
    '-v', 'error', '-select_streams', 'a:0',
    '-show_entries', 'stream=sample_rate,channels,duration',
    '-of', 'json', file,
  ]);
  const s = JSON.parse(r.stdout).streams[0];
  const dur = Number(s.duration);
  const sr = Number(s.sample_rate);
  return { sr, channels: Number(s.channels), duration: dur, samples: Math.round(dur * sr) };
}

let tmpSeq = 0;
const tmpFile = (tag) => join(tmpdir(), `bgm-${tag}-${process.pid}-${tmpSeq++}.wav`);
const cleanups = [];
/** 把若干音频顺序拼成一段临时 wav（同一采样率/声道，仅用于量整态响度） */
function concatMeasure(files, tag) {
  const dst = tmpFile(tag);
  cleanups.push(dst);
  const inputs = files.flatMap((f) => ['-i', f]);
  ffmpeg([
    '-y', ...inputs,
    '-filter_complex', `concat=n=${files.length}:v=0:a=1`,
    '-ar', '48000', '-ac', '2', dst,
  ]);
  return measure(dst);
}

const db = (x) => (Number.isFinite(x) ? x.toFixed(2) : '-∞');
const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);
const sgn = (x) => `${x >= 0 ? '+' : ''}${x.toFixed(2)}`;
const mb = (b) => (b / 1024 / 1024).toFixed(2);

/* ---------- 1. 找源、测量 ---------- */
const srcCache = new Map();
function loadSrc(base) {
  if (!srcCache.has(base)) {
    const p = ['.wav', '.mp3'].map((e) => join(SRC, base) + e).find((q) => existsSync(q));
    if (!p) {
      console.error(`✗ 缺源文件：${join(SRC, base)}.wav|.mp3`);
      process.exit(2);
    }
    srcCache.set(base, { path: p, ...probe(p) });
  }
  return srcCache.get(base);
}

const items = [];
for (const form of FORMS) {
  for (const seg of SEGS) {
    const s = loadSrc(`personalwebsite-${form}-${seg.src}`);
    items.push({
      form, seg: seg.out, src: s.path,
      outName: `${FORM_OUT[form]}-${seg.out}.mp3`,
      sr: s.sr, channels: s.channels, duration: s.duration, samples: s.samples,
      ...measure(s.path),
    });
  }
}

console.log(`源目录   ${SRC}`);
console.log(`出目录   ${OUT}${CHECK_ONLY ? '   （--check：只测量）' : ''}`);
console.log(`对齐方式 ${ALIGN === 'whole' ? '整体（每态一个增益，保留编曲起伏）' : '逐段（open/loop/outro 各自对齐）'}`);
console.log(`参考形态 ${REF}（保持原始电平）\n`);

for (const it of items) {
  console.log(
    `测  ${pad(`${it.form}-${it.seg}`, 18)} ${padL(db(it.lufs), 7)} LUFS  ` +
      `TP ${padL(db(it.tp), 6)}  LRA ${padL(db(it.lra), 5)}  ${it.duration.toFixed(3)}s ${it.sr}Hz ${it.channels}ch`,
  );
}

/* ---------- 2. 定目标与增益 ---------- */
const srcOf = (form, seat) => items.find((x) => x.form === form && x.seg === seat).src;
const perForm = {};
for (const form of FORMS) {
  perForm[form] = concatMeasure(
    PROGRAMME.map((seat) => srcOf(form, seat)),
    `${form}-src`,
  );
}
console.log(`\n整态 programme 响度（${PROGRAMME.join('+')} 拼接；loop 已在 open 里）：`);
for (const form of FORMS) {
  console.log(`  ${pad(form, 6)} ${padL(db(perForm[form].lufs), 7)} LUFS  TP ${padL(db(perForm[form].tp), 6)}  LRA ${db(perForm[form].lra)}`);
}

/** 每一态的增益：整体模式一态一个，逐段模式一段一个 */
const gainOf = {};
if (ALIGN === 'whole') {
  const target = ABSOLUTE_TARGETS?.whole ?? perForm[REF].lufs;
  for (const form of FORMS) gainOf[form] = { all: target - perForm[form].lufs };
} else {
  for (const form of FORMS) {
    gainOf[form] = {};
    for (const seg of SEGS) {
      const it = items.find((x) => x.form === form && x.seg === seg.out);
      const target = ABSOLUTE_TARGETS?.[seg.out] ?? items.find((x) => x.form === REF && x.seg === seg.out).lufs;
      gainOf[form][seg.out] = target - it.lufs;
    }
  }
}
const gainFor = (it) => (ALIGN === 'whole' ? gainOf[it.form].all : gainOf[it.form][it.seg]);

console.log('\n增益（目标 = 参考形态）：');
for (const form of FORMS) {
  if (ALIGN === 'whole') {
    console.log(`  ${pad(form, 6)} 全段 ${sgn(gainOf[form].all)} dB`);
  } else {
    console.log(`  ${pad(form, 6)} ${SEGS.map((seg) => `${seg.out} ${sgn(gainOf[form][seg.out])}dB`).join('   ')}`);
  }
}
const boosted = items.filter((x) => gainFor(x) > 0.05);
if (boosted.length) {
  console.log(
    `\n⚠ ${boosted.length} 项需要正增益（${boosted.map((x) => `${x.form}-${x.seg}`).join(', ')}）：` +
      `会推高峰值；成片真峰值若 > -1 dBTP 需要下调目标。`,
  );
}

if (CHECK_ONLY) {
  cleanups.forEach((f) => existsSync(f) && unlinkSync(f));
  console.log('\n--check：未写文件。');
  process.exit(0);
}

/* ---------- 3. 编码 ---------- */
mkdirSync(OUT, { recursive: true });
const encode = (src, gain, dst) =>
  ffmpeg([
    '-y', '-i', src,
    '-af', `volume=${gain.toFixed(3)}dB`,
    '-c:a', 'libmp3lame', '-q:a', QUALITY,
    '-ar', '48000', '-ac', '2',
    '-map_metadata', '-1',
    dst,
  ]);
const outPath = (it) => join(OUT, it.outName);

/** 每个文件当前的增益（整态模式下一态共用一个值） */
const gains = new Map();
for (const it of items) {
  gains.set(it, ALIGN === 'whole' ? gainOf[it.form].all : gainOf[it.form][it.seg]);
}

/** 编一遍：写文件 → 逐个量 → 拼出整态 programme 量（量的是真正要发布的文件） */
function renderPass() {
  for (const it of items) encode(it.src, gains.get(it), outPath(it));
  const enc = {};
  for (const form of FORMS) {
    enc[form] = {
      segs: {},
      prog: concatMeasure(
        PROGRAMME.map((seat) => outPath(items.find((x) => x.form === form && x.seg === seat))),
        `${form}-enc`,
      ),
    };
    for (const seg of SEGS) {
      const p = outPath(items.find((x) => x.form === form && x.seg === seg.out));
      enc[form].segs[seg.out] = { ...measure(p), bytes: statSync(p).size };
    }
  }
  return enc;
}

/** 参考形态实测 − 本项实测：>0 表示本项还偏轻，需要再加（参考形态不自调，保持原始电平） */
const residualOf = (it) =>
  ALIGN === 'whole'
    ? enc[REF].prog.lufs - enc[it.form].prog.lufs
    : enc[REF].segs[it.seg].lufs - enc[it.form].segs[it.seg].lufs;
const other = FORMS.find((f) => f !== REF);
const worstResidual = () => Math.max(...items.filter((it) => it.form !== REF).map((it) => Math.abs(residualOf(it))));

console.log('\n编码：');
let enc = renderPass();
let passes = 1;
if (worstResidual() > DEFAULTS.tolerance) {
  console.log(`  残余 ${worstResidual().toFixed(2)} dB > 容差 ${DEFAULTS.tolerance} dB：用残余量从源重编一次`);
  for (const it of items) {
    if (it.form === REF) continue;
    gains.set(it, gains.get(it) + residualOf(it));
  }
  enc = renderPass();
  passes++;
}

for (const it of items) {
  const e = enc[it.form].segs[it.seg];
  Object.assign(it, { gain: gains.get(it), outLufs: e.lufs, outTp: e.tp, bytes: e.bytes });
  console.log(
    `出  ${pad(it.outName, 18)} ${padL(db(e.lufs), 7)} LUFS  TP ${padL(db(e.tp), 6)}  ${pad(mb(e.bytes) + 'MB', 9)}` +
      `增益 ${sgn(it.gain)}dB`,
  );
}

/* ---------- 4. 成片自检：拿真正要发布的六个文件比对 ---------- */
console.log(`\n成片核对（编码 ${passes} 遍）`);
console.log(
  `  整态 programme  ${pad(REF, 6)} ${padL(db(enc[REF].prog.lufs), 7)}  vs  ${pad(other, 6)} ` +
    `${padL(db(enc[other].prog.lufs), 7)}  →  Δ ${sgn(enc[other].prog.lufs - enc[REF].prog.lufs)} dB`,
);
let worstSeg = 0;
for (const seg of SEGS) {
  const d = enc[other].segs[seg.out].lufs - enc[REF].segs[seg.out].lufs;
  worstSeg = Math.max(worstSeg, Math.abs(d));
  console.log(
    `  ${pad(seg.out, 6)}         ${pad(REF, 6)} ${padL(db(enc[REF].segs[seg.out].lufs), 7)}  vs  ` +
      `${pad(other, 6)} ${padL(db(enc[other].segs[seg.out].lufs), 7)}  →  Δ ${sgn(d)} dB`,
  );
}
if (ALIGN === 'whole') {
  console.log(`  逐段残差最大 ${worstSeg.toFixed(2)} dB（整体对齐下必然存在：两态编曲起伏本就不同）`);
}

const totalBytes = items.reduce((s, it) => s + it.bytes, 0);
console.log(`\n六条合计 ${mb(totalBytes)}MB`);
for (const form of FORMS.map((f) => FORM_OUT[f])) {
  const fs = items.filter((it) => it.outName.startsWith(form));
  const head = fs.filter((it) => it.outName !== `${form}-outro.mp3`).reduce((s, it) => s + it.bytes, 0);
  console.log(`  ${pad(form, 6)} 全 ${pad(mb(fs.reduce((s, it) => s + it.bytes, 0)) + 'MB', 8)} 首次开启所需（open+loop）${mb(head)}MB`);
}

const report = {
  generatedAt: new Date().toISOString(),
  align: ALIGN, reference: REF, quality: QUALITY, srcDir: SRC, passes,
  openSeamSample: OPEN_SEAM_SAMPLE,
  programLufs: Object.fromEntries(FORMS.map((f) => [f, Number(enc[f].prog.lufs.toFixed(2))])),
  files: items.map((it) => ({
    form: it.form, formOut: FORM_OUT[it.form], seat: it.seg, out: it.outName, src: it.src,
    srcLufs: it.lufs, srcTp: it.tp, gainDb: Number(it.gain.toFixed(2)),
    outLufs: Number(it.outLufs.toFixed(2)), outTp: Number(it.outTp.toFixed(2)),
    duration: it.duration, samples: it.samples, sampleRate: it.sr, bytes: it.bytes,
  })),
};
const reportPath = resolve('design/audio/out/normalize-report.json');
writeFileSync(reportPath, JSON.stringify(report, null, 2));

/* ---------- 5. 内容版本号 ----------
   成片文件名是固定的（wake-loop.mp3 等），换稿后 URL 不变——浏览器就会一直拿缓存里的
   旧曲子（fetch 带 force-cache 更不会回源），用户听到的仍是上一版。故按六个成片的
   内容算一个短版本号，运行时装进 URL 查询串，内容一变 URL 就变。
   写进 src/data/bgm-assets.ts（要一起提交，构建时被 sound.ts 引用），并随带
   OPEN_SEAM（开场母带里 intro→loop 的边界，秒）供换面接力用。 */
const hashOf = (p) => createHash('sha1').update(readFileSync(p)).digest('hex');
const version = createHash('sha1')
  .update(report.files.map((f) => `${f.out}:${hashOf(join(OUT, f.out))}`).join('|'))
  .digest('hex')
  .slice(0, 8);
const verPath = resolve('src/data/bgm-assets.ts');
const verBody = `/* 本文件由 design/audio/normalize-bgm.mjs 生成，勿手改。
   成片在 public/audio/，文件名固定；靠版本号把 URL 区分开，换稿后浏览器才会取
   新曲子而不是缓存里的旧曲子。OPEN_SEAM 是开场母带里 intro→loop 的边界（秒），
   开场中段被换面拦下时，运行时用它从 bed 接上 loop 的当前相位。换音频重跑流水线
   即可（边界若变，改流水线里的 OPEN_SEAM_SAMPLE），记得一起提交。 */
export const BGM_VERSION = '${version}';
export const OPEN_SEAM = ${OPEN_SEAM_SAMPLE / SR};
`;
const verOld = existsSync(verPath) ? readFileSync(verPath, 'utf8') : '';
if (verOld !== verBody) writeFileSync(verPath, verBody);
console.log(`\n成片版本 ${version}  →  src/data/bgm-assets.ts${verOld === verBody ? '（未变）' : ''}`);
console.log(`报告 ${reportPath}`);

cleanups.forEach((f) => existsSync(f) && unlinkSync(f));

const progDelta = Math.abs(enc[other].prog.lufs - enc[REF].prog.lufs);
if (progDelta > DEFAULTS.tolerance) {
  console.error(`\n✗ 两态整态响度差 ${progDelta.toFixed(2)} dB 超出容差 ${DEFAULTS.tolerance} dB`);
  process.exit(1);
}
console.log(`✓ 两态整体等响（差值 ${progDelta.toFixed(2)} dB）`);
