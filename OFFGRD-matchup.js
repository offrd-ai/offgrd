/* ============================================================
   OFFGRD-matchup.js — Play vs Look structural scorer (P1)
   Reuses OFFGRD_AUTODERIVE.classifyPlay — no second geometry parser.
   Rules versioned: STRUCT_RULES_V. Offline, deterministic.
   ============================================================ */
(function (root) {
  "use strict";

  var STRUCT_RULES_V = "struct_rules_v1";
  var LOOK_FAMILIES = ["C0", "C1", "C2", "C2M", "C3", "C4", "PRESS"];
  var CACHE_PREFIX = "offgrd_struct_v1:";

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
    familyOf: familyOf,
    classify: classify,
    structScore: structScore,
    structScoreFromFeatures: structScoreFromFeatures,
    routeFeatures: routeFeatures,
    rankPlaysVsLook: rankPlaysVsLook,
    scoreBook: scoreBook,
    scorePlayAllLooks: scorePlayAllLooks,
    getCached: getCached,
    setCached: setCached,
    hasPassGeometry: hasPassGeometry,
    FIXTURES: FIXTURES,
    fixturePlay: fixturePlay,
    RULES_V1: RULES_V1
  };

  root.OFFGRD_MATCHUP = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
