// ../../../src/scripts/lib.ts
var clamp = (v, a, b) => Math.min(Math.max(v, a), b);
var reducedMotion = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16)
  ];
}

// ../../../src/data/bgm-assets.ts
var BGM_VERSION = "1ef0c0ea";
var OPEN_SEAM = 25.4545625;

// chrome/reality-shim.ts
var ACCENT = {
  "--amber": [hexToRgb("#9a86c4"), hexToRgb("#a7b1ba")],
  "--umber": [hexToRgb("#4f4a66"), hexToRgb("#556270")],
  "--ghost-ink": [hexToRgb("#817ba3"), hexToRgb("#8e9aa6")],
  "--dream": [hexToRgb("#9389ae"), hexToRgb("#a39c92")]
};
var mixRgb = (a, b, t) => `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`;
var reality = "dream";
var c = 0;
var listeners = [];
var mixListeners = [];
var flipper = null;
function setTint(t) {
  c = t;
  const d = document.documentElement;
  for (const k in ACCENT) d.style.setProperty(k, mixRgb(ACCENT[k][0], ACCENT[k][1], t));
  d.style.setProperty("--reality-mix", t.toFixed(3));
  for (const fn of mixListeners) fn();
}
function setFace(r) {
  reality = r;
  document.body.dataset.reality = r;
  for (const fn of listeners) fn(r);
}
function setMix(t) {
  if (Math.abs(t - c) > 5e-4) setTint(t);
}
function setFlipper(fn) {
  flipper = fn;
}
function onRealityChange(fn) {
  listeners.push(fn);
  fn(reality);
}
function getReality() {
  return reality;
}
function flipFrom(x, y) {
  flipper?.(x, y);
}
function wakeMix() {
  return c;
}

// ../../../src/scripts/sound.ts
var FORMS = ["wake", "dream"];
var DIR = "/audio";
var STORE_KEY = "xm-sound";
var url = (key) => `${DIR}/${key}.mp3?v=${BGM_VERSION}`;
var FADE_IN = 1.1;
var FADE_OUT = 1;
var OFF_RESET_MS = 1e4;
var LATE_GLIDE = 0.8;
var MIX_POLL = 140;
var MIX_TAU = 0.14;
var HIDDEN_DUCK = 0.22;
var HIDDEN_TAU = 1.2;
var HEAD_ROOM = 0.94;
var READING_TRIM_DB = -5;
var curve = (v) => v * v;
var LEVEL_DEFAULT = { bgm: 0.8, voice: 1, fx: 0.8 };
var LEVEL_TAU = 0.06;
var MIX_KEY = "xm-mix";
var CHANNELS = ["bgm", "voice", "fx"];
var ctx = null;
var master = null;
var scene = null;
var headroom = null;
var bedGain = null;
var gOpen = null;
var chain = {};
var buffers = /* @__PURE__ */ new Map();
var inflight = /* @__PURE__ */ new Map();
var openSrc = null;
var openForm = "dream";
var openAt = null;
var bedAtCtx = null;
var bedPhase = 0;
var epoch = null;
var offAt = null;
var on = false;
var mixWanted = 0;
var mixApplied = 0;
var duckDepth = 0;
var hidden = false;
var pollTimer = 0;
var els = [];
var levels = { bgm: 0, voice: 0, fx: 0 };
var lastLevels = {};
var levelSubs = /* @__PURE__ */ new Set();
var voiceGain = null;
var storedDurs = {};
var pageGain = 1;
var mod = (a, b) => (a % b + b) % b;
var now = () => ctx ? ctx.currentTime : 0;
var arcNow = () => epoch === null ? 0 : (Date.now() - epoch) / 1e3;
var buf = (form, seg) => buffers.get(`${form}-${seg}`);
var durOf = (seg, form) => buf(form, seg)?.duration ?? storedDurs[seg] ?? Infinity;
var openDur = () => Math.min(...FORMS.map((f) => durOf("open", f)));
var loopDur = () => Math.min(...FORMS.map((f) => durOf("loop", f)));
function load(form, seg) {
  const key = `${form}-${seg}`;
  const got = buffers.get(key);
  if (got) return Promise.resolve(got);
  const flying = inflight.get(key);
  if (flying) return flying;
  const p = (async () => {
    if (!ctx) return null;
    const res = await fetch(url(key));
    if (!res.ok) throw new Error(`${key}: HTTP ${res.status}`);
    const decoded = await ctx.decodeAudioData(await res.arrayBuffer());
    buffers.set(key, decoded);
    if (seg === "loop") peaks.set(key, peakOf(decoded));
    if (seg === "open" || seg === "loop") {
      const cur = storedDurs[seg];
      if (!cur || decoded.duration < cur) {
        storedDurs[seg] = decoded.duration;
        persist();
      }
    }
    measureHeadroom();
    ensureBed();
    return decoded;
  })().catch((e) => {
    console.warn("[sound]", e);
    return null;
  }).finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, p);
  return p;
}
var peaks = /* @__PURE__ */ new Map();
function peakOf(b) {
  let p = 0;
  for (let c2 = 0; c2 < b.numberOfChannels; c2++) {
    const d = b.getChannelData(c2);
    for (let i = 0; i < d.length; i++) {
      const a = d[i] < 0 ? -d[i] : d[i];
      if (a > p) p = a;
    }
  }
  return p;
}
function measureHeadroom() {
  const pw = peaks.get("wake-loop");
  const pd = peaks.get("dream-loop");
  const known = Math.max(pw ?? 0, pd ?? 0);
  const a = pw ?? known;
  const b = pd ?? known;
  let depth = 0;
  for (let k = 0; k <= 32; k++) {
    const m = k / 32;
    const sum = Math.sin(m * Math.PI / 2) * a + Math.cos(m * Math.PI / 2) * b;
    const s = Math.sin(Math.PI * m);
    if (sum > HEAD_ROOM && s > 1e-3) depth = Math.max(depth, (sum - HEAD_ROOM) / (sum * s));
  }
  duckDepth = Math.min(0.6, depth);
}
function buildGraph() {
  if (!ctx || master) return;
  master = ctx.createGain();
  headroom = ctx.createGain();
  bedGain = ctx.createGain();
  gOpen = ctx.createGain();
  master.gain.value = 0;
  headroom.gain.value = 1;
  bedGain.gain.value = 1;
  gOpen.gain.value = 0;
  for (const f of FORMS) {
    const g = ctx.createGain();
    g.gain.value = 0;
    g.connect(bedGain);
    chain[f] = { gain: g, src: null };
  }
  bedGain.connect(headroom);
  gOpen.connect(headroom);
  headroom.connect(master);
  scene = ctx.createGain();
  scene.gain.value = sceneHub.level;
  master.connect(scene);
  scene.connect(ctx.destination);
  ctx.addEventListener("statechange", () => {
    paint();
    if (on && ctx?.state === "suspended") armUnlock();
  });
  voiceGain = ctx.createGain();
  voiceGain.gain.value = curve(levels.voice);
  voiceGain.connect(ctx.destination);
}
var SCENE_TAU = 0.12;
var G = globalThis;
var sceneHub = G.__xmScene ??= { level: 1, apply: null };
sceneHub.apply = () => {
  if (ctx && scene) scene.gain.setTargetAtTime(sceneHub.level, now(), SCENE_TAU);
};
var voiceBufs = /* @__PURE__ */ new Map();
var voiceSrc = null;
var voicePool = [];
var voiceWarming = false;
function voiceReady() {
  return levels.voice > 0 && !!ctx && ctx.state === "running";
}
function loadVoice(c2, src) {
  let p = voiceBufs.get(src);
  if (!p) {
    p = fetch(src).then((r) => r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))).then((b) => c2.decodeAudioData(b)).catch(() => {
      voiceBufs.delete(src);
      return null;
    });
    voiceBufs.set(src, p);
  }
  return p;
}
function preloadVoice(src) {
  if (voiceReady() && ctx) void loadVoice(ctx, src);
}
function warmVoices() {
  if (voiceWarming || !ctx || levels.voice === 0 || !voicePool.length) return;
  const net = navigator.connection;
  if (net?.saveData) return;
  const c2 = ctx;
  voiceWarming = true;
  const run = (i) => {
    if (i >= voicePool.length || levels.voice === 0 || ctx !== c2) {
      voiceWarming = false;
      return;
    }
    void loadVoice(c2, voicePool[i]).then(() => run(i + 1));
  };
  const ric = window.requestIdleCallback;
  if (ric) ric(() => run(0), { timeout: 2e3 });
  else setTimeout(() => run(0), 1200);
}
function prefetchVoices(srcs) {
  voicePool = srcs;
  if (levels.voice === 0) return;
  warmVoices();
  if (!voiceWarming) void ensureCtx().then(() => warmVoices());
}
async function playVoice(src, maxWaitMs = Infinity) {
  if (!voiceReady() || !ctx) return null;
  const c2 = ctx;
  const loading = loadVoice(c2, src);
  let timer = 0;
  const b = maxWaitMs === Infinity ? await loading : await Promise.race([
    loading,
    new Promise((r) => {
      timer = window.setTimeout(() => r(null), maxWaitMs);
    })
  ]);
  clearTimeout(timer);
  if (!b || !voiceReady() || !ctx) return null;
  stopVoice();
  const s = ctx.createBufferSource();
  s.buffer = b;
  s.connect(voiceGain ?? ctx.destination);
  const at = now() + 0.04;
  s.start(at);
  s.onended = () => {
    if (voiceSrc === s) voiceSrc = null;
  };
  voiceSrc = s;
  return { delayMs: (at - now()) * 1e3, stop: () => s === voiceSrc && stopVoice() };
}
function stopVoice() {
  if (!voiceSrc || !ctx) return;
  try {
    voiceSrc.stop();
  } catch {
  }
  voiceSrc = null;
}
function applyMix(m, tau = MIX_TAU) {
  const w = chain.wake;
  const d = chain.dream;
  if (!ctx || !w || !d || !headroom) return;
  const t = now();
  w.gain.gain.setTargetAtTime(Math.sin(m * Math.PI / 2), t, tau);
  d.gain.gain.setTargetAtTime(Math.cos(m * Math.PI / 2), t, tau);
  headroom.gain.setTargetAtTime(
    (1 - duckDepth * Math.sin(Math.PI * m)) * (hidden ? HIDDEN_DUCK : 1),
    t,
    tau
  );
}
function availableMix(m) {
  const want = m >= 0.5 ? "wake" : "dream";
  const other = want === "wake" ? "dream" : "wake";
  if (chain[want]?.src || !chain[other]?.src) return m;
  return want === "wake" ? 0 : 1;
}
function setMix2(m) {
  const applied = availableMix(m);
  mixApplied = applied;
  applyMix(applied, applied === m ? MIX_TAU : LATE_GLIDE);
}
function startLoop(form, at, offset) {
  const c2 = chain[form];
  const b = buf(form, "loop");
  if (!ctx || !c2 || !b) return;
  stopLoop(form);
  const src = ctx.createBufferSource();
  src.buffer = b;
  src.loop = true;
  src.loopStart = 0;
  src.loopEnd = b.duration;
  src.connect(c2.gain);
  src.start(at, mod(offset, b.duration));
  c2.src = src;
  paint();
}
function stopLoop(form) {
  const c2 = chain[form];
  if (!c2?.src) return;
  const src = c2.src;
  c2.src = null;
  try {
    src.stop();
  } catch {
  }
  src.disconnect();
  paint();
}
function ensureBed() {
  if (!ctx || bedAtCtx === null) return;
  for (const f of FORMS) {
    if (chain[f]?.src || !buf(f, "loop")) continue;
    const at = Math.max(bedAtCtx, now() + 0.06);
    startLoop(f, at, bedPhase + Math.max(0, at - bedAtCtx));
  }
}
function anchorBed(at, arcPos) {
  epoch = Date.now() + (at - now()) * 1e3 - arcPos * 1e3;
  bedPhase = Math.max(0, arcPos - openDur());
  persist();
}
function startFromArc() {
  if (!ctx || !gOpen) return;
  const a = arcNow();
  const od = openDur();
  if (Number.isFinite(od) && a < od && !openSrc) {
    const b = buf(getReality(), "open");
    if (b) {
      openForm = getReality();
      for (const f of FORMS) stopLoop(f);
      const at = now() + 0.06;
      const src = ctx.createBufferSource();
      src.buffer = b;
      src.connect(gOpen);
      src.start(at, a);
      openAt = { ctx: at, offset: a };
      src.onended = () => {
        if (openSrc === src) {
          openSrc = null;
          openAt = null;
        }
      };
      openSrc = src;
      paint();
      gOpen.gain.cancelScheduledValues(at);
      gOpen.gain.setValueAtTime(0, at);
      gOpen.gain.linearRampToValueAtTime(1, at + FADE_IN);
      bedPhase = 0;
      bedAtCtx = at + (od - a);
      ensureBed();
      return;
    }
  }
  const off = Number.isFinite(od) && Number.isFinite(loopDur()) ? a - od : 0;
  bedPhase = 0;
  bedAtCtx = now() + 0.06 - off;
  ensureBed();
}
function stopOpen(fade, stopAt = now()) {
  const src = openSrc;
  if (!ctx || !gOpen || !src) return;
  openSrc = null;
  openAt = null;
  const t = now();
  gOpen.gain.cancelScheduledValues(t);
  if (fade > 0) {
    gOpen.gain.setTargetAtTime(0, t, Math.max(0.05, fade / 3));
    src.stop(stopAt + fade * 2);
  } else {
    src.stop(stopAt);
  }
  setTimeout(() => src.disconnect(), Math.max(0, stopAt - t) * 1e3 + fade * 2e3 + 300);
}
async function startPlayback() {
  if (!ctx) return;
  const form = getReality();
  void load(form, "loop");
  if (arcNow() < openDur()) await load(form, "open");
  else await load(form, "loop");
  if (!on || !ctx) return;
  mixWanted = mixApplied = form === "wake" ? 1 : 0;
  const t = now();
  master?.gain.cancelScheduledValues(t);
  master?.gain.setTargetAtTime(pageGain * curve(levels.bgm), t, FADE_IN / 3);
  bedGain?.gain.cancelScheduledValues(t);
  bedGain?.gain.setTargetAtTime(1, t, 0.2);
  applyMix(mixApplied, 0.4);
  startFromArc();
  startPoll();
  prefetchRest();
  paint();
}
function haltPlayback() {
  stopPoll();
  if (!ctx) return;
  stopOpen(0.4);
  const t = now();
  master?.gain.cancelScheduledValues(t);
  master?.gain.setTargetAtTime(0, t, FADE_OUT / 3);
  setTimeout(
    () => {
      if (on) return;
      for (const f of FORMS) stopLoop(f);
      bedAtCtx = null;
      suspendIfIdle();
    },
    FADE_OUT * 2e3 + 250
  );
}
var RESUME_WAIT_MS = 600;
function settleResume(c2) {
  return new Promise((done) => {
    let fin = false;
    const end = () => {
      if (fin) return;
      fin = true;
      clearTimeout(timer);
      c2.removeEventListener("statechange", onState);
      done();
    };
    const onState = () => {
      if (c2.state === "running") end();
    };
    const timer = window.setTimeout(end, RESUME_WAIT_MS);
    c2.addEventListener("statechange", onState);
    c2.resume().then(end, end);
  });
}
async function ensureCtx() {
  if (!ctx) {
    ctx = new AudioContext();
    buildGraph();
  }
  if (ctx.state !== "running") await settleResume(ctx);
  return ctx.state === "running";
}
function suspendIfIdle() {
  if (!on && levels.voice === 0) ctx?.suspend().catch(() => {
  });
}
async function turnOn() {
  on = true;
  if (offAt !== null && Date.now() - offAt > OFF_RESET_MS) {
    epoch = Date.now();
    bedAtCtx = null;
  }
  offAt = null;
  persist();
  if (!await ensureCtx()) {
    on = false;
    armUnlock();
    persist();
    paint();
    return;
  }
  if (!on || levels.bgm === 0) return;
  paint();
  if (epoch === null) epoch = Date.now();
  await startPlayback();
}
function turnOff() {
  on = false;
  offAt = Date.now();
  persist();
  paint();
  haltPlayback();
}
var unlockArmed = false;
var unlockRetries = 0;
function armUnlock() {
  if (unlockArmed) return;
  unlockArmed = true;
  const evs = ["pointerup", "keydown", "touchend"];
  const go = () => {
    for (const e of evs) removeEventListener(e, go, true);
    unlockArmed = false;
    if (levels.bgm > 0 && !on) void turnOn();
    else if (on) void ensureCtx().then(paint);
    if (levels.voice > 0) void ensureCtx().then((ok) => ok ? warmVoices() : null).then(paint);
  };
  for (const e of evs) addEventListener(e, go, true);
  const ua = navigator.userActivation;
  if (ua?.hasBeenActive && unlockRetries < 3) {
    unlockRetries++;
    setTimeout(() => {
      if (unlockArmed) go();
    }, 120);
  }
}
function getLevel(ch) {
  return levels[ch];
}
function isLive(ch) {
  return levels[ch] > 0;
}
function isSounding(ch) {
  const running = !!ctx && ctx.state === "running";
  if (ch === "bgm") {
    const sounding = !!openSrc || !!chain.wake?.src || !!chain.dream?.src;
    return on && running && sounding;
  }
  return levels[ch] > 0 && running;
}
function onLevels(cb) {
  levelSubs.add(cb);
  return () => levelSubs.delete(cb);
}
function rememberLevel(ch, v) {
  if (v > 0) {
    lastLevels[ch] = v;
    saveLevels();
  }
}
function setLevel(ch, value) {
  const v = value < 0.01 ? 0 : Math.min(1, value);
  const prev = levels[ch];
  if (v === prev) return;
  levels[ch] = v;
  if (v > 0) lastLevels[ch] = v;
  saveLevels();
  if (ch === "bgm") {
    if (v > 0 && !on) void turnOn();
    else if (v === 0 && on) turnOff();
    else if (on && master) master.gain.setTargetAtTime(pageGain * curve(v), now(), LEVEL_TAU);
  } else if (ch === "voice") {
    if (v > 0) {
      void ensureCtx().then((ok) => {
        if (!ok) return armUnlock();
        voiceGain?.gain.setTargetAtTime(curve(levels.voice), now(), LEVEL_TAU);
        warmVoices();
        paint();
        if (prev === 0 && levels.voice > 0) dispatchEvent(new CustomEvent("xm:ave", { detail: { name: "voice-on" } }));
      });
    } else {
      stopVoice();
      if (voiceGain) voiceGain.gain.setTargetAtTime(0, now(), LEVEL_TAU);
      suspendIfIdle();
    }
  }
  paint();
}
function toggleLevel(ch) {
  if (levels[ch] > 0) {
    lastLevels[ch] = levels[ch];
    setLevel(ch, 0);
  } else setLevel(ch, lastLevels[ch] || LEVEL_DEFAULT[ch]);
}
function saveLevels() {
  try {
    localStorage.setItem(MIX_KEY, JSON.stringify({ ...levels, last: lastLevels }));
  } catch {
  }
}
function loadLevels() {
  try {
    const rec = JSON.parse(localStorage.getItem(MIX_KEY) ?? "null");
    if (!rec) return;
    const ok = (x) => typeof x === "number" && x >= 0 && x <= 1;
    for (const c2 of CHANNELS) {
      if (ok(rec[c2])) levels[c2] = rec[c2];
      if (ok(rec.last?.[c2])) lastLevels[c2] = rec.last[c2];
    }
  } catch {
  }
}
function prefetchRest() {
  const later = () => {
    for (const f of FORMS) void load(f, "loop");
  };
  const ric = window.requestIdleCallback;
  if (ric) ric(later, { timeout: 2500 });
  else setTimeout(later, 1500);
  setTimeout(later, 3e3);
}
function startPoll() {
  stopPoll();
  pollTimer = setInterval(() => {
    if (!ctx || !on || ctx.state !== "running") return;
    ensureBed();
    const m = clamp(wakeMix(), 0, 1);
    if (Math.abs(m - mixWanted) > 8e-3) {
      mixWanted = m;
      setMix2(m);
    }
    if (openSrc && Math.abs(mixWanted - (openForm === "wake" ? 1 : 0)) > 0.55) {
      const at = now() + 0.5;
      const pos = openAt ? openAt.offset + (at - openAt.ctx) : arcNow();
      if (pos < OPEN_SEAM) {
        stopOpen(0.45);
        anchorBed(at, openDur());
      } else {
        stopOpen(0, at);
        anchorBed(at, openDur() + mod(pos - OPEN_SEAM, loopDur()));
      }
      for (const f of FORMS) stopLoop(f);
      bedAtCtx = at;
      ensureBed();
      persist();
    }
  }, MIX_POLL);
}
function stopPoll() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = 0;
}
function persist() {
  if (epoch === null) return;
  const rec = { on, epoch };
  if (offAt !== null) rec.offAt = offAt;
  if (storedDurs.open || storedDurs.loop) {
    rec.durs = { open: storedDurs.open, loop: storedDurs.loop };
  }
  try {
    sessionStorage.setItem(STORE_KEY, JSON.stringify(rec));
  } catch {
  }
}
function paint() {
  if (CHANNELS.some(isLive)) document.documentElement.dataset.sound = "on";
  else delete document.documentElement.dataset.sound;
  for (const b of els) b.setAttribute("aria-pressed", on ? "true" : "false");
  for (const cb of levelSubs) cb();
}
function initSound() {
  els = [...document.querySelectorAll("[data-sound-toggle]")];
  hidden = document.hidden;
  pageGain = document.body.dataset.bgm === "reading" ? 10 ** (READING_TRIM_DB / 20) : 1;
  loadLevels();
  for (const b of els) b.addEventListener("click", () => toggleLevel("bgm"));
  document.addEventListener("visibilitychange", () => {
    hidden = document.hidden;
    if (ctx && on) applyMix(mixApplied, HIDDEN_TAU);
  });
  addEventListener("pagehide", persist);
  if (false) {
    let probeNode = null;
    window.__sound = {
      state: () => ({
        on,
        levels: { ...levels },
        ctx: ctx?.state ?? null,
        arc: +arcNow().toFixed(2),
        mix: +mixApplied.toFixed(3),
        duck: +duckDepth.toFixed(3),
        loaded: [...buffers.keys()],
        loops: FORMS.map((f) => `${f}:${chain[f]?.src ? "run" : "-"}`),
        /* 真实落下的值（gain 参数），与 mix 的目标值区分开看 */
        gains: FORMS.map((f) => +(chain[f]?.gain.gain.value ?? 0).toFixed(3)),
        head: +(headroom?.gain.value ?? 0).toFixed(3),
        master: +(master?.gain.value ?? 0).toFixed(4),
        scene: +(scene?.gain.value ?? 1).toFixed(3),
        pageGain: +pageGain.toFixed(4),
        bed: +(bedGain?.gain.value ?? 0).toFixed(3),
        open: +(gOpen?.gain.value ?? 0).toFixed(3),
        bedIn: bedAtCtx === null ? null : +(bedAtCtx - now()).toFixed(2),
        bedPhase: +bedPhase.toFixed(3),
        offFor: offAt === null ? null : +((Date.now() - offAt) / 1e3).toFixed(2),
        /* Ave 人声整包预取：取到几个 / 共几个、还在不在跑 */
        voices: `${voiceBufs.size}/${voicePool.length}`,
        voicesWarming: voiceWarming
      }),
      /* 量输出端实际电平：只看调度不算数，要看到样本在流 */
      probe: async (ms = 320) => {
        if (!ctx || !master) return null;
        if (!probeNode) {
          probeNode = ctx.createAnalyser();
          probeNode.fftSize = 2048;
          master.connect(probeNode);
        }
        const buf2 = new Float32Array(probeNode.fftSize);
        let peak = 0;
        const t0 = performance.now();
        while (performance.now() - t0 < ms) {
          probeNode.getFloatTimeDomainData(buf2);
          for (let i = 0; i < buf2.length; i++) peak = Math.max(peak, Math.abs(buf2[i]));
          await new Promise((r) => setTimeout(r, 25));
        }
        return { peak: +peak.toFixed(5), peakDb: peak > 0 ? +(20 * Math.log10(peak)).toFixed(2) : -Infinity };
      }
    };
  }
  try {
    const raw = sessionStorage.getItem(STORE_KEY);
    if (raw) {
      const rec = JSON.parse(raw);
      epoch = rec.epoch;
      offAt = rec.offAt ?? null;
      storedDurs = { open: rec.durs?.open || void 0, loop: rec.durs?.loop || void 0 };
    }
  } catch {
  }
  if (levels.bgm > 0) void turnOn();
  if (levels.voice > 0)
    void ensureCtx().then((ok) => {
      if (!ok) return armUnlock();
      warmVoices();
      paint();
    });
  paint();
}

