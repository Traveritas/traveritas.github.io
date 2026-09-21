// p10-c 像素级自验收：解码各截图，测量特效线（颜色/位置/长度/角度/相位差异）
// 只读 PNG（zlib inflate + unfilter，无依赖），打印每张的暖色簇报告
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const OUT = 'D:/Documents/HTA/My Projects/personal-website/design/mocks/.shots-p10-c';

function decode(file) {
  const buf = fs.readFileSync(file);
  let pos = 8, w = 0, h = 0, ct = 0, idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.slice(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ct = data[9]; }
    else if (type === 'IDAT') idat.push(data);
    pos += 12 + len;
    if (type === 'IEND') break;
  }
  if (ct !== 6 && ct !== 2) throw new Error('color type ' + ct + ' not supported');
  const B = ct === 6 ? 4 : 3, raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * B, px = new Uint8Array(w * h * B);
  let rp = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[rp++];
    for (let x = 0; x < stride; x++) {
      const left = x >= B ? px[y * stride + x - B] : 0;
      const up = y > 0 ? px[(y - 1) * stride + x] : 0;
      const ul = y > 0 && x >= B ? px[(y - 1) * stride + x - B] : 0;
      let v = raw[rp++];
      if (f === 1) v += left;
      else if (f === 2) v += up;
      else if (f === 3) v += (left + up) >> 1;
      else if (f === 4) {
        const p = left + up - ul, pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - ul);
        v += (pa <= pb && pa <= pc) ? left : (pb <= pc ? up : ul);
      }
      px[y * stride + x] = v & 255;
    }
  }
  return { w, h, px, B };
}
function pxAt(img, x, y) {
  const i = (y * img.w + x) * img.B;
  return [img.px[i], img.px[i + 1], img.px[i + 2]];
}

// 暖色（琥珀/梦暖）：R-B 差与亮度判定（在纸白 #e9ecef 上）
function isWarm(r, g, b) { return r - b >= 46 && r >= 190 && b <= 185 && g >= 120; }
function isAmber(r, g, b) { return r - b >= 60 && r >= 205 && b <= 165 && g >= 135 && g <= 200; }

function clusters(img, pred, gap) {
  gap = gap || 14;
  const { w, h } = img, cl = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, g, b] = pxAt(img, x, y);
    if (!pred(r, g, b)) continue;
    let hit = null;
    for (const c of cl) {
      if (x >= c.x0 - gap && x <= c.x1 + gap && y >= c.y0 - gap && y <= c.y1 + gap) { hit = c; break; }
    }
    if (hit) {
      hit.x0 = Math.min(hit.x0, x); hit.x1 = Math.max(hit.x1, x);
      hit.y0 = Math.min(hit.y0, y); hit.y1 = Math.max(hit.y1, y);
      hit.n++; hit.sx += x; hit.sy += y; hit.sxx += x * x; hit.syy += y * y; hit.sxy += x * y;
      hit.r += r; hit.g += g; hit.b += b;
    } else {
      cl.push({ x0: x, x1: x, y0: y, y1: y, n: 1, sx: x, sy: y, sxx: x * x, syy: y * y, sxy: x * y, r, g, b });
    }
  }
  return cl.filter(c => c.n >= 2).map(c => {
    // PCA 主方向角度（deg，y 向下为正 → 顺时针为正）
    const mx = c.sx / c.n, my = c.sy / c.n;
    const cxx = c.sxx / c.n - mx * mx, cyy = c.syy / c.n - my * my, cxy = c.sxy / c.n - mx * my;
    const theta = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
    let ang = theta * 180 / Math.PI; if (ang < -90) ang += 180; if (ang > 90) ang -= 180;
    const diag = Math.sqrt(cxx + cyy + Math.sqrt((cxx - cyy) * (cxx - cyy) + 4 * cxy * cxy)) * 2;
    return { cx: Math.round(mx), cy: Math.round(my), n: c.n,
      len: Math.round(diag), ang: +ang.toFixed(1), box: [c.x0, c.y0, c.x1, c.y1],
      rgb: [Math.round(c.r / c.n), Math.round(c.g / c.n), Math.round(c.b / c.n)] };
  }).sort((a, b) => b.n - a.n);
}

