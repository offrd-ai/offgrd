/**
 * O Caller Guided = game mode. Layout helpers only — no ranking.
 *
 * Sit banner + 4-row editor, after-snap copy, 5s delete-undo, tap-to-paint mark.
 * Pure. DOM-free except optional paint logger.
 *
 *   window.OFFGRD_CALLER_GAME
 */
(function (global) {
  "use strict";

  var UNDO_MS = 5000;

  var DN_LBL = ["1ST", "2ND", "3RD", "4TH"];
  var ZONE_LBL = { ANY: "ANY", OWN: "OWN", PLUS: "PLUS", REDZONE: "RZ" };

  function isGuided(mode) {
    return mode !== "advanced";
  }

  function sitChipLabels(cs) {
    cs = cs || {};
    var dn = +cs.dn || 1;
    return {
      dn: DN_LBL[dn - 1] || String(dn),
      db: cs.db || "10+",
      hash: cs.hash && cs.hash !== "" ? String(cs.hash) : "ANY",
      zone: ZONE_LBL[cs.zone] || (cs.zone ? String(cs.zone) : "ANY"),
    };
  }

  function sitChipLine(cs) {
    var c = sitChipLabels(cs);
    return c.dn + " · " + c.db + " · " + c.hash + " · " + c.zone;
  }

  var DN_SPEAK = { 1: "1st", 2: "2nd", 3: "3rd", 4: "4th" };

  /** Coach-spoken sit: "1st & 10", never "1st & 10+". */
  function sitSpeak(sit) {
    sit = sit || {};
    var dn = DN_SPEAK[+sit.dn] || String(sit.dn || "1st");
    var db = sit.db || "10+";
    var dist = db === "10+" ? "10" : db === "GOAL" ? "GOAL" : db;
    return dn + " & " + dist;
  }

  /**
   * Sheet title. Internal pool codes (EXACT / DOWN ONLY / DISTANCE x/y)
   * stay off the game screen.
   */
  function coachSheetTitle(cs, meta) {
    meta = meta || {};
    var speak = sitSpeak(cs);
    var n = meta.n != null ? +meta.n : 0;
    var nBit = n > 0 ? " (" + n + ")" : "";
    var badge = String(meta.badge || meta.widenLabel || "");
    var downOnly = meta.rung === 4 || /down only/i.test(badge);
    if (meta.widened) {
      var dnWord = DN_SPEAK[+cs.dn] || "this";
      if (downOnly) {
        return "Not enough exact snaps — showing all " + dnWord + " down" + nBit;
      }
      return "Not enough exact snaps — showing a wider " + speak + " pool" + nBit;
    }
    return "Best for " + speak;
  }

  function isEntryPaint(label) {
    return (
      label === "entry" ||
      label === "sit" ||
      label === "expect" ||
      label === "screen"
    );
  }

  /** Screen A banner: "2nd & 7 · L · OWN" — never "10+". */
  function sitBannerLine(cs) {
    cs = cs || {};
    var bits = [sitSpeak(cs)];
    if (cs.hash && cs.hash !== "ANY") bits.push(String(cs.hash));
    var z = ZONE_LBL[cs.zone];
    if (cs.zone && cs.zone !== "ANY") bits.push(z || String(cs.zone));
    return bits.join(" · ");
  }

  function speakSitTxt(txt) {
    return String(txt || "").replace(/\b10\+/g, "10");
  }

  function pendingNeedLabel(n) {
    n = +n || 0;
    if (n === 1) return "1 older play needs results";
    return n + " older plays need results";
  }

  function nextScreenAfterCall() {
    return "b";
  }

  function covShort(k) {
    if (!k) return "";
    var s = String(k).replace(/\s+/g, " ").trim();
    var m = /^cover\s*([0-6])$/i.exec(s);
    if (m) return "C" + m[1];
    if (/^2[\s-]?man$/i.test(s)) return "2M";
    if (/^zone$/i.test(s)) return "ZN";
    if (/^man$/i.test(s)) return "MN";
    return s.length > 8 ? s.slice(0, 8) : s;
  }

  function frontShort(k) {
    if (!k) return "";
    return String(k).replace(/\s+/g, " ").trim();
  }

  /**
   * One-glance Expect: "C4 54% · 3-4 · 38% blz"
   * Empty / terminal → honest "No sample" — never invent a look.
   */
  function expectGlance(input) {
    input = input || {};
    if (input.terminal && !(input.n > 0)) {
      return { text: "No sample", empty: true };
    }
    if (!(input.n > 0)) {
      return { text: "No sample", empty: true };
    }
    var bits = [];
    var cov = covShort(input.cov);
    if (cov) {
      bits.push(input.covPct != null ? cov + " " + Math.round(+input.covPct * 100) + "%" : cov);
    }
    var fr = frontShort(input.front);
    if (fr) bits.push(fr);
    if (input.pr != null && isFinite(+input.pr)) {
      bits.push(Math.round(+input.pr * 100) + "% blz");
    }
    return { text: bits.length ? bits.join(" · ") : "No sample", empty: !bits.length };
  }

  var _pending = null;
  var _timer = null;
  var _clock = {
    now: function () {
      return Date.now();
    },
    setTimeout: function (fn, ms) {
      return setTimeout(fn, ms);
    },
    clearTimeout: function (id) {
      clearTimeout(id);
    },
  };

  function useClock(clock) {
    if (clock) _clock = clock;
    return _clock;
  }

  function pendingDelete() {
    return _pending;
  }

  function cancelDelete() {
    if (_timer != null) {
      try {
        _clock.clearTimeout(_timer);
      } catch (e) {}
      _timer = null;
    }
    var was = _pending;
    _pending = null;
    return was;
  }

  /**
   * Hide the row now; commit undo after 5s unless cancelled.
   * commitFn({ playIndex, play }) runs once.
   */
  function queueDelete(item, commitFn, timeoutMs) {
    cancelDelete();
    if (!item || item.playIndex == null) return null;
    var ms = timeoutMs != null ? +timeoutMs : UNDO_MS;
    _pending = {
      playIndex: item.playIndex,
      play: item.play || "",
      until: _clock.now() + ms,
    };
    _timer = _clock.setTimeout(function () {
      var p = _pending;
      _pending = null;
      _timer = null;
      if (p && typeof commitFn === "function") commitFn(p);
    }, ms);
    return _pending;
  }

  function isHiddenPlayIndex(playIndex) {
    return !!(
      _pending &&
      playIndex != null &&
      +_pending.playIndex === +playIndex
    );
  }

  function filterHidden(log) {
    if (!_pending) return log || [];
    return (log || []).filter(function (l) {
      return !l || +l.playIndex !== +_pending.playIndex;
    });
  }

  function markPaint(label, t0, nowFn) {
    var now =
      typeof nowFn === "function"
        ? nowFn
        : typeof performance !== "undefined" && performance.now
          ? function () {
              return performance.now();
            }
          : function () {
              return Date.now();
            };
    var ms = now() - t0;
    try {
      if (typeof console !== "undefined" && console.log) {
        console.log("[caller-paint]", label, Math.round(ms) + "ms");
      }
    } catch (e) {}
    return ms;
  }

  var API = {
    UNDO_MS: UNDO_MS,
    isGuided: isGuided,
    sitChipLabels: sitChipLabels,
    sitChipLine: sitChipLine,
    sitSpeak: sitSpeak,
    sitBannerLine: sitBannerLine,
    speakSitTxt: speakSitTxt,
    pendingNeedLabel: pendingNeedLabel,
    nextScreenAfterCall: nextScreenAfterCall,
    coachSheetTitle: coachSheetTitle,
    isEntryPaint: isEntryPaint,
    covShort: covShort,
    frontShort: frontShort,
    expectGlance: expectGlance,
    useClock: useClock,
    pendingDelete: pendingDelete,
    cancelDelete: cancelDelete,
    queueDelete: queueDelete,
    isHiddenPlayIndex: isHiddenPlayIndex,
    filterHidden: filterHidden,
    markPaint: markPaint,
  };

  global.OFFGRD_CALLER_GAME = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(
  typeof globalThis !== "undefined"
    ? globalThis
    : typeof window !== "undefined"
      ? window
      : this
);
