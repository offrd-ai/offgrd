/**
 * Align key: coverage from def_call fields + known-correct football + degeneracy.
 *   node scripts/smoke-align-key.cjs
 *
 * Asserts ZONE RELATIONSHIP only (leverage/depth are coach-overridable).
 * Prints a 10-rep DB table so humans can read the football.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = path.join(__dirname, "..");
const keyA = path.join(root, "OFFGRD-align-key.js");
const keyB = path.join(root, "offgrd-web", "OFFGRD-align-key.js");

// offrd-ai/offgrd is a FLAT single-mirror repo (no offgrd-web/). Require only the
// top-level key; check offgrd-web drift when that mirror is present (authoring monorepo).
const hasMirror = fs.existsSync(path.join(root, "offgrd-web"));

function sha(p) {
  return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
}
function must(p) {
  if (!fs.existsSync(p)) throw new Error("missing " + p);
}

must(keyA);
if (hasMirror) {
  must(keyB);
  if (sha(keyA) !== sha(keyB)) throw new Error("OFFGRD-align-key.js drifted vs offgrd-web");
}

require(path.join(root, "OFFGRD-formations-data.js"));
require(path.join(root, "OFFGRD-render.js"));
const FC = require(path.join(root, "OFFGRD-formation-canon.js"));
const AK = require(keyA);
const RENDER = globalThis.OFFGRD_RENDER;
if (!RENDER || !RENDER.placeDefenseOn) throw new Error("OFFGRD_RENDER.placeDefenseOn missing");

function place(front, coverage, formationId) {
  const players = FC.playersFromFormation(formationId || "DOUBLES_2X2");
  const cov = AK.normalizeCoverage(coverage);
  if (!cov) throw new Error("bad coverage " + coverage);
  const state = { players: players, defs: [], front: front };
  RENDER.placeDefenseOn(state, front, cov);
  if (!state.defs.length) throw new Error("no defs for " + front);
  return { state: state, call: { name: front + " " + cov, front: front, coverage: cov }, cov: cov };
}

function findDef(defs, pred) {
  const hit = defs.findIndex((d) => d && pred(d));
  if (hit < 0) throw new Error("defender not found: " + pred);
  return hit;
}
function byPos(pos) {
  return (d) => String(d.pos || "").toUpperCase() === pos;
}
function relOf(front, coverage, posOrPred, formationId) {
  const { state, call } = place(front, coverage, formationId);
  const di =
    typeof posOrPred === "function"
      ? findDef(state.defs, posOrPred)
      : findDef(state.defs, byPos(posOrPred));
  return AK.deriveAlignAnswer(call, di, state);
}
function assertRel(label, got, allowed) {
  const ok = Array.isArray(allowed) ? allowed : [allowed];
  if (ok.indexOf(got.relationship) < 0) {
    throw new Error(
      "FOOTBALL " +
        label +
        ": got relationship=" +
        JSON.stringify(got.relationship) +
        " want one of " +
        JSON.stringify(ok)
    );
  }
}
function countRel(front, coverage, formationId) {
  const { state, call, cov } = place(front, coverage, formationId);
  const rows = [];
  state.defs.forEach((d, di) => {
    if (!d || d.group === "DL") return;
    const a = AK.deriveAlignAnswer(call, di, state);
    rows.push({
      pos: d.pos || d.lab,
      group: d.group,
      role: d.role,
      relationship: a.relationship,
      leverage: a.leverage,
      depth: a.depth,
      coverage: cov,
    });
  });
  return rows;
}

/* —— Coverage field, not name —— */
const slamNoCov = AK.resolveCallCoverage({ name: "Slam", front: "4-3" });
if (slamNoCov.ok) throw new Error("Slam without coverage field must fail resolve");
const slamOk = AK.resolveCallCoverage({ name: "Slam", front: "4-3", coverage: "Cover 1" });
if (!slamOk.ok || slamOk.coverage !== "Cover 1") throw new Error("Slam+Cover 1 resolve failed");
let threw = false;
try {
  AK.deriveAlignAnswer({ name: "Slam", front: "4-3" }, 0, {
    defs: [{ group: "DB", pos: "FS", x: 500, y: 180, dy: 180 }],
  });
} catch (e) {
  threw = /ALIGN_KEY_COVERAGE/.test(String(e && e.message));
}
if (!threw) throw new Error("derive must throw when coverage missing");

