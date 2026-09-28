// 音频体检：读 16-bit PCM WAV，看循环边界是否连续、开场母带的接缝与 loop 的关系。
// 用法：node design/audio/analyze.mjs <目录>
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = process.argv[2] ?? 'D:/myDownloads';
const SR = 48000;
/* 开场母带里 intro→loop 的边界（样本数）。与 normalize-bgm.mjs 的 OPEN_SEAM_SAMPLE 保持一致 */
const OPEN_SEAM_SAMPLE = 1221819;

function readWav(path) {
  const buf = readFileSync(path);
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE')
    throw new Error('not wav: ' + path);
  let off = 12;
  let fmt = null;
  let data = null;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === 'fmt ') {
      fmt = {
        channels: buf.readUInt16LE(off + 10),
        sampleRate: buf.readUInt32LE(off + 12),
        bits: buf.readUInt16LE(off + 22),
      };
    } else if (id === 'data') {
      data = { start: off + 8, size: Math.min(size, buf.length - off - 8) };
    }
    off += 8 + size + (size % 2);
  }
  if (!fmt || !data) throw new Error('missing fmt/data: ' + path);
  if (fmt.bits !== 16) throw new Error('expected 16-bit, got ' + fmt.bits);
  const frames = Math.floor(data.size / (2 * fmt.channels));
  const ch = [];
  for (let c = 0; c < fmt.channels; c++) ch.push(new Float32Array(frames));
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < fmt.channels; c++) {
      ch[c][i] = buf.readInt16LE(data.start + (i * fmt.channels + c) * 2) / 32768;
    }
  }
  return { ...fmt, frames, ch, duration: frames / fmt.sampleRate };
}

const rms = (ch, from, to) => {
  let s = 0;
  const a = Math.max(0, from);
  const b = Math.min(ch.length, to);
  for (let i = a; i < b; i++) s += ch[i] * ch[i];
  return b > a ? Math.sqrt(s / (b - a)) : 0;
};
const db = (x) => (x > 0 ? 20 * Math.log10(x) : -Infinity);
const f = (x, n = 2) => (Number.isFinite(x) ? x.toFixed(n) : '-inf');

/** 接缝跳变：把 a 的尾 n 帧与 b 的头 n 帧逐样本比较（同相续接的理想值） */
function seam(a, b, n) {
  const M = a.length;
  let jump = 0;
  let tailRms = 0;
  for (let i = 0; i < n; i++) {
    const d = b[i] - a[M - n + i];
    jump += d * d;
    tailRms += a[M - n + i] * a[M - n + i];
  }
  return { jumpRms: Math.sqrt(jump / n), tailRms: Math.sqrt(tailRms / n) };
}
const reportSeam = (label, a, b, n) => {
  const { jumpRms, tailRms } = seam(a, b, n);
  console.log(
    `${label}  头RMS ${f(db(rms(b, 0, n)))} dB / 尾RMS ${f(db(tailRms))} dB / ` +
      `接缝跳变 ${f(db(jumpRms))} dB（相对尾部 ${f(db(jumpRms) - db(tailRms))} dB）`,
  );
};

const SR_ = SR;
const files = {};
for (const name of [
  'awake-intro+loopAB', 'awake-loopAB', 'awake-outro',
  'dream-intro+loopAB', 'dream-loopAB', 'dream-outro',
]) {
  files[name] = readWav(join(DIR, `personalwebsite-${name}.wav`));
}

console.log('=== 基本参数 ===');
for (const [k, w] of Object.entries(files)) {
  const L = w.ch[0];
  let peak = 0;
  for (let i = 0; i < L.length; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(w.ch[1][i]));
  console.log(
    `${k.padEnd(20)} ${w.duration.toFixed(4)}s  ${w.sampleRate}Hz ${w.channels}ch  ` +
      `整体RMS ${f(db(rms(L, 0, L.length)))} dBFS  峰值 ${f(db(peak))} dBFS`,
  );
}

const N = Math.round(SR_ * 0.05);
console.log(`\n=== 开场母带内部接缝（intro→loop @${(OPEN_SEAM_SAMPLE / SR_).toFixed(3)}s，尾 50ms vs 头 50ms）===`);
for (const form of ['awake', 'dream']) {
  const L = files[`${form}-intro+loopAB`].ch[0];
  const before = L.subarray(0, OPEN_SEAM_SAMPLE);
  const after = L.subarray(OPEN_SEAM_SAMPLE);
  reportSeam(`${form.padEnd(14)}`, before, after, N);
}

console.log('\n=== 开场尽头 → loop 文件开头（bed 接力的虚拟接缝，尾 50ms vs 头 50ms）===');
for (const form of ['awake', 'dream']) {
  const open = files[`${form}-intro+loopAB`].ch[0];
  const loop = files[`${form}-loopAB`].ch[0];
  reportSeam(`${form.padEnd(14)}`, open, loop, N);
}

console.log('\n=== loop 自身循环边界（尾 50ms vs 头 50ms）===');
for (const k of ['awake-loopAB', 'dream-loopAB']) {
  const L = files[k].ch[0];
  reportSeam(`${k.padEnd(14)}`, L, L, N);
  // 尾部是否为静止（静音收尾 → 循环会有空档）
  const last10 = rms(L, L.length - Math.round(SR_ * 0.01), L.length);
  const first10 = rms(L, 0, Math.round(SR_ * 0.01));
  console.log(`${''.padEnd(14)} 末 10ms RMS ${f(db(last10))} / 首 10ms RMS ${f(db(first10))}`);
}

console.log('\n=== 分段 RMS 包络（每 5s 一段，dBFS）===');
for (const [k, w] of Object.entries(files)) {
  const L = w.ch[0];
  const seg = SR_ * 5;
  const out = [];
  for (let t = 0; t < L.length; t += seg) {
    out.push(f(db(rms(L, t, Math.min(L.length, t + seg))), 1));
  }
  console.log(`${k.padEnd(20)} ${out.join(' ')}`);
}
