/**
 * OFFGRD-caller-shortlist.js — at most 5, history before theory.
 *
 * A play with snaps in the situation surfaces with its real numbers,
 * good or bad, before any concept match. MIN_SNAPS gates the % badge
 * and the avg — thin samples still show ("2 snaps · not enough to rank").
 * Avg is the mean GN/LS of the same in-situation snaps as the success %.
 * Chunk flags explosive skew on the mean: ≥CHUNK_YARDS_RUN on a run,
 * ≥CHUNK_YARDS_PASS on a pass (coaching-standard explosive). SUCCESS_FLOOR
 * is the "best calls" label, not a hide rule. Concept match is for plays
 * with no record. Pure, DOM-free, no network.
 */
(function (global) {
  "use strict";

  var DEFAULTS = {
    SHORTLIST_MAX: 5,
    SUCCESS_FLOOR: 0.6,
    MIN_SNAPS: 4,
    DIRECTIONAL_SPLIT_MIN: 8,
    LEAN_FLOOR: 0.6,
    CHUNK_YARDS: 15,
    CHUNK_YARDS_RUN: 10,
    CHUNK_YARDS_PASS: 15
  };
  var STORE = "offgrd_shortlist_cfg_";

  function defaults() {
    return {
      SHORTLIST_MAX: DEFAULTS.SHORTLIST_MAX,
      SUCCESS_FLOOR: DEFAULTS.SUCCESS_FLOOR,
      MIN_SNAPS: DEFAULTS.MIN_SNAPS,
      DIRECTIONAL_SPLIT_MIN: DEFAULTS.DIRECTIONAL_SPLIT_MIN,
      LEAN_FLOOR: DEFAULTS.LEAN_FLOOR,
      CHUNK_YARDS: DEFAULTS.CHUNK_YARDS,
      CHUNK_YARDS_RUN: DEFAULTS.CHUNK_YARDS_RUN,
      CHUNK_YARDS_PASS: DEFAULTS.CHUNK_YARDS_PASS
    };
  }

  function clampCfg(raw) {
    var d = defaults();
    var c = raw && typeof raw === "object" ? raw : {};
    var max = +c.SHORTLIST_MAX;
    var floor = +c.SUCCESS_FLOOR;
    var min = +c.MIN_SNAPS;
    var split = +c.DIRECTIONAL_SPLIT_MIN;
    var leanFloor = +c.LEAN_FLOOR;
    var chunk = +c.CHUNK_YARDS;
    var runY = +c.CHUNK_YARDS_RUN;
    var passY = +c.CHUNK_YARDS_PASS;
    var hasRun = c.CHUNK_YARDS_RUN != null && c.CHUNK_YARDS_RUN !== "";
    var hasPass = c.CHUNK_YARDS_PASS != null && c.CHUNK_YARDS_PASS !== "";
    var hasFlat = c.CHUNK_YARDS != null && c.CHUNK_YARDS !== "";
    if (max >= 1 && max <= 12) d.SHORTLIST_MAX = Math.round(max);
    if (floor >= 0 && floor <= 1) d.SUCCESS_FLOOR = floor;
    if (min >= 1 && min <= 20) d.MIN_SNAPS = Math.round(min);
    if (split >= 1 && split <= 40) d.DIRECTIONAL_SPLIT_MIN = Math.round(split);
    if (leanFloor >= 0.5 && leanFloor <= 1) d.LEAN_FLOOR = leanFloor;
    if (hasFlat && chunk >= 8 && chunk <= 40 && !hasRun && !hasPass) {
      d.CHUNK_YARDS = Math.round(chunk);
      d.CHUNK_YARDS_RUN = d.CHUNK_YARDS;
      d.CHUNK_YARDS_PASS = d.CHUNK_YARDS;
    } else {
      if (hasRun && runY >= 8 && runY <= 40) d.CHUNK_YARDS_RUN = Math.round(runY);
      if (hasPass && passY >= 8 && passY <= 40) d.CHUNK_YARDS_PASS = Math.round(passY);
      d.CHUNK_YARDS = d.CHUNK_YARDS_PASS;
    }
    return d;
  }

  function cfgFor(opts) {
    opts = opts || {};
    if (opts.cfg) return clampCfg(opts.cfg);
    if (opts.brand && opts.brand.shortlist) return clampCfg(opts.brand.shortlist);
    var teamId = opts.teamId;
    if (!teamId) {
      try {
        var B = global.OFFGRD_CALLER_BRIDGE;
        if (B && typeof B.getTeamId === "function") teamId = B.getTeamId();
      } catch (e) {}
    }
    if (teamId) {
      try {
        var raw = global.localStorage && localStorage.getItem(STORE + teamId);
        if (raw) return clampCfg(JSON.parse(raw));
      } catch (e2) {}
    }
    return defaults();
  }

  function saveCfg(teamId, cfg) {
    var next = clampCfg(cfg);
    if (!teamId) return next;
    try {
      if (global.localStorage) localStorage.setItem(STORE + teamId, JSON.stringify(next));
    } catch (e) {}
    return next;
  }

  function lane(e) {
    if (!e) return "pass";
    var k = String(e.kind || e.playType || e.lane || "").toLowerCase();
    if (/run|rush|stop|gap/.test(k) && !/pass/.test(k)) return "run";
    if (/pass|cover|zone|man/.test(k)) return "pass";
    var p = e.playObj || e.play;
    if (p && typeof p === "object") {
      var t = String(p.type || p.kind || "").toLowerCase();
      if (t === "run" || t === "run-defense") return "run";
      if (t === "pass" || t === "pass-defense" || t === "defense") return "pass";
    }
    var nm = String((typeof e.play === "string" ? e.play : e.name) || "").toLowerCase();
    if (/\b(zone|power|counter|iso|toss|sweep|draw|blast|dive)\b/.test(nm)) return "run";
    return "pass";
  }

  function playName(e) {
    if (!e) return "";
    if (typeof e.play === "string") return e.play;
    if (e.play && e.play.name) return e.play.name;
    return e.name || "";
  }

  function snapN(e) {
    return +((e && e.n) || 0);
  }

  function empSr(e) {
    if (!e) return 0;
    if (e.empSr != null && e.empSr !== "") return +e.empSr;
    if (e.success != null && e.success !== "") return +e.success;
    var lab = String(e.basisLabel || "");
    var m = lab.match(/SUCCESS\s+(\d+)\s*%/i);
    if (m) return +m[1] / 100;
    if (snapN(e) >= 1 && e.basis === "empirical") return +(e.sr || 0);
    return 0;
  }

  function empAvg(e) {
    if (!e) return null;
    if (e.avg != null && e.avg !== "") {
      var a = +e.avg;
      return isNaN(a) ? null : a;
    }
    if (e.avgYds != null && e.avgYds !== "") {
      var b = +e.avgYds;
      return isNaN(b) ? null : b;
    }
    return null;
  }

  function chunkN(e) {
    return +((e && e.chunks) || 0);
  }

  function chunkYardsFor(row, cfg) {
    cfg = clampCfg(cfg);
    if (lane(row) === "run") return cfg.CHUNK_YARDS_RUN;
    return cfg.CHUNK_YARDS_PASS;
  }

  function chunkDefTip(cfg, n) {
    cfg = clampCfg(cfg);
    var def =
      "Chunk = " +
      cfg.CHUNK_YARDS_RUN +
      "+ yd run or " +
      cfg.CHUNK_YARDS_PASS +
      "+ yd pass";
    if (+n === 1) return def + " — one of these is pulling this average up.";
    if (+n > 1) return def + " — these snaps are pulling this average up.";
    return def + ".";
  }

  function rowGain(row) {
    if (!row || row.gain == null || row.gain === "") return null;
    var g = +row.gain;
    return isNaN(g) ? null : g;
  }

  function emptyAcc() {
    return { n: 0, hit: 0, yards: 0, yardsN: 0, chunks: 0 };
  }

  function addSnap(acc, row, opts) {
    opts = opts || {};
    acc = acc || emptyAcc();
    var hit = opts.hit;
    if (hit == null) hit = row && +row.success ? 1 : 0;
    acc.n += 1;
    acc.hit += hit ? 1 : 0;
    var g = rowGain(row);
    if (g != null) {
      acc.yards += g;
      acc.yardsN += 1;
      if (g >= +(opts.chunkYards != null ? opts.chunkYards : DEFAULTS.CHUNK_YARDS)) acc.chunks += 1;
    }
    return acc;
  }

  function finishAcc(acc) {
    acc = acc || emptyAcc();
    return {
      n: acc.n,
      hit: acc.hit,
      yards: acc.yards,
      yardsN: acc.yardsN,
      chunks: acc.chunks,
      sr: acc.n ? acc.hit / acc.n : 0,
      avg: acc.yardsN ? acc.yards / acc.yardsN : null
    };
  }

  function sitStatsFromRows(rows, opts) {
    opts = opts || {};
    var cfg = clampCfg(opts.cfg);
    var dn = opts.down;
    var db = opts.distBucket;
    var distOf = typeof opts.distBucketOf === "function" ? opts.distBucketOf : null;
    var getSuccess = typeof opts.getSuccess === "function" ? opts.getSuccess : function (r) {
      return r && r.success != null && r.success !== "" ? r.success : null;
    };
    var playOf = typeof opts.playOf === "function" ? opts.playOf : function (r) {
      return r && r.play ? r.play : "";
    };
    var out = Object.create(null);
    (rows || []).forEach(function (row) {
      if (!row) return;
      var k = playOf(row);
      if (!k) return;
      if (dn != null && dn !== "ANY" && row.down != null && +row.down !== +dn) return;
      if (db && db !== "ANY") {
        if (row.distance == null || (distOf && distOf(row.distance) !== db)) return;
      }
      var suc = getSuccess(row);
      if (suc == null) return;
      if (!out[k]) out[k] = emptyAcc();
      addSnap(out[k], row, { hit: +suc ? 1 : 0, chunkYards: chunkYardsFor(row, cfg) });
    });
    var done = Object.create(null);
    Object.keys(out).forEach(function (k) {
      done[k] = finishAcc(out[k]);
    });
    return done;
  }

  function fmtAvg(avg) {
    if (avg == null || isNaN(+avg)) return "";
    var n = +avg;
    var t = (n >= 0 ? 1 : -1) * Math.round(Math.abs(n) * 10) / 10;
    if (t === 0) t = 0;
    if (Math.abs(t - Math.round(t)) < 0.05) return String(Math.round(t));
    return t.toFixed(1);
  }

  function avgTail(e) {
    var avg = empAvg(e);
    if (avg == null) return "";
    return fmtAvg(avg) + " avg";
  }

  function chunkLabelOf(e) {
    var ch = chunkN(e);
    if (ch < 1) return "";
    return "incl. " + ch + " chunk" + (ch === 1 ? "" : "s");
  }

  function hasRecord(e) {
    return snapN(e) >= 1;
  }

  function isHistoryEligible(e, cfg) {
    cfg = cfg || defaults();
    return snapN(e) >= cfg.MIN_SNAPS && empSr(e) >= cfg.SUCCESS_FLOOR;
  }

  function isScheme(e) {
    if (!e || hasRecord(e)) return false;
    if (e.basis === "on_paper" || e.basis === "stub") return true;
    var lab = String(e.basisLabel || "").toUpperCase();
    return lab === "SCHEME MATCH" || lab === "CALL SHEET" || lab === "CONCEPT MATCH";
  }

  function byRecord(cfg) {
    var min = (cfg && cfg.MIN_SNAPS) || DEFAULTS.MIN_SNAPS;
    return function (a, b) {
      var aEnough = snapN(a) >= min ? 1 : 0;
      var bEnough = snapN(b) >= min ? 1 : 0;
      if (aEnough !== bEnough) return bEnough - aEnough;
      var d = empSr(b) - empSr(a);
      if (Math.abs(d) > 0.0001) return d;
      var dn = snapN(b) - snapN(a);
      if (dn) return dn;
      return String(playName(a)).localeCompare(String(playName(b)));
    };
  }

  function applyGuarantee(picked, eligible, cfg) {
    var max = cfg.SHORTLIST_MAX;
    if (max < 2) return picked.slice(0, max);
    var elRun = eligible.filter(function (e) { return lane(e) === "run"; });
    var elPass = eligible.filter(function (e) { return lane(e) === "pass"; });
    if (!elRun.length || !elPass.length) return picked.slice(0, max);
    function has(list, kind) {
      return list.some(function (e) { return lane(e) === kind; });
    }
    var out = picked.slice();
    function displace(missing) {
      if (has(out, missing)) return;
      var add = (missing === "run" ? elRun : elPass)[0];
      if (!add) return;
      var over = missing === "run" ? "pass" : "run";
      for (var i = out.length - 1; i >= 0; i--) {
        if (lane(out[i]) === over) {
          out.splice(i, 1);
          break;
        }
      }
      if (out.length >= max) out.pop();
      out.push(add);
      out.sort(byRecord(cfg));
    }
    displace("run");
    displace("pass");
    return out.slice(0, max);
  }

  function shortlist(entries, cfg) {
    cfg = clampCfg(cfg);
    var eligible = (entries || []).filter(hasRecord).sort(byRecord(cfg));
    var picked = eligible.slice(0, cfg.SHORTLIST_MAX);
    return applyGuarantee(picked, eligible, cfg);
  }

  function schemeCandidates(entries, cfg, used) {
    cfg = clampCfg(cfg);
    used = used || Object.create(null);
    return (entries || []).filter(function (e) {
      var nm = playName(e);
      if (!nm || used[nm] || hasRecord(e)) return false;
      return isScheme(e) || e.rankGroup === 1 || e.rankGroup === 2;
    }).sort(function (a, b) {
      var d = (+(b.sr || b.ev || 0)) - (+(a.sr || a.ev || 0));
      if (Math.abs(d) > 0.0001) return d;
      return String(playName(a)).localeCompare(String(playName(b)));
    });
  }

  function buildPanel(entries, cfg, opts) {
    cfg = clampCfg(cfg);
    opts = opts || {};
    var list = Array.isArray(entries) ? entries.slice() : [];
    var history = shortlist(list, cfg);
    var used = Object.create(null);
    history.forEach(function (e) { used[playName(e)] = 1; });
    var scheme = [];
    var room = cfg.SHORTLIST_MAX - history.length;
    if (room > 0) scheme = schemeCandidates(list, cfg, used).slice(0, room);
    var shown = history.concat(scheme);
    var strong = history.filter(function (e) { return isHistoryEligible(e, cfg); });
    var mode = history.length ? (scheme.length ? "mixed" : "history") : (scheme.length ? "scheme" : "empty");
    var cov = opts.coverage ? String(opts.coverage) : "";
    var label = "No read yet — open playbook.";
    if (mode === "history" || mode === "mixed") {
      label = strong.length ? "Your best calls" : "Your calls here — not enough to rank";
    }
    if (mode === "scheme") {
      label = cov
        ? "No strong history here — best scheme fits vs " + cov
        : "No strong history here — best scheme fits";
    }
    return {
      mode: mode,
      history: history,
      scheme: scheme,
      shown: shown,
      full: list,
      label: label,
      cfg: cfg
    };
  }

  function markParts(e, cfg, asScheme) {
    cfg = clampCfg(cfg);
    if (hasRecord(e)) {
      var n = snapN(e);
      if (n < cfg.MIN_SNAPS) {
        var thin = n + " snap" + (n === 1 ? "" : "s") + " · not enough to rank";
        return { showPct: false, pct: null, tail: thin, tailCore: thin, chunkLabel: "", chunkTip: "", text: thin };
      }
      var pct = Math.round(empSr(e) * 100);
      var tailCore = n + " snap" + (n === 1 ? "" : "s");
      var extra = avgTail(e);
      if (extra) tailCore += " · " + extra;
      var chunkLabel = chunkLabelOf(e);
      var tail = chunkLabel ? tailCore + " · " + chunkLabel : tailCore;
      return {
        showPct: true,
        pct: pct,
        tail: tail,
        tailCore: tailCore,
        chunkLabel: chunkLabel,
        chunkTip: chunkLabel ? chunkDefTip(cfg, chunkN(e)) : "",
        text: pct + "% · " + tail
      };
    }
    var scheme = "concept match";
    if (asScheme || isScheme(e)) {
      return { showPct: false, pct: null, tail: scheme, tailCore: scheme, chunkLabel: "", chunkTip: "", text: scheme };
    }
    return { showPct: false, pct: null, tail: scheme, tailCore: scheme, chunkLabel: "", chunkTip: "", text: scheme };
  }

  function markText(e, cfg, asScheme) {
    return markParts(e, cfg, asScheme).text;
  }

  function showPct(e, cfg) {
    cfg = cfg || defaults();
    return hasRecord(e) && snapN(e) >= cfg.MIN_SNAPS;
  }

  var API = {
    DEFAULTS: DEFAULTS,
    defaults: defaults,
    cfgFor: cfgFor,
    saveCfg: saveCfg,
    lane: lane,
    playName: playName,
    hasRecord: hasRecord,
    empSr: empSr,
    empAvg: empAvg,
    fmtAvg: fmtAvg,
    sitStatsFromRows: sitStatsFromRows,
    chunkYardsFor: chunkYardsFor,
    chunkDefTip: chunkDefTip,
    isHistoryEligible: isHistoryEligible,
    shortlist: shortlist,
    buildPanel: buildPanel,
    markParts: markParts,
    markText: markText,
    showPct: showPct
  };

  global.OFFGRD_CALLER_SHORTLIST = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this);
