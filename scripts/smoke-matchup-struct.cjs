/**
 * Matchup Engine P1 — structural scorer golden fixtures + perf/determinism.
 *   node scripts/smoke-matchup-struct.cjs
 */
"use strict";

const path = require("path");
const root = path.join(__dirname, "..");

/* Load AD then matchup onto the same globalThis (no second parser). */
require(path.join(root, "OFFGRD-autoderive.js"));
const M = require(path.join(root, "OFFGRD-matchup.js"));
const AD = globalThis.OFFGRD_AUTODERIVE;

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assert failed");
}

assert(AD && typeof AD.classifyPlay === "function", "OFFGRD_AUTODERIVE.classifyPlay missing");
assert(M.STRUCT_RULES_V === "struct_rules_v2", "STRUCT_RULES_V");
assert(M.LOOK_FAMILIES.length === 7, "LOOK_FAMILIES");

/* familyOf normalization */
assert(M.familyOf("Cover 0") === "C0", "fam C0");
assert(M.familyOf("C1") === "C1", "fam C1");
assert(M.familyOf("2-man") === "C2M", "fam 2-man");
assert(M.familyOf("2-Man") === "C2M", "fam 2-Man");
assert(M.familyOf("Tampa 2") === "C2", "fam Tampa");
assert(M.familyOf("Quarters") === "C4", "fam Quarters");
assert(M.familyOf("Press") === "PRESS", "fam Press");
assert(M.familyOf("Cover 3") === "C3", "fam C3");

const F = M.FIXTURES;
assert(F.mesh && F.smash && F.verts && F.screen && F.curlflat && F.flood && F.ohio && F.iso, "fixtures present");

function score(play, fam) {
  return M.structScore(play, fam);
}

/* mesh → strong vs C1/C0/C2M */
assert(score(F.mesh, "C1").score >= 70, "mesh vs C1 top-quartile");
assert(score(F.mesh, "C0").score >= 70, "mesh vs C0 top-quartile");
assert(score(F.mesh, "C2M").score >= 70, "mesh vs C2M top-quartile");
assert(score(F.mesh, "C1").basis === "on_paper", "basis on_paper");
assert(!Number.isNaN(score(F.mesh, "C1").score), "no NaN");

/* curl-flat / smash → strong vs C4 */
assert(score(F.smash, "C4").score >= 70, "smash vs C4");
assert(score(F.curlflat, "C4").score >= 70, "curlflat vs C4");
assert(score(F.curlflat, "C2").score >= 70, "curlflat vs C2");

/* 4 verts → high vs C3, penalized vs C4 */
const v3 = score(F.verts, "C3").score;
const v4 = score(F.verts, "C4").score;
assert(v3 >= 70, "verts vs C3 high, got " + v3);
assert(v4 < v3, "verts vs C4 penalized vs C3 (" + v4 + " < " + v3 + ")");
assert(v4 <= 55, "verts vs C4 not inflated, got " + v4);

/* screens rise vs PRESS */
assert(score(F.screen, "PRESS").score >= 65, "screen vs PRESS");

/* deep PA down vs PRESS */
assert(score(F.deepPA, "PRESS").score <= 45, "deep PA vs PRESS penalty");

/* Cold: empty book */
assert(M.rankPlaysVsLook([], "C1", { limit: 5 }).length === 0, "empty book");
assert(M.rankPlaysVsLook(null, "C1").length === 0, "null book");

/* Seeded Rockwood-like book vs Festus C1 — mesh/crosser in top-5 */
const seed = [
  F.mesh,
  F.smash,
  F.curlflat,
  F.verts,
  F.screen,
  F.deepPA,
  M.fixturePlay("Stick Nod", "stick", [
    { rname: "Stick", depth: 6, lat: 40, x: 540 },
    { rname: "Go", depth: 20, lat: 0, x: 420 }
  ]),
  M.fixturePlay("Flood Sail", "flood", [
    { rname: "Flat", depth: 3, lat: 90, x: 560 },
    { rname: "Out", depth: 12, lat: 70, x: 540 },
    { rname: "Go", depth: 22, lat: 0, x: 400 }
  ]),
  M.fixturePlay("Dig Post", null, [
    { rname: "Dig", depth: 14, lat: 100, x: 420 },
    { rname: "Post", depth: 20, lat: 40, x: 500 }
  ]),
  M.fixturePlay("Iso Fade", null, [
    { rname: "Go", depth: 22, lat: 10, x: 600 }
  ])
];

/* run filler that should not pollute */
seed.push({
  id: "fx-run",
  name: "Inside Zone",
  type: "run",
  data: {
    name: "Inside Zone",
    type: "run",
    players: [{ id: "qb", lab: "Q", type: "qb", x: 500, y: 380, route: [] }],
    defs: []
  }
});