// ../../../src/scripts/toolstar.ts
var DEG = Math.PI / 180;
var mod2 = (a, n) => (a % n + n) % n;
var SVGNS = "http://www.w3.org/2000/svg";
var LEAD = 0.16;
var VOL_R = [150, 188, 226];
var VOL_GAP = 22;
var C = { x: 46, y: 0 };
var scaleK = () => clamp(Math.min(innerWidth, innerHeight * 1.2) / 760, 0.72, 1);
var Ring = class {
  el;
  R0;
  R = 0;
  step;
  baseStep;
  loop;
  start;
  startPref;
  lo = 0;
  hi = 90;
  P = 0;
  offset = 0;
  target = 0;
  alpha = 0;
  alphaTo = 0;
  items = [];
  originals;
  snapT = 0;
  hideT = 0;
  /** 第几项之后多空 0.7 格（-1 = 不空） */
  gapAfter;
  /** 条目从轨道往外伸出的最长距离（放射的字有多长；显形时量） */
  extent = 20;
  constructor(el, R, step, start, gapAfter = -1) {
    this.gapAfter = gapAfter;
    this.el = el;
    this.R0 = R;
    this.baseStep = this.step = step;
    this.loop = el.hasAttribute("data-loop");
    this.startPref = start;
    this.start = start ?? 84;
    this.originals = [...el.querySelectorAll(":scope > .ts-item")];
    this.layout();
  }
  /** 尺寸变了重新算弧与复制件 */
  layout() {
    this.R = this.R0 * scaleK();
    const m = Math.asin(clamp((C.x - 6) / this.R, 0, 1)) / DEG;
    this.lo = this.loop ? Math.max(-2, -m + 6) : -m;
    this.hi = this.loop ? Math.min(82, 90 + m - 10) : 90 + m;
    this.start = this.startPref ?? (this.loop ? Math.min(78, this.hi - 4) : Math.min(84, this.hi - 6));
    const N = this.originals.length;
    for (const it of this.items) if (it.src) it.el.remove();
    this.items = this.originals.map((el, i) => ({ el, k: i, ray: el.classList.contains("ts-ray") }));
    if (!this.loop || !N) {
      this.P = 0;
      return;
    }
    const span = this.hi - this.lo + 24;
    let copies = Math.max(1, Math.ceil(span / (N * this.baseStep)));
    this.step = Math.max(this.baseStep, span / (N * copies));
    if (copies === 1 && this.step > this.baseStep * 1.6) {
      copies = 2;
      this.step = Math.max(this.baseStep, span / (N * copies));
    }
    this.P = this.step * N * copies;
    for (let c2 = 1; c2 < copies; c2++) {
      this.originals.forEach((src, i) => {
        const el = src.cloneNode(true);
        el.setAttribute("aria-hidden", "true");
        el.tabIndex = -1;
        el.removeAttribute("data-morph");
        el.querySelectorAll("[data-morph]").forEach((x) => x.removeAttribute("data-morph"));
        el.addEventListener("click", (e) => {
          e.preventDefault();
          src.click();
        });
        this.el.append(el);
        this.items.push({ el, k: c2 * N + i, ray: true, src });
      });
    }
  }
  angle(k) {
    if (!this.P) return this.start - (k + (this.gapAfter >= 0 && k > this.gapAfter ? 0.7 : 0)) * this.step + this.offset;
    const hiE = this.hi + 6;
    return hiE - mod2(k * this.step - this.offset + (hiE - this.start), this.P);
  }
  /** 推进一帧；返回是否还在动 */
  frame(rm) {
    const k = rm ? 1 : 0.16;
    this.offset += (this.target - this.offset) * k;
    this.alpha += (this.alphaTo - this.alpha) * (rm ? 1 : 0.18);
    if (Math.abs(this.target - this.offset) < 0.01) this.offset = this.target;
    if (Math.abs(this.alphaTo - this.alpha) < 5e-3) this.alpha = this.alphaTo;
    for (const it of this.items) {
      const a = this.angle(it.k);
      const x = C.x + this.R * Math.cos(a * DEG);
      const y = C.y - this.R * Math.sin(a * DEG);
      const edge = clamp((a - (this.lo - 10)) / 12, 0, 1) * clamp((this.hi + 10 - a) / 12, 0, 1);
      const o = this.alpha * edge;
      const s = it.el.style;
      s.opacity = o.toFixed(3);
      s.visibility = o < 0.02 ? "hidden" : "visible";
      if (it.ray) s.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) rotate(${(-a).toFixed(2)}deg) translate(0,-50%)`;
      else {
        s.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-50%)`;
        s.setProperty("--ts-a", a.toFixed(2));
      }
      if (it.src) {
        if (it.el.textContent !== it.src.textContent) it.el.innerHTML = it.src.innerHTML;
        for (const attr of ["aria-pressed", "aria-current"]) {
          const v = it.src.getAttribute(attr);
          if (v !== it.el.getAttribute(attr)) v == null ? it.el.removeAttribute(attr) : it.el.setAttribute(attr, v);
        }
      }
    }
    return this.offset !== this.target || this.alpha !== this.alphaTo;
  }
  show(rm) {
    clearTimeout(this.hideT);
    this.el.hidden = false;
    this.measure();
    this.alphaTo = 1;
    this.target = 0;
    if (this.alpha === 0) this.offset = rm ? 0 : -50;
  }
  hide(rm) {
    this.alphaTo = 0;
    if (!rm) this.target -= 30;
    clearTimeout(this.hideT);
    this.hideT = window.setTimeout(
      () => {
        if (this.alphaTo === 0) {
          this.el.hidden = true;
          this.alpha = 0;
          this.target = this.offset = 0;
        }
      },
      rm ? 0 : 420
    );
  }
  /** 量放射条目的长度（宽度不受 transform 影响；隐藏时量不到，所以在显形时量） */
  measure() {
    if (!this.originals[0]?.classList.contains("ts-ray")) return;
    this.extent = Math.max(0, ...this.originals.map((el) => el.offsetWidth));
  }
  get visible() {
    return this.alphaTo > 0;
  }
  nudge(d) {
    if (this.P) this.target += d;
    else this.target = clamp(this.target + d, -20, 20);
    clearTimeout(this.snapT);
    this.snapT = window.setTimeout(() => this.snap(), 160);
  }
  snap() {
    this.target = this.P ? Math.round(this.target / this.step) * this.step : 0;
  }
};
function initToolstar() {
  const root2 = document.getElementById("ts");
  if (!root2) return;
  const star2 = root2.querySelector(".ts-star");
  const starG = root2.querySelector(".ts-star-g");
  const orbit = root2.querySelector(".ts-orbit");
  const tracks = root2.querySelector(".ts-tracks");
  const ringEl = (n) => root2.querySelector(`[data-ring="${n}"]`);
  const sheet = (n) => root2.querySelector(`[data-sheet="${n}"]`);
  const findSheet = sheet("find");
  const pageSheet = sheet("page");
  const field2 = findSheet.querySelector(".ts-field");
  const count = findSheet.querySelector(".ts-count");
  const inWander = !!document.getElementById("w-host");
  let RM = reducedMotion();
  matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", (e) => RM = e.matches);
  const toolsN = root2.querySelectorAll('[data-ring="tools"] > .ts-item').length;
  const rings = {
    tools: new Ring(ringEl("tools"), 104, 88 / Math.max(1, toolsN - 1 + 0.7), 86, 0),
    go: new Ring(ringEl("go"), 180, 17),
    tags: new Ring(ringEl("tags"), 170, 15),
    months: new Ring(ringEl("months"), 246, 12, 62),
    set: new Ring(ringEl("set"), 168, 19, 66),
    setUi: new Ring(ringEl("set-ui"), 240, 14, 70),
    setRead: new Ring(ringEl("set-read"), 240, 14, 70),
    setAve: new Ring(ringEl("set-ave"), 240, 12, 84)
  };
  const OUTER = { sound: [], go: ["go"], find: ["tags", "months"], page: [], set: ["set"] };
  const CAT_RING = { ui: "setUi", read: "setRead", ave: "setAve" };
  let setCat = null;
  let open = false;
  let tool = null;
  let reality2 = "wake";
  const ST = { auto: 0, spin: 0, spinTo: 0, wob: 0 };
  function drawStar(dt, now2) {
    const dream = reality2 === "dream" && !RM;
    if (dream) ST.auto += dt * 12;
    else ST.auto += (Math.round(ST.auto / 90) * 90 - ST.auto) * Math.min(1, dt * 3);
    ST.spin += (ST.spinTo - ST.spin) * Math.min(1, RM ? 1 : dt * 7);
    const wob = dream ? Math.sin(now2 / 2300) * 6 : 0;
    const yaw = (45 + ST.auto + ST.spin) * DEG;
    const pit = (35.264 + wob) * DEG;
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const cp = Math.cos(pit);
    const sp = Math.sin(pit);
    const spikes = [];
    for (const [ax, ay, az] of [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1]
    ]) {
      for (const s of [1, -1]) {
        const x0 = ax * s;
        const y0 = ay * s;
        const z0 = az * s;
        const x1 = x0 * cy + z0 * sy;
        const z1 = -x0 * sy + z0 * cy;
        const y2 = y0 * cp - z1 * sp;
        const z2 = y0 * sp + z1 * cp;
        spikes.push({ x: x1 * 16, y: -y2 * 16, z: z2 });
      }
    }
    spikes.sort((a, b) => a.z - b.z);
    let out = "";
    for (const p of spikes) {
      const L = Math.hypot(p.x, p.y);
      if (L < 0.6) continue;
      const ux = p.x / L;
      const uy = p.y / L;
      const w = 1.9;
      const op = (0.38 + 0.5 * (p.z + 1) / 2).toFixed(3);
      out += `<path d="M${(-uy * w).toFixed(2)} ${(ux * w).toFixed(2)}L${p.x.toFixed(2)} ${p.y.toFixed(2)}L${(uy * w).toFixed(2)} ${(-ux * w).toFixed(2)}L${(-ux * 1.4).toFixed(2)} ${(-uy * 1.4).toFixed(2)}Z" fill="currentColor" fill-opacity="${op}"/>`;
    }
    out += '<circle class="ts-hub" r="1.7"/>';
    starG.innerHTML = out;
    return dream || Math.abs(ST.spinTo - ST.spin) > 0.05 || Math.abs(Math.round(ST.auto / 90) * 90 - ST.auto) > 0.05;
  }
  let raf = 0;
  let lastStar = performance.now();
  let fresh2 = true;
  function kick() {
    if (!raf) {
      fresh2 = true;
      raf = requestAnimationFrame(loop);
    }
  }
  function loop(now2) {
    raf = 0;
    let busy = false;
    for (const r of Object.values(rings)) if (!r.el.hidden) busy = r.frame(RM) || busy;
    if (!volBox.hidden) busy = frameVols(RM) || busy;
    const dream = reality2 === "dream" && !RM;
    if (Math.abs(ST.spinTo - ST.spin) > 0.05 || !dream || now2 - lastStar > 41) {
      const dt = fresh2 ? 1 / 60 : Math.min(0.1, Math.max(0, (now2 - lastStar) / 1e3));
      fresh2 = false;
      busy = drawStar(dt, now2) || busy;
      lastStar = now2;
    }
    if (dream) busy = true;
    if (busy && !document.hidden) raf = requestAnimationFrame(loop);
  }
  document.addEventListener("visibilitychange", () => !document.hidden && kick());
  function place2() {
    const r = star2.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      C.x = r.left + r.width / 2;
      C.y = r.top + r.height / 2;
    } else {
      C.x = 46;
      C.y = innerHeight - 76;
    }
    orbit.style.setProperty("--ts-cx", `${C.x}px`);
    orbit.style.setProperty("--ts-cy", `${C.y}px`);
  }
  function drawTracks() {
    tracks.replaceChildren();
    if (!open) {
      orbit.style.setProperty("--ts-sr", "24px");
      orbit.style.setProperty("--ts-scale", (24 / 380).toFixed(4));
      orbit.classList.remove("is-veiled");
      return;
    }
    const add = (attrs) => {
      const el = document.createElementNS(SVGNS, "circle");
      for (const k in attrs) el.setAttribute(k, String(attrs[k]));
      tracks.append(el);
      return el;
    };
    add({ class: "ts-trk is-dash", cx: C.x, cy: C.y, r: 30 });
    for (const ring of Object.values(rings)) {
      if (!ring.visible) continue;
      add({ class: "ts-trk", cx: C.x, cy: C.y, r: ring.R });
      const band = add({ class: "ts-band", cx: C.x, cy: C.y, r: ring.R, "data-nofx": "" });
      bindTurn(band, ring);
    }
    const sr2 = discR();
    orbit.style.setProperty("--ts-sr", `${sr2.toFixed(1)}px`);
    orbit.style.setProperty("--ts-scale", (sr2 / 380).toFixed(4));
    orbit.style.setProperty("--ts-cx", `${C.x}px`);
    orbit.style.setProperty("--ts-cy", `${C.y}px`);
    orbit.classList.add("is-veiled");
  }
  function discR() {
    let outer = 0;
    for (const ring of Object.values(rings)) if (ring !== rings.tools && ring.visible) outer = Math.max(outer, ring.R + ring.extent);
    if (open && tool === "sound") outer = Math.max(outer, VOL_R[VOL_R.length - 1] * scaleK() + 6);
    return outer ? outer + 24 : rings.tools.R + 34;
  }
  let drag = null;
  const ptrAngle = (e) => Math.atan2(C.y - e.clientY, e.clientX - C.x) / DEG;
  const swallow = /* @__PURE__ */ new WeakSet();
  function bindTurn(el, ring) {
    el.addEventListener("pointerdown", (e) => {
      const pe = e;
      if (pe.button !== 0) return;
      drag = { ring, a: ptrAngle(pe), x: pe.clientX, y: pe.clientY, moved: false, el };
    });
    el.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        ring.nudge(-e.deltaY * 0.06);
        kick();
      },
      { passive: false }
    );
  }
  for (const ring of Object.values(rings)) {
    if (ring === rings.tools) continue;
    for (const it of ring.items) bindTurn(it.el, ring);
    ring.el.addEventListener(
      "click",
      (e) => {
        const t = e.target.closest(".ts-item");
        if (t && swallow.has(t)) {
          swallow.delete(t);
          e.preventDefault();
          e.stopImmediatePropagation();
        }
      },
      true
    );
  }
  addEventListener("pointermove", (e) => {
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 5) return;
    drag.moved = true;
    const a = ptrAngle(e);
    let d = a - drag.a;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    drag.a = a;
    if (drag.ring.P) {
      drag.ring.target += d;
      drag.ring.offset += d;
    } else drag.ring.target = clamp(drag.ring.target + d, -20, 20);
    kick();
  });
  addEventListener("pointerup", () => {
    if (!drag) return;
    if (drag.moved) {
      const item = drag.el.closest?.(".ts-item");
      if (item) swallow.add(item);
      drag.ring.snap();
      kick();
    }
    drag = null;
  });
  const volBox = root2.querySelector(".ts-vols");
  const vols = [...volBox.querySelectorAll(".ts-vol")].map((g, i) => ({
    ch: g.dataset.ch,
    i,
    g,
    track: g.querySelector(".ts-vol-track"),
    fill: g.querySelector(".ts-vol-fill"),
    thumb: g.querySelector(".ts-vol-thumb"),
    hit: g.querySelector(".ts-vol-hit"),
    btn: volBox.querySelector(`.ts-vch[data-ch="${g.dataset.ch}"]`),
    R: 0,
    s: 0,
    // 滑条起点（弧度）
    span: 0
    // 滑条张角（弧度）
  }));
  const polar = (R, a) => [C.x + R * Math.cos(a), C.y - R * Math.sin(a)];
  function layoutVols() {
    const k = scaleK();
    const L = VOL_R[0] * k * Math.PI / 2;
    for (const v of vols) {
      v.R = VOL_R[v.i] * k;
      v.s = VOL_GAP / v.R;
      v.span = L / v.R;
      const [x0, y0] = polar(v.R, v.s);
      const [x1, y1] = polar(v.R, v.s + v.span);
      const d = `M${x0.toFixed(1)} ${y0.toFixed(1)}A${v.R.toFixed(1)} ${v.R.toFixed(1)} 0 0 0 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
      v.track.setAttribute("d", d);
      v.fill.setAttribute("d", d);
      v.hit.setAttribute("d", d);
      const [bx, by] = polar(v.R, 0);
      v.btn.style.transform = `translate(${bx.toFixed(1)}px,${by.toFixed(1)}px)`;
    }
    paintVols();
  }
  function paintVols() {
    for (const v of vols) {
      const x = getLevel(v.ch);
      const live = isLive(v.ch);
      const waiting = live && !isSounding(v.ch) && v.ch !== "fx";
      const [tx, ty] = polar(v.R, v.s + x * v.span);
      v.thumb.setAttribute("cx", tx.toFixed(1));
      v.thumb.setAttribute("cy", ty.toFixed(1));
      v.fill.style.strokeDasharray = `${x.toFixed(4)} 1`;
      const n = Math.round(x * 100);
      v.g.setAttribute("aria-valuenow", String(n));
      v.g.setAttribute("aria-valuetext", n ? `${n}%` : "\u5173");
      v.g.classList.toggle("is-waiting", waiting);
      v.btn.setAttribute("aria-pressed", String(x > 0));
      v.btn.classList.toggle("is-live", live);
    }
  }
  onLevels(paintVols);
  let volDrag = null;
  const volAt = (v, e) => {
    const a = Math.atan2(C.y - e.clientY, e.clientX - C.x);
    return clamp((a - v.s) / v.span, 0, 1);
  };
  for (const v of vols) {
    v.g.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      v.g.setPointerCapture(e.pointerId);
      volDrag = { v, from: getLevel(v.ch), id: e.pointerId };
      v.g.classList.add("is-drag");
      v.btn.classList.add("is-drag");
      v.g.focus({ preventScroll: true });
      setLevel(v.ch, volAt(v, e));
    });
    v.g.addEventListener("pointermove", (e) => {
      if (volDrag?.v === v && e.pointerId === volDrag.id) setLevel(v.ch, volAt(v, e));
    });
    const end = (e) => {
      if (volDrag?.v !== v || e.pointerId !== volDrag.id) return;
      if (getLevel(v.ch) === 0) rememberLevel(v.ch, volDrag.from);
      volDrag = null;
      v.g.classList.remove("is-drag");
      v.btn.classList.remove("is-drag");
    };
    v.g.addEventListener("pointerup", end);
    v.g.addEventListener("pointercancel", end);
    v.g.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        setLevel(v.ch, clamp(getLevel(v.ch) - e.deltaY * 6e-4, 0, 1));
      },
      { passive: false }
    );
    v.g.addEventListener("keydown", (e) => {
      const x = getLevel(v.ch);
      const to = {
        ArrowUp: x + 0.05,
        ArrowRight: x + 0.05,
        ArrowDown: x - 0.05,
        ArrowLeft: x - 0.05,
        PageUp: x + 0.2,
        PageDown: x - 0.2,
        Home: 0,
        End: 1
      };
      if (!(e.key in to)) return;
      e.preventDefault();
      if (to[e.key] <= 5e-3 && x > 0) rememberLevel(v.ch, x);
      setLevel(v.ch, clamp(to[e.key], 0, 1));
    });
    v.btn.addEventListener("click", () => toggleLevel(v.ch));
  }
  const VA = { offset: 0, target: 0, alpha: 0, alphaTo: 0, hideT: 0 };
  function showVols(on2) {
    if (on2) {
      if (VA.alphaTo === 1) return;
      clearTimeout(VA.hideT);
      if (volBox.hidden) layoutVols();
      volBox.hidden = false;
      VA.alphaTo = 1;
      VA.target = 0;
      if (VA.alpha === 0) VA.offset = RM ? 0 : -50;
    } else {
      if (volBox.hidden || VA.alphaTo === 0) return;
      VA.alphaTo = 0;
      if (!RM) VA.target -= 30;
      clearTimeout(VA.hideT);
      VA.hideT = window.setTimeout(
        () => {
          if (VA.alphaTo === 0) {
            volBox.hidden = true;
            VA.alpha = 0;
            VA.target = VA.offset = 0;
          }
        },
        RM ? 0 : 420
      );
    }
  }
  function frameVols(rm) {
    VA.offset += (VA.target - VA.offset) * (rm ? 1 : 0.16);
    VA.alpha += (VA.alphaTo - VA.alpha) * (rm ? 1 : 0.18);
    if (Math.abs(VA.target - VA.offset) < 0.01) VA.offset = VA.target;
    if (Math.abs(VA.alphaTo - VA.alpha) < 5e-3) VA.alpha = VA.alphaTo;
    volBox.style.opacity = VA.alpha.toFixed(3);
    volBox.style.transform = VA.offset ? `rotate(${(-VA.offset).toFixed(2)}deg)` : "";
    return VA.offset !== VA.target || VA.alpha !== VA.alphaTo;
  }
  const dock = root2.querySelector(".ts-dock");
  const dockPageBtn = dock?.querySelector(".ts-dock-page") ?? null;
  const dockStarBtn = dock?.querySelector(".ts-dock-star") ?? null;
  let dockPageOpen = false;
  const toolBtns = [...root2.querySelectorAll(".ts-tool")];
  const catBtns = [...root2.querySelectorAll("[data-set-cat]")];
  function sync() {
    place2();
    document.documentElement.classList.toggle("ts-open", open);
    root2.classList.toggle("is-dock-page", dockPageOpen && !open);
    star2.setAttribute("aria-expanded", String(open));
    dockStarBtn?.setAttribute("aria-expanded", String(open));
    dockPageBtn?.setAttribute("aria-expanded", String(dockPageOpen || open && tool === "page"));
    for (const b of toolBtns) if (b.hasAttribute("aria-expanded")) b.setAttribute("aria-expanded", String(open && tool === b.dataset.t));
    const want = new Set(open ? ["tools", ...tool ? OUTER[tool] : []] : []);
    if (open && tool === "set" && setCat) want.add(CAT_RING[setCat]);
    for (const b of catBtns) b.setAttribute("aria-pressed", String(b.dataset.setCat === setCat));
    const outside = (inner, outer) => {
      if (!inner.visible) inner.show(RM);
      const R0 = (inner.R + inner.extent + 26) / scaleK();
      if (Math.abs(R0 - outer.R0) > 0.5) {
        outer.R0 = R0;
        outer.layout();
      }
    };
    if (want.has("months")) outside(rings.tags, rings.months);
    for (const c2 of Object.values(CAT_RING)) if (want.has(c2)) outside(rings.set, rings[c2]);
    for (const [name, ring] of Object.entries(rings)) {
      if (want.has(name) && !ring.visible) ring.show(RM);
      else if (!want.has(name) && ring.visible) ring.hide(RM);
    }
    showVols(open && tool === "sound");
    showSheet(findSheet, open && tool === "find", discR() + 46);
    if (pageSheet) showSheet(pageSheet, dockPageOpen || open && tool === "page", rings.tools.R + 34 + 46);
    drawTracks();
    kick();
  }
  function showSheet(el, on2, above) {
    if (on2) {
      el.hidden = false;
      const btm = innerHeight - C.y + above;
      el.style.bottom = `${btm}px`;
      el.style.maxHeight = `${Math.max(120, innerHeight - btm - 20)}px`;
      requestAnimationFrame(() => el.classList.add("is-on"));
    } else if (!el.hidden) {
      el.classList.remove("is-on");
      setTimeout(() => !el.classList.contains("is-on") && (el.hidden = true), RM ? 0 : 380);
    }
  }
  const captionEl = root2.querySelector(".ts-caption");
  function setCaption(txt) {
    if (!captionEl) return;
    if (txt) {
      captionEl.textContent = txt;
      captionEl.classList.add("is-on");
    } else {
      captionEl.classList.remove("is-on");
    }
  }
  function readLabel(b) {
    const lab = b?.querySelector(".ts-lab");
    if (!lab) return "";
    const small = lab.querySelector("small")?.textContent?.trim() || "";
    const morphEl = lab.querySelector("[data-morph]");
    const zh = morphEl ? ((reality2 === "dream" ? morphEl.dataset.dream : morphEl.dataset.true) || morphEl.textContent || "").trim() : (() => {
      const clone = lab.cloneNode(true);
      clone.querySelector("small")?.remove();
      return (clone.textContent ?? "").replace(/\s+/g, " ").trim();
    })();
    return small && zh ? `${zh} \xB7 ${small}` : zh || small;
  }
  for (const b of toolBtns) {
    b.addEventListener("pointerenter", () => setCaption(readLabel(b)));
    b.addEventListener("focus", () => setCaption(readLabel(b)));
    b.addEventListener("pointerleave", () => {
      const cur = toolBtns.find((x) => x.dataset.t === tool);
      setCaption(readLabel(cur));
    });
  }
  function setOpen(v) {
    if (v === open && !dockPageOpen) return;
    open = v;
    dockPageOpen = false;
    if (!v) {
      tool = null;
      setCaption("");
    } else {
      const first = toolBtns[0];
      if (first) setCaption(readLabel(first));
    }
    ST.spinTo += 90;
    sync();
  }
  function setTool(t) {
    tool = t;
    sync();
    const cur = toolBtns.find((x) => x.dataset.t === t);
    setCaption(readLabel(cur));
    if (t === "find") setTimeout(() => field2.focus({ preventScroll: true }), 60);
    if (t === "page") markToc();
  }
  star2.addEventListener("click", () => setOpen(!open));
  for (const b of toolBtns) {
    b.addEventListener("click", () => {
      const t = b.dataset.t;
      if (t === "face") {
        const r = b.getBoundingClientRect();
        b.classList.add("is-turning");
        clearTimeout(turnT);
        turnT = window.setTimeout(() => b.classList.remove("is-turning"), 2400);
        flipFrom(r.left + r.width / 2, r.top + r.height / 2);
        return;
      }
      setTool(tool === t ? null : t);
    });
  }
  for (const b of catBtns) {
    b.addEventListener("click", () => {
      const c2 = b.dataset.setCat;
      setCat = setCat === c2 ? null : c2;
      sync();
    });
  }
  for (const b of root2.querySelectorAll("[data-goto]")) {
    b.addEventListener("click", () => setTool(b.dataset.goto));
  }
  addEventListener("keydown", (e) => {
    const typing = e.target instanceof Element && !!e.target.closest("input, textarea, [contenteditable]");
    if (e.key === "Escape" && open) {
      if (tool) setTool(null);
      else setOpen(false);
      star2.focus({ preventScroll: true });
    } else if (e.key === "/" && !typing && !e.altKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      if (!open) setOpen(true);
      if (tool !== "find") setTool("find");
      else field2.focus({ preventScroll: true });
    }
  });
  document.addEventListener("pointerdown", (e) => {
    if (!open || root2.contains(e.target)) return;
    setOpen(false);
  });
  let resizeT = 0;
  addEventListener("resize", () => {
    clearTimeout(resizeT);
    resizeT = window.setTimeout(() => {
      place2();
      layoutVols();
      for (const r of Object.values(rings)) {
        r.layout();
        for (const it of r.items) if (it.src && r !== rings.tools) bindTurn(it.el, r);
      }
      sync();
    }, 120);
  });
  let turnT = 0;
  onRealityChange((r) => {
    reality2 = r;
    root2.querySelector('.ts-tool[data-t="face"]')?.classList.remove("is-turning");
    if (open) {
      const focused = document.activeElement instanceof HTMLButtonElement && toolBtns.includes(document.activeElement) ? document.activeElement : void 0;
      setCaption(readLabel(focused || toolBtns.find((x) => x.dataset.t === tool) || toolBtns[0]));
    }
    kick();
  });
  const wordBtns = [...root2.querySelectorAll("[data-word]:not([aria-hidden])")];
  const words = () => field2.value.trim().split(/\s+/).filter(Boolean);
  const has = (ws, w) => ws.some((x) => x.toLowerCase() === w.toLowerCase());
  const paintWords = () => {
    const ws = words();
    for (const b of wordBtns) b.setAttribute("aria-pressed", String(has(ws, b.dataset.word)));
    kick();
  };
  const toIndex = (_q) => location.hash = "#/essays";
  let findT = 0;
  function find(q) {
    paintWords();
    if (!inWander) {
      count.textContent = q.trim() ? "\u56DE\u8F66 \xB7 \u5230\u76EE\u5F55\u91CC\u627E" : "";
      return;
    }
    clearTimeout(findT);
    findT = window.setTimeout(() => dispatchEvent(new CustomEvent("xm:find", { detail: { query: q } })), 120);
  }
  field2.addEventListener("input", () => find(field2.value));
  field2.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !inWander && field2.value.trim()) toIndex(field2.value.trim());
  });
  addEventListener("xm:found", (e) => {
    const d = e.detail;
    count.textContent = d.query ? `${d.hits} / ${d.total}` : "";
  });
  const isMonth = (w) => /^\d{4}-\d{2}$/.test(w);
  for (const b of wordBtns) {
    b.addEventListener("click", () => {
      const w = b.dataset.word;
      if (!inWander) return toIndex(w);
      let ws = words();
      if (has(ws, w)) ws = ws.filter((x) => x.toLowerCase() !== w.toLowerCase());
      else ws = [...isMonth(w) ? ws.filter((x) => !isMonth(x)) : ws, w];
      field2.value = ws.join(" ");
      find(field2.value);
    });
  }
  const q0 = new URLSearchParams(location.search).get("q");
  if (q0) {
    field2.value = q0;
    paintWords();
  }
  const keep = root2.querySelector("[data-keep-face]");
  if (keep) {
    const read = () => {
      try {
        return localStorage.getItem("xm-keep-face") !== "off";
      } catch {
        return true;
      }
    };
    keep.setAttribute("aria-pressed", String(read()));
    keep.addEventListener("click", () => {
      const v = !read();
      try {
        if (v) localStorage.removeItem("xm-keep-face");
        else localStorage.setItem("xm-keep-face", "off");
      } catch {
      }
      keep.setAttribute("aria-pressed", String(v));
    });
  }
  const multi = root2.querySelector("[data-multi]");
  if (multi) {
    const KINDS = [
      ["grid", "\u7F51\u683C"],
      ["row", "\u5E76\u6392"],
      ["car", "\u8F6E\u64AD"]
    ];
    let cur = 0;
    try {
      const i = KINDS.findIndex(([k]) => k === localStorage.getItem("xm-multi"));
      if (i > 0) cur = i;
    } catch {
    }
    const v = multi.querySelector("[data-multi-v]");
    v.textContent = KINDS[cur][1];
    multi.addEventListener("click", () => {
      cur = (cur + 1) % KINDS.length;
      try {
        if (cur) localStorage.setItem("xm-multi", KINDS[cur][0]);
        else localStorage.removeItem("xm-multi");
      } catch {
      }
      v.textContent = KINDS[cur][1];
      dispatchEvent(new CustomEvent("xm-multi"));
    });
  }
  const tocLinks = [];
  function markToc() {
    let cur = null;
    for (const { a, el } of tocLinks) if (el.getBoundingClientRect().top <= innerHeight * LEAD + 8) cur = a;
    for (const { a } of tocLinks) a.classList.toggle("is-current", a === cur);
  }
  if (pageSheet) {
    const toc = pageSheet.querySelector(".ts-toc");
    const heads = [...document.querySelectorAll("article.prose .md h2, article.prose .md h3")];
    if (!heads.length) {
      toc.previousElementSibling?.remove();
      toc.remove();
      pageSheet.querySelector(".ts-sec")?.classList.remove("ts-sec");
    }
    for (const el of heads) {
      const c2 = el.cloneNode(true);
      c2.querySelectorAll('.ord, .ghost, [aria-hidden="true"]').forEach((x) => x.remove());
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = el.id ? `#${el.id}` : "#";
      a.textContent = (c2.textContent ?? "").replace(/\s+/g, " ").trim();
      if (el.tagName === "H3") a.className = "is-sub";
      a.addEventListener("click", (e) => {
        e.preventDefault();
        const top = el.getBoundingClientRect().top + scrollY - innerHeight * LEAD;
        scrollTo({ top, behavior: RM ? "instant" : "smooth" });
      });
      li.append(a);
      toc.append(li);
      tocLinks.push({ a, el });
    }
    addEventListener("scroll", () => tool === "page" && markToc(), { passive: true });
    const html = document.documentElement;
    for (const seg of pageSheet.querySelectorAll(".ts-seg[data-key]")) {
      const key = seg.dataset.key;
      const attr = key === "size" ? "readSize" : "readLead";
      const btns = [...seg.querySelectorAll("button[data-v]")];
      const paint3 = () => {
        const v = html.dataset[attr] || "m";
        for (const b of btns) b.setAttribute("aria-pressed", String(b.dataset.v === v));
      };
      for (const b of btns) {
        b.addEventListener("click", () => {
          const v = b.dataset.v;
          if (v === "m") delete html.dataset[attr];
          else html.dataset[attr] = v;
          try {
            if (v === "m") localStorage.removeItem(`xm-read-${key}`);
            else localStorage.setItem(`xm-read-${key}`, v);
          } catch {
          }
          paint3();
        });
      }
      paint3();
    }
  }
  if (dock) {
    const back = dock.querySelector(".ts-dock-back");
    const srcBack = document.querySelector("a.reback");
    if (back && srcBack) {
      back.href = srcBack.getAttribute("href") || "/articles/";
      const wakeLabel = (srcBack.querySelector("[data-true]")?.getAttribute("data-true") || srcBack.textContent || "\u8FD4\u56DE").trim();
      const dreamLabel = (srcBack.querySelector("[data-dream]")?.getAttribute("data-dream") || wakeLabel).trim();
      onRealityChange((r) => {
        back.textContent = `\u2190 ${r === "dream" ? dreamLabel : wakeLabel}`;
      });
    }
    dockPageBtn?.addEventListener("click", () => {
      if (dockPageOpen) {
        dockPageOpen = false;
        sync();
      } else {
        open = false;
        tool = null;
        setCaption("");
        dockPageOpen = true;
        markToc();
        sync();
      }
    });
    const dockFace = dock.querySelector(".ts-dock-face");
    if (dockFace) {
      const faceTxt = dockFace.querySelector(".ts-dock-face-t");
      onRealityChange((r) => {
        dockFace.setAttribute("aria-pressed", String(r === "wake"));
        if (faceTxt) faceTxt.textContent = r === "dream" ? "\u5524\u9192" : "\u5165\u591C";
      });
      dockFace.addEventListener("click", () => {
        const r = dockFace.getBoundingClientRect();
        flipFrom(r.left + r.width / 2, r.top + r.height / 2);
      });
    }
    dockStarBtn?.addEventListener("click", () => setOpen(!open));
    addEventListener("pointerdown", (e) => {
      if (dockPageOpen && !root2.contains(e.target)) {
        dockPageOpen = false;
        sync();
      }
    });
    addEventListener("keydown", (e) => {
      if (e.key === "Escape" && dockPageOpen) {
        dockPageOpen = false;
        sync();
      }
    });
  }
  place2();
  drawStar(0, performance.now());
  kick();
}

