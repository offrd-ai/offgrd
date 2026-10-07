/**
 * Prediction engine — one rank, hero is row one.
 *   node scripts/smoke-prediction-engine.cjs
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ROOT = path.resolve(__dirname, "..");

function load(name, sandbox) {
  const src = fs.readFileSync(path.join(ROOT, name), "utf8");
  vm.runInNewContext(src, sandbox);
  return sandbox;
}

const sandbox = { window: null, globalThis: null };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
load("OFFGRD-caller-shortlist.js", sandbox);
load("OFFGRD-prediction-engine.js", sandbox);
const E = sandbox.OFFGRD_PREDICT;
if (!E) throw new Error("OFFGRD_PREDICT missing");

const g = E.gates();
if (g.MIN_SNAPS !== 4) throw new Error("MIN_SNAPS moved: " + g.MIN_SNAPS);
if (g.SUCCESS_FLOOR !== 0.6) throw new Error("SUCCESS_FLOOR moved: " + g.SUCCESS_FLOOR);
if (g.SHORTLIST_MIN !== 3) throw new Error("SHORTLIST_MIN");

function snap(play, extra) {
  return Object.assign({ play: play, success: 1, gain: 6, down: 2, distance: 5, coverage: "Cover 3" }, extra || {});
}

/* Cover 0 prediction, HAMMER has the situational record, MEMPHIS is concept-only. */
const book = [];
for (var i = 0; i < 8; i++) {
  book.push({ down: 2, distance: 5, playType: "run", coverage: "Cover 0", formation: "2x1 Wing" });
}
const own = [];
for (var h = 0; h < 14; h++) own.push(snap("HAMMER", { success: 1, gain: 7, coverage: "Cover 3" }));
for (var m = 0; m < 4; m++) own.push(snap("HAMMER", { success: 0, gain: 1, coverage: "Cover 3" }));
/* 3 snaps vs C0 — under the floor, must not become the hero by look. */
for (var t = 0; t < 3; t++) own.push(snap("HAMMER", { success: 1, gain: 8, coverage: "Cover 0" }));

const C = { down: 2, dist: "4-6", formation: "2x1 Wing", hash: "L", zone: "MOF" };
const prediction = E.predict(C, book);
if (prediction.leader !== "C0") throw new Error("leader " + prediction.leader);
if (prediction.n < 4) throw new Error("predict n " + prediction.n);
if (!prediction.widened) throw new Error("formation-only book should widen off the exact hash/zone rung");
if (!/widened from/i.test(prediction.rungLabel) && prediction.rung > 2) {
  throw new Error("rung label missing widened-from: " + prediction.rungLabel);
}
if (!/\d+ snaps/.test(prediction.seasonLabel || prediction.rungLabel)) throw new Error("expect line missing n");

const plays = [
  { name: "MEMPHIS", kind: "Pass", conceptScore: 0.95 },
  { name: "HAMMER", kind: "Run", conceptScore: 0.2 },
  { name: "POWER", kind: "Run", conceptScore: 0.4 }
];
const ranked = E.rank(C, own, prediction, plays);
if (!ranked.hero || ranked.hero.play !== "HAMMER") {
  throw new Error("hero " + (ranked.hero && ranked.hero.play) + " expected HAMMER");
}
if (ranked.hero !== ranked.list[0]) throw new Error("hero is not rank()[0]");
if (ranked.shortlist[0] !== ranked.list[0]) throw new Error("shortlist row 1 is not rank()[0]");
if (ranked.hero.tier >= 4) throw new Error("HAMMER labeled concept");
if (/concept match/i.test(ranked.hero.label)) throw new Error("hero label is concept: " + ranked.hero.label);
if (ranked.hero.n !== 21) throw new Error("HAMMER snap count " + ranked.hero.n + " " + ranked.hero.explain);
if (!/widened from 2x1 Wing/.test(ranked.hero.label)) throw new Error("widen label: " + ranked.hero.label);
if (!/not enough/.test(ranked.hero.label)) throw new Error("thin look should say not enough: " + ranked.hero.label);
const memphis = ranked.list.filter(function (e) { return e.play === "MEMPHIS"; })[0];
if (memphis && memphis.tier < 4) throw new Error("MEMPHIS should have no record");
if (memphis && ranked.list.indexOf(memphis) < ranked.list.indexOf(ranked.hero)) {
  throw new Error("concept ranked above HAMMER");
}
if (memphis && !/no reps · concept match/.test(memphis.label)) {
  throw new Error("concept label: " + memphis.label);
}

