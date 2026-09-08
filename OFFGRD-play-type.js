/**
 * Play type — run / pass / rpo on every offense play.
 *
 * Canonical storage on the play: type, typeSource, typeOverride.
 * Old stubs wrote type:"pass" with no source — that is not a type.
 * First hit wins; override is sticky through re-derive.
 *
 *   window.OFFGRD_PLAY_TYPE
 */
(function (global) {
  "use strict";

  var NAME_RUN = /\b(zone|power|counter|iso|toss|sweep|draw|blast|dive)\b/i;
  var FAMILY_RUN =
    /\b(inside\s*run|outside\s*run|gap|power|counter|iso|toss|sweep|draw|blast|dive|trap|duo|stretch|lead|wedge|sneak|belly|buck|veer|jet|pin\s*and\s*pull|qb\s*run|\brun\b)\b/i;
  var FAMILY_PASS =
    /\b(quick|dropback|screen|flood|smash|mesh|vert|stick|hitch|curl|slant|fade|sail|drive|dagger|level|shallow|spot|boot|play\s*action|sprint|rollout|bubble|tunnel|glance|post|corner|comeback|dig|choice|rub)\b/i;
  var FAMILY_RPO = /\b(rpo|zone\s*read|read\s*option|pop\s*pass)\b/i;

  function normName(s) {
    return String(s == null ? "" : s)
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  function canonType(v) {
    var s = String(v == null ? "" : v).trim().toLowerCase();
    if (s === "rpo") return "rpo";
    if (s === "run" || s === "rush" || s === "r") return "run";
    if (s === "pass" || s === "p") return "pass";
    return "";
  }

  function isDefense(p) {
    if (!p) return false;
    if (p.side === "defense" || p.side === "def") return true;
    if (p.type === "defense" || p.def_call) return true;
    return false;
  }

  function parseTypeSuffix(raw) {
    var s = String(raw == null ? "" : raw).trim();
    var m = s.match(/^(.*?)\s*\(\s*(RPO|RUN|PASS|R|P)\s*\)\s*$/i);
    if (!m) return { name: s, type: "", override: false };
    return { name: String(m[1] || "").trim(), type: canonType(m[2]), override: true };
  }

  function snapType(row) {
    if (!row) return "";
    var raw = String(row.playType || row.play_type || row.ptype || "").trim();
    if (/rpo/i.test(raw)) return "rpo";
    if (/run|rush/i.test(raw)) return "run";
    if (/pass/i.test(raw)) return "pass";
    return "";
  }

  function snapsForPlay(snaps, play) {
    var key = normName(play && (play.name || play.play) || "");
    if (!key) return [];
    return (snaps || []).filter(function (r) {
      return r && normName(r.play) === key;
    });
  }

  /**
   * Charted majority. ≥3 and ≥80% one way → that type.
   * 40–60% with ≥6 snaps → rpo. Otherwise unknown (fall through).
   */
  function deriveFromCharted(snaps) {
    var run = 0;
    var pass = 0;
    var rpo = 0;
    (snaps || []).forEach(function (r) {
      var t = snapType(r);
      if (t === "run") run += 1;
      else if (t === "pass") pass += 1;
      else if (t === "rpo") rpo += 1;
    });
    var n = run + pass + rpo;
    if (!n) return null;
    if (rpo && rpo === n) return { type: "rpo", n: n, run: run, pass: pass, rpo: rpo };
    var two = run + pass;
    if (two < 3) return null;
    var top = run >= pass ? "run" : "pass";
    var topN = run >= pass ? run : pass;
    var share = topN / two;
    if (two >= 6 && share >= 0.4 && share <= 0.6) {
      return { type: "rpo", n: n, run: run, pass: pass, rpo: rpo };
    }
    if (share >= 0.8) return { type: top, n: n, run: run, pass: pass, rpo: rpo };
    return null;
  }

  function familyToType(family) {
    var f = String(family == null ? "" : family).trim();
    if (!f) return "";
    if (FAMILY_RPO.test(f)) return "rpo";
    if (FAMILY_RUN.test(f) && !/pass|screen|quick|drop/i.test(f)) return "run";
    if (FAMILY_PASS.test(f)) return "pass";
    return "";
  }

  function nameGuess(name) {
    var n = String(name == null ? "" : name);
    if (!n) return "";
    if (NAME_RUN.test(n)) return "run";
    return "";
  }

  function storedTrusted(play) {
    if (!play || isDefense(play)) return "";
    if (play.typeOverride) return canonType(play.typeOverride);
    if (play.typeSource && canonType(play.type)) return canonType(play.type);
    return "";
  }

  /**
   * First hit: override → charted → family → name-guess.
   * Unknown stays empty — never a silent pass.
   */
  function derive(play, snaps) {
    if (!play || isDefense(play)) {
      return { type: "", source: "", n: 0 };
    }
    if (play.typeOverride && canonType(play.typeOverride)) {
      return { type: canonType(play.typeOverride), source: "override", n: 0 };
    }
    var mine = snaps ? snapsForPlay(snaps, play) : null;
    if (mine && mine.length) {
      var charted = deriveFromCharted(mine);
      if (charted && charted.type) {
        return { type: charted.type, source: "charted", n: charted.n, run: charted.run, pass: charted.pass };
      }
    } else if (play.typeSource === "charted" && canonType(play.type)) {
      return { type: canonType(play.type), source: "charted", n: 0 };
    }
    var fam = familyToType(play.family || play.concept || "");
    if (fam) return { type: fam, source: "family", n: 0 };
    var src = String(play.typeSource || "");
    if ((src === "wizard" || src === "paste") && canonType(play.type)) {
      return { type: canonType(play.type), source: src, n: 0 };
    }
    var guess = nameGuess(play.name);
    if (guess) return { type: guess, source: "name-guess", n: 0 };
    return { type: "", source: "", n: 0 };
  }

  function typeOf(play, opts) {
    opts = opts || {};
    if (!play || isDefense(play)) return "";
    var hit = derive(play, opts.snaps);
    return hit.type || "";
  }

  function typeOfEntry(entry, opts) {
    if (!entry) return "";
    var k = canonType(entry.kind || entry.playType || entry.lane || "");
    if (k) return k;
    var p = entry.playObj || (entry.play && typeof entry.play === "object" ? entry.play : null);
    if (p) return typeOf(p, opts);
    if (typeof entry.play === "string") return typeOf({ name: entry.play }, opts);
    return "";
  }

  function speak(type) {
    var t = canonType(type);
    if (t === "run") return "Run";
    if (t === "pass") return "Pass";
    if (t === "rpo") return "RPO";
    return "";
  }

  function applyDerive(play, snaps) {
    if (!play || isDefense(play)) return false;
    var next = derive(play, snaps);
    var before = play.type;
    var beforeSrc = play.typeSource || "";
    play.type = next.type || "";
    play.typeSource = next.source || "";
    return play.type !== before || play.typeSource !== beforeSrc;
  }

  function rederiveBook(plays, snaps) {
    var changed = [];
    (plays || []).forEach(function (p) {
      if (applyDerive(p, snaps)) changed.push(p);
    });
    return changed;
  }

  function untypedPlays(plays, snaps) {
    return (plays || []).filter(function (p) {
      if (!p || isDefense(p)) return false;
      return !typeOf(p, { snaps: snaps });
    });
  }

  function setOverride(play, type) {
    if (!play || isDefense(play)) return play;
    var t = canonType(type);
    if (!t) {
      play.typeOverride = "";
      play.typeSource = play.typeSource === "override" ? "" : play.typeSource;
      return play;
    }
    play.typeOverride = t;
    play.type = t;
    play.typeSource = "override";
    return play;
  }

  var API = {
    canonType: canonType,
    parseTypeSuffix: parseTypeSuffix,
    snapType: snapType,
    snapsForPlay: snapsForPlay,
    deriveFromCharted: deriveFromCharted,
    familyToType: familyToType,
    nameGuess: nameGuess,
    storedTrusted: storedTrusted,
    derive: derive,
    typeOf: typeOf,
    typeOfEntry: typeOfEntry,
    speak: speak,
    applyDerive: applyDerive,
    rederiveBook: rederiveBook,
    untypedPlays: untypedPlays,
    setOverride: setOverride,
    isDefense: isDefense,
  };

  global.OFFGRD_PLAY_TYPE = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this);