// ../../../src/data/ave-lines.ts
var AVE_LINES = [
  {
    id: "home-hello",
    text: "\u7962\u56DE\u6765\u5566\uFF01",
    face: "happy",
    when: { on: "enter", path: "/", after: 1.5, visitor: "returning" }
  },
  /* 新访客第一次到主页：四句连着说，第三句贴着星（visitor 的判定见 docs/design/ave.md） */
  {
    id: "welcome-1",
    text: "\u521D\u6B21\u89C1\u9762\uFF01\u6211\u662FAve",
    face: "happy",
    when: { on: "enter", path: "/", after: 1.5, visitor: "new" },
    once: "ever",
    then: "welcome-2"
  },
  {
    id: "welcome-2",
    text: "\u6B22\u8FCE\u6765\u5230\u8FD9\u91CC\uFF0C\u8FD9\u91CC\u6709\u4E0D\u5C11\u6709\u610F\u601D\u7684\u4E1C\u897F\u54E6~",
    face: "beam",
    when: { on: "then" },
    once: "ever",
    then: "welcome-3"
  },
  {
    id: "welcome-3",
    text: "\u8FD9\u9897\u661F\u661F\u91CC\u6709\u5F88\u591A\u6709\u7528\u7684\u4E1C\u897F\uFF0C\u6BD4\u5982\u8BF4\uFF1A\u8BA9\u7962\u542C\u5230\u6211\u7684\u58F0\u97F3",
    face: "smile",
    when: { on: "then" },
    at: ".ts-star",
    once: "ever",
    then: "welcome-4"
  },
  {
    id: "welcome-4",
    text: "\u5269\u4E0B\u7684mmm\u7962\u53EF\u4EE5\u81EA\u5DF1\u63A2\u7D22~",
    face: "happy",
    when: { on: "then" },
    once: "ever"
  },
  /* 人声从没有到有（用户把 Ave 的音量从 0 拉起来时发） */
  {
    id: "voice-hello",
    text: "\u54C8\u55BD\uFF0C\u80FD\u542C\u89C1\u5417~",
    face: "beam",
    when: { on: "event", name: "voice-on" }
  },
  {
    id: "articles-enter",
    text: "\u8FD9\u8FB9\u662F\u968F\u7B14\uFF0C\u957F\u4E00\u4E9B\u7684\u5B57\u90FD\u653E\u5728\u8FD9\u91CC\u3002",
    dream: "\u8FD9\u8FB9\u662F\u65AD\u7AE0\uFF0C\u957F\u4E00\u4E9B\u7684\u5B57\u90FD\u653E\u5728\u8FD9\u91CC\u3002",
    face: "smile",
    when: { on: "enter", path: "/articles" }
  },
  {
    id: "projects-enter",
    text: "\u8FD9\u8FB9\u662F\u9879\u76EE\uFF0C\u505A\u5B8C\u7684\u548C\u8FD8\u5728\u505A\u7684\u90FD\u5728\u3002",
    dream: "\u8FD9\u8FB9\u662F\u9020\u7269\uFF0C\u505A\u5B8C\u7684\u548C\u8FD8\u5728\u505A\u7684\u90FD\u5728\u3002",
    face: "beam",
    when: { on: "enter", path: "/projects" }
  },
  {
    id: "moments-enter",
    text: "\u77AC\u95F4\u90FD\u5F88\u77ED\uFF0C\u4E00\u5F20\u56FE\uFF0C\u6216\u8005\u4E00\u4E24\u53E5\u8BDD\u3002",
    dream: "\u95EA\u5FF5\u90FD\u5F88\u77ED\uFF0C\u4E00\u5F20\u56FE\uFF0C\u6216\u8005\u4E00\u4E24\u53E5\u8BDD\u3002",
    face: "smile",
    when: { on: "enter", path: "/moments" }
  },
  {
    id: "read-end",
    text: "\u8BFB\u5B8C\u5566\u3002\u8981\u4E0D\u8981\u53BB\u522B\u5904\u770B\u770B\uFF1F",
    face: "beam",
    when: { on: "end", path: "/articles" }
  },
  {
    id: "late-night",
    text: "\u5DF2\u7ECF\u5F88\u665A\u4E86\u5462\u3002",
    face: "yawn",
    mood: "soft",
    when: { on: "clock", from: "01:00", to: "05:00" }
  },
  {
    id: "dawn",
    text: "\u5929\u5FEB\u4EAE\u4E86\u5462\u3002",
    face: "smile",
    mood: "soft",
    when: { on: "clock", from: "05:00", to: "07:00" }
  },
  {
    id: "noon",
    text: "\u4E2D\u5348\u5566\uFF0C\u8BB0\u5F97\u5403\u996D\u54E6\u3002",
    face: "beam",
    when: { on: "clock", from: "11:30", to: "13:00" }
  },
  {
    id: "evening",
    text: "\u55EF\uFF0C\u5DF2\u7ECF\u665A\u4E0A\u4E86\u5462\u3002",
    face: "smile",
    when: { on: "clock", from: "18:00", to: "23:00" }
  },
  {
    id: "idle-nap",
    text: "\u6211\u521A\u624D\u662F\u4E0D\u662F\u6253\u4E86\u4E2A\u76F9\u2026\u2026\u6CA1\u88AB\u770B\u5230\u5427\uFF1F",
    face: "shy",
    when: { on: "idle" }
  },
  {
    id: "still-hush",
    text: "\u5618\u2014\u2014\u8FD9\u91CC\u597D\u5B89\u9759\u3002",
    face: "smile",
    mood: "soft",
    when: { on: "still" }
  },
  {
    id: "still-look",
    text: "\u7962\u5728\u770B\u4EC0\u4E48\u5462\uFF1F\u6211\u4E5F\u60F3\u770B\u3002",
    face: "surprised",
    when: { on: "still" }
  },
  {
    id: "still-there",
    text: "\u7962\u8FD8\u5728\u5417\uFF1F",
    face: "surprised",
    when: { on: "still" }
  },
  {
    id: "still-daze",
    text: "\u53D1\u5446\u4E5F\u5F88\u597D\u5440\uFF0C\u6211\u966A\u7962\u4E00\u8D77\u3002",
    face: "happy",
    when: { on: "still" }
  }
];

