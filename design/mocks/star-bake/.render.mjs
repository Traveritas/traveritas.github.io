/* ─────────────────────────────────────────────────────────────
   离线渲染驱动（bake.mjs 的 render 段拆出来）
   · 起 headless Chrome（WebGL2 / ANGLE D3D11）
   · 把 bake.mjs 算好的三角形送进 .bake.html 的画面
   · 逐帧要回 PNG（base64）写进 frames/
   · 数据走 evaluate 的返回值（不绕 fetch，省一条静态服务）
   ───────────────────────────────────────────────────────────── */
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.waiting = new Map();
    ws.addEventListener('message', (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id && this.waiting.has(msg.id)) {
        const { res, rej } = this.waiting.get(msg.id);
        this.waiting.delete(msg.id);
        msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
      }
    });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      this.waiting.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params, sessionId }));
      setTimeout(() => {
        if (this.waiting.has(id)) {
          this.waiting.delete(id);
          rej(new Error('timeout ' + method));
        }
      }, 180000);
    });
  }
}

async function launchChrome(profile, port) {
  const proc = spawn(
    CHROME,
    [
      '--headless=new',
      '--remote-debugging-port=' + port,
      '--user-data-dir=' + profile,
      '--no-first-run',
      '--no-default-browser-check',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      /* 核显上 ANGLE 的 D3D11 后端是这台机器上唯一稳的 WebGL2 路径 */
      '--use-angle=d3d11',
      '--disable-gpu-sandbox',
      '--enable-unsafe-swiftshader',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      const j = await r.json();
      return { proc, wsUrl: j.webSocketDebuggerUrl };
    } catch {
      await sleep(200);
    }
  }
  throw new Error('chrome 没能起来');
}

function killTree(pid) {
  try {
    execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
  } catch {
    /* 已经退了 */
  }
}

export async function render({ BAKE, FRAMES, SHOTS, SF, buildStar, evenPicks, greedyPicks, poseScores, log }) {
  const OUT = FRAMES;
  fs.mkdirSync(OUT, { recursive: true });
  const profile = path.join(process.env.TEMP || OUT, `chrome-star-bake-${process.pid}`);
  const port = 9431;

  const { proc, wsUrl } = await launchChrome(profile, port);
  const ws = new WebSocket(wsUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  const cdp = new CDP(ws);
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const S = (m, p) => cdp.send(m, p, sessionId);
  await S('Page.enable');
  await S('Runtime.enable');

  const errors = [];
  cdp.ws.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data);
    if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.text);
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error')
      errors.push(msg.params.args.map((a) => a.value ?? a.description).join(' '));
  });

  const evaluate = async (expr) => {
    const r = await S('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails)
      throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || ''));
    return r.result.value;
  };

  /* 走本地静态服务，不走 file:// —— .bake.html 里那条 importmap 要用绝对路径 /three/，
     file:// 下解析不了 */
  const { createRequire } = await import('node:module');
  const req = createRequire(path.join(HERE, 'serve.cjs'));
  const { start } = req(path.join(HERE, 'serve.cjs'));
  const server = await start(0);
  const pageUrl = `http://127.0.0.1:${server.address().port}/star-bake/.bake.html`;
  log('bake page', pageUrl);
  await S('Page.navigate', { url: pageUrl });
  for (let i = 0; i < 80; i++) {
    if (await evaluate('window.__ready === true').catch(() => false)) break;
    await sleep(150);
  }
  const info = await evaluate('window.__bake.info()');
  log('GPU', JSON.stringify(info));

  const cfg = BAKE.cfg;
  const M = SF.M_REST;

  /* 姿态集合：12 / 16 / 24，均匀与贪心各一套；末格恒为 1（落定回到正位） */
  const sets = [];
  const scores = poseScores(cfg, M, 300);
  for (const n of [12, 16, 24]) {
    sets.push({ key: `even${n}`, n, us: evenPicks(n) });
    sets.push({ key: `greedy${n}`, n, us: greedyPicks(cfg, M, scores, n) });
  }
  /* 12 / 16 / 24 × 均匀/贪心，六套都真烘 —— 体积表上的每个数都是量出来的，没有外推 */
  const wanted = sets;

  const manifest = [];
  for (const size of BAKE.sizes) {
    for (const set of wanted) {
      /* 这一套的姿态矩阵 → 每帧一棵三角面表 */
      const frames = set.us.map((u, i) => {
        const geo = buildStar(cfg, SF.poseAt(u, M, SF.TUMBLE));
        return { name: `${set.key}-${size}-${String(i).padStart(2, '0')}`, u, positions: Array.from(geo.positions), tones: Array.from(geo.tone) };
      });
      log(`render ${set.key} @${size} — ${frames.length} 帧`);
      const t0 = Date.now();
      const res = await evaluate(`window.__bake.renderMask(${size}, ${JSON.stringify(frames.map((f) => ({ name: f.name, positions: f.positions, tones: f.tones })))}, 1)`);
      if (!Array.isArray(res) || res.length !== frames.length) throw new Error('render 返回不对');
      const dir = path.join(OUT, set.key, String(size));
      fs.mkdirSync(dir, { recursive: true });
      for (const f of res) {
        const buf = Buffer.from(f.dataUrl.split(',')[1], 'base64');
        fs.writeFileSync(path.join(dir, `${f.name}.png`), buf);
      }
      manifest.push({ set: set.key, size, n: frames.length, us: frames.map((f) => +f.u.toFixed(4)), ms: Date.now() - t0 });
      log(`  → ${dir}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    }
  }

  /* 彩色参考：同一份几何、同一份四档调子，但**直接渲成颜色**。
     它只用来验「alpha 掩码 × 一个色相」这条断言（见 .pack.mjs），页面上的对照另走 SVG。 */
  const colorSets = [];
  for (const set of wanted) {
    for (const size of BAKE.sizes) {
      const frames = set.us.map((u, i) => {
        const geo = buildStar(cfg, SF.poseAt(u, M, SF.TUMBLE));
        return { name: `color-${size}-${String(i).padStart(2, '0')}`, positions: Array.from(geo.positions), tones: Array.from(geo.tone) };
      });
      const dir = path.join(OUT, 'color', set.key, String(size));
      fs.mkdirSync(dir, { recursive: true });
      const res = await evaluate(
        `window.__bake.renderColor(${size}, ${JSON.stringify(frames)}, '#232830', '#f0f3f6', 1)`,
      );
      for (const f of res) fs.writeFileSync(path.join(dir, `${f.name}.png`), Buffer.from(f.dataUrl.split(',')[1], 'base64'));
      colorSets.push({ set: set.key, size, dir });
    }
  }
  log('彩色参考 → frames/color/');

  fs.writeFileSync(path.join(SHOTS, 'render.json'), JSON.stringify({ info, errors, manifest, colorSets }, null, 2));
  console.log(JSON.stringify({ info, errors, sets: manifest.map((m) => `${m.set}@${m.size}: ${m.n} 帧 ${m.ms}ms`) }, null, 2));

  ws.close();
  server.close();
  killTree(proc.pid);
  await sleep(500);
  for (let i = 0; i < 8; i++) {
    try {
      fs.rmSync(profile, { recursive: true, force: true });
      break;
    } catch {
      await sleep(400);
    }
  }
}