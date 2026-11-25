/* ─────────────────────────────────────────────────────────────
   离线渲染驱动（bake.mjs 的 render/probe 段）
   · 起 headless Chrome（WebGL2），走本地静态服务（serve.cjs，端口随取）
   · 逐帧调 bake.html 的 window.__crystal.render(...)，要回 PNG 写进 frames/
   · 数据走 evaluate 的返回值 —— 不绕 fetch，省一条静态服务
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
      const m = JSON.parse(e.data);
      if (m.id && this.waiting.has(m.id)) {
        const { res, rej } = this.waiting.get(m.id);
        this.waiting.delete(m.id);
        m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
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
      }, 300000);
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
  for (let i = 0; i < 150; i++) {
    try {
      const j = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
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

export async function renderFrames({ renderArgs, SHOTS, log, jobs }) {
  const profile = path.join(process.env.TEMP || SHOTS, `chrome-star-nexus-bake-${process.pid}`);
  const port = 9457;
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
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.method === 'Runtime.exceptionThrown')
      errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error')
      errors.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
  });

  const evaluate = async (expr) => {
    const r = await S('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || ''));
    return r.result.value;
  };

  const { createRequire } = await import('node:module');
  const req = createRequire(path.join(HERE, 'serve.cjs'));
  const { start } = req(path.join(HERE, 'serve.cjs'));
  const server = await start(0);
  const pageUrl = `http://127.0.0.1:${server.address().port}/star-nexus-bake/bake.html`;
  log('bake page', pageUrl);
  await S('Page.navigate', { url: pageUrl });
  let up = false;
  for (let i = 0; i < 100; i++) {
    if (await evaluate('window.__ready === true').catch(() => false)) { up = true; break; }
    await sleep(150);
  }
  if (!up) {
    console.error('页面没起来。错误：', errors.slice(-8));
    throw new Error('bake.html 没到 __ready');
  }
  log('GPU', JSON.stringify(await evaluate('window.__crystal.info()')));

  const manifest = [];
  let done = 0;
  for (const job of jobs) {
    const args = renderArgs(job.poseU, job.dream, job.px, { bg: job.bg });
    const t0 = Date.now();
    const url = await evaluate(`window.__crystal.render(${JSON.stringify(args)})`);
    const buf = Buffer.from(url.split(',')[1], 'base64');
    const dir = job.dir || path.join(SHOTS, '.probe');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${job.name}.png`);
    fs.writeFileSync(file, buf);
    manifest.push({ name: job.name, poseU: +job.poseU.toFixed(4), dream: job.dream, px: job.px, bytes: buf.length, ms: Date.now() - t0, file: path.relative(HERE, file) });
    if (++done % 8 === 0 || done === jobs.length) log(`  ${done}/${jobs.length} 帧`);
  }

  /* 诊断：单张也要留一份到 .shots/ */
  if (jobs.every((j) => j.name.startsWith('probe'))) {
    for (const m of manifest)
      fs.copyFileSync(path.join(HERE, m.file), path.join(SHOTS, `${m.name}.png`));
  }

  fs.writeFileSync(
    path.join(SHOTS, jobs[0].name.startsWith('probe') ? 'probe.json' : 'render.json'),
    JSON.stringify({ at: new Date().toISOString(), errors, frames: manifest }, null, 2),
  );
  console.log(JSON.stringify({ frames: manifest.length, errors: errors.slice(0, 4), totalMs: manifest.reduce((a, m) => a + m.ms, 0) }, null, 2));

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
  if (errors.length) throw new Error('渲染期间有错误：' + errors[0].slice(0, 400));
}