// ../../../src/data/ave-voice.ts
var AVE_VOICE = (
  /* DATA */
  {
    "home-hello": {
      "text": "\u7962\u56DE\u6765\u5566\uFF01",
      "src": "/audio/ave/b48e2a16a292.mp3",
      "dur": 0.824,
      "steps": [45, 1, 126, 2, 220, 3, 311, 4, 423, 5]
    },
    "welcome-1": {
      "text": "\u521D\u6B21\u89C1\u9762\uFF01\u6211\u662FAve",
      "src": "/audio/ave/ff9d641522c6.mp3",
      "dur": 1.188,
      "steps": [45, 1, 132, 2, 223, 3, 315, 4, 431, 5, 543, 6, 629, 7, 706, 8, 785, 10]
    },
    "welcome-2": {
      "text": "\u6B22\u8FCE\u6765\u5230\u8FD9\u91CC\uFF0C\u8FD9\u91CC\u6709\u4E0D\u5C11\u6709\u610F\u601D\u7684\u4E1C\u897F\u54E6~",
      "src": "/audio/ave/188db6f04e74.mp3",
      "dur": 1.923,
      "steps": [45, 1, 122, 2, 212, 3, 290, 4, 384, 5, 462, 6, 561, 7, 621, 8, 706, 9, 782, 10, 859, 11, 944, 12, 1021, 13, 1105, 14, 1193, 15, 1280, 16, 1367, 17, 1458, 18, 1550, 19, 1624, 20]
    },
    "welcome-3": {
      "text": "\u8FD9\u9897\u661F\u661F\u91CC\u6709\u5F88\u591A\u6709\u7528\u7684\u4E1C\u897F\uFF0C\u6BD4\u5982\u8BF4\uFF1A\u8BA9\u7962\u542C\u5230\u6211\u7684\u58F0\u97F3",
      "src": "/audio/ave/bd2a443462cb.mp3",
      "dur": 2.57,
      "steps": [45, 1, 137, 2, 221, 3, 314, 4, 403, 5, 479, 6, 560, 7, 641, 8, 718, 9, 800, 10, 882, 11, 955, 12, 1049, 13, 1162, 14, 1221, 15, 1311, 16, 1390, 17, 1494, 18, 1553, 19, 1650, 20, 1728, 21, 1815, 22, 1905, 23, 1995, 24, 2074, 25, 2172, 26]
    },
    "welcome-4": {
      "text": "\u5269\u4E0B\u7684mmm\u7962\u53EF\u4EE5\u81EA\u5DF1\u63A2\u7D22~",
      "src": "/audio/ave/f9ee5802d615.mp3",
      "dur": 1.249,
      "steps": [45, 1, 126, 2, 206, 3, 288, 6, 372, 7, 455, 8, 535, 9, 620, 10, 696, 11, 776, 12, 863, 13, 950, 14]
    },
    "voice-hello": {
      "text": "\u54C8\u55BD\uFF0C\u80FD\u542C\u89C1\u5417~",
      "src": "/audio/ave/7f9760888d83.mp3",
      "dur": 0.951,
      "steps": [45, 1, 130, 2, 230, 3, 290, 4, 380, 5, 474, 6, 572, 7, 652, 8]
    },
    "articles-enter": {
      "text": "\u8FD9\u8FB9\u662F\u968F\u7B14\uFF0C\u957F\u4E00\u4E9B\u7684\u5B57\u90FD\u653E\u5728\u8FD9\u91CC\u3002",
      "src": "/audio/ave/a98ea1a312af.mp3",
      "dur": 1.83,
      "steps": [45, 1, 134, 2, 214, 3, 290, 4, 378, 5, 476, 6, 536, 7, 625, 8, 710, 9, 799, 10, 882, 11, 964, 12, 1043, 13, 1133, 14, 1228, 15, 1316, 16, 1429, 17]
    },
    "articles-enter~dream": {
      "text": "\u8FD9\u8FB9\u662F\u65AD\u7AE0\uFF0C\u957F\u4E00\u4E9B\u7684\u5B57\u90FD\u653E\u5728\u8FD9\u91CC\u3002",
      "src": "/audio/ave/d11ee637b215.mp3",
      "dur": 1.827,
      "steps": [45, 1, 121, 2, 206, 3, 296, 4, 372, 5, 469, 6, 529, 7, 613, 8, 703, 9, 795, 10, 887, 11, 976, 12, 1054, 13, 1138, 14, 1227, 15, 1317, 16, 1426, 17]
    },
    "projects-enter": {
      "text": "\u8FD9\u8FB9\u662F\u9879\u76EE\uFF0C\u505A\u5B8C\u7684\u548C\u8FD8\u5728\u505A\u7684\u90FD\u5728\u3002",
      "src": "/audio/ave/9f212c18b005.mp3",
      "dur": 1.841,
      "steps": [45, 1, 120, 2, 205, 3, 288, 4, 384, 5, 493, 6, 552, 7, 634, 8, 724, 9, 813, 10, 907, 11, 987, 12, 1079, 13, 1174, 14, 1250, 15, 1334, 16, 1440, 17]
    },
    "projects-enter~dream": {
      "text": "\u8FD9\u8FB9\u662F\u9020\u7269\uFF0C\u505A\u5B8C\u7684\u548C\u8FD8\u5728\u505A\u7684\u90FD\u5728\u3002",
      "src": "/audio/ave/3f82dbf3f13d.mp3",
      "dur": 1.847,
      "steps": [45, 1, 139, 2, 223, 3, 306, 4, 381, 5, 496, 6, 556, 7, 643, 8, 740, 9, 823, 10, 910, 11, 992, 12, 1078, 13, 1164, 14, 1252, 15, 1342, 16, 1445, 17]
    },
    "moments-enter": {
      "text": "\u77AC\u95F4\u90FD\u5F88\u77ED\uFF0C\u4E00\u5F20\u56FE\uFF0C\u6216\u8005\u4E00\u4E24\u53E5\u8BDD\u3002",
      "src": "/audio/ave/fe26e616e40f.mp3",
      "dur": 1.775,
      "steps": [45, 1, 122, 2, 212, 3, 291, 4, 372, 5, 476, 6, 536, 7, 627, 8, 708, 9, 801, 10, 860, 11, 946, 12, 1021, 13, 1107, 14, 1194, 15, 1279, 16, 1374, 17]
    },
    "moments-enter~dream": {
      "text": "\u95EA\u5FF5\u90FD\u5F88\u77ED\uFF0C\u4E00\u5F20\u56FE\uFF0C\u6216\u8005\u4E00\u4E24\u53E5\u8BDD\u3002",
      "src": "/audio/ave/0a7cc2415780.mp3",
      "dur": 1.806,
      "steps": [45, 1, 135, 2, 214, 3, 293, 4, 378, 5, 488, 6, 547, 7, 635, 8, 710, 9, 813, 10, 872, 11, 953, 12, 1051, 13, 1143, 14, 1216, 15, 1306, 16, 1405, 17]
    },
    "read-end": {
      "text": "\u8BFB\u5B8C\u5566\u3002\u8981\u4E0D\u8981\u53BB\u522B\u5904\u770B\u770B\uFF1F",
      "src": "/audio/ave/c63f4b0fa25c.mp3",
      "dur": 1.549,
      "steps": [45, 1, 137, 2, 221, 3, 326, 4, 437, 5, 532, 6, 619, 7, 703, 8, 788, 9, 877, 10, 962, 11, 1049, 12, 1148, 13]
    },
    "late-night": {
      "text": "\u5DF2\u7ECF\u5F88\u665A\u4E86\u5462\u3002",
      "src": "/audio/ave/d675e4800886.mp3",
      "dur": 1.073,
      "steps": [45, 1, 150, 2, 243, 3, 345, 4, 447, 5, 540, 6, 658, 7]
    },
    "dawn": {
      "text": "\u5929\u5FEB\u4EAE\u4E86\u5462\u3002",
      "src": "/audio/ave/39abcb25bc2c.mp3",
      "dur": 0.973,
      "steps": [45, 1, 140, 2, 239, 3, 344, 4, 429, 5, 558, 6]
    },
    "noon": {
      "text": "\u4E2D\u5348\u5566\uFF0C\u8BB0\u5F97\u5403\u996D\u54E6\u3002",
      "src": "/audio/ave/a0aa2a10f43c.mp3",
      "dur": 1.252,
      "steps": [45, 1, 138, 2, 227, 3, 340, 4, 399, 5, 494, 6, 575, 7, 659, 8, 736, 9, 850, 10]
    },
    "evening": {
      "text": "\u55EF\uFF0C\u5DF2\u7ECF\u665A\u4E0A\u4E86\u5462\u3002",
      "src": "/audio/ave/daf69442ccfc.mp3",
      "dur": 1.151,
      "steps": [45, 1, 154, 2, 214, 3, 305, 4, 396, 5, 476, 6, 569, 7, 647, 8, 749, 9]
    },
    "idle-nap": {
      "text": "\u6211\u521A\u624D\u662F\u4E0D\u662F\u6253\u4E86\u4E2A\u76F9\u2026\u2026\u6CA1\u88AB\u770B\u5230\u5427\uFF1F",
      "src": "/audio/ave/ed86538feba0.mp3",
      "dur": 1.971,
      "steps": [45, 1, 136, 2, 213, 3, 310, 4, 390, 5, 477, 6, 553, 7, 634, 8, 716, 9, 804, 10, 911, 12, 1116, 13, 1205, 14, 1284, 15, 1373, 16, 1470, 17, 1570, 18]
    },
    "still-hush": {
      "text": "\u5618\u2014\u2014\u8FD9\u91CC\u597D\u5B89\u9759\u3002",
      "src": "/audio/ave/8d80c2bedee3.mp3",
      "dur": 1.067,
      "steps": [45, 1, 149, 2, 159, 3, 170, 4, 255, 5, 346, 6, 438, 7, 528, 8, 652, 9]
    },
    "still-look": {
      "text": "\u7962\u5728\u770B\u4EC0\u4E48\u5462\uFF1F\u6211\u4E5F\u60F3\u770B\u3002",
      "src": "/audio/ave/19efef672ba4.mp3",
      "dur": 1.468,
      "steps": [45, 1, 119, 2, 200, 3, 292, 4, 387, 5, 474, 6, 581, 7, 693, 8, 786, 9, 875, 10, 950, 11, 1067, 12]
    },
    "still-there": {
      "text": "\u7962\u8FD8\u5728\u5417\uFF1F",
      "src": "/audio/ave/3bcf35ea48ea.mp3",
      "dur": 0.823,
      "steps": [45, 1, 136, 2, 224, 3, 323, 4, 422, 5]
    },
    "still-daze": {
      "text": "\u53D1\u5446\u4E5F\u5F88\u597D\u5440\uFF0C\u6211\u966A\u7962\u4E00\u8D77\u3002",
      "src": "/audio/ave/279e37244eb3.mp3",
      "dur": 1.501,
      "steps": [45, 1, 140, 2, 223, 3, 299, 4, 388, 5, 471, 6, 588, 7, 647, 8, 735, 9, 820, 10, 914, 11, 995, 12, 1100, 13]
    },
    "page:articles/co-creation-notes": {
      "text": "\u54C7\uFF0C\u8FD9\u91CC\u602A\u70ED\u95F9\u7684\u6B38\uFF1F",
      "src": "/audio/ave/339e96f25486.mp3",
      "dur": 1.251,
      "steps": [45, 1, 156, 2, 216, 3, 305, 4, 386, 5, 477, 6, 560, 7, 638, 8, 735, 9, 849, 10]
    },
    "page:articles/style-specimen": {
      "text": "\u597D\u2014\u2014\u5927\u7684\u6A71\u7A97\u554A\uFF0C\u5404\u79CD\u6837\u5B50\u7684\u4E1C\u897F\u90FD\u6709~",
      "src": "/audio/ave/aef8136c54da.mp3",
      "dur": 1.741,
      "steps": [45, 1, 139, 2, 148, 3, 157, 4, 253, 5, 342, 6, 425, 7, 511, 8, 606, 9, 665, 10, 747, 11, 829, 12, 910, 13, 1005, 14, 1078, 15, 1176, 16, 1266, 17, 1354, 18, 1442, 19]
    },
    "page:projects/averita-s-dsh-plugins": {
      "text": "\u5514......DSH...\u662F\u4EC0\u4E48\uFF1F\u5927...\u70E7\u8D27?",
      "src": "/audio/ave/05d914438e26.mp3",
      "dur": 1.966,
      "steps": [45, 1, 149, 7, 354, 10, 453, 13, 658, 14, 740, 15, 834, 16, 941, 17, 1053, 18, 1171, 21, 1375, 22, 1449, 23, 1565, 24]
    },
    "page:projects/fancytext": {
      "text": "\u540C\u4E00\u4E2A\u5B57\uFF0C\u53EF\u4EE5\u6362\u597D\u591A\u79CD\u8863\u670D\u54E6\u3002",
      "src": "/audio/ave/20e3c4a285eb.mp3",
      "dur": 1.634,
      "steps": [45, 1, 120, 2, 199, 3, 291, 4, 396, 5, 456, 6, 531, 7, 620, 8, 719, 9, 797, 10, 879, 11, 966, 12, 1042, 13, 1129, 14, 1233, 15]
    },
    "page:projects/inkprint": {
      "text": "\u5B83\u5728\u5B66\u4E00\u4E2A\u4EBA\u600E\u4E48\u5199\u5B57\u2026\u2026\u4F1A\u4E0D\u4F1A\u4E5F\u5B66\u4F1A\u6211\u8BF4\u8BDD\u5440\uFF1F",
      "src": "/audio/ave/be034dc5ab01.mp3",
      "dur": 2.375,
      "steps": [45, 1, 140, 2, 230, 3, 315, 4, 393, 5, 480, 6, 571, 7, 646, 8, 732, 9, 812, 10, 913, 12, 1118, 13, 1198, 14, 1278, 15, 1358, 16, 1433, 17, 1517, 18, 1614, 19, 1711, 20, 1784, 21, 1878, 22, 1974, 23]
    },
    "page:projects/kimi-code-theme-editor": {
      "text": "\u54B3\u54B3\uFF0C\u843D\u4E86\u597D\u591A\u7070\u5C18......",
      "src": "/audio/ave/ac2e03436adb.mp3",
      "dur": 1.366,
      "steps": [45, 1, 141, 2, 254, 3, 314, 4, 405, 5, 486, 6, 578, 7, 667, 8, 758, 9, 872, 15]
    },
    "page:projects/memepanel": {
      "text": "\u662F\u88C5\u8868\u60C5\u5305\u7684\u62BD\u5C49\uFF01\u8981\u62C9\u5F00\u770B\u770B\u5417\uFF1F",
      "src": "/audio/ave/6e931bb43ca6.mp3",
      "dur": 1.798,
      "steps": [45, 1, 126, 2, 213, 3, 308, 4, 402, 5, 496, 6, 582, 7, 661, 8, 765, 9, 876, 10, 961, 11, 1035, 12, 1125, 13, 1208, 14, 1295, 15, 1397, 16]
    },
    "page:projects/nexus": {
      "text": "\u522B\u8D70\u4E22\u4E86\u54E6\u3002",
      "src": "/audio/ave/ba8142f52af0.mp3",
      "dur": 0.893,
      "steps": [45, 1, 138, 2, 219, 3, 304, 4, 390, 5, 491, 6]
    },
    "page:projects/personal-website": {
      "text": "\u7761\u89C9\u65F6\u4E00\u5B9A\u4F1A\u505A\u68A6\u5417\uFF1F\u505A\u68A6\u65F6\u4E00\u5B9A\u5728\u7761\u89C9\u5417\uFF1F\u7962\u559C\u6B22\u505A\u68A6\u5417\uFF1F",
      "src": "/audio/ave/fe4357b07572.mp3",
      "dur": 2.775,
      "steps": [45, 1, 137, 2, 228, 3, 315, 4, 390, 5, 478, 6, 569, 7, 660, 8, 742, 9, 847, 10, 959, 11, 1037, 12, 1119, 13, 1194, 14, 1275, 15, 1349, 16, 1445, 17, 1530, 18, 1622, 19, 1722, 20, 1834, 21, 1930, 22, 2020, 23, 2106, 24, 2185, 25, 2263, 26, 2374, 27]
    },
    "page:projects/petween": {
      "text": "\u8FD9\u91CC\u4F4F\u7740\u4F1A\u52A8\u7684\u5C0F\u5BB6\u4F19\u3002\u7962\u4E5F\u60F3\u517B\u4E00\u53EA\u5417\uFF1F",
      "src": "/audio/ave/8e059653d100.mp3",
      "dur": 2.031,
      "steps": [45, 1, 119, 2, 214, 3, 291, 4, 379, 5, 471, 6, 556, 7, 632, 8, 727, 9, 814, 10, 914, 11, 1026, 12, 1110, 13, 1188, 14, 1267, 15, 1355, 16, 1446, 17, 1533, 18, 1630, 19]
    }
  }
);

