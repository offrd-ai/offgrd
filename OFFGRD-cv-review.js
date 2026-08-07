/* ============================================================
   OFFGRD CV Review — Auto-Scout P2 (cv-def-v2) + Gated Draft v1
   CV drafts shell/coverage on clean snaps (GREEN); AMBER leaves
   coverage blank with a gate_reason. Coach confirms — never auto-accept.
   Front + pressure are coach-only. Keyboard: ←/→, Enter confirm,
   0–4/6 coverage, S shell, F front family, P pressure.
   ============================================================ */
(function (root) {
  "use strict";

  /* Auto-accept thresholds — wired, MASTER OFF (gated draft does not enable this) */
  var CV_AUTO_ACCEPT = {
    enabled: false,
    coverage_shell: { minConf: 0.8 },
    coverage: { minConf: 0.85, requireF2: true },
    front_family: { minConf: 0.85 },
    never: ["front_detail", "pressure"],
  };

  var COVERAGES = [
    "cover 0",
    "cover 1",
    "cover 2",
    "cover 3",
    "cover 4",
    "cover 6",
    "2-man",
  ];
  var SHELLS = ["1-high", "2-high", "0-high"];
  var FRONT_FAMILIES = ["3-down", "4-down", "5-down"];
  var FRONT_DETAILS = [
    "4-3",
    "3-4",
    "4-2-5",
    "3-3-5",
    "4-4",
    "5-2",
    "6-1",
    "bear",
    "goal-line",
  ];
  var PRESSURES = ["pressure", "none"];

  var state = {
    open: false,
    teamId: null,
    batchId: null,
    snaps: [],
    idx: 0,
    draft: {
      front: null,
      coverage_shell: null,
      coverage: null,
      pressure: null,
    },
    cvSaid: {
      front: null,
      coverage_shell: null,
      coverage: null,
      front_detail: null,
    },
    agreement: {
      front: { match: 0, total: 0 },
      coverage_shell: { match: 0, total: 0 },
      coverage: { match: 0, total: 0 },
    },
    busy: false,
    keyHandler: null,
    /* path → signed URL (private scout-frames bucket) */
    frameUrlCache: {},
    frameHydrateToken: 0,
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

  function ensureDom() {
    var wrap = document.getElementById("cvReview");
    if (wrap) return wrap;
    wrap = document.createElement("div");
    wrap.className = "modalwrap";
    wrap.id = "cvReview";
    wrap.innerHTML =
      '<div class="modal cv-review-modal" style="max-width:920px">' +
      '  <div class="cv-review-head">' +
      "    <h3>CV review</h3>" +
      '    <p class="foot" style="margin:0">CV drafts the reps it can see clearly and hands you the rest — you confirm, it learns your call sheet. First-pass, not final word.</p>' +
      "  </div>" +
      '  <div id="cvReviewAgree" class="cv-agree"></div>' +
      '  <div id="cvReviewLaneBar" class="cv-lane-bar"></div>' +
      '  <div id="cvReviewBody"></div>' +
      '  <div class="row cv-review-actions">' +
      '    <button type="button" class="ghost" id="cvReviewPrev">← Prev</button>' +
      '    <button type="button" class="ghost" id="cvReviewNext">Next →</button>' +
      '    <button type="button" class="ghost" id="cvReviewConfirm" style="margin-left:auto;border-color:var(--good);color:var(--good)">Confirm ↵</button>' +
      '    <button type="button" class="ghost" id="cvReviewClose">Close</button>' +
      "  </div>" +
      '  <p class="foot" id="cvReviewMsg" style="margin-top:8px"></p>' +
      '  <p class="foot cv-keys">Keys: ← → · Enter confirm · 0–4/6 coverage · S shell · F front family · P coach pressure</p>' +
      "</div>";
    document.body.appendChild(wrap);
    document.getElementById("cvReviewPrev").onclick = function () {
      move(-1);
    };
    document.getElementById("cvReviewNext").onclick = function () {
      move(1);
    };
    document.getElementById("cvReviewConfirm").onclick = function () {
      confirmCurrent();
    };
    document.getElementById("cvReviewClose").onclick = function () {
      close();
    };
    wrap.addEventListener("click", function (e) {
      if (e.target === wrap) close();
    });
    return wrap;
  }

  function loadAgreement() {
    try {
      var raw = localStorage.getItem("offgrd_cv_agree_v2");
      if (!raw) return;
      var o = JSON.parse(raw);
      if (o && o.front && o.coverage_shell && o.coverage) state.agreement = o;
    } catch (e) {}
  }

  function saveAgreement() {
    try {
      localStorage.setItem("offgrd_cv_agree_v2", JSON.stringify(state.agreement));
    } catch (e) {}
  }

  function fmtAgree(field) {
    var a = state.agreement[field];
    if (!a || !a.total) return field + ": —";
    var pct = Math.round((100 * a.match) / a.total);
    return field + ": " + a.match + "/" + a.total + " (" + pct + "%)";
  }

  function renderAgree() {
    var el = document.getElementById("cvReviewAgree");
    if (!el) return;
    var aa = CV_AUTO_ACCEPT.enabled ? "ON" : "OFF";
    el.innerHTML =
      '<span class="lbl" style="margin:0">Agreement (this browser)</span> ' +
      '<span class="chip">' +
      esc(fmtAgree("front")) +
      "</span> " +
      '<span class="chip">' +
      esc(fmtAgree("coverage_shell")) +
      "</span> " +
      '<span class="chip">' +
      esc(fmtAgree("coverage")) +
      "</span> " +
      '<span class="foot">auto-accept ' +
      aa +
      "</span>";
  }

  function confOf(snap, field) {
    var c = snap && snap.confidence;
    if (!c || typeof c !== "object") return null;
    var v = c[field];
    if (v == null || v === "") return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }

  function confLabel(n) {
    if (n == null) return "";
    return Math.round(n * 100) + "%";
  }

  function cvPayload(snap) {
    var out = {
      coverage_shell: snap && snap.coverage_shell ? snap.coverage_shell : null,
      front_detail: snap && snap.front_detail ? snap.front_detail : null,
      front_family: snap && snap.front_family ? snap.front_family : null,
    };
    try {
      var raw = snap && snap.raw;
      if (typeof raw === "string") raw = JSON.parse(raw);
      var cv = raw && raw.cv ? raw.cv : null;
      if (cv) {
        out.coverage_shell = out.coverage_shell || cv.coverage_shell || null;
        out.front_detail = out.front_detail || cv.front_detail || null;
        out.front_family = out.front_family || cv.front_family || null;
      }
    } catch (e) {}
    return out;
  }

  function parseFrames(snap) {
    var f1 = null;
    var f2 = null;
    var ref = snap && snap.clip_ref;
    if (ref) {
      var t = String(ref).trim();
      if (t.charAt(0) === "{") {
        try {
          var j = JSON.parse(t);
          f1 = j.f1 || j.F1 || j.pre || null;
          f2 = j.f2 || j.F2 || j.post || null;
        } catch (e) {}
      } else if (/^https?:\/\//i.test(t) || t.indexOf("/") >= 0) {
        f1 = t;
      }
    }
    try {
      var raw = snap && snap.raw;
      if (typeof raw === "string") raw = JSON.parse(raw);
      if (raw && raw.frames) {
        f1 = f1 || raw.frames.f1 || raw.frames.F1 || null;
        f2 = f2 || raw.frames.f2 || raw.frames.F2 || null;
      }
    } catch (e2) {}
    return { f1: f1, f2: f2 };
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

  function normRawKey(h) {
    return String(h || "")
      .replace(/^\uFEFF/, "")
      .replace(/\u00a0/g, " ")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  /** Case-insensitive raw lookup — D&D often lives only in Assist raw until remap lands. */
  function rawGet(raw, aliases) {
    if (!raw) return "";
    var byNorm = Object.create(null);
    Object.keys(raw).forEach(function (k) {
      if (k && String(k).charAt(0) !== "_") byNorm[normRawKey(k)] = k;
    });
    for (var i = 0; i < aliases.length; i++) {
      var hit = byNorm[normRawKey(aliases[i])];
      if (hit == null) continue;
      var v = raw[hit];
      if (v == null || String(v).trim() === "") continue;
      return String(v).trim();
    }
    return "";
  }

  function ordDown(d) {
    if (d == null || d === "") return "";
    var n = Number(d);
    if (!isFinite(n)) return String(d);
    if (n === 1) return "1st";
    if (n === 2) return "2nd";
    if (n === 3) return "3rd";
    return n + "th";
  }

  /**
   * Coach orientation banner — Hudl PLAY # + D&D + hash + OFF FORM (+ YL).
   * Prefer normalized columns; fall back to raw Assist headers (DN/DIST/…).
   */
  function snapOrient(snap) {
    var raw = parseRaw(snap);
    var playNo =
      rawGet(raw, ["PLAY #", "Play #", "Play#", "play number", "play no"]) ||
      (snap.play_index != null ? String(snap.play_index) : "");
    var dn =
      snap.down != null && snap.down !== ""
        ? snap.down
        : rawGet(raw, ["DN", "Down", "Dn", "Dwn"]);
    var dist =
      snap.distance != null && snap.distance !== ""
        ? snap.distance
        : rawGet(raw, ["DIST", "Distance", "Dist", "To Go", "DST"]);
    var hash =
      (snap.hash != null && String(snap.hash).trim() !== ""
        ? String(snap.hash).trim()
        : "") || rawGet(raw, ["Hash", "Hash Mark", "H"]);
    var form =
      (snap.formation != null && String(snap.formation).trim() !== ""
        ? String(snap.formation).trim()
        : "") ||
      rawGet(raw, [
        "OFF FORM",
        "Off Form",
        "Off Formation",
        "Formation",
        "Form",
      ]);
    var yl =
      snap.yardline != null && snap.yardline !== ""
        ? snap.yardline
        : rawGet(raw, [
            "Yard Ln",
            "Yard Line",
            "Yardline",
            "Yd Ln",
            "YL",
            "Ball On",
          ]);
    if (!yl && snap.field_zone) yl = snap.field_zone;

    var parts = [];
    if (playNo) parts.push("Hudl PLAY #" + playNo);
    var dnLabel = ordDown(dn);
    if (dnLabel || (dist !== "" && dist != null)) {
      parts.push(
        (dnLabel || "?") +
          " & " +
          (dist !== "" && dist != null ? dist : "?")
      );
    }
    if (hash) parts.push("Hash " + String(hash).toUpperCase());
    if (form) parts.push(form);
    if (yl !== "" && yl != null) {
      var ylStr = String(yl);
      parts.push(/^yl\b/i.test(ylStr) || /zone/i.test(ylStr) ? ylStr : "YL " + ylStr);
    }
    return parts.length ? parts.join(" · ") : "";
  }

  function orientBannerHtml(snap) {
    var line = snapOrient(snap);
    if (!line) return "";
    return (
      '<div class="cv-orient" role="status">' +
      '<span class="cv-orient-mark" aria-hidden="true">\u25B6</span> ' +
      esc(line) +
      "</div>"
    );
  }

  /** Gate meta from raw.cv (Gated Draft v1). Legacy snaps inferred. */
  function gateMeta(snap) {
    var raw = parseRaw(snap);
    var cv = (raw && raw.cv) || {};
    var lane = String(cv.gate_lane || "").toLowerCase();
    var reason = cv.gate_reason || null;
    if (lane !== "green" && lane !== "amber") {
      /* Pre-gate queues: coverage present → quick-confirm; blank → coach-required */
      if (snap && snap.coverage) {
        lane = "green";
        reason = null;
      } else {
        lane = "amber";
        reason = reason || "you tag coverage";
      }
    }
    return { lane: lane, gate_reason: reason, gated: !!cv.gated_draft_v };
  }

  function coverageConf(snap) {
    var n = confOf(snap, "coverage");
    return n == null ? -1 : n;
  }

  /** GREEN by desc coverage conf, then AMBER grouped by gate_reason. */
  function sortReviewQueue(snaps) {
    var list = (snaps || []).slice();
    list.sort(function (a, b) {
      var ga = gateMeta(a);
      var gb = gateMeta(b);
      var aGreen = ga.lane === "green" ? 0 : 1;
      var bGreen = gb.lane === "green" ? 0 : 1;
      if (aGreen !== bGreen) return aGreen - bGreen;
      if (aGreen === 0) {
        return coverageConf(b) - coverageConf(a);
      }
      var ra = String(ga.gate_reason || "");
      var rb = String(gb.gate_reason || "");
      if (ra !== rb) return ra < rb ? -1 : 1;
      var ia = a.snap_index != null ? Number(a.snap_index) : 0;
      var ib = b.snap_index != null ? Number(b.snap_index) : 0;
      return ia - ib;
    });
    return list;
  }

  function countLanes(snaps) {
    var g = 0;
    var a = 0;
    (snaps || []).forEach(function (s) {
      if (gateMeta(s).lane === "green") g++;
      else a++;
    });
    return { green: g, amber: a };
  }

  function laneBannerHtml(snap) {
    var g = gateMeta(snap);
    if (g.lane === "green") {
      return (
        '<div class="cv-lane cv-lane-green" role="status">' +
        "<strong>GREEN · AI draft</strong> — confirm the coverage (glance + Enter). Suggestion only until you confirm." +
        "</div>"
      );
    }
    return (
      '<div class="cv-lane cv-lane-amber" role="status">' +
      "<strong>AMBER · Coach-required</strong>" +
      (g.gate_reason
        ? ' — <span class="cv-gate-reason">' + esc(g.gate_reason) + "</span>"
        : " — tag coverage, then confirm.") +
      "</div>"
    );
  }

  function renderLaneBar() {
    var el = document.getElementById("cvReviewLaneBar");
    if (!el) return;
    var c = countLanes(state.snaps);
    if (!state.snaps.length) {
      el.innerHTML = "";
      return;
    }
    el.innerHTML =
      '<span class="cv-lane-chip cv-lane-chip-green">GREEN ' +
      c.green +
      "</span>" +
      '<span class="cv-lane-chip cv-lane-chip-amber">AMBER ' +
      c.amber +
      "</span>" +
      '<span class="foot">glance + confirm per snap</span>';
  }

  function syncActions() {
    var has = !!(state.snaps && state.snaps.length);
    var confirm = document.getElementById("cvReviewConfirm");
    var prev = document.getElementById("cvReviewPrev");
    var next = document.getElementById("cvReviewNext");
    var amberNeedsCov = false;
    if (has) {
      var cur = state.snaps[state.idx];
      var g = gateMeta(cur);
      amberNeedsCov =
        g.lane === "amber" &&
        (state.draft.coverage == null || state.draft.coverage === "");
    }
    if (confirm) {
      confirm.disabled = !has || state.busy || amberNeedsCov;
      confirm.setAttribute(
        "aria-disabled",
        has && !state.busy && !amberNeedsCov ? "false" : "true"
      );
      confirm.title = amberNeedsCov
        ? "Tag coverage before confirming (AMBER)"
        : "Confirm this snap";
      confirm.style.marginLeft = "auto";
    }
    if (prev) prev.disabled = !has || state.idx <= 0;
    if (next)
      next.disabled = !has || state.idx >= state.snaps.length - 1;
    var body = document.getElementById("cvReviewBody");
    if (body) {
      body.classList.toggle("cv-queue-empty", !has);
      body.querySelectorAll(".cv-chip").forEach(function (btn) {
        btn.disabled = !has;
      });
    }
  }

  function isHttpUrl(u) {
    return !!u && /^https?:\/\//i.test(String(u).trim());
  }

  /** One img per slot. Never put raw storage paths in src (404 on gameday host). */
  function frameHtml(path, label, slot) {
    if (!path) {
      return (
        '<div class="cv-frame cv-frame-empty" data-slot="' +
        esc(slot) +
        '">' +
        '<div class="cv-frame-lbl">' +
        esc(label) +
        "</div>" +
        '<div class="cv-frame-ph">No frame yet</div>' +
        "</div>"
      );
    }
    var ready = isHttpUrl(path)
      ? String(path).trim()
      : state.frameUrlCache[String(path)] || "";
    return (
      '<div class="cv-frame' +
      (ready ? "" : " cv-frame-loading") +
      '" data-slot="' +
      esc(slot) +
      '">' +
      '<div class="cv-frame-lbl">' +
      esc(label) +
      "</div>" +
      '<img class="cv-frame-img" alt="' +
      esc(label) +
      '" loading="lazy" data-path="' +
      esc(path) +
      '"' +
      (ready ? ' src="' + esc(ready) + '"' : "") +
      "/>" +
      (ready
        ? ""
        : '<div class="cv-frame-ph cv-frame-wait">Loading frame\u2026</div>') +
      "</div>"
    );
  }

  async function hydrateFrameImgs(paths) {
    var token = ++state.frameHydrateToken;
    var C = cloud();
    var body = document.getElementById("cvReviewBody");
    if (!body) return;
    var slots = [
      { slot: "f1", path: paths && paths.f1 },
      { slot: "f2", path: paths && paths.f2 },
    ];
    for (var i = 0; i < slots.length; i++) {
      var s = slots[i];
      if (!s.path) continue;
      var path = String(s.path);
      var url = null;
      if (isHttpUrl(path)) {
        url = path.trim();
      } else if (state.frameUrlCache[path]) {
        url = state.frameUrlCache[path];
      } else if (C && typeof C.signedScoutFrameUrl === "function") {
        try {
          url = await C.signedScoutFrameUrl(path, 3600);
          if (url) state.frameUrlCache[path] = url;
        } catch (e) {
          url = null;
        }
      }
      if (token !== state.frameHydrateToken) return; /* snap changed mid-await */
      var wrap = body.querySelector('.cv-frame[data-slot="' + s.slot + '"]');
      if (!wrap) continue;
      var img = wrap.querySelector("img.cv-frame-img");
      var wait = wrap.querySelector(".cv-frame-wait");
      if (!img) continue;
      if (url) {
        img.src = url;
        wrap.classList.remove("cv-frame-loading");
        if (wait) wait.remove();
      } else if (wait) {
        wait.textContent = "Frame unavailable";
      }
    }
  }

  function chipRow(field, options, selected, confField) {
    var conf = confOf(state.snaps[state.idx], confField || field);
    var confHtml =
      conf != null
        ? '<span class="cv-conf">' + esc(confLabel(conf)) + "</span>"
        : "";
    var chips = options
      .map(function (opt) {
        var on = String(selected || "").toLowerCase() === String(opt).toLowerCase();
        return (
          '<button type="button" class="chip cv-chip' +
          (on ? " on" : "") +
          '" data-field="' +
          esc(field) +
          '" data-val="' +
          esc(opt) +
          '">' +
          esc(opt) +
          "</button>"
        );
      })
      .join("");
    var clear =
      '<button type="button" class="chip cv-chip cv-chip-clear" data-field="' +
      esc(field) +
      '" data-val="">clear</button>';
    return (
      '<div class="cv-field">' +
      '<div class="cv-field-lbl"><span class="lbl" style="margin:0">' +
      esc(field) +
      "</span> " +
      confHtml +
      "</div>" +
      '<div class="seg cv-chips">' +
      chips +
      clear +
      "</div>" +
      "</div>"
    );
  }

  function badgeHtml(snap) {
    var errs = (snap && snap.sanity_errors) || [];
    var notes = (snap && snap.notes_flags) || [];
    if (!Array.isArray(errs)) errs = [];
    if (!Array.isArray(notes)) notes = [];
    if (!errs.length && !notes.length) return "";
    var parts = [];
    errs.forEach(function (e) {
      parts.push('<span class="pill warn" title="sanity">' + esc(e) + "</span>");
    });
    notes.forEach(function (n) {
      parts.push('<span class="pill" title="notes">' + esc(n) + "</span>");
    });
    return '<div class="cv-badges">' + parts.join(" ") + "</div>";
  }

  function frontDetailSuggestHtml(detail) {
    if (!detail) return "";
    var on =
      String(state.draft.front || "").toLowerCase() ===
      String(detail).toLowerCase();
    return (
      '<div class="cv-suggest">' +
      '<span class="foot">detail suggestion (low conf — not a fact)</span> ' +
      '<button type="button" class="chip cv-chip cv-chip-suggest' +
      (on ? " on" : "") +
      '" data-field="front" data-val="' +
      esc(detail) +
      '">' +
      esc(detail) +
      "</button>" +
      '<span class="foot"> — tap to accept</span>' +
      "</div>"
    );
  }

  function shellPromptHtml(shell, coverage) {
    if (
      String(shell || "").toLowerCase() === "1-high" &&
      (coverage == null || coverage === "")
    ) {
      return (
        '<div class="cv-shell-prompt">' +
        "shell only — pick cover 1 vs 3 (F1 cannot split these)" +
        "</div>"
      );
    }
    return "";
  }

  function pressureCoachHtml() {
    var selected = state.draft.pressure;
    var chips = PRESSURES.map(function (opt) {
      var on = String(selected || "").toLowerCase() === String(opt).toLowerCase();
      return (
        '<button type="button" class="chip cv-chip' +
        (on ? " on" : "") +
        '" data-field="pressure" data-val="' +
        esc(opt) +
        '">' +
        esc(opt === "pressure" ? "blitz Y" : "blitz N") +
        "</button>"
      );
    }).join("");
    var clear =
      '<button type="button" class="chip cv-chip cv-chip-clear" data-field="pressure" data-val="">clear</button>';
    return (
      '<div class="cv-field">' +
      '<div class="cv-field-lbl"><span class="lbl" style="margin:0">pressure</span> ' +
      '<span class="foot">coach-only</span></div>' +
      '<p class="foot cv-pressure-hint">CV can\'t read pressure — set manually</p>' +
      '<div class="seg cv-chips">' +
      chips +
      clear +
      "</div>" +
      "</div>"
    );
  }

  function setDraftFromSnap(snap) {
    var cv = cvPayload(snap);
    /* cvSaid tracks what CV drafted for agreement stats — front family is never CV truth */
    state.cvSaid = {
      front: null,
      coverage_shell: cv.coverage_shell || null,
      coverage: snap.coverage || null,
      front_detail: cv.front_detail || null,
    };
    /* Front + pressure coach-only: never pre-fill from CV front_family */
    state.draft = {
      front: snap.front || null,
      coverage_shell: cv.coverage_shell || null,
      coverage: snap.coverage || null,
      pressure: null,
    };
  }

  function renderBody() {
    var body = document.getElementById("cvReviewBody");
    var msg = document.getElementById("cvReviewMsg");
    if (!body) return;
    renderLaneBar();
    if (!state.snaps.length) {
      body.innerHTML =
        '<p class="foot">Queue clear for this filter. CV rows land here after the merge RPC stamps provenance with <code>needs_review=true</code>. GREEN drafts are quick-confirm; AMBER needs your coverage tag.</p>';
      if (msg) msg.textContent = "Queue clear for this filter.";
      syncActions();
      return;
    }
    var snap = state.snaps[state.idx];
    var frames = parseFrames(snap);
    var cv = cvPayload(snap);
    var g = gateMeta(snap);
    var meta =
      (snap.opponent || "?") +
      " · " +
      (snap.week || "") +
      " · review " +
      (state.idx + 1) +
      "/" +
      state.snaps.length +
      (snap.snap_index != null
        ? " · import#" + snap.snap_index
        : "");
    body.innerHTML =
      orientBannerHtml(snap) +
      laneBannerHtml(snap) +
      '<div class="cv-meta">' +
      esc(meta) +
      ' <span class="pill cv-prov-pill" title="Unconfirmed draft">AI-TAGGED</span>' +
      (snap.prompt_version
        ? ' <span class="foot">· ' + esc(snap.prompt_version) + "</span>"
        : "") +
      (snap.min_core_confidence != null
        ? ' <span class="foot">· min conf ' +
          esc(confLabel(Number(snap.min_core_confidence))) +
          "</span>"
        : "") +
      "</div>" +
      '<div class="cv-frames">' +
      frameHtml(frames.f1, "F1 pre-snap", "f1") +
      frameHtml(frames.f2, "F2 post-snap", "f2") +
      "</div>" +
      badgeHtml(snap) +
      chipRow("front", FRONT_FAMILIES, state.draft.front, "front_family") +
      frontDetailSuggestHtml(cv.front_detail || state.cvSaid.front_detail) +
      '<div class="cv-field-extra">' +
      '<span class="foot">or override with detail (coach-only — not CV truth):</span>' +
      chipRow("front", FRONT_DETAILS, state.draft.front, "front_family") +
      "</div>" +
      chipRow(
        "coverage_shell",
        SHELLS,
        state.draft.coverage_shell,
        "coverage_shell"
      ) +
      shellPromptHtml(state.draft.coverage_shell, state.draft.coverage) +
      (g.lane === "amber" && !state.draft.coverage
        ? '<div class="cv-shell-prompt">coverage blank — pick cover 0–4/6 or 2-man, then Confirm</div>'
        : "") +
      chipRow("coverage", COVERAGES, state.draft.coverage, "coverage") +
      pressureCoachHtml();

    body.querySelectorAll(".cv-chip").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (btn.disabled) return;
        var field = btn.getAttribute("data-field");
        var val = btn.getAttribute("data-val");
        if (!field) return;
        state.draft[field] = val === "" ? null : val;
        renderBody();
      });
    });
    if (msg) {
      var lanes = countLanes(state.snaps);
      msg.textContent =
        "Reviewing " +
        (state.idx + 1) +
        " of " +
        state.snaps.length +
        " · GREEN " +
        lanes.green +
        " · AMBER " +
        lanes.amber +
        (state.batchId ? " (batch " + String(state.batchId).slice(0, 8) + "…)" : "");
    }
    syncActions();
    /* Resolve signed URLs into the same img pair (never raw storage path as src). */
    hydrateFrameImgs(frames);
  }

  function move(delta) {
    if (!state.snaps.length) return;
    var next = state.idx + delta;
    if (next < 0 || next >= state.snaps.length) return;
    state.idx = next;
    setDraftFromSnap(state.snaps[state.idx]);
    renderBody();
  }

  function cycle(field, options) {
    var cur = String(state.draft[field] || "").toLowerCase();
    var i = options.findIndex(function (o) {
      return String(o).toLowerCase() === cur;
    });
    state.draft[field] = options[(i + 1) % options.length];
    renderBody();
  }

  function recordAgreement() {
    ["front", "coverage_shell", "coverage"].forEach(function (f) {
      var cv = state.cvSaid[f];
      var coach = state.draft[f];
      if (cv == null && coach == null) return;
      state.agreement[f].total++;
      if (
        String(cv || "").toLowerCase() === String(coach || "").toLowerCase()
      ) {
        state.agreement[f].match++;
      }
    });
    saveAgreement();
    renderAgree();
  }

  function fixesFromDraft() {
    var fixes = {};
    if (state.draft.front != null) fixes.front = state.draft.front;
    if (state.draft.coverage != null) fixes.coverage = state.draft.coverage;
    if (state.draft.coverage_shell != null)
      fixes.coverage_shell = state.draft.coverage_shell;
    if (state.draft.pressure != null) fixes.pressure = state.draft.pressure;
    return fixes;
  }

  async function confirmCurrent() {
    if (state.busy || !state.snaps.length) {
      syncActions();
      return;
    }
    var snap = state.snaps[state.idx];
    var g = gateMeta(snap);
    if (
      g.lane === "amber" &&
      (state.draft.coverage == null || state.draft.coverage === "")
    ) {
      var msgBlock = document.getElementById("cvReviewMsg");
      if (msgBlock)
        msgBlock.textContent = "AMBER — tag coverage before confirming.";
      syncActions();
      return;
    }
    var C = cloud();
    if (!C || typeof C.resolveCvSnap !== "function") {
      var msg = document.getElementById("cvReviewMsg");
      if (msg) msg.textContent = "Sign in required to confirm.";
      return;
    }
    state.busy = true;
    var msgEl = document.getElementById("cvReviewMsg");
    if (msgEl) msgEl.textContent = "Saving…";
    try {
      await C.resolveCvSnap(snap.id, fixesFromDraft());

      recordAgreement();
      state.snaps.splice(state.idx, 1);
      if (state.idx >= state.snaps.length)
        state.idx = Math.max(0, state.snaps.length - 1);
      if (state.snaps.length) setDraftFromSnap(state.snaps[state.idx]);
      renderBody();
      renderAgree();
      try {
        if (root.OFFGRD_REFRESH_SCOUT_SNAPS) await root.OFFGRD_REFRESH_SCOUT_SNAPS();
      } catch (eR) {}
      if (msgEl) {
        msgEl.textContent = state.snaps.length
          ? "Confirmed. " + state.snaps.length + " left."
          : "Queue clear for this filter.";
      }
    } catch (e) {
      if (msgEl)
        msgEl.textContent =
          "Confirm failed: " + (e && e.message ? e.message : e);
    } finally {
      state.busy = false;
      syncActions();
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
    if (k === "Enter") {
      e.preventDefault();
      if (!state.snaps.length) return;
      confirmCurrent();
      return;
    }
    if (k === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (!state.snaps.length) return;
    var lower = String(k).toLowerCase();
    if (lower === "f") {
      e.preventDefault();
      cycle("front", FRONT_FAMILIES);
      return;
    }
    if (lower === "s") {
      e.preventDefault();
      cycle("coverage_shell", SHELLS);
      return;
    }
    if (lower === "p") {
      e.preventDefault();
      cycle("pressure", PRESSURES);
      return;
    }
    if (lower === "m") {
      e.preventDefault();
      state.draft.coverage = "2-man";
      renderBody();
      return;
    }
    if ("012346".indexOf(lower) >= 0) {
      e.preventDefault();
      var map = {
        "0": "cover 0",
        "1": "cover 1",
        "2": "cover 2",
        "3": "cover 3",
        "4": "cover 4",
        "6": "cover 6",
      };
      state.draft.coverage = map[lower];
      renderBody();
    }
  }

  async function open(opts) {
    opts = opts || {};
    ensureDom();
    loadAgreement();
    state.open = true;
    state.teamId = opts.teamId || teamId();
    state.batchId = opts.import_batch_id || opts.batchId || null;
    state.idx = 0;
    state.snaps = [];
    renderAgree();
    var wrap = document.getElementById("cvReview");
    wrap.classList.add("show");
    var body = document.getElementById("cvReviewBody");
    if (body) body.innerHTML = '<p class="foot">Loading review queue…</p>';
    if (!state.keyHandler) {
      state.keyHandler = onKey;
      document.addEventListener("keydown", state.keyHandler);
    }
    var C = cloud();
    if (!C || !state.teamId || typeof C.listCvReviewQueue !== "function") {
      if (body) {
        body.innerHTML =
          '<p class="foot">Sign in to a program to review CV snaps.</p>';
      }
      return;
    }
    try {
      var queued = await C.listCvReviewQueue(state.teamId, {
        import_batch_id: state.batchId || undefined,
      });
      state.snaps = sortReviewQueue(queued);
      if (state.snaps.length) setDraftFromSnap(state.snaps[0]);
      renderBody();
    } catch (e) {
      if (body) {
        body.innerHTML =
          '<p class="foot" style="color:var(--bad)">Could not load queue: ' +
          esc(e && e.message ? e.message : e) +
          "</p>";
      }
    }
  }

  function close() {
    state.open = false;
    var wrap = document.getElementById("cvReview");
    if (wrap) wrap.classList.remove("show");
    if (state.keyHandler) {
      document.removeEventListener("keydown", state.keyHandler);
      state.keyHandler = null;
    }
    try {
      if (typeof root.renderImportManager === "function") root.renderImportManager();
      else if (typeof root.renderManager === "function") root.renderManager();
    } catch (e) {}
  }

  root.OFFGRD_CV_REVIEW = {
    open: open,
    close: close,
    COVERAGES: COVERAGES,
    SHELLS: SHELLS,
    FRONT_FAMILIES: FRONT_FAMILIES,
    CV_AUTO_ACCEPT: CV_AUTO_ACCEPT,
  };
  root.openCvReview = open;
})(typeof window !== "undefined" ? window : globalThis);
