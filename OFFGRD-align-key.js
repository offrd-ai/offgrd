/**
 * Align answer-key derivation — coverage from call definition fields only.
 *
 * Browser: window.OFFGRD_ALIGN_KEY
 * Node: module.exports
 *
 * Zone RELATIONSHIP is coverage-invariant football (asserted in smoke).
 * Leverage / depth stay program-flexible (coach override path).
 *
 * Never invents Cover 3 from a call name. Missing coverage → throw.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.OFFGRD_ALIGN_KEY = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var KNOWN = [
    "Cover 0",
    "Cover 1",
    "Cover 2",
    "Cover 3",
    "Cover 4",
    "Cover 6",
    "Tampa 2",
    "2-Man",
  ];

  /** Deep-zone relationship tokens — used by inverse smoke checks. */
  var DEEP_ZONE_RELS = {
    "deep middle": 1,
    "deep half": 1,
    "deep third": 1,
    "deep outside third": 1,
    "deep quarter": 1,
  };

  function normalizeCoverage(raw) {
    var c = String(raw == null ? "" : raw).trim();
    if (!c) return null;
    var low = c.toLowerCase().replace(/[_]+/g, " ").replace(/\s+/g, " ");
    if (low.indexOf("tampa") >= 0) return "Tampa 2";
    if (low === "2-man" || low === "2 man" || low.indexOf("two man") >= 0 || low.indexOf("two-man") >= 0) {
      return "2-Man";
    }
    var i;
    for (i = 0; i < KNOWN.length; i++) {
      if (KNOWN[i].toLowerCase() === low) return KNOWN[i];
    }
    var m = low.match(/cover\s*([0-6])/);
    if (m) return "Cover " + m[1];
    m = low.match(/^([0-6])$/);
    if (m) return "Cover " + m[1];
    return null;
  }

  function resolveCallCoverage(call) {
    if (!call) return { ok: false, reason: "no_call" };
    var dc = call._defCall || null;
    var raw = null;
    if (dc && dc.coverage != null && String(dc.coverage).trim()) {
      raw = String(dc.coverage).trim();
    } else if (call.coverage != null && String(call.coverage).trim()) {
      raw = String(call.coverage).trim();
    } else if (call.ol && call.ol.coverage != null && String(call.ol.coverage).trim()) {
      raw = String(call.ol.coverage).trim();
    }
    if (!raw) {
      return {
        ok: false,
        reason: "missing_coverage_field",
        callName: (dc && dc.name) || call.name || null,
        front: (dc && dc.front) || call.front || null,
      };
    }
    var cov = normalizeCoverage(raw);
    if (!cov) {
      return {
        ok: false,
        reason: "unrecognized_coverage",
        raw: raw,
        callName: (dc && dc.name) || call.name || null,
      };
    }
    return { ok: true, coverage: cov, raw: raw };
  }

  function alignSkillPlayers(state) {
    return ((state && state.players) || []).filter(function (p) {
      if (!p) return false;
      if (p.type === "route" || p.type === "rb") return true;
      var lab = String(p.lab || "");
      return !!lab && !/^OL|C$|LG|RG|LT|RT|QB$/i.test(lab);
    });
  }

  function alignSideSkill(skill, defX) {
    var left = skill.filter(function (p) { return (p.x || 0) < 500; }).sort(function (a, b) { return (a.x || 0) - (b.x || 0); });
    var right = skill.filter(function (p) { return (p.x || 0) >= 500; }).sort(function (a, b) { return (b.x || 0) - (a.x || 0); });
    return (defX || 0) < 500 ? left : right;
  }

  function alignNearestOrdinal(skill, def) {
    var side = alignSideSkill(skill, def && def.x);
    if (!side.length) return { n: 1, p: null };
    var best = 0, bestD = 1e9;
    side.forEach(function (p, i) {
      var dist = Math.hypot((p.x || 0) - ((def && def.x) || 0), (p.y || 0) - ((def && def.y) || 0));
      if (dist < bestD) { bestD = dist; best = i; }
    });
    return { n: Math.min(3, best + 1), p: side[best] };
  }

  function fail(code, detail) {
    var err = new Error(code + (detail ? " " + detail : ""));
    err.code = code;
    err.detail = detail || null;
    throw err;
  }

  function isDeepZoneRel(rel) {
    return !!DEEP_ZONE_RELS[String(rel || "")];
  }

  function roleFlags(d) {
    var pos = String(d.pos || d.lab || "").toUpperCase();
    var lab = String(d.lab || "").toUpperCase();
    return {
      pos: pos,
      lab: lab,
      isCB: /^(LCB|RCB|CB)$/.test(pos) || /^CB$/.test(lab),
      isNB: /NB|NICK|SLOT/.test(pos) || /NB|NICK/.test(lab),
      isFS: pos === "FS" || lab === "FS",
      isSS: pos === "SS" || lab === "SS",
      isS: /^(FS|SS|S)$/.test(pos) || /^(FS|SS)$/.test(lab),
      isLB: d.group === "LB",
      isDL: d.group === "DL",
      /* Label only — do not infer Mike from x (Nickel WLB/MLB both sit near mid). */
      isMike: /MIKE|^M$|MLB/i.test(pos),
      leftSide: (d.x || 0) < 500,
    };
  }

  function ans(relationship, leverage, depth, d, cov) {
    return {
      relationship: relationship,
      leverage: leverage,
      depth: depth,
      x: d.x,
      y: d.y,
      derived: true,
      coverage: cov,
    };
  }

  function manAnswer(call, di, state, opts, d, cov, skill) {
    var resp = typeof opts.coverageRespForDef === "function" ? opts.coverageRespForDef(state, di) || "" : "";
    var m = resp.match(/Man #(\d+)\s*[—\-]\s*(inside|outside)/i);
    var relationship, leverage;
    if (m) {
      relationship = "over #" + m[1];
      leverage = m[2].toLowerCase();
    } else {
      var ord = alignNearestOrdinal(skill, d);
      relationship = "over #" + ord.n;
      leverage = (d.x || 0) < 500 ? "inside" : "outside";
    }
    return ans(relationship, leverage, "press", d, cov);
  }

  /**
   * Derive categorical align answer.
   * RELATIONSHIP = zone responsibility from coverage (invariant).
   * Throws if coverage unresolved or role/coverage has no rule.
   */
  function deriveAlignAnswer(call, di, state, opts) {
    opts = opts || {};
    var covRes = resolveCallCoverage(call);
    if (!covRes.ok) {
      fail(
        "ALIGN_KEY_COVERAGE",
        (covRes.reason || "missing") +
          (covRes.callName ? " call=" + covRes.callName : "") +
          (covRes.raw ? " raw=" + covRes.raw : "")
      );
    }
    var cov = covRes.coverage;
    var defs = (state && state.defs) || [];
    var d = defs[di] || {};
    var skill = alignSkillPlayers(state);
    var r = roleFlags(d);
    var dy = d.dy != null ? d.dy : d.y;
    var deepish = dy != null && dy < 260;

    if (r.isDL) {
      return ans("stack the box", "head-up", "press", d, cov);
    }

    /* —— Cover 0: pure man, no deep help —— */
    if (cov === "Cover 0") {
      if (d.role === "zone" && deepish) fail("ALIGN_KEY_NO_RULE", "Cover 0 deep zone role=" + r.pos);
      return manAnswer(call, di, state, opts, d, cov, skill);
    }

    /* —— Cover 1: man + free safety —— */
    if (cov === "Cover 1") {
      if (r.isFS || (d.role === "zone" && deepish && r.isS && !r.isSS)) {
        return ans("deep middle", "head-up", "deep", d, cov);
      }
      /* Rotated / man safety, CB, NB, LB → man */
      if (d.role === "man" || r.isCB || r.isNB || r.isSS || r.isLB || r.isS) {
        return manAnswer(call, di, state, opts, d, cov, skill);
      }
      fail("ALIGN_KEY_NO_RULE", "Cover 1 role=" + r.pos);
    }

    /* —— Cover 3: CB deep outside third, FS deep middle, SS/NB curl-flat, Mike hook —— */
    if (cov === "Cover 3") {
      if (r.isCB) return ans("deep outside third", "outside", "deep", d, cov);
      if (r.isFS) return ans("deep middle", "head-up", "deep", d, cov);
      if (r.isSS || r.isNB) return ans("curl/flat", "outside", "off", d, cov);
      if (r.isMike) return ans("middle hook", "head-up", "off", d, cov);
      if (r.isLB) return ans("hook / curl", "head-up", "off", d, cov);
      if (r.isS) {
        /* unlabeled safety: deepest → middle, else curl/flat (matches placeDefenseOn rotate) */
        if (deepish && Math.abs((d.x || 500) - 500) < 100) return ans("deep middle", "head-up", "deep", d, cov);
        return ans("curl/flat", "outside", "off", d, cov);
      }
      fail("ALIGN_KEY_NO_RULE", "Cover 3 role=" + r.pos);
    }

    /* —— Cover 2: CB flat, safeties deep half —— */
    if (cov === "Cover 2") {
      if (r.isCB) return ans("flat", "outside", "press", d, cov);
      if (r.isFS || r.isSS || r.isS) return ans("deep half", "head-up", "deep", d, cov);
      if (r.isNB) return ans("hook / curl", "inside", "off", d, cov);
      if (r.isLB) {
        if ((d.x || 0) < 280 || (d.x || 0) > 720) return ans("flat", "outside", "off", d, cov);
        return ans("hook / curl", "head-up", "off", d, cov);
      }
      fail("ALIGN_KEY_NO_RULE", "Cover 2 role=" + r.pos);
    }

    /* —— Tampa 2: Cover 2 shells + Mike deep middle (hole) —— */
    if (cov === "Tampa 2") {
      if (r.isCB) return ans("flat", "outside", "press", d, cov);
      if (r.isFS || r.isSS || (r.isS && !r.isMike)) return ans("deep half", "head-up", "deep", d, cov);
      /* Hole: Mike by label, or the LB dropped to MID (deepish + center). */
      if (r.isMike || (r.isLB && deepish && Math.abs((d.x || 500) - 500) < 90)) {
        return ans("deep middle", "head-up", "deep", d, cov);
      }
      if (r.isNB) return ans("hook / curl", "inside", "off", d, cov);
      if (r.isLB) return ans("hook / curl", "head-up", "off", d, cov);
      fail("ALIGN_KEY_NO_RULE", "Tampa 2 role=" + r.pos);
    }

    /* —— Cover 4: CB + both safeties deep quarter —— */
    if (cov === "Cover 4") {
      if (r.isCB || r.isFS || r.isSS || r.isS) return ans("deep quarter", "head-up", "deep", d, cov);
      if (r.isNB) return ans("hook / curl", "inside", "off", d, cov);
      if (r.isLB) return ans("hook / curl", "head-up", "off", d, cov);
      fail("ALIGN_KEY_NO_RULE", "Cover 4 role=" + r.pos);
    }

    /* —— Cover 6: left = quarters, right = Cover 2 (matches OFFGRD-render assignCoverage) —— */
    if (cov === "Cover 6") {
      if (r.isCB) {
        return r.leftSide
          ? ans("deep quarter", "outside", "deep", d, cov)
          : ans("flat", "outside", "press", d, cov);
      }
      if (r.isFS || r.isSS || r.isS) {
        return r.leftSide
          ? ans("deep quarter", "head-up", "deep", d, cov)
          : ans("deep half", "head-up", "deep", d, cov);
      }
      if (r.isNB) return ans("hook / curl", "inside", "off", d, cov);
      if (r.isLB) return ans("hook / curl", "head-up", "off", d, cov);
      fail("ALIGN_KEY_NO_RULE", "Cover 6 role=" + r.pos);
    }

    /* —— 2-Man: man underneath, safeties deep half —— */
    if (cov === "2-Man") {
      if (r.isFS || r.isSS || r.isS) return ans("deep half", "head-up", "deep", d, cov);
      return manAnswer(call, di, state, opts, d, cov, skill);
    }

    fail("ALIGN_KEY_NO_RULE", "cov=" + cov + " role=" + r.pos);
  }

  return {
    KNOWN_COVERAGES: KNOWN.slice(),
    DEEP_ZONE_RELS: DEEP_ZONE_RELS,
    normalizeCoverage: normalizeCoverage,
    resolveCallCoverage: resolveCallCoverage,
    deriveAlignAnswer: deriveAlignAnswer,
    alignSkillPlayers: alignSkillPlayers,
    alignNearestOrdinal: alignNearestOrdinal,
    isDeepZoneRel: isDeepZoneRel,
    roleFlags: roleFlags,
  };
});
