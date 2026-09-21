// 批量截图：为 design/index.html 生成各稿缩略图（Edge headless，串行）
// 用法：node design/.shots-meta.cjs [slug ...]  （无参 = 全部）
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PORT = 8399;
const OUT_DIR = path.join(__dirname, 'index-shots');
const EDGE = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PROFILE = path.join(require('os').tmpdir(), 'edge-meta-shots');

// [slug, 相对 design/ 的路径, URL 参数, virtual-time-budget ms]
const SHOTS = [
  // —— Phase 2 · 静态稿 ——
  ['p2-a-fragments', 'archive/2026-09-phase2-4/p2-a-fragments.html', '', 4000],
  ['p2-b-megastructure', 'archive/2026-09-phase2-4/p2-b-megastructure.html', '', 4000],
  ['p2-c-threshold', 'archive/2026-09-phase2-4/p2-c-threshold.html', '', 4000],
  ['p2-d-giant-lily', 'archive/2026-09-phase2-4/p2-d-giant-lily.html', '', 4000],
  ['p2-e-flower-field', 'archive/2026-09-phase2-4/p2-e-flower-field.html', '', 4000],
  ['p2-f-flower-geometry', 'archive/2026-09-phase2-4/p2-f-flower-geometry.html', '', 4000],
  ['p2-icons', 'archive/2026-09-phase2-4/icon-flower-marks.html', '', 4000],
  // —— Phase 3 · 活体稿（默认首屏态） ——
  ['p3-a-still-water', 'archive/2026-09-phase2-4/p3-a-still-water.html', '', 4000],
  ['p3-b-curtain', 'archive/2026-09-phase2-4/p3-b-curtain.html', '', 4000],
  ['p3-c-field', 'archive/2026-09-phase2-4/p3-c-field.html', '', 4000],
  ['p3-d-archive', 'archive/2026-09-phase2-4/p3-d-archive.html', '', 4000],
  ['p3-e-waking', 'archive/2026-09-phase2-4/p3-e-waking.html', '', 4000],
  ['p3-f-water-field', 'archive/2026-09-phase2-4/p3-f-water-field.html', '', 4000],
  ['p3-g-live-field', 'archive/2026-09-phase2-4/p3-g-live-field.html', '', 4000],
  ['p3-h-terrain-steles', 'archive/2026-09-phase2-4/p3-h-terrain-steles.html', '', 4000],
  ['p3-i-terraces', 'archive/2026-09-phase2-4/p3-i-terraces.html', '', 4000],
  ['p3-j-giant-ring', 'archive/2026-09-phase2-4/p3-j-giant-ring.html', '', 4500],
  ['p3-j2-linked-rings', 'archive/2026-09-phase2-4/p3-j2-linked-rings.html', '', 4500],
  ['p3-j3-ring-axis', 'archive/2026-09-phase2-4/p3-j3-ring-axis.html', '', 4500],
  ['p3-j4-sunken-ring', 'archive/2026-09-phase2-4/p3-j4-sunken-ring.html', '', 4500],
  ['p3-j-cool', 'archive/2026-09-phase2-4/p3-j-cool.html', '', 4500],
  ['p3-j-rose', 'archive/2026-09-phase2-4/p3-j-rose.html', '', 4500],
  ['p3-j-gold', 'archive/2026-09-phase2-4/p3-j-gold.html', '', 4500],
  ['p3-j-night', 'archive/2026-09-phase2-4/p3-j-night.html', '', 4500],
  ['p3-j-cycle', 'archive/2026-09-phase2-4/p3-j-cycle.html', '', 3500],
  ['p3-k-giant-gate', 'archive/2026-09-phase2-4/p3-k-giant-gate.html', '', 4500],
  ['p3-l-needle-tower', 'archive/2026-09-phase2-4/p3-l-needle-tower.html', '', 4500],
  ['p3-m-colossal-stele', 'archive/2026-09-phase2-4/p3-m-colossal-stele.html', '', 4500],
  ['p3-jv1-shoal', 'archive/2026-09-phase2-4/p3-jv1-shoal.html', '', 4500],
  ['p3-jv2-ripples', 'archive/2026-09-phase2-4/p3-jv2-ripples.html', '', 4500],
  ['p3-jv3-lanterns', 'archive/2026-09-phase2-4/p3-jv3-lanterns.html', '', 4500],
  ['p3-jv4-mist', 'archive/2026-09-phase2-4/p3-jv4-mist.html', '', 4500],
  ['p3-b1-terraces', 'archive/2026-09-phase2-4/p3-b1-terraces.html', '', 4500],
  ['p3-b2-skyring', 'archive/2026-09-phase2-4/p3-b2-skyring.html', '', 4500],
  ['p3-f1-forestele', 'archive/2026-09-phase2-4/p3-f1-forestele.html', '', 4500],
  ['p3-f2-threads', 'archive/2026-09-phase2-4/p3-f2-threads.html', '', 4500],
  ['p3-s1-fallenbeam', 'archive/2026-09-phase2-4/p3-s1-fallenbeam.html', '', 4500],
  ['p3-s2-isle', 'archive/2026-09-phase2-4/p3-s2-isle.html', '', 4500],
  ['p3-s3-arcs', 'archive/2026-09-phase2-4/p3-s3-arcs.html', '', 4500],
  ['p3-s4-columns', 'archive/2026-09-phase2-4/p3-s4-columns.html', '', 4500],
  // —— Swarm 第 1 波 · P4 ——
  ['p4-suspended-wave', 'archive/2026-09-phase2-4/p4-suspended-wave.html', '', 4000],
  ['p4-murmuration', 'archive/2026-09-phase2-4/p4-murmuration.html', '', 3500],
  ['p4-absence', 'archive/2026-09-phase2-4/p4-absence.html', '', 4500],
  // —— Swarm 第 2 波 · 主体母题 ——
  ['p5-mirror', 'mocks/p5-mirror.html', '?p=0.2', 3500],
  ['p5-stairs', 'mocks/p5-stairs.html', '?p=0.4', 3500],
  ['p5-bloom', 'mocks/p5-bloom.html', '?pose=0.45', 3500],
  ['p5-linescape', 'mocks/p5-linescape.html', '', 3500],
  ['p5-echo', 'mocks/p5-echo.html', '?p=0.25', 3500],
  ['p5-echo-vault', 'mocks/p5-echo-vault.html', '?still=1&pin=0.5', 6000],
  ['p5-veil', 'mocks/p5-veil.html', '?still=1', 6000],
  ['p5-submerged', 'mocks/p5-submerged.html', '?still=1', 6000],
  ['p5-frost', 'mocks/p5-frost.html', '?still=1&pin=0.7', 6000],
  ['p5-descent', 'mocks/p5-descent.html', '?still=1&pin=0.5', 6000],
  ['p5-eyelid', 'mocks/p5-eyelid.html', '?still=1&wake=1&pin=0.1', 6000],
  ['p5-door', 'mocks/p5-door.html', '?still=1&pin=0', 6000],
  ['p5-shadow', 'mocks/p5-shadow.html', '?still=1&pin=0.35', 6000],
  ['p5-fleet', 'mocks/p5-fleet.html', '?still=1&pin=0.55', 6000],
  // —— Swarm 第 3 波 · 入口机制 ——
  ['p5-revolve', 'mocks/p5-revolve.html', '?still=1&pin=0.15', 6000],
  ['p5-membrane', 'mocks/p5-membrane.html', '?still=1&pin=0.65', 6000],
  ['p5-ferry', 'mocks/p5-ferry.html', '?still=1&pin=0.5', 6000],
  ['p5-frames', 'mocks/p5-frames.html', '?still=1&pin=0.35', 6000],
  ['p5-unfold', 'mocks/p5-unfold.html', '?still=1&pin=0.45', 6000],
  ['p5-somnambule', 'mocks/p5-somnambule.html', '?still=1&pin=0.3', 6000],
  ['p5-lantern', 'mocks/p5-lantern.html', '?still=1&pin=0.5&lamp=0.5', 6000],
  // —— Swarm 第 4 波 · 平面基底 × 3D ——
  ['p5-atlas', 'mocks/p5-atlas.html', '?still=1&pin=0.4', 6000],
  ['p5-herbarium', 'mocks/p5-herbarium.html', '?still=1&pin=0.25', 6000],
  ['p5-imprint', 'mocks/p5-imprint.html', '?still=1&pin=0.55', 6000],
  ['p5-draft', 'mocks/p5-draft.html', '?still=1&pin=0', 6000],
  ['p5-paperroom', 'mocks/p5-paperroom.html', '?still=1&pin=0.3', 6000],
  // —— Swarm 第 5 波 · 平面 × artifact × 浮窗 ——
  ['p5-floatwin', 'mocks/p5-floatwin.html', '?still=1&pin=0', 6000],
  ['p5-paperkite', 'mocks/p5-paperkite.html', '?still=1&pin=0.3', 6000],
  ['p5-projector', 'mocks/p5-projector.html', '?still=1&pin=0.35', 6000],
  ['p5-casement', 'mocks/p5-casement.html', '?still=1&pin=0.35', 6000],
  // —— Swarm 第 6 波 · 盘点+组合轮 ——
  ['p6-inktide', 'mocks/p6-inktide.html', '?still=1&pin=0.4', 6000],
  ['p6-handscroll', 'mocks/p6-handscroll.html', '?still=1&pin=0.42', 6000],
  ['p6-sundial-garden', 'mocks/p6-sundial-garden.html', '?still=1&pin=0.45', 6000],
];

