/** Serializable source recipes, independent of DOM and sample storage. */
export const SOURCE_WAVES = Object.freeze({ soft: '柔和脉冲', sine: '正弦', triangle: '三角', saw: '锯齿', pulse: '方脉冲', custom: '自定义谐波' });
export const SOURCE_PRESETS = Object.freeze({
  original: { name: '初始声源', source: { wave: 'soft', formant: 1, morph: .46, formantMix: 1, double: .16, detune: 15.5, attack: .009, release: .022 } },
  bubble: { name: '圆润气泡', source: { wave: 'sine', formant: .85, morph: .8, formantMix: .45, double: .12, detune: 8, attack: .016, release: .045 } },
  reed: { name: '轻薄簧片', source: { wave: 'pulse', formant: 1.12, morph: .65, formantMix: .82, double: .24, detune: 11, attack: .012, release: .03 } },
  thread: { name: '细弦', source: { wave: 'saw', formant: .95, morph: .25, formantMix: .9, double: .34, detune: 21, attack: .026, release: .055 } },
});
const DEFAULT_HARMONICS = [1, .48, .24, .13, 0, .07, 0, 0];
const fields = new Set(['mode','wave','baseFrequency','formant','morph','formantMix','double','detune','attack','release','harmonics','bankId','bankVersion','sampleTune','sampleOffset','sampleMix']);
function num(value, fallback, min, max, name) {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error(`${name} 必须在 ${min}–${max} 之间`);
  return value;
}
export function normalizeSource(input = {}, voice = { f0: 294, double: .16 }) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('source 必须是对象');
  for (const field of Object.keys(input)) if (!fields.has(field)) throw new Error(`未知声源参数：${field}`);
  const mode = input.mode ?? 'synth', wave = input.wave ?? 'soft';
  if (!['synth', 'sample', 'hybrid'].includes(mode)) throw new Error('声源类型需要 synth / sample / hybrid');
  if (!Object.hasOwn(SOURCE_WAVES, wave)) throw new Error(`未知声源波形：${wave}`);
  const bankId = input.bankId ?? '';
  if (typeof bankId !== 'string' || bankId && !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(bankId)) throw new Error('采样库 ID 格式不正确');
  const bankVersion = num(input.bankVersion, 1, 1, 2147483647, '采样库版本');
  if (!Number.isInteger(bankVersion)) throw new Error('采样库版本需要整数');
  const harmonics = input.harmonics ?? DEFAULT_HARMONICS;
  if (!Array.isArray(harmonics) || harmonics.length !== 8) throw new Error('自定义波形需要 8 个谐波振幅');
  const h = Array.from(harmonics, n => num(n, NaN, 0, 1, '谐波振幅'));
  if (h.some(n => !Number.isFinite(n))) throw new Error('谐波振幅不能空缺');
  if (wave === 'custom' && h.every(n => n === 0)) throw new Error('自定义波形至少需要一个非零谐波');
  return {
    mode, wave, baseFrequency: num(input.baseFrequency, voice.f0, 65, 650, '基础音高'),
    formant: num(input.formant, 1, .6, 1.7, '声道尺寸'), morph: num(input.morph, .46, 0, 1, '元音滑动'),
    formantMix: num(input.formantMix, 1, 0, 1, '共鸣比例'), double: num(input.double, voice.double, 0, .7, '双声部'),
    detune: num(input.detune, 15.5, 0, 50, '声部距离'), attack: num(input.attack, .009, .002, .08, '起音'),
    release: num(input.release, .022, .005, .14, '收尾'), harmonics: h, bankId, bankVersion,
    sampleTune: num(input.sampleTune, 0, -24, 24, '采样调音'), sampleOffset: num(input.sampleOffset, 0, 0, 2, '采样偏移'),
    sampleMix: num(input.sampleMix, .7, 0, 1, '实录混合'),
  };
}
export function harmonicWeights(source) {
  if (source.wave === 'custom') return source.harmonics;
  if (source.wave === 'soft') return DEFAULT_HARMONICS;
  return Array.from({ length: 8 }, (_, i) => {
    const k = i + 1;
    if (source.wave === 'sine') return k === 1 ? 1 : 0;
    if (source.wave === 'triangle') return k % 2 ? (k % 4 === 1 ? 1 : -1) / (k * k) : 0;
    if (source.wave === 'pulse') return k % 2 ? .8 / k : 0;
    return .72 / k;
  });
}
export function normalizeExpression(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('expression 必须是对象');
  for (const k of Object.keys(input)) if (!['depth','lift','pauses','stretch'].includes(k)) throw new Error(`未知语调参数：${k}`);
  return { depth: num(input.depth, 1, 0, 2.5, '语调起伏'), lift: num(input.lift, 4.5, 0, 12, '句尾上扬'), pauses: num(input.pauses, 1, .3, 2.5, '停顿留白'), stretch: num(input.stretch, 1, .6, 1.8, '元音长度') };
}

/** Nested recipe overlays should preserve unrelated source / expression / melody settings. */
export function mergeOptions(...layers) {
  const out = {};
  for (const layer of layers) {
    if (layer === undefined) continue;
    if (!layer || typeof layer !== 'object' || Array.isArray(layer)) throw new Error('参数覆盖层必须是对象');
    Object.assign(out, Object.fromEntries(Object.entries(layer).filter(([k]) => !['source','expression','melody'].includes(k))));
    for (const k of ['source','expression','melody']) if (Object.hasOwn(layer, k)) {
      if (!layer[k] || typeof layer[k] !== 'object' || Array.isArray(layer[k])) throw new Error(`${k} 必须是对象`);
      out[k] = { ...(out[k] ?? {}), ...layer[k] };
    }
  }
  return out;
}
