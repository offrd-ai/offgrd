/**
 * Matchup Engine struct_rules_v2 — 17-bucket hscoach sit-fit audit.
 *   node scripts/smoke-matchup-sit.cjs
 *
 * Golden:
 *   - flood must NOT top 3rd & 1-3
 *   - smash must not top 4th & 1
 *   - Ohio takes 3rd & short over chalk Florida West
 *   - 4th & 1 surfaces a short-yardage family
 *   - Best Now varies by distance band (1-3 vs 10+ vs GOAL)
 */
"use strict";

const path = require("path");
const root = path.join(__dirname, "..");

require(path.join(root, "OFFGRD-autoderive.js"));
const M = require(path.join(root, "OFFGRD-matchup.js"));

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assert failed");
}

assert(M.STRUCT_RULES_V === "struct_rules_v2", "STRUCT_RULES_V");
assert(M.BLEND_K === 4, "BLEND_K");

const F = M.FIXTURES;
assert(F.flood && F.ohio && F.iso && F.smash && F.screen && F.mesh && F.verts && F.fade, "sit fixtures");

assert(M.sitFitFamily(M.routeFeatures(M.classify(F.flood.data))) === "deep", "flood family");
assert(M.sitFitFamily(M.routeFeatures(M.classify(F.ohio.data))) === "quick", "ohio family");
assert(M.sitFitFamily(M.routeFeatures(M.classify(F.iso.data))) === "run", "iso family");
assert(M.sitFitFamily(M.routeFeatures(M.classify(F.smash.data))) === "smash", "smash family");
assert(M.sitFitFamily(M.routeFeatures(M.classify(F.screen.data))) === "screen", "screen family");
assert(M.sitFitFamily(M.routeFeatures(M.classify(F.mesh.data))) === "rub", "mesh family");

const festus = [
  { k: "Cover 1", pct: 0.47 },
  { k: "Cover 4", pct: 0.28 },
  { k: "Cover 3", pct: 0.15 },
  { k: "Cover 2", pct: 0.1 }
];

const book = [
  F.flood,
  F.ohio,
  F.iso,
  F.smash,
  F.curlflat,
  F.mesh,
  F.verts,
  F.screen,
  F.deepPA,
  F.fade,
  M.fixtureRun("Power")
];

const BUCKETS = [
  { dn: 1, db: "10+" },
  { dn: 1, db: "1-3" },
  { dn: 1, db: "7-9" },
  { dn: 2, db: "1-3" },
  { dn: 2, db: "4-6" },
  { dn: 2, db: "7-9" },
  { dn: 2, db: "10+" },
  { dn: 3, db: "1-3" },
  { dn: 3, db: "4-6" },
  { dn: 3, db: "7-9" },
  { dn: 3, db: "10+" },
  { dn: 4, db: "1-3" },
  { dn: 4, db: "4-6" },
  { dn: 4, db: "10+" },
  { dn: 1, db: "GOAL" },
  { dn: 2, db: "GOAL" },
  { dn: 3, db: "GOAL" }
];
assert(BUCKETS.length === 17, "17 buckets");

function rankAt(dn, db) {
  const distBucket = db === "GOAL" ? "1-3" : db;
  return M.rankPlaysByEv(book, festus, [], {
    limit: 8,
    down: dn,
    distBucket: distBucket,
    db: db
  });
}

function namesOf(ranked) {
  return ranked.map((r) => r.name).join(" | ");
}

const audit = BUCKETS.map((b) => {
  const ranked = rankAt(b.dn, b.db);
  return {
    dn: b.dn,
    db: b.db,
    best: ranked[0] && ranked[0].name,
    top3: ranked.slice(0, 3).map((r) => r.name),
    ranked: ranked
  };
});

audit.forEach((row) => {
  assert(row.ranked.length > 0, "non-empty " + row.dn + " & " + row.db);
  assert(row.ranked.every((r) => !Number.isNaN(r.ev)), "no NaN " + row.dn + " & " + row.db);
});

const thirdShort = audit.find((r) => r.dn === 3 && r.db === "1-3");
assert(thirdShort, "3rd & 1-3 row");
assert(
  !/florida|flood/i.test(thirdShort.best),
  "flood must NOT top 3rd & 1-3; got " + namesOf(thirdShort.ranked)
);
const ohio3 = thirdShort.ranked.find((r) => /ohio/i.test(r.name));
const flood3 = thirdShort.ranked.find((r) => /florida|flood/i.test(r.name));
assert(ohio3 && flood3, "Ohio + Florida West in 3rd & 1-3 book");
assert(
  ohio3.ev > flood3.ev,
  "Ohio takes 3rd & short over chalk Florida West: Ohio=" +
    ohio3.ev.toFixed(3) +
    " Florida=" +
    flood3.ev.toFixed(3)
);

const fourthShort = audit.find((r) => r.dn === 4 && r.db === "1-3");
assert(fourthShort, "4th & 1 row");
assert(
  !/smash/i.test(fourthShort.best),
  "smash must not top 4th & 1; got " + namesOf(fourthShort.ranked)
);
const shortFam = fourthShort.top3.some((n) => /iso|power|ohio|sneak|wedge/i.test(n));
assert(
  shortFam,
  "4th & 1 surfaces a short-yardage family; top3=" + fourthShort.top3.join(" | ")
);

const best13 = audit.find((r) => r.dn === 1 && r.db === "1-3").best;
const best10 = audit.find((r) => r.dn === 1 && r.db === "10+").best;
const bestGoal = audit.find((r) => r.dn === 1 && r.db === "GOAL").best;
assert(best13 && best10 && bestGoal, "Best Now names");
assert(
  best13 !== best10 || best10 !== bestGoal,
  "Best Now must vary by distance band; 1-3=" + best13 + " 10+=" + best10 + " GOAL=" + bestGoal
);

/* Determinism */
const a = rankAt(3, "1-3").map((x) => x.name + ":" + x.ev.toFixed(6));
const b = rankAt(3, "1-3").map((x) => x.name + ":" + x.ev.toFixed(6));
assert(JSON.stringify(a) === JSON.stringify(b), "determinism 3rd & 1-3");

console.log("smoke-matchup-sit: PASS");
audit.forEach((row) => {
  console.log("  " + row.dn + " & " + row.db + " → " + row.best + "  [" + row.top3.join(", ") + "]");
});
console.log("  Ohio vs Florida West @ 3rd & 1-3:", ohio3.ev.toFixed(3), ">", flood3.ev.toFixed(3));
console.log("  Best Now 1-3 / 10+ / GOAL:", best13, "/", best10, "/", bestGoal);