const only = process.argv.slice(2);
const list = only.length ? SHOTS.filter(s => only.includes(s[0])) : SHOTS;
fs.mkdirSync(OUT_DIR, { recursive: true });

let fail = 0;
for (const [slug, rel, params, budget] of list) {
  const out = path.join(OUT_DIR, slug + '.png').replace(/\\/g, '/');
  const url = `http://127.0.0.1:${PORT}/${rel}${params ? params + '&' : '?'}v=${Date.now()}`;
  try {
    execFileSync(EDGE, [
      '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      '--hide-scrollbars', '--force-device-scale-factor=1',
      `--user-data-dir=${PROFILE}`,
      '--window-size=1440,900', `--virtual-time-budget=${budget}`,
      `--screenshot=${out}`, '--default-background-color=FFFFFFFF',
      url,
    ], { stdio: 'pipe', timeout: 60000 });
    const size = fs.existsSync(out) ? fs.statSync(out).size : 0;
    console.log(`${size > 8000 ? 'OK ' : 'SUS'} ${slug} (${size}b)`);
    if (size <= 8000) fail++;
  } catch (e) {
    console.log(`ERR ${slug}: ${e.message.split('\n')[0]}`);
    fail++;
  }
}
console.log(fail ? `${fail} suspicious/failed` : 'all good');
