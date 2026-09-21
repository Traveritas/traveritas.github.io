// 一键启动「完整网页」的四个变体，便于逐个打开测试：
//   1. 正式站 ·「醒梦缝 · 一夜」  npm run preview        → http://localhost:4321/
//   2. 印潮 p6-inktide            node design/.serve6.cjs → http://127.0.0.1:8320/
//   3. 长卷·渡 p6-handscroll      node design/.serve-p6b.cjs → http://127.0.0.1:8392/mocks/p6-handscroll.html
//      （同一服务下：移动端探针 http://127.0.0.1:8392/mocks/p6-probe.html）
//   4. 晷园 p6-sundial-garden     node design/.serve-p6.cjs → http://127.0.0.1:8317/
//      （注意：该脚本控制台打印的 8261 是旧文案，实际监听端口是 8317）
// 用法：项目根目录执行  node design/.serve-variants.cjs
// 停止：在运行窗口按 Ctrl+C（本脚本拉起的子服务一并退出；已在运行的旧服务不受影响）
const { spawn } = require('child_process');
const net = require('net');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const VARIANTS = [
  {
    name: '① 正式站 ·「醒梦缝 · 一夜」（Astro 构建产物）',
    cmd: 'npm', args: ['run', 'preview'],
    host: 'localhost', port: 4321, url: 'http://localhost:4321/',
    note: '读的是 dist/（上次构建）；若 src/ 有改动，先 npm run build 再看',
  },
  {
    name: '② 印潮 · p6-inktide（组合轮完整方案）',
    cmd: 'node', args: ['design/.serve6.cjs'],
    host: '127.0.0.1', port: 8320, url: 'http://127.0.0.1:8320/',
    note: '根路径即印潮首页',
  },
  {
    name: '③ 长卷·渡 · p6-handscroll（组合轮完整方案）',
    cmd: 'node', args: ['design/.serve-p6b.cjs'],
    host: '127.0.0.1', port: 8392, url: 'http://127.0.0.1:8392/mocks/p6-handscroll.html',
    note: '移动端探针：http://127.0.0.1:8392/mocks/p6-probe.html（390×844 iframe）',
  },
  {
    name: '④ 晷园 · p6-sundial-garden（组合轮完整方案）',
    cmd: 'node', args: ['design/.serve-p6.cjs'],
    host: '127.0.0.1', port: 8317, url: 'http://127.0.0.1:8317/',
    note: '实际监听 8317（脚本内打印的 8261 是旧文案）',
  },
];

function portOpen(host, port) {
  return new Promise((resolve) => {
    const s = net.connect({ host, port, timeout: 600 });
    s.once('connect', () => { s.destroy(); resolve(true); });
    s.once('error', () => resolve(false));
    s.once('timeout', () => { s.destroy(); resolve(false); });
  });
}

const children = [];

function launch(v) {
  const line = [v.cmd, ...v.args].map((a) => (/[ "]/.test(a) ? JSON.stringify(a) : a)).join(' ');
  const child = spawn(line, { shell: true, cwd: ROOT, stdio: 'inherit', windowsHide: true });
  children.push(child);
  child.once('exit', (code) => {
    if (code !== null && code !== 0) console.log(`[variants] ${v.name} 的服务进程退出（code ${code}），对应页面可能打不开`);
  });
}

(async () => {
  console.log('=== 完整网页 · 四变体预览 ===\n');
  const started = [];
  for (const v of VARIANTS) {
    if (await portOpen(v.host, v.port)) {
      console.log(`[跳过] ${v.name} —— 端口 ${v.port} 已有服务在跑，直接复用`);
    } else {
      launch(v);
      started.push(v);
      console.log(`[启动] ${v.name} —— $ ${v.cmd} ${v.args.join(' ')}`);
    }
  }
  // 等服务起来
  await new Promise((r) => setTimeout(r, started.some((v) => v.port === 4321) ? 3500 : 800));

  console.log('\n================ 预览地址 ================');
  for (const v of VARIANTS) {
    const ok = await portOpen(v.host, v.port);
    console.log(`\n${v.name}`);
    console.log(`  ${ok ? '●' : '○'} ${v.url}${ok ? '' : '（未就绪/未启动）'}`);
    if (v.note) console.log(`  · ${v.note}`);
  }
  console.log('\n停止本脚本（Ctrl+C）会一并停掉它拉起的服务；之前就在跑的旧服务不受影响。');
})();

for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => {
    for (const c of children) { try { c.kill(); } catch {} }
    process.exit(0);
  });
}
process.on('exit', () => {
  for (const c of children) { try { c.kill(); } catch {} }
});
