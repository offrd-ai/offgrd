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
if (ordered.hero.engineExplain !== ordered.shortlist[0].engineExplain) throw new Error("BEST NOW text diverged");

/* Own history is the full fold. Opponent scope stays on the book. Badge is rank()'s rung. */
if (!/foldRows\(oursRaw, book\)/.test(html)) throw new Error("own history is not the unscoped fold");
if (!/own:oursAll/.test(html)) throw new Error("engine own is not the full pool");
if (/own:ours[,}\n]/.test(html)) throw new Error("engine still receives the opponent-scoped ours");
if (!/baseMeta\.badge=ordered\.rungLabel/.test(html)) throw new Error("BEST NOW badge is not rank()'s rung");
if (/badge=ordered\.prediction\.rungLabel/.test(html)) throw new Error("badge still quotes predict()");
if (/if\(!target\)\{/.test(html)) throw new Error("no-book still returns before the engine");
if (!/if\(!target && !\(window\.OFFGRD_PREDICT&&window\.OFFGRD_PREDICT\.orderCallerList\)\)/.test(html)) {
  throw new Error("no-book gate missing");
}
if (/concat\(ours\.map/.test(html)) throw new Error("candidates still union the opponent-scoped fold");
if (!/oursAll\.forEach/.test(html)) throw new Error("candidates do not include the unscoped own fold");
if (!/playKeyOf/.test(html)) throw new Error("caller does not key nominees with playKeyOf");

const bookThin = [];
for (var bt = 0; bt < 8; bt++) bookThin.push({ down: 1, distance: 10, playType: "run", coverage: "Cover 0", opponent: "Hazelwood East" });
const ownSeason = [];
for (var hs = 0; hs < 13; hs++) ownSeason.push(snap("HAMMER", { down: 1, distance: 12, success: 1, gain: 8, coverage: "Cover 3", opponent: "Fox" }));
for (var hf = 0; hf < 4; hf++) ownSeason.push(snap("HAMMER", { down: 1, distance: 12, success: 0, gain: 2, coverage: "Cover 3", opponent: "Ladue" }));
const seasonOrder = E.orderCallerList({
  context: { down: 1, dist: "10+" },
  book: bookThin,
  own: ownSeason,
  entries: [
    { play: "MEMPHIS", kind: "Pass", ev: 0.99, n: 0 },
    { play: "HAMMER", kind: "Run", ev: 0.1, n: 2 }
  ]
});
if (!seasonOrder.hero || seasonOrder.hero.play !== "HAMMER") throw new Error("full pool hero " + (seasonOrder.hero && seasonOrder.hero.play));
if (seasonOrder.hero.n !== 17) throw new Error("full pool n " + seasonOrder.hero.n);
if (!/76%/.test(seasonOrder.hero.engineLabel)) throw new Error("full pool label " + seasonOrder.hero.engineLabel);
if (!/17 snaps/.test(seasonOrder.rungLabel)) throw new Error("badge is not rank n: " + seasonOrder.rungLabel);
if (seasonOrder.rungLabel === seasonOrder.prediction.rungLabel) throw new Error("badge collapsed onto predict()");
if (/8 snaps/.test(seasonOrder.rungLabel)) throw new Error("badge used the book n");

/* Spec §9: BEST NOW text == shortlist row 1 on 20 situations. */
function mulberry(seed) {
  var a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry(20261006);
const sitDowns = [1, 2, 3, 4];
const sitDists = ["1-3", "4-6", "7-9", "10+"];
const sitPlays = ["HAMMER", "MIAMI", "ST LOUIS", "HOUSTON", "THUNDER", "POWER", "ISO", "MEMPHIS"];
for (var sit = 0; sit < 20; sit++) {
  var dist = sitDists[Math.floor(rand() * sitDists.length)];
  var yards = dist === "1-3" ? 2 : dist === "4-6" ? 5 : dist === "7-9" ? 8 : 12;
  var ctx = { down: sitDowns[Math.floor(rand() * sitDowns.length)], dist: dist, hash: rand() > 0.5 ? "L" : "", zone: rand() > 0.5 ? "PLUS" : "" };
  var pool = [];
  sitPlays.forEach(function (name, ni) {
    var count = 2 + Math.floor(rand() * 14);
    for (var k = 0; k < count; k++) {
      pool.push(snap(name, {
        down: ctx.down,
        distance: yards,
        success: rand() > (0.2 + ni * 0.04) ? 1 : 0,
        gain: 3 + ni,
        coverage: rand() > 0.75 ? "Cover 0" : "Cover 3",
        opponent: rand() > 0.5 ? "Fox" : "Hazelwood East"
      }));
    }
  });
  var sitBook = [];
  for (var sb = 0; sb < 6; sb++) sitBook.push({ down: ctx.down, distance: yards, playType: "pass", coverage: "Cover 0", opponent: "Hazelwood East" });
  var sitRank = E.rank(ctx, pool, E.predict(ctx, sitBook), sitPlays.map(function (name, ni) {
    return { name: name, kind: ni % 2 ? "Pass" : "Run", conceptScore: 0.9 - ni * 0.05 };
  }));
  if (sitRank.shortlist[0] !== sitRank.list[0]) throw new Error("situation " + sit + " shortlist diverged");
  if (!sitRank.hero || sitRank.hero.explain !== sitRank.shortlist[0].explain) throw new Error("situation " + sit + " text diverged");
}

/* Typed opponent, no book. Empty B means no leader. A play with ≥4 own snaps shows a %, not a concept match. */
const randEmpty = mulberry(20261008);
var gradedNoBook = 0;
for (var sitE = 0; sitE < 20; sitE++) {
  var distE = sitDists[Math.floor(randEmpty() * sitDists.length)];
  var yardsE = distE === "1-3" ? 2 : distE === "4-6" ? 5 : distE === "7-9" ? 8 : 12;
  var ctxE = { down: sitDowns[Math.floor(randEmpty() * sitDowns.length)], dist: distE, hash: randEmpty() > 0.5 ? "L" : "", zone: randEmpty() > 0.5 ? "PLUS" : "" };
  var poolE = [];
  sitPlays.forEach(function (name, ni) {
    var count = 2 + Math.floor(randEmpty() * 14);
    for (var k = 0; k < count; k++) {
      poolE.push(snap(name, {
        down: ctxE.down,
        distance: yardsE,
        success: randEmpty() > (0.2 + ni * 0.04) ? 1 : 0,
        gain: 3 + ni,
        coverage: "Cover 3",
        opponent: "SOAK TEST ENGINE"
      }));
    }
  });
  var predE = E.predict(ctxE, []);
  if (predE.leader) throw new Error("empty book grew a leader " + predE.leader);
  var sitRankE = E.rank(ctxE, poolE, predE, sitPlays.map(function (name, ni) {
    return { name: name, kind: ni % 2 ? "Pass" : "Run", conceptScore: 0.99 - ni * 0.05 };
  }));
  if (sitRankE.shortlist[0] !== sitRankE.list[0]) throw new Error("no-book situation " + sitE + " shortlist diverged");
  sitRankE.list.forEach(function (e) {
    if ((e.n || 0) < 4) return;
    gradedNoBook++;
    if (!/\d+%/.test(e.label)) throw new Error("no-book row missing % " + e.play + " " + e.label);
    if (/concept match/i.test(e.label)) throw new Error("no-book concept " + e.play + " " + e.label);
  });
}
if (gradedNoBook < 1) throw new Error("no-book smoke never saw a play with ≥4 snaps");

/* rank() does not clear a rung on pool size. 3rd & medium has snaps but no play at the floor. */
const third = [];
function addPlay(name, n, dist, hits, gain) {
  for (var i = 0; i < n; i++) {
    third.push(snap(name, {
      down: 3,
      distance: dist,
      success: i < hits ? 1 : 0,
      gain: gain,
      coverage: "Cover 3"
    }));
  }
}
addPlay("THUNDER", 2, 5, 2, 8);
addPlay("GATOR", 1, 5, 1, 6);
addPlay("ISO", 1, 5, 1, 5);
addPlay("COUNTER", 1, 5, 1, 4);
addPlay("HAWK", 3, 5, 3, 9);
addPlay("HAWK", 1, 12, 0, 6);
addPlay("TANK BLAST", 4, 12, 2, 4);
addPlay("MEMPHIS", 4, 12, 2, 5);
const thirdRank = E.rank(
  { down: 3, dist: "4-6" },
  third,
  { leader: "C0" },
  ["THUNDER", "GATOR", "ISO", "COUNTER", "HAWK", "TANK BLAST", "MEMPHIS"].map(function (name) {
    return { name: name, kind: name === "MEMPHIS" ? "Pass" : "Run", conceptScore: name === "MEMPHIS" ? 0.99 : 0.1 };
  })
);
if (!thirdRank.hero || thirdRank.hero.play !== "HAWK") throw new Error("3rd hero " + (thirdRank.hero && thirdRank.hero.play + " " + thirdRank.hero.label));
if (!/75%/.test(thirdRank.hero.label)) throw new Error("HAWK pct " + thirdRank.hero.label);
if (!/8\.3 avg/.test(thirdRank.hero.label)) throw new Error("HAWK avg " + thirdRank.hero.label);
if (!/4 snaps/.test(thirdRank.hero.label)) throw new Error("HAWK n " + thirdRank.hero.label);
if (!/3rd \(widened from 3rd & medium\)/.test(thirdRank.hero.label)) throw new Error("HAWK rung " + thirdRank.hero.label);
const thinRow = thirdRank.list.filter(function (e) { return e.play === "THUNDER"; })[0];
if (!thinRow || thinRow.tier <= 3) throw new Error("THUNDER should stay thin");
if (!/^thin · 2 snaps$/.test(thinRow.label)) throw new Error("thin label " + thinRow.label);
if (thirdRank.list.indexOf(thinRow) < thirdRank.list.indexOf(thirdRank.hero)) throw new Error("thin ranked above HAWK");
if (/^\d+%/.test(thinRow.label)) throw new Error("thin row shows a percent");

if (E.playKeyOf("2X2 MEMPHIS") !== E.playKeyOf("Memphis")) throw new Error("playKeyOf " + E.playKeyOf("2X2 MEMPHIS"));
if (E.playKeyOf("MEMPHIS") !== "memphis") throw new Error("playKeyOf case " + E.playKeyOf("MEMPHIS"));
if (E.playKeyOf("TANK BLAST") !== "tank blast") throw new Error("playKeyOf ate a real name: " + E.playKeyOf("TANK BLAST"));

/* Book spelling "Memphis" collects MEMPHIS and 2X2 MEMPHIS. Tie at 75%/4 is name order. */
const spell = [];
function addSpell(name, n, hits, gain, dist) {
  for (var i = 0; i < n; i++) {
    spell.push(snap(name, { down: 3, distance: dist, success: i < hits ? 1 : 0, gain: gain, coverage: "Cover 3" }));
  }
}
addSpell("HAWK", 3, 3, 9, 5);
addSpell("HAWK", 1, 0, 6, 12);
addSpell("TANK BLAST", 3, 3, 4, 12);
addSpell("TANK BLAST", 1, 0, 2, 8);
addSpell("GATOR", 4, 4, 7, 8);
addSpell("GATOR", 2, 0, 2, 12);
addSpell("MEMPHIS", 10, 10, 8, 12);
addSpell("2X2 MEMPHIS", 6, 0, 6, 8);
addSpell("DINO", 6, 6, 5, 8);
addSpell("DINO", 5, 0, 1, 12);
const spellRank = E.rank(
  { down: 3, dist: "4-6" },
  spell,
  { leader: "C0" },
  [
    { name: "Memphis", kind: "Pass", conceptScore: 0.2 },
    { name: "HAWK", kind: "Run", conceptScore: 0.1 },
    { name: "TANK BLAST", kind: "Run", conceptScore: 0.1 },
    { name: "GATOR", kind: "Run", conceptScore: 0.1 },
    { name: "DINO", kind: "Run", conceptScore: 0.1 }
  ]
);
const spellNames = spellRank.list.slice(0, 5).map(function (e) { return e.play; });
const spellWant = ["HAWK", "TANK BLAST", "GATOR", "Memphis", "DINO"];
if (spellNames.join("|") !== spellWant.join("|")) {
  throw new Error("keyed top5 " + spellNames.join(", ") + " labels " + spellRank.list.slice(0, 5).map(function (e) { return e.label; }).join(" || "));
}
const memRow = spellRank.list.filter(function (e) { return e.play === "Memphis"; })[0];
if (!memRow || memRow.n !== 16) throw new Error("Memphis n " + (memRow && memRow.n));
if (!/63%/.test(memRow.label)) throw new Error("Memphis pct " + memRow.label);

if (!/engineTier>3/.test(html)) throw new Error("thin rows still get a bold percent");
if (!/Eng\.rank\(/.test(html)) throw new Error("Scout From your book does not call rank()");

console.log("ok prediction engine");
