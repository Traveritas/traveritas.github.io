/* ─────────────────────────────────────────────────────────────
 somewhere · r 组：进房间之前的那一屏

 检索页本身的语法：三栏、两条 14° 的缝、栏头挂着。这一屏只做一件事——
 告诉人「再往下就是那间屋子」，然后沉下去。
 它不参与转场（转场是镜头往下落），所以它就是一开始的那一小段。
 ───────────────────────────────────────────────────────────── */
export function createApproach(host, opts = {}) {
  const { heads = ['随笔', '瞬间', '项目'] } = opts;
  const wrap = document.createElement('div');
  wrap.className = 'rx-approach';
  wrap.innerHTML = heads
    .map((t, i) => `<b data-i="${i}" style="--i:${i}">${t}</b>`)
    .join('');
  host.appendChild(wrap);
  const els = [...wrap.querySelectorAll('b')];

  return {
    /* sink 0→1：栏头往两边退、往下坠、淡掉 */
    update(sink, vw) {
      const a = Math.max(0, 1 - sink * 2.4);
      wrap.style.opacity = a.toFixed(3);
      if (a <= 0.002) return;
      els.forEach((b, i) => {
        const x = ((i * 2 + 1) / 6) * vw + (i - 1) * 34 * sink;
        b.style.transform = `translate3d(${x.toFixed(1)}px, ${(104 + sink * 260).toFixed(1)}px, 0)`;
      });
    },
    destroy: () => wrap.remove(),
  };
}

/* 「向下」那一行小字：进站前出现，一动就没 */
export function hint(text = '向下') {
  const p = document.createElement('p');
  p.className = 'rx-hint';
  p.innerHTML = `<span>${text}</span><i></i>`;
  document.body.appendChild(p);
  return p;
}