/* ========================================================================
 * 1) Known-correct ZONE RELATIONSHIP assertions
 * ======================================================================== */

/* Cover 3 */
assertRel("C3 CB", relOf("Nickel", "Cover 3", "LCB"), "deep outside third");
assertRel("C3 FS", relOf("Nickel", "Cover 3", "FS"), "deep middle");
if (relOf("Nickel", "Cover 3", "FS").relationship === "deep third") {
  throw new Error("FOOTBALL C3 FS must NOT be deep third (the v123 bug)");
}
assertRel("C3 SS", relOf("Nickel", "Cover 3", "SS"), ["curl/flat", "hook / curl"]);
assertRel("C3 NB", relOf("Nickel", "Cover 3", "NB"), ["curl/flat", "hook / curl"]);
assertRel("C3 Mike", relOf("4-3", "Cover 3", "MLB"), ["middle hook", "hook / curl"]);
/* Relationship + depth travel together — underneath cannot be deep; deep-zone cannot be press */
(function () {
  const UNDER = { "curl/flat": 1, "hook / curl": 1, "middle hook": 1, flat: 1 };
  const fronts = ["Nickel", "4-3", "4-2-5"];
  const covs = ["Cover 3", "Cover 2", "Cover 4", "Tampa 2", "Cover 6"];
  fronts.forEach((front) => {
    covs.forEach((cov) => {
      try {
        countRel(front, cov, "TRIPS_RT").forEach((row) => {
          const rel = row.relationship;
          const dep = row.depth;
          if (UNDER[rel] && (dep === "deep" || dep === "bail")) {
            throw new Error(
              "FOOTBALL " + front + " " + cov + " " + row.pos + ": " + rel + " must not be depth=" + dep
            );
          }
          if (AK.isDeepZoneRel(rel) && (dep === "press" || dep === "off")) {
            throw new Error(
              "FOOTBALL " + front + " " + cov + " " + row.pos + ": " + rel + " must not be depth=" + dep
            );
          }
        });
      } catch (e) {
        if (/no defs|ALIGN_KEY|defender not found/i.test(String(e && e.message))) return;
        throw e;
      }
    });
  });
  const ss = relOf("Nickel", "Cover 3", "SS");
  if (ss.relationship !== "curl/flat" || ss.depth !== "off") {
    throw new Error("FOOTBALL C3 SS want curl/flat·off got " + ss.relationship + "·" + ss.depth);
  }
  if (ss.leverage !== "outside") {
    throw new Error("FOOTBALL C3 SS leverage want outside got " + ss.leverage);
  }
})();

/* Cover 2 */
assertRel("C2 CB", relOf("4-3", "Cover 2", "LCB"), "flat");
assertRel("C2 FS", relOf("4-3", "Cover 2", "FS"), "deep half");
assertRel("C2 SS", relOf("4-3", "Cover 2", "SS"), "deep half");
if (AK.isDeepZoneRel(relOf("4-3", "Cover 2", "LCB").relationship)) {
  throw new Error("FOOTBALL C2 CB must not be a deep zone");
}

/* Tampa 2 */
assertRel("T2 CB", relOf("4-3", "Tampa 2", "LCB"), "flat");
assertRel("T2 FS", relOf("4-3", "Tampa 2", "FS"), "deep half");
assertRel("T2 SS", relOf("4-3", "Tampa 2", "SS"), "deep half");
assertRel("T2 Mike", relOf("4-3", "Tampa 2", "MLB"), "deep middle");

/* Cover 4 */
assertRel("C4 CB", relOf("4-3", "Cover 4", "LCB"), "deep quarter");
assertRel("C4 FS", relOf("4-3", "Cover 4", "FS"), "deep quarter");
assertRel("C4 SS", relOf("4-3", "Cover 4", "SS"), "deep quarter");

/* Cover 6 — left quarters / right Cover-2 (render assignCoverage) */
assertRel("C6 LCB (quarters)", relOf("4-2-5", "Cover 6", "LCB"), "deep quarter");
assertRel("C6 RCB (C2 side)", relOf("4-2-5", "Cover 6", "RCB"), "flat");
assertRel("C6 FS (left/quarters)", relOf("4-2-5", "Cover 6", "FS"), "deep quarter");
assertRel("C6 SS (right/half)", relOf("4-2-5", "Cover 6", "SS"), "deep half");

