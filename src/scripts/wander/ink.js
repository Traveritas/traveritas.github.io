/* ─────────────────────────────────────────────────────────────
 字随底换墨：这片空间里浮在流光上的字（主页的名字、栏头、角落的小字，检索的栏头，左上的字标），
 不靠背景让路，而是自己按底下的明暗换墨——底暗处是浅墨，底亮处是深墨，中间平滑过渡。

 做法：流光画布是低分辨率的（1/5），每隔几帧把它读进一张同样小的 2D 画布；对每一处字，沿它的宽度
 取 N 个点（每个点是字高中间三行的平均亮度），按亮度算出每一点该用多少深墨，再做一点时间上的平滑
 （池子漂过来时字是慢慢换墨的，不是一下翻过去），最后写成一条横向的渐变，用 background-clip: text
 涂进字里（CSS：[data-ink-auto]）。字的内容随便变——换面的乱码、AveritA 的浮动都不影响。
 横向渐变就够：池子是大片柔软的雾，边界横着扫过字；竖向的变化在一行字的高度里可以忽略。

 每一点只在浅墨与深墨两态之间选（不混成中灰：中灰在分界附近的底上几乎看不见），分界取「浅墨与深墨
 对它的对比度相等」的那个底色亮度（线性亮度 ≈ 0.19），带一点回滞——底亮过 0.215 才换深墨、暗过 0.17
 才换回浅墨，免得在分界上来回闪；换墨本身用约 0.3 秒走过去。分界上两种墨的对比度都在 3.6 左右。
 每处字可以有自己的一对墨（栏头的条数是强调色的浅 / 深两墨）与透明度（淡字），层次不丢。
 ───────────────────────────────────────────────────────────── */

const N = 12;
const EVERY = 4; // 每几帧读一次画布
const LIGHT = [239, 234, 244];
const DARK = [30, 34, 44];
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const LUT = new Float32Array(256).map((_, i) => lin(i));
const UP = 0.215;
const DOWN = 0.17;

export function createInk(light) {
  const cv = document.createElement('canvas');
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const items = [];
  let data = null;
  let W = 0;
  let H = 0;

  /* opts：{ light, dark：[r, g, b]；a：透明度 0–1 } */
  function add(el, opts = {}) {
    if (!el) return;
    el.setAttribute('data-ink-auto', '');
    items.push({ el, light: opts.light || LIGHT, dark: opts.dark || DARK, a: opts.a ?? 1, cur: null, side: null, css: '' });
  }

  function read() {
    if (cv.width !== light.width || cv.height !== light.height) {
      cv.width = light.width;
      cv.height = light.height;
    }
    W = cv.width;
    H = cv.height;
    ctx.drawImage(light, 0, 0);
    data = ctx.getImageData(0, 0, W, H).data;
  }
  const lumAt = (x, y) => {
    const i = (Math.min(H - 1, Math.max(0, y | 0)) * W + Math.min(W - 1, Math.max(0, x | 0))) * 4;
    return 0.2126 * LUT[data[i]] + 0.7152 * LUT[data[i + 1]] + 0.0722 * LUT[data[i + 2]];
  };

  function step(frame, force = false) {
    if (!light || (!force && frame % EVERY)) return;
    read();
    const sx = W / innerWidth;
    const sy = H / innerHeight;
    for (const it of items) {
      const r = it.el.getBoundingClientRect();
      if (!r.width || r.bottom < 0 || r.top > innerHeight) continue;
      const first = !it.side || force;
      if (!it.side) it.side = new Uint8Array(N);
      for (let k = 0; k < N; k++) {
        const x = (r.left + ((k + 0.5) / N) * r.width) * sx;
        let L = 0;
        for (const f of [0.3, 0.5, 0.7]) L += lumAt(x, (r.top + r.height * f) * sy);
        L /= 3;
        if (first) it.side[k] = L > (UP + DOWN) / 2 ? 1 : 0;
        else if (it.side[k] && L < DOWN) it.side[k] = 0;
        else if (!it.side[k] && L > UP) it.side[k] = 1;
      }
      if (first) it.cur = Float32Array.from(it.side);
      else for (let k = 0; k < N; k++) it.cur[k] += (it.side[k] - it.cur[k]) * 0.35;
      const stops = [];
      for (let k = 0; k < N; k++) {
        const m = it.cur[k];
        const c = it.light.map((v, j) => Math.round(v + (it.dark[j] - v) * m));
        stops.push(`rgb(${c[0]} ${c[1]} ${c[2]} / ${it.a}) ${(((k + 0.5) / N) * 100).toFixed(1)}%`);
      }
      const css = `linear-gradient(90deg, ${stops.join(', ')})`;
      if (css !== it.css) {
        it.el.style.backgroundImage = css;
        it.css = css;
      }
    }
  }

  return { add, step };
}