// ../../../src/scripts/ave-flow.ts
var CELL = 5;
var SPAN = 0.62;
var FPS = 15;
var WAKE = [
  [0.46, 0.53, 0.6],
  // 暗面：中浅灰（蓝偏）
  [0.63, 0.72, 0.81],
  // 灰面
  [0.79, 0.9, 0.98],
  // 微光：雾蓝
  [0.92, 0.95, 1]
  // 亮芯：近白
];
var DREAM = [
  [0.46, 0.44, 0.56],
  // 暗面：中浅灰（紫偏）
  [0.64, 0.6, 0.78],
  // 灰面
  [0.83, 0.79, 0.95],
  // 微光：薄暮紫
  [0.93, 0.91, 0.99]
  // 亮芯：近白
];
var GRAIN = [0.7, 0.55, 32];
var fract = (x) => x - Math.floor(x);
function h21(x, y) {
  x = fract(x * 123.34);
  y = fract(y * 456.21);
  const d = x * (x + 45.32) + y * (y + 45.32);
  x += d;
  y += d;
  return fract(x * y);
}
function vnoise(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = h21(ix, iy);
  const b = h21(ix + 1, iy);
  const c2 = h21(ix, iy + 1);
  const d = h21(ix + 1, iy + 1);
  return a + (b - a) * ux + (c2 - a + (d - c2 - b + a) * ux) * uy;
}
function fbm(x, y) {
  let a = 0.5;
  let s = 0;
  for (let i = 0; i < 4; i++) {
    s += a * vnoise(x, y);
    const nx = 0.8 * x + 0.6 * y;
    const ny = -0.6 * x + 0.8 * y;
    x = nx * 2.03 + 11.7;
    y = ny * 2.03 + 11.7;
    a *= 0.5;
  }
  return s;
}
function field(x, y, t) {
  const qx = fbm(x, y + t * 0.05);
  const qy = fbm(x + 5.2 - t * 0.04, y + 1.3 - t * 0.04);
  const rx = fbm(x + 2 * qx + 1.7 + t * 0.03, y + 2 * qy + 9.2 + t * 0.03);
  const ry = fbm(x + 2 * qx + 8.3 - t * 0.025, y + 2 * qy + 2.8 - t * 0.025);
  return fbm(x + 1.9 * rx, y + 1.9 * ry);
}
var BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
var bayer = (x, y) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
var smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
function colorize(P, gy, v, out) {
  const [c0, c1, c2, c3] = P;
  const k1 = smooth(0.08, 0.5, v);
  const k2 = smooth(0.5, 0.86, v);
  const band = smooth(0.6, 0.74, v) * (1 - smooth(0.78, 0.94, v)) * 0.58 * gy;
  const k3 = smooth(0.84, 1, v) * gy;
  for (let i = 0; i < 3; i++) {
    let c4 = c0[i] + (c1[i] - c0[i]) * k1;
    c4 += (c2[i] - c4) * k2;
    c4 += c3[i] * band;
    c4 += (c3[i] - c4) * k3;
    out[i] = c4;
  }
}
function createAveFlow(canvas) {
  const ctx2 = canvas.getContext("2d");
  if (!ctx2) return null;
  const [gx, gy, Lq] = GRAIN;
  const pal = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0]
  ];
  const seed = Math.random() * 40;
  let t = Math.random() * 60;
  let raf = 0;
  let last = 0;
  let img = null;
  let raw = null;
  const rgb = [0, 0, 0];
  let lo = 0.12;
  let hi = 0.7;
  function size() {
    const n = Math.max(4, Math.round(canvas.getBoundingClientRect().width / CELL)) || 10;
    if (canvas.width !== n) {
      canvas.width = canvas.height = n;
      img = null;
      raw = new Float32Array(n * n);
    }
    return n;
  }
  function draw() {
    const n = size();
    img ??= ctx2.createImageData(n, n);
    raw ??= new Float32Array(n * n);
    const f = wakeMix();
    for (let k = 0; k < 4; k++)
      for (let i = 0; i < 3; i++) pal[k][i] = DREAM[k][i] + (WAKE[k][i] - DREAM[k][i]) * f;
    let mn = 1;
    let mx = 0;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const u = ((x + 0.5) / n - 0.5) * SPAN;
        const w = (0.5 - (y + 0.5) / n) * SPAN;
        const main = Math.min(1, Math.max(0, (field(u * 0.72 + seed, w * 0.72 + seed * 0.37, t) - 0.3) / 0.42));
        const fine = field(u * 2.1 + seed * 0.6 + 31, w * 2.1 + seed * 0.2 + 17, t * 1.6) - 0.47;
        const v = Math.min(1, Math.max(0, main + fine * 0.55));
        raw[y * n + x] = v;
        if (v < mn) mn = v;
        if (v > mx) mx = v;
      }
    }
    const K = 0.12;
    lo += (mn - lo) * K;
    hi += (mx - hi) * K;
    const span = Math.max(0.18, hi - lo);
    const d = img.data;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const v = smooth(0.1, 0.92, Math.min(1, Math.max(0, (raw[y * n + x] - lo) / span)));
        colorize(pal, gy, v, rgb);
        const o = (y * n + x) * 4;
        const b = (bayer(x, y) - 0.5) * gx;
        for (let i = 0; i < 3; i++) d[o + i] = Math.floor(rgb[i] * Lq + 0.5 + b) / Lq * 255;
        d[o + 3] = 255;
      }
    }
    ctx2.putImageData(img, 0, 0);
  }
  function frame(ts) {
    raf = requestAnimationFrame(frame);
    if (ts - last < 1e3 / FPS) return;
    const dt = last ? Math.min(0.1, (ts - last) / 1e3) : 0;
    last = ts;
    t += dt * (1 - 0.45 * wakeMix());
    draw();
  }
  return {
    start() {
      if (raf) return;
      if (reducedMotion()) return draw();
      last = 0;
      raf = requestAnimationFrame(frame);
    },
    stop() {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  };
}