const rankedC1 = M.rankPlaysVsLook(seed, "C1", { limit: 5 });
assert(rankedC1.length > 0, "non-empty ranking");
assert(rankedC1.every((r) => r.basis === "on_paper"), "all on_paper");
assert(rankedC1.every((r) => !Number.isNaN(r.score)), "no NaN in rank");
const topNames = rankedC1.map((r) => r.name).join(" | ");
assert(
  rankedC1.some((r) => /mesh|cross/i.test(r.name) || r.concept === "mesh"),
  "mesh/crosser in top-5 vs C1; got: " + topNames
);
assert(
  rankedC1.some((r) => r.why && /mesh|pick|crosser|man/i.test(r.why[0] || "")),
  "why mentions mesh/man; got: " + JSON.stringify(rankedC1[0] && rankedC1[0].why)
);

/* Perf: 60 plays × 7 looks < 50ms */
const sixty = [];
for (let i = 0; i < 60; i++) {
  const base = seed[i % seed.length];
  sixty.push({
    id: "perf-" + i,
    name: (base.name || "P") + " #" + i,
    data: base.data || base
  });
}
const t0 = process.hrtime.bigint();
const book = M.scoreBook(sixty);
const ms = Number(process.hrtime.bigint() - t0) / 1e6;
if (ms >= 50) {
  console.warn("WARN: scoreBook 60×7 took " + ms.toFixed(1) + "ms (budget 50ms)");
} else {
  console.log("perf ok: scoreBook 60×7 = " + ms.toFixed(1) + "ms");
}
assert(book.length > 0, "scoreBook non-empty");

/* Determinism: two runs identical */
const a1 = M.structScore(F.mesh, "C1");
const a2 = M.structScore(F.mesh, "C1");
assert(a1.score === a2.score && a1.rules_v === a2.rules_v, "determinism score");
assert(JSON.stringify(a1.why) === JSON.stringify(a2.why), "determinism why");
const r1 = M.rankPlaysVsLook(seed, "C1", { limit: 5 }).map((x) => x.id + ":" + x.score);
const r2 = M.rankPlaysVsLook(seed, "C1", { limit: 5 }).map((x) => x.id + ":" + x.score);
assert(JSON.stringify(r1) === JSON.stringify(r2), "determinism rank");

/* struct_rules_v2 sit-fit: look-only path unchanged; sit opts move flood/smash off short */
const flood3rd = M.structScore(F.flood, "C3", { down: 3, distBucket: "1-3" });
const floodLook = M.structScore(F.flood, "C3");
assert(flood3rd.score < floodLook.score, "flood penalized on 3rd & 1-3 vs look-only");
assert(/Deep-developing/.test((flood3rd.why || []).join(" ")), "flood sit why");

const smash4th = M.structScore(F.smash, "C4", { down: 4, distBucket: "1-3" });
const smashLook = M.structScore(F.smash, "C4");
assert(smash4th.score < smashLook.score, "smash penalized on 4th & 1");

const ohioShort = M.structScore(F.ohio, "C1", { down: 3, distBucket: "1-3" });
const ohioLook = M.structScore(F.ohio, "C1");
assert(ohioShort.score > ohioLook.score, "Ohio boosted at 1-3");

const isoShort = M.structScore(F.iso, "C1", { down: 4, distBucket: "1-3" });
assert(isoShort.score >= 60, "ISO run sit-boosted at 4th & 1, got " + isoShort.score);

const screenLook = M.structScore(F.screen, "C1");
const screen1st = M.structScore(F.screen, "C1", { down: 1, distBucket: "10+" });
const screen2nd = M.structScore(F.screen, "C1", { down: 2, distBucket: "10+" });
const screen3rd = M.structScore(F.screen, "C1", { down: 3, distBucket: "10+" });
assert(screen1st.score === screenLook.score, "screen NOT boosted at 1st & 10+");
assert(screen2nd.score > screenLook.score, "screen reduced boost at 2nd & 10+");
assert(screen3rd.score > screen2nd.score, "screen full boost at 3rd & 10+ > 2nd");
assert(screen3rd.score - screenLook.score === 16, "3rd & 10+ full +16, got " + (screen3rd.score - screenLook.score));
assert(screen2nd.score - screenLook.score === 8, "2nd & 10+ reduced +8, got " + (screen2nd.score - screenLook.score));

const vertsGoal = M.structScore(F.verts, "C3", { down: 1, db: "GOAL" });
const vertsLook = M.structScore(F.verts, "C3");
assert(vertsGoal.score < vertsLook.score, "verts compressed at GOAL");

/* Look-only cache path must ignore sit (no opts) */
assert(M.structScore(F.mesh, "C1").score === M.structScore(F.mesh, "C1", {}).score, "empty opts = look-only");

/* classify hard-fail path when AD present works */
const c = M.classify(F.mesh.data);
assert(c.concept === "mesh" || (c.routes && c.routes.filter((r) => r.type === "drag").length >= 2), "classify mesh");

console.log("smoke-matchup-struct: PASS");
console.log("  C1 top5:", topNames);
console.log("  verts C3=" + v3 + " C4=" + v4);
console.log("  mesh@C1=" + score(F.mesh, "C1").score + " smash@C4=" + score(F.smash, "C4").score);