/* Cover 1 */
assertRel("C1 CB", relOf("Nickel", "Cover 1", "LCB"), ["over #1", "over #2", "over #3"]);
assertRel("C1 FS", relOf("Nickel", "Cover 1", "FS"), "deep middle");
assertRel("C1 SS", relOf("Nickel", "Cover 1", "SS"), ["over #1", "over #2", "over #3"]);
assertRel("C1 NB", relOf("Nickel", "Cover 1", "NB"), ["over #1", "over #2", "over #3"]);

/* Cover 0 — man only */
assertRel("C0 CB", relOf("Nickel", "Cover 0", "LCB"), ["over #1", "over #2", "over #3"]);
assertRel("C0 FS", relOf("Nickel", "Cover 0", "FS"), ["over #1", "over #2", "over #3"]);

/* ========================================================================
 * 1b) Cover 0/1/2-Man — ALL man defenders align same-side as assignment
 *     (v130 was CB-scoped and missed W/SS/FS cross-formation homes)
 * ======================================================================== */
function assertManMatch(label, front, coverage, formationId) {
  const players = FC.playersFromFormation(formationId || "TRIPS_RT");
  const skill = (players || []).filter((p) => p && (p.type === "route" || p.type === "rb"));
  skill.forEach((p, i) => {
    if (p.id == null) p.id = "sk-" + i;
  });
  const state = { players: players, defs: [], front: front };
  RENDER.placeDefenseOn(state, front, coverage);
  const manDefs = (state.defs || []).filter((d) => d && d.role === "man" && !d._rat);
  const byId = {};
  skill.forEach((p) => {
    byId[p.id] = p;
  });

  /* Resolve by id only — lab/"X" vs manId "sk-0" must never silently miss */
  const claimed = {};
  manDefs.forEach((d) => {
    if (d.manId == null) {
      throw new Error(label + ": man def " + (d.pos || d.lab) + " has no manId (and not RAT)");
    }
    if (!byId[d.manId]) {
      throw new Error(label + ": manId " + d.manId + " not in skill set (vacuous lookup)");
    }
    if (claimed[d.manId]) {
      throw new Error(label + ": receiver " + d.manId + " double-covered");
    }
    claimed[d.manId] = d;
  });
  skill
    .filter((p) => p.type === "route")
    .forEach((p) => {
      if (coverage === "Cover 0" && !claimed[p.id]) {
        throw new Error(label + ": receiver " + (p.lab || p.id) + " has no man defender");
      }
    });

  /* Every man defender (CB, NB, SS, FS, W, M, …) aligns same side as his man */
  manDefs.forEach((d) => {
    const recv = byId[d.manId];
    if (!recv) return;
    const defSide = (d.x || 0) < 500 ? "L" : "R";
    const recvSide = (recv.x || 0) < 500 ? "L" : "R";
    if (defSide !== recvSide) {
      throw new Error(
        label +
          ": " +
          (d.pos || d.lab) +
          " @x=" +
          Math.round(d.x) +
          " cross-formation to " +
          (recv.lab || recv.id) +
          " @x=" +
          Math.round(recv.x)
      );
    }
    /* Alignment follows assignment — within a short slide of the receiver */
    const dx = Math.abs((d.x || 0) - (recv.x || 0));
    if (dx > 40) {
      throw new Error(
        label +
          ": " +
          (d.pos || d.lab) +
          " aligned " +
          Math.round(dx) +
          "px from man (must sit over assignment)"
      );
    }
  });

  const cbs = manDefs.filter((d) => /^(LCB|RCB)$/.test(String(d.pos || "")));
  if (cbs.length >= 2) {
    const sides = new Set(cbs.map((d) => ((d.x || 0) < 500 ? "L" : "R")));
    if (sides.size < 2) {
      throw new Error(label + ": both CBs on the same side of the formation");
    }
  }
}