// ../../../src/scripts/ave-star.ts
function starPolys(L = 1, w = 0.155) {
  const v = w * L / (2 * L - w);
  const out = [];
  for (const sx of [1, -1])
    for (const sy of [1, -1])
      for (const sz of [1, -1]) {
        const V = [v * sx, v * sy, v * sz];
        const tx = [L * sx, 0, 0];
        const ty = [0, L * sy, 0];
        const tz = [0, 0, L * sz];
        const exy = [w * sx, w * sy, 0];
        const eyz = [0, w * sy, w * sz];
        const ezx = [w * sx, 0, w * sz];
        out.push([tx, exy, V, ezx], [ty, eyz, V, exy], [tz, ezx, V, eyz]);
      }
  return out;
}
function buildMesh(polys) {
  const data = [];
  for (let p of polys) {
    const n = [0, 0, 0];
    const c2 = [0, 0, 0];
    for (let i = 0; i < p.length; i++) {
      const a = p[i];
      const b = p[(i + 1) % p.length];
      n[0] += (a[1] - b[1]) * (a[2] + b[2]);
      n[1] += (a[2] - b[2]) * (a[0] + b[0]);
      n[2] += (a[0] - b[0]) * (a[1] + b[1]);
      for (let k = 0; k < 3; k++) c2[k] += a[k] / p.length;
    }
    const len = Math.hypot(...n);
    for (let k = 0; k < 3; k++) n[k] /= len;
    if (n[0] * c2[0] + n[1] * c2[1] + n[2] * c2[2] < 0) {
      p = [...p].reverse();
      for (let k = 0; k < 3; k++) n[k] = -n[k];
    }
    for (let i = 1; i < p.length - 1; i++) {
      const tri = [p[0], p[i], p[i + 1]];
      const m = [1, i + 1 === p.length - 1 ? 1 : 0, i === 1 ? 1 : 0];
      tri.forEach((q, k) => data.push(...q, ...n, k === 0 ? 1 : 0, k === 1 ? 1 : 0, k === 2 ? 1 : 0, ...m));
    }
  }
  return { data: new Float32Array(data), count: data.length / 12 };
}
var VS = `#version 300 es
in vec3 aPos; in vec3 aNor; in vec3 aBary; in vec3 aMask;
uniform mat4 uProj, uView, uModel;
out vec3 vN; out vec3 vP; out vec3 vB; out vec3 vM; out float vR;
void main() {
  vR = length(aPos);
  vec4 wp = uModel * vec4(aPos, 1.0);
  vP = wp.xyz;
  vN = normalize(mat3(uModel) * aNor);
  vB = aBary; vM = aMask;
  gl_Position = uProj * uView * wp;
}`;
var FS = `#version 300 es
precision highp float;
uniform float uPass;   // 0 \u80CC\u9762\u51FA\u5C04\uFF0C1 \u6B63\u9762
uniform float uDream;  // 0 \u9192 1 \u68A6
uniform float uColor;  // \u5F69
uniform float uAlpha;  // \u4F53\u7684\u4E0D\u900F\u660E\u5EA6
uniform float uDark;   // \u6DF1\u5E95
uniform vec4 uMask;    // \u6846\u7684\u77E9\u5F62\uFF08\u753B\u5E03\u50CF\u7D20\uFF0C\u5DE6\u4E0B\u4E3A\u539F\u70B9\uFF09\uFF1Ax0 y0 x1 y1
uniform float uMaskK;  // \u6846\u7684\u4E0D\u900F\u660E\u5EA6\uFF1A\u6846\u91CC\u90A3\u4E00\u5757\u4ECE\u5B9E\u4F53\u8FC7\u6E21\u5230\u7EBF\u6846
uniform vec3 uCam;
in vec3 vN; in vec3 vP; in vec3 vB; in vec3 vM; in float vR;
out vec4 o;
const float IOR = 1.6;

float box(vec3 d, vec3 c, float w, float h, float soft) {
  c = normalize(c);
  vec3 r = normalize(cross(vec3(0.0, 1.0, 0.0), c));
  vec3 u = cross(c, r);
  float k = dot(d, c);
  if (k <= 0.05) return 0.0;
  vec2 p = vec2(dot(d, r), dot(d, u)) / k;
  return (1.0 - smoothstep(w, w + soft, abs(p.x))) * (1.0 - smoothstep(h, h + soft, abs(p.y)));
}

vec3 env(vec3 d) {
  vec3 top = mix(vec3(0.92, 0.93, 0.98), vec3(0.95, 0.90, 0.97), uDream);
  vec3 hor = vec3(1.0, 0.985, 0.98);
  vec3 bot = mix(vec3(0.66, 0.65, 0.74), vec3(0.66, 0.58, 0.72), uDream);
  vec3 c = d.y > 0.0 ? mix(hor, top, smoothstep(0.0, 0.7, d.y)) : mix(hor, bot, smoothstep(0.0, 0.45, -d.y));
  vec3 ink = mix(vec3(0.42, 0.42, 0.52), vec3(0.46, 0.38, 0.54), uDream);
  float cs = 0.5 + 0.9 * uColor;
  vec3 ice = mix(vec3(1.0), vec3(0.70, 0.86, 1.0), cs);
  vec3 rose = mix(vec3(1.0), vec3(1.0, 0.74, 0.86), cs);
  vec3 mint = mix(vec3(1.0), vec3(0.76, 1.0, 0.90), cs);
  vec3 peach = mix(vec3(1.0), vec3(1.0, 0.86, 0.72), cs);
  vec3 lilac = mix(vec3(1.0), vec3(0.84, 0.76, 1.0), cs);
  c = mix(c, ink * 0.85, box(d, vec3(-0.95, -0.15, 0.35), 0.4, 0.8, 0.06));
  c = mix(c, ink, box(d, vec3(0.35, -0.25, -0.9), 0.45, 0.25, 0.10) * 0.7);
  c = mix(c, ink * 1.2, box(d, vec3(0.9, 0.55, 0.2), 0.12, 0.6, 0.04) * 0.7);
  c = mix(c, vec3(1.25) * lilac, box(d, vec3(-0.45, 0.7, 0.6), 0.45, 0.3, 0.03));
  c = mix(c, vec3(1.15) * ice, box(d, vec3(0.85, 0.05, 0.55), 0.09, 0.8, 0.02));
  c = mix(c, vec3(1.1) * rose, box(d, vec3(-0.25, 0.35, -0.9), 0.5, 0.25, 0.05));
  c = mix(c, vec3(1.05) * mint, box(d, vec3(-0.6, -0.55, -0.6), 0.35, 0.3, 0.06));
  c = mix(c, vec3(1.05) * peach, box(d, vec3(0.6, 0.6, -0.5), 0.25, 0.25, 0.10));
  c = mix(c, vec3(1.1) * ice, box(d, vec3(0.1, -0.8, 0.6), 0.5, 0.15, 0.05) * 0.8);
  return c;
}

vec3 film(float x) { return 0.5 + 0.5 * cos(6.2832 * (x * 1.7 + vec3(0.0, 0.33, 0.67))); }

float edge() {
  vec3 fw = fwidth(vB);
  vec3 eb = smoothstep(vec3(0.0), fw * 1.3, vB);
  vec3 em = mix(vec3(1.0), eb, vM);
  return 1.0 - min(min(em.x, em.y), em.z);
}

// \u843D\u5728\u6846\u91CC\u7684\u90A3\u4E00\u5757\u53EA\u753B\u68F1\u7EBF\uFF1A\u9694\u7740\u78E8\u7802\u770B\u8FC7\u53BB\uFF0C\u661F\u53EA\u5269\u8F6E\u5ED3
float wire() {
  vec2 p = gl_FragCoord.xy;
  float inside = step(uMask.x, p.x) * step(p.x, uMask.z) * step(uMask.y, p.y) * step(p.y, uMask.w);
  return inside * uMaskK;
}

void main() {
  vec3 I = normalize(vP - uCam);
  float w = wire();
  vec3 wc = mix(vec3(0.42, 0.40, 0.58), vec3(0.86, 0.86, 0.96), uDark); // \u7EBF\u6846\u7684\u58A8\u8272
  float wf = smoothstep(0.06, 0.3, vR); // \u7EBF\u6846\u5728\u4E2D\u5FC3\u4E5F\u6DE1\u4E00\u70B9\uFF0C\u4F46\u6BD4\u5B9E\u4F53\u90A3\u8FB9\u7559\u5F97\u591A
  vec3 N = normalize(vN);
  vec3 tint = mix(vec3(0.96, 0.96, 1.0), vec3(0.99, 0.94, 1.0), uDream);
  float disp = mix(0.012, 0.045, uColor) * (1.0 + 0.6 * uDream);

  if (uPass < 0.5) {
    vec3 n = -N;
    vec3 col;
    for (int i = 0; i < 3; i++) {
      vec3 r = refract(I, n, IOR + (float(i) - 1.0) * disp);
      vec3 s = dot(r, r) < 1e-4 ? env(reflect(I, n)) * 0.85 : env(r);
      col[i] = i == 0 ? s.r : (i == 1 ? s.g : s.b);
    }
    float l = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(l), col, mix(0.55, 1.0, uColor)) * tint;
    float wb = edge() * 0.14 * wf; // \u80CC\u9762\u7684\u68F1\uFF1A\u66F4\u6DE1\uFF0C\u50CF\u900F\u8FC7\u53BB\u7684\u90A3\u4E00\u5C42
    o = mix(vec4(col * uAlpha, uAlpha), vec4(wc * wb, wb), w);
    return;
  }

  float ndv = max(dot(-I, N), 0.0);
  float F = 0.06 + 0.94 * pow(1.0 - ndv, 5.0);
  vec3 R = reflect(I, N);
  vec3 refl = env(R) * mix(vec3(1.0), film(ndv), 0.15 + 0.4 * uColor);
  vec3 refr = env(refract(I, N, 1.0 / IOR)) * tint;
  float k = 0.12;
  vec3 col = refl * F + refr * k * (1.0 - F);
  float a = F + k * (1.0 - F);
  float spec = pow(max(dot(R, normalize(vec3(-0.45, 0.7, 0.6))), 0.0), 600.0) * 1.6;
  col += vec3(spec); a += spec;
  // \u68F1\u7EBF\uFF1A\u6D45\u5E95\u4E0A\u662F\u6DE1\u8584\u66AE\u7070\uFF08\u767D\u68F1\u5728\u767D\u5E95\u4E0A\u4F1A\u65AD\uFF09\uFF0C\u6DF1\u5E95\u4E0A\u662F\u4EAE\u68F1\uFF1B\u4E2D\u5FC3\u4E0D\u753B\u7EBF\uFF0C\u4E00\u4F53\u7531\u523B\u9762\u660E\u6697\u8BFB\u51FA
  vec3 ec = mix(vec3(0.58, 0.56, 0.70), vec3(1.0), uDark);
  float e = edge();
  float ew = e * 0.42 * smoothstep(0.14, 0.5, vR);
  col = col * (1.0 - ew) + ec * ew;
  a = a * (1.0 - ew) + ew;
  float wl = e * 0.38 * wf;
  o = mix(vec4(col, clamp(a, 0.0, 1.0)), vec4(wc * wl, wl), w);
}`;
var D = Math.PI / 180;
var qAxis = (x, y, z, deg) => {
  const l = Math.hypot(x, y, z);
  const s = Math.sin(deg * D / 2) / l;
  return [x * s, y * s, z * s, Math.cos(deg * D / 2)];
};
var qMul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
];
function modelMatrix(q, s) {
  const [x, y, z, w] = q;
  return new Float32Array([
    (1 - 2 * (y * y + z * z)) * s,
    2 * (x * y + z * w) * s,
    2 * (x * z - y * w) * s,
    0,
    2 * (x * y - z * w) * s,
    (1 - 2 * (x * x + z * z)) * s,
    2 * (y * z + x * w) * s,
    0,
    2 * (x * z + y * w) * s,
    2 * (y * z - x * w) * s,
    (1 - 2 * (x * x + y * y)) * s,
    0,
    0,
    0,
    0,
    1
  ]);
}
var REST = qMul(qAxis(1, 0, 0, 35.264), qAxis(0, 1, 0, 45));
var AXES = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 1, 1]];
var pick = (xs) => xs[Math.random() * xs.length | 0];
function planCurve() {
  for (; ; ) {
    const th = [pick([0, 90, 180]), pick([0, 90, 180, 270]), pick([0, 90, 180]), pick([0, 0, 120])].map((d) => d * (Math.random() < 0.5 ? -1 : 1));
    const live = th.filter((d) => d).length;
    const sum = th.reduce((a, d) => a + Math.abs(d), 0);
    if (live >= 2 && live <= 3 && sum >= 270 && sum <= 450) return th;
  }
}
function curveAt(th, s) {
  let q = REST;
  th.forEach((d, i) => d && (q = qMul(q, qAxis(...AXES[i], d * s))));
  return q;
}
var easeOut = (t) => 1 - Math.pow(1 - t, 4);
var easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
var FPS2 = 10;
var ENTER_S = 2;
var SPIN_S = 1.6;
function createAveStar(canvas, reduced, mask) {
  let gl = null;
  try {
    gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: true });
  } catch {
    return null;
  }
  if (!gl) return null;
  const sh = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || "shader");
    return s;
  };
  let prog;
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || "link");
  } catch (e) {
    console.warn("[ave-star]", e);
    return null;
  }
  gl.useProgram(prog);
  const mesh = buildMesh(starPolys());
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, mesh.data, gl.STATIC_DRAW);
  ["aPos", "aNor", "aBary", "aMask"].forEach((name, i) => {
    const loc = gl.getAttribLocation(prog, name);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 48, i * 12);
  });
  const U = (n) => gl.getUniformLocation(prog, n);
  const u = {
    proj: U("uProj"),
    view: U("uView"),
    model: U("uModel"),
    cam: U("uCam"),
    pass: U("uPass"),
    dream: U("uDream"),
    color: U("uColor"),
    alpha: U("uAlpha"),
    dark: U("uDark"),
    mask: U("uMask"),
    maskK: U("uMaskK")
  };
  const dist = 1.04 / Math.tan(8 * D);
  const f = 1 / Math.tan(8 * D);
  const near = 0.1;
  const far = 50;
  gl.uniformMatrix4fv(u.proj, false, new Float32Array([f, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, 2 * far * near / (near - far), 0]));
  gl.uniformMatrix4fv(u.view, false, new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -dist, 1]));
  gl.uniform3f(u.cam, 0, 0, dist);
  gl.uniform1f(u.color, 0.9);
  gl.uniform1f(u.alpha, 0.38);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);
  gl.clearColor(0, 0, 0, 0);
  let q = REST;
  let scale = 0;
  let anim = null;
  let raf = 0;
  let lost = false;
  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    lost = true;
    anim = null;
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  });
  function resize() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    const w = Math.round(canvas.clientWidth * dpr);
    if (w && canvas.width !== w) canvas.width = canvas.height = w;
  }
  function draw() {
    if (lost || !gl) return;
    resize();
    if (!canvas.width || !canvas.height) return;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (scale < 2e-3) return;
    gl.uniformMatrix4fv(u.model, false, modelMatrix(q, scale));
    if (mask) {
      const c2 = canvas.getBoundingClientRect();
      const k = mask.getBoundingClientRect();
      const sx = canvas.width / (c2.width || 1);
      const H = canvas.height;
      gl.uniform4f(u.mask, (k.left - c2.left) * sx, H - (k.bottom - c2.top) * sx, (k.right - c2.left) * sx, H - (k.top - c2.top) * sx);
      gl.uniform1f(u.maskK, Number(getComputedStyle(mask).opacity) || 0);
    }
    gl.cullFace(gl.FRONT);
    gl.depthFunc(gl.LESS);
    gl.depthMask(true);
    gl.colorMask(true, true, true, true);
    gl.uniform1f(u.pass, 0);
    gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.cullFace(gl.BACK);
    gl.colorMask(false, false, false, false);
    gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
    gl.colorMask(true, true, true, true);
    gl.depthMask(false);
    gl.depthFunc(gl.LEQUAL);
    gl.uniform1f(u.pass, 1);
    gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
  }
  function frame(now2) {
    raf = 0;
    const a = anim;
    if (!a || lost) return;
    const beat = Math.floor((now2 - a.t0) / 1e3 * FPS2) + 1;
    if (beat !== a.beat) {
      a.beat = beat;
      const t = Math.min(1, beat / FPS2 / a.dur);
      if (a.kind === "exit") {
        q = curveAt(a.th, 1 - easeOut(1 - t));
        scale = 1 - Math.pow(Math.max(0, (t - 0.55) / 0.45), 2);
      } else {
        q = curveAt(a.th, easeOut(t));
        if (a.kind === "enter") scale = easeOutCubic(Math.min(1, t / 0.45));
      }
      if (t >= 1) {
        q = REST;
        scale = a.kind === "exit" ? 0 : 1;
        anim = null;
        draw();
        a.done?.();
        return;
      }
    }
    draw();
    raf = requestAnimationFrame(frame);
  }
  function run(kind, dur, done) {
    anim = { kind, th: planCurve(), dur, t0: performance.now(), beat: -1, done };
    if (kind === "enter") {
      scale = 1e-3;
      draw();
    }
    if (!raf) raf = requestAnimationFrame(frame);
  }
  return {
    enter() {
      if (reduced()) {
        anim = null;
        q = REST;
        scale = 1;
        draw();
        setTimeout(draw, 400);
        return;
      }
      run("enter", ENTER_S);
    },
    spin() {
      if (reduced() || scale < 0.5) return;
      run("spin", SPIN_S);
    },
    leave(sec, done) {
      if (reduced() || sec <= 0 || scale < 2e-3) {
        anim = null;
        scale = 0;
        draw();
        return done?.();
      }
      run("exit", sec, done);
    },
    look(dark, dream) {
      if (lost || !gl) return;
      gl.uniform1f(u.dark, dark ? 1 : 0);
      gl.uniform1f(u.dream, dream ? 1 : 0);
      if (scale > 2e-3 && !anim) draw();
    }
  };
}

