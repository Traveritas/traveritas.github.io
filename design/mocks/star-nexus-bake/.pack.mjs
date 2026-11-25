/* ─────────────────────────────────────────────────────────────
   体积、编码与色彩（bake.mjs 的 pack 段）
   ─────────────────────────────────────────────────────────────
   每一条都是数出来的：
   ① 编码 × 尺寸 × 有 alpha / 压到底色：PNG / WebP 无损 / WebP 有损 / AVIF，
      精灵图与单帧各一遍。
      —— 这份内容是**渐变**（折射 + 色散 + 吸收），上一轮「无损比有损小」的结论不适用，
         必须重量。结果确实反过来了：无损 491K，有损 80K，差 6 倍。
   ② 帧数：16 与 12 两套都拼一遍。
   ③ 颜色：醒 / 梦两套真烘 vs「一套 + 全局逐通道仿射」（= CSS filter 链能达到的最强形式），
      用最小二乘拟合后看残差，再与「两套交叉淡入」的误差对照。
   ④ 出货：把精灵图与落定帧写进 frames/，src.js 读的就是这几张。
   ───────────────────────────────────────────────────────────── */
import fs from 'node:fs';
import path from 'node:path';

const walk = (dir, ext = '.png') => {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p, ext));
    else if (p.endsWith(ext)) out.push(p);
  }
  return out.sort();
};
const kb = (n) => +(n / 1024).toFixed(1);
const BG = { r: 240, g: 243, b: 246 }; // --bg #f0f3f6