assertManMatch("C1 trips man-match", "Nickel", "Cover 1", "TRIPS_RT");
assertManMatch("C1 doubles man-match", "Nickel", "Cover 1", "DOUBLES_2X2");
assertManMatch("C0 trips man-match", "Nickel", "Cover 0", "TRIPS_RT");
assertManMatch("C0 wing man-match", "Nickel", "Cover 0", "WING_3X1");
assertManMatch("C1 wing man-match", "Nickel", "Cover 1", "WING_3X1");
console.log("OK Cover 0/1 man-match: all man defs same-side + over assignment (not CB-only)");

/* ========================================================================
 * 1c) Receiver numbering + covered TE (derive from geometry / onLOS)
 *     #1 = outermost on that side; TE covered when a WR sits outside him.
 * ======================================================================== */
function sideOrdinals(players, side) {
  const skill = (players || []).filter((p) => p && (p.type === "route" || p.type === "rb"));
  const arr =
    side === "L"
      ? skill.filter((p) => (p.x || 0) < 500).sort((a, b) => (a.x || 0) - (b.x || 0))
      : skill.filter((p) => (p.x || 0) >= 500).sort((a, b) => (b.x || 0) - (a.x || 0));
  return arr.map((p, i) => ({ n: i + 1, lab: p.lab, y: p.y, x: p.x }));
}
function teCovered(players, teLab) {
  const skill = (players || []).filter((p) => p && (p.type === "route" || p.type === "rb"));
  const te = skill.find((p) => p.lab === teLab);
  if (!te) return false;
  const teX = te.x || 0;
  return skill.some((p) => {
    if (p === te) return false;
    if (teX < 500) return (p.x || 0) < teX; /* outside = further left */
    return (p.x || 0) > teX;
  });
}
{
  const d22 = FC.playersFromFormation("DOUBLES_2X2");
  const L = sideOrdinals(d22, "L");
  const R = sideOrdinals(d22, "R");
  if (L[0].lab !== "X" || L[1].lab !== "H") throw new Error("2x2 left #1/#2 want X,H got " + L.map((o) => o.lab));
  if (R[0].lab !== "Z" || R[1].lab !== "Y") throw new Error("2x2 right #1/#2 want Z,Y got " + R.map((o) => o.lab));
  /* Slots off LOS — y separation feeds nearest-ordinal / man align */
  if (!(L[0].y < L[1].y) || !(R[0].y < R[1].y)) {
    throw new Error("2x2 #1 must be on LOS (shallower y) than #2 slots");
  }
  const c1 = place("Nickel", "Cover 1", "DOUBLES_2X2");
  const lcb = c1.state.defs.find((d) => d && d.pos === "LCB");
  const nb = c1.state.defs.find((d) => d && d.pos === "NB");
  const aLcb = AK.deriveAlignAnswer(c1.call, c1.state.defs.indexOf(lcb), c1.state, {
    coverageRespForDef: () => null,
  });
  if (aLcb.relationship !== "over #1") {
    throw new Error("2x2 Cover1 LCB want over #1 got " + aLcb.relationship);
  }
  /* NB sits to a side — must be #2 on that side when slots are off-ball */
  if (nb) {
    const aNb = AK.deriveAlignAnswer(c1.call, c1.state.defs.indexOf(nb), c1.state, {
      coverageRespForDef: () => null,
    });
    if (!/^over #\d$/.test(aNb.relationship)) {
      throw new Error("2x2 Cover1 NB bad rel " + aNb.relationship);
    }
  }

  const pro = FC.playersFromFormation("PRO_I");
  if (!teCovered(pro, "Y")) throw new Error("PRO_I: Y TE should be covered by Z outside");
  const proR = sideOrdinals(pro, "R");
  if (proR[0].lab !== "Z" || proR[1].lab !== "Y") {
    throw new Error("PRO_I strength/#: right #1=Z (flex) #2=Y (TE) got " + proR.map((o) => o.lab));
  }
  const trey = FC.playersFromFormation("TRIPS_RT_TE");
  if (!teCovered(trey, "H")) throw new Error("TRIPS_RT_TE: attached H should be covered by Z");
  console.log("OK numbering + covered-TE (2x2 X/H·Z/Y, PRO_I Z covers Y, TE trips Z covers H)");
}

/* ========================================================================
 * 2) Inverse — impossible answers
 * ======================================================================== */
function assertInverse(label, rows, check) {
  try {
    check(rows);
  } catch (e) {
    throw new Error("INVERSE " + label + ": " + (e && e.message));
  }
}