// ../../../src/scripts/ave.ts
var FIRST_QUIET = 2e4;
var IDLE_TICK = 25e3;
var IDLE_CHANCE = 0.35;
var IDLE_GAP = 12e4;
var STILL_AFTER = 45e3;
var CUE_GAP = 2e4;
var SESSION_CAP = 6;
var HOLD_BASE = 3200;
var HOLD_PER_CHAR = 130;
var HOLD_MAX = 9e3;
var READ_AFTER = 3;
var THEN_PAUSE = 2e3;
var ENTER_AFTER = 3;
var QUICK_OUT = 250;
var THEN_GAP = 60;
var HOLD_AFTER_HOVER = 2400;
var ANCHOR_GAP = 16;
var VIEW_PAD = 14;
var VOICE_WAIT = 1200;
var USE_FACES = false;
var OFF_KEY = "xm-ave";
var EVER_KEY = "xm-ave-ever";
var VISITED_KEY = "xm-ave-visited";
var SESSION_KEY = "xm-ave";
var PREFS_KEY = "xm-ave-prefs";
var PREFS = {
  chat: {
    def: "mid",
    opts: [
      ["off", "\u4E0D\u95F2\u804A"],
      ["low", "\u5C11"],
      ["mid", "\u5E38"],
      ["high", "\u591A"]
    ]
  },
  page: {
    def: "always",
    opts: [
      ["off", "\u4E0D\u8BF4"],
      ["ever", "\u7B2C\u4E00\u6B21"],
      ["always", "\u6BCF\u6B21"]
    ]
  },
  reveal: {
    def: "step",
    opts: [
      ["step", "\u9010\u5B57"],
      ["whole", "\u6574\u53E5"]
    ]
  },
  hold: {
    def: "mid",
    opts: [
      ["short", "\u77ED"],
      ["mid", "\u5E38"],
      ["long", "\u957F"]
    ]
  },
  anchor: {
    def: "on",
    opts: [
      ["on", "\u8D34\u7740\u8BF4"],
      ["off", "\u53F3\u4E0B\u89D2"]
    ]
  }
};
function pref(k) {
  const v = store.get(localStorage, PREFS_KEY, {})[k];
  return PREFS[k].opts.some(([x]) => x === v) ? v : PREFS[k].def;
}
function setPref(k, v) {
  const all = store.get(localStorage, PREFS_KEY, {});
  if (v === PREFS[k].def) delete all[k];
  else all[k] = v;
  store.set(localStorage, PREFS_KEY, all);
}
var CHAT = {
  low: { chance: 0.2, gap: 24e4, cap: 3 },
  mid: { chance: IDLE_CHANCE, gap: IDLE_GAP, cap: SESSION_CAP },
  high: { chance: 0.5, gap: 6e4, cap: 10 }
};
var HOLD_K = { short: 0.6, mid: 1, long: 1.6 };
var root;
var face = null;
var card;
var textEl;
var sr;
var star = null;
var lines = [...AVE_LINES];
var chars = [];
var anchor = null;
var placeRaf = 0;
var speakEnd = 0;
var reading = false;
var current = null;
var pending = null;
var holdT = 0;
var hideT = 0;
var starT = 0;
var quickReturn = false;
var revealRaf = 0;
var revealDone = false;
var hovering = false;
var stopVoice2 = null;
var showToken = 0;
var flow = null;
var pageStart = Date.now();
var lastActive = Date.now();
var store = {
  get(s, k, d) {
    try {
      const v = s.getItem(k);
      return v ? JSON.parse(v) : d;
    } catch {
      return d;
    }
  },
  set(s, k, v) {
    try {
      s.setItem(k, JSON.stringify(v));
    } catch {
    }
  }
};
var session = () => ({ seen: [], n: 0, last: 0, ...store.get(sessionStorage, SESSION_KEY, {}) });
var ever = () => store.get(localStorage, EVER_KEY, []);
function isOff() {
  try {
    return localStorage.getItem(OFF_KEY) === "off";
  } catch {
    return false;
  }
}
var here = () => window.__rmPath ? window.__rmPath() : location.pathname;
var pathHits = (p) => !p || (p === "/" ? here() === "/" : here().startsWith(p));
function fresh(line) {
  const once = line.once ?? "session";
  if (once === "always") return true;
  if (once === "ever") return !ever().includes(line.id);
  return !session().seen.includes(line.id);
}
function minutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
}
function inClock(from, to) {
  const d = /* @__PURE__ */ new Date();
  const t = d.getHours() * 60 + d.getMinutes();
  const a = minutes(from);
  const b = minutes(to);
  return a <= b ? t >= a && t < b : t >= a || t < b;
}
function pick2(lines2) {
  return lines2.length ? lines2[Math.floor(Math.random() * lines2.length)] : null;
}
function cssNum(name, fallback) {
  return Number(getComputedStyle(root).getPropertyValue(name)) || fallback;
}
function cssDelay(name, fallbackMs) {
  const raw = getComputedStyle(root).getPropertyValue(name).trim();
  if (!raw) return fallbackMs;
  if (raw.endsWith("ms")) return parseFloat(raw);
  if (raw.endsWith("s")) return parseFloat(raw) * 1e3;
  return Number(raw) || fallbackMs;
}
function clipOf(line) {
  const dream = getReality() === "dream" && !!line.dream;
  const text = dream ? line.dream : line.text;
  const c2 = AVE_VOICE[dream ? `${line.id}~dream` : line.id];
  return { text, clip: c2 && c2.text === text ? c2 : null };
}
function remember(line, idle) {
  const s = session();
  const ids = [line.id, ...line.covers ?? []];
  for (const id of ids) if (!s.seen.includes(id)) s.seen.push(id);
  if (idle) s.n++;
  s.last = Date.now();
  if (line.when.on === "enter" && line.when.visitor === "new") {
    s.newcomer = true;
    try {
      localStorage.setItem(VISITED_KEY, "1");
    } catch {
    }
  }
  store.set(sessionStorage, SESSION_KEY, s);
  const e = ever();
  const add = [...line.once === "ever" ? [line.id] : [], ...line.covers ?? []].filter((id) => !e.includes(id));
  if (add.length) store.set(localStorage, EVER_KEY, [...e, ...add]);
}
function returning() {
  let visited = false;
  try {
    visited = localStorage.getItem(VISITED_KEY) === "1";
  } catch {
  }
  return visited && !session().newcomer;
}
var visitorOk = (l) => l.when.on !== "enter" || !l.when.visitor || l.when.visitor === "returning" === returning();
function build(text) {
  textEl.textContent = "";
  chars = [...text].map((ch, i) => {
    const c2 = document.createElement("span");
    c2.className = "c";
    c2.textContent = ch;
    c2.style.setProperty("--i", String(i));
    return c2;
  });
  const tail = document.createElement("span");
  tail.className = "ave-tail";
  tail.innerHTML = "<i></i><i></i><i></i>";
  const end = document.createElement("span");
  end.className = "ave-end";
  end.append(chars[chars.length - 1] ?? "", tail);
  textEl.append(...chars.slice(0, -1), end);
}
function balance() {
  textEl.style.maxWidth = "";
  const lines2 = () => new Set(chars.map((c2) => Math.round(c2.offsetTop))).size;
  const n = lines2();
  if (n < 2) return;
  const tail = textEl.querySelector(".ave-tail");
  const total = chars.reduce((w, c2) => w + c2.offsetWidth, 0) + (tail?.offsetWidth ?? 0);
  const em = chars[0].offsetWidth;
  for (let k = 1; k <= 4; k++) {
    textEl.style.maxWidth = `${Math.ceil(total / n + em * k)}px`;
    if (lines2() <= n) return;
  }
  textEl.style.maxWidth = "";
}
function paint2(n) {
  chars.forEach((c2, i) => {
    c2.classList.toggle("on", i < n);
    c2.classList.toggle("head", i < n && i >= n - 2);
  });
}
function show(line, idle = false, at) {
  if (isOff()) return;
  if (current) {
    if (!idle) pending = { line, at };
    return;
  }
  clearTimeout(hideT);
  current = line;
  const token = ++showToken;
  remember(line, idle);
  const { text, clip } = clipOf(line);
  const nextClip = line.then ? clipOf(lines.find((l) => l.id === line.then) ?? line).clip : null;
  if (nextClip) preloadVoice(nextClip.src);
  if (USE_FACES) {
    if (!face) {
      const portrait = root.querySelector(".ave-portrait");
      if (portrait) {
        face = document.createElement("img");
        face.className = "ave-face";
        face.alt = "";
        face.width = 45;
        face.height = 45;
        face.decoding = "async";
        portrait.appendChild(face);
      }
    }
    if (face) face.src = `/ave/face/${line.face ?? "smile"}.webp`;
  }
  sr.textContent = `Ave\uFF1A${text}`;
  revealDone = false;
  build(text);
  const whole = reducedMotion() || pref("reveal") === "whole";
  paint2(clip && !whole ? 0 : chars.length);
  const wasOn = !root.hidden && root.classList.contains("is-on");
  const fast = quickReturn;
  quickReturn = false;
  root.classList.toggle("is-swap", fast && !wasOn && !reducedMotion());
  root.classList.remove("is-leaving", "is-done", "is-quick");
  root.hidden = false;
  balance();
  anchor = resolveAnchor(at ?? line.at);
  root.classList.toggle("is-anchored", !!anchor);
  if (anchor) place();
  else root.style.left = root.style.top = "";
  void root.offsetWidth;
  root.classList.add("is-on");
  if (!star) {
    const starCv = root.querySelector(".ave-star");
    if (starCv) star = createAveStar(starCv, reducedMotion, card);
  }
  if (star) {
    const [r, g, b] = (getComputedStyle(card).color.match(/[\d.]+/g) || ["0", "0", "0"]).map(Number);
    star.look(0.299 * r + 0.587 * g + 0.114 * b > 140, getReality() === "dream");
    if (wasOn) star.spin();
    else {
      clearTimeout(starT);
      const wait = fast || reducedMotion() ? 0 : cssDelay("--ave-star-in-delay", 700);
      if (wait) starT = window.setTimeout(() => current && star?.enter(), wait);
      else star.enter();
    }
  }
  if (anchor) follow();
  if (!USE_FACES) flow?.start();
  if (!clip || whole) {
    speakEnd = performance.now() + (clip ? clip.dur * 1e3 + 60 : 0);
    if (clip) void playVoice(clip.src, VOICE_WAIT).then((v) => token === showToken && v && (stopVoice2 = v.stop));
    finishReveal(chars.length);
    return;
  }
  void playVoice(clip.src, VOICE_WAIT).then((v) => {
    if (token !== showToken) return v?.stop();
    if (v) stopVoice2 = v.stop;
    const delay = v ? v.delayMs : 120;
    speakEnd = performance.now() + delay + clip.dur * 1e3;
    reveal(clip.steps, delay, token);
  });
}
function reveal(steps, delayMs, token) {
  const t0 = performance.now() + delayMs;
  let i = 0;
  const frame = () => {
    if (token !== showToken) return;
    const t = performance.now() - t0;
    let n = -1;
    while (i < steps.length && steps[i] <= t) {
      n = steps[i + 1];
      i += 2;
    }
    if (n >= 0) paint2(n);
    if (i >= steps.length) return finishReveal(chars.length);
    revealRaf = requestAnimationFrame(frame);
  };
  revealRaf = requestAnimationFrame(frame);
}
function finishReveal(len) {
  revealDone = true;
  paint2(len);
  root.classList.add("is-done");
  const next = current?.then ? lines.find((l) => l.id === current.then) : void 0;
  if (next && fresh(next)) {
    if (hovering) return;
    const same = (next.at ?? "") === (current.at ?? "");
    const left = Math.max(0, speakEnd - performance.now());
    clearTimeout(holdT);
    holdT = window.setTimeout(() => same ? swapTo(next) : hide(true, true), left + (same ? THEN_PAUSE : Math.max(0, THEN_PAUSE - QUICK_OUT - THEN_GAP)));
    return;
  }
  if (!hovering) hold(Math.min(HOLD_MAX, HOLD_BASE + len * HOLD_PER_CHAR) * HOLD_K[pref("hold")]);
}
function swapTo(next) {
  if (!current || reading || isOff() || !fresh(next)) return hide();
  showToken++;
  cancelAnimationFrame(revealRaf);
  clearTimeout(holdT);
  stopVoice2?.();
  stopVoice2 = null;
  current = null;
  show(next);
}
function hold(ms) {
  clearTimeout(holdT);
  holdT = window.setTimeout(() => hide(true), ms);
}
function hide(natural = false, quick = false) {
  if (!current) return;
  const then = natural && !reading && current.then ? lines.find((l) => l.id === current.then) : void 0;
  if (then && fresh(then)) pending = { line: then, gap: THEN_GAP };
  showToken++;
  cancelAnimationFrame(revealRaf);
  clearTimeout(holdT);
  stopVoice2?.();
  stopVoice2 = null;
  current = null;
  cancelAnimationFrame(placeRaf);
  placeRaf = 0;
  removeEventListener("scroll", onMove);
  removeEventListener("resize", onMove);
  root.classList.toggle("is-quick", quick);
  root.classList.add("is-leaving");
  root.classList.remove("is-on");
  const out = quick ? QUICK_OUT : cssNum("--ave-out", 1700);
  clearTimeout(starT);
  if (quick) star?.leave(0);
  else {
    const wait = cssDelay("--ave-star-out-delay", 620);
    const sec = cssNum("--ave-star-out", 950) / 1e3;
    if (wait) starT = window.setTimeout(() => star?.leave(sec), wait);
    else star?.leave(sec);
  }
  hideT = window.setTimeout(() => {
    root.hidden = true;
    root.classList.remove("is-leaving", "is-done", "is-anchored", "is-quick", "is-swap");
    root.style.maxWidth = "";
    anchor = null;
    flow?.stop();
    const next = pending;
    pending = null;
    quickReturn = !!next && quick;
    if (next && fresh(next.line)) setTimeout(() => show(next.line, false, next.at), next.gap ?? 900);
  }, out);
}
function inView(r) {
  return r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth && r.width + r.height > 0;
}
function resolveAnchor(at) {
  if (!at || pref("anchor") === "off") return null;
  const el = typeof at === "string" ? document.querySelector(at) : at;
  return el && inView(el.getBoundingClientRect()) ? el : null;
}
var clamp2 = (v, a, b) => Math.max(a, Math.min(b, v));
function inkRect(el, box) {
  const range = document.createRange();
  range.selectNodeContents(el);
  const t = range.getBoundingClientRect();
  return t.width && t.height ? t : box;
}
function place() {
  if (!anchor) return;
  const r = anchor.getBoundingClientRect();
  const ink = inkRect(anchor, r);
  const cy = r.top + r.height / 2;
  const roomR = innerWidth - r.right - ANCHOR_GAP - VIEW_PAD;
  const roomL = r.left - ANCHOR_GAP - VIEW_PAD;
  root.style.maxWidth = "";
  root.style.left = "0px";
  const w0 = card.offsetWidth;
  const MIN = 220;
  const side = roomR >= w0 ? "r" : roomL >= w0 ? "l" : roomR >= MIN && roomR >= roomL ? "r" : roomL >= MIN ? "l" : "v";
  if (side === "r" && roomR < w0) root.style.maxWidth = `${roomR}px`;
  if (side === "l" && roomL < w0) root.style.maxWidth = `${roomL}px`;
  if (root.style.maxWidth) balance();
  const w = card.offsetWidth;
  const h = card.offsetHeight;
  const c0 = chars[0]?.getBoundingClientRect();
  const k = card.getBoundingClientRect();
  const lineY = c0 ? c0.bottom - k.top : h / 2;
  let x;
  let y;
  if (side === "r") {
    x = r.right + ANCHOR_GAP;
    y = clamp2(cy - lineY, VIEW_PAD, innerHeight - h - VIEW_PAD);
  } else if (side === "l") {
    x = r.left - ANCHOR_GAP - w;
    y = clamp2(cy - lineY, VIEW_PAD, innerHeight - h - VIEW_PAD);
  } else {
    x = clamp2(ink.left, VIEW_PAD, innerWidth - w - VIEW_PAD);
    const below = innerHeight - r.bottom - ANCHOR_GAP - VIEW_PAD >= h;
    y = below ? r.bottom + ANCHOR_GAP : r.top - ANCHOR_GAP - h;
  }
  root.style.left = `${Math.round(x)}px`;
  root.style.top = `${Math.round(y)}px`;
}
function onMove() {
  if (placeRaf) return;
  placeRaf = requestAnimationFrame(() => {
    placeRaf = 0;
    if (!current || !anchor) return;
    if (!inView(anchor.getBoundingClientRect())) return hide();
    place();
  });
}
function follow() {
  addEventListener("scroll", onMove, { passive: true });
  addEventListener("resize", onMove);
}
function cue(line, at) {
  if (isOff() || reading || !fresh(line)) return;
  if (Date.now() - session().last < CUE_GAP && !current) return;
  show(line, false, at);
}
function idleTick() {
  if (isOff() || reading || current || pending || document.hidden) return;
  if (Date.now() - pageStart < FIRST_QUIET) return;
  const chat = pref("chat");
  if (chat === "off") return;
  const c2 = CHAT[chat];
  const s = session();
  if (s.n >= c2.cap || Date.now() - s.last < c2.gap) return;
  if (Math.random() > c2.chance) return;
  const ok = (l) => fresh(l) && pathHits("path" in l.when ? l.when.path : void 0);
  const clock = AVE_LINES.filter((l) => l.when.on === "clock" && ok(l) && inClock(l.when.from, l.when.to));
  const still = Date.now() - lastActive >= STILL_AFTER ? AVE_LINES.filter((l) => l.when.on === "still" && ok(l)) : [];
  const line = pick2(clock) ?? pick2(still) ?? pick2(AVE_LINES.filter((l) => l.when.on === "idle" && ok(l)));
  if (line) show(line, true);
}
function watchEnd(lines2) {
  const main = document.querySelector("main");
  if (!main || !lines2.length) return;
  let done = false;
  const check = () => {
    if (done) return;
    if (scrollY > 200 && main.getBoundingClientRect().bottom <= innerHeight + 40) {
      done = true;
      removeEventListener("scroll", onScroll);
      const line = pick2(lines2.filter(fresh));
      if (line) setTimeout(() => cue(line), 1200);
    }
  };
  let raf = 0;
  const onScroll = () => {
    if (!raf) raf = requestAnimationFrame(() => (raf = 0, check()));
  };
  addEventListener("scroll", onScroll, { passive: true });
}
function initToggle() {
  const btns = document.querySelectorAll("[data-ave-toggle]");
  const mark = () => {
    if (isOff()) document.documentElement.dataset.ave = "off";
    else delete document.documentElement.dataset.ave;
  };
  mark();
  for (const b of btns) b.addEventListener("click", () => setTimeout(mark));
  initPrefs();
  for (const b of btns) {
    b.setAttribute("aria-pressed", String(!isOff()));
    b.addEventListener("click", () => {
      const off = !isOff();
      try {
        if (off) localStorage.setItem(OFF_KEY, "off");
        else localStorage.removeItem(OFF_KEY);
      } catch {
      }
      for (const x of btns) x.setAttribute("aria-pressed", String(!off));
      if (off) {
        pending = null;
        hide();
      }
    });
  }
}
function initPrefs() {
  for (const b of document.querySelectorAll("[data-ave-opt]")) {
    const k = b.dataset.aveOpt;
    if (!(k in PREFS)) continue;
    const v = b.querySelector("[data-v]");
    const opts = PREFS[k].opts;
    const paint3 = () => {
      const cur = pref(k);
      if (v) v.textContent = opts.find(([x]) => x === cur)?.[1] ?? "";
    };
    paint3();
    b.addEventListener("click", () => {
      const i = opts.findIndex(([x]) => x === pref(k));
      setPref(k, opts[(i + 1) % opts.length][0]);
      paint3();
    });
  }
  for (const b of document.querySelectorAll("[data-ave-reset]")) {
    const v = b.querySelector("[data-v]");
    let t = 0;
    b.addEventListener("click", () => {
      try {
        sessionStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(EVER_KEY);
        localStorage.removeItem(VISITED_KEY);
      } catch {
      }
      if (v) v.textContent = "\u597D";
      clearTimeout(t);
      t = window.setTimeout(() => v && (v.textContent = ""), 1800);
    });
  }
}
function readPages(el) {
  try {
    return JSON.parse(el.querySelector("script.ave-pages")?.textContent || "{}");
  } catch {
    return {};
  }
}
function keyOfHref(href) {
  const m = href.match(/^\/(articles|projects)\/([^/#?]+)/) || href.match(/^\/(moments)\/#(.+)$/);
  return m ? `${m[1]}/${decodeURIComponent(m[2])}` : "";
}
function pageToLine(p, after) {
  const mode = pref("page");
  if (mode === "off") return null;
  const once = mode === "ever" ? "ever" : "always";
  return { id: p.id, text: p.text, dream: p.dream, face: p.face, mood: p.mood, at: p.at, once, when: { on: "enter", path: here(), after: p.after ?? after } };
}
function watchReading(pages) {
  let t = 0;
  let line = null;
  addEventListener("xm:read", (e) => {
    clearTimeout(t);
    if (line && pending?.line.id === line.id) pending = null;
    if (current && line && current.id === line.id) hide();
    const href = e.detail?.href;
    reading = !!href;
    if (reading) pending = null;
    const p = href ? pages[keyOfHref(href)] : void 0;
    line = p ? pageToLine(p, READ_AFTER) : null;
    if (!line || isOff() || !fresh(line)) return;
    const l = line;
    if (!lines.some((x) => x.id === l.id)) lines.push(l);
    t = window.setTimeout(() => {
      if (line !== l || isOff() || !fresh(l)) return;
      if (current && current.id !== l.id) {
        pending = { line: l };
        hide();
      } else show(l);
    }, (l.when.on === "enter" ? l.when.after ?? READ_AFTER : READ_AFTER) * 1e3);
  });
}
var BOOT_WAIT = 4e3;
function afterBoot(fn) {
  const h = document.documentElement;
  if (h.classList.contains("booted")) return fn();
  let done = false;
  const go = () => {
    if (done) return;
    done = true;
    mo.disconnect();
    fn();
  };
  const mo = new MutationObserver(() => h.classList.contains("booted") && go());
  mo.observe(h, { attributes: true, attributeFilter: ["class"] });
  setTimeout(go, BOOT_WAIT);
}
function initAve() {
  initToggle();
  prefetchVoices(Object.values(AVE_VOICE).map((c2) => c2.src));
  const el = document.getElementById("ave");
  if (!el) return;
  root = el;
  const pages = readPages(el);
  const entry = el.dataset.entry;
  const page = entry && pages[entry] ? pageToLine(pages[entry], ENTER_AFTER) : null;
  if (page) lines.push(page);
  card = el.querySelector(".ave-card");
  textEl = el.querySelector(".ave-text");
  sr = el.querySelector(".ave-sr");
  if (!USE_FACES) flow = createAveFlow(el.querySelector(".ave-flow"));
  el.querySelector(".ave-x").addEventListener("click", () => {
    pending = null;
    hide();
  });
  card.addEventListener("pointerenter", () => {
    hovering = true;
    clearTimeout(holdT);
  });
  card.addEventListener("pointerleave", () => {
    hovering = false;
    if (current && revealDone) hold(HOLD_AFTER_HOVER);
  });
  card.addEventListener("focusin", () => clearTimeout(holdT));
  const enter = (page && fresh(page) ? [page] : []).concat(entry !== void 0 ? [] : AVE_LINES.filter((l) => l.when.on === "enter" && pathHits(l.when.path) && visitorOk(l) && fresh(l)).sort(
    (a, b) => ("path" in b.when ? b.when.path.length : 0) - ("path" in a.when ? a.when.path.length : 0)
  ))[0];
  if (enter && enter.when.on === "enter") {
    const wait = (enter.when.after ?? ENTER_AFTER) * 1e3;
    afterBoot(() => setTimeout(() => enter === page ? !isOff() && !reading && fresh(enter) && show(enter) : cue(enter), wait));
  }
  if (document.body.dataset.pageType === "article") {
    watchEnd(AVE_LINES.filter((l) => l.when.on === "end" && pathHits(l.when.path)));
  }
  addEventListener("xm:ave", (e) => {
    const d = e.detail;
    const line = pick2(AVE_LINES.filter((l) => l.when.on === "event" && l.when.name === d?.name && fresh(l)));
    if (line && !isOff() && fresh(line)) show(line, false, d?.at);
  });
  watchReading(pages);
  const active = () => lastActive = Date.now();
  for (const ev of ["pointermove", "pointerdown", "keydown", "wheel", "scroll", "touchstart"])
    addEventListener(ev, active, { passive: true });
  setInterval(idleTick, IDLE_TICK);
  if (false) {
    window.__ave = {
      /** 立刻说某一句（不看间隔与说过没有）；at 给选择器就贴到那个元素旁边 */
      say: (id, at) => {
        const l = lines.find((x) => x.id === id);
        if (!l) return `\u6CA1\u6709 ${id}`;
        pending = null;
        const go = () => show(l, false, at ? document.querySelector(at) : void 0);
        if (current) {
          hide();
          setTimeout(go, 950);
        } else go();
      },
      hide: () => hide(),
      /** 清掉说过的记录、间隔和「来过」（刷新后就是新访客） */
      reset: () => {
        sessionStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(EVER_KEY);
        localStorage.removeItem(VISITED_KEY);
      },
      lines: lines.map((l) => l.id)
    };
  }
}
function aveEnterRoute(read) {
  if (read) return;
  const enter = AVE_LINES.filter((l) => l.when.on === "enter" && pathHits(l.when.path) && visitorOk(l) && fresh(l)).sort(
    (a, b) => ("path" in b.when ? b.when.path.length : 0) - ("path" in a.when ? a.when.path.length : 0)
  )[0];
  if (enter && enter.when.on === "enter") setTimeout(() => cue(enter), (enter.when.after ?? ENTER_AFTER) * 1e3);
}

// chrome/entry.ts
function initChrome() {
  initSound();
  initToolstar();
  initAve();
}
export {
  aveEnterRoute,
  initChrome,
  setFace,
  setFlipper,
  setMix
};
