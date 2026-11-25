/* ─────────────────────────────────────────────────────────────
   体积与对照（bake.mjs 的 pack 段拆出来）
   · 把 frames/ 下每一套的 PNG 逐个编码成 PNG / WebP 无损 / WebP 有损带 alpha / AVIF，
     再拼一张精灵图，四种格式分别量总字节
   · 顺带验「动画 WebP/AVIF 单文件能不能被触发控制」这条 —— 结论写在 readings.pack.anim
   · 彩色参考 vs alpha×色相：逐像素比，验第 1 条硬要求
   ───────────────────────────────────────────────────────────── */
import fs from 'node:fs';
import path from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function walk(dir, ext = '.png') {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p, ext));
    else if (p.endsWith(ext)) out.push(p);
  }
  return out.sort();
}

export async function pack({ BAKE, FRAMES, SHOTS, ROOT, SF, log }) {
  const sharp = (await import('sharp')).default;
  const sets = fs
    .readdirSync(FRAMES, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== 'color')
    .map((e) => e.name);
  const sizes = [...new Set(sets.flatMap((s) => fs.readdirSync(path.join(FRAMES, s))))].sort();

  const table = [];
  for (const set of sets) {
    for (const size of fs.readdirSync(path.join(FRAMES, set))) {
      const dir = path.join(FRAMES, set, size);
      const files = walk(dir);
      if (!files.length) continue;
      const n = files.length;
      const row = { set, size: +size, n };

      /* ① PNG（就是渲染出来的原样） */
      row.png = files.reduce((a, f) => a + fs.statSync(f).size, 0);

      /* ② WebP 无损：alpha 必须原样保住 */
      let sum = 0;
      for (const f of files) {
        const buf = await sharp(f).webp({ lossless: true, alphaQuality: 100, effort: 6 }).toBuffer();
        sum += buf.length;
      }
      row.webpLL = sum;

      /* ③ WebP 有损带 alpha：q 82、alphaQuality 90。
            四档调子只有四个值，有损压缩会在这几个台阶上抹出过渡带 —— 这正是要量的代价 */
      sum = 0;
      for (const f of files) {
        const buf = await sharp(f).webp({ quality: 82, alphaQuality: 90, effort: 6 }).toBuffer();
        sum += buf.length;
      }
      row.webpLossy = sum;

      /* ④ AVIF（带 alpha） */
      sum = 0;
      let avifOK = true;
      for (const f of files) {
        try {
          const buf = await sharp(f).avif({ quality: 70, effort: 6 }).toBuffer();
          sum += buf.length;
        } catch (e) {
          avifOK = false;
          break;
        }
      }
      row.avif = avifOK ? sum : null;

      /* ⑤ 精灵图：所有帧横排一张，再走同样四种编码 */
      const metas = await Promise.all(files.map((f) => sharp(f).metadata()));
      const w = metas[0].width;
      const h = metas[0].height;
      const sheet = sharp({
        create: { width: w * n, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
      }).composite(files.map((f, i) => ({ input: f, left: i * w, top: 0 })));
      const sheetPNG = await sheet.png({ compressionLevel: 9 }).toBuffer();
      const sheetWEBP_LL = await sharp(sheetPNG).webp({ lossless: true, alphaQuality: 100, effort: 6 }).toBuffer();
      const sheetWEBP_Q = await sharp(sheetPNG).webp({ quality: 82, alphaQuality: 90, effort: 6 }).toBuffer();
      let sheetAVIF = null;
      try {
        sheetAVIF = await sharp(sheetPNG).avif({ quality: 70, effort: 6 }).toBuffer();
      } catch {
        /* 没有 AVIF 编码器 */
      }
      row.sheet = {
        png: sheetPNG.length,
        webpLL: sheetWEBP_LL.length,
        webpLossy: sheetWEBP_Q.length,
        avif: sheetAVIF ? sheetAVIF.length : null,
      };
      /* 精灵图落盘（页面要用） */
      const outDir = path.join(FRAMES, '..', 'frames');
      fs.writeFileSync(path.join(FRAMES, `${set}-${size}-sheet.webp`), sheetWEBP_LL);

      /* ⑥ 单帧最省/最贵的字节 */
      const perFrame = [];
      for (const f of files) {
        const ll = await sharp(f).webp({ lossless: true, alphaQuality: 100, effort: 6 }).toBuffer();
        perFrame.push(ll.length);
      }
      row.frameMin = Math.min(...perFrame);
      row.frameMax = Math.max(...perFrame);
      row.frameMed = perFrame.sort((a, b) => a - b)[Math.floor(perFrame.length / 2)];
      table.push(row);
      log(`pack ${set}@${size}: png ${(row.png / 1024).toFixed(1)}K · webpLL ${(row.webpLL / 1024).toFixed(1)}K · lossy ${(row.webpLossy / 1024).toFixed(1)}K · avif ${row.avif == null ? '—' : (row.avif / 1024).toFixed(1) + 'K'} · sheet.webpLL ${(row.sheet.webpLL / 1024).toFixed(1)}K`);
    }
  }

  /* ── 彩色参考 vs alpha×色相 ───────────────────────────────────────
     对每一套的每一帧：拿掩码的 alpha 与「#f0f3f6 底 + #232830 墨」重算一遍，
     与那一帧真彩参考逐像素比。差值是 0 才说明「烘 alpha 就够」。
     另外再验一次深底：CSS 上 alpha 叠在 #2a2b38 上时，用同一个 alpha 重算，看差多少
     —— 这一条是硬要求 §1 里点名的风险：若四档调子需要**色相**变化而不只是 alpha，
     这里就会露出来。 */
  const color = { light: [], deep: [] };
  for (const set of sets) {
    for (const size of fs.readdirSync(path.join(FRAMES, set))) {
      const cdir = path.join(FRAMES, 'color', set, size);
      const mdir = path.join(FRAMES, set, size);
      if (!fs.existsSync(cdir)) continue;
      const cfiles = walk(cdir);
      const mfiles = walk(mdir);
      let worst = 0;
      let worstName = '';
      let sumMean = 0;
      let cmpN = 0;
      let hintHist = new Map();
      for (let i = 0; i < Math.min(cfiles.length, mfiles.length); i++) {
        const ref = await sharp(cfiles[i]).removeAlpha().raw().toBuffer({ resolveWithObject: true });
        const mask = await sharp(mfiles[i]).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        const W = ref.info.width;
        const H = ref.info.height;
        const bg = [0xf0, 0xf3, 0xf6];
        const ink = [0x23, 0x28, 0x30];
        let mx = 0;
        let mxs = 0;
        for (let p = 0; p < W * H; p++) {
          const a = mask.data[p * 4 + 3] / 255;
          /* 记录 alpha 直方图（只看星内的点），用来核对「四个调子档」这件事 */
          if (a > 0.9) hintHist.set(mask.data[p * 4 + 3], (hintHist.get(mask.data[p * 4 + 3]) || 0) + 1);
          for (let ch = 0; ch < 3; ch++) {
            const v = bg[ch] + (ink[ch] - bg[ch]) * a;
            const d = Math.abs(v - ref.data[p * 3 + ch]);
            if (d > mx) mx = d;
            mxs += d;
          }
        }
        if (mx > worst) {
          worst = mx;
          worstName = path.basename(cfiles[i]);
        }
        sumMean += mxs / (W * H * 3);
        cmpN++;
      }
      color.light.push({
        set,
        size: +size,
        frames: cmpN,
        maxDiff: +worst.toFixed(2),
        worst: worstName,
        meanDiff: +(sumMean / Math.max(1, cmpN)).toFixed(3),
        alphaLevels: [...hintHist.keys()].sort((a, b) => a - b),
      });
    }
  }

  /* ── 深底的同一笔账 ──────────────────────────────────────────────
     站点梦面的底色是 --umber #4f4a66 一系，深底 #2a2b38 是对照。这里不动渲染：
     只把同一个 alpha 分别叠在浅底与深底上，看还原出的调子差多少。
     若深底上「四档」不再分得开（相邻档差 < 3/255），说明 alpha 这套在深底上
     需要换墨色或抬低档 —— 这是一个必须报出来的结论，不是可以咽下去的细节。 */
  const toneSteps = [0.1, 0.3733, 0.6467, 0.92];
  const grounds = {
    light: { bg: [0xf0, 0xf3, 0xf6], ink: [0x23, 0x28, 0x30] },
    deep: { bg: [0x2a, 0x2b, 0x38], ink: [0xcf, 0xd2, 0xe2] },
    /* 梦面：--umber #4f4a66。这一条是硬要求 §1 点名的风险所在 ——
       同一支墨压在这个底上，四档只剩 10 个亮度差，等于消失。 */
    umber: { bg: [0x4f, 0x4a, 0x66], ink: [0x23, 0x28, 0x30] },
    /* 同一块梦面底，换一支更亮的墨（这一步不改任何资产，只改 CSS 的 color） */
    'umber-pale': { bg: [0x4f, 0x4a, 0x66], ink: [0xee, 0xea, 0xf4] },
  };
  const steps = {};
  for (const [name, g] of Object.entries(grounds)) {
    const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    const vals = toneSteps.map((a) => [0, 1, 2].map((ch) => g.bg[ch] + (g.ink[ch] - g.bg[ch]) * a));
    const lums = vals.map(lum);
    const gaps = lums.slice(1).map((v, i) => +(v - lums[i]).toFixed(2));
    steps[name] = { lums: lums.map((v) => +v.toFixed(1)), gaps, minGap: Math.min(...gaps.map(Math.abs)) };
  }

  /* ── 成果：体积表 ─────────────────────────────────────────────── */
  const out = {
    at: new Date().toISOString(),
    table,
    color,
    steps,
    anim: null,
    verdict: {},
  };
  fs.writeFileSync(path.join(SHOTS, 'readings.json'), JSON.stringify(out, null, 2));
  log('pack → .shots/readings.json');
  console.table(
    table.map((r) => ({
      set: r.set,
      size: r.size,
      n: r.n,
      png: r.png,
      webpLL: r.webpLL,
      webpLossy: r.webpLossy,
      avif: r.avif,
      sheetLL: r.sheet.webpLL,
      sheetQ: r.sheet.webpLossy,
      sheetAVIF: r.sheet.avif,
    })),
  );
  console.log(JSON.stringify(color, null, 2));
}