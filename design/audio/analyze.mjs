// 音频体检：读 16-bit PCM WAV，看循环边界是否连续、intro 与 loop 的关系。
// 用法：node design/audio/analyze.mjs <目录>
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = process.argv[2] ?? 'D:/myDownloads';

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

/** 边界连续性：把尾部 lastN 帧与头部 firstN 帧逐样本比较（同相续接的理想值） */
function boundary(ch, n) {
  const N = ch.length;
  let jump = 0;
  let tailRms = 0;
  for (let i = 0; i < n; i++) {
    const d = ch[i] - ch[N - n + i];
    jump += d * d;
    tailRms += ch[N - n + i] * ch[N - n + i];
  }
  return { jumpRms: Math.sqrt(jump / n), tailRms: Math.sqrt(tailRms / n) };
}

/** 归一化互相关：a 从偏移 off 起 vs b 从头起 */
function xcorr(a, b, off, n) {
  let sab = 0, sa = 0, sb = 0;
  for (let i = 0; i < n; i++) {
    const x = a[off + i] ?? 0;
    const y = b[i] ?? 0;
    sab += x * y; sa += x * x; sb += y * y;
  }
  return sab / (Math.sqrt(sa * sb) || 1);
}

const SR = 48000;
const files = {};
for (const name of [
  'awake-intro', 'awake-loopAB', 'awake-outro',
  'dream-intro', 'dream-loopAB', 'dream-outro',
]) {
  files[name] = readWav(join(DIR, `personalwebsite-${name}.wav`));
}

console.log('=== 基本参数 ===');
for (const [k, w] of Object.entries(files)) {
  const L = w.ch[0];
  let peak = 0;
  for (let i = 0; i < L.length; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(w.ch[1][i]));
  console.log(
    `${k.padEnd(12)} ${w.duration.toFixed(4)}s  ${w.sampleRate}Hz ${w.channels}ch  ` +
      `整体RMS ${f(db(rms(L, 0, L.length)))} dBFS  峰值 ${f(db(peak))} dBFS`,
  );
}

console.log('\n=== 循环边界连续性（尾 50ms vs 头 50ms）===');
for (const k of ['awake-loopAB', 'dream-loopAB']) {
  const L = files[k].ch[0];
  const n = Math.round(SR * 0.05);
  const { jumpRms, tailRms } = boundary(L, n);
  const head = rms(L, 0, n);
  console.log(
    `${k.padEnd(14)} 头RMS ${f(db(head))} dB / 尾RMS ${f(db(tailRms))} dB / ` +
      `接缝跳变 ${f(db(jumpRms))} dB（相对尾部 ${f(db(jumpRms) - db(tailRms))} dB）`,
  );
  // 尾部是否为静止（静音收尾 → 循环会有空档）
  const last10 = rms(L, L.length - Math.round(SR * 0.01), L.length);
  const first10 = rms(L, 0, Math.round(SR * 0.01));
  console.log(`${''.padEnd(14)} 末 10ms RMS ${f(db(last10))} / 首 10ms RMS ${f(db(first10))}`);
}

console.log('\n=== intro 与 loop 的关系（归一化互相关，取 loop 开头 4s 为参考）===');
for (const form of ['awake', 'dream']) {
  const intro = files[`${form}-intro`].ch[0];
  const loop = files[`${form}-loopAB`].ch[0];
  const n = SR * 4;
  const base = xcorr(loop, loop, 0, n);
  console.log(`\n[${form}] loop 自相关(0) = ${f(base, 3)}`);
  const offs = [0, SR * 0.5, SR * 5, SR * 10, SR * 20, loop.length / 2 - n, loop.length - n * 2];
  for (const off of offs) {
    const o = Math.round(off);
    console.log(`  intro@${(o / SR).toFixed(2)}s vs loop@0s : r = ${f(xcorr(intro, loop, o, n), 3)}`);
  }
  // intro 尾部 vs loop 头部：判断 intro 结束后能否直接切入 loop
  const tail = Math.round(SR * 0.5);
  const a = intro.subarray(intro.length - tail);
  console.log(`  intro 尾 0.5s vs loop 头 0.5s : r = ${f(xcorr(a, loop, 0, tail), 3)}`);
}

console.log('\n=== 分段 RMS 包络（每 5s 一段，dBFS）===');
for (const [k, w] of Object.entries(files)) {
  const L = w.ch[0];
  const seg = SR * 5;
  const out = [];
  for (let t = 0; t < L.length; t += seg) {
    out.push(f(db(rms(L, t, Math.min(L.length, t + seg))), 1));
  }
  console.log(`${k.padEnd(14)} ${out.join(' ')}`);
}
