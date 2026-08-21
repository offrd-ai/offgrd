/**
 * OFFGRD D Caller — defensive in-game caller (partitioned session).
 * Same envelope/fold/outcome helpers as OC Caller; store: offgrd_dcaller_events_v2.
 * Local-first · side:'defense' on every event · auto-sync when staff + online.
 * JSON export remains emergency fallback only.
 */
(function (global) {
  "use strict";

  var E = function () {
    return global.OFFGRD_CALLER || null;
  };
  var Sync = function () {
    return global.OFFGRD_CALLER_SYNC_ENGINE || null;
  };
  var O = function () {
    return global.OFFGRD_CALLER_OUTCOME || null;
  };

  var events = [];
  var seq = 0;
  var log = [];
  var sit = {
    dn: 1,
    db: "10+",
    estYards: 10,
    hash: "ANY",
    zone: "ANY",
    front: null,
    coverage: null,
    pressure: null,
    inferred: false,
    needsInput: false,
    pendingTry: false,
    forTwo: false,
    needReason: null,
  };
  var session = null;
  var pendingDir = null;
  var lastUploadAt = null;
  /** playIndex open in edit panel (correction), or null */
  var editPi = null;
  /** Tag ids while edit panel is open — source of truth for Save (not DOM checkbox state). */
  var editFlagsDraft = null;
  var breaks = [];
  var driveToast = null;
  /** Final review only · { tier:'final', title, view } — Half/Quarter no longer open modals. */
  var summaryView = null;
  /** Last Monday Focus sidecar from Mark Final. */
  var mondayFocusPayload = null;
  /** Live analysis pane · expanded = locker-room full sheet. */
  var liveExpanded = false;
  /** Event feed · newest first · { id, kind, line, llmLine, at, playIndex } */
  var eventFeed = [];
  /** Booth Tier-1 · selected chip id or null */
  var boothChip = null;
  var boothAsk = null; /* Tier-2 free-text result */
  var lastShiftSig = "";
  var lastDriveFeedPi = null;
  var _stopStreak = 0;

  function sitDefaults() {
    return {
      dn: 1,
      db: "10+",
      estYards: 10,
      hash: "ANY",
      zone: "ANY",
      front: null,
      coverage: null,
      pressure: null,
      inferred: false,
      needsInput: false,
      pendingTry: false,
      forTwo: false,
      needReason: null,
    };
  }

  function estYardsForBucket(db) {
    var Out = O();
    if (Out && Out.estYardsForBucket) return Out.estYardsForBucket(db);
    if (db === "GOAL") return 3;
    if (db === "1-3") return 2;
    if (db === "4-6") return 5;
    if (db === "7-9") return 8;
    return 10;
  }

  function sitConfirmLabel() {
    var dist = sit.db === "GOAL" ? "GOAL" : sit.db;
    return (ordinalFn(+sit.dn) + "").toUpperCase() + " & " + dist;
  }

  function resetFirstDownLabel() {
    var Out = O();
    if (Out && Out.isGoalSituation && Out.isGoalSituation(sit)) return "1ST & GOAL";
    return "1ST & 10";
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }
  function storeKey() {
    var eng = E();
    return (eng && eng.DCALLER_STORE_KEY) || "offgrd_dcaller_events_v2";
  }
  function opp() {
    try {
      if (typeof sit !== "undefined" && global.sit && global.sit.opp) return global.sit.opp;
    } catch (e) {}
    return (global.sit && global.sit.opp) || "ANY";
  }
  function weekLabel() {
    try {
      if (global.WEEK && WEEK.opponent) return String(WEEK.opponent);
    } catch (e) {}
    return opp();
  }
  function sessionDate() {
    try {
      if (typeof callerSessionDate === "function") return callerSessionDate();
    } catch (e) {}
    return new Date().toISOString().slice(0, 10);
  }
  function ordinalFn(n) {
    try {
      if (typeof ordinal === "function") return ordinal(n);
    } catch (e) {}
    return String(n);
  }
  function fmt(p) {
    try {
      if (typeof fmtPct === "function") return fmtPct(p);
    } catch (e) {}
    return Math.round((+p || 0) * 100) + "%";
  }
  function dbNum(db) {
    var Out = O();
    if (Out && Out.dbToNum) return Out.dbToNum(db);
    if (typeof dbToNum === "function") return dbToNum(db);
    return 10;
  }
  function distB(d) {
    if (typeof distBucket === "function") return distBucket(d);
    var n = +d;
    if (n <= 3) return "1-3";
    if (n <= 6) return "4-6";
    if (n <= 9) return "7-9";
    return "10+";
  }

  function ensureSession() {
    if (session && session.gameId) return session;
    var eng = E();
    session = {
      gameId: eng && eng.uuid ? eng.uuid() : "dg" + Date.now(),
      opp: opp() !== "ANY" ? opp() : weekLabel() || "opponent",
      week: (typeof callerSessionWeekRaw === "function" ? callerSessionWeekRaw() : weekLabel()) || "",
      side: "defense",
    };
    return session;
  }

  function saveLocal() {
    var eng = E();
    if (!eng || !eng.saveStore) return;
    eng.saveStore(
      {
        session: ensureSession(),
        sit: sit,
        events: events,
        seq: seq,
        breaks: breaks,
        lastUploadAt: lastUploadAt,
        eventFeed: eventFeed.slice(0, 40),
        liveExpanded: !!liveExpanded,
        updatedAt: Date.now(),
      },
      storeKey()
    );
  }

  function A() {
    return global.OFFGRD_CALLER_ANALYSIS || null;
  }

  var driveToastTimer = null;

  function dismissDriveToast() {
    driveToast = null;
    if (driveToastTimer) {
      try {
        clearTimeout(driveToastTimer);
      } catch (e) {}
      driveToastTimer = null;
    }
    render();
  }

  /** Show drive summary for the drive containing playIndex (TD/TO/punt/TOD). */
  function showDriveToastForPlay(playIndex) {
    var An = A();
    if (!An || !log.length || playIndex == null) return;
    var drives = An.deriveDrives(log, { breaks: breaks });
    var hit = null;
    drives.forEach(function (d) {
      (d.snaps || []).forEach(function (s) {
        if (s.playIndex === playIndex) hit = d;
      });
    });
    if (!hit || !hit.snaps || !hit.snaps.length) return;
    driveToast = An.driveTemplate(hit, "defense");
    if (lastDriveFeedPi !== playIndex && driveToast && driveToast.lines && driveToast.lines.length) {
      lastDriveFeedPi = playIndex;
      pushFeedEvent({
        kind: "drive",
        id: "drive-" + playIndex,
        line: driveToast.lines.join(" · "),
        playIndex: playIndex,
      });
    }
    if (driveToastTimer) {
      try {
        clearTimeout(driveToastTimer);
      } catch (e) {}
    }
    driveToastTimer = setTimeout(function () {
      driveToastTimer = null;
      if (driveToast) dismissDriveToast();
    }, 8000);
  }

  function refreshDriveToast() {
    var on = onCall();
    if (!on || on.playIndex == null) return;
    var An = A();
    if (!An || !An.possessionEnd) return;
    /* Toast on possession-end snaps (incl. TD — drive may still be open for try). */
    if (!An.possessionEnd(on)) return;
    showDriveToastForPlay(on.playIndex);
  }

  function offenseLogSnap() {
    try {
      if (typeof CALLER_LOG !== "undefined" && Array.isArray(CALLER_LOG)) return CALLER_LOG;
    } catch (e) {}
    return [];
  }

  function buildLiveAnalysisOpts() {
    var shifts = collectActiveShifts();
    var shift = shifts.length ? shifts[0].shift : tendencyShift(expectSample());
    return {
      side: "defense",
      offenseLog: offenseLogSnap(),
      /* Same folded log the call display reads — never raw outcome events. */
      defenseLog: log,
      shifts: shifts,
      shift: shift,
      breaks: breaks,
      session: ensureSession(),
    };
  }

  /**
   * Single reader for Monday Focus: folded defense log (+ prior accept state).
   * Used by Final mark and getMondayFocusPayload — no second source of truth.
   */
  function buildMondayFocusFromLog() {
    var An = A();
    if (!An || !An.buildMondayFocusPayload) return null;
    try {
      var opts = buildLiveAnalysisOpts();
      opts.priorMondayFocus = mondayFocusPayload;
      var next = An.buildMondayFocusPayload(opts);
      if (next && next.candidates) {
        next.candidates.forEach(function (c) {
          if (c.status === "proposed" && c.selected == null) c.selected = true;
        });
      }
      return next;
    } catch (eMf) {
      console.warn("[dcaller] mondayFocus build failed", eMf && eMf.message);
      return null;
    }
  }

  function buildLiveView() {
    var An = A();
    if (!An || !An.halftimeTemplate) return null;
    var view = An.halftimeTemplate(buildLiveAnalysisOpts());
    if (view) view.tier = "live";
    return view;
  }

  function pushFeedEvent(ev) {
    if (!ev || !ev.line) return;
    var id = ev.id || ev.kind + "-" + Date.now();
    if (eventFeed.some(function (x) { return x.id === id; })) return;
    var row = {
      id: id,
      kind: ev.kind || "note",
      line: String(ev.line),
      llmLine: null,
      at: Date.now(),
      playIndex: ev.playIndex != null ? ev.playIndex : null,
    };
    eventFeed.unshift(row);
    if (eventFeed.length > 40) eventFeed.length = 40;
    phraseFeedEvent(row);
  }

  function phraseFeedEvent(row) {
    var L = global.OFFGRD_CALLER_SUMMARY_LLM;
    if (!L || !L.requestEventLine || !row) return;
    L.requestEventLine(row.line, { eventId: row.id, session: ensureSession() }, function (text) {
      var hit = eventFeed.find(function (x) { return x.id === row.id; });
      if (!hit || !text) return;
      hit.llmLine = text;
      render();
    });
  }

  function shiftSignature() {
    return collectActiveShifts()
      .map(function (r) {
        if (!r || !r.shift) return "";
        return (
          (r.bucket || "") +
          "|" +
          r.shift.tonightLean +
          "|" +
          Math.round((r.shift.livePass || 0) * 100) +
          "|" +
          (r.shift.liveN || 0)
        );
      })
      .join(";");
  }

  /** After fold/grade — detect shift + milestone events (drive handled in toast path). */
  function tickLiveEvents(gradedEntry) {
    var sig = shiftSignature();
    if (sig && sig !== lastShiftSig) {
      var prev = lastShiftSig;
      lastShiftSig = sig;
      if (prev) {
        var shifts = collectActiveShifts();
        var top = shifts[0];
        if (top && top.shift) {
          var s = top.shift;
          pushFeedEvent({
            kind: "shift",
            id: "shift-" + sig,
            line:
              "Breaking tendency: " +
              (top.bucket || "sit") +
              " tonight " +
              Math.round((s.livePass || 0) * 100) +
              "% pass (n=" +
              (s.liveN || 0) +
              ") · season " +
              Math.round((s.seasonPass || 0) * 100) +
              "% pass",
          });
        }
      }
    }
    if (!gradedEntry) return;
    if (gradedEntry.result === "turnover" || gradedEntry.result === "def_td") {
      pushFeedEvent({
        kind: "milestone",
        id: "to-" + gradedEntry.playIndex,
        line: "Turnover — possession change (play " + (gradedEntry.playIndex + 1) + ")",
        playIndex: gradedEntry.playIndex,
      });
      _stopStreak = 0;
      return;
    }
    if (gradedEntry.isStop || (+gradedEntry.dn === 3 && gradedEntry.isStop !== false && (gradedEntry.gain == null || +gradedEntry.gain < 0))) {
      /* Prefer explicit isStop from fold */
    }
    if (gradedEntry.isStop) {
      _stopStreak++;
      if (_stopStreak >= 3 && _stopStreak % 3 === 0) {
        pushFeedEvent({
          kind: "milestone",
          id: "stops-" + gradedEntry.playIndex + "-" + _stopStreak,
          line: _stopStreak + " straight stops — keep the pressure on",
          playIndex: gradedEntry.playIndex,
        });
      }
    } else if (gradedEntry.result) {
      _stopStreak = 0;
    }
  }

  /**
   * Quarter/Half = period bookmarks (drive truncate + feed line). No modal.
   * Final = end-of-game review + Monday payload.
   */
  function markBreak(kind) {
    if (kind !== "quarter" && kind !== "half" && kind !== "final") return;
    var lastPi = log.length ? log[log.length - 1].playIndex : -1;
    breaks.push({ kind: kind, afterPlayIndex: lastPi });
    var An = A();
    var opts = buildLiveAnalysisOpts();
    if (An) {
      var drives = An.deriveDrives(log, { breaks: breaks });
      var trunc = drives.filter(function (d) {
        return d.truncated;
      }).slice(-1)[0];
      if (trunc) driveToast = An.driveTemplate(trunc, "defense");
    }
    if (kind === "quarter" || kind === "half") {
      /* Bookmarks only — never open Final/halftime dialog. One analysis surface = live panel. */
      summaryView = null;
      var qn = breaks.filter(function (b) {
        return b.kind === "quarter";
      }).length;
      var label = kind === "half" ? "Half" : "Q" + (qn || 1);
      var dPass = An && An.passShare ? An.passShare(log) : null;
      var line =
        label +
        " marked · " +
        log.length +
        " D snaps" +
        (dPass != null
          ? " · they " + Math.round((1 - dPass) * 100) + "/" + Math.round(dPass * 100) + " run/pass"
          : "");
      pushFeedEvent({ kind: "period", id: "period-" + kind + "-" + lastPi + "-" + breaks.length, line: line, playIndex: lastPi });
      liveExpanded = true;
      saveLocal();
      render();
      try {
        var panel = document.getElementById("rd-live-panel");
        if (panel && panel.scrollIntoView) panel.scrollIntoView({ block: "nearest", behavior: "smooth" });
      } catch (eScr) {}
      return;
    }
    /* final */
    if (An && An.finalTemplate) {
      summaryView = {
        tier: "final",
        title: "Final",
        view: An.finalTemplate(opts),
      };
      mondayFocusPayload = buildMondayFocusFromLog();
      requestSummaryLlm("final", summaryView.view, (opts.offenseLog || []).length + log.length);
    }
    saveLocal();
    render();
    scheduleSync();
    try {
      setTimeout(function () {
        var sec = document.getElementById("rd-monday-focus-sec");
        if (sec && sec.scrollIntoView) sec.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }, 80);
    } catch (eScrMf) {}
  }

  function requestSummaryLlm(tier, view, snapCount) {
    var L = global.OFFGRD_CALLER_SUMMARY_LLM;
    if (!L || !L.requestPhrasing || !view) return;
    L.requestPhrasing(
      view,
      { tier: tier, snapCount: snapCount, session: ensureSession() },
      function (next) {
        if (!summaryView || summaryView.tier !== tier) return;
        summaryView.view = next;
        render();
      }
    );
  }

  function dismissSummary() {
    summaryView = null;
    render();
  }
  function dismissHalftime() {
    dismissSummary();
  }

  function setLiveExpanded(on) {
    liveExpanded = !!on;
    saveLocal();
    render();
  }

  function feedLineHtml(ev) {
    var text = ev.llmLine || ev.line || "";
    var auto = ev.inferred || ev.auto ? ` <span class="rd-live-feed-auto">auto</span>` : "";
    return `<p class="rd-live-feed-line"><span class="rd-live-feed-kind">${esc(ev.kind || "")}</span> ${esc(text)}${auto}</p>`;
  }

  function seasonTopForm() {
    try {
      var rows = typeof expectSample === "function" ? expectSample() : null;
      var all = rows && rows.all ? rows.all : [];
      var forms = topForms(all);
      if (!forms || !forms.length) return null;
      var f = forms[0];
      return {
        label: f.k || f.key || f.label || String(f),
        pct: f.pct != null ? f.pct : f.p != null ? f.p : null,
        n: f.raw != null ? f.raw : f.n != null ? f.n : null,
      };
    } catch (e) {
      return null;
    }
  }

  function setBoothChip(id) {
    boothChip = boothChip === id ? null : id || null;
    if (boothChip) boothAsk = null;
    render();
  }

  function boothAskPayload(surface) {
    var base = {
      side: "defense",
      offenseLog: typeof CALLER_LOG !== "undefined" && Array.isArray(CALLER_LOG) ? CALLER_LOG : [],
      defenseLog: log,
      shifts: collectActiveShifts(),
      topForm: seasonTopForm(),
      breaks: breaks || [],
      offenseBreaks: breaks || [],
    };
    if (surface === "final") {
      base.context = "final";
      base.finalFacts = boothFinalFacts();
    }
    return base;
  }

  function boothFinalFacts() {
    try {
      if (summaryView && summaryView.view && summaryView.view.facts) {
        return {
          drives: summaryView.view.facts.drives || null,
          turnovers: summaryView.view.facts.turnovers || null,
        };
      }
      var An = A();
      if (An && An.finalTemplate) {
        var v = An.finalTemplate(boothAskPayload());
        return {
          drives: (v.facts && v.facts.drives) || null,
          turnovers: (v.facts && v.facts.turnovers) || null,
        };
      }
    } catch (e) {}
    return null;
  }

  function boothChatOpts(surface) {
    var isFinal = surface === "final";
    var sess = ensureSession();
    return {
      side: "defense",
      payload: boothAskPayload(isFinal ? "final" : "live"),
      session: sess,
      sit: sit,
      gameId: sess && sess.gameId,
      breaks: breaks || [],
    };
  }

  function boothThreadHtml() {
    var Chat = global.OFFGRD_BOOTH_CHAT;
    if (!Chat || typeof Chat.getThread !== "function") return "";
    var oLen = 0;
    try {
      if (typeof global.CALLER_LOG !== "undefined" && global.CALLER_LOG) oLen = global.CALLER_LOG.length;
    } catch (e) {}
    var snap = oLen + (log || []).length;
    try {
      Chat.markStale(snap);
    } catch (e2) {}
    var th = Chat.getThread() || [];
    if (!th.length) return "";
    var h = `<div class="rd-booth-thread" id="rd-booth-thread-d">`;
    th.forEach(function (m) {
      var role = m.role === "user" ? "user" : "assistant";
      var stale = m.stale ? " is-stale" : "";
      h += `<div class="rd-booth-msg rd-booth-msg-${role}${stale}" data-id="${esc(m.id || "")}">`;
      if (role === "user") h += `<p class="rd-booth-msg-q">${esc(m.text || "")}</p>`;
      else {
        var lines =
          m.lines && m.lines.length ? m.lines : String(m.text || "").split(/\n+/).filter(Boolean);
        if (m.status === "pending" || m.status === "streaming") {
          h += `<p class="foot rd-booth-ask-status" data-booth-stream="1">${esc(
            m.status === "streaming" ? m.text || "…" : m.notice || "Asking Booth…"
          )}</p>`;
        }
        lines.forEach(function (ln) {
          h += `<p class="rd-booth-line">${esc(ln)}</p>`;
        });
        if (m.snapAt != null) h += `<p class="foot rd-booth-fresh">as of snap ${esc(String(m.snapAt))}</p>`;
        if (m.notice) h += `<p class="foot rd-booth-notice">${esc(m.notice)}</p>`;
        if (m.stale) {
          h += `<button type="button" class="rd-booth-reask" onclick="OFFGRD_DCALLER.boothReask('${esc(
            m.id || ""
          )}')">Re-ask</button>`;
        }
      }
      h += `</div>`;
    });
    h += `</div>`;
    return h;
  }

  function boothPatchStream() {
    var el = document.querySelector("#rd-booth-thread-d [data-booth-stream], #rd-booth-thread [data-booth-stream]");
    var Chat = global.OFFGRD_BOOTH_CHAT;
    if (!el || !Chat) return;
    var th = Chat.getThread() || [];
    var last = th[th.length - 1];
    if (last && last.role === "assistant") el.textContent = last.text || "Asking Booth…";
  }

  function boothReask(id) {
    var Chat = global.OFFGRD_BOOTH_CHAT;
    if (!Chat || typeof Chat.reask !== "function") return;
    boothChip = null;
    Chat.reask(id, boothChatOpts("live"), function (st) {
      if (!st) return;
      if (st.status === "streaming") {
        boothPatchStream();
        return;
      }
      boothAsk = { status: st.status, message: st.message || st.notice || null, question: "", lines: st.lines || [], thin: [] };
      render();
    });
  }

  function boothAskSubmit(surface) {
    var isFinal = surface === "final";
    var Chat = global.OFFGRD_BOOTH_CHAT;
    var inp = document.getElementById(isFinal ? "rd-booth-ask-q-d-final" : "rd-booth-ask-q-d");
    var q = inp ? inp.value : "";
    if (!Chat || typeof Chat.askFreeform !== "function") {
      boothAsk = { status: "error", message: "Booth chat not loaded.", lines: [], thin: [] };
      render();
      return;
    }
    boothChip = null;
    if (inp) inp.value = "";
    Chat.askFreeform(q, boothChatOpts(isFinal ? "final" : "live"), function (st) {
      if (!st) return;
      if (st.status === "streaming") {
        boothPatchStream();
        return;
      }
      if (st.status === "offline") {
        boothAsk = {
          status: "offline",
          message: st.message || "Free questions need a connection — chips work anywhere.",
          lines: [],
          thin: [],
        };
        render();
        return;
      }
      if (st.status === "error") {
        boothAsk = {
          status: "error",
          message: st.message || "Couldn't reach Booth — try the chips.",
          lines: [],
          thin: [],
        };
        render();
        return;
      }
      if (st.status === "pending") {
        boothAsk = {
          status: "pending",
          question: q,
          message: st.message || "Asking Booth…",
          lines: [],
          thin: [],
        };
        render();
        return;
      }
      if (st.status === "done") {
        boothAsk = {
          status: "done",
          question: q,
          lines: st.lines || [],
          thin: [],
          source: "chat",
          message: st.notice || null,
        };
        render();
      }
    });
  }

  function boothChipsHtml(opts) {
    opts = opts || {};
    var isFinal = opts.surface === "final";
    var An = A();
    if (!An || !An.boothChipDefs || !An.boothChipAnswer) return "";
    var defs = An.boothChipDefs("defense", isFinal ? { context: "final" } : {});
    var online = !(typeof navigator !== "undefined" && navigator.onLine === false);
    var payload = boothAskPayload(isFinal ? "final" : "live");
    var askId = isFinal ? "rd-booth-ask-q-d-final" : "rd-booth-ask-q-d";
    var askFn = isFinal
      ? "OFFGRD_DCALLER.boothAskSubmit('final')"
      : "OFFGRD_DCALLER.boothAskSubmit()";
    var h =
      `<section class="rd-booth${isFinal ? " rd-booth-final" : ""} no-print" aria-label="Ask Booth">`;
    h += `<header class="rd-booth-head">`;
    h += `<p class="rd-booth-kicker">Knowledge center</p>`;
    h += `<h3 class="rd-booth-title">Ask Booth${isFinal ? " · Final" : ""}</h3>`;
    h += `<p class="rd-booth-sub">${
      isFinal
        ? "Full-game facts · same numbers as above · free text online."
        : "Tonight's numbers · chips offline · free text when connected."
    }</p>`;
    h += `</header>`;
    h += `<div class="rd-booth-chips">`;
    defs.forEach(function (c) {
      var on = boothChip === c.id ? " is-on" : "";
      h +=
        `<button type="button" class="rd-booth-chip${on}" onclick="OFFGRD_DCALLER.setBoothChip('${c.id}')">` +
        esc(c.label) +
        `</button>`;
    });
    h += `</div>`;
    if (online) {
      var qKeep = (boothAsk && boothAsk.question) || "";
      h += `<form class="rd-booth-ask" onsubmit="${askFn};return false;">`;
      h += `<input id="${askId}" class="rd-booth-ask-input" type="text" maxlength="240" autocomplete="off" placeholder="${
        isFinal ? "Ask Booth about tonight's game…" : "Ask Booth a question…"
      }" value="${esc(qKeep)}">`;
      h += `<button type="submit" class="rd-booth-ask-btn">Ask</button>`;
      h += `</form>`;
    } else {
      h += `<p class="foot rd-booth-offline">Free questions need a connection — chips work anywhere.</p>`;
    }
    h += boothThreadHtml();
    if (
      boothAsk &&
      (boothAsk.status === "pending" || boothAsk.message) &&
      !(boothAsk.lines && boothAsk.lines.length) &&
      !(global.OFFGRD_BOOTH_CHAT && OFFGRD_BOOTH_CHAT.getThread && OFFGRD_BOOTH_CHAT.getThread().length)
    ) {
      h += `<p class="foot rd-booth-ask-status">${esc(boothAsk.message || "Asking Booth…")}</p>`;
    }
    if (boothChip) {
      var ans = An.boothChipAnswer(boothChip, payload);
      h += `<div class="rd-booth-answer">`;
      (ans.lines || []).forEach(function (ln, i) {
        var thin = ans.thin && ans.thin[i] ? " is-thin" : "";
        h += `<p class="rd-booth-line${thin}">${esc(ln)}</p>`;
      });
      h += `</div>`;
    }
    h += `</section>`;
    return h;
  }

  /** Ambient live panel — recomputes from engine every render (<100ms arithmetic). */
  function livePanelHtml() {
    var view = buildLiveView();
    if (!view || !view.sections) {
      return (
        `<div class="rd-live-panel no-print">` +
        `<div class="rd-live-panel-bar"><div class="rd-live-panel-head"><span class="rd-live-panel-kicker">Live analysis</span><span class="rd-live-panel-title">In-game AI</span></div></div>` +
        `<div class="rd-live-panel-body"><p class="foot">Log snaps — analysis updates live.</p>` +
        boothChipsHtml() +
        `</div></div>`
      );
    }
    var byId = {};
    view.sections.forEach(function (s) {
      byId[s.id] = s;
    });
    var h =
      `<div id="rd-live-panel" class="rd-live-panel no-print${liveExpanded ? " is-expanded" : ""}" role="region" aria-label="In-game AI">`;
    h += `<div class="rd-live-panel-bar">`;
    h += `<div class="rd-live-panel-head">`;
    h += `<span class="rd-live-panel-kicker">Live analysis</span>`;
    h += `<span class="rd-live-panel-title">In-game AI</span>`;
    h += `</div>`;
    h += `<span class="foot rd-live-panel-meta">Live · ${logForUi().length} snap${logForUi().length === 1 ? "" : "s"}</span>`;
    h += liveExpanded
      ? `<button type="button" class="ghost rd-live-panel-toggle" onclick="OFFGRD_DCALLER.setLiveExpanded(false)">Collapse</button>`
      : `<button type="button" class="ghost rd-live-panel-toggle" onclick="OFFGRD_DCALLER.setLiveExpanded(true)">Expand</button>`;
    h += `</div>`;
    h += `<div class="rd-live-panel-body">`;
    h += `<p class="foot rd-live-panel-note">Updates as you log · words may upgrade when online. Loop stays above.</p>`;
    if (liveExpanded) {
      h += `<p class="foot rd-live-panel-note">Expanded · same live analysis (not a separate Half screen).</p>`;
    }

    function writeSec(sec, maxLines) {
      if (!sec) return;
      var lines = sec.lines || [];
      var n = maxLines != null ? Math.min(lines.length, maxLines) : lines.length;
      if (!n && liveExpanded) {
        h += `<section class="rd-live-sec"><h3 class="rd-live-h">${esc(sec.title)}</h3><p class="rd-live-line foot">—</p></section>`;
        return;
      }
      if (!n) return;
      h += `<section class="rd-live-sec"><h3 class="rd-live-h">${esc(sec.title)}</h3>`;
      for (var i = 0; i < n; i++) {
        var ln = lines[i];
        var text = typeof ln === "string" ? ln : ln && ln.text != null ? ln.text : "";
        var low = !!(ln && typeof ln === "object" && (ln.low || ln.badge === "LOW"));
        var badge = ln && typeof ln === "object" && ln.badge ? ln.badge : "";
        h += `<p class="rd-live-line${low ? " is-low" : ""}">${esc(text)}`;
        if (badge) h += ` <span class="rd-live-badge">${esc(badge)}</span>`;
        h += `</p>`;
      }
      h += `</section>`;
    }

    if (liveExpanded) {
      writeSec(byId.what_they);
      writeSec(byId.working);
      writeSec(byId.suggested);
      writeSec(byId.tags);
      h += `<section class="rd-live-sec"><h3 class="rd-live-h">Event feed</h3>`;
      if (!eventFeed.length) h += `<p class="rd-live-line foot">Drive ends, shifts, and marks land here.</p>`;
      else eventFeed.slice(0, 20).forEach(function (ev) { h += feedLineHtml(ev); });
      h += `</section>`;
    } else {
      /* Glance order: shifts/splits → working → suggested → feed */
      writeSec(byId.what_they, 4);
      writeSec(byId.working, 3);
      writeSec(byId.suggested, 2);
      h += `<section class="rd-live-sec"><h3 class="rd-live-h">Feed</h3>`;
      if (!eventFeed.length) h += `<p class="rd-live-line foot">Waiting on drive / shift / mark…</p>`;
      else eventFeed.slice(0, 4).forEach(function (ev) { h += feedLineHtml(ev); });
      h += `</section>`;
    }
    h += boothChipsHtml();
    h += `</div></div>`;
    return h;
  }

  var MONDAY_GROUPS = ["DB", "LB", "DL", "QB", "RB", "WR", "TE", "OL"];

  function setMondayCandidateGroup(idx, group) {
    if (!mondayFocusPayload || !mondayFocusPayload.candidates) return;
    var c = mondayFocusPayload.candidates[idx];
    if (!c || c.status === "accepted") return;
    var g = String(group || "").toUpperCase();
    if (MONDAY_GROUPS.indexOf(g) < 0) return;
    c.positionGroup = g;
    if (c.focusHint) c.focusHint.position_group = g;
    saveLocal();
    render();
  }

  function toggleMondayCandidate(idx) {
    if (!mondayFocusPayload || !mondayFocusPayload.candidates) return;
    var c = mondayFocusPayload.candidates[idx];
    if (!c || c.status === "accepted" || c.status === "approved_pending") return;
    c.selected = !c.selected;
    saveLocal();
    render();
  }

  function resolveSchoolId() {
    var b = global.OFFGRD_CALLER_BRIDGE;
    if (b && b.getSchoolId) {
      var sid = b.getSchoolId();
      if (sid) return Promise.resolve(sid);
    }
    var cloud = b && b.cloud;
    var tid = b && b.getTeamId ? b.getTeamId() : null;
    if (!cloud || !cloud.myTeams || !tid) return Promise.resolve(null);
    return cloud.myTeams().then(function (teams) {
      var t = (teams || []).find(function (x) {
        return x.id === tid;
      });
      return (t && (t.high_school_id || t.school_id)) || null;
    });
  }

  var _mondaySending = false;

  /** Coach confirm → start_tracked_focus (tracked + next-test up-weight only). */
  function sendMondayFocusToPractice(opts) {
    opts = opts || {};
    if (_mondaySending) return;
    if (!mondayFocusPayload || !mondayFocusPayload.candidates) return;
    var b = global.OFFGRD_CALLER_BRIDGE;
    var cloud = b && b.cloud;
    if (!cloud || !cloud.startTrackedFocusFromGame) {
      if (!opts.silent) alert("Sign in as staff to send candidates to practice focus.");
      return;
    }
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      mondayFocusPayload.candidates.forEach(function (c) {
        if (c.selected && c.status === "proposed") c.status = "approved_pending";
      });
      saveLocal();
      render();
      if (!opts.silent) alert("Saved on this device — will send when you’re back online.");
      scheduleSync();
      return;
    }
    var picks = mondayFocusPayload.candidates.filter(function (c) {
      return c.selected && (c.status === "proposed" || c.status === "approved_pending");
    });
    if (!picks.length) {
      if (!opts.silent) alert("Select at least one candidate.");
      return;
    }
    /* Situation-split rows (Cover3×1st + Cover3×2nd) → one cell; sum baselines. */
    var An = A();
    var cells =
      An && An.collapseMondayCandidatesForAccept
        ? An.collapseMondayCandidatesForAccept(picks)
        : picks.map(function (c) {
            return { sources: [c], positionGroup: c.positionGroup, kind: c.kind, schemeType: c.schemeType, schemeValue: c.schemeValue, dimension: c.dimension, n: c.n, baseline_attempts: c.n, baseline_correct: 0, sourceTag: "livetag_monday" };
          });
    _mondaySending = true;
    resolveSchoolId()
      .then(function (schoolId) {
        if (!schoolId) throw new Error("No school linked to this team.");
        var teamId = b.getTeamId ? b.getTeamId() : null;
        var chain = Promise.resolve();
        cells.forEach(function (cell) {
          chain = chain.then(function () {
            var group = cell.positionGroup || "DB";
            return cloud
              .startTrackedFocusFromGame({
                schoolId: schoolId,
                teamId: teamId,
                positionGroup: group,
                kind: cell.kind || "coverage",
                schemeType: cell.schemeType || "coverage",
                schemeValue: cell.schemeValue || null,
                dimension: cell.dimension != null ? cell.dimension : null,
                baselineCorrect: cell.baseline_correct != null ? cell.baseline_correct : 0,
                baselineAttempts: cell.baseline_attempts != null ? cell.baseline_attempts : cell.n || null,
                sourceTag: cell.sourceTag || "livetag_monday",
              })
              .then(function (row) {
                var tid = row && row.id ? row.id : null;
                var at = new Date().toISOString();
                (cell.sources || []).forEach(function (c) {
                  c.status = "accepted";
                  c.selected = false;
                  c.acceptedAt = at;
                  c.trackedFocusId = tid || c.trackedFocusId;
                  c.positionGroup = group;
                  if (c.focusHint) {
                    c.focusHint.position_group = group;
                    c.focusHint.baseline_attempts = cell.baseline_attempts;
                  }
                });
              });
          });
        });
        return chain;
      })
      .then(function () {
        _mondaySending = false;
        saveLocal();
        render();
        scheduleSync();
      })
      .catch(function (e) {
        _mondaySending = false;
        console.warn("[dcaller] sendMondayFocus", e);
        if (!opts.silent) alert((e && e.message) || "Couldn’t send to practice focus.");
        render();
      });
  }

  /** Final review only — Half/Quarter never use this path. */
  function finalReviewHtml() {
    if (!summaryView || summaryView.tier !== "final" || !summaryView.view || !summaryView.view.sections) {
      return "";
    }
    var title = "Final";
    var h =
      `<div class="rd-gd-halftime no-print" role="dialog" aria-label="Final review">` +
      `<div class="rd-gd-halftime-bar"><span class="rd-gd-halftime-title">${esc(title)}</span>` +
      `<button type="button" class="ghost rd-gd-halftime-close" onclick="OFFGRD_DCALLER.dismissSummary()">Close</button></div>` +
      `<div class="rd-gd-halftime-body">`;
    if (summaryView.view.source === "llm") {
      h += `<p class="foot rd-gd-halftime-note">Phrasing upgraded · numbers unchanged from template.</p>`;
    }
    summaryView.view.sections.forEach(function (sec) {
      h += `<section class="rd-gd-halftime-sec"><h3 class="rd-gd-halftime-h">${esc(sec.title)}</h3>`;
      (sec.lines || []).forEach(function (line) {
        h += `<p class="rd-gd-halftime-line">${esc(line)}</p>`;
      });
      h += `</section>`;
    });
    /* Tier-3 — Ask Booth on Final (full-game context; same cage as live free text). */
    h +=
      `<section class="rd-gd-halftime-sec rd-booth-final-wrap">` +
      boothChipsHtml({ surface: "final" }) +
      `</section>`;
    /* Always show Monday block on Final — empty state when tags didn't produce candidates
     * (Cover-3 chunk lines can appear without Bust tags; those are not the hand-off). */
    h += `<section class="rd-gd-halftime-sec" id="rd-monday-focus-sec"><h3 class="rd-gd-halftime-h">Send to practice focus</h3>`;
    var cands = (mondayFocusPayload && mondayFocusPayload.candidates) || [];
    if (!cands.length) {
      h +=
        `<p class="foot rd-gd-halftime-note">No tag candidates yet. Edit snaps → tag <b>Bust</b> / Missed fit → Save, then re-open Final. ` +
        `Scheme chunk lines above are analysis only — they don’t raise a practice emphasis.</p>`;
    } else {
      h += `<p class="foot rd-gd-halftime-note">Proposals only — confirm to up-weight next tests. Does not rewrite Focus Today headline. Group defaults by scheme (editable).</p>`;
      cands.slice(0, 8).forEach(function (c, i) {
        var done = c.status === "accepted";
        var pending = c.status === "approved_pending";
        var checked = !!c.selected && !done;
        var group = c.positionGroup || (c.focusHint && c.focusHint.position_group) || "DB";
        h += `<div class="rd-monday-cand${done ? " is-accepted" : ""}">`;
        if (done) {
          h += `<p class="rd-gd-halftime-line"><b>✓</b> ${esc(c.evidence || "")} → <b>${esc(group)}</b></p>`;
        } else {
          h += `<label class="rd-monday-cand-row">`;
          h += `<input type="checkbox" ${checked ? "checked" : ""} onchange="OFFGRD_DCALLER.toggleMondayCandidate(${i})" />`;
          h += `<span class="rd-gd-halftime-line" style="margin:0">${esc(c.evidence || "")}` +
            ` <span class="foot">· ${esc(String(c.confidence || ""))}</span></span>`;
          h += `</label>`;
          h += `<label class="rd-monday-group foot">Group `;
          h += `<select onchange="OFFGRD_DCALLER.setMondayCandidateGroup(${i}, this.value)" ${pending ? "disabled" : ""}>`;
          MONDAY_GROUPS.forEach(function (g) {
            h += `<option value="${g}"${g === group ? " selected" : ""}>${g}</option>`;
          });
          h += `</select></label>`;
          if (pending) h += `<p class="foot">Queued — will send when online.</p>`;
        }
        h += `</div>`;
      });
      var anyOpen = cands.some(function (c) {
        return c.status === "proposed" || c.status === "approved_pending";
      });
      if (anyOpen) {
        h +=
          `<button type="button" class="rd-monday-send" onclick="OFFGRD_DCALLER.sendMondayFocusToPractice()">Send to practice focus</button>`;
      }
      h += `<p class="foot">Tracked cell + next-test up-weight only. Re-sync won’t double-apply.</p>`;
    }
    h += `</section>`;
    h += `</div></div>`;
    return h;
  }

  function driveToastHtml() {
    if (!driveToast || !driveToast.lines || !driveToast.lines.length) return "";
    var h =
      `<div class="rd-gd-drive-toast rd-gd-drive-toast-overlay no-print" role="status">` +
      `<div class="rd-gd-drive-toast-head"><span class="lbl">Drive</span>` +
      `<button type="button" class="ghost" style="margin-left:auto;padding:4px 10px;font-weight:700" onclick="OFFGRD_DCALLER.dismissDriveToast()">Dismiss</button></div>`;
    driveToast.lines.forEach(function (line) {
      h += `<p class="rd-gd-drive-toast-line">${esc(line)}</p>`;
    });
    return h + `</div>`;
  }

  function marksHtml() {
    return (
      `<div class="rd-gd-marks no-print"><span class="foot" style="font-weight:700">Mark</span>` +
      `<button type="button" class="ghost rd-gd-mark-btn" onclick="OFFGRD_DCALLER.markBreak('quarter')" title="Period bookmark">Quarter</button>` +
      `<button type="button" class="ghost rd-gd-mark-btn" onclick="OFFGRD_DCALLER.markBreak('half')" title="Period bookmark · expands live panel">Half</button>` +
      `<button type="button" class="ghost rd-gd-mark-btn" onclick="OFFGRD_DCALLER.markBreak('final')">Final review</button></div>`
    );
  }

  /** Shared shift sample for O Caller period template (same function as live strip). */
  function tendencyShiftSample() {
    return tendencyShift(expectSample());
  }

  function refold() {
    var eng = E();
    if (!eng || !eng.foldCallerEvents) return;
    var folded = eng.foldCallerEvents(events, { side: "defense" });
    log = folded.log || [];
    try {
      if (global.OFFGRD_BOOTHPACK && OFFGRD_BOOTHPACK.invalidate) OFFGRD_BOOTHPACK.invalidate();
    } catch (e) {}
    try {
      if (typeof callerSyncToGames === "function") {
        callerSyncToGames({ side: "defense", log: log, session: ensureSession() });
      }
    } catch (eSync) {
      try {
        console.warn("[dcaller] sync to def game", eSync && eSync.message);
      } catch (e2) {}
    }
  }

  function loadSession() {
    var eng = E();
    if (!eng || !eng.loadStore) return;
    var st = eng.loadStore(storeKey());
    if (!st) return;
    session = st.session || session;
    if (st.sit) {
      sit = Object.assign(sitDefaults(), st.sit);
      if (sit.estYards == null || isNaN(+sit.estYards)) sit.estYards = estYardsForBucket(sit.db);
      else sit.estYards = Math.max(1, Math.round(+sit.estYards));
    }
    events = Array.isArray(st.events) ? st.events.slice() : [];
    seq = st.seq || 0;
    breaks = Array.isArray(st.breaks) ? st.breaks.slice() : [];
    lastUploadAt = st.lastUploadAt || null;
    eventFeed = Array.isArray(st.eventFeed) ? st.eventFeed.slice(0, 40) : [];
    liveExpanded = !!st.liveExpanded;
    refold();
    lastShiftSig = shiftSignature();
  }

  function append(type, playIndex, payload) {
    var eng = E();
    var sess = ensureSession();
    var clean = Object.assign({}, payload || {});
    if (Object.prototype.hasOwnProperty.call(clean, "side")) delete clean.side;
    seq = (seq || 0) + 1;
    var ev = eng.buildEvent
      ? eng.buildEvent({
          gameId: sess.gameId,
          playIndex: playIndex,
          type: type,
          payload: clean,
          deviceId: eng.deviceId ? eng.deviceId() : "dev",
          actorId: null,
          clientTs: Date.now(),
          seq: seq,
          side: "defense",
        })
      : {
          eventId: eng.uuid ? eng.uuid() : "e" + Date.now(),
          gameId: sess.gameId,
          playIndex: playIndex,
          type: type,
          payload: clean,
          deviceId: "dev",
          actorId: null,
          clientTs: Date.now(),
          seq: seq,
          superseded: false,
          side: "defense",
        };
    if (!ev || ev.side !== "defense") {
      try {
        console.warn("[dcaller] buildEvent rejected", type);
      } catch (e2) {}
      return null;
    }
    events.push(ev);
    refold();
    saveLocal();
    scheduleSync();
    return ev;
  }

  function syncOpts() {
    return {
      side: "defense",
      getState: function () {
        return { session: ensureSession(), events: events };
      },
      getMondayFocus: function () {
        mondayFocusPayload = buildMondayFocusFromLog();
        return mondayFocusPayload;
      },
      applyMondayFocus: function (mf) {
        if (mf) mondayFocusPayload = mf;
        saveLocal();
      },
      applyRemote: function (merged, game, sess) {
        events = merged || events;
        if (sess) session = sess;
        if (game && game.monday_focus) {
          var An = A();
          if (An && An.mergeMondayFocusPayload && mondayFocusPayload) {
            mondayFocusPayload = An.mergeMondayFocusPayload(game.monday_focus, mondayFocusPayload);
          } else if (!mondayFocusPayload) {
            mondayFocusPayload = game.monday_focus;
          }
        }
        var eng = E();
        var maxSeq = seq || 0;
        var dev = eng && eng.deviceId ? eng.deviceId() : "";
        events.forEach(function (e) {
          if (e && e.deviceId === dev && e.seq > maxSeq) maxSeq = e.seq;
        });
        seq = maxSeq;
        refold();
        saveLocal();
      },
      onDone: function () {
        /* Flush approved_pending accepts after events land */
        flushPendingMondayAccepts();
        render();
      },
    };
  }

  function flushPendingMondayAccepts() {
    if (_mondaySending) return;
    if (!mondayFocusPayload || !mondayFocusPayload.candidates) return;
    var pending = mondayFocusPayload.candidates.filter(function (c) {
      return c.status === "approved_pending";
    });
    if (!pending.length) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    pending.forEach(function (c) {
      c.selected = true;
    });
    sendMondayFocusToPractice({ silent: true });
  }

  function scheduleSync() {
    var eng = Sync();
    if (eng && eng.scheduleAfterSnap) eng.scheduleAfterSnap(syncOpts());
    else if (eng && eng.flush) eng.flush(syncOpts());
  }

  function ensureSyncBound() {
    var eng = Sync();
    if (eng && eng.bindTriggers) eng.bindTriggers(syncOpts());
    if (eng && eng.subscribe && !ensureSyncBound._sub) {
      ensureSyncBound._sub = true;
      eng.subscribe(function () {
        try {
          if (global.CURRENT_VIEW === "dcaller") render();
        } catch (e) {}
      });
    }
  }

  function onCall() {
    var eng = E();
    if (eng && eng.onCallFromLog) return eng.onCallFromLog(log);
    return log.length ? log[log.length - 1] : null;
  }

  function liveCall() {
    var on = onCall();
    return on && on.play && !on.result ? on : null;
  }

  function sitTxt() {
    var dist = sit.db === "GOAL" ? "GOAL" : sit.db;
    return (
      ordinalFn(+sit.dn) +
      " & " +
      dist +
      (sit.zone && sit.zone !== "ANY" ? " · " + (sit.zone === "REDZONE" ? "RZ" : sit.zone) : "") +
      (sit.hash && sit.hash !== "ANY" ? " · " + sit.hash : "")
    );
  }

  function defBook() {
    try {
      if (typeof callerDefPlaybook === "function") return callerDefPlaybook();
    } catch (e) {}
    return {
      fronts: [
        { id: "4-3", name: "4-3" },
        { id: "3-4", name: "3-4" },
        { id: "nickel", name: "Nickel" },
        { id: "4-2-5", name: "4-2-5" },
      ],
      pressures: [
        { id: "none", name: "No blitz" },
        { id: "mike-a", name: "Mike A" },
        { id: "will-cross", name: "Will cross" },
        { id: "other", name: "other" },
      ],
    };
  }

  function Sit() {
    return global.OFFGRD_CALLER_SIT || null;
  }

  function liveRowsAsSnaps() {
    return logForUi()
      .filter(function (l) {
        return l.playType && l.result;
      })
      .map(function (l) {
        return {
          down: +l.dn,
          distance: dbNum(l.db),
          fieldZone: l.zone && l.zone !== "ANY" ? l.zone : "",
          hash: l.hash && l.hash !== "ANY" ? l.hash : "",
          playType: l.playType,
          formation: "",
          direction: l.theirDirection || "",
          motion: 0,
          gain: l.gain,
          opponent: l.opponent,
          date: "live",
          source: "live_dcall",
        };
      });
  }

  /**
   * Season + live sample for a down/distance bucket (Expect strip + shift lines).
   * opts.anyDb: match down only (3rd-down rollup) — bypasses sit ladder.
   * opts.useLadder: apply shared never-blank resolver (default true for expect).
   */
  function sampleFor(dn, db, opts) {
    opts = opts || {};
    var anyDb = !!opts.anyDb;
    var season = [];
    try {
      if (typeof oppRows === "function") season = oppRows("off") || [];
    } catch (e) {}
    var live = liveRowsAsSnaps();
    var pool = season.concat(live);

    if (!anyDb && opts.useLadder !== false) {
      var Api = Sit();
      if (Api && Api.resolveSituation) {
        var filterDb = db === "GOAL" ? "1-3" : db;
        var resolved = Api.resolveSituation(
          pool,
          {
            dn: dn,
            db: db,
            hash: opts.hash != null ? opts.hash : sit.hash,
            zone: opts.zone != null ? opts.zone : sit.zone,
          },
          { filterDb: filterDb }
        );
        var rows = resolved.terminal ? [] : resolved.rows;
        var seasonG = rows.filter(function (r) {
          return r.source !== "live_dcall" && r.date !== "live";
        });
        var liveG = rows.filter(function (r) {
          return r.source === "live_dcall" || r.date === "live";
        });
        return {
          season: seasonG,
          live: liveG,
          all: rows,
          resolved: resolved,
          terminal: !!resolved.terminal,
          badge: resolved.badge,
          conf: resolved.conf,
          widened: !!resolved.widened,
          rung: resolved.rung,
        };
      }
    }

    var filter = function (r) {
      if (!r || +r.down !== +dn) return false;
      if (!anyDb && distB(r.distance) !== db) return false;
      return true;
    };
    var seasonG = season.filter(filter);
    var liveG = live.filter(filter);
    return { season: seasonG, live: liveG, all: seasonG.concat(liveG) };
  }

  /** Season opponent-offense rows for current sit (+ live D Caller snaps). */
  function expectSample() {
    return sampleFor(+sit.dn, sit.db, {
      hash: sit.hash,
      zone: sit.zone,
      useLadder: true,
    });
  }

  /** Active shift lines for halftime — same tendencyShift as the Expect strip. */
  function collectActiveShifts() {
    var specs = [
      { bucket: "this sit", dn: +sit.dn, db: sit.db },
      { bucket: "1st & 10+", dn: 1, db: "10+" },
      { bucket: "2nd & long", dn: 2, db: "10+" },
      { bucket: "3rd down", dn: 3, db: null, anyDb: true },
    ];
    var out = [];
    var seen = {};
    specs.forEach(function (spec) {
      var key = spec.bucket;
      if (seen[key]) return;
      /* Ladder only for live "this sit"; fixed buckets stay exact. */
      var sample = sampleFor(spec.dn, spec.db, {
        anyDb: !!spec.anyDb,
        useLadder: spec.bucket === "this sit",
      });
      var shift = tendencyShift(sample);
      if (!shift) return;
      seen[key] = 1;
      out.push({ bucket: spec.bucket, shift: shift });
    });
    return out;
  }

  function passShare(rows) {
    if (!rows || !rows.length) return null;
    var pass = rows.filter(function (r) {
      return /pass/i.test(r.playType || "");
    }).length;
    return pass / rows.length;
  }

  function topForms(rows) {
    if (typeof weightedDist !== "function") return [];
    var withF = rows.filter(function (r) {
      return r.formation;
    });
    if (!withF.length) return [];
    return weightedDist(withF, "formation", false).arr.slice(0, 2);
  }

  function dirLean(rows, form) {
    if (typeof weightedDist !== "function" || !form) return null;
    var g = rows.filter(function (r) {
      return r.formation === form && r.direction && /run/i.test(r.playType || "");
    });
    if (g.length < 2) return null;
    var d = weightedDist(g, "direction", false).arr[0];
    return d || null;
  }

  function motionRate(rows) {
    if (!rows || !rows.length) return null;
    var known = rows.filter(function (r) {
      return r.motion === 0 || r.motion === 1;
    });
    if (!known.length) return null;
    return known.filter(function (r) {
      return +r.motion === 1;
    }).length / known.length;
  }

  /**
   * Tendency shift — delegates to shared analysis engine (halftime must match live strip).
   */
  function tendencyShift(sample) {
    var A = global.OFFGRD_CALLER_ANALYSIS;
    if (A && A.tendencyShift) return A.tendencyShift(sample);
    var live = (sample && sample.live) || [];
    var season = (sample && sample.season) || [];
    if (live.length < 3 || season.length < 3) return null;
    var livePass = passShare(live);
    var seasonPass = passShare(season);
    if (livePass == null || seasonPass == null) return null;
    var delta = livePass - seasonPass;
    if (Math.abs(delta) < 0.25) return null;
    return {
      livePass: livePass,
      seasonPass: seasonPass,
      liveN: live.length,
      seasonN: season.length,
      tonightLean: livePass >= 0.5 ? "pass" : "run",
      seasonLean: seasonPass >= 0.5 ? "pass" : "run",
    };
  }

  function setSit(key, val) {
    sit[key] = key === "dn" ? +val : val;
    /* Every manual chip correction writes back to estYards. */
    if (key === "dn" || key === "db" || key === "zone") {
      var OutW = O();
      if (OutW && OutW.writebackEstYards) {
        var wb = OutW.writebackEstYards(sit, { dn: sit.dn, db: sit.db, zone: sit.zone });
        sit.estYards = wb.estYards;
        if (key === "db") sit.db = wb.db;
      } else if (key === "db") {
        sit.estYards = estYardsForBucket(val);
      }
    }
    sit.inferred = false;
    sit.needsInput = false;
    sit.pendingTry = false;
    sit.forTwo = false;
    sit.needReason = null;
    saveLocal();
    render();
  }

  function setLook(field, value) {
    if (sit[field] === value) sit[field] = null;
    else sit[field] = value;
    saveLocal();
    render();
  }

  function confirmSit() {
    sit.inferred = false;
    sit.needsInput = false;
    sit.pendingTry = false;
    sit.forTwo = false;
    sit.needReason = null;
    saveLocal();
    render();
  }

  function resetFirstDown() {
    var Out = O();
    if (!Out || !Out.firstDownSituation) return;
    var next = Out.firstDownSituation(sit, { reason: "manual_reset" });
    applyInfer(next);
    sit.inferred = true;
    sit.needsInput = false;
    saveLocal();
    render();
  }

  function driveOver(kind) {
    var Out = O();
    if (!Out || !Out.driveOverSituation) return;
    var next = Out.driveOverSituation(kind, sit);
    if (!next || next.skip) return;
    applyInfer(next);
    saveLocal();
    render();
    try {
      jump("dcaller-sit-anchor", true);
    } catch (e) {}
  }

  /** Result-entry conversion chip — D always shows (ungated). */
  function movedChains(playIndex) {
    var Out = O();
    if (!Out || !Out.movedChainsSituation) return;
    var entry = log.find(function (l) {
      return l.playIndex === playIndex;
    });
    var from = entry
      ? {
          dn: entry.dn,
          db: entry.db,
          estYards: entry.estYards != null ? entry.estYards : sit.estYards,
          hash: entry.hash,
          zone: entry.zone,
        }
      : sit;
    if (entry && entry.result) {
      append("outcome", playIndex, {
        result: entry.result,
        flag: entry.flag || null,
        flags: entry.flags || null,
        conceptOverride: entry.conceptOverride || null,
        movedChains: true,
      });
    }
    var next = Out.movedChainsSituation(from);
    applyInfer(next);
    saveLocal();
    render();
    try {
      jump("dcaller-sit-anchor", true);
    } catch (e) {}
  }

  function sitNeedMsg() {
    if (sit.pendingTry) return "They scored — PAT, 2PT, or skip to their next series (1st & 10)";
    if (sit.forTwo) return "2PT — log Run/Pass · Converted/Failed feeds tendencies";
    var r = sit.needReason;
    if (r === "turnover_on_downs") {
      return "Turnover on downs — next series 1st & 10";
    }
    if (r === "turnover" || r === "change_of_possession" || r === "safety" || r === "def_td") {
      return "Change of possession — confirm 1st & 10 when they're back on O";
    }
    if (r === "penalty") return "Penalty — set the next situation · tap chips to override";
    if (r === "moved_chains" || r === "manual_reset") return "First down — confirm or tap chips to override";
    if (sit.needsInput) return "Score / turnover / penalty — set the next sit · tap chips to override";
    return "Auto from last result — tap chips to override";
  }

  function applyInfer(next) {
    if (!next) return;
    if (next.dn != null) sit.dn = next.dn;
    if (next.db != null) sit.db = next.db;
    if (next.estYards != null && !isNaN(+next.estYards)) {
      var OutC = O();
      sit.estYards =
        next.db === "GOAL" && OutC && OutC.clampGoalYards
          ? OutC.clampGoalYards(next.estYards)
          : Math.max(1, Math.round(+next.estYards));
    } else if (next.db != null) {
      var OutW2 = O();
      if (OutW2 && OutW2.writebackEstYards) {
        sit.estYards = OutW2.writebackEstYards(sit, {
          db: next.db,
          dn: next.dn,
          zone: next.zone,
        }).estYards;
      } else {
        sit.estYards = estYardsForBucket(next.db);
      }
    }
    if (next.hash != null) sit.hash = next.hash;
    if (next.zone != null) sit.zone = next.zone;
    sit.needReason = next.reason || null;
    if (next.needsTry) {
      sit.pendingTry = true;
      sit.forTwo = false;
      sit.inferred = true;
      sit.needsInput = false;
      return;
    }
    sit.pendingTry = false;
    if (next.reason === "after_try") sit.forTwo = false;
    if (next.needsInput) {
      sit.needsInput = true;
      sit.inferred = !!next.inferred;
      return;
    }
    if (next.inferred) {
      sit.inferred = true;
      sit.needsInput = false;
    }
  }

  /** Happy path tap 1: what they ran (creates call). */
  function logTheirPlay(playType, direction) {
    var live = liveCall();
    if (live && !live.result) {
      /* Replace ungraded look — undo last then re-log */
      append("undo", live.playIndex, {});
    }
    var eng = E();
    var nextPi = log.length ? Math.max.apply(null, log.map(function (l) { return l.playIndex; })) + 1 : 0;
    if (eng && eng.foldCallerEvents) {
      var folded = eng.foldCallerEvents(events, { side: "defense" });
      if (folded && typeof folded.nextPlayIndex === "number") nextPi = folded.nextPlayIndex;
    }
    var dir = direction || pendingDir || null;
    pendingDir = null;
    var isTwo = !!sit.forTwo;
    var label = playType + (dir ? " " + dir : "");
    var sess = ensureSession();
    append("call", nextPi, {
      sitTxt: isTwo ? "2-pt" : sitTxt(),
      play: label,
      playType: playType,
      forTwo: isTwo,
      theirDirection: dir,
      dn: +sit.dn,
      db: sit.db,
      estYards: sit.estYards != null ? sit.estYards : estYardsForBucket(sit.db),
      hash: sit.hash,
      zone: sit.zone,
      situationInferred: !!sit.inferred,
      coverage: sit.coverage || "",
      front: sit.front || "",
      pressure: sit.pressure || "",
      opponent: sess.opp,
      date: sessionDate(),
      side: "defense",
    });
    sit.forTwo = false;
    sit.pendingTry = false;
    sit.needReason = null;
    saveLocal();
    render();
    try {
      setTimeout(function () {
        jump("dcaller-result-anchor");
      }, 40);
    } catch (e) {}
  }

  /** Happy path tap 2: yards allowed (same OC buckets). */
  function grade(playIndex, resultId) {
    var entry = log.find(function (l) {
      return l.playIndex === playIndex;
    });
    if (!entry) return;
    var next = entry.result === resultId ? null : resultId;
    var flags = entry.flags || [];
    append("outcome", playIndex, {
      result: next,
      flags: next ? flags : [],
      flag: next && flags[0] ? flags[0] : null,
      theirPlayType: entry.playType || null,
      theirDirection: entry.theirDirection || null,
    });
    if (next) {
      maybeAdvance(playIndex);
      /* Fresh D call each snap — do not sticky-carry coverage/front/blitz. */
      sit.coverage = null;
      sit.front = null;
      sit.pressure = null;
      pendingDir = null;
      saveLocal();
      refreshDriveToast();
      try {
        var graded = log.find(function (l) {
          return l.playIndex === playIndex;
        });
        tickLiveEvents(graded || null);
      } catch (eTick) {}
    }
    render();
    /* Result = step 4 done — snap closed; hard-scroll to top (or try bar after TD). */
    if (next) {
      try {
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            if (sit.pendingTry && document.getElementById("dcaller-try-anchor")) {
              jump("dcaller-try-anchor", true);
            } else {
              jumpTop(true);
            }
          });
        });
      } catch (e) {
        try {
          jumpTop(true);
        } catch (e2) {}
      }
    }
  }

  function toggleFlag(playIndex, flagId) {
    var entry = log.find(function (l) {
      return l.playIndex === playIndex;
    });
    if (!entry || !entry.result) return;
    var flags = Array.isArray(entry.flags) ? entry.flags.slice() : entry.flag ? [entry.flag] : [];
    var ix = flags.indexOf(flagId);
    if (ix >= 0) flags.splice(ix, 1);
    else flags.push(flagId);
    append("outcome", playIndex, {
      result: entry.result,
      flags: flags,
      flag: flags[0] || null,
      theirPlayType: entry.playType || null,
      theirDirection: entry.theirDirection || null,
    });
    render();
  }

  /**
   * Live Sit advance — possession ends use the SAME possessionEnd() as deriveDrives
   * (no parallel 4th-down rules). Within-drive chains still use inferNextSituation.
   */
  function maybeAdvance(playIndex) {
    var Out = O();
    var An = A();
    var entry = log.find(function (l) {
      return l.playIndex === playIndex;
    });
    if (!entry || !entry.result) return;
    var hash = entry.hash != null ? entry.hash : "ANY";
    var zone = entry.zone != null ? entry.zone : "ANY";

    var end = An && An.possessionEnd ? An.possessionEnd(entry) : null;
    if (end === "td") {
      applyInfer({
        dn: 1,
        db: "10+",
        estYards: 10,
        hash: hash,
        zone: zone,
        inferred: true,
        needsTry: true,
        reason: "td",
      });
      saveLocal();
      return;
    }
    if (
      end === "turnover" ||
      end === "turnover_on_downs" ||
      end === "change_of_possession" ||
      end === "safety" ||
      end === "def_td"
    ) {
      /* Fresh series — 1st & 10. Confirm for ambiguous possession; TOD/punt still reset Sit. */
      applyInfer({
        dn: 1,
        db: "10+",
        estYards: 10,
        hash: "ANY",
        zone: "ANY",
        inferred: true,
        needsInput: end !== "turnover_on_downs",
        reason: end,
      });
      saveLocal();
      return;
    }
    if (end === "after_try") {
      applyInfer({
        dn: 1,
        db: "10+",
        estYards: 10,
        hash: hash,
        zone: "ANY",
        inferred: true,
        reason: "after_try",
      });
      saveLocal();
      return;
    }

    /* Within-drive (incl. 4th-down conversion → 1st & 10 same possession). */
    if (!Out || !Out.inferNextSituation) return;
    var next = Out.inferNextSituation(
      {
        dn: entry.dn,
        db: entry.db,
        estYards: entry.estYards != null ? entry.estYards : sit.estYards,
        hash: entry.hash,
        zone: entry.zone,
      },
      {
        result: entry.result,
        gain: entry.gain,
        flag: entry.flag,
        negated: entry.negated,
        movedChains: !!entry.movedChains,
      },
      entry.playType
    );
    if (next.skip && !next.needsInput && !next.needsTry && !next.inferred) return;
    applyInfer(next);
    saveLocal();
  }

  /**
   * Special teams call — Punt / Kick (FG) on 4th, or PAT after TD.
   * 2-pt uses startTwoPoint → Run/Pass (not ST).
   */
  function logST(kind) {
    if (kind !== "fg" && kind !== "punt" && kind !== "xp") return;
    var live = liveCall();
    if (live && !live.result) append("undo", live.playIndex, {});
    var eng = E();
    var nextPi = log.length ? Math.max.apply(null, log.map(function (l) { return l.playIndex; })) + 1 : 0;
    if (eng && eng.foldCallerEvents) {
      var folded = eng.foldCallerEvents(events, { side: "defense" });
      if (folded && typeof folded.nextPlayIndex === "number") nextPi = folded.nextPlayIndex;
    }
    var sess = ensureSession();
    var play = kind === "fg" ? "Kick" : kind === "punt" ? "Punt" : "PAT";
    var sitLabel =
      kind === "xp"
        ? "After TD"
        : sitTxt();
    append("call", nextPi, {
      sitTxt: sitLabel,
      play: play,
      playType: kind,
      dn: kind === "xp" ? 1 : +sit.dn,
      db: kind === "xp" ? "10+" : sit.db,
      estYards: kind === "xp" ? 10 : sit.estYards != null ? sit.estYards : estYardsForBucket(sit.db),
      hash: sit.hash || "ANY",
      zone: sit.zone || "ANY",
      situationInferred: false,
      coverage: "",
      front: "",
      pressure: "",
      opponent: sess.opp,
      date: sessionDate(),
      side: "defense",
    });
    sit.pendingTry = false;
    sit.forTwo = false;
    sit.needReason = null;
    sit.inferred = false;
    sit.needsInput = false;
    saveLocal();
    render();
    try {
      setTimeout(function () {
        jump("dcaller-result-anchor", true);
      }, 40);
    } catch (e) {}
  }

  /** @deprecated alias — PAT after TD */
  function logTry(kind) {
    if (kind === "xp") logST("xp");
  }

  function startTwoPoint() {
    sit.pendingTry = false;
    sit.forTwo = true;
    sit.dn = 1;
    sit.db = "10+";
    sit.inferred = true;
    sit.needsInput = false;
    sit.needReason = "twopt";
    saveLocal();
    render();
    try {
      jump("dcaller-result-anchor", true);
    } catch (e) {}
  }

  function skipTry() {
    sit.pendingTry = false;
    sit.forTwo = false;
    sit.dn = 1;
    sit.db = "10+";
    sit.inferred = true;
    sit.needsInput = false;
    sit.needReason = "after_try";
    saveLocal();
    render();
    try {
      jumpTop(true);
    } catch (e) {}
  }

  /** 4th down — they can punt or kick (FG); Go for it = Run/Pass below. */
  function stRowHtml() {
    if (+sit.dn !== 4 || sit.pendingTry || sit.forTwo) return "";
    var live = liveCall();
    var puntOn = live && live.playType === "punt";
    var fgOn = live && live.playType === "fg";
    return (
      `<div class="rd-gd-st no-print" data-acc-skip id="dcaller-st-anchor">` +
      `<div class="lbl">4th down · they can</div>` +
      `<div class="rd-gd-st-row">` +
      `<button type="button" class="rd-gd-st-btn" onclick="OFFGRD_DCALLER.jumpResult()">Go for it</button>` +
      `<button type="button" class="rd-gd-st-btn${puntOn ? " on" : ""}" onclick="OFFGRD_DCALLER.logST('punt')">${puntOn ? "Punt · on call" : "Punt"}</button>` +
      `<button type="button" class="rd-gd-st-btn${fgOn ? " on" : ""}" onclick="OFFGRD_DCALLER.logST('fg')">${fgOn ? "Kick · on call" : "Kick"}</button>` +
      `</div>` +
      `<p class="foot" style="margin:8px 0 0">Punt / Kick = special teams grade. Go for it = Run or Pass below.</p>` +
      `</div>`
    );
  }

  function tryBarHtml() {
    if (sit.forTwo) {
      return (
        `<div class="rd-gd-st rd-gd-try no-print" id="dcaller-try-anchor" data-acc-skip>` +
        `<div class="lbl">2PT conversion</div>` +
        `<p class="foot" style="margin:0">Log Run/Pass below — Converted/Failed grades it for tendencies.</p>` +
        `</div>`
      );
    }
    if (!sit.pendingTry) return "";
    return (
      `<div class="rd-gd-st rd-gd-try no-print" id="dcaller-try-anchor" data-acc-skip>` +
      `<div class="lbl">They scored · after TD</div>` +
      `<div class="rd-gd-st-row">` +
      `<button type="button" class="rd-gd-st-btn" onclick="OFFGRD_DCALLER.logST('xp')">PAT</button>` +
      `<button type="button" class="rd-gd-st-btn" onclick="OFFGRD_DCALLER.startTwoPoint()">2PT</button>` +
      `<button type="button" class="rd-gd-st-btn" onclick="OFFGRD_DCALLER.skipTry()">Skip → 1st &amp; 10</button>` +
      `</div>` +
      `<p class="foot" style="margin:8px 0 0">PAT = kick only. 2PT = log Run/Pass (counts). Skip if you are not logging the try.</p>` +
      `</div>`
    );
  }

  function clearLog() {
    if (
      !confirm(
        "Clear this D Caller game?\n\nCloses the cloud game so the next session starts fresh. Past snaps stay archived — they are not deleted."
      )
    )
      return;
    var gameId = session && session.gameId;
    events = [];
    seq = 0;
    log = [];
    breaks = [];
    driveToast = null;
    summaryView = null;
    mondayFocusPayload = null;
    editPi = null;
    editFlagsDraft = null;
    eventFeed = [];
    liveExpanded = false;
    lastShiftSig = "";
    lastDriveFeedPi = null;
    _stopStreak = 0;
    pendingDir = null;
    sit = sitDefaults();
    session = null;
    /* Local clear + paint first — never block sideline UI on cloud archive. */
    ensureSession();
    saveLocal();
    render();
    var eng = Sync();
    if (eng && eng.clearAndArchiveGame) {
      var archiveP = eng.clearAndArchiveGame({ side: "defense", gameId: gameId || null });
      var timed = Promise.race([
        archiveP,
        new Promise(function (resolve) {
          setTimeout(function () {
            resolve({ archived: false, reason: "timeout" });
          }, 8000);
        }),
      ]);
      timed
        .then(function (r) {
          if (r && r.reason === "timeout") {
            console.warn("[dcaller] clear archive still running — UI already cleared");
          }
        })
        .catch(function (e) {
          console.warn("[dcaller] clear archive", e && e.message);
        });
    }
  }

  function syncStateHtml() {
    var n = log.length;
    var eng = Sync();
    var st = eng && eng.getSyncHeaderState
      ? eng.getSyncHeaderState("defense", events, eng.isSyncing && eng.isSyncing())
      : { label: "All synced", pending: 0, syncing: false };
    var cls = st.held || st.pending ? " is-pending" : st.syncing ? " is-syncing" : " is-up";
    var backupNote = lastUploadAt ? " · backup saved" : "";
    /* Export tucked away — cloud sync is the real path; JSON is emergency only. */
    return (
      `<div class="rd-dc-sync no-print" role="status">` +
      `<span class="rd-dc-sync-dot${cls}" aria-hidden="true"></span>` +
      `<span><b>${esc(st.label)}</b> · ${n} snap${n === 1 ? "" : "s"}${esc(backupNote)}</span>` +
      `<button type="button" class="rd-dc-upload" onclick="OFFGRD_DCALLER.syncNow()">Sync now</button>` +
      `<details class="rd-dc-backup no-print">` +
      `<summary class="rd-dc-backup-sum">Backup</summary>` +
      `<div class="rd-dc-backup-body">` +
      `<p class="foot">Emergency only — if sync can’t reach the cloud all game.</p>` +
      `<button type="button" class="ghost rd-dc-backup-btn" onclick="OFFGRD_DCALLER.upload()">Download JSON</button>` +
      `</div></details>` +
      `</div>`
    );
  }

  function syncNow() {
    ensureSyncBound();
    var eng = Sync();
    if (eng && eng.flush) return eng.flush(syncOpts());
  }

  /**
   * Emergency fallback: local JSON download + localStorage receipt.
   * Cloud sync is automatic when online — use this if the bus has no signal all game.
   */
  function upload() {
    var sess = ensureSession();
    var An = A();
    var monday = mondayFocusPayload;
    if (!monday && An && An.buildMondayFocusPayload && log.length) {
      try {
        var oLog = [];
        try {
          if (typeof CALLER_LOG !== "undefined" && Array.isArray(CALLER_LOG)) oLog = CALLER_LOG;
        } catch (eO) {}
        monday = An.buildMondayFocusPayload({
          offenseLog: oLog,
          defenseLog: log,
          shifts: collectActiveShifts(),
          breaks: breaks,
          session: sess,
        });
        mondayFocusPayload = monday;
      } catch (eM) {
        monday = null;
      }
    }
    var payload = {
      kind: "offgrd_dcaller_export",
      side: "defense",
      exportedAt: new Date().toISOString(),
      session: sess,
      sit: sit,
      events: events,
      log: log,
      snapCount: log.length,
      eventCount: events.length,
      schemaVersion: 1,
      /* Sidecar for OFFOPS-postgame-to-monday-focus — not game_plays ingest */
      mondayFocus: monday || null,
    };
    var json = JSON.stringify(payload, null, 2);
    try {
      localStorage.setItem("offgrd_dcaller_export_" + sess.gameId, json);
      localStorage.setItem("offgrd_dcaller_export_latest", json);
    } catch (e) {}
    /* Always offer the file again on re-tap (local receipt); label shows already uploaded. */
    try {
      var blob = new Blob([json], { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download =
        "offgrd-dcaller-" +
        (sess.opp || "game").replace(/\s+/g, "-") +
        "-" +
        sessionDate() +
        ".json";
      document.body.appendChild(a);
      a.click();
      setTimeout(function () {
        try {
          URL.revokeObjectURL(a.href);
          a.remove();
        } catch (e2) {}
      }, 500);
    } catch (e3) {
      try {
        prompt("Copy D Caller export JSON:", json);
      } catch (e4) {}
    }
    lastUploadAt = Date.now();
    saveLocal();
    render();
  }

  function jump(id, instant) {
    try {
      var el = document.getElementById(id);
      if (!el) return;
      var beh = instant ? "auto" : "smooth";
      if (el.scrollIntoView) el.scrollIntoView({ behavior: beh, block: "start" });
      /* Climb overflow parents (gameday shell) so sit chips land in view. */
      var p = el.parentElement;
      while (p && p !== document.body) {
        var st = window.getComputedStyle ? getComputedStyle(p) : null;
        var oy = st && st.overflowY;
        if (oy === "auto" || oy === "scroll" || oy === "overlay") {
          try {
            var top =
              el.getBoundingClientRect().top - p.getBoundingClientRect().top + p.scrollTop - 8;
            if (typeof p.scrollTo === "function") p.scrollTo({ top: Math.max(0, top), behavior: beh });
            else p.scrollTop = Math.max(0, top);
          } catch (e2) {}
        }
        p = p.parentElement;
      }
      try {
        window.scrollTo({
          top: Math.max(0, window.scrollY + el.getBoundingClientRect().top - 8),
          behavior: beh,
        });
      } catch (e3) {}
    } catch (e) {}
  }

  function jumpTop(instant) {
    var id = document.getElementById("dcaller-top-anchor")
      ? "dcaller-top-anchor"
      : "dcaller-sit-anchor";
    jump(id, !!instant);
  }

  function openEditLast() {
    var on = onCall();
    if (on && on.playIndex != null) {
      openEdit(on.playIndex);
      return;
    }
    if (log.length) openEdit(log[log.length - 1].playIndex);
  }

  function openEdit(playIndex) {
    if (playIndex == null) return;
    editPi = playIndex;
    var entry = log.find(function (l) {
      return l.playIndex === playIndex;
    });
    editFlagsDraft = entry
      ? Array.isArray(entry.flags)
        ? entry.flags.slice()
        : entry.flag
          ? [entry.flag]
          : []
      : [];
    render();
    try {
      var el = document.querySelector("#view-dcaller .caller-edit-panel");
      if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    } catch (e) {}
  }

  function closeEdit() {
    editPi = null;
    editFlagsDraft = null;
    render();
  }

  /** Toggle a tag while the edit panel is open — draft only; patch .on without full re-render
   * so Down/Coverage selects the coach already changed aren't wiped. */
  function toggleEditFlag(flagId) {
    if (editPi == null || !flagId) return;
    if (!Array.isArray(editFlagsDraft)) editFlagsDraft = [];
    var ix = editFlagsDraft.indexOf(flagId);
    if (ix >= 0) editFlagsDraft.splice(ix, 1);
    else editFlagsDraft.push(flagId);
    try {
      var root = document.getElementById("dcaller-edit-anchor");
      if (!root) return;
      root.querySelectorAll("button[data-dc-flag]").forEach(function (btn) {
        var id = btn.getAttribute("data-dc-flag");
        if (editFlagsDraft.indexOf(id) >= 0) btn.classList.add("on");
        else btn.classList.remove("on");
      });
    } catch (e) {}
  }

  /** Step through the D log: -1 = older, +1 = newer. */
  function editStep(delta) {
    if (editPi == null || !log.length) return;
    var ix = log.findIndex(function (l) {
      return l.playIndex === editPi;
    });
    if (ix < 0) return;
    var next = ix + delta;
    if (next < 0 || next >= log.length) return;
    openEdit(log[next].playIndex);
  }

  function undoLast() {
    var on = onCall();
    if (!on || on.playIndex == null) return;
    if (!confirm("Remove the last D Caller snap?")) return;
    append("undo", on.playIndex, {});
    if (editPi === on.playIndex) editPi = null;
    render();
  }

  function submitEdit(playIndex, then) {
    var entry = log.find(function (l) {
      return l.playIndex === playIndex;
    });
    if (!entry) {
      editPi = null;
      render();
      return;
    }
    var dnEl = document.getElementById("dcEditDn");
    var dbEl = document.getElementById("dcEditDb");
    var hashEl = document.getElementById("dcEditHash");
    var zoneEl = document.getElementById("dcEditZone");
    var ptEl = document.getElementById("dcEditPlayType");
    var dirEl = document.getElementById("dcEditDir");
    var resEl = document.getElementById("dcEditResult");
    var covEl = document.getElementById("dcEditCoverage");
    var frontEl = document.getElementById("dcEditFront");
    var pressEl = document.getElementById("dcEditPressure");
    var dn = dnEl ? +dnEl.value : +entry.dn;
    var db = dbEl ? dbEl.value : entry.db;
    var hash = hashEl ? hashEl.value : entry.hash;
    var zone = zoneEl ? zoneEl.value : entry.zone;
    var playType = ptEl ? ptEl.value || entry.playType : entry.playType;
    var dir = dirEl ? dirEl.value || null : entry.theirDirection || null;
    if (dir === "") dir = null;
    var result = resEl ? resEl.value || null : entry.result;
    var coverage = covEl ? covEl.value || null : entry.coverage || null;
    var front = frontEl ? frontEl.value || null : entry.front || null;
    var pressure = pressEl ? pressEl.value || null : entry.pressure || null;
    /* Draft is authoritative — checkbox DOM was unreliable (checked UI, flags:[] on wire). */
    var flags = Array.isArray(editFlagsDraft) ? editFlagsDraft.filter(Boolean).slice() : [];
    if (!flags.length) {
      var root = document.getElementById("dcaller-edit-anchor");
      if (root) {
        root.querySelectorAll("input[data-dc-flag]").forEach(function (cb) {
          if (cb.checked) {
            var id = cb.getAttribute("data-dc-flag");
            if (id && flags.indexOf(id) < 0) flags.push(id);
          }
        });
      }
    }
    var play = (playType || "Play") + (dir ? " " + dir : "");
    var sitLine =
      ordinalFn(dn) +
      " & " +
      (db === "GOAL" ? "GOAL" : db) +
      (hash && hash !== "ANY" ? " " + hash : "");
    var OutEdit = O();
    var wbEdit =
      OutEdit && OutEdit.writebackEstYards
        ? OutEdit.writebackEstYards(entry, { dn: dn, db: db, zone: zone })
        : { estYards: estYardsForBucket(db) };
    append("correction", playIndex, {
      play: play,
      playType: playType,
      theirDirection: dir,
      dn: dn,
      db: db,
      estYards: wbEdit.estYards,
      hash: hash,
      zone: zone,
      sitTxt: sitLine,
      situationInferred: false,
      coverage: coverage,
      front: front,
      frontCarried: false,
      pressure: pressure,
      pressureCarried: false,
      result: result,
      flags: flags,
      flag: flags[0] || null,
    });
    if (then === "older") {
      var ix = log.findIndex(function (l) {
        return l.playIndex === playIndex;
      });
      if (ix > 0) {
        openEdit(log[ix - 1].playIndex);
        return;
      }
    }
    editPi = null;
    editFlagsDraft = null;
    render();
  }

  function lastPlayBarHtml() {
    var on = onCall();
    if (!on || !on.play) {
      if (!log.length) return "";
      return (
        `<div class="caller-oncall caller-oncall-empty no-print" role="status" style="display:flex;align-items:stretch;gap:8px;margin:0 0 10px;min-height:56px">` +
        `<div class="caller-oncall-idle" style="flex:1;display:flex;align-items:center;gap:10px;padding:10px 14px;border:2px dashed var(--line,#c5c9d1);border-radius:8px">` +
        `<span style="font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;opacity:.55">D LOG</span>` +
        `<span class="foot" style="font-weight:600">Tap Edit last to fix a prior snap</span></div>` +
        `<button type="button" class="caller-edit-last" style="min-width:100px;min-height:56px;font-weight:700;font-size:13px;line-height:1.15" onclick="OFFGRD_DCALLER.openEditLast()" title="Edit the last play, then step older">Edit last</button>` +
        `</div>`
      );
    }
    var Out = O();
    var graded = !!on.result;
    var kicker = graded ? "Last play" : "This play";
    var barBg = graded ? "#FFD24A" : "#2DBE6C";
    var barBd = graded ? "#13294B" : "#0B3D24";
    var resLbl =
      graded && Out && Out.resultLabel ? Out.resultLabel(on.result) : graded ? on.result : "grade below";
    /* Front → Coverage → Blitz/Stunts — natural D call order */
    var look = [on.front, on.coverage, on.pressure].filter(Boolean).join(" · ");
    var h =
      `<div class="caller-oncall${graded ? " caller-oncall-graded" : " caller-oncall-liveplay"} no-print" role="status" style="display:flex;align-items:stretch;gap:8px;margin:0 0 10px;min-height:56px">`;
    h +=
      `<div class="caller-oncall-live" style="flex:1;display:flex;flex-direction:column;justify-content:center;gap:2px;padding:10px 14px;background:${barBg};border:2px solid ${barBd};border-radius:8px;color:#0E1116">`;
    h +=
      `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><span style="font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase">${kicker}</span>` +
      `<span style="font-size:20px;font-weight:800">${esc(on.play)}</span></div>`;
    h +=
      `<div style="font-size:13px;font-weight:700;opacity:.85">${esc(on.sitTxt || "")}` +
      (look ? " · " + esc(look) : "") +
      (graded ? " · " + esc(resLbl) : " · grade below") +
      `</div></div>`;
    h +=
      `<button type="button" class="caller-edit-last" style="min-width:100px;min-height:56px;font-weight:700;font-size:13px;line-height:1.15" onclick="OFFGRD_DCALLER.openEditLast()" title="Edit this play, then step older through the log">Edit last</button>`;
    h +=
      `<button type="button" class="caller-undo" style="min-width:88px;min-height:56px;font-weight:700;font-size:13px;line-height:1.15" onclick="OFFGRD_DCALLER.undoLast()" title="Remove the snap entirely">Undo</button>`;
    h += `</div>`;
    return h;
  }

  function editPanelHtml() {
    if (editPi == null) return "";
    var entry = log.find(function (l) {
      return l.playIndex === editPi;
    });
    if (!entry) {
      editPi = null;
      return "";
    }
    var ix = log.findIndex(function (l) {
      return l.playIndex === editPi;
    });
    var n = log.length;
    var hasOlder = ix > 0;
    var hasNewer = ix >= 0 && ix < n - 1;
    var Out = O();
    var book = defBook();
    var buckets = Out ? Out.RESULT_BUCKETS || [] : [];
    var flags = Out ? Out.DEF_FLAGS || [] : [];
    var covOpts = ["Cover 0", "Cover 1", "Cover 2", "Cover 3", "Cover 4", "2-man", "Zone", "Man"];
    var curFlags = Array.isArray(editFlagsDraft)
      ? editFlagsDraft
      : Array.isArray(entry.flags)
        ? entry.flags
        : entry.flag
          ? [entry.flag]
          : [];
    var h = `<div class="caller-edit-panel no-print" id="dcaller-edit-anchor" role="dialog" aria-label="Edit defensive play">`;
    h += `<div class="persp" style="border:none;padding:0;margin-bottom:8px;flex-wrap:wrap;gap:8px">`;
    h += `<span class="pl"><b>Edit play</b> · ${esc(entry.play || "?")} · ${ix + 1}/${n}</span>`;
    h += `<button type="button" class="ghost" style="margin-left:auto" onclick="OFFGRD_DCALLER.closeEdit()">Close</button></div>`;
    h += `<div class="caller-edit-nav no-print">`;
    h += `<button type="button" class="caller-edit-nav-btn"${hasOlder ? "" : " disabled"} onclick="OFFGRD_DCALLER.editStep(-1)" title="Older play">← Older</button>`;
    h += `<span class="foot">${esc(entry.sitTxt || "")} · work backwards anytime</span>`;
    h += `<button type="button" class="caller-edit-nav-btn"${hasNewer ? "" : " disabled"} onclick="OFFGRD_DCALLER.editStep(1)" title="Newer play">Newer →</button>`;
    h += `</div>`;
    h += `<p class="foot" style="margin:0 0 8px">Saves a correction (history kept). Use Older to fix earlier snaps without leaving edit.</p>`;
    h += `<div class="grid" style="gap:8px">`;
    h += `<div><div class="lbl">Down</div><select id="dcEditDn" style="width:100%;min-height:44px">`;
    h += [1, 2, 3, 4]
      .map(function (d) {
        return `<option value="${d}"${+entry.dn === d ? " selected" : ""}>${d}</option>`;
      })
      .join("");
    h += `</select></div>`;
    h += `<div><div class="lbl">Distance</div><select id="dcEditDb" style="width:100%;min-height:44px">`;
    h += ["1-3", "4-6", "7-9", "10+", "GOAL"]
      .map(function (d) {
        return `<option value="${d}"${entry.db === d ? " selected" : ""}>${d}</option>`;
      })
      .join("");
    h += `</select></div>`;
    h += `<div><div class="lbl">Hash</div><select id="dcEditHash" style="width:100%;min-height:44px">`;
    h += [
      ["ANY", "ANY"],
      ["L", "L"],
      ["M", "M"],
      ["R", "R"],
    ]
      .map(function (p) {
        return `<option value="${p[0]}"${entry.hash === p[0] ? " selected" : ""}>${p[1]}</option>`;
      })
      .join("");
    h += `</select></div>`;
    h += `<div><div class="lbl">Field</div><select id="dcEditZone" style="width:100%;min-height:44px">`;
    h += [
      ["ANY", "ANY"],
      ["OWN", "OWN"],
      ["PLUS", "PLUS"],
      ["REDZONE", "RZ"],
    ]
      .map(function (p) {
        return `<option value="${p[0]}"${entry.zone === p[0] ? " selected" : ""}>${p[1]}</option>`;
      })
      .join("");
    h += `</select></div>`;
    h += `<div><div class="lbl">They ran</div><select id="dcEditPlayType" style="width:100%;min-height:44px">`;
    h += ["Run", "Pass"]
      .map(function (t) {
        return `<option value="${t}"${entry.playType === t ? " selected" : ""}>${t}</option>`;
      })
      .join("");
    h += `</select></div>`;
    h += `<div><div class="lbl">Direction</div><select id="dcEditDir" style="width:100%;min-height:44px"><option value=""></option>`;
    h += [
      ["L", "Left"],
      ["M", "Mid"],
      ["R", "Right"],
    ]
      .map(function (p) {
        return `<option value="${p[0]}"${entry.theirDirection === p[0] ? " selected" : ""}>${p[1]}</option>`;
      })
      .join("");
    h += `</select></div>`;
    h += `<div><div class="lbl">Front</div><select id="dcEditFront" style="width:100%;min-height:44px"><option value=""></option>`;
    h += (book.fronts || [])
      .map(function (f) {
        var id = f.id || f.name;
        return `<option value="${esc(id)}"${entry.front === id ? " selected" : ""}>${esc(f.name || id)}</option>`;
      })
      .join("");
    h += `</select></div>`;
    h += `<div><div class="lbl">Coverage</div><select id="dcEditCoverage" style="width:100%;min-height:44px"><option value=""></option>`;
    h += covOpts
      .map(function (c) {
        return `<option value="${esc(c)}"${entry.coverage === c ? " selected" : ""}>${esc(c)}</option>`;
      })
      .join("");
    h += `</select></div>`;
    h += `<div><div class="lbl">Blitz/Stunt</div><select id="dcEditPressure" style="width:100%;min-height:44px"><option value=""></option>`;
    h += (book.pressures || [])
      .map(function (p) {
        var id = p.id || p.name;
        var lab = /^none$/i.test(String(id)) ? "No blitz" : p.name || id;
        return `<option value="${esc(id)}"${entry.pressure === id ? " selected" : ""}>${esc(lab)}</option>`;
      })
      .join("");
    h += `</select></div>`;
    if (buckets.length) {
      h += `<div><div class="lbl">Yards allowed</div><select id="dcEditResult" style="width:100%;min-height:44px"><option value=""></option>`;
      h += buckets
        .map(function (b) {
          return `<option value="${b.id}"${entry.result === b.id ? " selected" : ""}>${b.label}</option>`;
        })
        .join("");
      h += `</select></div>`;
    }
    if (flags.length) {
      h += `<div style="grid-column:1/-1"><div class="lbl">Tags <span class="foot">optional · multi · tap to toggle</span></div><div class="caller-out-flags" style="margin-top:4px">`;
      h += flags
        .map(function (f) {
          var on = curFlags.indexOf(f.id) >= 0;
          /* Buttons + editFlagsDraft — same pattern as live grade strip. Checkbox-in-label
           * looked checked but Save often wrote flags:[] (capture miss). */
          return (
            `<button type="button" class="caller-out-flag${on ? " on" : ""}" data-dc-flag="${esc(f.id)}" ` +
            `onclick="OFFGRD_DCALLER.toggleEditFlag('${f.id}')">${esc(f.label)}</button>`
          );
        })
        .join("");
      h += `</div></div>`;
    }
    h += `</div>`;
    h += `<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">`;
    h += `<button type="button" class="caller-edit-save" style="flex:1;min-height:48px;font-weight:800" onclick="OFFGRD_DCALLER.submitEdit(${entry.playIndex})">Save</button>`;
    if (hasOlder)
      h += `<button type="button" class="caller-edit-save-older" style="flex:1;min-height:48px;font-weight:700" onclick="OFFGRD_DCALLER.submitEdit(${entry.playIndex},'older')">Save &amp; older</button>`;
    h += `<button type="button" class="ghost" style="min-height:48px" onclick="OFFGRD_DCALLER.closeEdit()">Cancel</button>`;
    h += `</div></div>`;
    return h;
  }

  function expectHtml() {
    var sample = expectSample();
    var all = sample.all;
    var thin = all.length < 6;
    var conf = sample.conf;
    if (!all.length) {
      var emptyMsg =
        sample.badge ||
        "No opponent-offense data for this sit yet · import their offense (or a full game), then log live.";
      return (
        `<div class="rd-dc-expect is-empty${sample.terminal ? " is-terminal" : ""} no-print">` +
        `<div class="rd-dc-expect-empty-kicker">No read yet</div>` +
        `<div class="rd-dc-expect-empty-body">${esc(emptyMsg)}</div>` +
        `</div>`
      );
    }
    var pass = passShare(all);
    var isPass = pass != null && pass >= 0.5;
    var lean = pass == null ? "?" : isPass ? "PASS" : "RUN";
    var leanPct = pass == null ? null : isPass ? pass : 1 - pass;
    var runPct = pass == null ? 0.5 : 1 - pass;
    var passPct = pass == null ? 0.5 : pass;
    var runW = Math.max(4, Math.round(runPct * 100));
    var passW = Math.max(4, 100 - runW);
    var forms = topForms(all);
    var mot = motionRate(all);
    var confLevel = (conf && conf.level) || (thin ? "THIN" : "");
    var confTone = (conf && conf.tone) || (thin ? "bad" : "good");
    var h =
      `<div class="rd-dc-expect${thin ? " is-thin" : ""}${sample.widened ? " is-widened" : ""}${pass == null ? "" : isPass ? " is-pass" : " is-run"} no-print">`;
    h += `<div class="rd-dc-expect-hero">`;
    h += `<div class="rd-dc-expect-hero-copy">`;
    h += `<div class="rd-dc-expect-kicker">${lean === "PASS" ? "They'll pass" : lean === "RUN" ? "They'll run" : "Tendency"}</div>`;
    h += `<div class="rd-dc-expect-big">`;
    h += `<span class="rd-dc-expect-lean">${esc(lean)}</span>`;
    if (leanPct != null) h += `<span class="rd-dc-expect-pct">${esc(fmt(leanPct))}</span>`;
    h += `</div></div>`;
    if (confLevel) {
      h += `<span class="rd-dc-expect-conf tone-${esc(confTone)}">${esc(confLevel)}</span>`;
    }
    h += `</div>`;
    if (pass != null) {
      h += `<div class="rd-dc-expect-split" aria-hidden="true">`;
      h += `<span class="rd-dc-expect-split-run" style="width:${runW}%"></span>`;
      h += `<span class="rd-dc-expect-split-pass" style="width:${passW}%"></span>`;
      h += `</div>`;
      h += `<div class="rd-dc-expect-split-lbl">`;
      h += `<span>Run ${esc(fmt(runPct))}</span>`;
      h += `<span>Pass ${esc(fmt(passPct))}</span>`;
      h += `</div>`;
    }
    h += `<div class="rd-dc-expect-chips">`;
    if (forms.length) {
      forms.forEach(function (f) {
        var dir = dirLean(all, f.k);
        var dirTxt = dir
          ? dir.k === "L"
            ? "runs left"
            : dir.k === "R"
              ? "runs right"
              : "runs mid"
          : "";
        h += `<div class="rd-dc-expect-chip">`;
        h += `<span class="rd-dc-expect-chip-k">${esc(f.k)}</span>`;
        h += `<span class="rd-dc-expect-chip-v">${esc(fmt(f.pct))}</span>`;
        if (dirTxt) h += `<span class="rd-dc-expect-chip-d">${esc(dirTxt)}</span>`;
        h += `</div>`;
      });
    } else {
      h += `<div class="rd-dc-expect-chip is-muted"><span class="rd-dc-expect-chip-k">Formation</span><span class="rd-dc-expect-chip-v">—</span><span class="rd-dc-expect-chip-d">run/pass only</span></div>`;
    }
    if (mot != null) {
      h += `<div class="rd-dc-expect-chip">`;
      h += `<span class="rd-dc-expect-chip-k">Motion</span>`;
      h += `<span class="rd-dc-expect-chip-v">${esc(fmt(mot))}</span>`;
      h += `</div>`;
    }
    h += `</div>`;
    h += `<div class="rd-dc-expect-meta">`;
    h += `<span>${all.length} snap${all.length === 1 ? "" : "s"}</span>`;
    if (sample.live && sample.live.length) h += `<span>${sample.live.length} live tonight</span>`;
    if (thin) h += `<span>thin sample</span>`;
    h += `</div>`;
    if (sample.badge) {
      h += `<div class="rd-gd-widen-badge">${esc(sample.badge)}</div>`;
    }
    h += `</div>`;
    var shift = tendencyShift(sample);
    if (shift) {
      h +=
        `<div class="rd-dc-shift no-print" role="status">` +
        `<span class="rd-dc-shift-kicker">Breaking tendency</span>` +
        `<span class="rd-dc-shift-body">${esc(shift.tonightLean)} ${shift.liveN}/${shift.liveN} tonight` +
        ` · season ${esc(shift.seasonLean)} ${fmt(shift.seasonLean === "pass" ? shift.seasonPass : 1 - shift.seasonPass)}` +
        ` (${shift.seasonN} snaps)</span></div>`;
    }
    return h;
  }

  function sectionKickerHtml(num, title, sub) {
    return (
      `<div class="rd-gd-section-kicker">` +
      `<span class="rd-gd-section-num">${esc(String(num))}</span>` +
      `<span class="rd-gd-section-title">${esc(title)}</span>` +
      (sub ? `<span class="rd-gd-section-sub">${esc(sub)}</span>` : "") +
      `</div>`
    );
  }

  function lookHtml() {
    var book = defBook();
    var covs = ["Cover 0", "Cover 1", "Cover 2", "Cover 3", "Cover 4", "2-man"];
    var h = `<div class="rd-dc-look no-print">`;
    /* Front → Coverage → Blitz/Stunt — natural D-call order */
    h += `<div class="lbl rd-look-lbl" style="margin-top:0">Front</div><div class="seg covlog rd-gd-look-seg">`;
    h += (book.fronts || [])
      .slice(0, 8)
      .map(function (f) {
        var id = f.id || f.name;
        return `<button type="button"${sit.front === id ? ' class="on"' : ""} onclick="OFFGRD_DCALLER.setLook('front','${String(id).replace(/'/g, "")}')">${esc(f.name || id)}</button>`;
      })
      .join("");
    h += `</div><div class="lbl rd-look-lbl" style="margin-top:8px">Coverage</div><div class="seg covlog rd-gd-look-seg">`;
    h += covs
      .map(function (cv) {
        return `<button type="button"${sit.coverage === cv ? ' class="on"' : ""} onclick="OFFGRD_DCALLER.setLook('coverage','${cv}')">${cv}</button>`;
      })
      .join("");
    h += `</div><div class="lbl rd-look-lbl" style="margin-top:8px">Blitz/Stunt</div><div class="seg covlog rd-gd-look-seg">`;
    h += (book.pressures || [])
      .slice(0, 8)
      .map(function (p) {
        var id = p.id || p.name;
        var lab = /^none$/i.test(String(id)) ? "No blitz" : p.name || id;
        return `<button type="button"${sit.pressure === id ? ' class="on"' : ""} onclick="OFFGRD_DCALLER.setLook('pressure','${String(id).replace(/'/g, "")}')">${esc(lab)}</button>`;
      })
      .join("");
    h += `</div></div>`;
    return h;
  }

  function yardToneClass(id) {
    if (id === "loss" || id === "no_gain") return " is-stop";
    if (id === "short" || id === "solid") return " is-short";
    if (id === "chunk" || id === "explosive") return " is-chunk";
    if (id === "td") return " is-td";
    if (id === "turnover") return " is-to";
    return "";
  }

  function yardsPadHtml(buckets, live, isTwo, Out) {
    var grouped = [
      { key: "stop", label: "Stop", ids: { loss: 1, no_gain: 1 } },
      { key: "gain", label: "Yards", ids: { short: 1, solid: 1, chunk: 1, explosive: 1 } },
      { key: "game", label: "Score / TO", ids: { td: 1, turnover: 1 } },
    ];
    var used = {};
    var canGroup = !isTwo && buckets.some(function (b) {
      return b.id === "loss" || b.id === "short" || b.id === "td";
    });
    var h = `<div class="caller-out-results rd-dc-yards${canGroup ? " is-pad" : ""}">`;
    if (canGroup) {
      grouped.forEach(function (g) {
        var items = buckets.filter(function (b) {
          return g.ids[b.id];
        });
        if (!items.length) return;
        items.forEach(function (b) {
          used[b.id] = 1;
        });
        h += `<div class="rd-dc-yards-group rd-dc-yards-${g.key}">`;
        h += `<div class="rd-dc-yards-gl">${g.label}</div>`;
        h += `<div class="rd-dc-yards-row">`;
        items.forEach(function (b) {
          var on = live.result === b.id;
          h += `<button type="button" class="caller-out-btn rd-dc-yard${yardToneClass(b.id)}${on ? " on" : ""}" onclick="OFFGRD_DCALLER.grade(${live.playIndex},'${b.id}')">${b.label}</button>`;
        });
        h += `</div></div>`;
      });
    }
    var leftover = buckets.filter(function (b) {
      return !used[b.id];
    });
    if (leftover.length) {
      h += `<div class="rd-dc-yards-row rd-dc-yards-flat">`;
      leftover.forEach(function (b) {
        var on = live.result === b.id;
        h += `<button type="button" class="caller-out-btn rd-dc-yard${yardToneClass(b.id)}${on ? " on" : ""}" onclick="OFFGRD_DCALLER.grade(${live.playIndex},'${b.id}')">${b.label}</button>`;
      });
      h += `</div>`;
    }
    if (!isTwo && Out && Out.movedChainsSituation) {
      h += `<button type="button" class="caller-out-btn caller-out-convert rd-dc-yard-convert${live.movedChains ? " on" : ""}" onclick="OFFGRD_DCALLER.movedChains(${live.playIndex})">Moved the chains</button>`;
    }
    h += `</div>`;
    return h;
  }

  function resultPanelHtml() {
    var live = liveCall();
    var Out = O();
    var isST = live && Out && Out.isSpecialType && Out.isSpecialType(live.playType);
    var isTwo =
      (live && live.forTwo) ||
      (live && Out && Out.isTwoptResult && Out.isTwoptResult(live.result)) ||
      sit.forTwo;
    var buckets =
      isST && Out.stSetFor
        ? Out.stSetFor(live.playType) || []
        : isTwo && Out && Out.stSetFor
          ? Out.stSetFor("twopt") || []
          : Out
            ? Out.RESULT_BUCKETS
            : [];
    var flags = Out ? Out.DEF_FLAGS : [];
    var h = `<div class="rd-dc-result rd-gd-section no-print" id="dcaller-result-anchor">`;

    if (isST) {
      var stLabel =
        live.playType === "punt"
          ? "Grade punt"
          : live.playType === "fg"
            ? "Grade kick"
            : "Grade PAT";
      h += sectionKickerHtml(4, stLabel);
      h += `<div class="rd-dc-grade-card"><div class="lbl">${esc(live.play)}</div>`;
      h += `<div class="caller-out-results">`;
      h += buckets
        .map(function (b) {
          var on = live.result === b.id;
          return `<button type="button" class="caller-out-btn${on ? " on" : ""}" onclick="OFFGRD_DCALLER.grade(${live.playIndex},'${b.id}')">${b.label}</button>`;
        })
        .join("");
      h += `</div>`;
      h += `<p class="foot" style="margin:8px 0 0">${live.playType === "xp" ? "Then next series is 1st &amp; 10." : "Then confirm the next sit (usually 1st &amp; 10)."}</p></div>`;
      h += `</div>`;
      return h;
    }

    var livePt = live && live.playType ? String(live.playType) : "";
    var liveDir =
      (live && live.theirDirection) ||
      pendingDir ||
      "";
    h += sectionKickerHtml(
      4,
      isTwo ? "2PT · what they ran" : "What they ran + yards allowed"
    );
    h += `<div class="lbl rd-look-lbl">They ran</div>`;
    h += `<div class="seg covlog rd-dc-rp">`;
    h += `<button type="button" class="rd-dc-rp-btn${livePt === "Run" ? " on" : ""}" onclick="OFFGRD_DCALLER.logTheirPlay('Run')">Run</button>`;
    h += `<button type="button" class="rd-dc-rp-btn${livePt === "Pass" ? " on" : ""}" onclick="OFFGRD_DCALLER.logTheirPlay('Pass')">Pass</button>`;
    h += `</div>`;
    h += `<div class="lbl rd-look-lbl" style="margin-top:8px">Direction <span class="foot">optional</span></div>`;
    h += `<div class="seg covlog rd-dc-dir">`;
    ["L", "M", "R"].forEach(function (d) {
      var onDir = liveDir === d;
      h += `<button type="button" class="rd-dc-dir-btn${onDir ? " on" : ""}" onclick="OFFGRD_DCALLER.setDir('${d}')">${d === "L" ? "Left" : d === "R" ? "Right" : "Mid"}</button>`;
    });
    h += `</div>`;
    h += `<p class="foot" style="margin:6px 0 10px">Direction optional · tap before or after Run/Pass</p>`;

    if (live) {
      h += `<div class="rd-dc-grade-card${live.result ? "" : " is-pending"}">`;
      h += `<div class="rd-dc-grade-title">${isTwo ? "2-pt result" : "Yards allowed"}</div>`;
      h += `<div class="rd-dc-grade-sub">${esc(live.play)}${live.result ? "" : " · tap one"}</div>`;
      h += yardsPadHtml(buckets, live, isTwo, Out);
      if (live.result && !isTwo) {
        h += `<div class="rd-gd-lastplay-block rd-dc-tag-block">`;
        h += `<div class="rd-gd-lastplay-block-lbl">Tag <span class="foot">optional · multi</span></div>`;
        h += `<div class="caller-out-flags">`;
        var cur = Array.isArray(live.flags) ? live.flags : live.flag ? [live.flag] : [];
        h += flags
          .map(function (f) {
            var on = cur.indexOf(f.id) >= 0;
            return `<button type="button" class="caller-out-flag${on ? " on" : ""}" onclick="OFFGRD_DCALLER.toggleFlag(${live.playIndex},'${f.id}')">${esc(f.label)}</button>`;
          })
          .join("");
        h += `</div></div>`;
      } else if (!live.result) {
        h += `<p class="foot" style="margin:8px 0 0">${isTwo ? "Tap Converted or Failed" : "Tap yards — jumps you to the next sit · flags optional after"}</p>`;
      }
      h += `</div>`;
    } else {
      h += `<div class="rd-dc-grade-card is-waiting">`;
      h += `<div class="rd-dc-grade-title">Yards allowed</div>`;
      h += `<div class="rd-dc-grade-sub">Tap Run or Pass above — yard buckets show here</div>`;
      h += `</div>`;
    }
    h += `</div>`;
    return h;
  }

  function logForUi() {
    var Side = global.OFFGRD_CALLER_SIDE;
    if (Side && Side.filterLogBySide) return Side.filterLogBySide(log, "defense");
    return (log || []).filter(function (l) {
      return l && l.side === "defense";
    });
  }

  function logHtml() {
    var rows = logForUi();
    if (!rows.length) return `<p class="foot">No defensive snaps logged yet.</p>`;
    var Out = O();
    var h = `<div class="rd-dc-log"><div class="persp" style="border:none;padding:0;margin-bottom:6px"><span class="pl"><b>D log</b></span>`;
    h += `<button type="button" class="ghost no-print" style="margin-left:auto" onclick="OFFGRD_DCALLER.clear()">Clear</button></div>`;
    rows
      .slice()
      .reverse()
      .forEach(function (l) {
        var res =
          l.result && Out && Out.resultLabel
            ? Out.resultLabel(l.result)
            : l.result || "…";
        var tags = Array.isArray(l.flags) && l.flags.length ? " · " + l.flags.join(", ") : "";
        var our =
          [l.front, l.coverage, l.pressure].filter(Boolean).join(" · ") || "no D call";
        var isEdit = editPi != null && l.playIndex === editPi;
        var cls = "callitem" + (isEdit ? " callitem-editing" : "");
        h += `<div class="${cls}"><div class="cn">${esc(l.sitTxt)}</div><div style="flex:1;font-weight:600">${esc(l.play)} <span class="foot">${esc(res)}${esc(tags)}</span><div class="foot">${esc(our)}</div></div>`;
        h += `<button type="button" class="ghost caller-edit-row no-print" style="padding:6px 10px;min-height:40px;font-weight:700" onclick="OFFGRD_DCALLER.openEdit(${l.playIndex})" title="Edit this play">Edit</button></div>`;
      });
    h += `</div>`;
    return h;
  }

  function render() {
    var host = document.getElementById("view-dcaller");
    if (!host) return;
    ensureSession();
    var oName = ensureSession().opp || opp();
    var crestHtml = "";
    try {
      if (typeof crest === "function") crestHtml = crest(oName !== "ANY" ? oName : "", 28);
    } catch (e) {}
    var h = `<div class="rd-gd rd-dc" data-acc-skip id="dcaller-top-anchor">`;
    h += `<div class="rd-gd-top">${crestHtml}<b>${esc(oName !== "ANY" ? oName : "opponent")}</b>`;
    h += `<span class="rd-gd-chip">D CALLER</span>`;
    try {
      if (typeof callerOdToggleHtml === "function") h += callerOdToggleHtml("d");
    } catch (eOd) {}
    h += `<button type="button" class="rd-gd-btn rd-gd-booth" onclick="setBooth(!document.documentElement.classList.contains('rd-booth'))">${document.documentElement.classList.contains("rd-booth") ? "Booth on" : "Booth"}</button>`;
    h += `<button type="button" class="rd-gd-exit" onclick="setView('scout')">Exit</button></div>`;
    h += syncStateHtml();
    h += driveToastHtml();
    h += lastPlayBarHtml();
    h += editPanelHtml();
    var flowCur = 1;
    var liveOn = liveCall();
    if (liveOn && liveOn.play && !liveOn.result) {
      flowCur = sit.coverage || sit.front || sit.pressure ? 4 : 3;
    } else if (sit.needsInput || sit.inferred) {
      flowCur = 1;
    } else if (liveOn && liveOn.play && liveOn.result) {
      flowCur = 1;
    } else {
      flowCur = 2; /* sit set · Expect / ready */
    }
    var flowSteps = [
      { n: 1, l: "Sit" },
      { n: 2, l: "Expect" },
      { n: 3, l: "Call" },
      { n: 4, l: "Result" },
    ];
    h += `<div class="rd-gd-flow no-print" aria-label="Guided call loop">`;
    flowSteps.forEach(function (s, i) {
      var cls =
        "rd-gd-flow-step" +
        (s.n === flowCur ? " on" : "") +
        (s.n < flowCur ? " done" : "");
      if (i) h += `<span class="rd-gd-flow-sep" aria-hidden="true">→</span>`;
      h += `<span class="${cls}"><i>${s.n}</i>${s.l}</span>`;
    });
    h += `</div>`;

    var sitTry = !!sit.pendingTry;
    var sitTwo = !!sit.forTwo;
    h += `<div id="dcaller-sit-anchor" class="rd-gd-sit${sit.inferred ? " rd-gd-sit-inferred" : ""}${sit.needsInput || sitTry || sitTwo ? " rd-gd-sit-needs" : ""}">`;
    h += `<div class="rd-gd-sit-txt"><span class="rd-gd-sit-kicker"><span class="rd-gd-section-num">1</span><span class="rd-gd-section-title">Their situation</span></span> ${esc(sitTwo ? "2-pt" : sitTxt())}`;
    if (sit.inferred) h += ` <span class="rd-gd-sit-est">est.</span>`;
    if (sit.needsInput) h += ` <span class="rd-gd-sit-need">confirm</span>`;
    if (sitTry) h += ` <span class="rd-gd-sit-need">try</span>`;
    if (sitTwo) h += ` <span class="rd-gd-sit-need">2-pt</span>`;
    h += `</div>`;
    if (sit.inferred || sit.needsInput || sitTry || sitTwo) {
      h += `<div class="rd-gd-sit-infer-bar"><span class="foot">${esc(sitNeedMsg())}</span>`;
      if (!sitTry && !sitTwo) {
        h += `<button type="button" class="rd-gd-sit-confirm" onclick="OFFGRD_DCALLER.confirmSit()">Confirm ${esc(sitConfirmLabel())}</button>`;
        h += `<button type="button" class="rd-gd-sit-reset" onclick="OFFGRD_DCALLER.resetFirstDown()">${esc(resetFirstDownLabel())}</button>`;
      }
      h += `</div>`;
    }
    h += `<div class="rd-gd-sit-grid">`;
    h += `<div><div class="lbl">Down</div><div class="seg">` +
      [1, 2, 3, 4]
        .map(function (o, i) {
          return `<button type="button"${+sit.dn === o ? ' class="on"' : ""} onclick="OFFGRD_DCALLER.setSit('dn','${o}')">${["1ST", "2ND", "3RD", "4TH"][i]}</button>`;
        })
        .join("") +
      `</div></div>`;
    h += `<div><div class="lbl">Distance</div><div class="seg">` +
      ["1-3", "4-6", "7-9", "10+", "GOAL"]
        .map(function (o) {
          return `<button type="button"${sit.db === o ? ' class="on"' : ""} onclick="OFFGRD_DCALLER.setSit('db','${o}')">${o}</button>`;
        })
        .join("") +
      `</div></div>`;
    h += `<div><div class="lbl">Hash</div><div class="seg">` +
      [["ANY", "ANY"], ["L", "L"], ["M", "M"], ["R", "R"]]
        .map(function (p) {
          return `<button type="button"${sit.hash === p[0] ? ' class="on"' : ""} onclick="OFFGRD_DCALLER.setSit('hash','${p[0]}')">${p[1]}</button>`;
        })
        .join("") +
      `</div></div>`;
    h += `<div><div class="lbl">Field</div><div class="seg">` +
      [["ANY", "ANY"], ["OWN", "OWN"], ["PLUS", "PLUS"], ["REDZONE", "RZ"]]
        .map(function (p) {
          return `<button type="button"${sit.zone === p[0] ? ' class="on"' : ""} onclick="OFFGRD_DCALLER.setSit('zone','${p[0]}')">${p[1]}</button>`;
        })
        .join("") +
      `</div></div>`;
    h += `</div>`;
    if (!sitTry && !sitTwo) {
      h += `<div class="rd-gd-drive-over no-print" role="group" aria-label="Drive over">`;
      h += `<div class="rd-gd-drive-over-head"><span class="rd-gd-drive-over-kicker">Possession</span>`;
      h += `<span class="rd-gd-drive-over-title">Drive over</span>`;
      h += `<span class="foot rd-gd-drive-over-sub">Tap when the series ends</span></div>`;
      h += `<div class="rd-gd-drive-over-btns">`;
      h += `<button type="button" class="rd-gd-drive-over-btn" onclick="OFFGRD_DCALLER.driveOver('punt')">Punt</button>`;
      h += `<button type="button" class="rd-gd-drive-over-btn" onclick="OFFGRD_DCALLER.driveOver('downs')">Downs</button>`;
      h += `<button type="button" class="rd-gd-drive-over-btn" onclick="OFFGRD_DCALLER.driveOver('takeaway')">Takeaway</button>`;
      h += `<button type="button" class="rd-gd-drive-over-btn" onclick="OFFGRD_DCALLER.driveOver('score')">Score</button>`;
      h += `</div></div>`;
    }
    h += `</div>`;

    h += tryBarHtml();
    if (!sitTry || sitTwo) {
      if (!sitTwo) {
        h += `<div class="rd-gd-section rd-gd-section-expect">`;
        h += sectionKickerHtml(2, "Expect");
        h += expectHtml();
        h += `</div>`;
        h += `<div class="rd-gd-section rd-gd-section-call">`;
        h += sectionKickerHtml(
          3,
          "Your D call",
          "Front · Coverage · Blitz/Stunt · optional · clears after each snap"
        );
        h += lookHtml();
        h += stRowHtml();
        h += `</div>`;
      }
      h += resultPanelHtml();
      h += `<p class="foot no-print" style="margin:8px 0 0">Yards allowed jumps you back to the top for the next sit. Edit last / row Edit to correct snaps.</p>`;
    } else if (liveCall()) {
      h += resultPanelHtml();
    }
    h += livePanelHtml();
    h += `<div class="rd-gd-panel" style="margin-top:12px"><div class="lbl">Game</div>`;
    h += marksHtml();
    h += logHtml();
    h += `</div>`;
    h += finalReviewHtml();
    h += `</div>`;
    host.innerHTML = h;
  }

  function setDir(d) {
    var live = liveCall();
    /* Live ungraded snap — toggle direction on this play (not just the next one). */
    if (live && !live.result) {
      var next = live.theirDirection === d ? null : d;
      var pt = live.playType || "Play";
      var play = pt + (next ? " " + next : "");
      append("correction", live.playIndex, {
        theirDirection: next,
        play: play,
        playType: pt,
      });
      pendingDir = null;
      saveLocal();
      render();
      return;
    }
    pendingDir = pendingDir === d ? null : d;
    render();
  }

  function init() {
    loadSession();
    ensureSession();
    if (opp() !== "ANY" && session) session.opp = opp();
    ensureSyncBound();
    syncNow();
  }

  global.OFFGRD_DCALLER = {
    init: init,
    render: render,
    setSit: setSit,
    setLook: setLook,
    setDir: setDir,
    confirmSit: confirmSit,
    resetFirstDown: resetFirstDown,
    driveOver: driveOver,
    movedChains: movedChains,
    logForUi: logForUi,
    logTheirPlay: logTheirPlay,
    logST: logST,
    logTry: logTry,
    startTwoPoint: startTwoPoint,
    skipTry: skipTry,
    jumpResult: function () {
      jump("dcaller-result-anchor", true);
    },
    grade: grade,
    toggleFlag: toggleFlag,
    clear: clearLog,
    syncNow: syncNow,
    upload: upload,
    openEditLast: openEditLast,
    openEdit: openEdit,
    closeEdit: closeEdit,
    toggleEditFlag: toggleEditFlag,
    editStep: editStep,
    submitEdit: submitEdit,
    undoLast: undoLast,
    jumpTop: jumpTop,
    markBreak: markBreak,
    setLiveExpanded: setLiveExpanded,
    dismissDriveToast: dismissDriveToast,
    dismissHalftime: dismissHalftime,
    dismissSummary: dismissSummary,
    setMondayCandidateGroup: setMondayCandidateGroup,
    toggleMondayCandidate: toggleMondayCandidate,
    sendMondayFocusToPractice: sendMondayFocusToPractice,
    setBoothChip: setBoothChip,
    boothAskSubmit: boothAskSubmit,
    boothReask: boothReask,
    tendencyShiftSample: tendencyShiftSample,
    collectActiveShifts: collectActiveShifts,
    /** Always rebuild from folded log (same rows the call log displays). */
    getMondayFocusPayload: function () {
      mondayFocusPayload = buildMondayFocusFromLog();
      return mondayFocusPayload;
    },
    getLog: function () {
      return logForUi().slice();
    },
    getEvents: function () {
      return events.slice();
    },
    getBreaks: function () {
      return breaks.slice();
    },
    /** Folded bust count — checkpoint before Final. */
    countTaggedBusts: function () {
      return log.filter(function (l) {
        var fl = Array.isArray(l.flags) ? l.flags : l.flag ? [l.flag] : [];
        return fl.indexOf("bust") >= 0;
      }).length;
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
