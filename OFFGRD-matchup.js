/* ============================================================
   OFFGRD-matchup.js — Play vs Look scorer (P1 structural + P2 blend/EV)
   Reuses OFFGRD_AUTODERIVE.classifyPlay — no second geometry parser.
   Rules versioned: STRUCT_RULES_V. Offline, deterministic.
   ============================================================ */
(function (root) {
  "use strict";

  var STRUCT_RULES_V = "struct_rules_v1";
  var LOOK_FAMILIES = ["C0", "C1", "C2", "C2M", "C3", "C4", "PRESS"];
  var CACHE_PREFIX = "offgrd_struct_v1:";
  var BLEND_K = 8;

  function familyOf(cov) {
    if (cov == null || cov === "") return null;
    var s = String(cov).trim();
    var l = s.toLowerCase();
    if (/^press|pressure|blitz/.test(l) && !/cover/.test(l)) return "PRESS";
    if (/2[\s\-]?man|^2m\b/.test(l)) return "C2M";
    if (/tampa/.test(l)) return "C2";
    if (/quarter|quarters/.test(l)) return "C4";
    if (/cover\s*0\b|^c\s*0\b|^0\b|soft\s*0|zero/.test(l) && !/cover\s*[1-6]/.test(l)) {
      if (/soft\s*0|zero|cover\s*0|^c\s*0\b|^0\b/.test(l)) return "C0";
    }
    var m = l.match(/cover\s*([0-6])|cov\s*([0-6])|\bc\s*([0-6])\b|^([0-6])\b/);
    if (m) {
      var n = m[1] || m[2] || m[3] || m[4];
      if (n === "0") return "C0";
      if (n === "1") return "C1";
      if (n === "2") return "C2";
      if (n === "3") return "C3";
      if (n === "4" || n === "6") return "C4";
      if (n === "5") return "C3";
    }
    if (/\bman\b/.test(l) && !/zone/.test(l)) return "C1";
    if (/\bzone\b/.test(l)) return "C3";
    return null;
  }

  function getAD() {
    return root.OFFGRD_AUTODERIVE || null;
  }

  function classify(play) {
    var AD = getAD();
    if (!AD || typeof AD.classifyPlay !== "function") {
      throw new Error("OFFGRD_MATCHUP: OFFGRD_AUTODERIVE.classifyPlay required");
    }
    return AD.classifyPlay(play);
  }

  function routeFeatures(classified) {
    var routes = (classified && classified.routes) || [];
    var types = {};
    var maxDepth = 0;
    var nDrag = 0;
    var nGoSeam = 0;
    var nFlat = 0;
    var nCurlHitch = 0;
    var nPostDig = 0;
    var nScreen = 0;
    var nQuick = 0;
    for (var i = 0; i < routes.length; i++) {
      var r = routes[i];
      var t = r.type || "";
      types[t] = (types[t] || 0) + 1;
      if (typeof r.depth === "number" && r.depth > maxDepth) maxDepth = r.depth;
      if (t === "drag") nDrag++;
      if (t === "go" || t === "seam") nGoSeam++;
      if (t === "flat") nFlat++;
      if (t === "curl" || t === "hitch" || t === "stick") nCurlHitch++;
      if (t === "post" || t === "dig") nPostDig++;
      if (t === "screen") nScreen++;
      if (typeof r.depth === "number" && r.depth <= 3) nQuick++;
    }
    var concept = (classified && classified.concept) || null;
    var name = String((classified && classified.name) || "").toLowerCase();
    var st = (classified && classified.state) || {};
    var playType = String(st.type || "").toLowerCase();
    var isRun = playType === "run" || (!routes.length && /run|iso|power|counter|inside|outside|zone\s*read/.test(name));
    var isPA = /\bpa\b|play[\s\-]?action|boot|naked/.test(name + " " + String(st.family || "") + " " + String(st.series || ""));
    return {
      routes: routes,
      concept: concept,
      types: types,
      maxDepth: maxDepth,
      nDrag: nDrag,
      nGoSeam: nGoSeam,
      nFlat: nFlat,
      nCurlHitch: nCurlHitch,
      nPostDig: nPostDig,
      nScreen: nScreen,
      nQuick: nQuick,
      isRun: isRun,
      isPA: isPA,
      name: name,
      smashShape: (concept === "smash" || concept === "curlflat") || (nCurlHitch >= 1 && nFlat >= 1),
      meshShape: concept === "mesh" || nDrag >= 2,
      vertsShape: concept === "verts" || nGoSeam >= 3
    };
  }

  /**
   * Rule table: each rule = { id, looks:[], delta, why, test(feat) }
   * looks empty = all families (rare).
   */
  var RULES_V1 = [
    {
      id: "mesh_vs_man",
      looks: ["C0", "C1", "C2M"],
      delta: 28,
      why: "Natural picks / mesh rubs vs man",
      test: function (f) { return f.meshShape; }
    },
    {
      id: "smash_vs_quarters_c2",
      looks: ["C2", "C4"],
      delta: 26,
      why: "High-low the flat / corner (smash · curl-flat)",
      test: function (f) { return f.smashShape || f.concept === "smash" || f.concept === "curlflat"; }
    },
    {
      id: "verts_vs_c3",
      looks: ["C3"],
      delta: 24,
      why: "4-on-3 deep / seam attack vs single-high",
      test: function (f) { return f.vertsShape; }
    },
    {
      id: "verts_vs_c4_penalty",
      looks: ["C4"],
      delta: -18,
      why: "Quarters caps verticals — check underneath",
      test: function (f) { return f.vertsShape; }
    },
    {
      id: "post_dig_vs_single_high",
      looks: ["C1", "C3"],
      delta: 16,
      why: "Attack the post-safety with deep dig / post",
      test: function (f) { return f.nPostDig >= 1; }
    },
    {
      id: "quick_screen_vs_pressure",
      looks: ["PRESS"],
      delta: 22,
      why: "Quick game / screen vs pressure-heavy cells",
      test: function (f) { return f.nScreen >= 1 || (f.nQuick >= 2 && f.maxDepth <= 6); }
    },
    {
      id: "deep_pa_vs_pressure_penalty",
      looks: ["PRESS"],
      delta: -20,
      why: "Deep-developing PA struggles vs high pressure",
      test: function (f) { return f.isPA && f.maxDepth >= 16; }
    },
    {
      id: "flood_vs_zone",
      looks: ["C2", "C3", "C4"],
      delta: 14,
      why: "Flood / three-level stretch stresses zone flats",
      test: function (f) { return f.concept === "flood"; }
    },
    {
      id: "rb_flat_vs_c1",
      looks: ["C1"],
      delta: 12,
      why: "RB check / flat wins the leverage race vs man-free",
      test: function (f) {
        return f.types.flat >= 1 || f.types.wheel >= 1 || f.types.screen >= 1;
      }
    },
    {
      id: "crossers_vs_c0",
      looks: ["C0"],
      delta: 18,
      why: "Shallow crossers beat zero (no deep help — get it out)",
      test: function (f) { return f.nDrag >= 1 || f.meshShape; }
    }
  ];

  function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
  }

  function structScoreFromFeatures(feat, lookFamily) {
    if (!lookFamily || LOOK_FAMILIES.indexOf(lookFamily) < 0) {
      return {
        score: 50,
        why: ["Unknown look family"],
        concept: feat.concept,
        rules_v: STRUCT_RULES_V,
        basis: "on_paper"
      };
    }
    if (feat.isRun || (!feat.routes.length && !feat.concept)) {
      return {
        score: 50,
        why: ["run concepts: structural look scoring in P2"],
        concept: feat.concept,
        rules_v: STRUCT_RULES_V,
        basis: "on_paper"
      };
    }

    var score = 50;
    var fired = [];
    for (var i = 0; i < RULES_V1.length; i++) {
      var rule = RULES_V1[i];
      if (rule.looks.indexOf(lookFamily) < 0) continue;
      if (!rule.test(feat)) continue;
      score += rule.delta;
      fired.push({ delta: rule.delta, why: rule.why, abs: Math.abs(rule.delta) });
    }
    fired.sort(function (a, b) { return b.abs - a.abs; });
    var why = fired.slice(0, 2).map(function (f) { return f.why; });
    if (!why.length) why = ["Neutral on paper vs " + lookFamily];
    return {
      score: clamp(Math.round(score), 0, 100),
      why: why,
      concept: feat.concept,
      rules_v: STRUCT_RULES_V,
      basis: "on_paper"
    };
  }

  function structScore(play, lookFamily) {
    var fam = LOOK_FAMILIES.indexOf(lookFamily) >= 0 ? lookFamily : familyOf(lookFamily);
    var classified = classify(play && (play.data || play));
    var feat = routeFeatures(classified);
    var out = structScoreFromFeatures(feat, fam);
    out.playId = play && (play.id || play.cid || null);
    out.name = (play && play.name) || classified.name || "";
    return out;
  }

  function cacheKey(playId) {
    return CACHE_PREFIX + STRUCT_RULES_V + ":" + String(playId || "");
  }

  function getCached(playId) {
    if (playId == null || playId === "") return null;
    try {
      if (typeof localStorage === "undefined") return null;
      var raw = localStorage.getItem(cacheKey(playId));
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (!o || o.rules_v !== STRUCT_RULES_V) return null;
      return o.byLook || null;
    } catch (e) {
      return null;
    }
  }

  function setCached(playId, byLook) {
    if (playId == null || playId === "") return;
    try {
      if (typeof localStorage === "undefined") return;
      localStorage.setItem(
        cacheKey(playId),
        JSON.stringify({ rules_v: STRUCT_RULES_V, byLook: byLook, t: Date.now() })
      );
    } catch (e) {}
  }

  function scorePlayAllLooks(play, useCache) {
    var playId = play && (play.id || play.cid || null);
    if (useCache !== false && playId) {
      var hit = getCached(playId);
      if (hit) return hit;
    }
    var classified = classify(play && (play.data || play));
    var feat = routeFeatures(classified);
    var byLook = {};
    for (var i = 0; i < LOOK_FAMILIES.length; i++) {
      var fam = LOOK_FAMILIES[i];
      byLook[fam] = structScoreFromFeatures(feat, fam);
    }
    if (useCache !== false && playId) setCached(playId, byLook);
    return byLook;
  }

  function hasPassGeometry(play) {
    try {
      var c = classify(play && (play.data || play));
      var feat = routeFeatures(c);
      if (feat.isRun) return false;
      return !!(feat.routes.length || feat.concept);
    } catch (e) {
      return false;
    }
  }

  function rankPlaysVsLook(plays, lookFamily, opts) {
    opts = opts || {};
    var limit = opts.limit != null ? opts.limit : 5;
    var fam = LOOK_FAMILIES.indexOf(lookFamily) >= 0 ? lookFamily : familyOf(lookFamily);
    if (!fam) return [];
    var list = Array.isArray(plays) ? plays : [];
    var scored = [];
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (!p) continue;
      if (!hasPassGeometry(p)) continue;
      try {
        var r = structScore(p, fam);
        scored.push({
          play: p,
          id: p.id || p.cid || null,
          name: p.name || r.name || "?",
          score: r.score,
          why: r.why,
          concept: r.concept,
          basis: r.basis,
          rules_v: r.rules_v
        });
      } catch (e) {
        /* skip unscorable */
      }
    }
    scored.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return String(a.name).localeCompare(String(b.name));
    });
    return scored.slice(0, limit);
  }

  function scoreBook(plays) {
    var list = Array.isArray(plays) ? plays : [];
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (!p || !hasPassGeometry(p)) continue;
      try {
        out.push({
          id: p.id || p.cid || null,
          name: p.name || "?",
          byLook: scorePlayAllLooks(p, false)
        });
      } catch (e) {}
    }
    return out;
  }

  /* ---------- P2: concept key, empirical, blend, EV ---------- */

  function normPlayName(name) {
    return String(name || "")
      .trim()
      .replace(/\s+/g, " ")
      .toUpperCase();
  }

  function conceptKey(play) {
    if (play == null) return "";
    if (typeof play === "string") return normPlayName(play);
    var name = play.name || "";
    try {
      var c = classify(play.data || play);
      if (c && c.concept) return String(c.concept).toLowerCase();
    } catch (e) {}
    if (play.concept) return String(play.concept).toLowerCase();
    return normPlayName(name);
  }

  function rowMatchesKey(row, key) {
    if (!row || !key) return false;
    var playName = normPlayName(row.play);
    var k = String(key);
    if (playName && playName === normPlayName(k)) return true;
    if (playName && playName === k.toUpperCase()) return true;
    var rk = String(row.concept || row.family || "").toLowerCase();
    if (rk && rk === k.toLowerCase()) return true;
    /* concept keys are lowercase; play names UPPER — also match concept token in play */
    if (k === k.toLowerCase() && playName && playName.indexOf(k.toUpperCase()) >= 0) return true;
    return false;
  }

  function sampleWeight(row, opts) {
    var res = String((row && row.result) || "").toLowerCase();
    if (/sack|intercept|int\b|fumble|turnover|safety/.test(res)) return 0;
    var g = row && row.gain != null ? +row.gain : NaN;
    if (!isNaN(g) && g <= -7) return 0; /* sack-like */
    var w = 1;
    if (opts && typeof opts.weightFn === "function") {
      var rw = +opts.weightFn(row);
      if (!isNaN(rw) && rw > 0) w *= rw;
    }
    /* chunk / explosive → 1.5 */
    var pt = String((row && row.playType) || "").toLowerCase();
    if (!isNaN(g)) {
      var thr = pt.indexOf("pass") >= 0 ? 16 : pt.indexOf("run") >= 0 ? 12 : 15;
      if (g >= thr) w *= 1.5;
    }
    return w;
  }

  function defaultGetSuccess(row) {
    if (!row) return null;
    if (row.success != null && row.success !== "") return +row.success ? 1 : 0;
    return null;
  }

  /**
   * empiricalCell(conceptOrPlay, family, rows, opts)
   * opts: { getSuccess, weightFn, down, distBucket, distBucketOf }
   */
  function empiricalCell(conceptOrPlay, family, rows, opts) {
    opts = opts || {};
    var fam = LOOK_FAMILIES.indexOf(family) >= 0 ? family : familyOf(family);
    var key =
      typeof conceptOrPlay === "string" || !conceptOrPlay
        ? normPlayName(conceptOrPlay) || String(conceptOrPlay || "").toLowerCase()
        : conceptKey(conceptOrPlay);
    /* Prefer lowercase concept if play object */
    if (conceptOrPlay && typeof conceptOrPlay !== "string") {
      key = conceptKey(conceptOrPlay);
    } else if (typeof conceptOrPlay === "string") {
      var s = String(conceptOrPlay).trim();
      key = s === s.toLowerCase() && s.indexOf(" ") < 0 ? s.toLowerCase() : normPlayName(s);
    }

    var getSuccess = typeof opts.getSuccess === "function" ? opts.getSuccess : defaultGetSuccess;
    var list = Array.isArray(rows) ? rows : [];
    var empty = {
      sr: 0,
      n: 0,
      w: 0,
      family: fam,
      basis: "on_paper",
      key: key
    };
    if (!fam || !key) return empty;

    function famMatch(r) {
      return familyOf(r.coverage) === fam;
    }
    function keyMatch(r) {
      return rowMatchesKey(r, key);
    }
    function graded(r) {
      return getSuccess(r) != null;
    }

    var pool = list.filter(function (r) {
      return keyMatch(r) && famMatch(r) && graded(r);
    });

    /* Widen ladder: prefer down+dist, then down, then family-only (like bestCallsFor). */
    if (opts.down != null || opts.distBucket != null) {
      var dn = opts.down;
      var db = opts.distBucket;
      var distOf = typeof opts.distBucketOf === "function" ? opts.distBucketOf : null;
      var tight = pool.filter(function (r) {
        if (dn != null && dn !== "ANY" && +r.down !== +dn) return false;
        if (db != null && db !== "ANY" && distOf) {
          if (r.distance == null || distOf(r.distance) !== db) return false;
        }
        return true;
      });
      if (tight.length >= 2) pool = tight;
      else {
        var mid = pool.filter(function (r) {
          return dn == null || dn === "ANY" || +r.down === +dn;
        });
        if (mid.length >= 2) pool = mid;
      }
    }

    var wSum = 0;
    var sSum = 0;
    var nEff = 0;
    for (var i = 0; i < pool.length; i++) {
      var r = pool[i];
      var sw = sampleWeight(r, opts);
      if (sw <= 0) continue;
      var suc = +getSuccess(r);
      if (isNaN(suc)) continue;
      wSum += sw;
      sSum += sw * (suc ? 1 : 0);
      nEff += 1;
    }
    if (nEff <= 0 || wSum <= 0) return empty;
    var sr = sSum / wSum;
    var w = nEff / (nEff + BLEND_K);
    return {
      sr: sr,
      n: nEff,
      w: w,
      family: fam,
      basis: "empirical",
      key: key
    };
  }

  function blendScore(emp, struct01) {
    var e = emp || { sr: 0, w: 0 };
    var w = typeof e.w === "number" ? e.w : 0;
    var s = typeof struct01 === "number" && !isNaN(struct01) ? struct01 : 0.5;
    var sr = typeof e.sr === "number" && !isNaN(e.sr) ? e.sr : 0;
    return w * sr + (1 - w) * s;
  }

  function struct01ForPlay(play, fam) {
    if (!play) return 0.5;
    var hasGeom = !!(play.data || play.players);
    if (!hasGeom) return 0.5;
    try {
      var r = structScore(play, fam);
      return (r.score || 50) / 100;
    } catch (e) {
      return 0.5;
    }
  }

  function normalizeCovDist(covDist) {
    var arr = [];
    if (!covDist) return arr;
    if (Array.isArray(covDist)) arr = covDist;
    else if (covDist.arr) arr = covDist.arr;
    else if (typeof covDist === "object") {
      Object.keys(covDist).forEach(function (k) {
        var v = covDist[k];
        if (typeof v === "number") arr.push({ k: k, pct: v });
        else if (v && v.pct != null) arr.push({ k: v.k || k, pct: v.pct });
      });
    }
    var out = [];
    var tot = 0;
    for (var i = 0; i < arr.length; i++) {
      var a = arr[i];
      if (!a || a.pct == null || a.pct < 0.05) continue;
      var fam = LOOK_FAMILIES.indexOf(a.k) >= 0 ? a.k : familyOf(a.k);
      if (!fam) continue;
      out.push({ k: a.k, fam: fam, pct: +a.pct });
      tot += +a.pct;
    }
    if (tot > 0 && Math.abs(tot - 1) > 0.01) {
      for (var j = 0; j < out.length; j++) out[j].pct = out[j].pct / tot;
    }
    return out;
  }

  var TIP_SCHEME =
    "ranked by how this play's design fits the predicted look — no graded reps yet";
  var TIP_SUCCESS =
    "your graded results vs this look, blended with scheme fit.";

  function snapCountLabel(n) {
    n = n || 0;
    return n + " SNAP" + (n === 1 ? "" : "S");
  }

  function basisLabelFor(emp, fam) {
    if (!emp || !emp.n) return "SCHEME MATCH";
    var pct = Math.round((emp.sr || 0) * 100);
    return "SUCCESS " + pct + "% · " + snapCountLabel(emp.n);
  }

  function basisTipFor(emp) {
    return emp && emp.n ? TIP_SUCCESS : TIP_SCHEME;
  }

  /**
   * ev(play, covDist, rows, opts) → { ev, n, basis, basisLabel, byLook, why }
   */
  function ev(play, covDist, rows, opts) {
    opts = opts || {};
    var mix = normalizeCovDist(covDist);
    var byLook = {};
    var evSum = 0;
    var pctSum = 0;
    var nMax = 0;
    var bestEmp = null;
    var why = [];
    if (!mix.length) {
      var fam0 = opts.fallbackFamily || "C1";
      var emp0 = empiricalCell(play, fam0, rows, opts);
      var s0 = struct01ForPlay(play, fam0);
      var b0 = blendScore(emp0, s0);
      return {
        ev: b0,
        n: emp0.n || 0,
        basis: emp0.n > 0 ? "empirical" : "on_paper",
        basisLabel: basisLabelFor(emp0, fam0),
        basisTip: basisTipFor(emp0),
        byLook: {},
        why: []
      };
    }
    for (var i = 0; i < mix.length; i++) {
      var m = mix[i];
      var emp = empiricalCell(play, m.fam, rows, opts);
      var s01 = struct01ForPlay(play, m.fam);
      var blended = blendScore(emp, s01);
      byLook[m.fam] = { emp: emp, struct: s01, score: blended, pct: m.pct };
      evSum += m.pct * blended;
      pctSum += m.pct;
      if ((emp.n || 0) > nMax) {
        nMax = emp.n;
        bestEmp = emp;
      }
      try {
        var st = structScore(play.data ? play : { name: play.name, data: play.data || play }, m.fam);
        if (st.why && st.why[0] && why.length < 2) why.push(st.why[0]);
      } catch (e) {}
    }
    var evOut = evSum;
    if (pctSum > 1.01) evOut = evSum / pctSum;
    else if (pctSum > 0 && pctSum < 0.5) evOut = evSum / pctSum;

    return {
      ev: evOut,
      n: nMax,
      basis: nMax > 0 ? "empirical" : "on_paper",
      basisLabel: bestEmp && bestEmp.n ? basisLabelFor(bestEmp, bestEmp.family) : "SCHEME MATCH",
      basisTip: bestEmp && bestEmp.n ? TIP_SUCCESS : TIP_SCHEME,
      byLook: byLook,
      why: why
    };
  }

  function rankPlaysByEv(plays, covDist, rows, opts) {
    opts = opts || {};
    var limit = opts.limit != null ? opts.limit : 20;
    var list = Array.isArray(plays) ? plays : [];
    var scored = [];
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (!p) continue;
      var name = typeof p === "string" ? p : p.name || "?";
      var playObj = typeof p === "string" ? { name: p } : p;
      try {
        var r = ev(playObj, covDist, rows, opts);
        scored.push({
          play: playObj,
          name: name,
          id: playObj.id || playObj.cid || null,
          ev: r.ev,
          score: Math.round(r.ev * 100),
          n: r.n,
          basis: r.basis,
          basisLabel: r.basisLabel,
          basisTip: r.basisTip,
          why: r.why,
          concept: conceptKey(playObj),
          byLook: r.byLook
        });
      } catch (e) {}
    }
    scored.sort(function (a, b) {
      if (b.ev !== a.ev) return b.ev - a.ev;
      if (b.n !== a.n) return b.n - a.n;
      return String(a.name).localeCompare(String(b.name));
    });
    return scored.slice(0, limit);
  }

  /** Blend rank vs a single look family (Scout attack panel). */
  function rankPlaysVsLookBlended(plays, lookFamily, rows, opts) {
    opts = opts || {};
    var limit = opts.limit != null ? opts.limit : 5;
    var fam = LOOK_FAMILIES.indexOf(lookFamily) >= 0 ? lookFamily : familyOf(lookFamily);
    if (!fam) return [];
    var list = Array.isArray(plays) ? plays : [];
    var scored = [];
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (!p) continue;
      var geom = false;
      try {
        geom = hasPassGeometry(p);
      } catch (e0) {
        geom = false;
      }
      var emp = empiricalCell(p, fam, rows, opts);
      if (!geom && !emp.n) continue;
      try {
        var s01 = struct01ForPlay(p, fam);
        var blended = blendScore(emp, s01);
        var stWhy = [];
        if (geom) {
          try {
            stWhy = structScore(p, fam).why || [];
          } catch (e2) {}
        }
        scored.push({
          play: p,
          id: p.id || p.cid || null,
          name: p.name || "?",
          score: Math.round(blended * 100),
          ev: blended,
          why: stWhy,
          concept: conceptKey(p),
          basis: emp.n > 0 ? "empirical" : "on_paper",
          basisLabel: basisLabelFor(emp, fam),
          basisTip: basisTipFor(emp),
          n: emp.n || 0,
          rules_v: STRUCT_RULES_V
        });
      } catch (e) {}
    }
    scored.sort(function (a, b) {
      if (b.ev !== a.ev) return b.ev - a.ev;
      return String(a.name).localeCompare(String(b.name));
    });
    return scored.slice(0, limit);
  }

  /* ---- Fixtures for smoke / golden tests (minimal play.data) ---- */
  function fixturePlay(name, concept, routeSpecs) {
    var players = [{ id: "qb", lab: "Q", type: "qb", x: 500, y: 380, route: [] }];
    var labs = ["X", "Z", "H", "Y", "RB"];
    for (var i = 0; i < routeSpecs.length; i++) {
      var rs = routeSpecs[i];
      var depth = rs.depth != null ? rs.depth : 10;
      var lat = rs.lat != null ? rs.lat : 0;
      var x0 = rs.x != null ? rs.x : 400 + i * 50;
      players.push({
        id: "r" + i,
        lab: labs[i] || ("R" + i),
        type: rs.rb ? "rb" : "route",
        x: x0,
        y: 380,
        rname: rs.rname || null,
        route: [{ x: x0 + lat, y: 380 - depth * 11 }]
      });
    }
    return {
      id: "fix-" + name.replace(/\s+/g, "-").toLowerCase(),
      name: name,
      concept: concept,
      type: "pass",
      data: { name: name, concept: concept, type: "pass", players: players, defs: [] }
    };
  }

  var FIXTURES = {
    mesh: fixturePlay("Mesh Cross", "mesh", [
      { rname: "Drag", depth: 6, lat: 120, x: 420 },
      { rname: "Cross", depth: 6, lat: -120, x: 580 },
      { rname: "Go", depth: 22, lat: 0, x: 500 }
    ]),
    smash: fixturePlay("Smash Z", "smash", [
      { rname: "Corner", depth: 18, lat: 80, x: 560 },
      { rname: "Hitch", depth: 6, lat: 20, x: 540 },
      { rname: "Seam", depth: 20, lat: 0, x: 480 }
    ]),
    curlflat: fixturePlay("Curl Flat", "curlflat", [
      { rname: "Curl", depth: 12, lat: -30, x: 420 },
      { rname: "Flat", depth: 3, lat: -90, x: 400 }
    ]),
    verts: fixturePlay("Four Verts", "verts", [
      { rname: "Go", depth: 22, lat: 0, x: 400 },
      { rname: "Seam", depth: 20, lat: 10, x: 460 },
      { rname: "Seam", depth: 20, lat: -10, x: 540 },
      { rname: "Go", depth: 22, lat: 0, x: 600 }
    ]),
    screen: fixturePlay("Tunnel Screen", null, [
      { rname: "Screen", depth: 2, lat: 40, x: 450 }
    ]),
    deepPA: fixturePlay("PA Post Boot", null, [
      { rname: "Post", depth: 20, lat: 60, x: 520 },
      { rname: "Go", depth: 22, lat: 0, x: 400 }
    ])
  };
  FIXTURES.deepPA.name = "PA Post Boot";
  FIXTURES.deepPA.data.name = "PA Post Boot";
  FIXTURES.deepPA.data.family = "play-action";

  var api = {
    STRUCT_RULES_V: STRUCT_RULES_V,
    LOOK_FAMILIES: LOOK_FAMILIES,
    BLEND_K: BLEND_K,
    familyOf: familyOf,
    classify: classify,
    conceptKey: conceptKey,
    normPlayName: normPlayName,
    structScore: structScore,
    structScoreFromFeatures: structScoreFromFeatures,
    routeFeatures: routeFeatures,
    rankPlaysVsLook: rankPlaysVsLook,
    rankPlaysVsLookBlended: rankPlaysVsLookBlended,
    scoreBook: scoreBook,
    scorePlayAllLooks: scorePlayAllLooks,
    getCached: getCached,
    setCached: setCached,
    hasPassGeometry: hasPassGeometry,
    empiricalCell: empiricalCell,
    blendScore: blendScore,
    ev: ev,
    rankPlaysByEv: rankPlaysByEv,
    basisLabelFor: basisLabelFor,
    TIP_SCHEME: TIP_SCHEME,
    TIP_SUCCESS: TIP_SUCCESS,
    FIXTURES: FIXTURES,
    fixturePlay: fixturePlay,
    RULES_V1: RULES_V1
  };

  root.OFFGRD_MATCHUP = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
