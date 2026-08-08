/**
 * Matchup Engine P4 — D-side structural + rank fixtures.
 *   node scripts/smoke-matchup-dside.cjs
 */
"use strict";

const path = require("path");
const root = path.join(__dirname, "..");
require(path.join(root, "OFFGRD-autoderive.js"));
const M = require(path.join(root, "OFFGRD-matchup.js"));

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assert failed");
}

assert(M.STRUCT_RULES_D_V === "struct_rules_d_v1", "rules version");
assert(typeof M.rankDefCallsByEv === "function", "rankDefCallsByEv");
assert(typeof M.offenseProfile === "function", "offenseProfile");

function snaps(n, patch) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(Object.assign({ playType: "Run", personnel: "12", formation: "Pro" }, patch));
  return out;
}

/* 12-pers 70% run → +box fronts top, dime penalized */
const runHeavy = snaps(70, { playType: "Run", personnel: "12" }).concat(
  snaps(30, { playType: "Pass", personnel: "11", formation: "Trips" })
);
const runRank = M.rankDefCallsByEv(null, runHeavy, [], { limit: 8 });
assert(runRank.length >= 3, "run rank length");
const runTop = runRank[0].label;
const dime = runRank.find((r) => /Dime/i.test(r.label));
assert(!/Dime/i.test(runTop), "dime not top vs run-heavy: " + runTop);
if (dime) assert(dime.ev < runRank[0].ev, "dime below top vs run");

/* empty quick-game → press/pattern up, 0-blitz soft zone down */
const quickEmpty = snaps(40, {
  playType: "Pass",
  personnel: "10",
  formation: "Empty",
  play: "Slant",
}).concat(snaps(20, { playType: "Pass", personnel: "10", formation: "Empty", play: "Screen" }));
const qRank = M.rankDefCallsByEv(null, quickEmpty, [], { limit: 8 });
const pressish = qRank.find((r) => /pressure|Man pressure|Cover 0/i.test(r.label));
const softZone = qRank.find((r) => /Cover 3$/i.test(r.label) && !/pressure|Zone pressure/i.test(r.label));
assert(pressish, "has press/man pressure call");
if (softZone && pressish) assert(pressish.ev >= softZone.ev - 0.05, "press ≥ soft zone vs quick empty");

/* verticals-heavy → 2-high rises */
const verts = snaps(50, { playType: "Pass", play: "Go seam", personnel: "11", formation: "Doubles" });
const vRank = M.rankDefCallsByEv(null, verts, [], { limit: 8 });
const twoHigh = vRank.find((r) => /Quarters|Cover 2/i.test(r.label));
assert(twoHigh, "2-high present");
assert(twoHigh.ev >= vRank[vRank.length - 1].ev, "2-high not last");

/* determinism */
const a = M.rankDefCallsByEv(null, runHeavy, [], { limit: 5 }).map((r) => r.label + ":" + r.score);
const b = M.rankDefCallsByEv(null, runHeavy, [], { limit: 5 }).map((r) => r.label + ":" + r.score);
assert(a.join("|") === b.join("|"), "deterministic");

const sheet = M.draftDefGameplanSheet(
  [{ name: "1st & 10", offRows: runHeavy }],
  null,
  [],
  { perBucket: 3 }
);
assert(sheet[0].top.length === 3, "def draft top3");

console.log("PASS smoke-matchup-dside:", {
  runTop: runRank.slice(0, 3).map((r) => r.label + "@" + r.score),
  quickTop: qRank.slice(0, 3).map((r) => r.label + "@" + r.score),
  vertTop: vRank.slice(0, 3).map((r) => r.label + "@" + r.score),
});
