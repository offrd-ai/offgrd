/**
 * Matchup Engine P2 — blend / EV / empirical golden fixtures.
 *   node scripts/smoke-matchup-blend.cjs
 */
"use strict";

const path = require("path");
const root = path.join(__dirname, "..");

require(path.join(root, "OFFGRD-autoderive.js"));
const M = require(path.join(root, "OFFGRD-matchup.js"));

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assert failed");
}
function approx(a, b, eps) {
  return Math.abs(a - b) <= (eps != null ? eps : 1e-9);
}

assert(M.BLEND_K === 4, "BLEND_K");
assert(M.EV_TIE_EPS === 0.03, "EV_TIE_EPS");
assert(typeof M.empiricalCell === "function", "empiricalCell");
assert(typeof M.blendScore === "function", "blendScore");
assert(typeof M.ev === "function", "ev");
assert(typeof M.rankPlaysByEv === "function", "rankPlaysByEv");

/* w(0)=0, w(4)=0.5, w(16)=0.8 */
function empN(n, sr) {
  return { sr: sr != null ? sr : 0.7, n: n, w: n / (n + M.BLEND_K), basis: n ? "empirical" : "on_paper" };
}
assert(approx(empN(0).w, 0), "w(0)=0");
assert(approx(empN(4).w, 0.5), "w(4)=0.5");
assert(approx(empN(16).w, 0.8), "w(16)=0.8");

/* blendScore */
assert(approx(M.blendScore(empN(0, 0.9), 0.6), 0.6), "n=0 pure struct");
assert(approx(M.blendScore(empN(4, 0.8), 0.4), 0.5 * 0.8 + 0.5 * 0.4), "n=4 50/50");

/* Seeded empirical rows */
const rows = [];
for (let i = 0; i < 8; i++) {
  rows.push({
    play: "Mesh Cross",
    coverage: "Cover 1",
    down: 1,
    distance: 10,
    gain: i < 6 ? 6 : 1,
    success: i < 6 ? 1 : 0,
    playType: "Pass",
    result: "Complete"
  });
}
for (let i = 0; i < 4; i++) {
  rows.push({
    play: "Curl Flat",
    coverage: "Cover 4",
    down: 1,
    distance: 10,
    gain: i < 3 ? 8 : 0,
    success: i < 3 ? 1 : 0,
    playType: "Pass"
  });
}
/* sack excluded (weight 0) */
rows.push({
  play: "Mesh Cross",
  coverage: "Cover 1",
  down: 1,
  distance: 10,
  gain: -8,
  success: 0,
  playType: "Pass",
  result: "Sack"
});

const cell = M.empiricalCell(M.FIXTURES.mesh, "C1", rows, {
  getSuccess: (r) => (r.success != null ? +r.success : null)
});
assert(cell.n === 8, "mesh C1 n=8 (sack excluded), got " + cell.n);
assert(approx(cell.w, 8 / 12), "mesh C1 w=8/12, got " + cell.w);
assert(approx(cell.sr, 0.75), "mesh C1 sr=0.75, got " + cell.sr);
assert(cell.basis === "empirical", "empirical basis");

/* Hand-check EV: 2 plays × 2 looks */
const mix = [
  { k: "Cover 1", pct: 0.6 },
  { k: "Cover 4", pct: 0.4 }
];
const meshEv = M.ev(M.FIXTURES.mesh, mix, rows, {
  getSuccess: (r) => (r.success != null ? +r.success : null)
});
const sC1 = M.structScore(M.FIXTURES.mesh, "C1").score / 100;
const sC4 = M.structScore(M.FIXTURES.mesh, "C4").score / 100;
const eC1 = M.empiricalCell(M.FIXTURES.mesh, "C1", rows, {
  getSuccess: (r) => (r.success != null ? +r.success : null)
});
const eC4 = M.empiricalCell(M.FIXTURES.mesh, "C4", rows, {
  getSuccess: (r) => (r.success != null ? +r.success : null)
});
const hand =
  0.6 * M.blendScore(eC1, sC1) + 0.4 * M.blendScore(eC4, sC4);
assert(approx(meshEv.ev, hand, 1e-9), "EV hand check mesh: " + meshEv.ev + " vs " + hand);

const curlEv = M.ev(M.FIXTURES.curlflat, mix, rows, {
  getSuccess: (r) => (r.success != null ? +r.success : null)
});
assert(!Number.isNaN(curlEv.ev), "curl EV no NaN");

/* Cold: empty rows → on_paper, non-empty ranking */
const cold = M.rankPlaysByEv(
  [M.FIXTURES.mesh, M.FIXTURES.curlflat, M.FIXTURES.smash, M.FIXTURES.verts],
  mix,
  [],
  { limit: 5 }
);
assert(cold.length > 0, "cold non-empty");
assert(cold.every((r) => r.basis === "on_paper"), "cold all on_paper");
assert(cold.every((r) => !Number.isNaN(r.ev)), "cold no NaN");

