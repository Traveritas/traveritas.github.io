/** Experimental, original musical substitutions. Pure DSP; browser / Node compatible. */
const freezePreset = value => Object.freeze({ ...value, degrees: Object.freeze(value.degrees) });
export const MELODY_PRESETS = Object.freeze({
  inquiry: freezePreset({ name: '探头问句', description: '小步上探后悬停，像一句没有说完的疑问。', degrees: [0, 1, 4, 2], instrument: 'glass' }),
  satellite: freezePreset({ name: '绕月信号', description: '跳远、回望、再次偏离的四音信号。', degrees: [0, 4, 1, 5, 2], instrument: 'reed' }),
  pendulum: freezePreset({ name: '迟到摆钟', description: '轻轻下坠后回弹，末音落在意外的位置。', degrees: [3, 0, 2, -1, 1], instrument: 'pluck' }),
});
export const MELODY_INSTRUMENTS = Object.freeze({ glass: '玻璃滴音', reed: '气息簧音', pluck: '柔弦拨音' });
export const MELODY_SCALES = Object.freeze({
  pentatonic: Object.freeze([0, 2, 4, 7, 9]),
  dorian: Object.freeze([0, 2, 3, 5, 7, 9, 10]),
  'whole-tone': Object.freeze([0, 2, 4, 6, 8, 10]),
  chromatic: Object.freeze([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]),
});
const KEYS = new Set(['mode', 'preset', 'instrument', 'root', 'scale', 'density', 'mix', 'notes']);
const TAU = Math.PI * 2;
const frequencyFor = note => 440 * 2 ** ((note - 69) / 12);

