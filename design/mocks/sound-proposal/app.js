(() => {
  const CAT = window.SFX_CATALOG;
  const BUNDLE = window.SFX_BUNDLE || {};
  const METRICS = window.SFX_METRICS || {};

  let ctx = null, fxGain = null, panNode = null, analyser = null;
  const bufCache = new Map();
  let activeBatchId = "batch3";
  let activeDir = "i";
  let simMode = "favs"; // "favs" = 跟随 ★ 已选方案 | "dir" = 跟随当前激活方向
  let bonusViewAll = false; // false = 当前批次 4 条 | true = 全部三批 12 条对照
  let fxVol = 0.85, bgmVol = 0.45, dreamMix = 0.0, panVal = 0.0;
  let bgmOn = false, wheelAngle = 0, lastHoverTs = 0;

  // Favorite selection per spot (defaults to Batch 3 recommended mix)
  const favs = { ...CAT.presets.batch3.map };
  const bonusFavs = {
    sec_articles: "z2_sec_articles",
    sec_moments: "z_sec_moments",
    sec_projects: "z_sec_projects",
    fx_unlock: "z_fx_unlock",
  };
  const bonusSlotOf = (id) => id.replace(/^[xyz]\d*_/, "");
  const batchPrefixOf = (batchNum) => (batchNum === 3 ? "z" : batchNum === 2 ? "y" : "x");

  const resolveCue = (spot) => `${simMode === "favs" ? (favs[spot] || activeDir) : activeDir}_${spot}`;
  const resolveBonusCue = (slot) => (
    simMode === "favs" ? (bonusFavs[slot] || `${batchPrefixOf(getBatch().bonusBatch)}_${slot}`)
      : `${batchPrefixOf(getBatch().bonusBatch)}_${slot}`
  );

  const getBatch = () => CAT.batches.find((b) => b.id === activeBatchId) || CAT.batches[0];
  const getVisibleDirs = () => getBatch().dirs.map((id) => CAT.directions.find((d) => d.id === id));
  const getVisibleBonus = () => CAT.bonus.filter((b) => b.batch === getBatch().bonusBatch);

  // Native <audio> for real site BGM (zero CORS over file://)
  const wakeAudio = new Audio("../../../public/audio/wake-loop.mp3");
  const dreamAudio = new Audio("../../../public/audio/dream-loop.mp3");
  wakeAudio.loop = dreamAudio.loop = true;
  wakeAudio.preload = dreamAudio.preload = "auto";

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];

  function ensureAudio() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      fxGain = ctx.createGain();
      analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.78;
      if (ctx.createStereoPanner) {
        panNode = ctx.createStereoPanner();
        fxGain.connect(panNode);
        panNode.connect(analyser);
      } else {
        fxGain.connect(analyser);
      }
      analyser.connect(ctx.destination);
      applyFxParams();
      drawScope();
    }
    if (ctx.state === "suspended") ctx.resume();
  }

  function applyFxParams() {
    if (!fxGain || !ctx) return;
    fxGain.gain.setTargetAtTime(fxVol * fxVol, ctx.currentTime, 0.015);
    if (panNode) panNode.pan.setTargetAtTime(panVal, ctx.currentTime, 0.015);
  }

  function applyBgmMix() {
    const g = bgmOn ? bgmVol * bgmVol : 0;
    const w = Math.cos(dreamMix * Math.PI * 0.5);
    const d = Math.sin(dreamMix * Math.PI * 0.5);
    wakeAudio.volume = Math.max(0, Math.min(1, g * w));
    dreamAudio.volume = Math.max(0, Math.min(1, g * d));
    document.body.classList.toggle("dream", dreamMix >= 0.5);
    $("#mixLbl").textContent = dreamMix < 0.2 ? "醒 Wake" : dreamMix > 0.8 ? "梦 Dream" : `过渡 ${Math.round(dreamMix * 100)}%`;
  }

  async function toggleBgm() {
    bgmOn = !bgmOn;
    const btn = $("#bgmToggle");
    btn.classList.toggle("active", bgmOn);
    btn.textContent = bgmOn ? "⏸ 暂停站内 BGM" : "▶ 叠听站内 BGM";
    if (bgmOn) {
      try {
        await Promise.all([wakeAudio.play(), dreamAudio.play()]);
      } catch (e) {
        $("#nowPlaying").textContent = "BGM 需浏览器允许播放或从本地路径访问";
      }
    } else {
      wakeAudio.pause();
      dreamAudio.pause();
    }
    applyBgmMix();
  }

  async function decodeId(id) {
    if (bufCache.has(id)) return bufCache.get(id);
    const uri = BUNDLE[id];
    if (!uri) return null;
    ensureAudio();
    const b64 = uri.split(",")[1];
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const ab = await ctx.decodeAudioData(bytes.buffer.slice(0));
    bufCache.set(id, ab);
    return ab;
  }

  async function playCue(id, opts = {}) {
    ensureAudio();
    const buf = await decodeId(id);
    if (!buf) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    if (opts.jitter) src.playbackRate.value = 1 + (Math.random() * 2 - 1) * opts.jitter;
    src.connect(fxGain);
    src.start();

    const m = METRICS[id];
    $("#nowPlaying").textContent = m
      ? `${id}  |  ${m.dur_s.toFixed(2)}s · peak ${m.peak_db}dB · ${m.dom_hz}Hz`
      : id;

    const el = document.querySelector(`[data-cue="${id}"]`);
    if (el) {
      el.classList.add("playing");
      clearTimeout(el._t);
      el._t = setTimeout(() => el.classList.remove("playing"), Math.min(900, Math.max(220, (m?.dur_s || 0.4) * 700)));
    }
  }

  function animateMixTo(target, ms = 900) {
    const start = dreamMix, t0 = performance.now();
    const step = (now) => {
      const u = Math.min(1, (now - t0) / ms);
      const ease = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
      dreamMix = start + (target - start) * ease;
      $("#mixSlider").value = dreamMix.toFixed(3);
      applyBgmMix();
      if (u < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function renderBatchTabs() {
    const cur = getBatch();
    $("#batchTabs").innerHTML = CAT.batches.map((b) =>
      `<button class="btn sm ${b.id === activeBatchId ? "active" : ""}" data-batch="${b.id}">${b.label}</button>`
    ).join("");
    $("#batchNote").textContent = cur.note;
    $("#dirsTitle").textContent = cur.label;
    $("#matrixTitle").textContent = `核心交互位点矩阵（横向 ${cur.dirs.map((d) => d.toUpperCase()).join(" / ")} 对比试听）`;

    $$("#batchTabs [data-batch]").forEach((btn) => btn.addEventListener("click", () => {
      activeBatchId = btn.dataset.batch;
      const b = getBatch();
      if (!b.dirs.includes(activeDir)) activeDir = b.dirs[0];
      renderBatchTabs();
      renderDirections();
      renderMatrix();
      renderBonus();
      setActiveDir(activeDir, false);
    }));
  }

  function renderDirections() {
    const vis = getVisibleDirs();
    const grid = $("#dirsGrid");
    grid.className = "dirs" + (vis.length === 2 ? " cols-2" : vis.length === 5 ? " cols-5" : "");
    grid.innerHTML = vis.map((d, i) => `
      <div class="card dir-card ${d.id === activeDir ? "selected" : ""}" data-dir="${d.id}">
        <div class="tag">${d.code} · 快捷键 [${i + 1}]</div>
        <h3>${d.name} <span style="font-weight:400;font-size:12px;color:var(--ink-muted)">${d.en}</span></h3>
        <p>${d.tagline}</p>
        <p style="font-size:11.5px;opacity:0.86">${d.desc}</p>
        <div class="meta"><span>${d.feel}</span><button class="btn sm" data-pick-all="${d.id}">全选此案</button></div>
      </div>
    `).join("");

    $$(".dir-card").forEach((el) => el.addEventListener("click", (e) => {
      if (e.target.dataset.pickAll) {
        e.stopPropagation();
        const picked = e.target.dataset.pickAll;
        CAT.spots.forEach((s) => { favs[s.id] = picked; });
        simMode = "favs";
        setActiveDir(picked, false);
        renderMatrix();
        renderRecipe();
        return;
      }
      setActiveDir(el.dataset.dir, true);
    }));
  }

  function syncSimUI() {
    const dObj = CAT.directions.find((d) => d.id === activeDir);
    if (dObj) {
      $("#activeDirBadge").textContent = dObj.name;
      const sdl = $("#simDirLabel");
      if (sdl) sdl.textContent = dObj.name;
    }
    $("#simModeFavs")?.classList.toggle("active", simMode === "favs");
    $("#simModeDir")?.classList.toggle("active", simMode === "dir");
    const artCue = resolveBonusCue("sec_articles");
    const momCue = resolveBonusCue("sec_moments");
    const artPad = document.querySelector('[data-slot="articles"]');
    const momPad = document.querySelector('[data-slot="moments"]');
    if (artPad) artPad.dataset.special = artCue;
    if (momPad) momPad.dataset.special = momCue;
    const h = $("#padHoverHint"), c = $("#padClickHint"), t = $("#padTickHint");
    const ah = $("#padArtHint"), mh = $("#padMomHint");
    if (h) h.textContent = resolveCue("hover_crystal");
    if (c) c.textContent = resolveCue("click_confirm");
    if (t) t.textContent = resolveCue("ring_tick");
    if (ah) ah.textContent = artCue;
    if (mh) mh.textContent = momCue;
  }

  function setActiveDir(dir, switchToDirMode = false) {
    activeDir = dir;
    if (switchToDirMode) simMode = "dir";
    $$(".dir-card").forEach((c) => c.classList.toggle("selected", c.dataset.dir === dir));
    syncSimUI();
  }

  function renderMatrix() {
    const vis = getVisibleDirs();
    const thead = `<tr><th>交互位点 / 代码挂点</th>${vis.map((d) =>
      `<th>${d.code} · ${d.name}</th>`).join("")}</tr>`;
    const rows = CAT.spots.map((s) => {
      const cells = vis.map((d) => {
        const id = `${d.id}_${s.id}`;
        const m = METRICS[id] || {};
        const isFav = favs[s.id] === d.id;
        return `<td>
          <div class="cell-btn ${isFav ? "fav" : ""}" data-cue="${id}" role="button" tabindex="0">
            <div class="cell-top">
              <span class="cell-label">${s.notes[d.id]}</span>
              <button class="star-btn ${isFav ? "on" : ""}" data-fav-spot="${s.id}" data-fav-dir="${d.id}" title="设为该位点首选">★</button>
            </div>
            <div class="cell-stats">${(m.dur_s || 0).toFixed(2)}s · ${m.peak_db ?? "-"}dB · ${m.mp3_kb ?? "-"}KB</div>
          </div>
        </td>`;
      }).join("");
      return `<tr>
        <td class="spot-col">
          <div class="spot-name"><span class="kbd">${s.key}</span>${s.name}<span class="kbd">${s.priority}</span></div>
          <div class="spot-desc">${s.desc}</div>
          <div class="spot-hook">${s.hook}</div>
        </td>${cells}
      </tr>`;
    }).join("");
    $("#matrixTable").innerHTML = `<thead>${thead}</thead><tbody>${rows}</tbody>`;

    $$(".cell-btn").forEach((el) => el.addEventListener("click", (e) => {
      if (e.target.dataset.favSpot) {
        e.stopPropagation();
        favs[e.target.dataset.favSpot] = e.target.dataset.favDir;
        simMode = "favs";
        renderMatrix();
        renderRecipe();
        syncSimUI();
        return;
      }
      playCue(el.dataset.cue);
    }));
  }

  function renderBonus() {
    $("#bonusShowCur")?.classList.toggle("active", !bonusViewAll);
    $("#bonusShowAll")?.classList.toggle("active", bonusViewAll);
    const items = bonusViewAll ? CAT.bonus : getVisibleBonus();
    $("#bonusGrid").innerHTML = items.map((b) => {
      const m = METRICS[b.id] || {};
      const slot = bonusSlotOf(b.id);
      const isFav = bonusFavs[slot] === b.id;
      return `<div class="card bonus-card ${isFav ? "fav" : ""}" data-cue="${b.id}">
        <div class="cell-top">
          <div class="tag" style="font-family:var(--mono);font-size:11px;color:var(--accent)">${b.badge}</div>
          <button class="star-btn ${isFav ? "on" : ""}" data-fav-bonus-slot="${slot}" data-fav-bonus-id="${b.id}" title="设为该彩蛋首选">★</button>
        </div>
        <h4>${b.name}</h4>
        <p>${b.desc}</p>
        <div class="cell-stats" style="margin-top:8px">${b.id} · ${b.hook} · ${(m.dur_s || 0).toFixed(2)}s</div>
      </div>`;
    }).join("");
    $$(".bonus-card").forEach((el) => el.addEventListener("click", (e) => {
      if (e.target.dataset.favBonusSlot) {
        e.stopPropagation();
        bonusFavs[e.target.dataset.favBonusSlot] = e.target.dataset.favBonusId;
        simMode = "favs";
        renderBonus();
        renderRecipe();
        syncSimUI();
        return;
      }
      playCue(el.dataset.cue);
    }));
  }

  function renderRecipe() {
    const dirName = Object.fromEntries(CAT.directions.map((d) => [d.id, d.name]));
    const bonusById = Object.fromEntries(CAT.bonus.map((b) => [b.id, b]));
    const spotChips = CAT.spots.map((s) =>
      `<span class="chip">${s.name}: <b>${favs[s.id].toUpperCase()}·${dirName[favs[s.id]]}</b></span>`
    );
    const bonusChips = (CAT.bonusSlots || []).map((bs) => {
      const id = bonusFavs[bs.id];
      const b = bonusById[id];
      const tag = b ? `第${b.batch}批·${id}` : id;
      return `<span class="chip chip-bonus">${bs.name}: <b>${tag}</b></span>`;
    });
    $("#recipeChips").innerHTML = [...spotChips, ...bonusChips].join("");
  }

  function drawScope() {
    const cvs = $("#scope"), g = cvs.getContext("2d");
    const td = new Uint8Array(analyser.fftSize);
    const fd = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      requestAnimationFrame(tick);
      const w = cvs.width, h = cvs.height;
      g.clearRect(0, 0, w, h);
      analyser.getByteFrequencyData(fd);
      g.fillStyle = getComputedStyle(document.body).getPropertyValue("--accent").trim() || "#4c7da8";
      g.globalAlpha = 0.25;
      const bars = 42;
      for (let i = 0; i < bars; i++) {
        const v = fd[i * 3] / 255;
        const bh = v * h * 0.9;
        g.fillRect((i / bars) * w, h - bh, w / bars - 2, bh);
      }
      analyser.getByteTimeDomainData(td);
      g.globalAlpha = 0.92;
      g.strokeStyle = g.fillStyle;
      g.lineWidth = 1.6;
      g.beginPath();
      for (let i = 0; i < td.length; i += 4) {
        const x = (i / td.length) * w;
        const y = (td[i] / 255) * h;
        i === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
      }
      g.stroke();
    };
    tick();
  }

  function bindControls() {
    $("#bgmToggle").addEventListener("click", toggleBgm);
    $("#fxVol").addEventListener("input", (e) => {
      fxVol = +e.target.value;
      $("#fxLbl").textContent = `${Math.round(fxVol * 100)}%`;
      applyFxParams();
    });
    $("#bgmVol").addEventListener("input", (e) => {
      bgmVol = +e.target.value;
      $("#bgmLbl").textContent = `${Math.round(bgmVol * 100)}%`;
      applyBgmMix();
    });
    $("#mixSlider").addEventListener("input", (e) => {
      dreamMix = +e.target.value;
      applyBgmMix();
    });
    $("#panSlider").addEventListener("input", (e) => {
      panVal = +e.target.value;
      $("#panLbl").textContent = panVal === 0 ? "C" : (panVal < 0 ? `L${Math.round(-panVal * 100)}` : `R${Math.round(panVal * 100)}`);
      applyFxParams();
    });

    $("#simFlipBtn").addEventListener("click", () => {
      const toDream = dreamMix < 0.5;
      playCue(resolveCue(toDream ? "flip_dream" : "flip_wake"));
      animateMixTo(toDream ? 1.0 : 0.0, 900);
    });

    $("#simModeFavs")?.addEventListener("click", () => {
      simMode = "favs";
      syncSimUI();
    });
    $("#simModeDir")?.addEventListener("click", () => {
      simMode = "dir";
      syncSimUI();
    });

    $$(".crystal-pad").forEach((el) => {
      el.addEventListener("mouseenter", () => {
        const now = performance.now();
        if (now - lastHoverTs < 95) return;
        lastHoverTs = now;
        const cue = el.dataset.special || resolveCue("hover_crystal");
        playCue(cue, { jitter: 0.015 });
      });
      el.addEventListener("click", () => playCue(resolveCue("click_confirm")));
    });

    const wheelPad = $("#wheelPad"), dial = $("#wheelDial");
    const fireTick = (delta) => {
      wheelAngle += delta > 0 ? 24 : -24;
      dial.style.transform = `rotate(${wheelAngle}deg)`;
      playCue(resolveCue("ring_tick"), { jitter: 0.018 });
    };
    wheelPad.addEventListener("wheel", (e) => { e.preventDefault(); fireTick(e.deltaY); }, { passive: false });
    wheelPad.addEventListener("click", () => fireTick(1));

    $("#bonusShowCur")?.addEventListener("click", () => {
      bonusViewAll = false;
      renderBonus();
    });
    $("#bonusShowAll")?.addEventListener("click", () => {
      bonusViewAll = true;
      renderBonus();
    });

    const setBonusBatch = (batchNum) => {
      const p = batchPrefixOf(batchNum);
      for (const bs of CAT.bonusSlots || []) {
        bonusFavs[bs.id] = batchNum === 3 && bs.id === "sec_articles" ? "z2_sec_articles" : `${p}_${bs.id}`;
      }
    };

    $("#presetBatch3").addEventListener("click", () => {
      Object.assign(favs, CAT.presets.batch3.map);
      setBonusBatch(3);
      simMode = "favs";
      renderMatrix(); renderBonus(); renderRecipe(); syncSimUI();
    });
    $("#presetBatch2").addEventListener("click", () => {
      Object.assign(favs, CAT.presets.batch2.map);
      setBonusBatch(2);
      simMode = "favs";
      renderMatrix(); renderBonus(); renderRecipe(); syncSimUI();
    });
    $("#presetHybrid").addEventListener("click", () => {
      Object.assign(favs, CAT.presets.hybrid.map);
      setBonusBatch(1);
      simMode = "favs";
      renderMatrix(); renderBonus(); renderRecipe(); syncSimUI();
    });
    $("#copyRecipe").addEventListener("click", async () => {
      const lines = [
        "### AveritA 音效选型草稿",
        ...CAT.spots.map((s) => `- **${s.name}** (\`${s.id}\`): \`${favs[s.id]}_${s.id}\``),
        ...(CAT.bonusSlots || []).map((bs) => `- **${bs.name}** (\`${bs.id}\`): \`${bonusFavs[bs.id]}\``),
      ];
      try {
        await navigator.clipboard.writeText(lines.join("\n"));
        $("#copyRecipe").textContent = "✓ 已复制方案 Markdown";
        setTimeout(() => { $("#copyRecipe").textContent = "复制选型方案 Markdown"; }, 1800);
      } catch { prompt("复制以下选型方案：", lines.join("\n")); }
    });

    window.addEventListener("keydown", (e) => {
      if (e.target.tagName === "INPUT") return;
      if (e.code === "Space") { e.preventDefault(); toggleBgm(); return; }
      const vis = getVisibleDirs();
      const dIdx = ["1", "2", "3", "4", "5"].indexOf(e.key);
      if (dIdx >= 0 && dIdx < vis.length) { setActiveDir(vis[dIdx].id, true); return; }
      const spot = CAT.spots.find((s) => s.key === e.key.toUpperCase());
      if (spot) playCue(resolveCue(spot.id));
    });
  }

  renderBatchTabs();
  renderDirections();
  renderMatrix();
  renderBonus();
  renderRecipe();
  bindControls();
  setActiveDir(activeDir, false);
  applyBgmMix();

  /* ==================== Click Refinement Lab ==================== */
  const CL = CAT.clickLab;
  if (CL) {
    const clickFavs = { ...CL.defaultFavs };
    const cueOf = (role) => `${clickFavs[role]}_${role}`;

    const fixedBox = $("#clickFixedBtns");
    if (fixedBox) {
      fixedBox.innerHTML = CL.fixedCues.map((c) => {
        const m = METRICS[c.id] || {};
        return `<button class="btn sm" type="button" data-cue="${c.id}" title="${c.desc}">▶ ${c.name} <span style="opacity:.68;font-family:var(--mono)">${(m.dur_s || 0).toFixed(2)}s</span></button>`;
      }).join("");
      $$("#clickFixedBtns [data-cue]").forEach((btn) =>
        btn.addEventListener("click", () => playCue(btn.dataset.cue))
      );
    }

    const renderClickLab = () => {
      const famRow = $("#clickFamRow");
      if (famRow) {
        famRow.innerHTML = CL.families.map((f) => `
          <div class="click-fam">
            <div class="click-fam-top">
              <h4>${f.code} · ${f.name}</h4>
              <button class="btn sm" type="button" data-click-all="${f.id}">整套选用</button>
            </div>
            <p>${f.desc}</p>
          </div>
        `).join("");
        $$("[data-click-all]").forEach((btn) => btn.addEventListener("click", () => {
          const fid = btn.dataset.clickAll;
          for (const r of CL.roles) clickFavs[r.id] = fid;
          renderClickLab();
          playCue(`${fid}_click_tap`);
        }));
      }

      const tbl = $("#clickMatrix");
      if (tbl) {
        const thead = `<tr><th>点击档位 / 触发场景</th>${CL.families.map((f) => `<th>${f.code} · ${f.name}</th>`).join("")}</tr>`;
        const rows = CL.roles.map((r) => {
          const cells = CL.families.map((f) => {
            const id = `${f.id}_${r.id}`;
            const m = METRICS[id] || {};
            const isFav = clickFavs[r.id] === f.id;
            return `<td>
              <div class="cell-btn ${isFav ? "fav" : ""}" data-cue="${id}" role="button" tabindex="0">
                <div class="cell-top">
                  <span class="cell-label">${r.notes[f.id]}</span>
                  <button class="star-btn ${isFav ? "on" : ""}" data-cfav-role="${r.id}" data-cfav-fam="${f.id}" title="设为该档首选">★</button>
                </div>
                <div class="cell-stats">${(m.dur_s || 0).toFixed(2)}s · ${m.peak_db ?? "-"}dB · ${m.mp3_kb ?? "-"}KB</div>
              </div>
            </td>`;
          }).join("");
          return `<tr>
            <td class="spot-col">
              <div class="spot-name">${r.name}<span class="kbd">${r.badge}</span></div>
              <div class="spot-desc">${r.desc}</div>
            </td>${cells}
          </tr>`;
        }).join("");
        tbl.innerHTML = `<thead>${thead}</thead><tbody>${rows}</tbody>`;

        $$("#clickMatrix .cell-btn").forEach((el) => el.addEventListener("click", (e) => {
          if (e.target.dataset.cfavRole) {
            e.stopPropagation();
            clickFavs[e.target.dataset.cfavRole] = e.target.dataset.cfavFam;
            renderClickLab();
            playCue(el.dataset.cue);
            return;
          }
          playCue(el.dataset.cue);
        }));
      }

      const hint = $("#clickSelHint");
      if (hint) {
        hint.textContent = `当前模拟选型：选开 ${cueOf("click_tap")} · 收退 ${cueOf("click_back")} · 跨页 ${cueOf("click_nav")} · 外链 ${cueOf("click_out")}`;
      }
    };

    $$(".click-playground [data-pg]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const kind = btn.dataset.pg;
        if (kind === "toggle" || kind === "chip") {
          const next = btn.getAttribute("aria-pressed") !== "true";
          btn.setAttribute("aria-pressed", String(next));
          btn.classList.toggle("is-on", next);
          if (btn.textContent.includes("声道")) btn.textContent = next ? "♪ 声道开" : "♪ 声道关";
          playCue(cueOf(next ? "click_tap" : "click_back"), { jitter: 0.012 });
        } else if (kind === "seg") {
          btn.closest(".pg-seg")?.querySelectorAll(".pg-btn").forEach((x) => x.classList.toggle("is-on", x === btn));
          playCue(cueOf("click_tap"), { jitter: 0.014 });
        } else if (kind === "nav") {
          playCue(cueOf("click_nav"));
        } else if (kind === "back") {
          playCue(cueOf("click_back"));
        } else if (kind === "out") {
          playCue(cueOf("click_out"));
        }
      });
    });

    $("#copyClickRecipe")?.addEventListener("click", async () => {
      const famName = Object.fromEntries(CL.families.map((f) => [f.id, `${f.code}·${f.name}`]));
      const lines = [
        "### AveritA 分级点击音效选型",
        ...CL.roles.map((r) => `- **${r.name}** (\`${r.id}\`): \`${cueOf(r.id)}\` (${famName[clickFavs[r.id]]})`),
      ];
      try {
        await navigator.clipboard.writeText(lines.join("\n"));
        $("#copyClickRecipe").textContent = "✓ 已复制点击方案";
        setTimeout(() => { $("#copyClickRecipe").textContent = "复制点击选型方案"; }, 1800);
      } catch { prompt("复制以下点击选型方案：", lines.join("\n")); }
    });

    renderClickLab();
  }
})();