assertInverse("Cover 0 no deep zone", countRel("Nickel", "Cover 0"), (rows) => {
  const deep = rows.filter((r) => AK.isDeepZoneRel(r.relationship));
  if (deep.length) {
    throw new Error(
      "got deep-zone answers: " + deep.map((r) => r.pos + "=" + r.relationship).join(", ")
    );
  }
});

assertInverse("Cover 3 exactly one deep middle", countRel("Nickel", "Cover 3"), (rows) => {
  const mids = rows.filter((r) => r.relationship === "deep middle");
  if (mids.length !== 1) {
    throw new Error("deep middle count=" + mids.length + " " + JSON.stringify(mids));
  }
  if (String(mids[0].pos).toUpperCase() !== "FS") {
    throw new Error("deep middle must be FS, got " + mids[0].pos);
  }
});

assertInverse("Cover 1 exactly one deep middle", countRel("Nickel", "Cover 1"), (rows) => {
  const mids = rows.filter((r) => r.relationship === "deep middle");
  if (mids.length !== 1) {
    throw new Error("deep middle count=" + mids.length + " " + JSON.stringify(mids));
  }
});

assertInverse("Cover 2 exactly two deep half", countRel("4-3", "Cover 2"), (rows) => {
  const halves = rows.filter((r) => r.relationship === "deep half");
  if (halves.length !== 2) {
    throw new Error("deep half count=" + halves.length + " " + JSON.stringify(halves));
  }
});

assertInverse("Tampa 2 exactly two deep half", countRel("4-3", "Tampa 2"), (rows) => {
  const halves = rows.filter((r) => r.relationship === "deep half");
  if (halves.length !== 2) {
    throw new Error("deep half count=" + halves.length + " " + JSON.stringify(halves));
  }
  const mids = rows.filter((r) => r.relationship === "deep middle");
  if (mids.length !== 1) {
    throw new Error("Tampa hole (deep middle) count=" + mids.length);
  }
});

assertInverse("Cover 2 corners never deep zone", countRel("4-3", "Cover 2"), (rows) => {
  const bad = rows.filter(
    (r) => /CB/i.test(String(r.pos)) && AK.isDeepZoneRel(r.relationship)
  );
  if (bad.length) throw new Error(JSON.stringify(bad));
});

assertInverse("Tampa corners never deep zone", countRel("4-3", "Tampa 2"), (rows) => {
  const bad = rows.filter(
    (r) => /CB/i.test(String(r.pos)) && AK.isDeepZoneRel(r.relationship)
  );
  if (bad.length) throw new Error(JSON.stringify(bad));
});

/* ========================================================================
 * 3) Degeneracy across 20 mixed keys
 * ======================================================================== */
const CALLS = [
  { name: "Slam", front: "4-3", coverage: "Cover 3" },
  { name: "Buzz", front: "Nickel", coverage: "Cover 1" },
  { name: "Quarters", front: "4-2-5", coverage: "Cover 4" },
  { name: "Palms", front: "3-4", coverage: "Cover 2" },
  { name: "Fire", front: "Nickel", coverage: "Cover 0" },
  { name: "Mike", front: "4-3", coverage: "Tampa 2" },
  { name: "Sky", front: "4-2-5", coverage: "Cover 6" },
];
const FORMATIONS = ["DOUBLES_2X2", "TRIPS_RT", "EMPTY_3X2", "WING_2X1", "PRO_I"];

function pickDefIndex(defs, n) {
  const idx = (pred) => defs.map((d, i) => ({ d, i })).filter((o) => o.d && pred(o.d));
  const cbs = idx((d) => /^(LCB|RCB|CB)$/i.test(String(d.pos || "")));
  const nbs = idx((d) => /NB/i.test(String(d.pos || "")));
  const saf = idx((d) => /^(FS|SS)$/i.test(String(d.pos || "")));
  const lbs = idx((d) => d.group === "LB");
  const pools = [cbs, cbs, nbs, saf, lbs, cbs, saf, lbs, cbs, nbs];
  const pool = pools[n % pools.length];
  if (pool && pool.length) return pool[n % pool.length].i;
  return n % defs.length;
}

