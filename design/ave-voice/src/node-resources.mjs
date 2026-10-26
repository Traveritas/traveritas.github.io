/** Trusted local manifest loading for the CLI and a fixed built-in catalogue for workers. */
import { readFile, realpath, stat } from 'node:fs/promises';
import { dirname, extname, isAbsolute, relative, resolve, sep, win32 } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeWav, prepareSample, normalizeSampleBank } from './samples.mjs';

const BUILTIN_ROOT = fileURLToPath(new URL('../assets/voices/', import.meta.url));
const MAX_BANKS = 8;
const MAX_JSON_BYTES = 64 * 1024 * 1024;
function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
}
async function readJson(path, limit = MAX_JSON_BYTES) {
  if ((await stat(path)).size > limit) throw new Error('Resource JSON is too large');
  const bytes = await readFile(path);
  if (bytes.byteLength > limit) throw new Error('Resource JSON is too large');
  try { return JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, '')); } catch { throw new Error(`Invalid JSON resource: ${path}`); }
}
function metadata(value) {
  if (value === undefined || value === null) return null;
  const encoded = JSON.stringify(value);
  if (encoded.length > 32768) throw new Error('Sample provenance is too large');
  return JSON.parse(encoded);
}
/** Later resource layers override matching bank IDs without dropping unrelated banks. */
export function mergeResources(...layers) {
  const output = { banks: {}, provenance: {} };
  for (const layer of layers) {
    if (layer === undefined) continue;
    object(layer, 'Resources');
    if (layer.banks !== undefined) { object(layer.banks, 'Resource banks'); output.banks = { ...output.banks, ...layer.banks }; }
    if (layer.provenance !== undefined) { object(layer.provenance, 'Resource provenance'); output.provenance = { ...output.provenance, ...layer.provenance }; }
  }
  return output;
}
async function containedPath(directory, value, extension) {
  if (typeof value !== 'string' || !value || value.includes('\0') || isAbsolute(value) || win32.isAbsolute(value) || value.split(/[\\/]/).some(part => part === '..') || value.includes(':') || extname(value).toLowerCase() !== extension) throw new Error(`Resource path must be a relative ${extension} file inside its manifest directory`);
  const [root, target] = await Promise.all([realpath(directory), realpath(resolve(directory, value))]);
  const remainder = relative(root, target);
  if (!remainder || remainder === '..' || remainder.startsWith(`..${sep}`) || isAbsolute(remainder)) throw new Error('Resource path escapes its manifest directory');
  return target;
}

/** Read an explicitly selected bank JSON: inline PCM or relative WAV slot references. */
export async function loadBankFile(path) {
  if (typeof path !== 'string' || !path) throw new Error('Bank file path is required');
  const absolute = await realpath(resolve(path)), data = await readJson(absolute);
  object(data, 'Sample bank'); object(data.slots, 'Sample slots');
  const entries = Object.entries(data.slots);
  if (!entries.length || entries.length > 5) throw new Error('Sample bank must have 1–5 vowel slots');
  const slots = {};
  for (const [vowel, source] of entries) {
    if (!['a', 'e', 'i', 'o', 'u'].includes(vowel)) throw new Error(`Unknown sample vowel: ${vowel}`);
    if (typeof source === 'object' && source !== null && Array.isArray(source.samples)) { slots[vowel] = source; continue; }
    const spec = typeof source === 'string' ? { file: source } : source;
    object(spec, 'Sample slot');
    const wavPath = await containedPath(dirname(absolute), spec.file, '.wav');
    if ((await stat(wavPath)).size > 192 * 1024 * 1024) throw new Error('WAV byte length is invalid');
    const decoded = decodeWav(await readFile(wavPath));
    const clip = prepareSample(decoded.samples, decoded.sampleRate, { start: spec.start, end: spec.end, normalize: false, trimSilence: false });
    // Built-in manifests specify the intended root; auto estimation remains available in the editor.
    if (spec.rootFrequency !== undefined) clip.rootFrequency = spec.rootFrequency;
    else delete clip.rootFrequency;
    slots[vowel] = clip;
  }
  const provenance = data.provenance ?? Object.fromEntries(['license', 'source', 'speaker', 'segments'].filter(key => data[key] !== undefined).map(key => [key, data[key]]));
  return { bank: normalizeSampleBank({ ...data, slots }), provenance: metadata(Object.keys(provenance).length ? provenance : null) };
}

/** Resolve only requested built-ins; inline PCM takes priority and never names server files. */
export async function loadNodeResources(optionsList = [], inlineResources = {}) {
  if (!Array.isArray(optionsList)) throw new Error('optionsList must be an array');
  object(inlineResources, 'Resources');
  const incoming = inlineResources.banks ?? {}; object(incoming, 'Resource banks');
  const entries = Object.entries(incoming);
  if (entries.length > MAX_BANKS) throw new Error('At most 8 sample banks are allowed');
  const banks = {}, provenance = {};
  for (const [id, data] of entries) {
    const bank = normalizeSampleBank(data);
    if (id !== bank.id) throw new Error('Sample bank dictionary key must match its id');
    banks[id] = bank;
    const origin = data.provenance ?? inlineResources.provenance?.[id];
    if (origin !== undefined && origin !== null) provenance[id] = metadata(origin);
  }
  const wanted = new Set();
  for (const options of optionsList) {
    object(options, 'Options');
    const source = options.source;
    if (source === undefined) continue;
    object(source, 'Source');
    if (!['sample', 'hybrid'].includes(source.mode)) continue;
    if (typeof source.bankId !== 'string' || !source.bankId) throw new Error('Sample source requires bankId');
    if (!Object.hasOwn(banks, source.bankId)) wanted.add(source.bankId);
  }
  if (entries.length + wanted.size > MAX_BANKS) throw new Error('At most 8 sample banks are allowed');
  if (!wanted.size) return { banks, provenance };
  const index = await readJson(resolve(BUILTIN_ROOT, 'index.json'), 1024 * 1024);
  const catalogue = Array.isArray(index) ? index : index.banks;
  if (!Array.isArray(catalogue)) throw new Error('Invalid built-in voice index');
  for (const id of wanted) {
    const entry = catalogue.find(item => item?.id === id);
    if (!entry) throw new Error(`Unknown built-in sample bank: ${id}`);
    const manifest = typeof entry.manifest === 'string' && entry.manifest.startsWith('/assets/voices/') ? entry.manifest.slice('/assets/voices/'.length) : entry.manifest;
    const path = await containedPath(BUILTIN_ROOT, manifest, '.json');
    const loaded = await loadBankFile(path);
    if (loaded.bank.id !== id) throw new Error('Built-in manifest id does not match the voice index');
    banks[id] = loaded.bank;
    if (loaded.provenance) provenance[id] = loaded.provenance;
  }
  return { banks, provenance };
}
