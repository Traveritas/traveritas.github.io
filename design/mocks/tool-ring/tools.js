/* ─────────────────────────────────────────────────────────────
   罗盘环 · 十二件工具
   每片瓣 = 一件工具。瓣分两档：
     broad（四片宽的，读面）· narrow（八片窄的，行止）
   每件工具一处 `where`：静息时是刻度，绽开后是瓣，靠近时张开它的花瓣玻璃。
   `kind: 'act'` 点下就成（靠近先显出它的面）；`kind: 'panel'` 点开瓣上的面。
   ───────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const S = () => window.__scene;

  /* 版块徽标（维特根斯坦命题边界） */
  const BADGE = {
    essay: ['可言说的', 'SAYABLE'],
    moment: ['即逝的', 'EPHEMERAL'],
    project: ['可构造的', 'BUILDABLE'],
    about: ['存在于此', 'PRESENCE'],
  };

  const SCENES = [
    { id: 'essay', cn: '随笔', dcn: '断章', en: 'ARTICLES' },
    { id: 'moment', cn: '瞬间', dcn: '闪念', en: 'MOMENTS' },
    { id: 'project', cn: '项目', dcn: '造物', en: 'PROJECTS' },
  ];

  const CONTEXTS = [
    { id: 'home', cn: '主页', dcn: '归处', en: 'HOME' },
    { id: 'grid', cn: '目录', dcn: '名录', en: 'INDEX' },
    { id: 'read', cn: '阅读', dcn: '展卷', en: 'READING' },
    { id: 'gate', cn: '门', dcn: '门', en: 'NEXUS' },
    { id: '404', cn: '失线', dcn: '断处', en: 'OUT OF BOUNDS' },
  ];

  /* a：瓣的方位角 —— 0 = 上，顺时针；四片宽的落在上下左右，八片窄的插在中间 */
  const TOOLS = [
    { id: 'find', cn: '检索', dcn: '寻', en: 'FIND', kind: 'panel', tier: 'broad', a: 0,
      note: '标题 · 描述 · 标签 · 正文' },
    { id: 'view', cn: '视图', dcn: '观', en: 'VIEW', kind: 'act', tier: 'narrow', a: 30 },
    { id: 'scene', cn: '场景', dcn: '境', en: 'SCENE', kind: 'act', tier: 'narrow', a: 60 },
    { id: 'filter', cn: '筛', dcn: '拣', en: 'FILTER', kind: 'panel', tier: 'broad', a: 90,
      note: '标签 · 年月' },
    { id: 'home', cn: '归处', dcn: '回', en: 'HOME', kind: 'act', tier: 'narrow', a: 120 },
    { id: 'gate', cn: '门', dcn: '门', en: 'NEXUS', kind: 'act', tier: 'narrow', a: 150 },
    { id: 'toc', cn: '目录', dcn: '章', en: 'CONTENTS', kind: 'panel', tier: 'broad', a: 180,
      note: '主刻度 h2 · 细刻度 h3' },
    { id: 'exits', cn: '出口', dcn: '离', en: 'EXITS', kind: 'panel', tier: 'narrow', a: 210 },
    { id: 'face', cn: '面', dcn: '翻面', en: 'SIDE', kind: 'act', tier: 'narrow', a: 240 },
    { id: 'read', cn: '读', dcn: '字', en: 'READING', kind: 'panel', tier: 'broad', a: 270,
      note: '字号 · 行距' },
    { id: 'sound', cn: '环境声', dcn: '回响', en: 'SOUND', kind: 'act', tier: 'narrow', a: 300 },
    { id: 'hour', cn: '刻', dcn: '漏', en: 'HOUR', kind: 'panel', tier: 'narrow', a: 330 },
  ];

  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  const label = (t) => (S().state.face === 'dream' ? t.dcn : t.cn);
  const sceneName = (id) => {
    const s = SCENES.find((x) => x.id === id) || SCENES[0];
    return S().state.face === 'dream' ? s.dcn : s.cn;
  };
  const ctxName = (id) => {
    const c = CONTEXTS.find((x) => x.id === id) || CONTEXTS[0];
    return S().state.face === 'dream' ? c.dcn : c.cn;
  };
  const badge = (id) => {
    const b = BADGE[id] || BADGE.about;
    return `<span class="badge">${b[0]}<i>${b[1]}</i></span>`;
  };

  /* ── 面板：十二张脸 ─────────────────────────────────────── */

  /* 面板的抬头：这一面叫这个名字，另一面在旁低声写一行 */
  function head(id) {
    const t = TOOLS.find((x) => x.id === id) || TOOLS[0];
    const dream = S().state.face === 'dream';
    const now = dream ? t.dcn : t.cn;
    const alt = dream ? t.cn : t.dcn;
    return `<div class="p-top"><span class="p-name">${esc(now)}${
      alt && alt !== now ? `<em class="p-alt">${esc(alt)}</em>` : ''
    }</span><span class="p-en mono">${t.en}</span></div>`;
  }

  function listOf(items, opts) {
    if (!items.length) return `<p class="p-note">${esc((opts && opts.empty) || '没有留下什么。')}</p>`;
    return `<div class="p-list">${items
      .map(
        (it) =>
          `<button type="button" class="p-item${it.sub ? ' is-sub' : ''}" data-go="${esc(it.id)}"${
            it.current ? ' aria-current="true"' : ''
          }><span class="d mono">${esc(it.d)}</span><span class="t">${esc(it.t)}</span></button>`,
      )
      .join('')}</div>`;
  }

  const panels = {
    /* 1 · 检索 */
    find() {
      const st = S().state;
      return {
        html:
          head('find') +
          `<div class="p-body">
            <div class="p-sec p-find"><label><span class="p-h">寻找 · 词</span>
              <input type="search" autocomplete="off" spellcheck="false" placeholder="标题、描述、标签或正文里的字" value="${esc(st.query)}">
            </label></div>
            <p class="p-count mono"><span class="n">${S().hits().length}</span><span>/ ${S().entries().length} · 全站</span></p>
            <div class="p-res"></div>
          </div>`,
        bind(root) {
          const input = root.querySelector('input');
          const res = root.querySelector('.p-res');
          const n = root.querySelector('.p-count .n');
          const paint = () => {
            const hits = S().hits();
            n.textContent = String(hits.length);
            res.innerHTML = listOf(
              hits.slice(0, 5).map((e) => ({ id: e.id, d: e.date.slice(5, 10), t: e.title, sub: e.kind !== 'article' })),
              { empty: '没有对得上的字。' },
            );
          };
          input.addEventListener('input', () => {
            S().setQuery(input.value);
            paint();
          });
          input.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter') return;
            const first = S().hits()[0];
            if (first) S().openEntry(first.id);
          });
          paint();
        },
      };
    },

    /* 2 · 视图 */
    view() {
      const v = S().state.view;
      return {
        html:
          head('view') +
          `<div class="p-body">
            <p class="p-note">同一批东西，两种看法。</p>
            <div class="p-set"><span>看法</span><span class="p-seg" data-key="view">
              <button type="button" data-v="roster" aria-pressed="${v === 'roster'}">名录</button>
              <button type="button" data-v="scatter" aria-pressed="${v === 'scatter'}">散落</button>
            </span></div>
          </div>`,
        bind(root) {
          root.querySelectorAll('[data-key="view"] button').forEach((b) =>
            b.addEventListener('click', () => S().setView(b.dataset.v)),
          );
        },
      };
    },

    /* 3 · 场景 */
    scene() {
      const cur = S().state.scene;
      return {
        html:
          head('scene') +
          `<div class="p-body">` +
          SCENES.map(
            (s) =>
              `<button type="button" class="p-act" data-scene="${s.id}" aria-pressed="${cur === s.id}">
                 <span class="k">${esc(S().state.face === 'dream' ? s.dcn : s.cn)}</span>
                 <span class="v mono">${esc(badge(s.id).replace(/<[^>]+>/g, ' ').trim())}</span>
               </button>`,
          ).join('') +
          `</div>`,
        bind(root) {
          root.querySelectorAll('[data-scene]').forEach((b) =>
            b.addEventListener('click', () => S().setScene(b.dataset.scene)),
          );
        },
      };
    },

    /* 4 · 归处 */
    home() {
      const st = S().state;
      return {
        html:
          head('filter') +
          `<div class="p-body">
            <p class="p-note">此刻在 ${esc(ctxName(st.ctx))}。</p>
            <button type="button" class="p-act" data-go-home><span class="k">回主页</span><span class="v mono">HOME</span></button>
          </div>`,
        bind(root) {
          root.querySelector('[data-go-home]').addEventListener('click', () => S().setCtx('home'));
        },
      };
    },

    /* 5 · 门 */
    gate() {
      return {
        html:
          head('home') +
          `<div class="p-body">
            <p class="p-note">一道可以走进去的切面。</p>
            <button type="button" class="p-act" data-go-gate><span class="k">去门</span><span class="v mono">NEXUS</span></button>
          </div>`,
        bind(root) {
          root.querySelector('[data-go-gate]').addEventListener('click', () => S().setCtx('gate'));
        },
      };
    },

    /* 6 · 出口 */
    exits() {
      return {
        html:
          head('gate') +
          `<div class="p-body">
            <a class="p-act" href="https://github.com/Traveritas/traveritas.github.io" target="_blank" rel="noopener"><span class="k">GitHub</span><span class="v mono">↗</span></a>
            <a class="p-act" href="/rss.xml" target="_blank" rel="noopener"><span class="k">RSS</span><span class="v mono">↗</span></a>
          </div>`,
        bind() {},
      };
    },

    /* 7 · 面 */
    face() {
      const f = S().state.face;
      return {
        html:
          head('toc') +
          `<div class="p-body">
            <div class="p-set"><span>面</span><span class="p-seg" data-key="face">
              <button type="button" data-v="wake" aria-pressed="${f === 'wake'}">醒</button>
              <button type="button" data-v="dream" aria-pressed="${f === 'dream'}">梦</button>
            </span></div>
            <p class="p-note" style="margin:.7rem 0 0">按住环心不放，也可以翻面。</p>
          </div>`,
        bind(root) {
          root.querySelectorAll('[data-key="face"] button').forEach((b) =>
            b.addEventListener('click', () => S().setFace(b.dataset.v)),
          );
        },
      };
    },

    /* 8 · 环境声 */
    sound() {
      const on = S().state.sound;
      return {
        html:
          head('exits') +
          `<div class="p-body">
            <div class="p-set"><span class="p-strings" aria-hidden="true"><i></i><i></i><i></i></span>
              <span class="p-seg" data-key="sound">
                <button type="button" data-v="on" aria-pressed="${on}">开</button>
                <button type="button" data-v="off" aria-pressed="${!on}">静</button>
              </span></div>
            <p class="p-note" style="margin:.7rem 0 0">${on ? '声音在底下流。' : '世界安静着。'}</p>
          </div>`,
        bind(root) {
          root.querySelectorAll('[data-key="sound"] button').forEach((b) =>
            b.addEventListener('click', () => S().setSound(b.dataset.v === 'on')),
          );
        },
      };
    },

    /* 9 · 目录 */
    toc() {
      const hs = S().headings();
      return {
        html:
          head('face') +
          `<div class="p-body">` +
          (hs.length
            ? listOf(hs.map((h) => ({ id: 'h:' + h.id, d: h.level === 2 ? '主' : '细', t: h.text, sub: h.level === 3 })))
            : `<p class="p-note">这一页没有小节。去阅读页，瓣上会长出刻度。</p>`) +
          `</div>`,
        bind(root) {
          root.querySelectorAll('[data-go]').forEach((b) =>
            b.addEventListener('click', () => S().jumpHeading(b.dataset.go.slice(2))),
          );
        },
      };
    },

    /* 10 · 读 */
    read() {
      const st = S().state;
      return {
        html:
          head('read') +
          `<div class="p-body">
            <div class="p-set"><span>字号</span><span class="p-seg" data-key="size">
              <button type="button" data-v="s" aria-pressed="${st.size === 's'}">小</button>
              <button type="button" data-v="m" aria-pressed="${st.size === 'm'}">中</button>
              <button type="button" data-v="l" aria-pressed="${st.size === 'l'}">大</button>
            </span></div>
            <div class="p-set"><span>行距</span><span class="p-seg" data-key="lead">
              <button type="button" data-v="m" aria-pressed="${st.lead === 'm'}">常</button>
              <button type="button" data-v="l" aria-pressed="${st.lead === 'l'}">疏</button>
            </span></div>
            <p class="p-note" style="margin:.7rem 0 0">正文 34em，两端对齐。</p>
          </div>`,
        bind(root) {
          root.querySelectorAll('[data-key="size"] button').forEach((b) =>
            b.addEventListener('click', () => S().setSize(b.dataset.v)),
          );
          root.querySelectorAll('[data-key="lead"] button').forEach((b) =>
            b.addEventListener('click', () => S().setLead(b.dataset.v)),
          );
        },
      };
    },

    /* 11 · 筛 */
    filter() {
      const st = S().state;
      const tags = S().allTags();
      const years = S().allYears();
      return {
        html:
          head('sound') +
          `<div class="p-body">
            <div class="p-sec"><span class="p-h">标签 · TAGS</span>
              <div class="p-chips" data-key="tags">${tags
                .map(
                  (t) =>
                    `<button type="button" class="p-chip" data-t="${esc(t)}" aria-pressed="${st.tags.includes(t)}">${esc(t)}</button>`,
                )
                .join('')}</div></div>
            <div class="p-sec"><span class="p-h">年月 · TIME</span>
              <div class="p-chips" data-key="years">${years
                .map(
                  (y) =>
                    `<button type="button" class="p-chip mono" data-y="${esc(y)}" aria-pressed="${st.years.includes(y)}">${esc(y)}</button>`,
                )
                .join('')}</div></div>
            <p class="p-count mono"><span>${S().hits().length}</span><span>/ ${S().entries().length}</span></p>
            <div class="p-res"></div>
          </div>`,
        bind(root) {
          const res = root.querySelector('.p-res');
          const paint = () => {
            res.innerHTML = listOf(
              S().hits().slice(0, 4).map((e) => ({ id: e.id, d: e.date.slice(5, 10), t: e.title, sub: e.kind !== 'article' })),
              { empty: '这一档里没有东西。' },
            );
            res.querySelectorAll('[data-go]').forEach((b) =>
              b.addEventListener('click', () => S().openEntry(b.dataset.go)),
            );
            const c = root.querySelector('.p-count span');
            if (c) c.textContent = String(S().hits().length);
          };
          root.querySelectorAll('[data-key="tags"] .p-chip').forEach((b) =>
            b.addEventListener('click', () => {
              S().toggleTag(b.dataset.t);
              b.setAttribute('aria-pressed', String(S().state.tags.includes(b.dataset.t)));
              paint();
            }),
          );
          root.querySelectorAll('[data-key="years"] .p-chip').forEach((b) =>
            b.addEventListener('click', () => {
              S().toggleYear(b.dataset.y);
              b.setAttribute('aria-pressed', String(S().state.years.includes(b.dataset.y)));
              paint();
            }),
          );
          paint();
        },
      };
    },

    /* 12 · 刻 */
    hour() {
      const c = S().clock();
      return {
        html:
          head('hour') +
          `<div class="p-body">
            <div class="p-clock mono"><span class="t">${c.hhmm}</span><span class="st">${esc(c.stage)} · ${esc(c.wave)}</span></div>
            <p class="p-note" style="margin:.35rem 0 0">一夜 444 分 · 此刻 ${Math.round(c.p * 100)}%</p>
            <div class="p-marks" data-key="marks">${c.marks
              .map(
                (m) =>
                  `<button type="button" class="p-mark" data-p="${m.p}">${esc(m.t)} · ${esc(m.hhmm)}</button>`,
              )
              .join('')}</div>
          </div>`,
        bind(root) {
          root.querySelectorAll('[data-key="marks"] .p-mark').forEach((b) =>
            b.addEventListener('click', () => S().scrollTo(Number(b.dataset.p))),
          );
        },
      };
    },
  };

  /* 首行的名字：醒 / 梦各一 */
  function titleOf(t) {
    return S().state.face === 'dream' ? t.dcn : t.cn;
  }

  window.RING = { TOOLS, SCENES, CONTEXTS, BADGE, panels, esc, label, titleOf, sceneName, ctxName, badge };
})();
