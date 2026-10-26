/** Shared browser/Node DSP. Resource loading stays outside this deterministic module. */
import { normalizeSource, normalizeExpression, harmonicWeights } from './source.mjs';
import { normalizeSampleBank, renderSampleEvent } from './samples.mjs';
import { normalizeMelody, planMelody, renderMelodyEvent } from './melody.mjs';
export const ENGINE_VERSION = '0.2.1';
export const VOICES = Object.freeze({
  serena: { name: 'Serena', subtitle: '梦间', description: '已确认的 Ave 共用声音：Heather 实录与柔和脉冲混合。', f0: 272, pace: 1.12, formant: 1.08, crystal: .19, air: .08, echo: .07, double: .09 },
  lacuna: { name: 'Lacuna', subtitle: '轻讯', description: '已确认的 Ave 共用声音：Heather 实录与柔和脉冲混合。', f0: 272, pace: 1.12, formant: 1.08, crystal: .19, air: .08, echo: .07, double: .09 },
  veil: { name: 'Veil', subtitle: '留白', description: '同一声音的远处，缓慢、轻声，留有空隙。', f0: 238, pace: .77, formant: 1.02, crystal: .47, air: .29, echo: .32, double: .23 },
});
export const MOODS = Object.freeze({
  natural: { name: '自然', pitch: 0, pace: 1, energy: 1, contour: 1 },
  bright: { name: '雀跃', pitch: 2, pace: 1.13, energy: 1.1, contour: 1.6 },
  curious: { name: '好奇', pitch: .5, pace: .94, energy: .95, contour: 1.35 },
  soft: { name: '轻声', pitch: -1, pace: .89, energy: .76, contour: .6 },
  inquiring: { name: '探问', description: '先轻轻探一下，再抬高句尾。', pitch: .8, pace: .91, energy: .93, contour: 1.4, gesture: [0, 1, -.8, 2.5, 1.5], curve: 'double-rise' },
  delighted: { name: '惊喜', description: '快速向上跃起，末尾轻轻回落。', pitch: 1.5, pace: 1.05, energy: 1.04, contour: 1.65, gesture: [-1, 3, 1, 4, 0], curve: 'spark' },
  musing: { name: '思索', description: '拉长一点元音，停一下，再接着想。', pitch: -.6, pace: .84, energy: .88, contour: .95, gesture: [0, -.7, 1, -.3, 1.8], curve: 'thinking' },
  playful: { name: '俏皮', description: '带弹性的高低摇摆，像偷偷藏着好事。', pitch: .9, pace: 1.06, energy: 1.01, contour: 1.4, gesture: [0, 3, -2, 2, -1], curve: 'swing' },
  wondering: { name: '轻问', description: '轻声开口，带一小段悬而未决的上扬。', pitch: -.5, pace: .88, energy: .79, contour: .8, gesture: [0, .5, -.5, 1, .3], curve: 'gentle-rise' },
});
export const LIMITS = Object.freeze({ text: 1200, duration: 180, lines: 80, totalDuration: 600 });
export const TEXTURES = Object.freeze({
  prism: { name: '碎晶', description: '柔软元音与细小晶体泛音', chain: ['元音滑动', '双声部', '碎晶泛音', '短反射'] },
  ribbon: { name: '织音', description: '交错的微小颗粒，带柔软弦感', chain: ['元音滑动', '交错微粒', '梳状共鸣', '短反射'] },
  hollow: { name: '空镜', description: '反向声影轻轻先于元音出现', chain: ['元音滑动', '反向碎片', '稀疏回声', '短反射'] },
  porcelain: { name: '瓷语', description: '短促、空心，像敲响小小的瓷片', chain: ['元音滑动', '弹拨包络', '非整数泛音', '短反射'] },
});
const TAU = 2 * Math.PI;
const VOWELS = 'aeiou';
const FORMANTS = { a: [760, 1180, 2650], e: [490, 1810, 2550], i: [320, 2250, 2980], o: [510, 890, 2450], u: [350, 740, 2220] };
const MOUTHS = { a: 'D', e: 'C', i: 'B', o: 'E', u: 'F' };
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const round = n => Math.round(n * 1e6) / 1e6;
export function hash(value) {
  let n = 2166136261;
  for (const ch of String(value)) { n ^= ch.codePointAt(0); n = Math.imul(n, 16777619); }
  return n >>> 0;
}
function random(seed) {
  let n = seed >>> 0;
  return () => { n += 0x6D2B79F5; let t = n; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function number(value, fallback, low, high, key) {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < low || value > high) throw new Error(`${key} 必须是 ${low}–${high} 之间的数字`);
  return value;
}
export function normalizeOptions(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('参数必须是对象');
  const voice = input.voice ?? 'serena', mood = input.mood ?? 'natural';
  if (!Object.hasOwn(VOICES, voice)) throw new Error(`未知声线：${voice}`);
  if (!Object.hasOwn(MOODS, mood)) throw new Error(`未知语气：${mood}`);
  const p = VOICES[voice];
  const texture = input.texture ?? 'prism';
  if (!Object.hasOwn(TEXTURES, texture)) throw new Error(`未知处理管路：${texture}`);
  const sampleRate = input.sampleRate ?? 48000;
  if (![24000, 44100, 48000].includes(sampleRate)) throw new Error('采样率支持 24000、44100、48000');
  if (input.seed !== undefined && !Number.isInteger(input.seed)) throw new Error('seed 必须是整数');
  return {
    voice, mood, texture, sampleRate,
    seed: number(input.seed, 17, 0, 4294967295, 'seed'),
    pitch: number(input.pitch, 0, -12, 12, 'pitch'),
    speed: number(input.speed, 1, .5, 2, 'speed'),
    crystal: number(input.crystal, p.crystal, 0, 1, 'crystal'),
    air: number(input.air, p.air, 0, 1, 'air'),
    echo: number(input.echo, p.echo, 0, 1, 'echo'),
    gain: number(input.gain, .85, 0, 1, 'gain'),
    source: normalizeSource(input.source, p), expression: normalizeExpression(input.expression), melody: normalizeMelody(input.melody),
  };
}

// Invented syllables, not a pronunciation engine. Stable mapping gives each text a motif.
const KANA = new Map();
for (const row of ['あいうえお', 'かきくけこ', 'さしすせそ', 'たちつてと', 'なにぬねの', 'はひふへほ', 'まみむめも', 'らりるれろ', 'がぎぐげご', 'ざじずぜぞ', 'だぢづでど', 'ばびぶべぼ', 'ぱぴぷぺぽ']) {
  [...row].forEach((c, i) => { KANA.set(c, 'aiueo'[i]); KANA.set(String.fromCharCode(c.charCodeAt(0) + 96), 'aiueo'[i]); });
}
function vowelFor(text) {
  const latin = text.toLowerCase().match(/[aeiou]/g);
  return latin?.at(-1) ?? KANA.get(text) ?? VOWELS[hash(text) % 5];
}
export function tokenize(text) {
  const parts = text.normalize('NFC').match(/[a-zA-Z]+(?:['’][a-zA-Z]+)?|[\r\n]+|[…]+|\.{2,}|\s+|[^\s]/gu) ?? [];
  const tokens = [];
  for (const part of parts) {
    if (/^[a-zA-Z]/.test(part)) {
      const syllables = part.match(/[^aeiouAEIOU]*[aeiouAEIOU]+(?:[^aeiouAEIOU](?=$))?|[^aeiouAEIOU]+$/g) ?? [part];
      for (const ch of syllables) tokens.push({ text: ch, kind: 'syllable', vowel: vowelFor(ch) });
    } else if (/^[\p{L}\p{N}]$/u.test(part)) {
      tokens.push({ text: part, kind: 'syllable', vowel: vowelFor(part) });
    } else {
      const duration = /\n/.test(part) ? .4 : /[…]|\.{2}/.test(part) ? .55 : /[。.!！?？]/.test(part) ? .3 : /[,，、;；:：]/.test(part) ? .16 : /\s/.test(part) ? .04 : .025;
      tokens.push({ text: part, kind: 'pause', duration, rise: /[?？]/.test(part) });
    }
  }
  return tokens;
}

export function planSpeech(text, input = {}) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('请输入台词');
  if ([...text].length > LIMITS.text) throw new Error(`单句最多 ${LIMITS.text} 个字符，请分成多句`);
  const options = normalizeOptions(input), p = VOICES[options.voice], mood = MOODS[options.mood];
  const rng = random(hash(text) ^ options.seed);
  const tokens = tokenize(text);
  if (!tokens.some(t => t.kind === 'syllable')) throw new Error('台词至少需要一个文字或数字');
  const pace = options.speed * p.pace * mood.pace;
  let cursor = .045, syllable = 0;
  const events = tokens.map((token, index) => {
    if (token.kind === 'pause') {
      const event = { ...token, start: round(cursor), end: round(cursor + token.duration * options.expression.pauses / pace) };
      cursor = event.end;
      return event;
    }
    const next = tokens[index + 1], phraseEnd = !next || next.kind === 'pause' && next.duration >= .16;
    const duration = (.094 + rng() * .033 + (phraseEnd ? .03 : 0)) / pace * options.expression.stretch * (options.mood === 'musing' && syllable % 3 === 2 ? 1.16 : 1);
    // A repeating three-syllable gesture, softened by phrase contour and seeded variation.
    const gesture = (mood.gesture ?? [0, 2.3, -.9, 1.1, -1.8])[syllable % 5];
    const pitch = options.pitch + mood.pitch + (gesture + (rng() - .5) * 2.1) * mood.contour * options.expression.depth;
    const event = { kind: 'syllable', text: token.text, vowel: token.vowel, mouth: MOUTHS[token.vowel], start: round(cursor), end: round(cursor + duration), pitch: round(pitch), rise: !!next?.rise || ['curious','inquiring','wondering'].includes(options.mood) && phraseEnd, phraseEnd, curve: mood.curve ?? 'classic', strength: .84 + rng() * .16, index: syllable++ };
    cursor += duration + (.023 + rng() * .014) / pace + (options.voice === 'veil' && syllable % 4 === 0 ? .055 : 0) + (options.mood === 'musing' && syllable % 3 === 0 ? .065 * options.expression.pauses : 0);
    return event;
  });
  const duration = Math.ceil((cursor + .16 + options.echo * .72) * options.sampleRate) / options.sampleRate;
  if (duration > LIMITS.duration) throw new Error(`单句音频不能超过 ${LIMITS.duration} 秒，请提高语速或缩短台词`);
  return { text, options, events: planMelody(events, options.melody, options.seed), duration, syllableCount: syllable };
}

// Stable two-pole resonators articulate a soft pulse source into moving vowels.
function resonator(frequency, bandwidth, sr) {
  const w = TAU * frequency / sr, r = Math.exp(-Math.PI * bandwidth / sr), a = 2 * r * Math.cos(w), b = r * r, gain = (1 - r) * Math.sin(w);
  let z1 = 0, z2 = 0;
  return x => { const y = gain * x + a * z1 - b * z2; z2 = z1; z1 = y; return y; };
}
function synthSyllable(event, options, dry, shimmer) {
  const sr = options.sampleRate, p = VOICES[options.voice], mood = MOODS[options.mood];
  const source = options.source, harmonics = harmonicWeights(source);
  const begin = Math.round(event.start * sr), length = Math.round((event.end - event.start) * sr);
  const rng = random(hash(event.text) ^ options.seed ^ Math.imul(event.index + 1, 7919));
  const frequency = source.baseFrequency * 2 ** (event.pitch / 12);
  const formants = FORMANTS[event.vowel].map(f => f * p.formant * source.formant);
  const resonators = formants.map((f, i) => resonator(f, [105, 150, 220][i], sr));
  const endVowel = FORMANTS[VOWELS[(VOWELS.indexOf(event.vowel) + 1) % 5]];
  const ending = endVowel.map((f, i) => resonator(f * p.formant * source.formant, [110, 165, 240][i], sr));
  let phase = rng(), twin = rng(), lowNoise = 0, previousNoise = 0;
  for (let i = 0; i < length; i++) {
    const t = i / sr, u = i / length;
    const glide = eventGlide(event, u, options.expression);
    const f = frequency * 2 ** ((glide + .10 * Math.sin(TAU * 5.7 * t)) / 12);
    phase = (phase + f / sr) % 1;
    twin = (twin + f * 2 ** (source.detune / 1200) / sr) % 1;
    const pulse = q => harmonics.reduce((sum, weight, k) => (k + 1) * f < sr * .47 ? sum + 2 * weight * Math.sin((k + 1) * TAU * q) : sum, 0);
    const raw = pulse(phase) + source.double * pulse(twin);
    const morph = Math.max(0, (u - .4) / .6) * source.morph;
    const voiced = resonators.reduce((sum, filter, j) => sum + (filter(raw) * (1 - morph) + ending[j](raw) * morph) * [1.25, .72, .26][j], 0);
    const noise = rng() * 2 - 1;
    lowNoise += .22 * (noise - lowNoise);
    const air = (lowNoise - previousNoise) * 3;
    previousNoise = lowNoise;
    const attack = Math.min(1, t / source.attack), release = Math.min(1, (length - i - 1) / (sr * source.release));
    const env = Math.sin(Math.PI / 2 * attack) ** 2 * Math.max(0, release) ** 1.6 * (.9 - .22 * u);
    const onset = air * .1 * Math.min(1, options.air / .12) * Math.exp(-t * 150);
    const core = voiced * .50 * source.formantMix + raw * .17 * (1 - source.formantMix) + Math.sin(TAU * phase) * .13 * harmonics[0] + air * options.air * .1 + onset;
    dry[begin + i] += core * env * event.strength * mood.energy;
    // Inharmonic dyad echoes the same pitch; sparse enough to preserve vocal identity.
    const crystalEnv = (1 - Math.exp(-t * 260)) * Math.exp(-t * 31) * release;
    shimmer[begin + i] += options.crystal * .072 * crystalEnv * (Math.sin(TAU * frequency * 2.003 * t) + .45 * Math.sin(TAU * frequency * 3.987 * t + Math.sin(TAU * 7 * t) * .2));
  }
  if (event.phraseEnd && options.crystal > 0) {
    const start = begin + Math.floor(length * .72), tail = Math.round(sr * (.10 + .15 * options.crystal));
    for (let i = 0; i < tail && start + i < shimmer.length; i++) {
      const t = i / sr, env = Math.min(1, t / .008) * Math.exp(-t * 34) * Math.min(1, (tail - i - 1) / (sr * .015));
      shimmer[start + i] += options.crystal * .039 * env * (Math.sin(TAU * frequency * 3.003 * t) + .3 * Math.sin(TAU * frequency * 4.98 * t));
    }
  }
}

export function renderVoice(text, input = {}, resources = {}) {
  const plan = planSpeech(text, input), { options, events } = plan;
  const n = Math.ceil(plan.duration * options.sampleRate), dry = new Float32Array(n), shimmer = new Float32Array(n);
  const sampleMode = options.source.mode !== 'synth';
  let bank;
  if (sampleMode) {
    const rawBank = resources.banks?.[options.source.bankId];
    if (!rawBank) throw new Error(`采样库未加载：${options.source.bankId || '请在声源工坊选择人声素材'}`);
    bank = normalizeSampleBank(rawBank);
  }
  for (const event of events) if (event.kind === 'syllable') {
    synthSyllable(event, options, dry, shimmer);
    if (bank) {
      const recording = renderSampleEvent(event, { source: { ...options.source, sampleBaseFrequency: options.source.baseFrequency, sampleContour: Array.from({ length: 9 }, (_, i) => eventGlide(event, i / 8, options.expression)) } }, options.sampleRate, bank);
      const begin = Math.round(event.start * options.sampleRate), mix = options.source.mode === 'sample' ? 1 : options.source.sampleMix;
      const synthGain = mix === 1 ? 0 : Math.cos(mix * Math.PI / 2), sampleGain = Math.sin(mix * Math.PI / 2);
      for (let i = 0; i < recording.length; i++) dry[begin + i] = dry[begin + i] * synthGain + recording[i] * sampleGain * .62 * MOODS[options.mood].energy;
    }
  }
  applyTexture(dry, shimmer, events, options);
  for (const event of events) if (event.melody) {
    const wet = renderMelodyEvent(event, options.melody, options.sampleRate), at = Math.round(event.start * options.sampleRate), mix = event.melody.mix;
    for (let i = 0; i < wet.length; i++) { dry[at + i] = dry[at + i] * (1 - mix) + wet[i] * mix; shimmer[at + i] *= 1 - mix; }
  }
  const samples = new Float32Array(n), sr = options.sampleRate;
  const delays = [.071, .127, .211, .337].map(seconds => Math.round(seconds * sr));
  let prev = 0, dc = 0, peak = 0, power = 0;
  for (let i = 0; i < n; i++) {
    let x = dry[i] + shimmer[i];
    for (let j = 0; j < delays.length; j++) {
      const at = i - delays[j];
      if (at >= 0) x += (dry[at] * .24 + shimmer[at] * .7) * options.echo * (.65 ** j);
    }
    // DC blocker plus fixed soft saturation: no per-clip auto-normalization of quiet moods.
    dc = x - prev + .995 * dc; prev = x;
    const edge = Math.min(1, i / (sr * .005), (n - 1 - i) / (sr * .02));
    samples[i] = Math.tanh(dc * 1.65) * .87 * options.gain * Math.max(0, edge);
    peak = Math.max(peak, Math.abs(samples[i])); power += samples[i] ** 2;
  }
  const mouthCues = [];
  let end = 0;
  for (const e of events.filter(e => e.kind === 'syllable')) {
    if (e.start > end) mouthCues.push({ start: round(end), end: e.start, value: 'X' });
    mouthCues.push({ start: e.start, end: e.end, value: e.mouth });
    end = e.end;
  }
  if (end < plan.duration) mouthCues.push({ start: end, end: round(plan.duration), value: 'X' });
  return { samples, metadata: { schema: 'ave-voice/1', engineVersion: ENGINE_VERSION, ...plan, sampleRate: sr, channels: 1, duration: samples.length / sr, mouthCues, ...(bank ? { sourceBank: { id: bank.id, name: bank.name, rootFrequency: bank.rootFrequency, provenance: resources.provenance?.[bank.id] ?? null } } : {}), peak: round(peak), rms: round(Math.sqrt(power / n)) } };
}

export function eventGlide(event, u, expression) {
  const lift = expression.lift, d = expression.depth;
  const classic = event.rise ? -1 + lift * u * u : 1.6 * Math.exp(-u * 9) - 2.1 * u;
  if (event.curve === 'double-rise') return d * (-1.2 + 2.8 * Math.sin(Math.PI * u) ** 2 + (event.phraseEnd ? lift * u ** 3 : -1.4 * u));
  if (event.curve === 'spark') return d * (-1 + 5.6 * Math.sin(Math.PI * Math.min(1, u * 1.3)) - 1.1 * u);
  if (event.curve === 'thinking') return d * (-1.6 * Math.sin(Math.PI * u) + (event.phraseEnd ? lift * .48 * u ** 3 : .9 * u));
  if (event.curve === 'swing') return d * (2.8 * Math.sin(TAU * .8 * u + (event.index % 2) * Math.PI) + (event.phraseEnd ? lift * .4 * u * u : 0));
  if (event.curve === 'gentle-rise') return d * (-.8 + lift * .7 * u ** 2.4);
  return classic * d;
}

function applyTexture(dry, shimmer, events, options) {
  const sr = options.sampleRate, source = dry.slice();
  if (options.texture === 'prism') return;
  for (const e of events) {
    if (e.kind !== 'syllable') continue;
    const start = Math.round(e.start * sr), length = Math.round((e.end - e.start) * sr);
    const f = options.source.baseFrequency * 2 ** (e.pitch / 12);
    if (options.texture === 'hollow') {
      const pre = Math.min(start, Math.round(sr * .039));
      for (let i = 0; i < length; i++) {
        const u = i / length;
        dry[start + i] *= .74;
        // A reversed fragment precedes each syllable; the leading 45ms is intentional.
        dry[start - pre + i] += source[start + length - i - 1] * Math.sin(Math.PI * u) ** 2 * .50;
      }
    } else if (options.texture === 'ribbon') {
      const delay = Math.round(sr / (f * .503));
      for (let i = 0; i < length; i++) {
        const t = i / sr, window = .72 + .28 * Math.cos(TAU * 32 * t);
        dry[start + i] = source[start + i] * window * .78 + (i >= delay ? source[start + i - delay] * .42 : 0);
        const shifted = Math.floor(i * .749);
        shimmer[start + i] += source[start + shifted] * .24 * Math.sin(Math.PI * i / length) ** 2;
      }
    } else if (options.texture === 'porcelain') {
      for (let i = 0; i < length; i++) {
        const t = i / sr, release = Math.min(1, (length - i - 1) / (sr * .016));
        dry[start + i] *= .5 * Math.exp(-t * 15);
        const env = (1 - Math.exp(-t * 600)) * Math.exp(-t * 39) * release;
        shimmer[start + i] += .22 * env * (Math.sin(TAU * f * 1.001 * t) + .48 * Math.sin(TAU * f * 2.756 * t) + .23 * Math.sin(TAU * f * 5.404 * t));
      }
    }
  }
}

export function encodeWav(samples, sampleRate = 48000, bitDepth = 24) {
  if (![16, 24].includes(bitDepth)) throw new Error('WAV 位深支持 16 或 24');
  const bytes = bitDepth / 8, dataSize = samples.length * bytes, pad = dataSize % 2;
  const out = new Uint8Array(44 + dataSize + pad), view = new DataView(out.buffer);
  const label = (at, s) => [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  label(0, 'RIFF'); view.setUint32(4, out.length - 8, true); label(8, 'WAVE'); label(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * bytes, true);
  view.setUint16(32, bytes, true); view.setUint16(34, bitDepth, true); label(36, 'data'); view.setUint32(40, dataSize, true);
  for (let i = 0; i < samples.length; i++) {
    const value = clamp(samples[i], -1, 1), scale = value < 0 ? 2 ** (bitDepth - 1) : 2 ** (bitDepth - 1) - 1;
    const v = Math.round(value * scale), at = 44 + i * bytes;
    if (bitDepth === 16) view.setInt16(at, v, true);
    else { view.setUint8(at, v & 255); view.setUint8(at + 1, v >> 8 & 255); view.setUint8(at + 2, v >> 16 & 255); }
  }
  return out;
}