/* Concept stays off the list once 3 plays clear steps 1–3. */
const own3 = own.slice();
["POWER", "ISO", "COUNTER"].forEach(function (name) {
  for (var k = 0; k < 5; k++) own3.push(snap(name, { success: 1, gain: 5 }));
});
const many = E.rank(C, own3, prediction, plays.concat([
  { name: "ISO", kind: "Run", conceptScore: 0.1 },
  { name: "COUNTER", kind: "Run", conceptScore: 0.1 }
]));
const conceptLeft = many.list.filter(function (e) { return e.tier >= 4; });
if (conceptLeft.length) throw new Error("concept filled after 3 records cleared");
if (many.list.length < 3) throw new Error("expected the records");

/* Tonight wins the headline when it differs by ≥ 20 points and n ≥ 4. */
const season = [];
for (var s = 0; s < 10; s++) season.push({ playType: "run", down: 1, distance: 10, coverage: "Cover 2" });
for (var p = 0; p < 10; p++) season.push({ playType: "pass", down: 1, distance: 10, coverage: "Cover 2" });
for (var n = 0; n < 4; n++) season.push({ playType: "run", live: true, down: 1, distance: 10, coverage: "Cover 2" });
const livePred = E.predict({ down: 1, dist: "10+" }, season);
if (!livePred.tonight) throw new Error("tonight line missing");
if (livePred.tonight.tonightN !== 4) throw new Error("tonight n");
if (!/^tonight /.test(livePred.rungLabel)) throw new Error("tonight did not take the headline: " + livePred.rungLabel);

const close = season.slice(0, 20).concat([
  { playType: "run", live: true, down: 1, distance: 10 },
  { playType: "pass", live: true, down: 1, distance: 10 },
  { playType: "run", live: true, down: 1, distance: 10 },
  { playType: "pass", live: true, down: 1, distance: 10 }
]);
const noFlip = E.predict({ down: 1, dist: "10+" }, close);
if (noFlip.tonight) throw new Error("20-point gate failed open");

/* Every ranked row carries slice + n. */
ranked.list.forEach(function (e) {
  if (e.rung == null) throw new Error(e.play + " missing rung");
  if (e.tier < 4 && (e.n == null)) throw new Error(e.play + " missing n");
  if (!e.label) throw new Error(e.play + " missing label");
});

/* Caller seam: BEST NOW and the shortlist read the same ordered list. */
const html = fs.readFileSync(path.join(ROOT, "OFFGRD.html"), "utf8");
if (!/OFFGRD-prediction-engine\.js/.test(html)) throw new Error("engine script missing from OFFGRD.html");
if (!/orderCallerList/.test(html)) throw new Error("caller does not call orderCallerList");
if (!/engineOn/.test(html)) throw new Error("sheet still ranks through buildPanel when the engine ran");

const ordered = E.orderCallerList({
  context: C,
  book: book,
  own: own,
  entries: [
    { play: "MEMPHIS", kind: "Pass", ev: 0.95, sr: 0.95, n: 0, basis: "on_paper" },
    { play: "HAMMER", kind: "Run", ev: 0.2, sr: 0.2, n: 18, basis: "empirical" }
  ]
});
if (!ordered.hero || ordered.hero.play !== "HAMMER") throw new Error("orderCallerList hero");
if (ordered.shortlist[0] !== ordered.list[0]) throw new Error("orderCallerList shortlist");
if (ordered.hero.play !== ordered.shortlist[0].play) throw new Error("BEST NOW diverged");

console.log("ok prediction engine");
