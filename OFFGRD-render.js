/* ============================================================
   OFFGRD-render.js — shared diagram renderer (Playbook designer SoT)
   Step 2 engine unification: one field/route/coverage/animation for
   Playbook + Reps Lab. Operates on designer play `data`.

   Flag (QB only; default OFF):
     ?unified=1  |  localStorage.offgrd_unified_render=1  |  OFFGRD_CONFIG.unifiedRender
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
      if (/[?&]unified=1(?:&|$)/.test(location.search || "")) return true;
      if (localStorage.getItem("offgrd_unified_render") === "1") return true;
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
    let cbs = dbs.filter(d => d.y > 300).sort((a, b) => a.x - b.x);
    const nbs = cbs.length > 2 ? cbs.splice(1, cbs.length - 2) : [];
    const safs = dbs.filter(d => d.y <= 300).sort((a, b) => a.x - b.x);
    const lbs = defs.filter(d => d.group === "LB").sort((a, b) => a.x - b.x);
    const Z = (d, k) => { if (!d) return; d.role = "zone"; d.dx = DLAND[k].x; d.dy = DLAND[k].y; };
    const M = (d) => { if (!d) return; d.role = "man"; };
    const under = arr => {
      const u = { "Cover 3": ["CL", "HKM", "HKR", "FR", "FL"], "Cover 2": ["CL", "HKM", "CR", "HKL", "HKR"], "Cover 4": ["HKL", "HKM", "HKR", "CL", "CR"], "Cover 6": ["CL", "HKM", "HKR", "HKL", "CR"] }[cov] || ["HKM", "CL", "CR", "HKL", "HKR"];
      arr.forEach((d, i) => Z(d, u[i % u.length]));
    };
    if (cov === "Cover 3") { Z(cbs[0], "L3"); Z(cbs[cbs.length - 1], "R3"); Z(safs[0], "M3"); Z(safs[1], "CR"); under(lbs.concat(nbs)); }
    else if (cov === "Cover 2") { Z(cbs[0], "FL"); Z(cbs[cbs.length - 1], "FR"); Z(safs[0], "HL"); Z(safs[1], "HR"); under(lbs.concat(nbs)); }
    else if (cov === "Cover 4") { Z(cbs[0], "Q1"); Z(cbs[cbs.length - 1], "Q4"); Z(safs[0], "Q2"); Z(safs[1], "Q3"); under(lbs.concat(nbs)); }
    else if (cov === "Cover 6") { Z(cbs[0], "Q1"); Z(safs[0], "Q2"); Z(cbs[cbs.length - 1], "FR"); Z(safs[1], "HR"); under(lbs.concat(nbs)); }
    else if (cov === "Tampa 2") { Z(cbs[0], "FL"); Z(cbs[cbs.length - 1], "FR"); Z(safs[0], "HL"); Z(safs[1], "HR"); const mid = lbs.slice().sort((a, b) => Math.abs(a.x - 500) - Math.abs(b.x - 500))[0]; if (mid) Z(mid, "MID"); lbs.filter(d => d !== mid).concat(nbs).forEach((d, i) => Z(d, ["CL", "CR", "HKL", "HKR"][i % 4])); }
    else if (cov === "Cover 1") { cbs.forEach(M); nbs.forEach(M); M(safs[1]); lbs.forEach(M); Z(safs[0], "MID"); }
    else if (cov === "Cover 0") { cbs.forEach(M); nbs.forEach(M); safs.forEach(M); lbs.forEach(M); }
    else if (cov === "2-Man") { cbs.forEach(M); nbs.forEach(M); lbs.forEach(M); Z(safs[0], "HL"); Z(safs[1], "HR"); }
    const skill = skillPlayers || [];
    defs.filter(d => d.role === "man").forEach(d => {
      let best = null, bd = 1e9;
      skill.forEach(p => { const dd = Math.abs(p.x - d.x); if (dd < bd) { bd = dd; best = p; } });
      d.manId = best ? best.id : null;
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
    return "";
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
  function playerNode(p, pos, opts) {
    opts = opts || {};
    const x = pos ? pos.x : p.x, y = pos ? pos.y : p.y;
    const selected = opts.sel && (opts.sel === p || (opts.selId != null && p.id === opts.selId));
    const ring = selected ? `<circle cx="${x}" cy="${y}" r="21" fill="none" stroke="#ffd24a" stroke-width="3"/>` : "";
    if (p.type === "block") {
      let g = "";
      if (p.runblk) g = blockGlyph(p, x, y);
      else if (p.blk) {
        const a = (p.blk === "L" ? -0.6 : p.blk === "R" ? 0.6 : 0);
        g = `<line x1="${x}" y1="${y - 13}" x2="${x + 18 * a}" y2="${y - 31}" stroke="#fff" stroke-width="3"/>`;
      }
      return ring + g + `<rect x="${x - 13}" y="${y - 13}" width="26" height="26" rx="5" fill="${pColor(p)}" stroke="#fff" stroke-width="2"/><text x="${x}" y="${y + 4}" font-size="12" font-weight="800" fill="#fff" text-anchor="middle">${esc(p.lab || "")}</text>`;
    }
    const tap = opts.quiz ? ` data-lab="${esc(p.lab || "")}" style="cursor:pointer"` : "";
    return ring + `<g${tap}><circle cx="${x}" cy="${y}" r="16" fill="${pColor(p)}" stroke="#fff" stroke-width="2"/><text x="${x}" y="${y + 4}" font-size="12" font-weight="800" fill="#fff" text-anchor="middle">${esc(p.lab || "")}</text></g>`;
  }
  function defNode(d, pos) {
    const x = pos ? pos.x : d.x, y = pos ? pos.y : d.y;
    const ar = (d.role === "rush") ? `<line x1="${x}" y1="${y + 14}" x2="${x}" y2="${y + 40}" stroke="#ff6b81" stroke-width="3" marker-end="url(#rush)"/>` : "";
    return ar + `<circle cx="${x}" cy="${y}" r="14" fill="${d.color || "#13294B"}" stroke="#fff" stroke-width="2"/><text x="${x}" y="${y + 4}" font-size="10.5" font-weight="800" fill="#fff" text-anchor="middle">${esc(d.lab || "D")}</text>`;
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
      s += `<g data-lab="${esc(p.lab || "")}" style="cursor:pointer"><circle cx="${end.x}" cy="${end.y}" r="19" fill="${isR ? "rgba(25,195,125,.9)" : "rgba(255,255,255,.18)"}" stroke="${isR ? "#0b6b3f" : "#fff"}" stroke-width="2.5"/><text x="${end.x}" y="${end.y + 5}" font-size="14" font-weight="900" fill="#fff" text-anchor="middle">${esc(p.lab || "")}</text></g>`;
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
    const op = anim ? 0.35 : 1;
    const players = state.players || [], defs = state.defs || [];
    s += `<g opacity="${op}">`;
    players.forEach(p => { s += motionPath(p); s += routePath(p); });
    defs.forEach(d => { if (d.route && d.route.length) s += routePath(d); });
    s += `</g>`;
    defs.forEach(d => { const pos = anim ? (d._ap || { x: d.x, y: d.y }) : null; s += defNode(d, pos); });
    players.forEach(p => {
      const pos = anim ? (p._ap || { x: p.x, y: p.y }) : null;
      s += playerNode(p, pos, { sel: opts.sel, selId: opts.selId, quiz: !!opts.quiz && !anim });
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
   * opts: { targetId, onFrame, onDone, quiz, hideCov, revealLab }
   */
  function play(state, opts) {
    opts = opts || {};
    if (!state) return;
    cancelAnim();
    const players = state.players || [], defs = state.defs || [];
    const hasM = players.some(p => p.motion && p.motion.length);
    const tMo = hasM ? 900 : 0, tSnap = 220, tRun = 1600, total = tMo + tSnap + tRun;
    const mp = players.find(p => p.motion && p.motion.length);
    const qb = players.find(p => p.type === "qb");
    const start = performance.now();
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
      renderState(state, Object.assign({}, opts, { anim: true }));
      if (typeof opts.onFrame === "function") opts.onFrame(e / total);
      if (e < total) _anim = requestAnimationFrame(frame);
      else {
        _anim = null;
        if (opts.quiz) renderState(state, Object.assign({}, opts, { anim: false }));
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
    LOS, W, H, DLAND, GCOL, LAB, DFRONTS, PPY, YARD_ROUTES,
    isUnified, hasPlayData, normalizePlayData, prepareDrillState, yardToData, yardRouteToPoints,
    esc, fieldSVG, routeD, routePath, motionPath, playerNode, defNode, textNode, drawNode,
    zoneShapes, assignCoverage, placeDefenseOn, handles, segMid, flatten, along, ease,
    renderMarkup, renderState, play, cancelAnim, quizTargets, routeEnd, markerDefs, pColor, blockGlyph
  };
})(typeof window !== "undefined" ? window : globalThis);
