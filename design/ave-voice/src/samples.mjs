/** Portable PCM preparation and pitch-synchronous sample rendering. No browser globals. */
const MAX_INPUT_SECONDS = 30;
const MAX_CLIP_SECONDS = 2;
const MAX_BANK_SECONDS = 10;
const VOWELS = ['a', 'e', 'i', 'o', 'u'];
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
function finite(value, name, min, max) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error(`${name} must be between ${min} and ${max}`);
  return value;
}
function rate(value) {
  if (!Number.isInteger(value)) throw new Error('sampleRate must be an integer');
  return finite(value, 'sampleRate', 8000, 192000);
}
function pcm(values, sampleRate, seconds) {
  rate(sampleRate);
  if (!(Array.isArray(values) || values instanceof Float32Array || values instanceof Float64Array) || !values.length) throw new Error('samples must be a nonempty PCM array');
  if (values.length > sampleRate * seconds) throw new Error(`sample exceeds ${seconds} seconds`);
  for (const value of values) finite(value, 'PCM value', -1, 1);
}
function record(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${name} must be an object`);
}

/** Decode RIFF WAVE PCM16/24/32 or IEEE float32, averaging 1–8 channels to mono. */
export function decodeWav(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new Error('WAV must be a Uint8Array');
  if (bytes.byteLength < 44 || bytes.byteLength > 192 * 1024 * 1024) throw new Error('WAV byte length is invalid');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const fourCC = at => String.fromCharCode(...bytes.subarray(at, at + 4));
  if (fourCC(0) !== 'RIFF' || fourCC(8) !== 'WAVE') throw new Error('Only RIFF WAVE files are supported');
  const riffEnd = view.getUint32(4, true) + 8;
  if (riffEnd > bytes.length || riffEnd < 44) throw new Error('Truncated WAV RIFF container');
  let format, data;
  for (let at = 12; at < riffEnd;) {
    if (at + 8 > riffEnd) throw new Error('Truncated WAV chunk header');
    const id = fourCC(at), size = view.getUint32(at + 4, true), body = at + 8;
    const next = body + size + (size & 1);
    if (next > riffEnd) throw new Error('Truncated WAV chunk');
    if (id === 'fmt ') {
      if (format || size < 16) throw new Error('Invalid WAV format chunk');
      let type = view.getUint16(body, true);
      const channels = view.getUint16(body + 2, true), sampleRate = view.getUint32(body + 4, true);
      const byteRate = view.getUint32(body + 8, true), blockAlign = view.getUint16(body + 12, true), bits = view.getUint16(body + 14, true);
      if (type === 0xfffe) {
        if (size < 40 || view.getUint16(body + 16, true) < 22 || view.getUint16(body + 18, true) !== bits) throw new Error('Unsupported WAV extensible format');
        const tail = [0, 0, 0, 0, 16, 0, 128, 0, 0, 170, 0, 56, 155, 113];
        if (!tail.every((value, i) => bytes[body + 26 + i] === value)) throw new Error('Unsupported WAV subformat');
        type = view.getUint16(body + 24, true);
      }
      if (!(type === 1 && [16, 24, 32].includes(bits) || type === 3 && bits === 32)) throw new Error('WAV must use PCM16/24/32 or float32');
      rate(sampleRate);
      if (channels < 1 || channels > 8 || blockAlign !== channels * bits / 8 || byteRate !== sampleRate * blockAlign) throw new Error('Invalid WAV channel layout');
      format = { type, channels, sampleRate, blockAlign, bits };
    } else if (id === 'data') {
      if (data) throw new Error('Multiple WAV data chunks are not supported');
      data = { body, size };
    }
    at = next;
  }
  if (!format || !data || !data.size || data.size % format.blockAlign) throw new Error('WAV has no complete PCM frames');
  const { type, channels, sampleRate, blockAlign, bits } = format;
  const frames = data.size / blockAlign;
  if (frames > sampleRate * MAX_INPUT_SECONDS) throw new Error('WAV exceeds 30 seconds; select a shorter recording');
  const samples = new Float32Array(frames), width = bits / 8;
  for (let frame = 0; frame < frames; frame++) {
    let sum = 0;
    for (let channel = 0; channel < channels; channel++) {
      const at = data.body + frame * blockAlign + channel * width;
      let value;
      if (type === 3) value = view.getFloat32(at, true);
      else if (bits === 16) value = view.getInt16(at, true) / 32768;
      else if (bits === 32) value = view.getInt32(at, true) / 2147483648;
      else { let raw = bytes[at] | bytes[at + 1] << 8 | bytes[at + 2] << 16; if (raw & 0x800000) raw -= 0x1000000; value = raw / 8388608; }
      if (!Number.isFinite(value)) throw new Error('WAV contains non-finite PCM');
      sum += clamp(value, -1, 1);
    }
    samples[frame] = sum / channels;
  }
  return { samples, sampleRate };
}

/** Bounded normalized autocorrelation; unvoiced / ambiguous clips return null. */
export function estimatePitch(samples, sampleRate) {
  pcm(samples, sampleRate, MAX_INPUT_SECONDS);
  if (samples.length < sampleRate * .025) return null;
  // Search a fixed number of windows; analyze at most 256 ms at <= 8 kHz.
  const windowLength = Math.min(samples.length, Math.round(sampleRate * .256));
  let chosen = 0, loudest = 0;
  for (let w = 0; w < 12; w++) {
    const start = Math.round((samples.length - windowLength) * w / 11);
    let power = 0;
    for (let i = start; i < start + windowLength; i += Math.max(1, Math.floor(sampleRate / 8000))) power += samples[i] ** 2;
    if (power > loudest) { chosen = start; loudest = power; }
  }
  const decimation = Math.max(1, Math.ceil(sampleRate / 8000)), sr = sampleRate / decimation;
  const n = Math.floor(windowLength / decimation), values = new Float64Array(n);
  let mean = 0;
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let j = 0; j < decimation; j++) sum += samples[chosen + i * decimation + j];
    values[i] = sum / decimation; mean += values[i];
  }
  mean /= n;
  let energy = 0;
  for (let i = 0; i < n; i++) { values[i] -= mean; energy += values[i] ** 2; }
  if (Math.sqrt(energy / n) < .003) return null;
  const minLag = Math.max(2, Math.floor(sr / 800)), maxLag = Math.min(Math.ceil(sr / 65), Math.floor(n / 3));
  if (maxLag <= minLag + 2) return null;
  const correlations = new Float64Array(maxLag + 2);
  for (let lag = minLag - 1; lag <= maxLag + 1; lag++) {
    let product = 0, left = 0, right = 0;
    for (let i = 0; i < n - lag; i++) { product += values[i] * values[i + lag]; left += values[i] ** 2; right += values[i + lag] ** 2; }
    correlations[lag] = product / Math.sqrt(left * right || 1);
  }
  const candidates = [];
  for (let lag = minLag; lag <= maxLag; lag++) if (correlations[lag] >= correlations[lag - 1] && correlations[lag] > correlations[lag + 1]) candidates.push(lag);
  if (!candidates.length) return null;
  const best = Math.max(...candidates.map(lag => correlations[lag]));
  if (best < .78) return null;
  const lag = candidates.find(lag => correlations[lag] >= Math.max(.78, best * .94));
  const a = correlations[lag - 1], b = correlations[lag], c = correlations[lag + 1];
  const offset = clamp(.5 * (a - c) / (a - 2 * b + c || 1), -.5, .5);
  const frequency = sr / (lag + offset);
  return frequency >= 65 && frequency <= 800 ? Math.round(frequency * 100) / 100 : null;
}

/** Crop at most two seconds, remove DC, optionally trim / normalize, and fade edges. */
export function prepareSample(samples, sampleRate, options = {}) {
  pcm(samples, sampleRate, MAX_INPUT_SECONDS); record(options, 'sample preparation options');
  const duration = samples.length / sampleRate;
  const start = finite(options.start ?? 0, 'start', 0, duration);
  const end = finite(options.end ?? duration, 'end', 0, duration);
  if (end <= start) throw new Error('end must be after start');
  for (const key of ['normalize', 'trimSilence']) if (options[key] !== undefined && typeof options[key] !== 'boolean') throw new Error(`${key} must be boolean`);
  let left = Math.round(start * sampleRate), right = Math.min(samples.length, Math.round(Math.min(end, start + MAX_CLIP_SECONDS) * sampleRate));
  if (right <= left) throw new Error('Selected sample is empty');
  let mean = 0;
  for (let i = left; i < right; i++) mean += samples[i];
  mean /= right - left;
  let peak = 0;
  for (let i = left; i < right; i++) peak = Math.max(peak, Math.abs(samples[i] - mean));
  if (options.trimSilence !== false && peak > .0001) {
    const threshold = Math.max(.002, peak * .025), padding = Math.round(sampleRate * .008);
    let first = left, last = right;
    while (first < right && Math.abs(samples[first] - mean) < threshold) first++;
    while (last > first && Math.abs(samples[last - 1] - mean) < threshold) last--;
    left = Math.max(left, first - padding); right = Math.min(right, last + padding);
  }
  const output = new Float32Array(right - left);
  const scale = options.normalize !== false && peak > .0001 ? .9 / peak : Math.min(1, 1 / (peak || 1));
  const fade = Math.min(Math.round(sampleRate * .006), Math.floor((output.length - 1) / 2));
  for (let i = 0; i < output.length; i++) {
    const envelope = fade ? Math.sin(Math.min(1, i / fade, (output.length - 1 - i) / fade) * Math.PI / 2) ** 2 : output.length <= 2 ? 0 : 1;
    output[i] = clamp((samples[left + i] - mean) * scale * envelope, -1, 1) || 0;
  }
  const rootFrequency = estimatePitch(output, sampleRate);
  return { sampleRate, samples: Array.from(output), ...(rootFrequency === null ? {} : { rootFrequency }) };
}

/** Validate JSON sample banks before allocating audio or using imported recipes. */
export function normalizeSampleBank(bank) {
  record(bank, 'sample bank');
  if (typeof bank.id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(bank.id)) throw new Error('sample bank id must use 1–64 letters, digits, dashes or underscores');
  if (typeof bank.name !== 'string' || !bank.name.trim() || bank.name.length > 100) throw new Error('sample bank name must use 1–100 characters');
  const rootFrequency = finite(bank.rootFrequency, 'rootFrequency', 65, 800);
  record(bank.slots, 'sample slots');
  const entries = Object.entries(bank.slots);
  if (!entries.length || entries.length > VOWELS.length) throw new Error('sample bank must have 1–5 vowel slots');
  const slots = {}; let seconds = 0;
  for (const [vowel, clip] of entries) {
    if (!VOWELS.includes(vowel)) throw new Error(`Unknown sample vowel: ${vowel}`);
    record(clip, `sample slot ${vowel}`); pcm(clip.samples, clip.sampleRate, MAX_CLIP_SECONDS);
    seconds += clip.samples.length / clip.sampleRate;
    if (seconds > MAX_BANK_SECONDS + 1e-9) throw new Error('sample bank exceeds 10 seconds');
    slots[vowel] = { sampleRate: clip.sampleRate, samples: Array.from(clip.samples), ...(clip.rootFrequency === undefined ? {} : { rootFrequency: finite(clip.rootFrequency, 'clip rootFrequency', 65, 800) }) };
  }
  return { id: bank.id, name: bank.name.trim(), rootFrequency, slots };
}

/** Render a prepared / validated bank as a fixed-duration, transposed syllable. */
export function renderSampleEvent(event, options, sampleRate, bank) {
  record(event, 'sample event'); record(options, 'sample options'); record(bank, 'sample bank'); rate(sampleRate);
  const start = finite(event.start, 'event.start', 0, 600), end = finite(event.end, 'event.end', 0, 600);
  if (end < start || end - start > 30) throw new Error('sample event duration must be 0–30 seconds');
  const output = new Float32Array(Math.round((end - start) * sampleRate));
  if (!output.length) return output;
  const source = options.source ?? {}; record(source, 'source');
  const slots = bank.slots;
  record(slots, 'sample slots');
  const clip = (Object.hasOwn(slots, event.vowel) ? slots[event.vowel] : undefined) ?? slots.a ?? VOWELS.map(vowel => slots[vowel]).find(Boolean);
  if (!clip) throw new Error('sample bank contains no usable vowel slots');
  pcm(clip.samples, clip.sampleRate, MAX_CLIP_SECONDS);
  const root = finite(clip.rootFrequency ?? bank.rootFrequency, 'sample rootFrequency', 65, 800);
  const base = finite(source.sampleBaseFrequency ?? bank.rootFrequency, 'sampleBaseFrequency', 65, 800);
  const pitch = finite(event.pitch ?? 0, 'event.pitch', -60, 60), tune = finite(source.sampleTune ?? 0, 'sampleTune', -24, 24);
  const offset = finite(source.sampleOffset ?? 0, 'sampleOffset', 0, MAX_CLIP_SECONDS);
  const contour = source.sampleContour ?? [0, 0];
  if (!Array.isArray(contour) || contour.length < 2 || contour.length > 33) throw new Error('sampleContour must have 2–33 semitone points');
  const contourValues = Array.from(contour, value => finite(value, 'sampleContour point', -36, 36));
  const frequency = base * 2 ** ((pitch + tune) / 12), sourcePeriod = clip.sampleRate / root;
  // An integral number of pitch periods separates grains, keeping voiced phases aligned.
  const cycles = Math.max(1, Math.round(frequency * .014));
  const hop = sampleRate / frequency * cycles, halfWindow = Math.max(4, hop);
  const weights = new Float32Array(output.length), values = clip.samples;
  const first = Math.min(values.length - 1, Math.round(offset * clip.sampleRate));
  const available = values.length - first;
  const hasContour = contourValues.some(value => value !== 0);
  let contourPhase = 0, previousFrequency, previousCenter;
  for (let center = -hop; center < output.length + halfWindow; center += hop) {
    const progress = clamp(center / Math.max(1, output.length - 1), 0, 1);
    const curveAt = progress * (contourValues.length - 1), curveLeft = Math.min(contourValues.length - 2, Math.floor(curveAt)), curveMix = curveAt - curveLeft;
    const bend = contourValues[curveLeft] * (1 - curveMix) + contourValues[curveLeft + 1] * curveMix;
    const localFrequency = finite(frequency * 2 ** (bend / 12), 'sample contour frequency', Number.MIN_VALUE, 1000000);
    const step = finite(localFrequency / root * clip.sampleRate / sampleRate, 'sample interpolation step', Number.MIN_VALUE, 1000000);
    let sourceCenter = first + Math.round(progress * (available - 1) / sourcePeriod) * sourcePeriod;
    if (hasContour) {
      // Carry the bent pitch phase between grains; resetting it would create pitched grain-rate artifacts.
      contourPhase = previousFrequency === undefined ? localFrequency * center / sampleRate : contourPhase + (previousFrequency + localFrequency) * .5 * (center - previousCenter) / sampleRate;
      sourceCenter += ((contourPhase % 1) + 1) % 1 * sourcePeriod;
      previousFrequency = localFrequency; previousCenter = center;
    }
    const from = Math.max(0, Math.ceil(center - halfWindow)), to = Math.min(output.length, Math.ceil(center + halfWindow));
    for (let i = from; i < to; i++) {
      const position = sourceCenter + (i - center) * step;
      if (position < first || position > values.length - 1) continue;
      const left = Math.floor(position), fraction = position - left;
      const value = values[left] * (1 - fraction) + values[Math.min(values.length - 1, left + 1)] * fraction;
      const weight = .5 + .5 * Math.cos(Math.PI * (i - center) / halfWindow);
      output[i] += value * weight; weights[i] += weight;
    }
  }
  const strength = finite(event.strength ?? 1, 'event.strength', 0, 2);
  const fade = Math.min(Math.round(sampleRate * .008), Math.floor((output.length - 1) / 2));
  for (let i = 0; i < output.length; i++) {
    const envelope = fade > 0 ? Math.sin(Math.min(1, i / fade, (output.length - 1 - i) / fade) * Math.PI / 2) ** 2 : 0;
    output[i] = weights[i] > 1e-6 ? clamp(output[i] / weights[i] * envelope * strength, -1, 1) || 0 : 0;
  }
  return output;
}
