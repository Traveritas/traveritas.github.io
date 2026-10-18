/* ═══════════════════════════════════════════════════════════════
   潜影 latent · 画面（底子）
   四种语境共用同一批真内容：design/mocks/layout-plane/data.js
   这一层只负责「相纸上已经成像的那部分」；工具层是 latent.js。
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var D = window.PLANE_DATA || { articles: [], projects: [], moments: [], about: {} };
  var qs = new URLSearchParams(location.search);

  var SCENES = {
    essay: { key: 'essay', wake: '随笔', dream: '断章', badge: '可言说的 · SAYABLE', unit: '篇' },
    moment: { key: 'moment', wake: '瞬间', dream: '闪念', badge: '即逝的 · EPHEMERAL', unit: '则' },
    project: { key: 'project', wake: '项目', dream: '造物', badge: '可构造的 · BUILDABLE', unit: '项' },
  };
  var SCENE_ORDER = ['essay', 'moment', 'project'];

  var state = {
    ctx: qs.get('ctx') || 'home',
    face: qs.get('face') === 'dream' ? 'dream' : 'wake',
    scene: SCENES[qs.get('scene')] ? qs.get('scene') : 'essay',
    slug: qs.get('a') || 'co-creation-notes',
    q: qs.get('q') || '',
    tags: [],
    ym: null,        // 'YYYY-MM'
    size: 'm',
    lead: 'm',
  };

  var stage = document.getElementById('stage');
  var brandLine = document.getElementById('brandLine');
  var rowsHost = null;
  var rowEls = [];

  /* ── 取内容 ─────────────────────────────────────────────── */
  function listOf(scene) {
    if (scene === 'essay') return D.articles || [];
    if (scene === 'project') return D.projects || [];
    return D.moments || [];
  }
  function sceneOf(item) {
    if ((D.articles || []).indexOf(item) >= 0) return 'essay';
    if ((D.projects || []).indexOf(item) >= 0) return 'project';
    return 'moment';
  }
  function strip(html) {
    var d = document.createElement('div');
    d.innerHTML = html || '';
    return d.textContent || '';
  }
  function haystack(it) {
    var parts = [it.title, it.desc, it.text, it.status, strip(it.html)];
    if (it.tags) parts = parts.concat(it.tags);
    if (it.note) parts = parts.concat([it.note.awake, it.note.dream]);
    if (it.images) it.images.forEach(function (im) { parts.push(im.alt); });
    return parts.filter(Boolean).join(' \u00b7 ').toLowerCase();
  }
  function matches(it, q) {
    if (!q) return true;
    return haystack(it).indexOf(q.toLowerCase()) >= 0;
  }
  function tagMatches(it) {
    if (!state.tags.length) return true;
    var t = it.tags || [];
    return state.tags.some(function (x) { return t.indexOf(x) >= 0; });
  }
  function ymMatches(it) {
    if (!state.ym) return true;
    return String(it.date || '').slice(0, 7) === state.ym;
  }
  function visible(it) { return matches(it, state.q) && tagMatches(it) && ymMatches(it); }

  function allItems() {
    var out = [];
    SCENE_ORDER.forEach(function (s) {
      listOf(s).forEach(function (it) { out.push({ it: it, scene: s }); });
    });
    return out;
  }
  function allTags() {
    var seen = {}, out = [];
    SCENE_ORDER.forEach(function (s) {
      listOf(s).forEach(function (it) {
        (it.tags || []).forEach(function (t) { if (!seen[t]) { seen[t] = 1; out.push(t); } });
      });
    });
    return out;
  }
  function allMonths() {
    var seen = {}, out = [];
    SCENE_ORDER.forEach(function (s) {
      listOf(s).forEach(function (it) {
        var ym = String(it.date || '').slice(0, 7);
        if (ym && !seen[ym]) { seen[ym] = 1; out.push(ym); }
      });
    });
    return out.sort().reverse();
  }

  /* ── 进度与时刻（23:07 → 06:31）────────────────────────── */
  var NIGHT_START = 23 * 60 + 7;      // 1387
  var NIGHT_SPAN = 7 * 60 + 24;       // 444
  function progress() {
    var doc = document.documentElement;
    var max = Math.max(1, doc.scrollHeight - window.innerHeight);
    return Math.min(1, Math.max(0, (window.scrollY || doc.scrollTop || 0) / max));
  }
  function clockText(p) {
    var m = Math.round(NIGHT_START + p * NIGHT_SPAN) % 1440;
    var hh = Math.floor(m / 60), mm = m % 60;
    return (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
  }

  /* ── 渲染 ───────────────────────────────────────────────── */
  function render() {
    var html = document.documentElement;
    html.setAttribute('data-ctx', state.ctx);
    html.setAttribute('data-face', state.face);
    html.setAttribute('data-scene', state.scene);

    var face = state.face === 'dream';
    if (brandLine) brandLine.textContent = state.ctx.toUpperCase() + ' · ' + (face ? 'LATENT / DREAM' : 'LATENT / WAKE');

    stage.innerHTML = '';
    rowEls = [];
    rowsHost = null;

    if (state.ctx === 'home') renderHome(face);
    else if (state.ctx === 'grid') renderGrid(face);
    else if (state.ctx === 'read') renderRead(face);
    else if (state.ctx === 'gate') renderGate(face);
    else render404(face);

    document.title = titleFor() + ' — Traveritas';
    if (window.__l && window.__l.onRender) window.__l.onRender();
  }

  function titleFor() {
    if (state.ctx === 'home') return '醒梦';
    if (state.ctx === 'gate') return 'NEXUS';
    if (state.ctx === '404') return '找不到这一页';
    if (state.ctx === 'read') {
      var a = (D.articles || []).filter(function (x) { return x.slug === state.slug; })[0];
      return a ? a.title : '阅读';
    }
    var S = SCENES[state.scene];
    return state.face === 'dream' ? S.dream : S.wake;
  }

  function renderHome(face) {
    var about = D.about || {};
    var el = document.createElement('section');
    el.className = 'home';
    var ways = SCENE_ORDER.map(function (s) {
      var S = SCENES[s], n = listOf(s).length;
      return '<a class="way" href="?ctx=grid&scene=' + s + '">' +
        '<span class="way-n">' + (face ? S.dream : S.wake) + '</span>' +
        '<span class="way-b">' + S.badge + '</span>' +
        '<span class="way-c">' + n + ' ' + S.unit + '</span></a>';
    }).join('');
    el.innerHTML =
      '<h1 class="home-q">' + (about.question || '在即将醒来的那一瞬，世界究竟是在成形，还是正在融化？') + '</h1>' +
      '<p class="home-line">' + (about.line || '') + '</p>' +
      (face ? '<p class="home-dream">' + (about.dreamLine || '') + '</p>' : '') +
      '<div class="home-ways">' + ways + '</div>';
    stage.appendChild(el);
  }

  function renderGrid(face) {
    var S = SCENES[state.scene];
    var items = listOf(state.scene);

    var el = document.createElement('section');
    el.className = 'grid';
    el.innerHTML =
      '<div class="grid-head">' +
        '<h1 class="grid-name">' + (face ? S.dream : S.wake) + '</h1>' +
        '<span class="grid-badge">' + S.badge + '</span>' +
        '<span class="grid-count"></span>' +
      '</div><div class="grid-rule"></div><div class="rows"></div>';
    stage.appendChild(el);
    rowsHost = el.querySelector('.rows');

    /* 全都留在纸上：对上的显影，没对上的退成灰，谁也不消失 */
    items.forEach(function (it) { rowsHost.appendChild(rowFor(it, state.scene)); });
    paintRows();
  }

  function paintRows() {
    if (!rowsHost) return;
    var S = SCENES[state.scene];
    var n = 0;
    Array.prototype.forEach.call(rowsHost.querySelectorAll('.row'), function (row) {
      var it = findItem(row.dataset.scene, row.dataset.slug);
      var hit = it ? visible(it) : false;
      if (hit) n++;
      row.style.setProperty('--devp', hit ? '100%' : '20%');
    });
    var head = stage.querySelector('.grid-count');
    if (head) head.textContent = n + ' / ' + listOf(state.scene).length + ' ' + S.unit;
  }

  function findItem(scene, slug) {
    return listOf(scene).filter(function (x) { return x.slug === slug; })[0] || null;
  }

  function rowFor(it, scene) {
    var a = document.createElement('a');
    a.className = 'row';
    a.href = scene === 'essay' ? '?ctx=read&a=' + it.slug : '?ctx=grid&scene=' + scene;
    a.setAttribute('data-slug', it.slug);
    a.setAttribute('data-scene', scene);
    a.style.setProperty('--devp', '100%');
    var meta = [];
    meta.push('<span class="row-date mono">' + String(it.date || '').slice(0, 10) + '</span>');
    if (scene === 'essay') {
      meta.push('<span class="row-date">' + (it.chars || 0) + ' 字</span>');
      (it.tags || []).forEach(function (t) { meta.push('<span class="row-tag">' + t + '</span>'); });
    } else if (scene === 'project') {
      if (it.status) meta.push('<span class="row-tag">' + it.status + '</span>');
    } else {
      (it.tags || []).forEach(function (t) { meta.push('<span class="row-tag">' + t + '</span>'); });
      if (it.images && it.images.length) meta.push('<span class="row-tag">' + it.images.length + ' 图</span>');
    }
    var desc = it.desc || (it.text ? String(it.text).split('\n')[0] : '');
    a.innerHTML =
      '<span class="row-t">' + it.title + '</span>' +
      (desc ? '<span class="row-d">' + desc + '</span>' : '') +
      '<span class="row-m">' + meta.join('') + '</span>';
    return a;
  }

  function renderRead(face) {
    var a = (D.articles || []).filter(function (x) { return x.slug === state.slug; })[0] || (D.articles || [])[0];
    var el = document.createElement('article');
    el.className = 'read';
    if (!a) { el.innerHTML = '<p class="grid-empty">没有这一篇。</p>'; stage.appendChild(el); return; }
    var meta = ['<span class="mono">' + String(a.date || '').slice(0, 10) + '</span>',
      '<span>' + (a.chars || 0) + ' 字</span>']
      .concat((a.tags || []).map(function (t) { return '<span>' + t + '</span>'; }));
    el.innerHTML =
      '<header class="read-head"><h1 class="read-t">' + a.title + '</h1>' +
      '<div class="read-meta">' + meta.join('') + '</div></header>' +
      '<div class="read-body" id="readBody">' + (a.html || '') + '</div>';
    stage.appendChild(el);
  }

  function renderGate(face) {
    var el = document.createElement('section');
    el.className = 'gate';
    el.innerHTML =
      '<p class="gate-note">' + (face ? '“如果不能描述一个世界，那就建造一个。”' : '通往 NEXUS 的门。') + '</p>' +
      '<i class="gate-crystal"></i>' +
      '<div class="gate-line"></div>' +
      '<p class="gate-tag mono">NEXUS</p>';
    stage.appendChild(el);
  }

  function render404(face) {
    var el = document.createElement('section');
    el.className = 'lost';
    el.innerHTML =
      '<i class="lost-beacon"></i>' +
      '<p class="lost-code mono">ERR · 404 · OUT OF BOUNDS</p>' +
      '<p class="lost-line">' + (face
        ? '“世界在边缘处留白。尚未命名的风景，不会在此停留。”'
        : '线索到这里中断了：这一页如同被擦除的痕迹，曾在此处，但现在不在这里。') + '</p>' +
      '<a class="lost-back" href="?ctx=home">' + (face ? '退回最初的岸' : '返回主轴') + '</a>';
    stage.appendChild(el);
  }

  /* ── 目录：阅读页取 h2/h3，其余语境取本场景的条目 ───────── */
  function headings() {
    if (state.ctx === 'read') {
      var host = document.getElementById('readBody');
      if (!host) return [];
      return Array.prototype.map.call(host.querySelectorAll('h2, h3'), function (h, i) {
        h.id = h.id || 'h-' + i;
        return { id: h.id, level: h.tagName === 'H2' ? 2 : 3, text: h.textContent.replace(/^\s*\d+\s*/, '').trim(), el: h };
      });
    }
    return listOf(state.scene).map(function (it) {
      return { id: 'r-' + it.slug, level: 2, text: it.title, el: null, slug: it.slug };
    });
  }

  /* ── 对外 ───────────────────────────────────────────────── */
  var api = {
    D: D, SCENES: SCENES, SCENE_ORDER: SCENE_ORDER,
    state: state,
    listOf: listOf, allItems: allItems, allTags: allTags, allMonths: allMonths,
    matches: matches, visible: visible, sceneOf: sceneOf,
    headings: headings, progress: progress, clockText: clockText,
    render: render,
    setQuery: function (q) {
      state.q = q || '';
      if (state.ctx !== 'grid') { state.ctx = 'grid'; render(); return; }
      paintRows();
      if (window.__l && window.__l.onRender) window.__l.onRender();
    },
    setScene: function (s) {
      if (!SCENES[s]) return;
      state.scene = s;
      if (state.ctx === 'read' || state.ctx === 'gate' || state.ctx === '404' || state.ctx === 'home') state.ctx = 'grid';
      render();
    },
    setFace: function (f) {
      state.face = f === 'dream' ? 'dream' : 'wake';
      render();
    },
    setSize: function (v) { state.size = v; applyReading(); },
    setLead: function (v) { state.lead = v; applyReading(); },
    setTag: function (t) {
      var i = state.tags.indexOf(t);
      if (i >= 0) state.tags.splice(i, 1); else state.tags.push(t);
      if (state.ctx !== 'grid') state.ctx = 'grid';
      render();
    },
    setMonth: function (ym) {
      state.ym = state.ym === ym ? null : ym;
      if (state.ctx !== 'grid') state.ctx = 'grid';
      render();
    },
    clearFilters: function () { state.tags = []; state.ym = null; state.q = ''; render(); },
    go: function (patch) {
      Object.keys(patch).forEach(function (k) { state[k] = patch[k]; });
      render();
    },
  };

  var SIZE = { s: 0.9, m: 1, l: 1.16 };
  var LEAD = { m: 2.05, l: 2.5 };
  function applyReading() {
    var b = document.getElementById('readBody');
    if (!b) return;
    b.style.setProperty('--rs', SIZE[state.size] + 'rem');
    b.style.setProperty('--rl', String(LEAD[state.lead]));
  }

  window.__p = api;

  /* 阅读设置的落点：render 之后补一次 */
  var origRender = api.render;
  api.render = function () { origRender(); applyReading(); };
  window.__p.render = api.render;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  function boot() {
    if (state.ctx === 'read' || state.ctx === 'gate' || state.ctx === '404') { /* 保持 */ }
    else if (state.ctx === 'home') { /* 保持 */ }
    else state.ctx = 'grid';
    render();
  }
})();
