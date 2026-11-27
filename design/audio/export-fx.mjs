/**
 * Export the 12 selected UI SFX prototypes from design/mocks/sound-proposal/samples/wav/
 * into public/audio/fx/*.mp3 and refresh src/data/fx-assets.ts with a content version hash.
 *
 * Usage: node design/audio/export-fx.mjs
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', '..');
const WAV_DIR = resolve(ROOT, 'design/mocks/sound-proposal/samples/wav');
const OUT_DIR = resolve(ROOT, 'public/audio/fx');
const MANIFEST = resolve(ROOT, 'src/data/fx-assets.ts');

// Final locked selection (Batch 3 mix: DIR J touches + DIR I transitions + Z2/Z signatures)
const SELECTION = [
  ['hover', 'j_hover_crystal'],
  ['confirm', 'j_click_confirm'],
  ['star-open', 'b_star_open'],
  ['star-close', 'b_star_close'],
  ['ring-tick', 'i_ring_tick'],
  ['flip-dream', 'i_flip_dream'],
  ['flip-wake', 'i_flip_wake'],
  ['gate-nexus', 'i_gate_nexus'],
  ['sec-articles', 'z2_sec_articles'],
  ['sec-moments', 'z_sec_moments'],
  ['sec-projects', 'z_sec_projects'],
  ['unlock', 'z_fx_unlock'],
];

mkdirSync(OUT_DIR, { recursive: true });

const hash = createHash('sha256');
let totalBytes = 0;

console.log('Exporting 12 UI SFX assets to public/audio/fx/ ...');
for (const [id, srcName] of SELECTION) {
  const wav = resolve(WAV_DIR, `${srcName}.wav`);
  const mp3 = resolve(OUT_DIR, `${id}.mp3`);
  execFileSync(
    'ffmpeg',
    ['-y', '-loglevel', 'error', '-i', wav, '-codec:a', 'libmp3lame', '-q:a', '4', mp3],
    { stdio: 'inherit' },
  );
  const bytes = readFileSync(mp3);
  hash.update(id).update(bytes);
  totalBytes += bytes.length;
  console.log(`  ${id.padEnd(14)} <- ${srcName.padEnd(18)} ${(statSync(mp3).size / 1024).toFixed(1).padStart(5)} KB`);
}

const version = hash.digest('hex').slice(0, 8);
const idUnion = SELECTION.map(([id]) => `  | '${id}'`).join('\n');
const idList = SELECTION.map(([id]) => `  '${id}',`).join('\n');

writeFileSync(
  MANIFEST,
  `/* 本文件由 design/audio/export-fx.mjs 生成，勿手改。
   成片在 public/audio/fx/，共 12 条（合计 ${(totalBytes / 1024).toFixed(1)} KB）；
   靠版本号把 URL 区分开，换稿后浏览器才会取新音效。重跑 export-fx.mjs 后记得一起提交。 */
export const FX_VERSION = '${version}';

export type FxId =
${idUnion};

export const FX_IDS: readonly FxId[] = [
${idList}
];
`,
  'utf8',
);

console.log(`Done. Total: ${(totalBytes / 1024).toFixed(1)} KB | FX_VERSION=${version}`);
