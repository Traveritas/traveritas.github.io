/* ─────────────────────────────────────────────────────────────
   启动：从地址栏读规则、详情、皮肤、机制与交界画法。变体按名字现取文件，不必改 index.html：
     ?rule=forget                 规则      → js/rules/<名>.js
     ?detail=window               详情展示  → js/details/<名>.js
     ?skin=b2                     皮肤      → skins/<名>.css（叠在 plane.css 之后；html[data-skin=名]）
     ?mech=arrive,-haze           机制      → js/mechs/<名>.js（在规则默认机制上追加 / 去掉）
     ?seam=line | bare | soft     交界画法（默认 line）
   ───────────────────────────────────────────────────────────── */
(async () => {
  'use strict';
  const K = window.PlaneKit;
  const q = new URLSearchParams(location.search);
  const name = (k) => (q.get(k) || '').replace(/[^\w-]/g, '');
  const load = (src) =>
    new Promise((res) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = res;
      s.onerror = () => { console.error(`没有找到 ${src}`); res(); };
      document.body.appendChild(s);
    });

  const ruleName = name('rule') || 'forget';
  if (!K.rules[ruleName]) await load(`js/rules/${ruleName}.js`);
  const detail = name('detail') || 'window';
  if (!(K.details && K.details[detail])) await load(`js/details/${detail}.js`);
  const skin = name('skin');
  if (skin) {
    document.documentElement.dataset.skin = skin;
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = `skins/${skin}.css`;
    await new Promise((res) => { l.onload = l.onerror = res; document.head.appendChild(l); });
  }

  const rule = (K.rules[ruleName] || K.rules.forget)();
  const mechs = new Set(rule.mechs || []);
  for (const m of (q.get('mech') || '').split(',').map((s) => s.trim().replace(/[^\w-]/g, '')).filter(Boolean)) {
    if (m.startsWith('-')) mechs.delete(m.slice(1));
    else mechs.add(m);
  }
  for (const m of mechs) if (!K.mechs[m]) await load(`js/mechs/${m}.js`);
  const seam = ['line', 'bare', 'soft'].includes(q.get('seam')) ? q.get('seam') : 'line';
  K.start({ rule, mechs: [...mechs], seam, detail });
})();