export async function pack({ BAKE, FRAMES, SHOTS, log }) {
  const sharp = (await import('sharp')).default;

  const enc = async (buf, kind, q) => {
    const s = () => sharp(buf, { limitInputPixels: false });
    if (kind === 'png') return (await s().png({ compressionLevel: 9, effort: 10 }).toBuffer()).length;
    if (kind === 'webpLL') return (await s().webp({ lossless: true, alphaQuality: 100, effort: 6 }).toBuffer()).length;
    if (kind === 'webpQ') return (await s().webp({ quality: q ?? 78, alphaQuality: 88, effort: 6 }).toBuffer()).length;
    if (kind === 'avif') return (await s().avif({ quality: q ?? 62, effort: 6 }).toBuffer()).length;
    throw new Error(kind);
  };

  /** 一帧组 → 横排精灵图（带 alpha） */
  const sheetOf = async (files) => {
    const meta = await sharp(files[0]).metadata();
    return sharp({
      create: { width: meta.width * files.length, height: meta.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite(files.map((f, i) => ({ input: f, left: i * meta.width, top: 0 })))
      .png({ compressionLevel: 9, effort: 10 })
      .toBuffer();
  };

  const rows = [];
  for (const size of BAKE.sizes) {
    for (const mood of ['wake', 'dream']) {
      const files = walk(path.join(FRAMES, 'base', String(size), mood));
      if (!files.length) continue;
      const row = { size, mood, n: files.length };

      for (const kind of ['png', 'webpLL', 'webpQ', 'avif']) {
        let sum = 0;
        const per = [];
        for (const f of files) { const b = await enc(fs.readFileSync(f), kind); sum += b; per.push(b); }
        row[kind] = { total: sum, min: Math.min(...per), max: Math.max(...per) };
      }

      const sheetA = await sheetOf(files);                        // 带 alpha
      const sheetF = await sharp(sheetA).flatten({ background: BG }).png({ compressionLevel: 9 }).toBuffer(); // 压到底色
      row.sheet = { n: files.length };
      for (const kind of ['png', 'webpLL', 'webpQ', 'avif']) {
        row.sheet[kind] = await enc(sheetA, kind);
        row.sheet['flat_' + kind] = await enc(sheetF, kind);
      }
      const m = await sharp(files[0]).metadata();
      row.sheet.px = `${m.width * files.length}×${m.height}`;
      rows.push(row);
      log(
        `pack ${size} ${mood} 单帧 alpha: png ${kb(row.png.total)} · LL ${kb(row.webpLL.total)} · Q ${kb(row.webpQ.total)} · avif ${kb(row.avif.total)}` +
          ` ｜精灵图 alpha: LL ${kb(row.sheet.webpLL)} · Q ${kb(row.sheet.webpQ)} · avif ${kb(row.sheet.avif)}` +
          ` ｜压底色: Q ${kb(row.sheet.flat_webpQ)} · avif ${kb(row.sheet.flat_avif)} · LL ${kb(row.sheet.flat_webpLL)}`,
      );
    }
  }

  /* ── 12 帧子集：从已选的 16 帧里贪心去掉「相邻最像」的那几格 ────────
     用来回答「16 帧是不是不值」。判据是剪影 IoU，不是参数距离。 */
  const subset12 = {};
  for (const size of BAKE.sizes) {
    const dir = path.join(FRAMES, 'base', String(size), 'wake');
    const files = walk(dir);
    if (files.length < 13) continue;
    const masks = [];
    for (const f of files) {
      const { data, info } = await sharp(f).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const m = new Uint8Array(info.width * info.height);
      for (let i = 0; i < m.length; i++) m[i] = data[i * 4 + 3] > 128 ? 1 : 0;
      masks.push(m);
    }
    const iou = (a, b) => { let it = 0, un = 0; for (let i = 0; i < a.length; i++) { if (a[i] && b[i]) it++; if (a[i] || b[i]) un++; } return it / un; };
    let keep = files.map((_, i) => i);
    while (keep.length > 12) {
      let bi = 0, bv = -1;
      for (let k = 1; k < keep.length - 1; k++) {
        const v = (iou(masks[keep[k - 1]], masks[keep[k]]) + iou(masks[keep[k]], masks[keep[k + 1]])) / 2;
        if (v > bv) { bv = v; bi = k; }
      }
      keep.splice(bi, 1);
    }
    const sub = keep.map((i) => files[i]);
    const sa = await sheetOf(sub);
    subset12[size] = {
      keep,
      sheet: { webpQ: await enc(sa, 'webpQ'), avif: await enc(sa, 'avif'), webpLL: await enc(sa, 'webpLL') },
    };
  }

  /* ── 颜色：两套 vs 一套 + 仿射 ───────────────────────────────── */
  const fitAffine = (xs, ys) => {
    const n = xs.length;
    const sx = xs.reduce((a, b) => a + b, 0), sy = ys.reduce((a, b) => a + b, 0);
    const sxx = xs.reduce((a, b) => a + b * b, 0), sxy = xs.reduce((a, b, i) => a + b * ys[i], 0);
    const den = n * sxx - sx * sx;
    const a = Math.abs(den) < 1e-9 ? 1 : (n * sxy - sx * sy) / den;
    const b = (sy - a * sx) / n;
    let worst = 0, sum = 0;
    for (let i = 0; i < n; i++) { const d = Math.abs(a * xs[i] + b - ys[i]); if (d > worst) worst = d; sum += d; }
    return { a: +a.toFixed(4), b: +b.toFixed(2), max: +worst.toFixed(1), mean: +(sum / Math.max(1, n)).toFixed(2) };
  };
  const color = [];
  for (const size of BAKE.sizes) {
    const wf = walk(path.join(FRAMES, 'base', String(size), 'wake'));
    const df = walk(path.join(FRAMES, 'base', String(size), 'dream'));
    if (!wf.length || wf.length !== df.length) continue;
    const xs = [[], [], []], ys = [[], [], []];
    let maxRaw = 0, sumRaw = 0, nRaw = 0;
    for (let i = 0; i < wf.length; i++) {
      const A = await sharp(wf[i]).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const B = await sharp(df[i]).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      for (let p = 0; p < A.info.width * A.info.height; p++) {
        if (A.data[p * 4 + 3] < 153 || B.data[p * 4 + 3] < 153) continue;
        for (let c = 0; c < 3; c++) {
          const va = A.data[p * 4 + c], vb = B.data[p * 4 + c];
          xs[c].push(va); ys[c].push(vb);
          const d = Math.abs(va - vb);
          if (d > maxRaw) maxRaw = d;
          sumRaw += d; nRaw++;
        }
      }
    }
    color.push({
      size, frames: wf.length,
      raw: { max: maxRaw, mean: +(sumRaw / Math.max(1, nRaw)).toFixed(2) },
      affine: { r: fitAffine(xs[0], ys[0]), g: fitAffine(xs[1], ys[1]), b: fitAffine(xs[2], ys[2]) },
    });
  }

  /* ── 出货：精灵图与落定帧写进 frames/（src.js 读这几个名字） ──────
     压到页面底色（--bg #f0f3f6）而不是带 alpha：这一颗晶体永远落在 --bg 上，
     而 alpha 通道要白付约 35% 的字节。两套都发（醒 / 梦），交替淡入。 */
  const ship = [];
  for (const size of BAKE.sizes) {
    for (const mood of ['wake', 'dream']) {
      const files = walk(path.join(FRAMES, 'base', String(size), mood));
      if (!files.length) continue;
      const sa = await sheetOf(files);
      const flat = await sharp(sa).flatten({ background: BG }).png({ compressionLevel: 9 }).toBuffer();
      const rel = `sheet-${size}-${mood}.webp`;
      const buf = await sharp(flat).webp({ quality: 80, effort: 6, smartSubsample: true }).toBuffer();
      fs.writeFileSync(path.join(FRAMES, rel), buf);
      const relA = `sheet-${size}-${mood}.avif`;
      const bufA = await sharp(flat).avif({ quality: 62, effort: 6 }).toBuffer();
      fs.writeFileSync(path.join(FRAMES, relA), bufA);
      /* 落定帧（末格）单独一张：首屏 / 无 JS / 减少动效时只读这一张 */
      const last = files[files.length - 1];
      const restBuf = await sharp(fs.readFileSync(last)).flatten({ background: BG }).webp({ quality: 88, effort: 6 }).toBuffer();
      const restRel = `rest-${size}-${mood}.webp`;
      fs.writeFileSync(path.join(FRAMES, restRel), restBuf);
      /* 落定帧的 PNG 也留一份：页面上的「对照」那一格要清晰的静帧 */
      fs.copyFileSync(last, path.join(FRAMES, `rest-${size}-${mood}.png`));
      const meta = await sharp(files[0]).metadata();
      ship.push({ size, mood, sheet: rel, sheetBytes: buf.length, avif: relA, avifBytes: bufA.length, rest: restRel, restBytes: restBuf.length, frame: meta.width, n: files.length });
    }
  }
  /* 判决：把「发货字节」算成一个数，并按尺寸分开报 —— 240 与 400 的账差一倍多，
     合起来报一个数会掩盖「哪一档能发、哪一档不能」这件事。 */
  const verdict = {};
  for (const size of BAKE.sizes) {
    const set = ship.filter((s) => s.size === size);
    verdict[size] = {
      n: set.length,
      bytes: set.reduce((a, s) => a + s.sheetBytes + s.restBytes, 0),
      bytesNoRest: set.reduce((a, s) => a + s.sheetBytes, 0),
    };
  }

  const out = {
    at: new Date().toISOString(),
    holdMs: BAKE.holdMs, sizes: BAKE.sizes, dpr: BAKE.dpr,
    /* 姿态读数从 geo.json 带过来：页面那一节要读它，不该手抄 */
    sets: (() => {
      try { return JSON.parse(fs.readFileSync(path.join(SHOTS, 'geo.json'), 'utf8')).sets; }
      catch { return null; }
    })(),
    rows, subset12, color, ship, verdict,
    anim: {
      usable: false,
      why:
        '动画 WebP / AVIF 自动播放、不能定位、不能暂停、没有「播完停住」的事件。' +
        '这一支要的是「触发一次 → 翻到落定 → 完全停住」，所以不能用单文件动画；' +
        '只能是一张精灵图 + JS 逐格换 background-position。',
    },
  };
  fs.writeFileSync(path.join(SHOTS, 'readings.json'), JSON.stringify(out, null, 2));
  log('pack → .shots/readings.json');
  for (const c of color)
    log(`colour ${c.size}: 醒梦原差 max ${c.raw.max}/mean ${c.raw.mean} · 仿射残差 max ${Math.max(c.affine.r.max, c.affine.g.max, c.affine.b.max)}/mean ${Math.max(c.affine.r.mean, c.affine.g.mean, c.affine.b.mean)}`);
  for (const s of ship) log(`ship ${s.mood} ${s.size}: ${s.sheet} ${kb(s.sheetBytes)}K (avif ${kb(s.avifBytes)}K) · rest ${kb(s.restBytes)}K`);
  for (const [size, v] of Object.entries(subset12)) log(`12帧 ${size}: webpQ ${kb(v.sheet.webpQ)}K · avif ${kb(v.sheet.avif)}K · LL ${kb(v.sheet.webpLL)}K`);
}