/* Rockwood-ish Festus mix */
const festus = [
  { k: "Cover 1", pct: 0.47 },
  { k: "Cover 4", pct: 0.28 },
  { k: "Cover 3", pct: 0.15 },
  { k: "Cover 2", pct: 0.1 }
];
const book = [
  M.FIXTURES.mesh,
  M.FIXTURES.smash,
  M.FIXTURES.curlflat,
  M.FIXTURES.verts,
  M.FIXTURES.screen,
  M.FIXTURES.deepPA,
  M.fixturePlay("Flood Sail", "flood", [
    { rname: "Flat", depth: 3, lat: 90, x: 560 },
    { rname: "Out", depth: 12, lat: 70, x: 540 },
    { rname: "Go", depth: 22, lat: 0, x: 400 }
  ]),
  M.fixturePlay("Dig Post", null, [
    { rname: "Dig", depth: 14, lat: 100, x: 420 },
    { rname: "Post", depth: 20, lat: 40, x: 500 }
  ])
];
const festRank = M.rankPlaysByEv(book, festus, [], { limit: 5 });
const topNames = festRank.map((r) => r.name).join(" | ");
assert(
  festRank.some((r) => /mesh|cross/i.test(r.name) || r.concept === "mesh"),
  "mesh in Festus top-5: " + topNames
);
assert(
  festRank.some((r) => /curl|smash/i.test(r.name) || r.concept === "curlflat" || r.concept === "smash"),
  "curl-flat/smash family in Festus top-5: " + topNames
);

/* Blended single-look scout path */
const blendC1 = M.rankPlaysVsLookBlended(book, "C1", rows, {
  limit: 5,
  getSuccess: (r) => (r.success != null ? +r.success : null)
});
assert(blendC1.length > 0, "blend C1 ranked");
assert(blendC1[0].basis === "empirical" || blendC1.some((r) => r.basis === "empirical"), "has empirical badge path");

/* Perf */
const sixty = [];
for (let i = 0; i < 60; i++) {
  const b = book[i % book.length];
  sixty.push({ id: "p" + i, name: b.name + " #" + i, data: b.data, concept: b.concept });
}
const t0 = process.hrtime.bigint();
M.rankPlaysByEv(sixty, festus, rows, {
  limit: 20,
  getSuccess: (r) => (r.success != null ? +r.success : null)
});
const ms = Number(process.hrtime.bigint() - t0) / 1e6;
if (ms >= 50) console.warn("WARN: rankPlaysByEv 60 took " + ms.toFixed(1) + "ms");
else console.log("perf ok: rankPlaysByEv 60 = " + ms.toFixed(1) + "ms");

/* Determinism */
const a = M.rankPlaysByEv(book, festus, rows, {
  getSuccess: (r) => (r.success != null ? +r.success : null)
}).map((x) => x.name + ":" + x.ev.toFixed(6));
const b = M.rankPlaysByEv(book, festus, rows, {
  getSuccess: (r) => (r.success != null ? +r.success : null)
}).map((x) => x.name + ":" + x.ev.toFixed(6));
assert(JSON.stringify(a) === JSON.stringify(b), "determinism");

/* Tie-break within 3 EV points prefers n≥3 */
assert(typeof M.cmpEv === "function", "cmpEv");
assert(
  M.cmpEv({ ev: 0.6, n: 5, name: "Proven" }, { ev: 0.62, n: 1, name: "Thin" }) < 0,
  "n≥3 wins within 3 EV pts"
);
assert(
  M.cmpEv({ ev: 0.7, n: 1, name: "Hot" }, { ev: 0.6, n: 5, name: "Proven" }) < 0,
  "EV gap >3 pts wins"
);
const tieRows = [];
for (let i = 0; i < 5; i++) {
  tieRows.push({
    play: "Mesh Cross",
    coverage: "Cover 1",
    down: 1,
    distance: 10,
    gain: 6,
    success: 1,
    playType: "Pass"
  });
}
tieRows.push({
  play: "Smash Z",
  coverage: "Cover 1",
  down: 1,
  distance: 10,
  gain: 8,
  success: 1,
  playType: "Pass"
});
const tieRank = M.rankPlaysByEv([M.FIXTURES.smash, M.FIXTURES.mesh], [{ k: "Cover 1", pct: 1 }], tieRows, {
  limit: 2,
  getSuccess: (r) => (r.success != null ? +r.success : null)
});
const meshRow = tieRank.find((r) => /mesh/i.test(r.name));
const smashRow = tieRank.find((r) => /smash/i.test(r.name));
assert(meshRow && smashRow, "tie-break rank has both");
if (Math.abs(meshRow.ev - smashRow.ev) <= 0.03) {
  assert(tieRank[0].n >= 3, "within 3pts, n≥3 leads: " + tieRank[0].name + " n=" + tieRank[0].n);
}

console.log("smoke-matchup-blend: PASS");
console.log("  Festus top5:", topNames);
console.log("  mesh EV@", mix.map((m) => m.k + " " + Math.round(m.pct * 100)).join("/"), "=", meshEv.ev.toFixed(3));
console.log("  mesh@C1 emp n=" + cell.n + " sr=" + cell.sr.toFixed(2) + " w=" + cell.w.toFixed(2));