// 非背景线检测：与纸白底色差异显著的像素（可见醒冷线尾 / 整条线）
function diffClusters(img, x0, y0, x1, y1) {
  const pred = (r, g, b) =>
    Math.abs(r - 233) + Math.abs(g - 236) + Math.abs(b - 239) >= 42;
  // 手动 ROI 扫描
  const cl = [];
  for (let y = y0; y < Math.min(y1, img.h); y++) for (let x = x0; x < Math.min(x1, img.w); x++) {
    const [r, g, b] = pxAt(img, x, y);
    if (!pred(r, g, b)) continue;
    let hit = null;
    for (const c of cl) if (x >= c.x0 - 12 && x <= c.x1 + 12 && y >= c.y0 - 12 && y <= c.y1 + 12) { hit = c; break; }
    if (hit) {
      hit.x0 = Math.min(hit.x0, x); hit.x1 = Math.max(hit.x1, x);
      hit.y0 = Math.min(hit.y0, y); hit.y1 = Math.max(hit.y1, y); hit.n++;
      hit.sx += x; hit.sy += y; hit.sxx += x * x; hit.syy += y * y; hit.sxy += x * y;
    } else {
      cl.push({ x0: x, x1: x, y0: y, y1: y, n: 1, sx: x, sy: y, sxx: x * x, syy: y * y, sxy: x * y });
    }
  }
  return cl.filter(c => c.n >= 6).map(c => {
    const mx = c.sx / c.n, my = c.sy / c.n;
    const cxx = c.sxx / c.n - mx * mx, cyy = c.syy / c.n - my * my, cxy = c.sxy / c.n - mx * my;
    let ang = 0.5 * Math.atan2(2 * cxy, cxx - cyy) * 180 / Math.PI;
    if (ang < -90) ang += 180; if (ang > 90) ang -= 180;
    const diag = Math.sqrt(cxx + cyy + Math.sqrt((cxx - cyy) * (cxx - cyy) + 4 * cxy * cxy)) * 2;
    return { cx: Math.round(mx), cy: Math.round(my), n: c.n, len: Math.round(diag),
      ang: +ang.toFixed(1), box: [c.x0, c.y0, c.x1, c.y1] };
  }).sort((a, b) => b.n - a.n).slice(0, 6);
}

const files = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync(OUT).filter(f => f.endsWith('.png')).sort();
for (const f of files) {
  const img = decode(path.join(OUT, f));
  const amber = clusters(img, isAmber, 10).slice(0, 6);
  const warm = clusters(img, isWarm, 10);
  console.log('== ' + f + '  ' + img.w + 'x' + img.h);
  console.log('   amber:', JSON.stringify(amber));
  if (warm.length > amber.length) console.log('   warm(all):', JSON.stringify(warm.slice(0, 8)));
  if (/^c2/.test(f)) console.log('   whip-line(ROI 右缘):', JSON.stringify(diffClusters(img, 1240, 60, 1440, 180)));
  if (/^c6/.test(f)) console.log('   live-lines(ROI 右缘):', JSON.stringify(diffClusters(img, 1240, 60, 1440, 900)));
  if (/^c7/.test(f)) console.log('   mobile-line(ROI 全页):', JSON.stringify(diffClusters(img, 0, 0, 390, 200)));
  if (/^c9/.test(f)) console.log('   rm-stitch(ROI 右缘):', JSON.stringify(diffClusters(img, 1240, 60, 1440, 180)));
  if (/^c11/.test(f)) console.log('   demo-stitch(ROI 右缘):', JSON.stringify(diffClusters(img, 1240, 60, 1440, 900)));
}
