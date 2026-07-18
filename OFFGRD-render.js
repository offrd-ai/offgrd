/* ============================================================
   OFFGRD-render.js — shared diagram renderer (Playbook designer SoT)
   Step 2 engine unification: one field/route/coverage/animation for
   Playbook + Reps Lab. Operates on designer play `data`.

   Flag (QB only; default OFF):
     ?unified=1|0  |  localStorage.offgrd_unified_render=1|0  |  OFFGRD_CONFIG.unifiedRender
   ============================================================ */
(function (root) {
  "use strict";

  const LOS = 380, W = 1000, H = 640;
  const DLAND = {
    L3: { x: 200, y: 150 }, M3: { x: 500, y: 140 }, R3: { x: 800, y: 150 },
    HL: { x: 310, y: 165 }, HR: { x: 690, y: 165 },
    Q1: { x: 170, y: 165 }, Q2: { x: 405, y: 150 }, Q3: { x: 595, y: 150 }, Q4: { x: 830, y: 165 },
    FL: { x: 155, y: 330 }, FR: { x: 845, y: 330 },
    CL: { x: 280, y: 288 }, CR: { x: 720, y: 288 },
    HKL: { x: 425, y: 272 }, HKR: { x: 575, y: 272 }, HKM: { x: 500, y: 272 }, MID: { x: 500, y: 150 }
  };
  const GCOL = { DL: "#9aa4b2", LB: "#b8860b", DB: "#13294B" };
  const LAB = { DE: "DE", DT: "DT", NT: "NT", WLB: "W", MLB: "M", SLB: "S", ILB: "I", OLB: "O", LCB: "CB", RCB: "CB", FS: "FS", SS: "SS", NB: "N" };

  /* ---- Team Position Glossary (display-only; canonical keys untouched) ---- */
  const DEFAULT_POS_GLOSSARY = {
    off: {
      QB: "QB", RB: "RB", FB: "FB", X: "X", Y: "Y", Z: "Z", H: "H", F: "F", TE: "TE",
      LT: "LT", LG: "LG", C: "C", RG: "RG", RT: "RT", A: "A", U: "U", W: "W", B: "B"
    },
    def: {
      DE: "DE", DT: "DT", NT: "NT", W: "W", M: "M", S: "S", I: "I", O: "O",
      CB: "CB", FS: "FS", SS: "SS", N: "N",
      WLB: "W", MLB: "M", SLB: "S", ILB: "I", OLB: "O", LCB: "CB", RCB: "CB", NB: "N"
    }
  };
  let _posGlossary = null;

  function cloneGlossary(g) {
    return {
      off: Object.assign({}, DEFAULT_POS_GLOSSARY.off, (g && g.off) || {}),
      def: Object.assign({}, DEFAULT_POS_GLOSSARY.def, (g && g.def) || {})
    };
  }
  function getPosGlossary() {
    if (!_posGlossary) _posGlossary = cloneGlossary(null);
    return _posGlossary;
  }
  function setPosGlossary(g) {
    _posGlossary = cloneGlossary(g || null);
    return _posGlossary;
  }
  /** Display label for a canonical position key. side: "off"|"def"|null (auto). */
  function POSLABEL(pos, side) {
    if (pos == null || pos === "") return "";
    const raw = String(pos);
    const viaLab = LAB[raw] || raw;
    const g = getPosGlossary();
    if (side === "off") return g.off[viaLab] || g.off[raw] || viaLab;
    if (side === "def") return g.def[viaLab] || g.def[raw] || viaLab;
    /* auto — pass side when possible; W is the only off/def overlap */
    if (LAB[raw]) return g.def[viaLab] || viaLab;
    const offOnly = { QB: 1, RB: 1, FB: 1, X: 1, Y: 1, Z: 1, H: 1, F: 1, TE: 1, LT: 1, LG: 1, C: 1, RG: 1, RT: 1, A: 1, U: 1, B: 1 };
    const defOnly = { DE: 1, DT: 1, NT: 1, CB: 1, FS: 1, SS: 1, N: 1, I: 1, O: 1, M: 1, S: 1 };
    if (offOnly[viaLab]) return g.off[viaLab] || viaLab;
    if (defOnly[viaLab]) return g.def[viaLab] || viaLab;
    if (viaLab === "W") return g.def.W || g.off.W || "W";
    return g.off[viaLab] || g.def[viaLab] || viaLab;
  }
  /** Tooltip "Will (Buck)" when custom ≠ canonical. */
  function POSLABELtip(pos, side) {
    const raw = String(pos == null ? "" : pos);
    const canon = LAB[raw] || raw;
    const shown = POSLABEL(raw, side);
    if (!shown || shown === canon) return canon;
    return canon + " (" + shown + ")";
  }
  function tokenFontSize(label, base) {
    const n = String(label || "").length;
    const b = base || 12;
    if (n <= 3) return String(b);
    if (n <= 5) return String(Math.max(8, b - 2));
    return String(Math.max(7, b - 3.5));
  }

  const DFRONTS = {
    "4-3": [{ pos: "DE", x: 360 }, { pos: "DT", x: 455 }, { pos: "DT", x: 545 }, { pos: "DE", x: 640 }].map(d => ({ pos: d.pos, x: d.x, y: 358, group: "DL" }))
      .concat([{ pos: "WLB", x: 400, y: 316 }, { pos: "MLB", x: 500, y: 312 }, { pos: "SLB", x: 600, y: 316 }].map(d => ({ pos: d.pos, x: d.x, y: d.y, group: "LB" })))
      .concat([{ pos: "LCB", x: 120, y: 350 }, { pos: "RCB", x: 880, y: 350 }, { pos: "FS", x: 430, y: 205 }, { pos: "SS", x: 570, y: 205 }].map(d => ({ pos: d.pos, x: d.x, y: d.y, group: "DB" }))),
    "3-4": [{ pos: "DE", x: 410 }, { pos: "NT", x: 500 }, { pos: "DE", x: 590 }].map(d => ({ pos: d.pos, x: d.x, y: 358, group: "DL" }))
      .concat([{ pos: "OLB", x: 345, y: 330 }, { pos: "ILB", x: 455, y: 314 }, { pos: "ILB", x: 545, y: 314 }, { pos: "OLB", x: 655, y: 330 }].map(d => ({ pos: d.pos, x: d.x, y: d.y, group: "LB" })))
      .concat([{ pos: "LCB", x: 120, y: 350 }, { pos: "RCB", x: 880, y: 350 }, { pos: "FS", x: 430, y: 205 }, { pos: "SS", x: 570, y: 205 }].map(d => ({ pos: d.pos, x: d.x, y: d.y, group: "DB" }))),
    "Nickel": [{ pos: "DE", x: 360 }, { pos: "DT", x: 455 }, { pos: "DT", x: 545 }, { pos: "DE", x: 640 }].map(d => ({ pos: d.pos, x: d.x, y: 358, group: "DL" }))
      .concat([{ pos: "WLB", x: 445, y: 316 }, { pos: "MLB", x: 555, y: 316 }].map(d => ({ pos: d.pos, x: d.x, y: d.y, group: "LB" })))
      .concat([{ pos: "LCB", x: 120, y: 350 }, { pos: "NB", x: 250, y: 332 }, { pos: "RCB", x: 880, y: 350 }, { pos: "FS", x: 430, y: 205 }, { pos: "SS", x: 570, y: 205 }].map(d => ({ pos: d.pos, x: d.x, y: d.y, group: "DB" }))),
    "4-2-5": [{ pos: "DE", x: 360 }, { pos: "DT", x: 455 }, { pos: "DT", x: 545 }, { pos: "DE", x: 640 }].map(d => ({ pos: d.pos, x: d.x, y: 358, group: "DL" }))
      .concat([{ pos: "ILB", x: 455, y: 318 }, { pos: "ILB", x: 545, y: 318 }].map(d => ({ pos: d.pos, x: d.x, y: d.y, group: "LB" })))
      .concat([{ pos: "LCB", x: 120, y: 350 }, { pos: "NB", x: 270, y: 330 }, { pos: "RCB", x: 880, y: 350 }, { pos: "FS", x: 430, y: 205 }, { pos: "SS", x: 570, y: 205 }].map(d => ({ pos: d.pos, x: d.x, y: d.y, group: "DB" }))),
    "Bear (46)": [{ pos: "DE", x: 360 }, { pos: "DT", x: 455 }, { pos: "NT", x: 500 }, { pos: "DT", x: 545 }, { pos: "DE", x: 640 }].map(d => ({ pos: d.pos, x: d.x, y: 358, group: "DL" }))
      .concat([{ pos: "SLB", x: 430, y: 316 }, { pos: "WLB", x: 570, y: 316 }].map(d => ({ pos: d.pos, x: d.x, y: d.y, group: "LB" })))
      .concat([{ pos: "LCB", x: 120, y: 350 }, { pos: "RCB", x: 880, y: 350 }, { pos: "SS", x: 500, y: 255 }, { pos: "FS", x: 500, y: 172 }].map(d => ({ pos: d.pos, x: d.x, y: d.y, group: "DB" }))),
    "3-3-5 (Tite)": [{ pos: "DE", x: 430 }, { pos: "NT", x: 500 }, { pos: "DE", x: 570 }].map(d => ({ pos: d.pos, x: d.x, y: 358, group: "DL" }))
      .concat([{ pos: "SLB", x: 360, y: 316 }, { pos: "MLB", x: 500, y: 316 }, { pos: "WLB", x: 640, y: 316 }].map(d => ({ pos: d.pos, x: d.x, y: d.y, group: "LB" })))
      .concat([{ pos: "LCB", x: 120, y: 350 }, { pos: "NB", x: 250, y: 330 }, { pos: "RCB", x: 880, y: 350 }, { pos: "FS", x: 430, y: 200 }, { pos: "SS", x: 570, y: 200 }].map(d => ({ pos: d.pos, x: d.x, y: d.y, group: "DB" }))),
    "Dime (4-1-6)": [{ pos: "DE", x: 360 }, { pos: "DT", x: 455 }, { pos: "DT", x: 545 }, { pos: "DE", x: 640 }].map(d => ({ pos: d.pos, x: d.x, y: 358, group: "DL" }))
      .concat([{ pos: "MLB", x: 500, y: 316 }].map(d => ({ pos: d.pos, x: d.x, y: d.y, group: "LB" })))
      .concat([{ pos: "LCB", x: 120, y: 350 }, { pos: "NB", x: 250, y: 330 }, { pos: "NB", x: 750, y: 330 }, { pos: "RCB", x: 880, y: 350 }, { pos: "FS", x: 430, y: 200 }, { pos: "SS", x: 570, y: 200 }].map(d => ({ pos: d.pos, x: d.x, y: d.y, group: "DB" })))
  };

  /* Yard-model routes (Reps Lab legacy) — used only by yardToData for built-in conversion */
  const YARD_ROUTES = {
    Hitch: [{ lat: 0, dep: 6 }, { lat: 0, dep: 5 }],
    Slant: [{ lat: -1, dep: 1.5 }, { lat: -9, dep: 6 }],
    Out: [{ lat: 0, dep: 10 }, { lat: 9, dep: 10 }],
    Corner: [{ lat: 0, dep: 10 }, { lat: 9, dep: 18 }],
    Post: [{ lat: 0, dep: 10 }, { lat: -9, dep: 18 }],
    Go: [{ lat: 0, dep: 22 }],
    Seam: [{ lat: -1, dep: 20 }],
    Dig: [{ lat: 0, dep: 12 }, { lat: -16, dep: 12 }],
    Curl: [{ lat: 0, dep: 12 }, { lat: 1, dep: 10 }],
    Comeback: [{ lat: 0, dep: 14 }, { lat: 4, dep: 12 }],
    Flat: [{ lat: 6, dep: 1 }, { lat: 11, dep: 3 }],
    Stick: [{ lat: 0, dep: 6 }, { lat: 5, dep: 5 }],
    Cross: [{ lat: -6, dep: 3 }, { lat: -24, dep: 6 }]
  };
  const PPY = 11;
  const OLD_LOS = 360; /* pre-unification Reps viewBox LOS */

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]));
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function isUnified() {
    try {
      const q = location.search || "";
      if (/[?&]unified=0(?:&|$)/.test(q)) return false;
      if (/[?&]unified=1(?:&|$)/.test(q)) return true;
      const ls = localStorage.getItem("offgrd_unified_render");
      if (ls === "0") return false;
      if (ls === "1") return true;
      if (root.OFFGRD_CONFIG && root.OFFGRD_CONFIG.unifiedRender) return true;
    } catch (e) {}
    return false;
  }

  function assignCoverage(defs, cov, skillPlayers) {
    defs.forEach(d => {
      if (d.group === "DL") { d.role = "rush"; return; }
      d.role = "zone"; d.manId = null; d.dx = d.x; d.dy = Math.max(150, d.y - 110);
    });
    const dbs = defs.filter(d => d.group === "DB");
    const isCB = d => {
      const pos = String(d.pos || "");
      const lab = String(d.lab || "").toUpperCase();
      return pos === "LCB" || pos === "RCB" || lab === "CB";
    };
    const isNB = d => {
      const pos = String(d.pos || "");
      const lab = String(d.lab || "").toUpperCase();
      return pos === "NB" || lab === "N" || lab === "NB";
    };
    const isSaf = d => {
      const pos = String(d.pos || "");
      const lab = String(d.lab || "").toUpperCase();
      return pos === "FS" || pos === "SS" || lab === "FS" || lab === "SS" || lab === "S" || lab === "F";
    };
    let cbs = dbs.filter(isCB).sort((a, b) => a.x - b.x);
    let nbs = dbs.filter(isNB).sort((a, b) => a.x - b.x);
    let safs = dbs.filter(isSaf).sort((a, b) => a.x - b.x);
    const classified = new Set([...cbs, ...nbs, ...safs]);
    dbs.filter(d => !classified.has(d)).forEach(d => {
      if (d.y <= 280) safs.push(d);
      else if (d.y > 320) cbs.push(d);
      else nbs.push(d);
    });
    cbs.sort((a, b) => a.x - b.x);
    nbs.sort((a, b) => a.x - b.x);
    safs.sort((a, b) => a.x - b.x);
    const lbs = defs.filter(d => d.group === "LB").sort((a, b) => a.x - b.x);
    const Z = (d, k) => { if (!d || !DLAND[k]) return; d.role = "zone"; d.dx = DLAND[k].x; d.dy = DLAND[k].y; };
    const M = (d) => { if (!d) return; d.role = "man"; };
    const nearestLand = (d, keys) => {
      let best = keys[0], bd = 1e9;
      keys.forEach(k => {
        const L = DLAND[k]; if (!L) return;
        const dd = Math.hypot((L.x - d.x), (L.y - d.y) * 0.55);
        if (dd < bd) { bd = dd; best = k; }
      });
      return best;
    };
    const assignNearest = (arr, keys) => {
      const pool = keys.slice();
      arr.slice().sort((a, b) => a.x - b.x).forEach(d => {
        if (!pool.length) { Z(d, keys[keys.length - 1]); return; }
        let bestI = 0, bd = 1e9;
        pool.forEach((k, i) => {
          const L = DLAND[k]; if (!L) return;
          const dd = Math.hypot((L.x - d.x), (L.y - d.y) * 0.5);
          if (dd < bd) { bd = dd; bestI = i; }
        });
        Z(d, pool.splice(bestI, 1)[0]);
      });
    };
    const deepAndRotate = (deepKey, rotKeys) => {
      if (!safs.length) return;
      const deep = safs.slice().sort((a, b) => a.y - b.y)[0];
      Z(deep, deepKey);
      safs.filter(s => s !== deep).forEach(s => Z(s, nearestLand(s, rotKeys)));
    };
    const underKeys = {
      "Cover 3": ["FL", "CL", "HKM", "CR", "FR"],
      "Cover 2": ["CL", "HKL", "HKM", "HKR", "CR"],
      "Cover 4": ["CL", "HKL", "HKM", "HKR", "CR"],
      "Cover 6": ["CL", "HKL", "HKM", "HKR", "CR"]
    };
    const under = arr => assignNearest(arr, underKeys[cov] || ["HKM", "CL", "CR", "HKL", "HKR"]);
    if (cov === "Cover 3") {
      if (cbs[0]) Z(cbs[0], "L3");
      if (cbs.length) Z(cbs[cbs.length - 1], "R3");
      if (cbs.length > 2) under(cbs.slice(1, -1));
      deepAndRotate("M3", ["CL", "CR", "HKL", "HKR"]);
      under(lbs.concat(nbs));
    } else if (cov === "Cover 2") {
      if (cbs[0]) Z(cbs[0], "FL");
      if (cbs.length) Z(cbs[cbs.length - 1], "FR");
      assignNearest(safs, ["HL", "HR"]);
      under(lbs.concat(nbs));
    } else if (cov === "Cover 4") {
      if (cbs[0]) Z(cbs[0], "Q1");
      if (cbs.length) Z(cbs[cbs.length - 1], "Q4");
      assignNearest(safs, ["Q2", "Q3"]);
      under(lbs.concat(nbs));
    } else if (cov === "Cover 6") {
      if (cbs[0]) Z(cbs[0], "Q1");
      if (cbs.length) Z(cbs[cbs.length - 1], "FR");
      const leftSaf = safs.slice().sort((a, b) => a.x - b.x)[0];
      const rightSaf = safs.filter(s => s !== leftSaf).sort((a, b) => a.y - b.y)[0];
      if (leftSaf) Z(leftSaf, "Q2");
      if (rightSaf) Z(rightSaf, "HR");
      under(lbs.concat(nbs));
    } else if (cov === "Tampa 2") {
      if (cbs[0]) Z(cbs[0], "FL");
      if (cbs.length) Z(cbs[cbs.length - 1], "FR");
      assignNearest(safs, ["HL", "HR"]);
      const mid = lbs.slice().sort((a, b) => Math.abs(a.x - 500) - Math.abs(b.x - 500))[0];
      if (mid) Z(mid, "MID");
      assignNearest(lbs.filter(d => d !== mid).concat(nbs), ["CL", "CR", "HKL", "HKR"]);
    } else if (cov === "Cover 1") {
      cbs.forEach(M); nbs.forEach(M); lbs.forEach(M);
      if (safs.length) {
        const deep = safs.slice().sort((a, b) => a.y - b.y)[0];
        Z(deep, "MID");
        safs.filter(s => s !== deep).forEach(M);
      }
    } else if (cov === "Cover 0") {
      cbs.forEach(M); nbs.forEach(M); safs.forEach(M); lbs.forEach(M);
    } else if (cov === "2-Man") {
      cbs.forEach(M); nbs.forEach(M); lbs.forEach(M);
      assignNearest(safs, ["HL", "HR"]);
    }
    assignManMatchups(defs, skillPlayers || []);
  }

  function assignManMatchups(defs, skillPlayers) {
    const skill = (skillPlayers || []).filter(function (p) { return p && (p.type === "route" || p.type === "rb"); });
    skill.forEach(function (p, i) { if (p.id == null) p.id = "sk-" + i; });
    const manDefs = (defs || []).filter(function (d) { return d && d.role === "man"; });
    manDefs.forEach(function (d) { d.manId = null; d._rat = false; });
    if (!manDefs.length || !skill.length) return;

    const claimed = {};
    const isClaimed = function (p) { return !!(p && claimed[p.id]); };
    const claim = function (p) {
      if (!p || isClaimed(p)) return null;
      claimed[p.id] = 1;
      return p;
    };
    const dist = function (d, p) {
      const dx = (p.x || 0) - (d.x || 0);
      const dy = ((p.y || 380) - (d.y || 380)) * 0.4;
      return Math.hypot(dx, dy);
    };
    const nearestUnclaimed = function (def, pool) {
      let best = null, bd = 1e9;
      (pool || []).forEach(function (p) {
        if (isClaimed(p)) return;
        const dd = dist(def, p);
        if (dd < bd) { bd = dd; best = p; }
      });
      return claim(best);
    };

    /* Outside-in per side: #1 = outermost, #2 = next, … Backs are their own bucket. */
    const left = skill.filter(function (p) { return p.type !== "rb" && (p.x || 0) < 500; }).sort(function (a, b) { return (a.x || 0) - (b.x || 0); });
    const right = skill.filter(function (p) { return p.type !== "rb" && (p.x || 0) >= 500; }).sort(function (a, b) { return (b.x || 0) - (a.x || 0); });
    const backs = skill.filter(function (p) { return p.type === "rb"; });
    const wrSkill = skill.filter(function (p) { return p.type !== "rb"; });
    const sideOf = function (d) { return (d.x || 0) < 500 ? "L" : "R"; };
    const bucket = function (side) { return side === "L" ? left : right; };

    const isCB = function (d) {
      const pos = String(d.pos || "");
      return pos === "LCB" || pos === "RCB" || (d.group === "DB" && String(d.lab || "") === "CB");
    };
    const isNB = function (d) {
      const pos = String(d.pos || "");
      const lab = String(d.lab || "");
      return pos === "NB" || lab === "N" || lab === "NB";
    };
    const isSaf = function (d) {
      const pos = String(d.pos || "");
      const lab = String(d.lab || "");
      return pos === "FS" || pos === "SS" || lab === "FS" || lab === "SS";
    };

    /* Pass 1 — CBs → #1 on their side */
    manDefs.filter(isCB).sort(function (a, b) { return (a.x || 0) - (b.x || 0); }).forEach(function (d) {
      const b = bucket(sideOf(d));
      const target = b.find(function (p) { return !isClaimed(p); });
      const hit = claim(target) || nearestUnclaimed(d, wrSkill);
      if (hit) d.manId = hit.id;
    });

    /* Pass 2 — Nickel → #2 / slot on their side */
    manDefs.filter(isNB).sort(function (a, b) { return (a.x || 0) - (b.x || 0); }).forEach(function (d) {
      const b = bucket(sideOf(d));
      var target = (b[1] && !isClaimed(b[1])) ? b[1] : b.find(function (p) { return !isClaimed(p); });
      const hit = claim(target) || nearestUnclaimed(d, wrSkill);
      if (hit) d.manId = hit.id;
    });

    /* Pass 3 — man safeties → #3 / TE remaining on side, then backs */
    manDefs.filter(isSaf).forEach(function (d) {
      const b = bucket(sideOf(d));
      const target = b.find(function (p) { return !isClaimed(p); });
      const hit = claim(target) || nearestUnclaimed(d, backs) || nearestUnclaimed(d, skill);
      if (hit) d.manId = hit.id;
    });

    /* Pass 4 — man LBs → nearest remaining skill / back */
    manDefs.filter(function (d) { return d.group === "LB"; }).forEach(function (d) {
      const hit = nearestUnclaimed(d, skill);
      if (hit) d.manId = hit.id;
    });

    /* Pass 5 — any leftover man def still unmatched */
    manDefs.filter(function (d) { return d.manId == null; }).forEach(function (d) {
      const hit = nearestUnclaimed(d, skill);
      if (hit) d.manId = hit.id;
    });

    /* Unmatched man → rat/robber in the hole (not a phantom double) */
    manDefs.filter(function (d) { return d.manId == null; }).forEach(function (d) {
      d._rat = true;
      d.dx = DLAND.HKM.x;
      d.dy = DLAND.HKM.y;
    });
  }

  function placeDefenseOn(state, front, cov) {
    if (!state) return state;
    if (front === "none" || !front) {
      state.defs = []; state.front = "none"; state.coverage = cov || "none"; return state;
    }
    state.defs = (DFRONTS[front] || []).map((d, i) => ({
      idx: i, pos: d.pos, group: d.group, x: d.x, y: d.y, lab: LAB[d.pos] || d.pos,
      role: "zone", dx: d.x, dy: Math.max(150, d.y - 110), manId: null, color: GCOL[d.group], route: []
    }));
    state.front = front; state.coverage = cov || "none";
    const skill = (state.players || []).filter(p => p.type === "route" || p.type === "rb");
    if (cov && cov !== "none") assignCoverage(state.defs, cov, skill);
    return state;
  }

  function zoneShapes(cov) {
    const T = "rgba(36,150,128,.30)", S = "rgba(120,230,200,.55)", D = DLAND;
    const ell = (c, rx, ry, t) => `<ellipse cx="${c.x}" cy="${c.y}" rx="${rx}" ry="${ry}" fill="${T}" stroke="${S}" stroke-width="2"/><text x="${c.x}" y="${c.y + 4}" font-size="13" font-weight="800" fill="#d9fff3" text-anchor="middle">${t}</text>`;
    const rc = (x, y, w, h, t) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${T}" stroke="${S}" stroke-width="2"/><text x="${x + w / 2}" y="${y + h / 2 + 4}" font-size="11" font-weight="800" fill="#d9fff3" text-anchor="middle">${t}</text>`;
    if (cov === "Cover 3") return ell(D.L3, 150, 62, "DEEP ⅓") + ell(D.M3, 150, 62, "DEEP ⅓") + ell(D.R3, 150, 62, "DEEP ⅓") + rc(120, 282, 210, 60, "FLAT") + rc(360, 282, 130, 60, "HOOK") + rc(510, 282, 130, 60, "HOOK") + rc(670, 282, 210, 60, "FLAT");
    if (cov === "Cover 2") return ell(D.HL, 235, 72, "DEEP ½") + ell(D.HR, 235, 72, "DEEP ½") + rc(120, 282, 170, 60, "FLAT") + rc(300, 282, 120, 60, "HOOK") + rc(430, 282, 120, 60, "HOOK") + rc(560, 282, 120, 60, "HOOK") + rc(710, 282, 170, 60, "FLAT");
    if (cov === "Cover 4") return ell(D.Q1, 118, 58, "¼") + ell(D.Q2, 118, 58, "¼") + ell(D.Q3, 118, 58, "¼") + ell(D.Q4, 118, 58, "¼") + rc(220, 292, 180, 52, "HOOK") + rc(410, 292, 180, 52, "HOOK") + rc(600, 292, 180, 52, "HOOK");
    if (cov === "Cover 6") return ell(D.Q1, 118, 58, "¼") + ell(D.Q2, 118, 58, "¼") + ell(D.HR, 235, 72, "DEEP ½") + rc(120, 282, 150, 60, "CURL") + rc(360, 282, 200, 60, "HOOK") + rc(700, 282, 180, 60, "FLAT");
    if (cov === "Tampa 2") return ell(D.HL, 235, 72, "DEEP ½") + ell(D.HR, 235, 72, "DEEP ½") + ell({ x: 500, y: 235 }, 110, 80, "POLE") + rc(120, 290, 170, 55, "FLAT") + rc(310, 290, 180, 55, "CURL") + rc(560, 290, 170, 55, "CURL") + rc(740, 290, 150, 55, "FLAT");
    if (cov === "Cover 1") return ell(D.MID, 160, 64, "DEEP MIDDLE");
    if (cov === "2-Man") return ell(D.HL, 235, 72, "DEEP ½") + ell(D.HR, 235, 72, "DEEP ½");
    return "";
  }

  /** Dashed man connectors (Show coverage) — who has who. */
  function manConnectors(defs, players) {
    const byId = {};
    (players || []).forEach(function (p) { if (p && p.id != null) byId[p.id] = p; });
    let s = "";
    (defs || []).forEach(function (d) {
      if (!d || d.role !== "man") return;
      if (d.manId == null) {
        const hx = d.dx != null ? d.dx : DLAND.HKM.x;
        const hy = d.dy != null ? d.dy : DLAND.HKM.y;
        s += `<line x1="${d.x}" y1="${d.y}" x2="${hx}" y2="${hy}" stroke="rgba(255,210,74,.55)" stroke-width="1.8" stroke-dasharray="4 4"/>`;
        s += `<circle cx="${hx}" cy="${hy}" r="16" fill="none" stroke="rgba(255,210,74,.75)" stroke-width="2" stroke-dasharray="4 3"/>`;
        s += `<text x="${hx}" y="${hy + 4}" font-size="10" font-weight="800" fill="#ffd24a" text-anchor="middle">RAT</text>`;
        return;
      }
      const r = byId[d.manId];
      if (!r) return;
      const mx = (d.x + r.x) / 2, my = (d.y + r.y) / 2;
      s += `<line x1="${d.x}" y1="${d.y}" x2="${r.x}" y2="${r.y}" stroke="rgba(255,210,74,.8)" stroke-width="2.2" stroke-dasharray="6 5"/>`;
      s += `<circle cx="${r.x}" cy="${r.y}" r="5.5" fill="rgba(255,210,74,.9)" stroke="#13294B" stroke-width="1"/>`;
      s += `<text x="${mx}" y="${my - 5}" font-size="9" font-weight="800" fill="#ffd24a" text-anchor="middle" stroke="rgba(0,0,0,.35)" stroke-width="2" paint-order="stroke">MAN</text>`;
    });
    return s;
  }

  function fieldSVG(state) {
    const ft = (state && state.field) || "High School";
    const HX = { "High School": [380, 620], "College": [420, 580], "NFL": [462, 538], "Red Zone": [420, 580], "Blank": null }[ft];
    let s = "";
    if (ft === "Red Zone") {
      s += `<rect x="20" y="20" width="960" height="98" fill="rgba(168,17,43,.32)"/>`;
      for (let gx = 40; gx <= 960; gx += 38) s += `<line x1="${gx}" y1="22" x2="${gx}" y2="118" stroke="rgba(255,255,255,.22)" stroke-width="1.5"/>`;
      s += `<text x="500" y="78" font-size="22" font-weight="800" fill="rgba(255,255,255,.65)" text-anchor="middle" letter-spacing="6">END ZONE</text><line x1="20" y1="120" x2="980" y2="120" stroke="#fff" stroke-width="4"/>`;
    }
    const SP = 53, ys = [];
    for (let y = LOS; y >= 34; y -= SP) ys.unshift(y);
    for (let y = LOS + SP; y <= 606; y += SP) ys.push(y);
    ys.forEach(y => { s += `<line x1="20" y1="${y}" x2="980" y2="${y}" stroke="rgba(255,255,255,.28)" stroke-width="2"/>`; });
    if (HX) ys.forEach(y => {
      s += `<line x1="${HX[0]}" y1="${y - 6}" x2="${HX[0]}" y2="${y + 6}" stroke="rgba(255,255,255,.5)" stroke-width="2"/><line x1="${HX[1]}" y1="${y - 6}" x2="${HX[1]}" y2="${y + 6}" stroke="rgba(255,255,255,.5)" stroke-width="2"/>`;
    });
    ys.forEach(y => {
      const yd = Math.round((LOS - y) / SP * 5);
      if (yd > 0 && yd <= 40) {
        s += `<text x="30" y="${y + 4}" font-size="13" font-weight="800" fill="rgba(255,255,255,.55)" text-anchor="middle">${yd}</text><text x="970" y="${y + 4}" font-size="13" font-weight="800" fill="rgba(255,255,255,.55)" text-anchor="middle">${yd}</text>`;
      }
    });
    s += `<line x1="20" y1="${LOS}" x2="980" y2="${LOS}" stroke="#ffd24a" stroke-width="3"/>`;
    return s;
  }

  function routeD(p) {
    if (!p || !p.route || !p.route.length) return "";
    const start = { x: p.x, y: p.y };
    let d = `M ${start.x} ${start.y}`, prev = start;
    p.route.forEach(a => {
      if (a.cx != null) d += ` Q ${a.cx} ${a.cy} ${a.x} ${a.y}`;
      else d += ` L ${a.x} ${a.y}`;
      prev = { x: a.x, y: a.y };
    });
    return d;
  }
  function routePath(p) {
    const d = routeD(p); if (!d) return "";
    const col = p.color || "#bfe3ff";
    return `<path d="${d}" fill="none" stroke="${col}" stroke-width="3.5" marker-end="url(#arr)"/>`;
  }
  function motionPath(p) {
    if (!p.motion || !p.motion.length) return "";
    let d = `M ${p.x} ${p.y}`;
    p.motion.forEach(m => d += ` L ${m.x} ${m.y}`);
    return `<path d="${d}" fill="none" stroke="#ffd24a" stroke-width="2.5" stroke-dasharray="7 5"/>`;
  }
  function pColor(p) {
    return p.color || (p.type === "block" ? "#9aa4b2" : p.type === "qb" ? "#13294B" : p.type === "rb" ? "#c8102e" : "#4B9CD3");
  }
  function blockGlyph(p, x, y) {
    const t = p.runblk.type, dir = p.runblk.dir || 0, ins = (x < 500 ? 1 : -1), out = (x < 500 ? -1 : 1);
    const P = a => `<polyline points="${a.map(q => q[0] + "," + q[1]).join(" ")}" fill="none" stroke="#fff" stroke-width="3" marker-end="url(#blk)"/>`;
    const L = (x1, y1, x2, y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#fff" stroke-width="3" marker-end="url(#blk)"/>`;
    if (t === "base") return `<line x1="${x}" y1="${y - 13}" x2="${x}" y2="${y - 31}" stroke="#fff" stroke-width="3"/><line x1="${x - 9}" y1="${y - 31}" x2="${x + 9}" y2="${y - 31}" stroke="#fff" stroke-width="3"/>`;
    if (t === "reach") return P([[x, y - 13], [x + dir * 9, y - 27], [x + dir * 30, y - 27]]);
    if (t === "down") return L(x, y - 13, x + ins * 26, y - 27);
    if (t === "kick") return L(x, y - 13, x + out * 28, y - 22);
    if (t === "pull") return P([[x, y + 12], [x, y + 17], [x + dir * 74, y + 12], [x + dir * 98, y - 42]]);
    if (t === "combo") return P([[x, y - 13], [x, y - 30], [x + dir * 16, y - 48]]);
    return "";
  }
  function wrapAnimToken(inner, animId, x, y) {
    if (!animId) return inner;
    return `<g data-anim-id="${esc(String(animId))}" data-rest-x="${x}" data-rest-y="${y}">${inner}</g>`;
  }
  function playerNode(p, pos, opts) {
    opts = opts || {};
    const x = pos ? pos.x : p.x, y = pos ? pos.y : p.y;
    const selected = opts.sel && (opts.sel === p || (opts.selId != null && p.id === opts.selId));
    const ring = selected ? `<circle cx="${x}" cy="${y}" r="21" fill="none" stroke="#ffd24a" stroke-width="3"/>` : "";
    const shown = POSLABEL(p.lab, "off");
    const tip = POSLABELtip(p.lab, "off");
    const fs = tokenFontSize(shown, 12);
    let inner;
    if (p.type === "block") {
      let g = "";
      if (p.runblk) g = blockGlyph(p, x, y);
      else if (p.blk) {
        const a = (p.blk === "L" ? -0.6 : p.blk === "R" ? 0.6 : 0);
        g = `<line x1="${x}" y1="${y - 13}" x2="${x + 18 * a}" y2="${y - 31}" stroke="#fff" stroke-width="3"/>`;
      }
      inner = ring + g + `<rect x="${x - 13}" y="${y - 13}" width="26" height="26" rx="5" fill="${pColor(p)}" stroke="#fff" stroke-width="2"><title>${esc(tip)}</title></rect><text x="${x}" y="${y + 4}" font-size="${fs}" font-weight="800" fill="#fff" text-anchor="middle">${esc(shown || "")}</text>`;
    } else {
      const tap = opts.quiz ? ` data-lab="${esc(p.lab || "")}" style="cursor:pointer"` : "";
      inner = ring + `<g${tap}><title>${esc(tip)}</title><circle cx="${x}" cy="${y}" r="16" fill="${pColor(p)}" stroke="#fff" stroke-width="2"/><text x="${x}" y="${y + 4}" font-size="${fs}" font-weight="800" fill="#fff" text-anchor="middle">${esc(shown || "")}</text></g>`;
    }
    return wrapAnimToken(inner, opts.animId, x, y);
  }
  function defNode(d, pos, opts) {
    opts = opts || {};
    const x = pos ? pos.x : d.x, y = pos ? pos.y : d.y;
    const selected = opts.sel && (opts.sel === d || (opts.selId != null && (d.id === opts.selId || d.idx === opts.selId)));
    const ring = selected ? `<circle cx="${x}" cy="${y}" r="19" fill="none" stroke="#ffd24a" stroke-width="3"/>` : "";
    const ar = (d.role === "rush") ? `<line x1="${x}" y1="${y + 14}" x2="${x}" y2="${y + 40}" stroke="#ff6b81" stroke-width="3" marker-end="url(#rush)"/>` : "";
    const shown = POSLABEL(d.lab || d.pos, "def");
    const tip = POSLABELtip(d.lab || d.pos, "def");
    const fs = tokenFontSize(shown, 10.5);
    const inner = ar + ring + `<g><title>${esc(tip)}</title><circle cx="${x}" cy="${y}" r="14" fill="${d.color || "#13294B"}" stroke="#fff" stroke-width="2"/><text x="${x}" y="${y + 4}" font-size="${fs}" font-weight="800" fill="#fff" text-anchor="middle">${esc(shown || "D")}</text></g>`;
    return wrapAnimToken(inner, opts.animId, x, y);
  }
  function textNode(t) {
    return `<text x="${t.x}" y="${t.y}" font-size="${t.size}" font-weight="800" fill="${t.color}" stroke="rgba(255,255,255,.5)" stroke-width="0.6" paint-order="stroke" text-anchor="middle">${esc(t.text)}</text>`;
  }
  function drawNode(d) {
    return `<polyline points="${d.pts.map(p => p.x + "," + p.y).join(" ")}" fill="none" stroke="${d.color}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  function segMid(prev, a) {
    return a.cx != null ? { x: a.cx, y: a.cy } : { x: (prev.x + a.x) / 2, y: (prev.y + a.y) / 2 };
  }
  function handles(p) {
    if (!p || !p.route) return "";
    let s = "", prev = { x: p.x, y: p.y };
    p.route.forEach(a => { const m = segMid(prev, a); s += `<circle cx="${m.x}" cy="${m.y}" r="7" fill="#cbd5e1" stroke="#13294B" stroke-width="1.5"/>`; prev = { x: a.x, y: a.y }; });
    p.route.forEach(a => { s += `<circle cx="${a.x}" cy="${a.y}" r="8" fill="#19c37d" stroke="#fff" stroke-width="2"/>`; });
    return s;
  }
  function routeEnd(p) {
    if (p.route && p.route.length) { const a = p.route[p.route.length - 1]; return { x: a.x, y: a.y }; }
    return { x: p.x, y: p.y };
  }
  function quizTargets(state, revealLab) {
    let s = "";
    (state.players || []).filter(p => p.type === "route" || p.type === "rb").forEach(p => {
      const end = routeEnd(p);
      const isR = revealLab && p.lab === revealLab;
      const shown = POSLABEL(p.lab, "off");
      s += `<g data-lab="${esc(p.lab || "")}" style="cursor:pointer"><title>${esc(POSLABELtip(p.lab, "off"))}</title><circle cx="${end.x}" cy="${end.y}" r="19" fill="${isR ? "rgba(25,195,125,.9)" : "rgba(255,255,255,.18)"}" stroke="${isR ? "#0b6b3f" : "#fff"}" stroke-width="2.5"/><text x="${end.x}" y="${end.y + 5}" font-size="${tokenFontSize(shown, 14)}" font-weight="900" fill="#fff" text-anchor="middle">${esc(shown || "")}</text></g>`;
    });
    return s;
  }

  function markerDefs() {
    return `<defs><marker id="arr" markerWidth="9" markerHeight="9" refX="6" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 z" fill="#bfe3ff"/></marker><marker id="rush" markerWidth="9" markerHeight="9" refX="6" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 z" fill="#ff6b81"/></marker><marker id="blk" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto"><rect x="0" y="1" width="7" height="6" fill="#fff"/></marker></defs>`;
  }

  /** Build SVG markup for a designer play state. */
  function renderMarkup(state, opts) {
    opts = opts || {};
    let s = markerDefs();
    if (state && state.bg) s += `<image href="${state.bg}" x="0" y="0" width="1000" height="640" opacity="${state.bgOpacity != null ? state.bgOpacity : 0.5}" preserveAspectRatio="xMidYMid slice"/>`;
    s += fieldSVG(state);
    if (!state) return s;
    const showZ = opts.showZones != null ? opts.showZones : (state.showZones && state.coverage && state.coverage !== "none");
    const cov = opts.hideCov ? null : (opts.coverage || state.coverage);
    if (showZ && cov && cov !== "none") s += zoneShapes(cov);
    if (state.draws) state.draws.forEach(d => { if (d.pts && d.pts.length > 1) s += drawNode(d); });
    const anim = !!opts.anim;
    const tokenAnim = !!opts.tokenAnim;
    const op = anim ? 0.35 : 1;
    const players = state.players || [], defs = state.defs || [];
    s += `<g opacity="${op}">`;
    players.forEach(p => { s += motionPath(p); s += routePath(p); });
    defs.forEach(d => { if (d.route && d.route.length) s += routePath(d); });
    s += `</g>`;
    /* Man matchup connectors under tokens when Show coverage is on (Cover 0 / 1 / 2-Man). */
    if (showZ && !anim && cov && (cov === "Cover 0" || cov === "Cover 1" || cov === "2-Man")) {
      s += manConnectors(defs, players);
    }
    /* tokenAnim: paint at rest; play() moves via transform (never rebuilds SVG per frame). */
    defs.forEach((d, i) => {
      const pos = (!tokenAnim && anim) ? (d._ap || { x: d.x, y: d.y }) : null;
      s += defNode(d, pos, { sel: opts.sel, selId: opts.selId, animId: tokenAnim ? ("d_" + i) : null });
    });
    players.forEach((p, i) => {
      const pos = (!tokenAnim && anim) ? (p._ap || { x: p.x, y: p.y }) : null;
      s += playerNode(p, pos, {
        sel: opts.sel, selId: opts.selId, quiz: !!opts.quiz && !anim,
        animId: tokenAnim ? ("p_" + (p.id != null ? p.id : i)) : null
      });
    });
    if (!anim && opts.sel && opts.showHandles !== false) s += handles(opts.sel);
    if (state.texts) state.texts.forEach(t => { s += textNode(t); });
    if (opts.quiz && !anim) s += quizTargets(state, opts.revealLab);
    return s;
  }

  /** Paint into an SVG element. Returns the markup for callers that need it. */
  function renderState(state, opts) {
    opts = opts || {};
    const targetId = opts.targetId || "field";
    const svg = typeof targetId === "string" ? document.getElementById(targetId) : targetId;
    const markup = renderMarkup(state, opts);
    if (svg) {
      svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
      svg.innerHTML = markup;
    }
    return markup;
  }

  function flatten(p) {
    const pts = [{ x: p.x, y: p.y }]; let prev = pts[0];
    (p.route || []).forEach(a => {
      if (a.cx != null) {
        for (let t = 0.2; t < 1; t += 0.2) {
          const x = (1 - t) * (1 - t) * prev.x + 2 * (1 - t) * t * a.cx + t * t * a.x;
          const y = (1 - t) * (1 - t) * prev.y + 2 * (1 - t) * t * a.cy + t * t * a.y;
          pts.push({ x, y });
        }
        pts.push({ x: a.x, y: a.y });
      } else pts.push({ x: a.x, y: a.y });
      prev = { x: a.x, y: a.y };
    });
    return pts;
  }
  function along(pts, frac) {
    if (!pts || !pts.length) return { x: 0, y: 0 };
    if (pts.length < 2) return pts[0];
    let seg = [], tot = 0;
    for (let i = 1; i < pts.length; i++) { const L = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); seg.push(L); tot += L; }
    if (tot === 0) return pts[0];
    let target = frac * tot, acc = 0;
    for (let i = 0; i < seg.length; i++) {
      if (acc + seg[i] >= target) {
        const t = (target - acc) / seg[i];
        return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * t, y: pts[i].y + (pts[i + 1].y - pts[i].y) * t };
      }
      acc += seg[i];
    }
    return pts[pts.length - 1];
  }
  function ease(t) { return t < .5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }

  let _anim = null;
  function cancelAnim() { if (_anim) { cancelAnimationFrame(_anim); _anim = null; } }

  /**
   * Designer-identical animation: motion → snap hold → route run with man/zone/rush.
   * Renders the SVG once, then moves tokens via transform (no per-frame innerHTML).
   * Caps paint to ~30fps. opts: { targetId, onFrame, onDone, quiz, hideCov, revealLab }
   */
  function play(state, opts) {
    opts = opts || {};
    if (!state) return;
    cancelAnim();
    const players = state.players || [], defs = state.defs || [];
    players.forEach(p => { try { delete p._ap; } catch (e) { p._ap = null; } });
    defs.forEach(d => { try { delete d._ap; } catch (e) { d._ap = null; } });

    /* Static scene once — routes faded; tokens at rest with data-anim-id wrappers. */
    renderState(state, Object.assign({}, opts, { anim: true, tokenAnim: true }));

    const targetId = opts.targetId || "field";
    const svg = typeof targetId === "string" ? document.getElementById(targetId) : targetId;
    const pTok = players.map((p, i) => {
      const id = "p_" + (p.id != null ? p.id : i);
      const g = svg ? svg.querySelector('[data-anim-id="' + id + '"]') : null;
      return { p: p, g: g, x: p.x, y: p.y };
    });
    const dTok = defs.map((d, i) => {
      const g = svg ? svg.querySelector('[data-anim-id="d_' + i + '"]') : null;
      return { d: d, g: g, x: d.x, y: d.y };
    });

    const hasM = players.some(p => p.motion && p.motion.length);
    const tMo = hasM ? 900 : 0, tSnap = 220, tRun = 1600, total = tMo + tSnap + tRun;
    const mp = players.find(p => p.motion && p.motion.length);
    const qb = players.find(p => p.type === "qb");
    const FRAME_MS = 1000 / 30;
    let lastPaint = 0;
    const start = performance.now();

    function applyTransforms() {
      for (let i = 0; i < pTok.length; i++) {
        const t = pTok[i], cur = t.p._ap;
        if (!t.g || !cur) continue;
        t.g.setAttribute("transform", "translate(" + (cur.x - t.x) + " " + (cur.y - t.y) + ")");
      }
      for (let i = 0; i < dTok.length; i++) {
        const t = dTok[i], cur = t.d._ap;
        if (!t.g || !cur) continue;
        t.g.setAttribute("transform", "translate(" + (cur.x - t.x) + " " + (cur.y - t.y) + ")");
      }
    }

    function frame(now) {
      const e = now - start, opos = {};
      players.forEach(p => {
        let cur = { x: p.x, y: p.y };
        if (e < tMo) {
          if (p === mp) cur = along([{ x: p.x, y: p.y }].concat(p.motion), Math.min(1, e / tMo));
        } else if (e < tMo + tSnap) {
          if (p === mp) cur = p.motion[p.motion.length - 1];
        } else {
          const f = Math.min(1, (e - tMo - tSnap) / tRun), ef = ease(f);
          const base = (p === mp && p.motion.length) ? p.motion[p.motion.length - 1] : { x: p.x, y: p.y };
          if (p.route && p.route.length) {
            const fl = flatten(p);
            if (p === mp && p.motion.length) fl[0] = base;
            cur = along(fl, ef);
          } else if (p.type === "block") cur = { x: base.x, y: base.y - 12 * ef };
          else cur = base;
        }
        p._ap = cur; opos[p.id] = cur;
      });
      defs.forEach(d => {
        let cur = { x: d.x, y: d.y };
        if (e >= tMo + tSnap) {
          const f = Math.min(1, (e - tMo - tSnap) / tRun), ef = ease(f);
          if (d.route && d.route.length) cur = along(flatten(d), ef);
          else if (d.role === "rush") {
            const tx = qb ? qb.x : 500, ty = qb ? qb.y : 470;
            cur = { x: d.x + (tx - d.x) * ef, y: d.y + (ty - d.y) * ef };
          } else if (d.role === "man" && d.manId != null && opos[d.manId]) {
            const m = opos[d.manId];
            cur = { x: d.x + (m.x - d.x) * ef, y: d.y + (m.y - d.y) * ef };
          } else {
            cur = { x: d.x + ((d.dx != null ? d.dx : d.x) - d.x) * ef, y: d.y + ((d.dy != null ? d.dy : d.y) - d.y) * ef };
          }
        }
        d._ap = cur;
      });
      if (now - lastPaint >= FRAME_MS || e >= total) {
        lastPaint = now;
        applyTransforms();
        if (typeof opts.onFrame === "function") opts.onFrame(Math.min(1, e / total));
      }
      if (e < total) _anim = requestAnimationFrame(frame);
      else {
        _anim = null;
        applyTransforms();
        /* One final paint for quiz targets / full opacity routes — not per-frame. */
        if (opts.quiz) renderState(state, Object.assign({}, opts, { anim: false, tokenAnim: false }));
        if (typeof opts.onDone === "function") opts.onDone();
      }
    }
    _anim = requestAnimationFrame(frame);
  }

  /** True if play looks like designer data (absolute routes / players). */
  function hasPlayData(play) {
    if (!play) return false;
    const st = play.players ? play : (play.data && play.data.players ? play.data : play.data || play);
    return !!(st && Array.isArray(st.players) && st.players.length);
  }

  function normalizePlayData(play) {
    if (!play) return null;
    if (play.players) return play;
    if (play.data && play.data.players) return play.data;
    return play.data || play;
  }

  /**
   * Prepare a working copy of play data for a coverage drill:
   * ensure defs exist for the requested coverage (place a front if missing).
   */
  function prepareDrillState(play, coverage, opts) {
    opts = opts || {};
    const raw = normalizePlayData(play);
    if (!raw || !raw.players) return null;
    const st = JSON.parse(JSON.stringify(raw));
    st.bg = null;
    const cov = coverage || st.coverage || "Cover 3";
    const needPlace = !st.defs || !st.defs.length || (cov && cov !== "none" && st.coverage !== cov);
    if (needPlace && cov && cov !== "none") {
      const front = (st.front && st.front !== "none") ? st.front : (opts.front || "4-3");
      placeDefenseOn(st, front, cov);
      st.showZones = !!opts.showZones;
    } else if (st.defs && st.defs.length && cov && cov !== "none") {
      const skill = st.players.filter(p => p.type === "route" || p.type === "rb");
      assignCoverage(st.defs, cov, skill);
      st.coverage = cov;
    }
    return st;
  }

  /** Convert a yard-space named route to absolute designer points (LOS 380). */
  function yardRouteToPoints(sx, sy, name, los) {
    los = los != null ? los : LOS;
    const R = YARD_ROUTES[name] || [];
    const side = sx < 500 ? -1 : 1;
    const route = [];
    R.forEach(o => {
      route.push({
        x: clamp(sx + o.lat * PPY * side, 24, 976),
        y: los - o.dep * PPY,
        cx: null, cy: null
      });
    });
    return route;
  }

  /**
   * Convert a legacy Reps CONCEPT (yard model, LOS 360) into designer play data (LOS 380).
   * Shifts y by (LOS - OLD_LOS) so spots sit correctly on the designer field.
   */
  function yardToData(concept) {
    if (!concept) return null;
    const dy = LOS - OLD_LOS; /* +20 */
    const players = [];
    let id = 0;
    /* OL */
    [404, 452, 500, 548, 596].forEach((x, i) => {
      const labs = ["LT", "LG", "C", "RG", "RT"];
      players.push({ id: id++, lab: labs[i], x, y: LOS, type: "block", ol: 1, blk: "set", route: [], motion: [] });
    });
    players.push({ id: id++, lab: "QB", x: 500, y: 470 + dy, type: "qb", route: [], motion: [] });
    const list = (concept.recv || []).concat(concept.back ? [concept.back] : []);
    list.forEach(p => {
      const x = p.x, y = p.y + dy;
      const route = typeof p.route === "string" ? yardRouteToPoints(x, y, p.route, LOS) : (p.route || []).map(a => ({
        x: a.x, y: (a.y != null ? a.y + dy : a.y), cx: a.cx != null ? a.cx : null, cy: a.cy != null ? a.cy + dy : null
      }));
      players.push({
        id: id++, lab: p.lab, x, y,
        type: (p.lab === "RB" || p.lab === "FB") ? "rb" : "route",
        color: null, ol: 0, blk: null, route, motion: [], rname: typeof p.route === "string" ? p.route : null
      });
    });
    return {
      id: "builtin_" + (concept.id || "x"),
      name: concept.name,
      family: concept.name,
      series: "Built-in",
      formation: concept.form || "",
      field: "High School",
      front: "none",
      coverage: "none",
      showZones: false,
      players,
      defs: [],
      texts: [],
      draws: [],
      _builtin: true,
      _prog: concept.prog || null,
      _reads: concept.reads || null
    };
  }

  root.OFFGRD_RENDER = {
    LOS, W, H, DLAND, GCOL, LAB, DFRONTS, PPY, YARD_ROUTES, DEFAULT_POS_GLOSSARY,
    POSLABEL, POSLABELtip, getPosGlossary, setPosGlossary, cloneGlossary,
    isUnified, hasPlayData, normalizePlayData, prepareDrillState, yardToData, yardRouteToPoints,
    esc, fieldSVG, routeD, routePath, motionPath, playerNode, defNode, textNode, drawNode,
    zoneShapes, manConnectors, assignCoverage, assignManMatchups, placeDefenseOn, handles, segMid, flatten, along, ease,
    renderMarkup, renderState, play, cancelAnim, quizTargets, routeEnd, markerDefs, pColor, blockGlyph
  };
})(typeof window !== "undefined" ? window : globalThis);
