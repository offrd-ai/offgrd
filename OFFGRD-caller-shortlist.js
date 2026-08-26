/**
 * OFFGRD-caller-shortlist.js — at most 5, ≥60%, ≥ MIN_SNAPS, run/pass guarantee.
 *
 * Floor wins over cap. Thin samples never wear a success badge.
 * Pure, DOM-free, testable. No network.
 */
(function (global) {
  "use strict";

  var DEFAULTS = {
    SHORTLIST_MAX: 5,
    SUCCESS_FLOOR: 0.6,
    MIN_SNAPS: 4,
    DIRECTIONAL_SPLIT_MIN: 8
  };
  var STORE = "offgrd_shortlist_cfg_";

  function defaults() {
    return {
      SHORTLIST_MAX: DEFAULTS.SHORTLIST_MAX,
      SUCCESS_FLOOR: DEFAULTS.SUCCESS_FLOOR,
      MIN_SNAPS: DEFAULTS.MIN_SNAPS,
      DIRECTIONAL_SPLIT_MIN: DEFAULTS.DIRECTIONAL_SPLIT_MIN
    };
  }

  function clampCfg(raw) {
    var d = defaults();
    var c = raw && typeof raw === "object" ? raw : {};
    var max = +c.SHORTLIST_MAX;
    var floor = +c.SUCCESS_FLOOR;
    var min = +c.MIN_SNAPS;
    var split = +c.DIRECTIONAL_SPLIT_MIN;
    if (max >= 1 && max <= 12) d.SHORTLIST_MAX = Math.round(max);
    if (floor >= 0 && floor <= 1) d.SUCCESS_FLOOR = floor;
    if (min >= 1 && min <= 20) d.MIN_SNAPS = Math.round(min);
    if (split >= 1 && split <= 40) d.DIRECTIONAL_SPLIT_MIN = Math.round(split);
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

  function isHistoryEligible(e, cfg) {
    cfg = cfg || defaults();
    var n = +((e && e.n) || 0);
    var sr = +((e && e.sr) || 0);
    return n >= cfg.MIN_SNAPS && sr >= cfg.SUCCESS_FLOOR;
  }

  function isScheme(e) {
    if (!e) return false;
    if (e.basis === "on_paper" || e.basis === "stub") return true;
    var lab = String(e.basisLabel || "").toUpperCase();
    return lab === "SCHEME MATCH" || lab === "CALL SHEET" || lab === "CONCEPT MATCH";
  }

  function byRank(a, b) {
    var d = (+(b.sr || 0)) - (+(a.sr || 0));
    if (Math.abs(d) > 0.0001) return d;
    var dn = (+(b.n || 0)) - (+(a.n || 0));
    if (dn) return dn;
    return String(playName(a)).localeCompare(String(playName(b)));
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
      out.sort(byRank);
    }
    displace("run");
    displace("pass");
    return out.slice(0, max);
  }

  function shortlist(entries, cfg) {
    cfg = clampCfg(cfg);
    var eligible = (entries || []).filter(function (e) { return isHistoryEligible(e, cfg); }).sort(byRank);
    var picked = eligible.slice(0, cfg.SHORTLIST_MAX);
    return applyGuarantee(picked, eligible, cfg);
  }

  function schemeCandidates(entries, cfg, used) {
    cfg = clampCfg(cfg);
    used = used || Object.create(null);
    return (entries || []).filter(function (e) {
      var nm = playName(e);
      if (!nm || used[nm]) return false;
      if (isHistoryEligible(e, cfg)) return false;
      return isScheme(e) || e.rankGroup === 1 || e.rankGroup === 2;
    }).sort(byRank);
  }

  function buildPanel(entries, cfg, opts) {
    cfg = clampCfg(cfg);
    opts = opts || {};
    var list = Array.isArray(entries) ? entries.slice() : [];
    var history = shortlist(list, cfg);
    var used = Object.create(null);
    history.forEach(function (e) { used[playName(e)] = 1; });
    var scheme = [];
    if (history.length < 2) {
      var room = cfg.SHORTLIST_MAX - history.length;
      scheme = schemeCandidates(list, cfg, used).slice(0, room);
    }
    var shown = history.concat(scheme);
    var mode = history.length ? (scheme.length ? "mixed" : "history") : (scheme.length ? "scheme" : "empty");
    var cov = opts.coverage ? String(opts.coverage) : "";
    var label = "No read yet — open playbook.";
    if (mode === "history" || mode === "mixed") label = "Your best calls";
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

  function markText(e, cfg, asScheme) {
    cfg = clampCfg(cfg);
    if (asScheme || (!isHistoryEligible(e, cfg) && isScheme(e) && !(+e.n >= cfg.MIN_SNAPS))) {
      if (!isHistoryEligible(e, cfg)) return "concept match";
    }
    var n = +((e && e.n) || 0);
    if (n < cfg.MIN_SNAPS) {
      return n + " snap" + (n === 1 ? "" : "s") + " · not enough to rank";
    }
    var pct = Math.round((+(e.sr || 0)) * 100);
    return pct + "% · " + n + " snap" + (n === 1 ? "" : "s");
  }

  function showPct(e, cfg) {
    return isHistoryEligible(e, cfg);
  }

  var API = {
    DEFAULTS: DEFAULTS,
    defaults: defaults,
    cfgFor: cfgFor,
    saveCfg: saveCfg,
    lane: lane,
    playName: playName,
    isHistoryEligible: isHistoryEligible,
    shortlist: shortlist,
    buildPanel: buildPanel,
    markText: markText,
    showPct: showPct
  };

  global.OFFGRD_CALLER_SHORTLIST = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this);
