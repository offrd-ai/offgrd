/* ============================================================
   OFFGRD Frame Capture — Auto-Scout Capture Assistant
   Coach-initiated F1/F2 stills → scout-frames bucket + patch RPC.
   No Hudl automation. Resume via cloud clip_ref; localStorage = cursor only.
   Keys: 1=F1  2=F2  ←/→ navigate  Backspace=clear last slot  S=skip
   ============================================================ */
(function (root) {
  "use strict";

  var SKIP_REASONS = ["bad_film", "not_a_play", "other"];
  var CURSOR_KEY = "offgrd_capture_cursor_v1";
  var MAX_EDGE = 1600;
  var MAX_BYTES = 500 * 1024;
  var JPEG_Q = 0.85;

  var state = {
    open: false,
    teamId: null,
    batchId: null,
    meta: { opponent: "", week: "", side: "" },
    snaps: [],
    idx: 0,
    busy: false,
    queued: false,
    lastSlot: null,
    thumbUrls: {},
    keyHandler: null,
    superseded: false,
  };

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function cloud() {
    var b = root.OFFGRD_CALLER_BRIDGE;
    return b && b.cloud ? b.cloud : root.Cloud || null;
  }

  function teamId() {
    var b = root.OFFGRD_CALLER_BRIDGE;
    return b && b.getTeamId ? b.getTeamId() : null;
  }

  function parseClipRef(ref) {
    var out = { f1: null, f2: null };
    if (!ref) return out;
    try {
      var j =
        typeof ref === "string" && ref.charAt(0) === "{"
          ? JSON.parse(ref)
          : ref;
      out.f1 = (j && (j.f1 || j.F1)) || null;
      out.f2 = (j && (j.f2 || j.F2)) || null;
    } catch (e) {}
    return out;
  }

  function captureOf(snap) {
    try {
      var raw = snap && snap.raw;
      if (typeof raw === "string") raw = JSON.parse(raw);
      return (raw && raw.capture) || {};
    } catch (e) {
      return {};
    }
  }

  function isSkipped(snap) {
    return !!captureOf(snap).skipped;
  }

  function ordLabel(d) {
    if (d == null || d === "") return "?";
    var n = Number(d);
    if (!isFinite(n)) return String(d);
    if (n === 1) return "1st";
    if (n === 2) return "2nd";
    if (n === 3) return "3rd";
    return n + "th";
  }

  function parseRaw(snap) {
    var raw = snap && snap.raw;
    if (typeof raw === "string") {
      try {
        raw = JSON.parse(raw);
      } catch (e) {
        return {};
      }
    }
    return raw && typeof raw === "object" ? raw : {};
  }

  function rawGet(raw, aliases) {
    if (!raw) return "";
    var byNorm = Object.create(null);
    Object.keys(raw).forEach(function (k) {
      if (!k || String(k).charAt(0) === "_") return;
      byNorm[
        String(k)
          .replace(/^\uFEFF/, "")
          .replace(/\u00a0/g, " ")
          .trim()
          .toLowerCase()
          .replace(/\s+/g, " ")
      ] = k;
    });
    for (var i = 0; i < aliases.length; i++) {
      var a = String(aliases[i] || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");
      var hit = byNorm[a];
      if (hit == null) continue;
      var v = raw[hit];
      if (v == null || String(v).trim() === "") continue;
      return String(v).trim();
    }
    return "";
  }

  function snapChrome(snap, idx, total) {
    var raw = parseRaw(snap);
    var playNo =
      rawGet(raw, ["play #", "play#", "play number", "play no"]) || "";
    var dnRaw =
      snap.down != null && snap.down !== ""
        ? snap.down
        : rawGet(raw, ["dn", "down", "dwn"]);
    var distRaw =
      snap.distance != null && snap.distance !== ""
        ? snap.distance
        : rawGet(raw, ["dist", "distance", "dst", "to go"]);
    var dn = ordLabel(dnRaw);
    var dist = distRaw !== "" && distRaw != null ? distRaw : "?";
    var hash =
      (snap.hash && String(snap.hash).trim()) ||
      rawGet(raw, ["hash", "hash mark", "h"]);
    var form =
      snap.formation ||
      snap.formation_family ||
      rawGet(raw, ["off form", "off formation", "formation", "form"]) ||
      "—";
    var yl =
      rawGet(raw, ["yard ln", "yard line", "yardline", "yd ln", "yl", "ball on"]) ||
      snap.field_zone ||
      "";
    var parts = [];
    parts.push("Snap " + (idx + 1) + " of " + total);
    if (playNo) parts.push("Hudl PLAY #" + playNo);
    parts.push(dn + " & " + dist);
    if (hash) parts.push("Hash " + String(hash).toUpperCase());
    if (form) parts.push(form);
    if (yl) parts.push(/^yl\b/i.test(yl) || /zone/i.test(yl) ? yl : "YL " + yl);
    return parts.join(" · ");
  }

  function saveCursor() {
    try {
      localStorage.setItem(
        CURSOR_KEY,
        JSON.stringify({ batchId: state.batchId, idx: state.idx })
      );
    } catch (e) {}
  }

  function loadCursor(batchId) {
    try {
      var o = JSON.parse(localStorage.getItem(CURSOR_KEY) || "null");
      if (o && o.batchId === batchId && typeof o.idx === "number") return o.idx;
    } catch (e) {}
    return 0;
  }

  function ensureDom() {
    var wrap = document.getElementById("frameCapture");
    if (wrap) return wrap;
    wrap = document.createElement("div");
    wrap.className = "modalwrap";
    wrap.id = "frameCapture";
    wrap.innerHTML =
      '<div class="modal fc-modal" style="max-width:960px">' +
      '  <div class="fc-head">' +
      "    <h3>Capture frames</h3>" +
      '    <p class="foot" style="margin:0">Hudl on the matching play → paste F1 pre-snap, scrub ~1.5s → paste F2. Decision-aid stills only.</p>' +
      '    <p class="fc-guide">Elevated angle · keep both safeties + the D-line in frame</p>' +
      "  </div>" +
      '  <div id="fcProgress" class="fc-progress"></div>' +
      '  <div id="fcBody"></div>' +
      '  <div class="row fc-actions">' +
      '    <button type="button" class="ghost" id="fcPrev">← Prev</button>' +
      '    <button type="button" class="ghost" id="fcNext">Next →</button>' +
      '    <button type="button" class="ghost" id="fcSkip">Skip (S)</button>' +
      '    <button type="button" class="ghost" id="fcRun" style="margin-left:auto;border-color:var(--accent);color:var(--accent)">Run Auto-Scout</button>' +
      '    <button type="button" class="ghost" id="fcClose">Close</button>' +
      "  </div>" +
      '  <div id="fcToast" class="fc-toast" hidden role="status" aria-live="polite"></div>' +
      '  <p class="foot" id="fcMsg" style="margin-top:8px"></p>' +
      '  <p class="foot fc-keys">Keys: 1 = F1 · 2 = F2 · ← → · Backspace clear last · S skip</p>' +
      "</div>";
    document.body.appendChild(wrap);
    document.getElementById("fcPrev").onclick = function () {
      move(-1);
    };
    document.getElementById("fcNext").onclick = function () {
      move(1);
    };
    document.getElementById("fcSkip").onclick = function () {
      skipCurrent();
    };
    document.getElementById("fcRun").onclick = function () {
      runAutoScout();
    };
    document.getElementById("fcClose").onclick = function () {
      close();
    };
    wrap.addEventListener("click", function (e) {
      if (e.target === wrap) close();
    });
    wrap.addEventListener("paste", onPaste);
    return wrap;
  }

  function countF1() {
    var n = 0;
    state.snaps.forEach(function (s) {
      if (isSkipped(s)) return;
      var c = parseClipRef(s.clip_ref);
      if (c.f1) n++;
    });
    return n;
  }

  function countSkip() {
    var n = 0;
    state.snaps.forEach(function (s) {
      if (isSkipped(s)) n++;
    });
    return n;
  }

  function renderProgress() {
    var el = document.getElementById("fcProgress");
    if (!el) return;
    var f1 = countF1();
    var sk = countSkip();
    var tot = state.snaps.length;
    el.innerHTML =
      '<span class="chip">' +
      esc(state.meta.opponent || "?") +
      " · " +
      esc(state.meta.week || "") +
      "</span> " +
      '<span class="chip">' +
      f1 +
      "/" +
      tot +
      " with F1</span> " +
      (sk ? '<span class="chip">' + sk + " skipped</span> " : "") +
      (state.superseded
        ? '<span class="pill warn">BATCH SUPERSEDED</span>'
        : "");
    var run = document.getElementById("fcRun");
    if (run) {
      if (state.queued) {
        run.textContent = "Queued \u2713";
        run.disabled = true;
        run.style.borderColor = "#1d7a45";
        run.style.color = "#1d7a45";
        run.style.fontWeight = "800";
      } else {
        run.disabled = !!(state.busy || state.superseded || f1 < 1);
      }
    }
  }

  function showQueuedToast(jobId, snapCount) {
    var toast = document.getElementById("fcToast");
    var run = document.getElementById("fcRun");
    var shortId = String(jobId || "").slice(0, 8);
    var line =
      "Queued \u2713 — job " +
      (shortId ? shortId + "\u2026" : "created") +
      " (" +
      snapCount +
      " snaps). Worker picks up within ~1 min.";
    state.queued = true;
    if (run) {
      run.textContent = "Queued \u2713";
      run.disabled = true;
      run.style.borderColor = "#1d7a45";
      run.style.color = "#1d7a45";
      run.style.fontWeight = "800";
    }
    if (toast) {
      toast.hidden = false;
      toast.textContent = line;
    }
    var msg = document.getElementById("fcMsg");
    if (msg) {
      msg.textContent = line;
      msg.style.color = "#1d7a45";
      msg.style.fontWeight = "800";
    }
  }

  async function refreshThumbs(snap) {
    var C = cloud();
    var c = parseClipRef(snap && snap.clip_ref);
    var key = snap && snap.id;
    state.thumbUrls[key] = { f1: null, f2: null };
    if (!C || typeof C.signedScoutFrameUrl !== "function") return;
    try {
      if (c.f1) state.thumbUrls[key].f1 = await C.signedScoutFrameUrl(c.f1, 3600);
      if (c.f2) state.thumbUrls[key].f2 = await C.signedScoutFrameUrl(c.f2, 3600);
    } catch (e) {}
  }

  function slotHtml(slot, url, path) {
    var label = slot === "f2" ? "F2 post-snap (~1.5s)" : "F1 pre-snap";
    var hot = slot === "f2" ? "2" : "1";
    if (url) {
      return (
        '<div class="fc-slot" data-slot="' +
        slot +
        '">' +
        '<div class="fc-slot-lbl">' +
        esc(label) +
        " · key " +
        hot +
        "</div>" +
        '<img src="' +
        esc(url) +
        '" alt="' +
        esc(label) +
        '"/>' +
        '<div class="foot fc-path">' +
        esc(path || "") +
        "</div>" +
        "</div>"
      );
    }
    return (
      '<div class="fc-slot fc-slot-empty" data-slot="' +
      slot +
      '" tabindex="0">' +
      '<div class="fc-slot-lbl">' +
      esc(label) +
      " · key " +
      hot +
      "</div>" +
      '<div class="fc-slot-ph">Paste or drop image (Win+Shift+S / Cmd-Shift-4)</div>' +
      "</div>"
    );
  }

  async function renderBody() {
    var body = document.getElementById("fcBody");
    var msg = document.getElementById("fcMsg");
    if (!body) return;
    renderProgress();
    if (state.superseded) {
      body.innerHTML =
        '<div class="fc-supersede">' +
        "<b>Batch superseded.</b> This import was replaced. Close and open Capture on the new import batch — do not attach frames here." +
        "</div>";
      if (msg) msg.textContent = "";
      return;
    }
    if (!state.snaps.length) {
      body.innerHTML = '<p class="foot">No snaps in this batch.</p>';
      return;
    }
    var snap = state.snaps[state.idx];
    await refreshThumbs(snap);
    var thumbs = state.thumbUrls[snap.id] || {};
    var paths = parseClipRef(snap.clip_ref);
    var skipped = isSkipped(snap);
    var reason = captureOf(snap).reason || "";

    body.innerHTML =
      '<div class="fc-meta">' +
      esc(snapChrome(snap, state.idx, state.snaps.length)) +
      (skipped
        ? ' <span class="pill warn">skipped' +
          (reason ? ": " + esc(reason) : "") +
          "</span>"
        : "") +
      "</div>" +
      '<p class="foot fc-drift">Drift check: panel D&amp;D/formation must match the Hudl play on screen.</p>' +
      '<div class="fc-slots">' +
      slotHtml("f1", thumbs.f1, paths.f1) +
      slotHtml("f2", thumbs.f2, paths.f2) +
      "</div>" +
      '<div class="row fc-capture-btns">' +
      '<button type="button" class="ghost" id="fcPickF1">Capture F1 (1)</button>' +
      '<button type="button" class="ghost" id="fcPickF2">Capture F2 (2)</button>' +
      '<input type="file" id="fcFile" accept="image/*" style="display:none"/>' +
      "</div>";

    var pendingSlot = null;
    function arm(slot) {
      pendingSlot = slot;
      var inp = document.getElementById("fcFile");
      if (inp) {
        inp.value = "";
        inp.onclick = null;
        inp.onchange = function () {
          if (inp.files && inp.files[0]) ingestFile(pendingSlot, inp.files[0]);
        };
        inp.click();
      }
    }
    var b1 = document.getElementById("fcPickF1");
    var b2 = document.getElementById("fcPickF2");
    if (b1) b1.onclick = function () {
      arm("f1");
    };
    if (b2) b2.onclick = function () {
      arm("f2");
    };

    body.querySelectorAll(".fc-slot").forEach(function (el) {
      var slot = el.getAttribute("data-slot");
      el.addEventListener("dragover", function (e) {
        e.preventDefault();
        el.classList.add("fc-drag");
      });
      el.addEventListener("dragleave", function () {
        el.classList.remove("fc-drag");
      });
      el.addEventListener("drop", function (e) {
        e.preventDefault();
        el.classList.remove("fc-drag");
        var f =
          e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) ingestFile(slot, f);
      });
      el.addEventListener("click", function () {
        if (!thumbs[slot]) arm(slot);
      });
    });

    if (msg) {
      msg.textContent =
        "Snap " +
        (state.idx + 1) +
        "/" +
        state.snaps.length +
        " · batch " +
        String(state.batchId).slice(0, 8) +
        "…";
    }
    saveCursor();
  }

  function compressImage(fileOrBlob) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(fileOrBlob);
      var img = new Image();
      img.onload = function () {
        var w = img.naturalWidth || img.width;
        var h = img.naturalHeight || img.height;
        if (w > MAX_EDGE || h > MAX_EDGE) {
          if (w >= h) {
            h = Math.round((h * MAX_EDGE) / w);
            w = MAX_EDGE;
          } else {
            w = Math.round((w * MAX_EDGE) / h);
            h = MAX_EDGE;
          }
        }
        var canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        var q = JPEG_Q;
        function enc() {
          canvas.toBlob(
            function (blob) {
              if (!blob) return reject(new Error("JPEG encode failed"));
              if (blob.size > MAX_BYTES && q > 0.45) {
                q = Math.round((q - 0.1) * 100) / 100;
                enc();
                return;
              }
              resolve(blob);
            },
            "image/jpeg",
            q
          );
        }
        enc();
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error("Could not read image"));
      };
      img.src = url;
    });
  }

  async function assertBatchAlive() {
    var C = cloud();
    if (!C || typeof C.countScoutSnapsForBatch !== "function") return true;
    var n = await C.countScoutSnapsForBatch(state.teamId, state.batchId);
    if (!n) {
      state.superseded = true;
      await renderBody();
      var msg = document.getElementById("fcMsg");
      if (msg) {
        msg.textContent =
          "Batch superseded or deleted — frames must not attach here.";
      }
      return false;
    }
    return true;
  }

  async function ingestFile(slot, file) {
    if (state.busy || state.superseded) return;
    var msg = document.getElementById("fcMsg");
    var C = cloud();
    var snap = state.snaps[state.idx];
    if (!C || !snap) return;
    if (!(await assertBatchAlive())) return;
    state.busy = true;
    if (msg) msg.textContent = "Compressing " + slot.toUpperCase() + "…";
    try {
      var blob = await compressImage(file);
      if (msg) msg.textContent = "Uploading " + slot.toUpperCase() + "…";
      var path = await C.uploadScoutFrame(
        state.teamId,
        state.batchId,
        snap.snap_index,
        slot,
        blob
      );
      var paths = {};
      paths[slot === "f2" ? "f2" : "f1"] = path;
      /* Clear skip if re-capturing */
      await C.patchScoutSnapCapture(
        {
          team_id: state.teamId,
          import_batch_id: state.batchId,
          snap_index: snap.snap_index,
        },
        {
          clip_paths: paths,
          capture: {
            skipped: false,
            reason: null,
            at: new Date().toISOString(),
          },
        }
      );
      /* Refresh local snap from patch semantics */
      var cref = parseClipRef(snap.clip_ref);
      if (slot === "f2") cref.f2 = path;
      else cref.f1 = path;
      snap.clip_ref = JSON.stringify(cref);
      var raw = snap.raw;
      try {
        if (typeof raw === "string") raw = JSON.parse(raw);
      } catch (eR) {
        raw = {};
      }
      if (!raw || typeof raw !== "object") raw = {};
      raw.capture = Object.assign({}, raw.capture || {}, {
        skipped: false,
        reason: null,
        at: new Date().toISOString(),
      });
      snap.raw = raw;
      state.lastSlot = slot === "f2" ? "f2" : "f1";
      if (msg) {
        msg.textContent =
          slot.toUpperCase() +
          " saved (" +
          Math.round(blob.size / 1024) +
          " KB).";
      }
      /* Auto-advance after F2, or after F1 if F2 already present */
      var both = parseClipRef(snap.clip_ref);
      if (slot === "f2" || (slot === "f1" && both.f2)) {
        if (state.idx < state.snaps.length - 1) {
          state.idx++;
          state.lastSlot = null;
        }
      }
      await renderBody();
    } catch (e) {
      if (msg) {
        msg.textContent =
          "Capture failed: " + (e && e.message ? e.message : e);
      }
    } finally {
      state.busy = false;
      renderProgress();
    }
  }

  function onPaste(e) {
    if (!state.open || state.busy || state.superseded) return;
    var items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    var file = null;
    for (var i = 0; i < items.length; i++) {
      if (items[i].type && items[i].type.indexOf("image") === 0) {
        file = items[i].getAsFile();
        break;
      }
    }
    if (!file) return;
    e.preventDefault();
    var snap = state.snaps[state.idx];
    var c = parseClipRef(snap && snap.clip_ref);
    var slot = !c.f1 ? "f1" : "f2";
    ingestFile(slot, file);
  }

  async function clearLastSlot() {
    if (state.busy || state.superseded) return;
    var snap = state.snaps[state.idx];
    var C = cloud();
    if (!snap || !C) return;
    var c = parseClipRef(snap.clip_ref);
    var slot = state.lastSlot;
    if (!slot) {
      if (c.f2) slot = "f2";
      else if (c.f1) slot = "f1";
      else return;
    }
    if (!(await assertBatchAlive())) return;
    state.busy = true;
    var msg = document.getElementById("fcMsg");
    try {
      await C.patchScoutSnapCapture(
        {
          team_id: state.teamId,
          import_batch_id: state.batchId,
          snap_index: snap.snap_index,
        },
        { clear_clip: slot }
      );
      if (slot === "f2") c.f2 = null;
      else c.f1 = null;
      snap.clip_ref =
        c.f1 || c.f2
          ? JSON.stringify({ f1: c.f1 || undefined, f2: c.f2 || undefined })
          : null;
      state.lastSlot = null;
      if (msg) msg.textContent = "Cleared " + slot.toUpperCase() + ".";
      await renderBody();
    } catch (e) {
      if (msg) {
        msg.textContent = "Clear failed: " + (e && e.message ? e.message : e);
      }
    } finally {
      state.busy = false;
    }
  }

  async function skipCurrent() {
    if (state.busy || state.superseded) return;
    var reason =
      typeof prompt === "function"
        ? prompt(
            "Skip reason: bad_film | not_a_play | other",
            "bad_film"
          )
        : "bad_film";
    if (reason == null) return;
    reason = String(reason).trim().toLowerCase() || "other";
    if (SKIP_REASONS.indexOf(reason) < 0) reason = "other";
    var snap = state.snaps[state.idx];
    var C = cloud();
    if (!snap || !C) return;
    if (!(await assertBatchAlive())) return;
    state.busy = true;
    var msg = document.getElementById("fcMsg");
    try {
      await C.patchScoutSnapCapture(
        {
          team_id: state.teamId,
          import_batch_id: state.batchId,
          snap_index: snap.snap_index,
        },
        {
          capture: {
            skipped: true,
            reason: reason,
            at: new Date().toISOString(),
          },
        }
      );
      var raw = snap.raw;
      try {
        if (typeof raw === "string") raw = JSON.parse(raw);
      } catch (eR) {
        raw = {};
      }
      if (!raw || typeof raw !== "object") raw = {};
      raw.capture = {
        skipped: true,
        reason: reason,
        at: new Date().toISOString(),
      };
      snap.raw = raw;
      if (msg) msg.textContent = "Skipped (" + reason + ").";
      if (state.idx < state.snaps.length - 1) state.idx++;
      await renderBody();
    } catch (e) {
      if (msg) {
        msg.textContent = "Skip failed: " + (e && e.message ? e.message : e);
      }
    } finally {
      state.busy = false;
    }
  }

  function move(delta) {
    if (!state.snaps.length) return;
    var next = state.idx + delta;
    if (next < 0 || next >= state.snaps.length) return;
    state.idx = next;
    state.lastSlot = null;
    renderBody();
  }

  async function runAutoScout() {
    if (state.busy || state.superseded || state.queued) return;
    var f1 = countF1();
    if (f1 < 1) return;
    var C = cloud();
    var msg = document.getElementById("fcMsg");
    var run = document.getElementById("fcRun");
    if (!C || typeof C.createScoutFramesJob !== "function") {
      if (msg) msg.textContent = "Cloud helpers missing — reload after deploy.";
      return;
    }
    if (!(await assertBatchAlive())) return;
    if (
      typeof confirm === "function" &&
      !confirm(
        "Queue Auto-Scout for " +
          f1 +
          " snaps with F1?\n\nWorker will tag defense via cv-def-v2. Review queue after."
      )
    ) {
      return;
    }
    state.busy = true;
    if (run) {
      run.textContent = "Queuing\u2026";
      run.disabled = true;
    }
    if (msg) {
      msg.textContent = "Queuing job\u2026";
      msg.style.color = "";
      msg.style.fontWeight = "";
    }
    try {
      var job = await C.createScoutFramesJob({
        team_id: state.teamId,
        import_batch_id: state.batchId,
        opponent: state.meta.opponent || null,
        clip_count: f1,
      });
      showQueuedToast(job && job.id, f1);
    } catch (e) {
      if (run) {
        run.textContent = "Run Auto-Scout";
        run.style.borderColor = "var(--accent)";
        run.style.color = "var(--accent)";
        run.style.fontWeight = "";
      }
      if (msg) {
        msg.textContent =
          "Queue failed: " + (e && e.message ? e.message : e);
        msg.style.color = "var(--bad)";
        msg.style.fontWeight = "800";
      }
    } finally {
      state.busy = false;
      renderProgress();
    }
  }

  function onKey(e) {
    if (!state.open) return;
    var t = e.target;
    if (
      t &&
      (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")
    ) {
      return;
    }
    var k = e.key;
    if (k === "ArrowLeft") {
      e.preventDefault();
      move(-1);
      return;
    }
    if (k === "ArrowRight") {
      e.preventDefault();
      move(1);
      return;
    }
    if (k === "Backspace") {
      e.preventDefault();
      clearLastSlot();
      return;
    }
    if (k === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    var lower = String(k).toLowerCase();
    if (lower === "1") {
      e.preventDefault();
      document.getElementById("fcPickF1") &&
        document.getElementById("fcPickF1").click();
      return;
    }
    if (lower === "2") {
      e.preventDefault();
      document.getElementById("fcPickF2") &&
        document.getElementById("fcPickF2").click();
      return;
    }
    if (lower === "s") {
      e.preventDefault();
      skipCurrent();
    }
  }

  async function open(opts) {
    opts = opts || {};
    ensureDom();
    state.open = true;
    state.superseded = false;
    state.queued = false;
    state.teamId = opts.teamId || teamId();
    state.batchId = opts.import_batch_id || opts.batchId || null;
    state.meta = {
      opponent: opts.opponent || "",
      week: opts.week || "",
      side: opts.side || "",
    };
    state.snaps = [];
    state.idx = 0;
    state.lastSlot = null;
    state.thumbUrls = {};
    var wrap = document.getElementById("frameCapture");
    wrap.classList.add("show");
    var toast = document.getElementById("fcToast");
    if (toast) {
      toast.hidden = true;
      toast.textContent = "";
    }
    var run = document.getElementById("fcRun");
    if (run) {
      run.textContent = "Run Auto-Scout";
      run.style.borderColor = "var(--accent)";
      run.style.color = "var(--accent)";
      run.style.fontWeight = "";
    }
    var msg = document.getElementById("fcMsg");
    if (msg) {
      msg.textContent = "";
      msg.style.color = "";
      msg.style.fontWeight = "";
    }
    var body = document.getElementById("fcBody");
    if (body) body.innerHTML = '<p class="foot">Loading batch snaps…</p>';
    if (!state.keyHandler) {
      state.keyHandler = onKey;
      document.addEventListener("keydown", state.keyHandler);
    }
    var C = cloud();
    if (
      !C ||
      !state.teamId ||
      !state.batchId ||
      typeof C.listScoutSnapsForBatch !== "function"
    ) {
      if (body) {
        body.innerHTML =
          '<p class="foot">Sign in to a program to capture frames.</p>';
      }
      return;
    }
    try {
      if (!(await assertBatchAlive())) return;
      state.snaps = await C.listScoutSnapsForBatch(
        state.teamId,
        state.batchId
      );
      if (state.snaps.length && !state.meta.opponent) {
        state.meta.opponent = state.snaps[0].opponent || "";
        state.meta.week = state.snaps[0].week || "";
        state.meta.side = state.snaps[0].side || "";
      }
      var cur = loadCursor(state.batchId);
      state.idx = Math.min(Math.max(0, cur), Math.max(0, state.snaps.length - 1));
      /* Prefer first snap missing F1 (not skipped) */
      for (var i = 0; i < state.snaps.length; i++) {
        if (isSkipped(state.snaps[i])) continue;
        if (!parseClipRef(state.snaps[i].clip_ref).f1) {
          state.idx = i;
          break;
        }
      }
      await renderBody();
    } catch (e) {
      if (body) {
        body.innerHTML =
          '<p class="foot" style="color:var(--bad)">Load failed: ' +
          esc(e && e.message ? e.message : e) +
          "</p>";
      }
    }
  }

  function close() {
    state.open = false;
    saveCursor();
    var wrap = document.getElementById("frameCapture");
    if (wrap) wrap.classList.remove("show");
    if (state.keyHandler) {
      document.removeEventListener("keydown", state.keyHandler);
      state.keyHandler = null;
    }
    try {
      if (typeof root.renderImportManager === "function")
        root.renderImportManager();
      else if (typeof root.renderManager === "function") root.renderManager();
    } catch (e) {}
    try {
      if (root.OFFGRD_REFRESH_SCOUT_SNAPS) root.OFFGRD_REFRESH_SCOUT_SNAPS();
      else if (typeof root.refreshView === "function") root.refreshView();
    } catch (e2) {}
  }

  root.OFFGRD_FRAME_CAPTURE = { open: open, close: close };
  root.openFrameCapture = open;
})(typeof window !== "undefined" ? window : globalThis);
