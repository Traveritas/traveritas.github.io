/* 粒度判据作业：把「相邻两格像不像」和「六支还认不认得出」量成数字。
   对每个 (尺寸, 步数)：
     · 把每一格的剪影二值化，算相邻两格的 IoU（越小越「换了个东西」，太大则说明步数浪费）
     · 算整圈里最像的一对（重复度：接近 1 说明姿态在浪费）
     · 算每一格「是不是星」：把剪影转成极坐标半径序列，数六个方向上的尖峰个数与谷深
   输出 JSON，写进 notes.md。 */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { start } = require('./serve.cjs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9376;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function req(method, urlPath) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port: PORT, path: urlPath, method }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(d); } });
    });
    r.on('error', reject); r.end();
  });
}
class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map();
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        const p = this.pending.get(m.id); this.pending.delete(m.id);
        m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
      }
    };
  }
  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
}

(async () => {
  const server = await start(0);
  const base = `http://127.0.0.1:${server.address().port}/star-crystal/`;
  const profile = path.join(process.env.TEMP, 'chrome-grain-' + Date.now());
  const chrome = spawn(CHROME, [
    '--headless=new', '--hide-scrollbars', '--use-angle=d3d11', '--no-first-run',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: 'ignore' });

  for (let i = 0; i < 60; i++) {
    try { await req('GET', '/json/version'); break; } catch { await sleep(250); }
  }
  const t = await req('PUT', '/json/new?about:blank');
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => { ws.onopen = r; });
  const cdp = new CDP(ws);
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 900, height: 700, deviceScaleFactor: 1, mobile: false });
  await cdp.send('Page.navigate', { url: base + '?pose=2' });
  await sleep(2800);

  const r = await cdp.send('Runtime.evaluate', {
    expression: `(async () => {
      const mod = await import('./src.js');

      /* 在离屏画布上把每一格单独渲染出来，读成 alpha 掩膜 */
      function silhouettes(variant, steps, holdMs, size) {
        const cv = document.createElement('canvas');
        cv.style.cssText = 'position:fixed;left:-4000px;top:0';
        document.body.append(cv);
        const L = new mod.StarLayer(cv, { size, variant, steps, holdMs, mode: 'step', canvasMode: 'opaque' });
        L.renderer.setSize(size, size, false);
        const gl = L.renderer.getContext();
        const w = L.renderer.domElement.width;
        const h = L.renderer.domElement.height;
        const s = mod.schedule(steps, holdMs);
        const masks = [];
        for (let k = 0; k < steps; k++) {
          L.draw(s.starts[k]);
          const px = new Uint8Array(w * h * 4);
          gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
          /* 相对清屏色 #f0f3f6 的偏差 → 二值剪影 */
          const m = new Uint8Array(w * h);
          for (let i = 0; i < w * h; i++) {
            const d = Math.abs(px[i*4] - 240) + Math.abs(px[i*4+1] - 243) + Math.abs(px[i*4+2] - 246);
            m[i] = d > 10 ? 1 : 0;
          }
          masks.push(m);
        }
        L.dispose();
        cv.remove();
        return { masks, w, h };
      }

      /* 剪影沿方向 d 的「最后一个实心像素」半径：得到极坐标轮廓 */
      function radialProfile(m, w, h, dirs = 360) {
        const cx = w / 2, cy = h / 2;
        const R = Math.min(w, h) / 2;
        const out = new Float32Array(dirs);
        for (let d = 0; d < dirs; d++) {
          const a = (d / dirs) * Math.PI * 2;
          const dx = Math.cos(a), dy = Math.sin(a);
          let last = 0;
          for (let r = 1; r < R; r += 0.5) {
            const x = Math.round(cx + dx * r);
            const y = Math.round(cy + dy * r);
            if (x < 0 || y < 0 || x >= w || y >= h) break;
            if (m[y * w + x]) last = r;
          }
          out[d] = last / R;
        }
        return out;
      }

      /* 六支星的自检：极坐标轮廓里应当有 6 个尖峰。
         数峰值（比两侧 24 个方向都高），再看峰 / 谷的起伏比。 */
      function spikeScore(profile) {
        const n = profile.length;
        let peaks = 0;
        let peakSum = 0, valleySum = 0;
        for (let i = 0; i < n; i++) {
          const v = profile[i];
          let isPeak = true;
          for (let k = 1; k <= 24; k++) {
            if (profile[(i + k) % n] > v || profile[(i - k + n) % n] > v) { isPeak = false; break; }
          }
          if (isPeak) { peaks++; peakSum += v; }
          if (v < 0.55) valleySum += v;
        }
        const mean = profile.reduce((a, b) => a + b, 0) / n;
        const max = Math.max(...profile);
        return { peaks, mean: +mean.toFixed(3), max: +max.toFixed(3) };
      }

      function iou(a, b) {
        let i = 0, u = 0;
        for (let k = 0; k < a.length; k++) {
          if (a[k] && b[k]) i++;
          if (a[k] || b[k]) u++;
        }
        return u ? i / u : 0;
      }

      const out = [];
      for (const size of [240, 96, 64, 48, 32]) {
        for (const steps of [8, 12, 16, 24]) {
          const { masks, w, h } = silhouettes('cheap', steps, 110, size);
          const adj = [];
          for (let k = 0; k < steps; k++) adj.push(iou(masks[k], masks[(k + 1) % steps]));
          let worst = 1;
          for (let a = 0; a < steps; a++) {
            for (let b = a + 1; b < steps; b++) {
              const v = iou(masks[a], masks[b]);
              if (v < worst) worst = v;
            }
          }
          /* 重复度：整圈里最像的一对（含相邻） */
          let most = 0;
          for (let a = 0; a < steps; a++) {
            for (let b = a + 1; b < steps; b++) {
              const v = iou(masks[a], masks[b]);
              if (v > most) most = v;
            }
          }
          const spikes = masks.map((m) => spikeScore(radialProfile(m, w, h)));
          const sixPeak = spikes.filter((s) => s.peaks === 6).length;
          out.push({
            size, steps,
            adjIouMin: +Math.min(...adj).toFixed(3),
            adjIouMean: +(adj.reduce((a, b) => a + b, 0) / adj.length).toFixed(3),
            distinctMax: +most.toFixed(3),
            sameCount: spikes.filter((s) => s.peaks === 6).length,
            peaks: spikes.map((s) => s.peaks),
            meanR: spikes.map((s) => s.mean),
          });
        }
      }
      return JSON.stringify(out, null, 1);
    })()`,
    awaitPromise: true, returnByValue: true,
  });

  const data = JSON.parse(r.result.value);
  fs.writeFileSync(path.join(__dirname, '.shots', 'grain.json'), JSON.stringify(data, null, 1));
  console.log(r.result.value);

  ws.close(); chrome.kill(); server.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });