/* 读数：各档的路径数 / 调子表 / 三条落差。node design/mocks/star-t-smooth/.stats.mjs */
import { star, bytesOf, VIEW } from './src.js';

const PRESETS = {
  'flat 基线（现役 drawStar）': { fold: 0.001, sides: 4, rim: 0, tip: { kind: 'cusp' }, tones: { steps: 2, min: 0.486, max: 0.774, depth: 1 }, hub: { mode: 'table', radius: 1.7, lift: 0 }, merge: true },
  'ridge 旧折脊': { fold: 1.7, sides: 4, rim: 0, tones: { steps: 4, min: 0.16, max: 0.9, depth: 0.22 } },
};

for (const [name, o] of Object.entries(PRESETS)) {
  const r = star(o);
  console.log('\n' + name);
  console.log('  paths', r.stats.paths, ' cells', r.stats.cells, ' perSpike', r.stats.perSpike.join(','));
  console.log('  tones', r.stats.tones.join(' '));
  console.log('  spine', r.stats.spine.join(' '), ' notch', r.stats.notch.join(' '), ' sameOrder', r.stats.sameOrder);
  console.log('  bytes', bytesOf(o), ' view', VIEW.full);
}