const samples = [];
for (let n = 0; n < 20; n++) {
  const call = CALLS[n % CALLS.length];
  const fid = FORMATIONS[n % FORMATIONS.length];
  const { state } = place(call.front, call.coverage, fid);
  const di = pickDefIndex(state.defs, n);
  const ans = AK.deriveAlignAnswer(call, di, state);
  samples.push({
    n: n,
    formation: fid,
    role: state.defs[di].pos || state.defs[di].lab,
    coverage: call.coverage,
    relationship: ans.relationship,
    leverage: ans.leverage,
    depth: ans.depth,
  });
}
const MAX_SHARE = 0.7;
for (const dim of ["relationship", "leverage", "depth"]) {
  const counts = Object.create(null);
  samples.forEach((s) => {
    counts[s[dim]] = (counts[s[dim]] || 0) + 1;
  });
  for (const val of Object.keys(counts)) {
    if (counts[val] / samples.length > MAX_SHARE) {
      throw new Error(
        "degeneracy: " + dim + "=" + val + " on " + counts[val] + "/" + samples.length
      );
    }
  }
}

/* ========================================================================
 * 4) Real 10-rep DB alignment run (report table — no DB writes)
 * ======================================================================== */
const weekCall = { name: "4-3 Cover 3 Nickel Fire", front: "Nickel", coverage: "Cover 3" };
const dbRoleCycle = ["LCB", "RCB", "FS", "SS", "NB", "LCB", "FS", "SS", "NB", "RCB"];
const ten = [];
for (let i = 0; i < 10; i++) {
  const fid = FORMATIONS[i % FORMATIONS.length];
  const { state, call } = place(weekCall.front, weekCall.coverage, fid);
  const want = dbRoleCycle[i];
  let di = state.defs.findIndex((d) => String(d.pos || "") === want);
  if (di < 0) di = state.defs.findIndex((d) => d.group === "DB");
  const d = state.defs[di];
  const ans = AK.deriveAlignAnswer(call, di, state);
  ten.push({
    i: i + 1,
    formation: fid,
    role: d.pos || d.lab,
    coverage: weekCall.coverage,
    relationship: ans.relationship,
    leverage: ans.leverage,
    depth: ans.depth,
  });
}
const relSet = new Set(ten.map((r) => r.relationship));
const levSet = new Set(ten.map((r) => r.leverage));
if (relSet.size < 2) {
  throw new Error("10-rep run: relationship constant (" + [...relSet].join() + ")");
}
if (levSet.size < 2) {
  throw new Error("10-rep run: leverage constant (" + [...levSet].join() + ")");
}

/* HTML wiring */
const htmlA = fs.readFileSync(path.join(root, "OFFGRD-QB.html"), "utf8");
if (!htmlA.includes("OFFGRD-align-key.js")) throw new Error("QB.html missing OFFGRD-align-key.js");
if (hasMirror) {
  const htmlB = fs.readFileSync(path.join(root, "offgrd-web", "OFFGRD-QB.html"), "utf8");
  if (!htmlB.includes("OFFGRD-align-key.js")) throw new Error("offgrd-web QB.html missing OFFGRD-align-key.js");
}
for (const token of ["deep outside third", "curl/flat", "middle hook"]) {
  if (!htmlA.includes(token)) {
    throw new Error("ALIGN_REL_OPTS missing " + token + " in QB.html");
  }
}
if (!htmlA.includes("viewerIsCoach")) throw new Error("coach gate missing");
if (!/Force light panel \+ dark ink/.test(htmlA)) throw new Error("Night modal contrast fix missing");

console.log("OK align-key smoke (football + inverse + degeneracy + 10-rep variance)");
console.log("");
console.log("| # | formation | role | coverage | relationship | leverage | depth |");
console.log("|---|-----------|------|----------|--------------|----------|-------|");
ten.forEach((r) => {
  console.log(
    "| " +
      r.i +
      " | " +
      r.formation +
      " | " +
      r.role +
      " | " +
      r.coverage +
      " | " +
      r.relationship +
      " | " +
      r.leverage +
      " | " +
      r.depth +
      " |"
  );
});
console.log("");
console.log(
  "variance: relationships=" +
    relSet.size +
    " [" +
    [...relSet].join(", ") +
    "]  leverages=" +
    levSet.size +
    " [" +
    [...levSet].join(", ") +
    "]"
);
process.exit(0);
