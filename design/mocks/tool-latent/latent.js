/* ═══════════════════════════════════════════════════════════════
   潜影 latent · 显影 develop
   工具层：一圈字与刻度，潜影在画面里，靠浓度差显出来。
   三条召唤路径（边缘痕 / 指针停驻 / 快捷键）唤出的是同一个面。
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var P = window.__p;
  var qs = new URLSearchParams(location.search);

  var el = {
    latent: document.getElementById('latent'),
    ring: document.getElementById('ring'),
    field: document.getElementById('ringField'),
    ticks: document.getElementById('ticks'),
    nodes: document.getElementById('nodes'),
    core: document.getElementById('core'),
    box: document.getElementById('coreBox'),
    cursor: document.getElementById('cursor'),
    trace: document.getElementById('trace'),
    say: document.getElementById('say'),
  };

  /* ── 十二件工具。tick 是它在环上的刻度位（60 枚刻度，每 5 枚一枚字）── */
  var TOOLS = [
    { id: 'find',     tick: 0,  cn: '检索', en: 'FIND',     dn: '寻',   den: 'SEEK',      core: 'find' },
    { id: 'view',     tick: 5,  cn: '视图', en: 'VIEW',     dn: '观',   den: 'VIEW',      core: 'view' },
    { id: 'scene',    tick: 10, cn: '场景', en: 'SCENE',    dn: '境',   den: 'SCENE',     core: 'scene' },
    { id: 'home',     tick: 15, cn: '归处', en: 'HOME',     dn: '岸',   den: 'SHORE',     core: null },
    { id: 'gate',     tick: 20, cn: '门',   en: 'NEXUS',    dn: '门',   den: 'NEXUS',     core: null },
    { id: 'exits',    tick: 25, cn: '出口', en: 'EXITS',    dn: '出口', den: 'EXITS',     core: 'exits' },
    { id: 'face',     tick: 30, cn: '面',   en: 'FACE',     dn: '面',   den: 'FACE',      core: 'face' },
    { id: 'sound',    tick: 35, cn: '声',   en: 'SOUND',    dn: '回响', den: 'ECHO',      core: 'sound' },
    { id: 'contents', tick: 40, cn: '目录', en: 'CONTENTS', dn: '存目', den: 'CONTENTS',  core: 'contents' },
    { id: 'reading',  tick: 45, cn: '读',   en: 'READING',  dn: '读',   den: 'READING',   core: 'reading' },
    { id: 'filter',   tick: 50, cn: '筛',   en: 'FILTER',   dn: '筛',   den: 'FILTER',    core: 'filter' },
    { id: 'hour',     tick: 55, cn: '刻',   en: 'HOUR',     dn: '刻',   den: 'HOUR',      core: 'hour' },
  ];

  var TICKS = 60;
  var DWELL_MS = 380;
  var RETRACT_MS = 1400;

  var geo = { cx: 0, cy: 0, R: 0, labelR: 0, coreW: 0, coreH: 0, w: 0, h: 0, mobile: false };
  var tickEls = [], nodeEls = [];
  var state = {
    live: false,
    open: null,
    frozen: null,
    origin: { x: 0, y: 0 },
    dwell: null,
    retract: null,
    liveT: null,
    holdT: null,
    lastPointer: { x: 0, y: 0, known: false },
    view: 'list',
    /* ?dwell=0 关掉停驻自动显影，只留指针跟着走的那一小片 */
    dwellMs: qs.get('dwell') === '0' ? 0 : DWELL_MS,
  };

  /* ═══ 布局 ═══════════════════════════════════════════════ */
  function layout() {
    var w = innerWidth, h = innerHeight;
    geo.w = w; geo.h = h; geo.mobile = w <= 640;
    geo.cx = Math.round(w / 2);
    geo.cy = Math.round(h / 2);
    geo.R = geo.mobile
      ? Math.round(Math.max(88, Math.min(w * 0.29, h * 0.135)))
      : Math.round(Math.max(172, Math.min(Math.min(w, h) * 0.34, 300)));
    geo.labelR = geo.R - (geo.mobile ? 24 : 34);

    if (geo.mobile) {
      /* 窄屏：环往上坐，里面那块摊到环下面，不然十二枚字与里面的内容挤成一团 */
      geo.cy = Math.round(h * 0.36);
      geo.coreW = Math.round(w - 48);
      geo.coreH = Math.round(h - geo.cy - geo.R - 30 - 34);
      el.core.style.setProperty('--coreTop', (geo.cy + geo.R + 30) + 'px');
    } else {
      var safe = Math.max(70, (geo.labelR - 46) * 0.78);
      geo.coreW = Math.round(Math.min(400, safe * 2));
      geo.coreH = geo.coreW;
      el.core.style.setProperty('--coreTop', '50%');
    }
    el.latent.dataset.mobile = geo.mobile ? '1' : '0';

    el.latent.style.setProperty('--diag', Math.round(Math.hypot(w, h)) + 'px');
    el.core.style.setProperty('--coreW', geo.coreW + 'px');
    el.core.style.setProperty('--coreH', geo.coreH + 'px');

    placeTicks();
    placeNodes();
    if (!state.live) setMaskCenter(geo.cx, geo.cy);
    paintProgress();
  }

  function ang(i) { return (i / TICKS) * Math.PI * 2; }   /* 0 = 顶，顺时针 */

  function placeTicks() {
    for (var i = 0; i < TICKS; i++) {
      var t = tickEls[i];
      if (!t) {
        t = document.createElement('i');
        t.className = 'tk';
        el.ticks.appendChild(t);
        tickEls[i] = t;
      }
      var a = ang(i);
      var x = geo.cx + geo.R * Math.sin(a);
      var y = geo.cy - geo.R * Math.cos(a);
      t._x = x; t._y = y; t._a = a - Math.PI / 2;
      t.className = 'tk' + (i % 5 === 0 ? ' is-major' : '');
      t.style.left = x + 'px';
      t.style.top = y + 'px';
      t.style.setProperty('--rot', (i * (360 / TICKS)) + 'deg');
    }
  }

  function placeNodes() {
    TOOLS.forEach(function (tool, k) {
      var n = nodeEls[k];
      if (!n) {
        n = document.createElement('button');
        n.type = 'button';
        n.className = 'node';
        n.dataset.id = tool.id;
        n.innerHTML = '<span class="node-cn"></span><span class="node-en mono"></span>';
        n.addEventListener('click', function () { onNode(tool); });
        el.nodes.appendChild(n);
        nodeEls[k] = n;
      }
      var a = ang(tool.tick);
      var x = geo.cx + geo.labelR * Math.sin(a);
      var y = geo.cy - geo.labelR * Math.cos(a);
      tool._x = x; tool._y = y; tool._a = a - Math.PI / 2;
      n._x = x; n._y = y; n._a = a - Math.PI / 2;
      n.style.left = x + 'px';
      n.style.top = y + 'px';
    });
    paintLabels();
  }

  function paintLabels() {
    var dream = document.documentElement.dataset.face === 'dream';
    TOOLS.forEach(function (tool, k) {
      var n = nodeEls[k];
      n.querySelector('.node-cn').textContent = dream ? tool.dn : tool.cn;
      n.querySelector('.node-en').textContent = dream ? tool.den : tool.en;
      n.setAttribute('aria-label', (dream ? tool.dn : tool.cn) + ' · ' + (dream ? tool.den : tool.en));
      n.classList.toggle('is-on', state.open === tool.id);
    });
  }

  /* ═══ 显影的先后：从落点向外，一层层 ─────────────────────── */
  function assignWave(ox, oy) {
    if (!isFinite(ox) || !isFinite(oy)) { ox = geo.cx; oy = geo.cy; }
    var waveLen = Math.max(geo.w, geo.h) * 0.62;
    var oa = Math.atan2(oy - geo.cy, ox - geo.cx);
    var nearCenter = Math.hypot(ox - geo.cx, oy - geo.cy) < 90;
    var items = [];
    tickEls.forEach(function (t) { items.push({ el: t, x: t._x, y: t._y, a: t._a }); });
    nodeEls.forEach(function (n) { items.push({ el: n, x: n._x, y: n._y, a: n._a }); });
    items.forEach(function (o) {
      var dn = Math.min(1, Math.hypot(o.x - ox, o.y - oy) / waveLen);
      var base = nearCenter ? -Math.PI / 2 : oa;
      var an = ((o.a - base) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) / (Math.PI * 2);
      var d = 0.55 * (0.62 * dn + 0.38 * an);
      o.el.style.setProperty('--d', d.toFixed(4));
    });
    /* 中心那一块：落点在环心时先出来，从边缘来时最后到 */
    var cdn = Math.min(1, Math.hypot(geo.cx - ox, geo.cy - oy) / waveLen);
    el.core.style.setProperty('--d', (nearCenter ? 0 : 0.5 * cdn).toFixed(4));
    /* 边缘那条痕：从边缘来时它最先，其余时候它殿后 */
    var edge = ox > geo.w - 150;
    el.trace.style.setProperty('--d', edge ? '0' : '0.46');
  }

  function setMaskCenter(x, y) {
    if (!isFinite(x) || !isFinite(y)) { x = geo.cx; y = geo.cy; }
    el.latent.style.setProperty('--px', Math.round(x) + 'px');
    el.latent.style.setProperty('--py', Math.round(y) + 'px');
  }

  /* ═══ 动词：显影 / 褪回 ═══════════════════════════════════ */
  function develop(from, patchR) {
    if (state.frozen !== null) return;
    clearTimeout(state.retract); clearTimeout(state.liveT);
    state.retracting = false;
    state.origin = from;
    assignWave(from.x, from.y);
    setMaskCenter(from.x, from.y);
    el.latent.style.setProperty('--patchR', (patchR || 250) + 'px');
    el.latent.classList.remove('is-retracting');
    el.latent.classList.add('is-live');
    state.live = true;
    el.latent.style.setProperty('--spread', '1');
    el.latent.style.setProperty('--open', '1');
    document.documentElement.dataset.tool = 'full';
    state.patched = false;
  }

  /* 指针走过的地方先亮一小片：露出的范围只有落点周围，浓度也只到一半 */
  function patch(x, y) {
    if (state.frozen !== null) return;
    state.retracting = false;
    clearTimeout(state.retract); clearTimeout(state.liveT);
    el.latent.classList.remove('is-retracting');
    el.latent.classList.add('is-live');
    state.live = true;
    setMaskCenter(x, y);
    el.latent.style.setProperty('--patchR', '250px');
    el.latent.style.setProperty('--open', '0');
    el.latent.style.setProperty('--spread', '0.30');
    document.documentElement.dataset.tool = 'patch';
    state.patched = true;
  }

  function retract(force) {
    if (state.frozen !== null) return;
    if (state.open && !force) return;
    clearTimeout(state.retract); clearTimeout(state.liveT);
    if (!state.live) return;
    state.retracting = true;
    state.patched = false;
    document.documentElement.dataset.tool = 'off';
    el.latent.classList.add('is-retracting');
    el.latent.style.setProperty('--spread', '0');
    el.latent.style.setProperty('--open', '0');
    state.liveT = setTimeout(function () {
      el.latent.classList.remove('is-live', 'is-retracting', 'is-edge-hot');
      state.live = false;
      state.retracting = false;
      if (state.open) { state.open = null; el.box.innerHTML = ''; document.documentElement.dataset.core = '0'; paintLabels(); }
    }, RETRACT_MS + 60);
  }

  /* 指针挪开之后约 1.4 秒褪回灰 */
  function hotZone(x, y) {
    if (Math.hypot(x - geo.cx, y - geo.cy) < geo.R + 170) return true;
    if (x > geo.w - 170) return true;
    if (state.origin && Math.hypot(x - state.origin.x, y - state.origin.y) < 280) return true;
    return false;
  }

  /* ═══ 指针：跟随 / 停驻 ═══════════════════════════════════ */
  function onMove(e) {
    if (state.frozen !== null) return;
    var x = e.clientX, y = e.clientY;
    state.lastPointer = { x: x, y: y, known: true };

    var edge = x > geo.w - 150;
    el.latent.classList.toggle('is-edge-hot', edge);

    if (edge) {                       /* 常驻边缘痕：靠过来就显 */
      clearTimeout(state.dwell); clearTimeout(state.retract);
      if (state.open) return;
      develop({ x: x, y: y }, 300);
      return;
    }

    if (state.open) { clearTimeout(state.retract); return; }   /* 展开完成之后钉住 */

    if (state.live && !state.retracting && !state.patched) {
      if (hotZone(x, y)) { clearTimeout(state.retract); return; }
      if (!state.retract) state.retract = setTimeout(function () { state.retract = null; retract(false); }, 120);
      return;
    }

    /* 还没显影 / 正在褪：指针走过的地方先亮一小片 */
    patch(x, y);
    clearTimeout(state.dwell);
    if (state.dwellMs <= 0) return;      /* ?dwell=0：只看指针跟着走的那一小片 */
    state.dwell = setTimeout(function () {
      develop({ x: x, y: y }, 250);
      say('已显影');
    }, state.dwellMs);
  }

  function onLeave() {
    if (state.frozen !== null) return;
    clearTimeout(state.dwell);
    if (state.live) retract(false);
  }

  /* ═══ 快捷键 ═════════════════════════════════════════════ */
  function onKey(e) {
    if (state.frozen !== null) return;
    var tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') {
      if (e.key === 'Escape') { e.target.blur(); closeCore(); }
      return;
    }
    if (e.key === 'd' || e.key === 'D') {
      e.preventDefault();
      if (state.live) { retract(true); }
      else {
        var from = state.lastPointer.known && Math.hypot(state.lastPointer.x - geo.cx, state.lastPointer.y - geo.cy) > 90
          ? { x: state.lastPointer.x, y: state.lastPointer.y }
          : { x: geo.cx, y: geo.cy };
        develop(from, 300);
        say('已显影');
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      if (state.open) closeCore(); else retract(true);
    }
  }

  /* ═══ 节点 ═══════════════════════════════════════════════ */
  function onNode(tool) {
    if (!state.live) return;
    if (tool.core === null) {
      if (tool.id === 'home') { location.search = '?ctx=home'; }
      else if (tool.id === 'gate') { location.search = '?ctx=gate'; }
      return;
    }
    if (state.open === tool.id) { closeCore(); return; }
    openCore(tool.id, { x: tool._x, y: tool._y });
  }

  function openCore(id, from) {
    state.open = id;
    state.origin = from;
    state.retracting = false;
    assignWave(from.x, from.y);
    setMaskCenter(from.x, from.y);
    el.latent.classList.remove('is-retracting');
    el.latent.style.setProperty('--spread', '1');
    el.latent.style.setProperty('--open', '1');
    el.latent.style.setProperty('--patchR', '300px');
    el.latent.classList.add('is-live');
    state.live = true;
    state.patched = false;
    document.documentElement.dataset.tool = 'full';
    document.documentElement.dataset.core = '1';
    paintLabels();
    paintCore(id);
  }

  function closeCore() {
    if (!state.open) return;
    state.open = null;
    el.box.innerHTML = '';
    document.documentElement.dataset.core = '0';
    paintLabels();
    el.core.style.setProperty('--cdev', '1');
    say('已收起');
  }

  /* ═══ 展开：十二件工具各自的里面 ═════════════════════════ */
  function cdev() {
    el.core.style.setProperty('--cdev', '0');
    requestAnimationFrame(function () { el.core.style.setProperty('--cdev', '1'); });
  }

  function paintCore(id) {
    var dream = document.documentElement.dataset.face === 'dream';
    var h = '';
    if (id === 'find') {
      var q = P.state.q;
      var hits = allMatches(q);
      h += '<span class="core-h">' + (dream ? '寻 · SEEK' : '检索 · FIND') + '</span>';
      h += '<label class="core-find"><input type="search" id="findInput" autocomplete="off" spellcheck="false" placeholder="标题、描述、标签、正文、图注" value="' + esc(q) + '"></label>';
      h += '<p class="core-line">' + (q ? '对上 ' + hits.length + ' 笔 · 全站 ' + allItems().length + ' 笔' : '全站 ' + allItems().length + ' 笔') + '</p>';
      if (q) {
        h += '<div class="core-list">';
        if (!hits.length) h += '<p class="core-quiet">没有对上这一笔的字。</p>';
        hits.slice(0, 5).forEach(function (r) {
          h += '<button class="core-item" data-slug="' + r.it.slug + '" data-scene="' + r.scene + '">' +
            '<span class="core-item-t">' + esc(r.it.title) + '</span>' +
            '<span class="core-item-s">' + sceneShort(r.scene, dream) + '</span></button>';
        });
        h += '</div>';
      }
    } else if (id === 'view') {
      h += '<span class="core-h">' + (dream ? '观 · VIEW' : '视图 · VIEW') + '</span>';
      h += '<div class="core-scenes">';
      [['list', dream ? '列' : '列'], ['scatter', dream ? '散' : '散']].forEach(function (o) {
        h += '<button class="core-scene' + (state.view === o[0] ? ' is-on' : '') + '" data-view="' + o[0] + '">' +
          '<span class="core-scene-n">' + o[1] + '</span>' +
          '<span class="core-scene-b">' + (o[0] === 'list' ? 'LIST' : 'SCATTER') + '</span></button>';
      });
      h += '</div><p class="core-quiet">漫游与检索在原型里退成「列 / 散」两态。</p>';
    } else if (id === 'scene') {
      h += '<span class="core-h">' + (dream ? '境 · SCENE' : '场景 · SCENE') + '</span>';
      h += '<div class="core-scenes">';
      P.SCENE_ORDER.forEach(function (s) {
        var S = P.SCENES[s];
        h += '<button class="core-scene' + (P.state.scene === s ? ' is-on' : '') + '" data-scene="' + s + '">' +
          '<span class="core-scene-n">' + (dream ? S.dream : S.wake) + '</span>' +
          '<span class="core-scene-b mono">' + S.badge + '</span>' +
          '<span class="core-scene-c">' + P.listOf(s).length + ' ' + S.unit + '</span></button>';
      });
      h += '</div>';
    } else if (id === 'exits') {
      var about = P.D.about || {};
      h += '<span class="core-h">' + (dream ? '出口 · EXITS' : '出口 · EXITS') + '</span>';
      h += '<div class="core-links">';
      (about.links || []).forEach(function (l) {
        h += '<a href="' + esc(l.href) + '" target="_blank" rel="noopener">' + esc(l.label) + '</a>';
      });
      h += '<a href="/rss.xml">RSS</a>';
      h += '</div><p class="core-quiet">存在于此 · PRESENCE</p>';
    } else if (id === 'face') {
      h += '<span class="core-h">' + (dream ? '面 · FACE' : '面 · FACE') + '</span>';
      h += '<div class="core-hold"><div class="hold-ring" id="holdRing"></div>' +
        '<span class="hold-word">' + (dream ? '按住，回到醒处' : '按住，换到另一面') + '</span>' +
        '<button class="core-chip" id="holdBtn" type="button" style="padding:.5rem .9rem">按住</button></div>' +
        '<p class="core-quiet mono">' + (dream ? '1300ms' : '2200ms') + '</p>';
    } else if (id === 'sound') {
      var on = document.documentElement.dataset.sound === 'on';
      h += '<span class="core-h">' + (dream ? '回响 · ECHO' : '声 · SOUND') + '</span>';
      h += '<div class="core-set"><span>环境声</span>' +
        '<span class="core-seg"><button id="soundBtn" data-v="' + (on ? 'off' : 'on') + '" aria-pressed="' + on + '">' + (on ? '响着' : '静着') + '</button></span></div>';
      h += '<div class="core-wave" style="margin-top:.9rem"><i></i><i></i><i></i><i></i><i></i></div>';
      h += '<p class="core-quiet">阅读页整页电平退避，这里不退。</p>';
    } else if (id === 'contents') {
      var hs = P.headings();
      h += '<span class="core-h">' + (dream ? '存目 · CONTENTS' : '目录 · CONTENTS') + '</span>';
      h += '<div class="core-toc">';
      if (!hs.length) h += '<p class="core-quiet">这里还没有可列的节。</p>';
      hs.slice(0, 14).forEach(function (x) {
        h += '<button class="core-toc-item' + (x.level === 3 ? ' is-sub' : '') + '" data-toc="' + x.id + '" data-slug="' + (x.slug || '') + '">' + esc(x.text) + '</button>';
      });
      h += '</div>';
    } else if (id === 'reading') {
      h += '<span class="core-h">读 · READING</span>';
      h += '<div class="core-set"><span>字号</span><span class="core-seg">' +
        [['s', '小'], ['m', '中'], ['l', '大']].map(function (o) {
          return '<button data-size="' + o[0] + '" aria-pressed="' + (P.state.size === o[0]) + '">' + o[1] + '</button>';
        }).join('') + '</span></div>';
      h += '<div class="core-set"><span>行距</span><span class="core-seg">' +
        [['m', '常'], ['l', '疏']].map(function (o) {
          return '<button data-lead="' + o[0] + '" aria-pressed="' + (P.state.lead === o[0]) + '">' + o[1] + '</button>';
        }).join('') + '</span></div>';
      h += '<p class="core-quiet">阅读页立刻跟着走；别的语境里先记着。</p>';
    } else if (id === 'filter') {
      var tags = P.allTags(), months = P.allMonths();
      h += '<span class="core-h">' + (dream ? '筛 · FILTER' : '筛 · FILTER') + '</span>';
      h += '<div class="core-chips">';
      tags.forEach(function (t) {
        var n = countTag(t);
        h += '<button class="core-chip" data-tag="' + esc(t) + '" aria-pressed="' + (P.state.tags.indexOf(t) >= 0) + '">' + esc(t) + '<i>' + n + '</i></button>';
      });
      h += '</div><p class="core-line" style="margin-top:1rem">时间 · TIME</p><div class="core-chips">';
      months.forEach(function (m) {
        h += '<button class="core-chip" data-ym="' + m + '" aria-pressed="' + (P.state.ym === m) + '">' + m + '</button>';
      });
      h += '</div>';
    } else if (id === 'hour') {
      var p = P.progress();
      var marks = 24;
      h += '<span class="core-h">刻 · HOUR</span>';
      h += '<p class="core-clock mono" id="hourClock">' + P.clockText(p) + '</p>';
      h += '<p class="core-line" style="margin-top:.7rem">夜 · 23:07 → 06:31</p>';
      h += '<div class="core-scrub">';
      for (var i = 0; i < marks; i++) {
        h += '<button data-jump="' + (i / marks).toFixed(4) + '" aria-label="' + P.clockText(i / marks) + '" class="' + (i / marks <= p ? 'is-passed' : '') + '"></button>';
      }
      h += '</div><p class="core-quiet">点哪一枚，就落到那一处。</p>';
    }
    el.box.innerHTML = h;
    cdev();
    wireCore(id);
    say((dream ? '存目' : '已显影') + '：' + id);
  }

  function wireCore(id) {
    var b = el.box;
    if (id === 'find') {
      var input = b.querySelector('#findInput');
      if (input) {
        input.addEventListener('input', function () { P.setQuery(input.value); });
        setTimeout(function () { input.focus(); }, 40);
      }
    }
    if (id === 'view') {
      Array.prototype.forEach.call(b.querySelectorAll('[data-view]'), function (btn) {
        btn.addEventListener('click', function () {
          state.view = btn.dataset.view;
          document.documentElement.dataset.view = state.view;
          paintCore('view');
        });
      });
    }
    if (id === 'scene') {
      Array.prototype.forEach.call(b.querySelectorAll('[data-scene]'), function (btn) {
        btn.addEventListener('click', function () { P.setScene(btn.dataset.scene); });
      });
    }
    if (id === 'sound') {
      var sb = b.querySelector('#soundBtn');
      if (sb) sb.addEventListener('click', function () {
        var on = document.documentElement.dataset.sound === 'on';
        document.documentElement.dataset.sound = on ? 'off' : 'on';
        paintCore('sound');
      });
    }
    if (id === 'contents') {
      Array.prototype.forEach.call(b.querySelectorAll('[data-toc]'), function (btn) {
        btn.addEventListener('click', function () {
          var t = btn.dataset.toc;
          if (btn.dataset.slug) {
            var row = document.querySelector('.row[data-slug="' + btn.dataset.slug + '"]');
            if (row) { row.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
            P.go({ ctx: 'read', slug: btn.dataset.slug });
            return;
          }
          var target = document.getElementById(t);
          if (target) target.scrollIntoView({ block: 'start', behavior: 'smooth' });
        });
      });
    }
    if (id === 'reading') {
      Array.prototype.forEach.call(b.querySelectorAll('[data-size]'), function (btn) {
        btn.addEventListener('click', function () { P.setSize(btn.dataset.size); paintCore('reading'); });
      });
      Array.prototype.forEach.call(b.querySelectorAll('[data-lead]'), function (btn) {
        btn.addEventListener('click', function () { P.setLead(btn.dataset.lead); paintCore('reading'); });
      });
    }
    if (id === 'filter') {
      Array.prototype.forEach.call(b.querySelectorAll('[data-tag]'), function (btn) {
        btn.addEventListener('click', function () { P.setTag(btn.dataset.tag); });
      });
      Array.prototype.forEach.call(b.querySelectorAll('[data-ym]'), function (btn) {
        btn.addEventListener('click', function () { P.setMonth(btn.dataset.ym); });
      });
    }
    if (id === 'face') holdToFace();
    if (id === 'hour') {
      Array.prototype.forEach.call(b.querySelectorAll('[data-jump]'), function (btn) {
        btn.addEventListener('click', function () {
          var max = document.documentElement.scrollHeight - innerHeight;
          window.scrollTo({ top: parseFloat(btn.dataset.jump) * max, behavior: 'smooth' });
          paintCore('hour');
        });
      });
    }
    if (id === 'find') {
      Array.prototype.forEach.call(b.querySelectorAll('.core-item'), function (btn) {
        btn.addEventListener('click', function () {
          P.go({ ctx: 'grid', scene: btn.dataset.scene });
          var row = document.querySelector('.row[data-slug="' + btn.dataset.slug + '"]');
          if (row) row.scrollIntoView({ block: 'center', behavior: 'smooth' });
        });
      });
    }
  }

  /* 按住换面：2200ms / 1300ms，按住时那一圈自己显影出来 */
  function holdToFace() {
    var btn = el.box.querySelector('#holdBtn');
    var ring = el.box.querySelector('#holdRing');
    if (!btn || !ring) return;
    var dream = document.documentElement.dataset.face === 'dream';
    var need = dream ? 1300 : 2200;
    var t0 = 0, raf = 0;
    function step() {
      var p = Math.min(1, (performance.now() - t0) / need);
      ring.style.setProperty('--hold', p.toFixed(3));
      if (p >= 1) { finish(); return; }
      raf = requestAnimationFrame(step);
    }
    function finish() {
      cancelAnimationFrame(raf);
      ring.style.setProperty('--hold', '0');
      P.setFace(document.documentElement.dataset.face === 'dream' ? 'wake' : 'dream');
    }
    function down(e) {
      e.preventDefault();
      t0 = performance.now();
      btn.setAttribute('aria-pressed', 'true');
      raf = requestAnimationFrame(step);
    }
    function up() {
      cancelAnimationFrame(raf);
      btn.setAttribute('aria-pressed', 'false');
      ring.style.setProperty('--hold', '0');
    }
    btn.addEventListener('pointerdown', down);
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointerleave', up);
    btn.addEventListener('pointercancel', up);
  }

  /* ═══ 刻：进度与时刻 ═════════════════════════════════════ */
  function paintProgress() {
    var p = P.progress();
    var a = ang(p * TICKS);
    el.cursor.style.left = (geo.cx + geo.R * Math.sin(a)) + 'px';
    el.cursor.style.top = (geo.cy - geo.R * Math.cos(a)) + 'px';
    for (var i = 0; i < TICKS; i++) {
      var t = tickEls[i];
      if (!t) continue;
      var passed = i / TICKS <= p + 1e-6;
      if (t._passed !== passed) {
        t._passed = passed;
        t.classList.toggle('is-passed', passed);
      }
    }
    var clock = document.getElementById('hourClock');
    if (clock) clock.textContent = P.clockText(p);
  }

  /* ═══ 小工具 ═════════════════════════════════════════════ */
  function allItems() { return P.allItems(); }
  function allMatches(q) {
    if (!q) return [];
    return allItems().filter(function (r) { return P.matches(r.it, q); });
  }
  function countTag(t) {
    return allItems().filter(function (r) { return (r.it.tags || []).indexOf(t) >= 0; }).length;
  }
  function sceneShort(s, dream) {
    var S = P.SCENES[s];
    return dream ? S.dream : S.wake;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function say(t) { el.say.textContent = t; }

  /* ═══ 接线 ═══════════════════════════════════════════════ */
  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerleave', onLeave);
  document.addEventListener('keydown', onKey);
  window.addEventListener('resize', function () { layout(); });
  window.addEventListener('scroll', function () {
    if (state._sraf) return;
    state._sraf = requestAnimationFrame(function () { state._sraf = 0; paintProgress(); });
  }, { passive: true });

  el.latent.addEventListener('focusin', function () {
    if (state.frozen !== null || state.live) return;
    develop({ x: geo.cx, y: geo.cy }, 300);
  });

  /* ═══ 启动 ═══════════════════════════════════════════════ */
  var verb = qs.get('verb');
  layout();

  if (verb !== null) {
    var v = Math.max(0, Math.min(1, parseFloat(verb) || 0));
    state.frozen = v;
    el.latent.classList.add('is-frozen', 'is-live');
    state.live = true;
    el.latent.style.setProperty('--patchR', '0px');
    el.latent.style.setProperty('--open', '1');
    assignWave(geo.cx, geo.cy);
    setMaskCenter(geo.cx, geo.cy);
    el.latent.style.setProperty('--spread', String(v));
    document.documentElement.dataset.verb = String(v);
    document.documentElement.dataset.tool = v >= 0.85 ? 'full' : 'patch';
  }

  /* 换面 / 重新渲染之后，环上的字与里面都要跟上 */
  window.__l = {
    onRender: function () {
      paintLabels();
      if (state.open) paintCore(state.open);
      paintProgress();
    },
    TOOLS: TOOLS,
    geo: geo,
    state: state,
    nodeRect: function (id) {
      var k = TOOLS.map(function (t) { return t.id; }).indexOf(id);
      var n = nodeEls[k];
      var r = n.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), w: Math.round(r.width), h: Math.round(r.height) };
    },
    summon: function (how) {
      if (how === 'edge') {
        var x = geo.w - 42, y = Math.round(geo.h * 0.5);
        develop({ x: x, y: y }, 300);
      } else if (how === 'key') {
        develop({ x: geo.cx, y: geo.cy }, 300);
      } else if (how === 'patch') {
        clearTimeout(state.dwell);
        var p = state.lastPointer.known ? state.lastPointer : { x: geo.cx + 150, y: geo.cy - 210 };
        patch(p.x, p.y);
      } else {
        var q = state.lastPointer.known ? state.lastPointer : { x: geo.cx, y: geo.cy - 250 };
        develop({ x: q.x, y: q.y }, 250);
      }
      say('已显影');
    },
    retract: function () { retract(true); },
    forceRetract: function () {
      clearTimeout(state.retract); clearTimeout(state.liveT);
      state.open = null; el.box.innerHTML = ''; paintLabels();
      el.latent.classList.add('is-retracting');
      el.latent.style.setProperty('--spread', '0');
      el.latent.style.setProperty('--open', '0');
      state.retracting = true;
      state.liveT = setTimeout(function () {
        el.latent.classList.remove('is-live', 'is-retracting', 'is-edge-hot');
        document.documentElement.dataset.tool = 'off';
        state.live = false; state.retracting = false;
      }, RETRACT_MS + 60);
    },
    edgeHot: function (on) { el.latent.classList.toggle('is-edge-hot', !!on); },
    openNode: function (id) {
      var tool = TOOLS.filter(function (t) { return t.id === id; })[0];
      if (!tool || tool.core === null) return false;
      openCore(id, { x: tool._x, y: tool._y });
      return true;
    },
    closeCore: closeCore,
    setSpread: function (v) { el.latent.style.setProperty('--spread', String(v)); },
    setQuery: function (q) { P.setQuery(q); if (state.open === 'find') paintCore('find'); },
    coreRect: function () {
      var r = el.core.getBoundingClientRect();
      return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
    },
    /* 对比度探针：拿真实元素算出来的颜色，元素自己与祖先的 opacity 一起合成。
       mode='still' 量静置的画面（工具此刻潜着，本来就该看不见，不量）；
       mode='live' 量显影之后的工具。 */
    probe: function (mode) {
      var withTool = mode === 'live';
      var cs = getComputedStyle(document.documentElement);
      var bg = cs.getPropertyValue('--bg').trim();
      var out = [];
      function add(name, sel, kind, group) {
        var node = document.querySelector(sel);
        if (!node) return;
        var o = 1, n = node;
        while (n && n.nodeType === 1) {
          var v = parseFloat(getComputedStyle(n).opacity);
          if (!isNaN(v)) o *= v;
          n = n.parentElement;
        }
        var fg = mix(parse(getComputedStyle(node).color), parse(bg), o);
        out.push({ name: name, kind: kind, group: group || 'page', opacity: +o.toFixed(2), fg: rgb(fg), bg: bg, ratio: +contrast(fg, parse(bg)).toFixed(2) });
      }
      add('正文 · 条目标题', '.row-t', 'body');
      add('正文 · 条目描述', '.row-d', 'body');
      add('阅读 · 正文', '.read-body p', 'body');
      add('阅读 · 小节标题', '.read-body h2', 'body');
      add('主页 · 问句', '.home-q', 'body');
      add('主页 · 一句', '.home-line', 'body');
      add('门 · 说明', '.gate-note', 'body');
      add('小标签 · 条目日期', '.row-date', 'small');
      add('小标签 · 条目标签', '.row-tag', 'small');
      add('小标签 · 品牌行', '.brand-line', 'small');
      add('小标签 · 徽标', '.grid-badge', 'small');
      if (withTool) {
        add('工具 · 中文标签', '.node-cn', 'small', 'tool');
        add('工具 · 英文标签', '.node-en', 'small', 'tool');
        add('工具 · 核心小标', '.core-h', 'small', 'tool');
        add('工具 · 核心正文', '.core-item-t', 'small', 'tool');
      }
      return { bg: bg, stage: document.documentElement.dataset.tool || 'off', items: out };
    },
    ring: function () {
      return {
        cx: geo.cx, cy: geo.cy, R: geo.R, labelR: geo.labelR,
        coreW: geo.coreW, coreH: geo.coreH, mobile: geo.mobile,
        live: state.live, open: state.open, frozen: state.frozen
      };
    },
    /* 环上此刻的浓度分布：看一眼显影有没有先后 */
    densities: function () {
      return nodeEls.map(function (n, k) {
        var st = getComputedStyle(n);
        return { id: TOOLS[k].id, d: +st.getPropertyValue('--d'), dev: st.getPropertyValue('--devp').trim(), color: st.color };
      });
    },
  };

  function rgb(c) { return 'rgb(' + Math.round(c[0]) + ', ' + Math.round(c[1]) + ', ' + Math.round(c[2]) + ')'; }
  function mix(fg, bg, a) {
    if (!fg || !bg) return fg || bg || [0, 0, 0];
    var fa = fg.length > 3 ? fg[3] : 1;
    var k = a * fa;
    return [fg[0] * k + bg[0] * (1 - k), fg[1] * k + bg[1] * (1 - k), fg[2] * k + bg[2] * (1 - k)];
  }

  function contrast(a, b) {
    if (!a || !b) return 0;
    var la = lum(a), lb = lum(b);
    var hi = Math.max(la, lb), lo = Math.min(la, lb);
    return (hi + 0.05) / (lo + 0.05);
  }
  function parse(s) {
    s = (s || '').trim();
    var m = /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)$/.exec(s);
    if (m) return [+m[1] * 255, +m[2] * 255, +m[3] * 255, m[4] === undefined ? 1 : +m[4]];
    m = /rgba?\(([^)]+)\)/.exec(s);
    if (m) {
      var p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
      return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
    }
    m = /^#([0-9a-f]{6})$/i.exec(s);
    if (m) {
      var n = parseInt(m[1], 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
    }
    m = /^#([0-9a-f]{3})$/i.exec(s);
    if (m) {
      return [parseInt(m[1][0] + m[1][0], 16), parseInt(m[1][1] + m[1][1], 16), parseInt(m[1][2] + m[1][2], 16), 1];
    }
    return null;
  }
  function lum(c) {
    var v = c.map(function (x) { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  }

  paintProgress();
})();
