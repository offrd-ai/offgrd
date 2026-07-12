/* ============================================================
   OFFGRD-autoderive.js — Step 3: auto-derive qb_reads + ol_keys
   Rule-based, deterministic, offline. Suggestions only — never
   overwrites hand-authored content.

   Flag (default OFF):
     ?autoderive=1|0  |  localStorage.offgrd_autoderive_reads=1|0
     |  OFFGRD_CONFIG.autoderiveReads
   ============================================================ */
(function (root) {
  "use strict";

  const COVERAGES = ["Cover 0", "Cover 1", "Cover 2", "Cover 3", "Cover 4", "Tampa 2"];
  const OLRULES = [
    ["bob", "Big-on-big"], ["climb", "Climb to backer"], ["fan", "Fan / out"],
    ["combo", "Combo then climb"], ["pull", "I'm pulling"], ["reach", "Reach playside"],
    ["down", "Down block"], ["kick", "Kick out"], ["scan", "Scan / check"],
    ["checkrel", "Check-release"], ["free", "Free release"]
  ];

  function isAutoderive() {
    try {
      const q = location.search || "";
      if (/[?&]autoderive=0(?:&|$)/.test(q)) return false;
      if (/[?&]autoderive=1(?:&|$)/.test(q)) return true;
      const ls = localStorage.getItem("offgrd_autoderive_reads");
      if (ls === "0") return false;
      if (ls === "1") return true;
      if (root.OFFGRD_CONFIG && root.OFFGRD_CONFIG.autoderiveReads) return true;
    } catch (e) {}
    return false;
  }

  function normalizePlay(play) {
    if (!play) return null;
    if (play.players) return play;
    if (play.data && play.data.players) return play.data;
    return play.data || play;
  }

  /* ---------- Part A: route classification ---------- */
  function classifyRoute(p) {
    const name = (p.rname || "").toLowerCase();
    const route = p.route || [];
    const end = route.length ? route[route.length - 1] : { x: p.x, y: p.y };
    const depth = Math.max(0, Math.round((p.y - end.y) / 11)); /* ~PPY */
    const lat = end.x - p.x;
    const side = p.x < 480 ? "L" : p.x > 520 ? "R" : "M";
    const breakDir = Math.abs(lat) < 30 ? "N" : (lat > 0 ? (p.x < 500 ? "M" : "S") : (p.x < 500 ? "S" : "M"));

    let type = null;
    const map = {
      hitch: "hitch", slant: "slant", curl: "curl", out: "out", dig: "dig",
      comeback: "comeback", corner: "corner", post: "post", go: "go", fade: "fade",
      flat: "flat", wheel: "wheel", drag: "drag", cross: "drag", stick: "stick",
      seam: "seam", screen: "screen", whip: "out", pivot: "hitch", sluggo: "go",
      "post-corner": "corner"
    };
    if (name && map[name]) type = map[name];
    if (!type && route.length) {
      if (depth <= 4 && Math.abs(lat) > 60) type = "flat";
      else if (depth <= 7 && Math.abs(lat) < 40) type = "hitch";
      else if (depth <= 8 && Math.abs(lat) > 40 && ((p.x < 500 && lat > 0) || (p.x >= 500 && lat < 0))) type = "slant";
      else if (depth <= 8 && Math.abs(lat) > 40) type = "stick";
      else if (depth >= 9 && depth <= 14 && Math.abs(lat) < 50) type = "curl";
      else if (depth >= 9 && depth <= 14 && Math.abs(lat) >= 50 && ((p.x < 500 && lat < 0) || (p.x >= 500 && lat > 0))) type = "out";
      else if (depth >= 10 && depth <= 16 && Math.abs(lat) >= 80 && ((p.x < 500 && lat > 0) || (p.x >= 500 && lat < 0))) type = "dig";
      else if (depth >= 16 && Math.abs(lat) > 60 && ((p.x < 500 && lat < 0) || (p.x >= 500 && lat > 0))) type = "corner";
      else if (depth >= 16 && Math.abs(lat) > 60) type = "post";
      else if (depth >= 18) type = "go";
      else type = "hitch";
    }
    return {
      receiver: p.lab, type: type || "hitch", depth, side, breakDir,
      rname: p.rname || null, x: p.x, y: p.y, endX: end.x, endY: end.y
    };
  }

  function classifyPlay(play) {
    const st = normalizePlay(play);
    if (!st || !st.players) return { routes: [], concept: null, state: st };
    const skill = st.players.filter(p => p.type === "route" || p.type === "rb");
    const routes = skill.filter(p => (p.route && p.route.length) || p.rname).map(classifyRoute);
    const concept = detectConcept(routes, st);
    return { routes, concept, state: st, name: st.name || "", formation: st.formation || "", protection: st.protection || "" };
  }

  function hasType(routes, t) { return routes.some(r => r.type === t); }
  function findType(routes, t, side) {
    return routes.find(r => r.type === t && (!side || r.side === side)) || routes.find(r => r.type === t);
  }
  function detectConcept(routes, st) {
    const named = String(st.concept || st.family || st.series || st.name || "").toLowerCase();
    if (/smash/.test(named)) return "smash";
    if (/mesh/.test(named)) return "mesh";
    if (/flood/.test(named)) return "flood";
    if (/vert/.test(named)) return "verts";
    if (/stick/.test(named)) return "stick";
    if (/curl/.test(named)) return "curlflat";

    const types = routes.map(r => r.type);
    const corners = routes.filter(r => r.type === "corner");
    const hitches = routes.filter(r => r.type === "hitch" || r.type === "stick");
    if (corners.length && hitches.length && routes.some(r => r.type === "seam" || r.type === "go")) return "smash";
    if (routes.filter(r => r.type === "drag").length >= 2) return "mesh";
    if (hasType(routes, "flat") && hasType(routes, "out") && (hasType(routes, "go") || hasType(routes, "seam"))) return "flood";
    if (routes.filter(r => r.type === "go" || r.type === "seam").length >= 3) return "verts";
    if (hasType(routes, "stick") && !hasType(routes, "curl")) return "stick";
    if (hasType(routes, "curl") && hasType(routes, "flat")) return "curlflat";
    return null;
  }

  /* ---------- Part B: QB reads — built-in ground truth + soft-spot rules ---------- */
  const BUILTIN_TRUTH = {
    smash: {
      prog: ["Z", "H", "X", "RB"],
      reads: {
        "Cover 0": { t: "H", why: "All-out man, no deep help — throw the quick hitch (5-6) before the rush gets home." },
        "Cover 1": { t: "Z", why: "Single-high man — win the corner one-on-one over the sinking corner." },
        "Cover 2": { t: "Z", why: "Classic Smash beater: high-low the corner. He jams the flat, safety's deep — the corner sits in the hole." },
        "Cover 3": { t: "H", why: "The corner is roofed by the deep third — take the 6-yard hitch underneath now." },
        "Cover 4": { t: "H", why: "Quarters brackets the corner — the hitch underneath is the completion." },
        "Tampa 2": { t: "Z", why: "Corners squat, Mike runs the deep middle — drop the corner over the squatting flat." }
      }
    },
    mesh: {
      prog: ["H", "Y", "X", "RB"],
      reads: {
        "Cover 0": { t: "H", why: "Man pressure — the mesh rub springs a crosser; hit the first one (5-6 yds) coming off the pick." },
        "Cover 1": { t: "Y", why: "Man-free — take the crosser coming off the rub with grass to run." },
        "Cover 2": { t: "H", why: "Zone — throw the crosser as it settles in the hook window at 5-6, under the halves." },
        "Cover 3": { t: "H", why: "Find the crosser sitting in the middle window versus three-deep." },
        "Cover 4": { t: "Y", why: "Quarters — the crossers cross the underneath zones; take the first one in space." },
        "Tampa 2": { t: "H", why: "Mike carries the middle deep — sit the crosser underneath him at 5-6." }
      }
    },
    flood: {
      prog: ["H", "Z", "X", "RB"],
      reads: {
        "Cover 0": { t: "Z", why: "Man — the 3-yard flat with the most grass and leverage, quick." },
        "Cover 1": { t: "H", why: "Man — the 10-yard out on leverage away from the free safety." },
        "Cover 2": { t: "H", why: "High-low the flat defender: he sits on the 3-yard flat, so throw the 10-12 out behind him." },
        "Cover 3": { t: "H", why: "Three-level flood: flat at 3 pulls the flat defender, the out sits in the void at 10-12." },
        "Cover 4": { t: "Z", why: "Quarters sinks the corner — dump the 3-yard flat underneath for the easy completion." },
        "Tampa 2": { t: "H", why: "Corner squats the flat — throw the out over him at 10-12, under the half." }
      }
    },
    verts: {
      prog: ["H", "Y", "X", "RB"],
      reads: {
        "Cover 0": { t: "H", why: "No deep help — throw the seam (20+) on your fastest matchup immediately." },
        "Cover 1": { t: "X", why: "Single-high man — attack the outside vertical away from the free safety." },
        "Cover 2": { t: "H", why: "Bend the seam on the safety — hit it 20+ over the corner, under the safety." },
        "Cover 3": { t: "H", why: "Attack the seam versus single-high — throw it in the void between corner and safety." },
        "Cover 4": { t: "RB", why: "Quarters caps all four verticals — check it down / hitch it up underneath." },
        "Tampa 2": { t: "X", why: "Mike runs the middle — take the outside vertical on the deep-half corner." }
      }
    },
    stick: {
      prog: ["Y", "RB", "X"],
      reads: {
        "Cover 0": { t: "Y", why: "Beat man with the quick stick (5-6) breaking away from leverage." },
        "Cover 1": { t: "Y", why: "Man — stick away from the defender's leverage; quick and open at 5-6." },
        "Cover 2": { t: "Y", why: "The stick sits in the flat void at 5-6 inside the squatting corner." },
        "Cover 3": { t: "Y", why: "Underneath stick in the flat window versus the curl/flat defender." },
        "Cover 4": { t: "Y", why: "Quarters — the 5-yard stick is the easy pitch-and-catch." },
        "Tampa 2": { t: "Y", why: "Stick in front of the squatting corner at 5-6." }
      }
    },
    curlflat: {
      prog: ["X", "H", "Z"],
      reads: {
        "Cover 0": { t: "H", why: "Man pressure — the flat (3 yds, past the LOS) with leverage and grass, quick." },
        "Cover 1": { t: "X", why: "Man — the curl breaking back to you at 10-12, away from trailing coverage." },
        "Cover 2": { t: "X", why: "Curl settles in the hole at 10-12 under the half, inside the squat corner." },
        "Cover 3": { t: "H", why: "High-low the flat defender: he widened to the curl, so throw the flat at 3 past the LOS." },
        "Cover 4": { t: "H", why: "Quarters — the flat underneath the sinking corner is the completion." },
        "Tampa 2": { t: "X", why: "Curl in the void at 10-12 under the half, over the squatting corner." }
      }
    }
  };

  function pickByPref(routes, prefs) {
    for (let i = 0; i < prefs.length; i++) {
      const t = prefs[i];
      const hit = routes.find(r => r.type === t);
      if (hit) return hit;
    }
    return routes[0] || null;
  }

  function softSpotTarget(routes, cov) {
    if (!routes.length) return null;
    const prefs = {
      "Cover 0": ["flat", "hitch", "stick", "slant", "screen", "drag"],
      "Cover 1": ["corner", "post", "go", "out", "curl", "slant"],
      "Cover 2": ["corner", "seam", "post", "out", "curl", "flat"],
      "Cover 3": ["hitch", "flat", "stick", "seam", "out", "curl"],
      "Cover 4": ["hitch", "flat", "stick", "curl", "out", "screen"],
      "Tampa 2": ["corner", "out", "curl", "seam", "flat", "hitch"]
    }[cov] || ["hitch", "flat", "curl"];
    return pickByPref(routes, prefs);
  }

  function whyFor(cov, route, concept, terms) {
    const lab = route ? route.receiver : "the open man";
    const nm = (route && route.rname) || (route && route.type) || "route";
    const play = terms.play || "this play";
    const base = {
      "Cover 0": `${lab}'s ${nm} is the hot answer vs all-out pressure on ${play} — get it out now.`,
      "Cover 1": `${lab}'s ${nm} wins the one-on-one vs single-high on ${play}.`,
      "Cover 2": `Attack the hole/soft spot with ${lab}'s ${nm} vs two-high on ${play}.`,
      "Cover 3": `${lab}'s ${nm} sits in the void vs three-deep on ${play}.`,
      "Cover 4": `${lab}'s ${nm} is the underneath completion vs quarters on ${play}.`,
      "Tampa 2": `${lab}'s ${nm} finds the void vs Tampa on ${play}.`
    };
    return base[cov] || `Throw ${lab} on ${play}.`;
  }

  function remapBuiltinToRoutes(truth, routes) {
    /* If labs differ from Smash Z/H/…, map by route role instead of fixed labs when possible. */
    const out = {};
    const prog = (truth.prog || []).filter(lab => routes.some(r => r.receiver === lab));
    const useProg = prog.length ? prog : routes.map(r => r.receiver);
    COVERAGES.forEach(cov => {
      const rd = truth.reads[cov];
      if (!rd) return;
      let t = rd.t;
      if (!routes.some(r => r.receiver === t)) {
        /* fall back by soft-spot type matching the spirit of the coverage */
        const alt = softSpotTarget(routes, cov);
        t = alt ? alt.receiver : (routes[0] && routes[0].receiver);
      }
      if (!t) return;
      out[cov] = { t, why: rd.why, prog: useProg.slice(), auto: true };
    });
    return { reads: out, prog: useProg, concept: truth };
  }

  function deriveReads(play, opts) {
    opts = opts || {};
    const classified = classifyPlay(play);
    const routes = classified.routes;
    if (!routes.length) return null;
    const terms = {
      play: opts.playName || classified.name || classified.state.name || "this play",
      formation: classified.formation
    };

    let reads, prog, concept = classified.concept;
    if (concept && BUILTIN_TRUTH[concept]) {
      const mapped = remapBuiltinToRoutes(BUILTIN_TRUTH[concept], routes);
      reads = mapped.reads; prog = mapped.prog;
    } else {
      reads = {};
      prog = routes.slice().sort((a, b) => a.depth - b.depth).map(r => r.receiver);
      COVERAGES.forEach(cov => {
        const tgt = softSpotTarget(routes, cov);
        if (!tgt) return;
        const rest = prog.filter(l => l !== tgt.receiver);
        reads[cov] = {
          t: tgt.receiver,
          why: whyFor(cov, tgt, concept, terms),
          prog: [tgt.receiver].concat(rest).slice(0, 4),
          auto: true
        };
      });
    }
    return { reads, prog, concept, routes, auto: true };
  }

  /* Merge: fill only empty coverages; never overwrite existing t */
  function mergeReads(existing, derived) {
    const out = Object.assign({}, existing || {});
    if (!derived || !derived.reads) return { reads: out, filled: 0 };
    let filled = 0;
    COVERAGES.forEach(cov => {
      const cur = out[cov];
      if (cur && cur.t) return; /* hand-authored or already filled */
      const d = derived.reads[cov];
      if (!d || !d.t) return;
      out[cov] = Object.assign({}, d, { auto: true });
      filled++;
    });
    return { reads: out, filled, concept: derived.concept, prog: derived.prog };
  }

  /* ---------- Part C: OL keys from protection × front ---------- */
  function blockersOf(st) {
    return (st.players || []).filter(p => p.ol || p.type === "block" || (p.type === "rb" && p.blk));
  }
  function defsOf(st) {
    return st.defs || [];
  }
  function nearestDef(defs, x, groupPref) {
    let best = -1, bd = 1e9;
    defs.forEach((d, i) => {
      if (groupPref && d.group !== groupPref && groupPref !== "*") return;
      const dd = Math.abs(d.x - x) + Math.abs((d.y || 0) - 360) * 0.15;
      if (dd < bd) { bd = dd; best = i; }
    });
    if (best < 0 && groupPref && groupPref !== "*") return nearestDef(defs, x, "*");
    return best;
  }

  function deriveOlKeys(play) {
    const st = normalizePlay(play);
    if (!st) return null;
    const blockers = blockersOf(st);
    const defs = defsOf(st);
    if (!blockers.length) return null;
    const prot = st.protection || "BOB";
    const front = (st.front && st.front !== "none") ? st.front : "";
    const keys = {};

    blockers.forEach(b => {
      const lab = b.lab;
      let pre;
      if (prot === "BOB" || prot === "6-Man (RB)" || !prot || prot === "none") {
        const di = defs.length ? nearestDef(defs, b.x, b.ol ? "DL" : "LB") : -1;
        pre = di >= 0 ? { t: "def", di } : { t: "rule", r: "bob" };
      } else if (prot === "Slide R" || (prot === "Half-Slide R" && b.x >= 500)) {
        pre = { t: "rule", r: b.ol ? "reach" : "scan" };
        if (defs.length) {
          const di = nearestDef(defs, b.x + 40, "DL");
          if (di >= 0) pre = { t: "def", di };
        }
      } else if (prot === "Slide L" || (prot === "Half-Slide L" && b.x <= 500)) {
        pre = { t: "rule", r: b.ol ? "reach" : "scan" };
        if (defs.length) {
          const di = nearestDef(defs, b.x - 40, "DL");
          if (di >= 0) pre = { t: "def", di };
        }
      } else if (prot.indexOf("Half-Slide") === 0) {
        const di = defs.length ? nearestDef(defs, b.x, "DL") : -1;
        pre = di >= 0 ? { t: "def", di } : { t: "rule", r: "bob" };
      } else {
        const di = defs.length ? nearestDef(defs, b.x, "*") : -1;
        pre = di >= 0 ? { t: "def", di } : { t: "rule", r: "bob" };
      }
      /* RB in 6-man / check */
      if (b.type === "rb" || lab === "RB" || lab === "FB") {
        if (prot === "6-Man (RB)") pre = defs.length ? { t: "def", di: nearestDef(defs, b.x, "LB") } : { t: "rule", r: "scan" };
        else if (!b.blk) pre = { t: "rule", r: "checkrel" };
      }
      keys[lab] = { pre, auto: true };
      /* soft post-stunt: climb for interior, fan for edges */
      if (b.ol && (lab === "LG" || lab === "RG" || lab === "C")) {
        keys[lab].post = { t: "rule", r: "climb", auto: true };
      } else if (b.ol && (lab === "LT" || lab === "RT")) {
        keys[lab].post = { t: "rule", r: "fan", auto: true };
      }
    });

    return {
      v: 1,
      front: front,
      note: "Auto from " + (prot || "protection") + (front ? (" vs " + front) : "") + " — tap to edit",
      n: defs.length,
      keys: keys,
      auto: true
    };
  }

  function mergeOlKeys(existing, derived) {
    if (!derived) return { ol: existing || null, filled: 0 };
    if (existing && existing.keys && Object.keys(existing.keys).length) {
      /* fill only missing blocker labs */
      const out = JSON.parse(JSON.stringify(existing));
      out.keys = out.keys || {};
      let filled = 0;
      Object.keys(derived.keys || {}).forEach(lab => {
        if (out.keys[lab] && (out.keys[lab].pre || out.keys[lab].post)) return;
        out.keys[lab] = derived.keys[lab];
        filled++;
      });
      if (!out.front && derived.front) out.front = derived.front;
      if (!out.note && derived.note) out.note = derived.note;
      out.n = out.n || derived.n;
      return { ol: out, filled };
    }
    return { ol: derived, filled: Object.keys(derived.keys || {}).length };
  }

  /* ---------- Validation harness vs built-in truth ---------- */
  function conceptToPlay(c, forceId) {
    const id = forceId || c.id;
    return {
      name: c.name, family: c.name, concept: id,
      players: (c.recv || []).concat(c.back ? [c.back] : []).map((p, i) => ({
        id: i, lab: p.lab, x: p.x, y: p.y, type: p.lab === "RB" ? "rb" : "route",
        rname: (p.route || "").toLowerCase(),
        route: [{ x: p.x, y: p.y - (p.lab === "RB" ? 40 : 120) }]
      }))
    };
  }

  function validateBuiltins(concepts) {
    const report = { ok: true, results: [] };
    if (!concepts || !concepts.length) {
      /* Self-check: force each concept id through deriveReads with synthetic labs from truth prog */
      Object.keys(BUILTIN_TRUTH).forEach(id => {
        const truth = BUILTIN_TRUTH[id];
        const labs = truth.prog || ["X", "H", "Y", "Z"];
        const play = {
          name: id, concept: id,
          players: labs.map((lab, i) => ({
            id: i, lab, x: 200 + i * 150, y: 380, type: lab === "RB" ? "rb" : "route",
            rname: "hitch", route: [{ x: 200 + i * 150, y: 280 }]
          }))
        };
        const derived = deriveReads(play);
        let miss = 0;
        const detail = [];
        COVERAGES.forEach(cov => {
          const exp = truth.reads[cov] && truth.reads[cov].t;
          const got = derived && derived.reads[cov] && derived.reads[cov].t;
          if (exp !== got) { miss++; detail.push(cov + ": want " + exp + " got " + got); }
        });
        report.results.push({ id, miss, pass: miss === 0, detail });
        if (miss) report.ok = false;
      });
      return report;
    }
    concepts.forEach(c => {
      const id = c.id;
      const truth = BUILTIN_TRUTH[id];
      if (!truth) { report.results.push({ id, pass: true, skip: true }); return; }
      /* Prefer live concept.reads as expected targets when present */
      const expected = (c.reads && Object.keys(c.reads).length) ? c.reads : truth.reads;
      const derived = deriveReads(conceptToPlay(c, id));
      let miss = 0;
      const detail = [];
      COVERAGES.forEach(cov => {
        const exp = expected[cov] && expected[cov].t;
        const got = derived && derived.reads[cov] && derived.reads[cov].t;
        if (exp !== got) { miss++; detail.push(cov + ": want " + exp + " got " + got); }
      });
      report.results.push({ id, name: c.name, miss, pass: miss === 0, detail });
      if (miss) report.ok = false;
    });
    return report;
  }

  root.OFFGRD_AUTODERIVE = {
    COVERAGES, OLRULES, BUILTIN_TRUTH,
    isAutoderive, classifyRoute, classifyPlay, detectConcept,
    deriveReads, mergeReads, deriveOlKeys, mergeOlKeys, validateBuiltins,
    normalizePlay
  };
})(typeof window !== "undefined" ? window : globalThis);
