/**
 * Matchup Engine P3 — draftGameplanSheet + look up-weight intersection.
 *   node scripts/smoke-matchup-draft.cjs
 */
"use strict";

const path = require("path");
const root = path.join(__dirname, "..");
require(path.join(root, "OFFGRD-autoderive.js"));
const M = require(path.join(root, "OFFGRD-matchup.js"));

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assert failed");
}

assert(typeof M.draftGameplanSheet === "function", "draftGameplanSheet");
assert(typeof M.looksForWeekUpweight === "function", "looksForWeekUpweight");

const plays = [M.FIXTURES.mesh, M.FIXTURES.smash, M.FIXTURES.curlflat, M.FIXTURES.verts];
const buckets = [
  {
    name: "1st & 10",
    dn: "1",
    db: "10+",
    zone: "ANY",
    covDist: {
      arr: [
        { k: "Cover 1", pct: 0.47 },
        { k: "Cover 4", pct: 0.28 },
        { k: "Cover 3", pct: 0.25 },
      ],
    },
  },
  {
    name: "3rd & long",
    dn: "3",
    db: "10+",
    zone: "ANY",
    covDist: {
      arr: [
        { k: "Cover 4", pct: 0.4 },
        { k: "Cover 2", pct: 0.35 },
        { k: "Cover 1", pct: 0.25 },
      ],
    },
  },
];

const sheet = M.draftGameplanSheet(buckets, plays, [], { perBucket: 3 });
assert(sheet.length === 2, "two buckets");
assert(sheet[0].top.length >= 1, "bucket0 has tops");
assert(sheet[0].top.length <= 3, "max 3");
assert(sheet[0].top.every((r) => r.ev != null && r.basis), "ev+basis on each");
/* Cold start: all on_paper with empty self-scout */
assert(
  sheet[0].top.every((r) => r.basis === "on_paper" || r.n === 0),
  "cold start on_paper"
);

const rankedByName = {};
sheet[0].top.forEach((r) => {
  rankedByName[r.name] = r;
});
const confirmed = sheet[0].top.slice(0, 2).map((r) => r.name);
const looks = M.looksForWeekUpweight(confirmed, ["Cover 1", "Cover 4"], rankedByName);
assert(Array.isArray(looks), "looks array");
/* Mesh should prefer man/C1 — expect at least one hit when primary is in top-2 */
const mesh = M.rankPlaysByEv(
  [M.FIXTURES.mesh],
  { arr: [{ k: "Cover 1", pct: 1 }] },
  [],
  { limit: 1 }
)[0];
assert(mesh && mesh.primaryLook, "primaryLook set");
const looks2 = M.looksForWeekUpweight(
  ["Mesh Cross"],
  ["Cover 1", "Cover 4"],
  { "Mesh Cross": mesh }
);
assert(looks2.some((L) => L.family === "C1" || L.family === mesh.primaryLook), "mesh look intersects top-2");

console.log("PASS smoke-matchup-draft:", {
  b0: sheet[0].top.map((r) => r.name + "@" + Math.round(r.ev * 100)),
  b1: sheet[1].top.map((r) => r.name + "@" + Math.round(r.ev * 100)),
  looks: looks2.map((L) => L.family),
});
