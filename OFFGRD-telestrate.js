/* ============================================================
   OFFGRD-telestrate.js — Film Telestration Phase 1 (still-frame)
   Load local clip → scrub/pause → draw on canvas overlay → PNG export.
   Flag: ?telestrate=0|1 | localStorage.offgrd_film_telestrate | OFFGRD_CONFIG.filmTelestrate
   Phase 2 (MediaRecorder / voiceover) is intentionally not shipped.
   ============================================================ */
(function (root) {
  "use strict";

  const PALETTE = ["#c8102e", "#e67e22", "#f1c40f", "#1d7a45", "#4B9CD3", "#ffffff", "#13294B"];
  const HIT_R2 = 14 * 14;

  function isTelestrate() {
    try {
      const q = location.search || "";
      if (/[?&]telestrate=0(?:&|$)/.test(q)) return false;
      if (/[?&]telestrate=1(?:&|$)/.test(q)) return true;
      const ls = localStorage.getItem("offgrd_film_telestrate");
      if (ls === "0") return false;
      if (ls === "1") return true;
      if (root.OFFGRD_CONFIG && root.OFFGRD_CONFIG.filmTelestrate === false) return false;
      if (root.OFFGRD_CONFIG && root.OFFGRD_CONFIG.filmTelestrate) return true;
    } catch (e) {}
    return true;
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[m]));
  }

  function css() {
    return [
      "#telOv{position:fixed;inset:0;background:rgba(0,0,0,.55);display:none;align-items:flex-start;justify-content:center;padding:max(8px,env(safe-area-inset-top)) max(8px,env(safe-area-inset-right)) max(8px,env(safe-area-inset-bottom)) max(8px,env(safe-area-inset-left));z-index:80;overflow:auto;box-sizing:border-box}",
      "#telOv.show{display:flex}",
      "#telBox{background:var(--panel,#fff);color:var(--ink,#13294B);border:1px solid var(--line,#d7dde8);border-radius:14px;max-width:min(980px,calc(100vw - 16px));width:100%;max-height:min(100dvh,calc(100vh - 16px));padding:12px 14px 16px;box-shadow:0 24px 70px rgba(0,0,0,.35);box-sizing:border-box;overflow:auto;display:flex;flex-direction:column}",
      "#telBox .tel-head{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px;flex-shrink:0}",
      "#telBox .tel-head b{font-size:17px}",
      "#telStage{position:relative;background:#0b1220;border-radius:10px;overflow:hidden;min-height:160px;max-height:min(52dvh,480px);display:flex;align-items:center;justify-content:center;flex:0 1 auto}",
      "#telStage video{display:block;max-width:100%;max-height:min(52dvh,480px);width:auto;height:auto;margin:0 auto}",
      "#telCanvas{position:absolute;left:0;top:0;touch-action:none;cursor:crosshair}",
      "#telTools,#telTransport{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:10px;flex-shrink:0}",
      "#telTools .tel-btn,#telTransport .tel-btn,#telBox .tel-btn{padding:7px 11px;border-radius:8px;border:1px solid var(--line,#d7dde8);background:var(--bg,#f4f6fa);color:inherit;font-weight:700;font-size:13px;cursor:pointer}",
      "#telTools .tel-btn.on{background:#13294B;color:#fff;border-color:#13294B}",
      "#telSwatch{display:inline-flex;gap:5px;align-items:center;margin-left:4px;flex-wrap:wrap}",
      "#telSwatch button{width:22px;height:22px;border-radius:50%;border:2px solid transparent;cursor:pointer;padding:0}",
      "#telSwatch button.on{border-color:#13294B;box-shadow:0 0 0 2px #fff inset}",
      "#telScrub{flex:1;min-width:120px}",
      "#telStatus{margin:8px 0 0;font-size:12px;opacity:.85;line-height:1.45}",
      "#telEmpty{padding:48px 16px;text-align:center;color:#9aa4b2;font-weight:700}",
      "@media (max-width:560px){#telOv{padding:6px!important;align-items:stretch!important}#telBox{padding:10px 10px 14px;border-radius:10px;max-width:100vw!important;width:100%!important;max-height:100vh!important;max-height:100svh!important;height:auto!important}#telBox .tel-head{position:sticky;top:0;background:var(--panel,#fff);z-index:2}#telBox .tel-head b{font-size:15px}#telStage{max-height:42vh!important;max-height:38svh!important;min-height:120px}#telStage video,#telCanvas{max-width:100%!important;max-height:42vh!important;max-height:38svh!important}#telTools,#telTransport{flex-wrap:wrap!important}#telTools .tel-btn,#telTransport .tel-btn{padding:8px 10px;font-size:12px}#telScrub{min-width:0!important;flex:1 1 100%!important;order:5}#telSwatch{flex-wrap:wrap!important}#telStage{width:100%!important;box-sizing:border-box!important;overflow:hidden!important;position:relative!important}#telEmpty{position:absolute!important;inset:0!important;display:flex!important;align-items:center!important;justify-content:center!important;box-sizing:border-box!important;padding:22px 18px!important;font-size:13px;line-height:1.5;text-align:center}#telBox,#telBox *{box-sizing:border-box!important}#telBox video,#telBox #telCanvas,#telBox img{max-width:100%!important}#telScrub{max-width:100%}}"
    ].join("");
  }

  let _host = null;
  let _objectUrl = null;
  let _strokes = [];
  let _mode = "draw";
  let _color = PALETTE[0];
  let _drag = null;
  let _fps = 30;
  let _ro = null;

  function ensureCss() {
    if (document.getElementById("telCss")) return;
    const st = document.createElement("style");
    st.id = "telCss";
    st.textContent = css();
    document.head.appendChild(st);
  }

  function setStatus(msg) {
    const el = _host && _host.querySelector("#telStatus");
    if (el) el.textContent = msg || "";
  }

  function videoEl() { return _host && _host.querySelector("#telVideo"); }
  function canvasEl() { return _host && _host.querySelector("#telCanvas"); }

  function layoutCanvas() {
    const v = videoEl();
    const c = canvasEl();
    const stage = _host && _host.querySelector("#telStage");
    if (!v || !c || !stage) return;
    const rect = v.getBoundingClientRect();
    const sRect = stage.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      c.style.display = "none";
      return;
    }
    c.style.display = "block";
    c.width = Math.max(1, Math.round(v.videoWidth || rect.width));
    c.height = Math.max(1, Math.round(v.videoHeight || rect.height));
    c.style.width = rect.width + "px";
    c.style.height = rect.height + "px";
    c.style.left = (rect.left - sRect.left) + "px";
    c.style.top = (rect.top - sRect.top) + "px";
    paint();
  }

  function toCanvasPt(e) {
    const c = canvasEl();
    if (!c) return null;
    const r = c.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return {
      x: (e.clientX - r.left) / r.width * c.width,
      y: (e.clientY - r.top) / r.height * c.height
    };
  }

  function drawStroke(ctx, s, scaleX, scaleY) {
    if (!s) return;
    const sx = scaleX == null ? 1 : scaleX;
    const sy = scaleY == null ? 1 : scaleY;
    ctx.save();
    ctx.strokeStyle = s.color || "#c8102e";
    ctx.fillStyle = s.color || "#c8102e";
    ctx.lineWidth = Math.max(2, 3 * Math.min(sx, sy));
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (s.type === "draw" && s.pts && s.pts.length > 1) {
      ctx.beginPath();
      ctx.moveTo(s.pts[0].x * sx, s.pts[0].y * sy);
      for (let i = 1; i < s.pts.length; i++) ctx.lineTo(s.pts[i].x * sx, s.pts[i].y * sy);
      ctx.stroke();
    } else if (s.type === "arrow" && s.a && s.b) {
      const ax = s.a.x * sx, ay = s.a.y * sy, bx = s.b.x * sx, by = s.b.y * sy;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
      const ang = Math.atan2(by - ay, bx - ax);
      const head = 14 * Math.min(sx, sy);
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx - head * Math.cos(ang - 0.4), by - head * Math.sin(ang - 0.4));
      ctx.lineTo(bx - head * Math.cos(ang + 0.4), by - head * Math.sin(ang + 0.4));
      ctx.closePath();
      ctx.fill();
    } else if (s.type === "circle" && s.a && s.b) {
      const cx = ((s.a.x + s.b.x) / 2) * sx;
      const cy = ((s.a.y + s.b.y) / 2) * sy;
      const rx = Math.abs(s.b.x - s.a.x) / 2 * sx;
      const ry = Math.abs(s.b.y - s.a.y) / 2 * sy;
      ctx.beginPath();
      ctx.ellipse(cx, cy, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (s.type === "text" && s.pt && s.text) {
      ctx.font = "bold " + Math.round(18 * Math.min(sx, sy)) + "px system-ui,sans-serif";
      ctx.fillText(s.text, s.pt.x * sx, s.pt.y * sy);
    }
    ctx.restore();
  }

  function paint() {
    const c = canvasEl();
    if (!c) return;
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, c.width, c.height);
    _strokes.forEach(s => drawStroke(ctx, s));
    if (_drag && _drag.preview) drawStroke(ctx, _drag.preview);
  }

  function hitStroke(pt) {
    for (let i = _strokes.length - 1; i >= 0; i--) {
      const s = _strokes[i];
      if (s.type === "draw" && s.pts) {
        for (let j = 0; j < s.pts.length; j++) {
          const d = s.pts[j];
          const dx = d.x - pt.x, dy = d.y - pt.y;
          if (dx * dx + dy * dy <= HIT_R2) return i;
        }
      } else if (s.type === "text" && s.pt) {
        const dx = s.pt.x - pt.x, dy = s.pt.y - pt.y;
        if (dx * dx + dy * dy <= HIT_R2 * 4) return i;
      } else if ((s.type === "arrow" || s.type === "circle") && s.a && s.b) {
        const mid = { x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 };
        const dx = mid.x - pt.x, dy = mid.y - pt.y;
        if (dx * dx + dy * dy <= HIT_R2 * 6) return i;
      }
    }
    return -1;
  }

  function setMode(m) {
    _mode = m;
    if (!_host) return;
    [].forEach.call(_host.querySelectorAll("#telTools [data-telmode]"), b => {
      b.classList.toggle("on", b.getAttribute("data-telmode") === m);
    });
  }

  function setColor(c) {
    _color = c;
    if (!_host) return;
    [].forEach.call(_host.querySelectorAll("#telSwatch button"), b => {
      b.classList.toggle("on", b.getAttribute("data-c") === c);
    });
  }

  function onPointerDown(e) {
    const v = videoEl();
    if (!v || !v.src) return;
    const pt = toCanvasPt(e);
    if (!pt) return;
    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
    if (_mode === "erase") {
      const hi = hitStroke(pt);
      if (hi >= 0) { _strokes.splice(hi, 1); paint(); }
      return;
    }
    if (_mode === "text") {
      const t = prompt("Annotation text:", "");
      if (t && t.trim()) {
        _strokes.push({ type: "text", color: _color, pt: pt, text: t.trim().slice(0, 80) });
        paint();
      }
      return;
    }
    if (_mode === "draw") {
      _drag = { type: "draw", color: _color, pts: [pt], preview: null };
      _drag.preview = { type: "draw", color: _color, pts: _drag.pts };
    } else if (_mode === "arrow") {
      _drag = { type: "arrow", color: _color, a: pt, b: pt, preview: { type: "arrow", color: _color, a: pt, b: pt } };
    } else if (_mode === "circle") {
      _drag = { type: "circle", color: _color, a: pt, b: pt, preview: { type: "circle", color: _color, a: pt, b: pt } };
    }
    paint();
  }

  function onPointerMove(e) {
    if (!_drag) return;
    const pt = toCanvasPt(e);
    if (!pt) return;
    e.preventDefault();
    if (_drag.type === "draw") {
      _drag.pts.push(pt);
      _drag.preview = { type: "draw", color: _drag.color, pts: _drag.pts };
    } else {
      _drag.b = pt;
      _drag.preview = { type: _drag.type, color: _drag.color, a: _drag.a, b: _drag.b };
    }
    paint();
  }

  function onPointerUp() {
    if (!_drag) return;
    if (_drag.type === "draw" && _drag.pts && _drag.pts.length > 1) {
      _strokes.push({ type: "draw", color: _drag.color, pts: _drag.pts.slice() });
    } else if ((_drag.type === "arrow" || _drag.type === "circle") && _drag.a && _drag.b) {
      const dx = _drag.b.x - _drag.a.x, dy = _drag.b.y - _drag.a.y;
      if (dx * dx + dy * dy > 36) {
        _strokes.push({ type: _drag.type, color: _drag.color, a: _drag.a, b: _drag.b });
      }
    }
    _drag = null;
    paint();
  }

  function syncScrub() {
    const v = videoEl();
    const scrub = _host && _host.querySelector("#telScrub");
    const time = _host && _host.querySelector("#telTime");
    if (!v || !scrub) return;
    if (v.duration && isFinite(v.duration)) {
      scrub.max = String(v.duration);
      scrub.value = String(v.currentTime || 0);
    }
    if (time) {
      const cur = (v.currentTime || 0).toFixed(2);
      const dur = (v.duration && isFinite(v.duration)) ? v.duration.toFixed(2) : "—";
      time.textContent = cur + " / " + dur + "s";
    }
  }

  function stepFrame(dir) {
    const v = videoEl();
    if (!v || !v.src) return;
    v.pause();
    const dt = 1 / (_fps || 30);
    v.currentTime = Math.max(0, Math.min(v.duration || 1e9, (v.currentTime || 0) + dir * dt));
    syncScrub();
  }

  function clearClip() {
    const v = videoEl();
    if (v) {
      v.pause();
      v.removeAttribute("src");
      v.load();
    }
    if (_objectUrl) {
      try { URL.revokeObjectURL(_objectUrl); } catch (_) {}
      _objectUrl = null;
    }
    _strokes = [];
    _drag = null;
    const empty = _host && _host.querySelector("#telEmpty");
    if (empty) empty.style.display = "";
    paint();
    layoutCanvas();
    setStatus("Load a clip from your camera roll or files.");
  }

  function loadFile(file) {
    if (!file) return;
    clearClip();
    _objectUrl = URL.createObjectURL(file);
    const v = videoEl();
    const empty = _host && _host.querySelector("#telEmpty");
    if (empty) empty.style.display = "none";
    v.src = _objectUrl;
    v.load();
    setStatus("Loaded “" + (file.name || "clip") + "”. Pause on a frame, draw, then Export PNG.");
  }

  function exportPng(doUpload) {
    const v = videoEl();
    if (!v || !v.src || !v.videoWidth) {
      setStatus("Load and pause on a frame first.");
      return;
    }
    v.pause();
    const w = v.videoWidth, h = v.videoHeight;
    const out = document.createElement("canvas");
    out.width = w;
    out.height = h;
    const ctx = out.getContext("2d");
    try {
      ctx.drawImage(v, 0, 0, w, h);
    } catch (e) {
      setStatus("Could not capture this frame (browser blocked the video). Try another clip format.");
      return;
    }
    const c = canvasEl();
    const sx = c && c.width ? w / c.width : 1;
    const sy = c && c.height ? h / c.height : 1;
    _strokes.forEach(s => drawStroke(ctx, s, sx, sy));

    out.toBlob(function (blob) {
      if (!blob) {
        setStatus("Export failed.");
        return;
      }
      const name = "offgrd-telestrate-" + Date.now() + ".png";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(function () { try { URL.revokeObjectURL(url); } catch (_) {} }, 2000);
      setStatus("Downloaded " + name + ".");

      if (doUpload && root.OFFGRD_UPLOAD_LOGO) {
        setStatus("Downloaded — uploading share link…");
        root.OFFGRD_UPLOAD_LOGO("telestrate-" + Date.now(), blob).then(function (pub) {
          if (pub) {
            setStatus("Uploaded. Share URL: " + pub);
            try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(pub); } catch (_) {}
          } else {
            setStatus("Downloaded. Cloud upload unavailable (sign in as coach to share a link).");
          }
        }).catch(function () {
          setStatus("Downloaded. Cloud upload failed — file is still on your device.");
        });
      }
    }, "image/png");
  }

  function wire() {
    if (!_host) return;
    const file = _host.querySelector("#telFile");
    const loadBtn = _host.querySelector("#telLoad");
    if (loadBtn) loadBtn.onclick = () => file && file.click();
    if (file) file.onchange = () => { const f = file.files && file.files[0]; if (f) loadFile(f); file.value = ""; };

    [].forEach.call(_host.querySelectorAll("#telTools [data-telmode]"), b => {
      b.onclick = () => setMode(b.getAttribute("data-telmode"));
    });
    [].forEach.call(_host.querySelectorAll("#telSwatch button"), b => {
      b.onclick = () => setColor(b.getAttribute("data-c"));
    });

    const c = canvasEl();
    if (c) {
      c.onpointerdown = onPointerDown;
      c.onpointermove = onPointerMove;
      c.onpointerup = onPointerUp;
      c.onpointercancel = onPointerUp;
    }

    const v = videoEl();
    if (v) {
      v.onloadedmetadata = () => {
        _fps = 30;
        try {
          if (typeof v.getVideoPlaybackQuality === "function") {
            /* keep 30 default — browser APIs rarely expose nominal fps */
          }
        } catch (_) {}
        layoutCanvas();
        syncScrub();
      };
      v.onplay = () => {
        const pb = _host.querySelector("#telPlay");
        if (pb) pb.textContent = "Pause";
      };
      v.onpause = () => {
        const pb = _host.querySelector("#telPlay");
        if (pb) pb.textContent = "Play";
        layoutCanvas();
      };
      v.ontimeupdate = syncScrub;
      v.onseeked = () => { layoutCanvas(); syncScrub(); };
    }

    const playBtn = _host.querySelector("#telPlay");
    if (playBtn) playBtn.onclick = () => {
      const vv = videoEl();
      if (!vv || !vv.src) return;
      if (vv.paused) vv.play().catch(() => {});
      else vv.pause();
    };
    const back = _host.querySelector("#telBack");
    const fwd = _host.querySelector("#telFwd");
    if (back) back.onclick = () => stepFrame(-1);
    if (fwd) fwd.onclick = () => stepFrame(1);
    const scrub = _host.querySelector("#telScrub");
    if (scrub) {
      scrub.oninput = () => {
        const vv = videoEl();
        if (!vv || !vv.src) return;
        vv.pause();
        vv.currentTime = +scrub.value || 0;
      };
    }

    const undo = _host.querySelector("#telUndo");
    if (undo) undo.onclick = () => { _strokes.pop(); paint(); };
    const clearAnn = _host.querySelector("#telClearAnn");
    if (clearAnn) clearAnn.onclick = () => {
      if (!_strokes.length || confirm("Clear all drawings on this frame?")) {
        _strokes = [];
        paint();
      }
    };
    const exp = _host.querySelector("#telExport");
    if (exp) exp.onclick = () => exportPng(false);
    const share = _host.querySelector("#telShare");
    if (share) share.onclick = () => exportPng(true);
    const rec = _host.querySelector("#telRecord");
    if (rec) rec.onclick = () => setStatus("Recorded annotated video is Phase 2 — still-frame export works now on iPad Safari + desktop.");
    const close = _host.querySelector("#telClose");
    if (close) close.onclick = closeModal;
    _host.onclick = e => { if (e.target === _host) closeModal(); };

    if (typeof ResizeObserver !== "undefined") {
      _ro = new ResizeObserver(() => layoutCanvas());
      const stage = _host.querySelector("#telStage");
      if (stage) _ro.observe(stage);
    }
    window.addEventListener("resize", layoutCanvas);
  }

  function buildHtml() {
    const sw = PALETTE.map(c =>
      '<button type="button" data-c="' + c + '" style="background:' + c + '" title="' + c + '"></button>'
    ).join("");
    return ''
      + '<div id="telBox">'
      + '<div class="tel-head"><b>Film · Telestrate</b><div>'
      + '<button type="button" class="tel-btn" id="telLoad">Load clip</button> '
      + '<button type="button" class="tel-btn" id="telClose">Close</button>'
      + '</div></div>'
      + '<input type="file" id="telFile" accept="video/*" style="display:none">'
      + '<div id="telStage">'
      + '<div id="telEmpty">Load a game clip from Files or camera roll.</div>'
      + '<video id="telVideo" playsinline webkit-playsinline preload="metadata"></video>'
      + '<canvas id="telCanvas"></canvas>'
      + '</div>'
      + '<div id="telTransport">'
      + '<button type="button" class="tel-btn" id="telPlay">Play</button>'
      + '<button type="button" class="tel-btn" id="telBack" title="Back 1 frame">−1f</button>'
      + '<button type="button" class="tel-btn" id="telFwd" title="Forward 1 frame">+1f</button>'
      + '<input type="range" id="telScrub" min="0" max="1" step="0.001" value="0">'
      + '<span id="telTime" class="foot" style="font-size:12px;font-weight:700">0 / —</span>'
      + '</div>'
      + '<div id="telTools">'
      + '<button type="button" class="tel-btn on" data-telmode="draw">Draw</button>'
      + '<button type="button" class="tel-btn" data-telmode="arrow">Arrow</button>'
      + '<button type="button" class="tel-btn" data-telmode="circle">Circle</button>'
      + '<button type="button" class="tel-btn" data-telmode="text">Text</button>'
      + '<button type="button" class="tel-btn" data-telmode="erase">Erase</button>'
      + '<button type="button" class="tel-btn" id="telUndo">Undo</button>'
      + '<button type="button" class="tel-btn" id="telClearAnn">Clear drawings</button>'
      + '<span id="telSwatch">' + sw + '</span>'
      + '<span style="flex:1"></span>'
      + '<button type="button" class="tel-btn" id="telExport" style="font-weight:800">Export PNG</button>'
      + '<button type="button" class="tel-btn" id="telShare">Download + share link</button>'
      + '<button type="button" class="tel-btn" id="telRecord" disabled title="Phase 2">Record (soon)</button>'
      + '</div>'
      + '<p id="telStatus"></p>'
      + '<p class="foot" style="margin:6px 0 0;font-size:12px">Still-frame telestration — works offline on iPad Safari (Pencil) + desktop. Recorded annotated video is Phase 2. Hudl clips later.</p>'
      + '</div>';
  }

  function closeModal() {
    if (_host) _host.classList.remove("show");
    const v = videoEl();
    if (v) v.pause();
  }

  function openModal(opts) {
    opts = opts || {};
    if (!isTelestrate()) {
      if (opts.onBlocked) opts.onBlocked("Film telestration is off (?telestrate=0).");
      else alert("Film telestration is off — set localStorage.offgrd_film_telestrate=1 or remove ?telestrate=0.");
      return;
    }
    ensureCss();
    if (!_host) {
      _host = document.createElement("div");
      _host.id = "telOv";
      document.body.appendChild(_host);
    }
    _host.innerHTML = buildHtml();
    _strokes = [];
    _drag = null;
    _mode = "draw";
    _color = PALETTE[0];
    wire();
    setMode("draw");
    setColor(PALETTE[0]);
    setStatus("Load a clip from your camera roll or files.");
    _host.classList.add("show");
    if (opts.file) loadFile(opts.file);
  }

  function applyGate() {
    const on = isTelestrate();
    ["telestrateBtn", "filmTelestrateBtn"].forEach(id => {
      const b = document.getElementById(id);
      if (b) b.style.display = on ? "" : "none";
    });
    return on;
  }

  root.OFFGRD_TELESTRATE = {
    isTelestrate,
    openModal,
    closeModal,
    css,
    applyGate
  };
})(typeof window !== "undefined" ? window : globalThis);