function object(value, key) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${key} must be an object`);
}
function number(value, fallback, low, high, key, integer = false) {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < low || value > high || integer && !Number.isInteger(value)) {
    throw new RangeError(`${key} must be ${integer ? 'an integer' : 'a number'} in ${low}..${high}`);
  }
  return value;
}
function choice(value, fallback, allowed, key) {
  const result = value === undefined ? fallback : value;
  if (typeof result !== 'string' || !Object.hasOwn(allowed, result)) throw new RangeError(`Unknown ${key}: ${String(result)}`);
  return result;
}

/** notes, when supplied, are exact semitone offsets from root and override the preset/scale motif. */
export function normalizeMelody(input = {}) {
  object(input, 'melody');
  for (const key of Object.keys(input)) if (!KEYS.has(key)) throw new RangeError(`Unknown melody option: ${key}`);
  const mode = choice(input.mode, 'off', { off: 1, density: 1, 'phrase-end': 1 }, 'melody mode');
  const preset = choice(input.preset, 'inquiry', MELODY_PRESETS, 'melody preset');
  const instrument = choice(input.instrument, MELODY_PRESETS[preset].instrument, MELODY_INSTRUMENTS, 'melody instrument');
  const root = number(input.root, 60, 24, 84, 'melody root MIDI', true);
  const scale = choice(input.scale, 'pentatonic', MELODY_SCALES, 'melody scale');
  const density = number(input.density, .35, 0, 1, 'melody density');
  const mix = number(input.mix, .75, 0, 1, 'melody mix');
  let notes;
  if (input.notes !== undefined) {
    if (!Array.isArray(input.notes) || input.notes.length < 1 || input.notes.length > 32) throw new RangeError('melody notes must contain 1..32 semitone offsets');
    // Array.from also checks sparse array holes rather than silently skipping them.
    notes = Array.from(input.notes, value => {
      if (value === undefined) throw new RangeError('melody notes cannot contain empty entries');
      return number(value, undefined, -24, 24, 'melody note offset', true);
    });
  }
  return { mode, preset, instrument, root, scale, density, mix, ...(notes ? { notes } : {}) };
}

function random(seed) {
  let n = seed >>> 0;
  return () => {
    n += 0x6D2B79F5;
    let t = n;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function validateEvent(event) {
  object(event, 'event');
  if (event.kind !== 'syllable' && event.kind !== 'pause') throw new RangeError('event kind must be syllable or pause');
  number(event.start, NaN, 0, 600, 'event start');
  number(event.end, NaN, 0, 600, 'event end');
  if (!Number.isFinite(event.start) || !Number.isFinite(event.end) || event.end <= event.start) throw new RangeError('event end must be greater than start');
}
function degreeOffset(degree, scale) {
  const octave = Math.floor(degree / scale.length);
  return octave * 12 + scale[((degree % scale.length) + scale.length) % scale.length];
}
function phraseEnding(events, index) {
  const event = events[index];
  if (event.phraseEnd !== undefined) {
    if (typeof event.phraseEnd !== 'boolean') throw new TypeError('phraseEnd must be boolean');
    return event.phraseEnd;
  }
  const next = events[index + 1];
  return !next || next.kind === 'pause' && next.end - next.start >= .12 || next.kind === 'syllable' && next.start - event.end >= .12;
}

/** Returns new events; only a `melody` metadata field changes. Density applies in density mode only. */
export function planMelody(events, input = {}, seed = 17) {
  if (!Array.isArray(events)) throw new TypeError('events must be an array');
  const options = normalizeMelody(input);
  number(seed, 17, 0, 4294967295, 'melody seed', true);
  const rng = random(seed), scale = MELODY_SCALES[options.scale];
  const offsets = options.notes ?? MELODY_PRESETS[options.preset].degrees.map(degree => degreeOffset(degree, scale));
  let motifIndex = 0, previousEnd = 0;
  events.forEach(event => {
    validateEvent(event);
    if (event.start < previousEnd) throw new RangeError('events must be ordered and must not overlap');
    previousEnd = event.end;
  });
  return events.map((event, index) => {
    // Replanning (including off) removes stale musical metadata.
    const { melody: oldMelody, ...copy } = event;
    if (event.kind !== 'syllable') return copy;
    const endsPhrase = phraseEnding(events, index);
    const selected = options.mode === 'density' ? rng() < options.density : options.mode === 'phrase-end' && endsPhrase;
    if (!selected) return copy;
    const step = motifIndex++ % offsets.length, note = options.root + offsets[step];
    return { ...copy, melody: { note, frequency: frequencyFor(note), instrument: options.instrument, mix: options.mix, preset: options.preset, step, experimental: true } };
  });
}

/** A pure wet mono stem, with no tail beyond this syllable. Apply event.melody.mix in the caller. */
export function renderMelodyEvent(event, input = {}, sampleRate = 48000) {
  validateEvent(event);
  const options = normalizeMelody(input);
  if (![24000, 44100, 48000].includes(sampleRate)) throw new RangeError('melody sampleRate must be 24000, 44100 or 48000');
  const length = Math.round((event.end - event.start) * sampleRate);
  if (length > sampleRate * 10) throw new RangeError('a melody syllable cannot exceed 10 seconds');
  const samples = new Float32Array(length);
  if (options.mode === 'off' || event.kind !== 'syllable' || event.melody === undefined) return samples;
  object(event.melody, 'event.melody');
  const note = number(event.melody.note, NaN, 0, 108, 'event melody MIDI note', true);
  if (!Number.isFinite(note)) throw new RangeError('event melody note is required');
  const instrument = choice(event.melody.instrument, options.instrument, MELODY_INSTRUMENTS, 'event melody instrument');
  const frequency = frequencyFor(note), duration = length / sampleRate;
  const strength = number(event.strength, 1, 0, 2, 'event strength');
  const attack = Math.min(.007, duration * .2), release = Math.min(.024, duration * .3);
  // Harmonics beyond 46% of the sample rate are omitted to avoid aliasing at high roots.
  const audible = ratio => frequency * ratio < sampleRate * .46;
  const sine = (ratio, t, phase = 0) => audible(ratio) ? Math.sin(TAU * frequency * ratio * t + phase) : 0;
  for (let i = 1; i < length - 1; i++) {
    const t = i / sampleRate;
    const env = Math.sin(Math.PI / 2 * Math.min(1, t / attack)) ** 2
      * Math.sin(Math.PI / 2 * Math.min(1, (length - 1 - i) / sampleRate / release)) ** 2;
    let value;
    if (instrument === 'glass') {
      value = (sine(1, t) * Math.exp(-t * 7) + .27 * sine(2.003, t) * Math.exp(-t * 24)
        + .12 * sine(4.07, t) * Math.exp(-t * 48)) * .29;
    } else if (instrument === 'reed') {
      const breath = .95 + .05 * Math.sin(TAU * 13 * t);
      value = (sine(1, t) + .23 * sine(2, t) + .13 * sine(3, t) + .06 * sine(5, t))
        * breath * (.78 + .22 * Math.exp(-t * 9)) * .25;
    } else {
      value = (sine(1, t) * Math.exp(-t * 5) + .37 * sine(2, t) * Math.exp(-t * 23)
        + .17 * sine(3, t) * Math.exp(-t * 42) + .08 * sine(5, t) * Math.exp(-t * 65)) * .27;
    }
    samples[i] = value * env * strength;
  }
  return samples;
}
