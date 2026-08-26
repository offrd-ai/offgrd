/**
 * OFFGRD-play-stubs.js — name-only plays from a pasted call sheet.
 *
 * A stub is a first-class CALL (Caller, gameplan, call sheet, EV) and an
 * incomplete TEACHING object (hidden from Reps Lab / install / player tests).
 * Drawing later upgrades in place — same play id — so call history survives.
 *
 * Pure, DOM-free, testable. No network.
 */
(function (global) {
  "use strict";

  var STARTER_SPECS = [
    { name: "Stick", formation: "Trips Rt (Gun)" },
    { name: "Hitches", formation: "2x2 Doubles (Gun)" },
    { name: "Slant-Flat", formation: "2x2 Doubles (Gun)" },
    { name: "Smash", formation: "2x2 Doubles (Gun)" },
    { name: "Flood Rt", formation: "Trips Rt (Gun)" },
    { name: "Mesh", formation: "2x2 Doubles (Gun)" },
    { name: "Four Verts", formation: "2x2 Doubles (Gun)" },
    { name: "Curl-Flat", formation: "2x2 Doubles (Gun)" },
    { name: "RB Screen Rt", formation: "2x2 Doubles (Gun)" },
    { name: "Inside Zone Rt", formation: "2x2 Doubles (Gun)" },
    { name: "Inside Zone Lt", formation: "2x2 Doubles (Gun)" },
    { name: "Power Lt", formation: "2x2 Doubles (Gun)" }
  ];

  var NAME_TAG_HINTS = [
    { re: /\b2\s*[x×]\s*2\b|\bdoubles\b/i, tag: "2x2" },
    { re: /\b3\s*[x×]\s*1\b|\btrips\b/i, tag: "Trips" },
    { re: /\bempty\b|\b3\s*[x×]\s*2\b/i, tag: "Empty" },
    { re: /\bbunch\b/i, tag: "Bunch" },
    { re: /\bcover\s*0\b/i, tag: "Cover 0" },
    { re: /\bcover\s*1\b/i, tag: "Cover 1" },
    { re: /\bcover\s*2\b/i, tag: "Cover 2" },
    { re: /\bcover\s*3\b/i, tag: "Cover 3" },
    { re: /\bcover\s*4\b/i, tag: "Cover 4" },
    { re: /\bbeater\b/i, tag: "Beater" }
  ];

  function normName(s) {
    return String(s == null ? "" : s).trim().toLowerCase().replace(/\s+/g, " ");
  }

  function playSide(p) {
    if (!p) return "";
    if (p.side === "defense" || p.side === "def") return "defense";
    if (p.side === "offense" || p.side === "off") return "offense";
    if (p.type === "defense" || p.def_call) return "defense";
    return "";
  }

  function parseCsvLine(line) {
    var out = [];
    var cur = "";
    var q = false;
    var s = String(line == null ? "" : line);
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      if (ch === '"') {
        if (q && s[i + 1] === '"') { cur += '"'; i++; }
        else q = !q;
      } else if ((ch === "," || ch === "\t") && !q) {
        out.push(cur.trim());
        cur = "";
      } else {
        cur += ch;
      }
    }
    out.push(cur.trim());
    return out;
  }

  function isHeaderRow(cols) {
    if (!cols || !cols.length) return false;
    var a = String(cols[0] || "").trim().toLowerCase();
    return a === "name" || a === "play" || a === "play name" || a === "call";
  }

  /** Strip call-sheet noise: numbers, bullets, tabs, trailing commas. */
  function cleanPlayName(raw) {
    var s = String(raw == null ? "" : raw).replace(/^\uFEFF/, "").trim();
    if (!s) return "";
    s = s.replace(/^[\s]*[\d]+[\.\)\:\-][\s]*/, "");
    s = s.replace(/^[\s]*[\-\*\u2022\u00b7\u2013\u2014]+[\s]*/, "");
    s = s.replace(/[\t,;]+$/g, "").trim();
    s = s.replace(/\s+/g, " ");
    return s;
  }

  function parseLines(text, opts) {
    opts = opts || {};
    var asCsv = !!opts.csv;
    var raw = String(text == null ? "" : text).replace(/^\uFEFF/, "");
    var lines = raw.split(/\r?\n/);
    var rows = [];
    var seen = Object.create(null);
    var skippedBlank = 0;
    var skippedDupes = 0;
    var headerSkipped = false;

    for (var i = 0; i < lines.length; i++) {
      var line = String(lines[i] || "").replace(/^\uFEFF/, "").trim();
      if (!line) { skippedBlank++; continue; }
      var hasTabCols = /\t/.test(line) && line.split(/\t/).filter(Boolean).length >= 2;
      var hasCsvCols = line.indexOf(",") >= 0 && parseCsvLine(line).filter(Boolean).length >= 2;
      var cols = asCsv || hasTabCols || hasCsvCols ? parseCsvLine(line) : [line];
      if (!headerSkipped && isHeaderRow(cols)) { headerSkipped = true; continue; }
      var name = cleanPlayName(cols[0]);
      var family = cols.length > 1 ? String(cols[1] || "").trim() : "";
      if (!name) { skippedBlank++; continue; }
      var key = normName(name);
      if (seen[key]) { skippedDupes++; continue; }
      seen[key] = true;
      rows.push({ name: name, family: family, raw: String(line).trim() });
    }
    return {
      rows: rows,
      skippedBlank: skippedBlank,
      skippedDupes: skippedDupes
    };
  }

  function parseCallSheetText(text) {
    return parseLines(text, { csv: false });
  }

  function parseCallSheetCsv(text) {
    return parseLines(text, { csv: true });
  }

  function existingNameSet(lib, side) {
    var set = Object.create(null);
    var list = Array.isArray(lib) ? lib : [];
    var want = side === "defense" || side === "offense" ? side : "";
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (!p || !p.name) continue;
      if (want) {
        var s = playSide(p);
        if (s && s !== want) continue;
      }
      set[normName(p.name)] = p;
    }
    return set;
  }

  /**
   * Preview against the current book. Duplicates in the paste are reported,
   * not silently dropped from the sentence.
   */
  function previewStubs(parsed, lib, side) {
    var rows = (parsed && parsed.rows) || [];
    var exist = existingNameSet(lib, side);
    var alreadyIn = 0;
    var willAdd = 0;
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var hit = exist[normName(r.name)];
      var status = hit ? "exists" : "new";
      if (hit) alreadyIn++;
      else willAdd++;
      out.push({
        name: r.name,
        family: r.family || "",
        raw: r.raw,
        status: status,
        existingId: hit && (hit.id || hit.cid) || null
      });
    }
    return {
      rows: out,
      total: rows.length,
      alreadyIn: alreadyIn,
      willAdd: willAdd,
      skippedDupes: (parsed && parsed.skippedDupes) || 0,
      skippedBlank: (parsed && parsed.skippedBlank) || 0,
      side: side === "defense" ? "defense" : "offense"
    };
  }

  function previewSentence(p) {
    if (!p || !p.total) return "No play names in that list.";
    var side = p.side === "defense" ? "defense " : "";
    var bits = [p.total + " " + side + "play" + (p.total === 1 ? "" : "s")];
    if (p.alreadyIn) bits.push(p.alreadyIn + " already in your book");
    if (p.willAdd) bits.push(p.willAdd + " will be added");
    var s = bits[0] + " — " + bits.slice(1).join(", ") + ".";
    if (p.skippedDupes) {
      s += " " + p.skippedDupes + " duplicate" + (p.skippedDupes === 1 ? "" : "s") + " reported.";
    }
    return s;
  }

  function hasRouteLike(list) {
    if (!Array.isArray(list) || !list.length) return false;
    for (var i = 0; i < list.length; i++) {
      var o = list[i];
      if (!o) continue;
      if (Array.isArray(o.route) && o.route.length) return true;
      if (Array.isArray(o.motion) && o.motion.length) return true;
      if (o.runblk || o.blk) return true;
    }
    return false;
  }

  function hasDiagram(p) {
    if (!p) return false;
    if (Array.isArray(p.draws) && p.draws.length) return true;
    if (hasRouteLike(p.players) || hasRouteLike(p.defs)) return true;
    var players = p.players || (p.data && p.data.players);
    var defs = p.defs || (p.data && p.data.defs);
    if (p.side === "defense" || p.type === "defense") {
      if (hasRouteLike(defs)) return true;
    } else if (Array.isArray(players) && players.length >= 5 && hasRouteLike(players)) {
      return true;
    }
    /* Existing drawn plays may only have a thumb. Stubs never count a seed thumb. */
    if ((p.stub || p.needsDiagram) && !hasRouteLike(players) && !hasRouteLike(defs)) return false;
    return !!p.thumbSvg;
  }

  function isStub(p) {
    if (!p) return false;
    if (p.stub === true || p.needsDiagram === true) return !hasDiagram(p);
    return !hasDiagram(p) && !p.starter;
  }

  function isDrawn(p) {
    return hasDiagram(p);
  }

  function isTeachable(p) {
    return isDrawn(p);
  }

  function isStarterPlay(p) {
    if (!p) return false;
    if (p.stub) return false;
    if (p.starter === false) return false;
    if (p.starter === true) return true;
    var nm = normName(p.name);
    var form = String(p.formation || "").trim();
    for (var i = 0; i < STARTER_SPECS.length; i++) {
      var spec = STARTER_SPECS[i];
      if (normName(spec.name) === nm && spec.formation === form) return true;
    }
    return false;
  }

  function hasOwnPlays(lib) {
    var list = Array.isArray(lib) ? lib : [];
    for (var i = 0; i < list.length; i++) {
      if (!isStarterPlay(list[i])) return true;
    }
    return false;
  }

  function shouldHideStarter(play, lib) {
    return isStarterPlay(play) && hasOwnPlays(lib);
  }

  /**
   * 0 = EV history (drawn or stub — they earn rank by being called)
   * 1 = tagged/drawn without EV (today's scheme-match group)
   * 2 = untouched stubs (shown, below the ranked group)
   * 9 = starter competing with own plays (exclude)
   */
  function rankGroup(play, n, lib) {
    if (shouldHideStarter(play, lib)) return 9;
    if ((+n || 0) >= 1) return 0;
    if (isStub(play) || !isDrawn(play)) return 2;
    return 1;
  }

  function sortCallerEntries(entries, lib) {
    var list = Array.isArray(entries) ? entries.slice() : [];
    list.sort(function (a, b) {
      var ga = a.rankGroup != null ? a.rankGroup : rankGroup(a.playObj || a.play, a.n, lib);
      var gb = b.rankGroup != null ? b.rankGroup : rankGroup(b.playObj || b.play, b.n, lib);
      if (ga !== gb) return ga - gb;
      var d = (b.sr || b.ev || 0) - (a.sr || a.ev || 0);
      if (Math.abs(d) > 0.03) return d;
      var aOk = (a.n || 0) >= 3, bOk = (b.n || 0) >= 3;
      if (aOk !== bOk) return aOk ? -1 : 1;
      if ((b.n || 0) !== (a.n || 0)) return (b.n || 0) - (a.n || 0);
      return String(a.play || a.name || "").localeCompare(String(b.play || b.name || ""));
    });
    return list.filter(function (e) {
      var g = e.rankGroup != null ? e.rankGroup : rankGroup(e.playObj || e.play, e.n, lib);
      return g < 9;
    });
  }

  function filterBySide(lib, side) {
    var list = Array.isArray(lib) ? lib : [];
    var want = side === "defense" ? "defense" : side === "offense" ? "offense" : "";
    if (!want) return list.slice();
    return list.filter(function (p) {
      var s = playSide(p);
      return !s || s === want;
    });
  }

  function suggestTagsFromName(name) {
    var s = String(name || "");
    var out = [];
    var seen = Object.create(null);
    for (var i = 0; i < NAME_TAG_HINTS.length; i++) {
      var h = NAME_TAG_HINTS[i];
      if (h.re.test(s) && !seen[h.tag]) {
        seen[h.tag] = 1;
        out.push(h.tag);
      }
    }
    return out;
  }

  function makeStub(name, side, family, id) {
    var s = side === "defense" ? "defense" : "offense";
    var fam = String(family || "").trim();
    var tags = fam ? [fam] : [];
    var hints = suggestTagsFromName(name);
    return {
      id: id || null,
      name: String(name || "").trim(),
      side: s,
      type: s === "defense" ? "defense" : "pass",
      family: fam,
      concept: fam,
      series: "",
      personnel: "",
      formation: "",
      protection: "",
      stub: true,
      needsDiagram: true,
      starter: false,
      tags: tags,
      suggestedTags: hints,
      group: "",
      players: [],
      defs: [],
      texts: [],
      draws: [],
      qbNotes: "",
      updatedAt: Date.now(),
      key: normName(name) + "|" + s
    };
  }

  function upgradeIfDrawn(play) {
    if (!play) return play;
    if (!hasDiagram(play)) return play;
    play.stub = false;
    play.needsDiagram = false;
    return play;
  }

  function teachablePlays(lib) {
    return (Array.isArray(lib) ? lib : []).filter(isTeachable);
  }

  var API = {
    STARTER_SPECS: STARTER_SPECS,
    STARTER_NAMES: STARTER_SPECS.map(function (s) { return s.name; }),
    normName: normName,
    playSide: playSide,
    cleanPlayName: cleanPlayName,
    parseCallSheetText: parseCallSheetText,
    parseCallSheetCsv: parseCallSheetCsv,
    previewStubs: previewStubs,
    previewSentence: previewSentence,
    hasDiagram: hasDiagram,
    isStub: isStub,
    isDrawn: isDrawn,
    isTeachable: isTeachable,
    isStarterPlay: isStarterPlay,
    hasOwnPlays: hasOwnPlays,
    shouldHideStarter: shouldHideStarter,
    rankGroup: rankGroup,
    sortCallerEntries: sortCallerEntries,
    filterBySide: filterBySide,
    suggestTagsFromName: suggestTagsFromName,
    makeStub: makeStub,
    upgradeIfDrawn: upgradeIfDrawn,
    teachablePlays: teachablePlays
  };

  global.OFFGRD_PLAY_STUBS = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this);
