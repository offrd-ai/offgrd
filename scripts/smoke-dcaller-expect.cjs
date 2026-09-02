/**
 * D Caller Expect grain — honesty gates + dormant lane/depth.
 *   node scripts/smoke-dcaller-expect.cjs
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");

function load(name, sandbox) {
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, name), "utf8"), sandbox, {
    filename: name,
  });
  return sandbox;
}

const sandbox = { console: console };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
load("OFFGRD-formation-map.js", sandbox);
load("OFFGRD-caller-shortlist.js", sandbox);
load("OFFGRD-dcaller-expect.js", sandbox);

const X = sandbox.OFFGRD_DCALLER_EXPECT;
const FM = sandbox.OFFGRD_FORMATION_MAP;

function ok(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
  console.log("ok:", msg);
}

function snap(partial) {
  return Object.assign(
    {
      down: 1,
      distance: 10,
      playType: "Run",
      formation: "2x1 Wing",
      direction: "R",
      gap: "",
      passZone: "",
    },
    partial
  );
}

function many(n, partial) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(snap(partial));
  return out;
}

ok(!!X && typeof X.build === "function", "module exports build");
ok(X.cfgOf().DIRECTIONAL_SPLIT_MIN === 8, "split min 8");
ok(X.cfgOf().MIN_SNAPS === 4, "MIN_SNAPS 4");

/* --- parent only when dir slice < 8 --- */
const thinDir = [];
for (let i = 0; i < 15; i++) {
  thinDir.push(
    snap({
      direction: i < 10 ? "" : "R",
      formation: "ThinF" + (i % 7),
    })
  );
}
const parentOnly = X.build(thinDir);
ok(parentOnly.tier === "parent", "below dir gate → parent: " + parentOnly.tier);
ok(!/→/.test(parentOnly.text), "below dir gate: no directional guess");
ok(parentOnly.dir == null, "dir null below gate");

/* --- directional lean when typed-dir n ≥ 8 --- */
const dirBook = many(12, { playType: "Run", direction: "R" }).concat(
  many(5, { playType: "Run", direction: "L" })
).concat(many(8, { playType: "Pass", direction: "L" }));
const dirHit = X.build(dirBook);
ok(dirHit.tier === "direction" || dirHit.tier === "formation", "dir book clears a split");
ok(/→ R 71%/.test(dirHit.text) || /to the wing/.test(dirHit.text), "dir text: " + dirHit.text);
ok(/12 of 17 runs went right/.test(dirHit.foot) || dirHit.dir, "dir n in footer: " + dirHit.foot);

/* Force no-formation by using 7 unique forms (each below gate) */
const dirOnly = [];
for (let i = 0; i < 17; i++) {
  dirOnly.push(
    snap({
      playType: "Run",
      direction: i < 12 ? "R" : "L",
      formation: "F" + (i % 7),
    })
  );
}
for (let i = 0; i < 8; i++) {
  dirOnly.push(snap({ playType: "Pass", direction: "L", formation: "F" + (i % 7) }));
}
const dirOnlyHit = X.build(dirOnly);
ok(dirOnlyHit.tier === "direction", "no form gate → direction tier: " + dirOnlyHit.tier);
ok(dirOnlyHit.text === "Run 68% → R 71% · Pass 32% → L 100%", "dir line: " + dirOnlyHit.text);
ok(dirOnlyHit.foot === "25 snaps · 12 of 17 runs went right", "dir footer: " + dirOnlyHit.foot);

/* --- run-dir is independent of parent lean (South is pass-lean) --- */
function southish(passN) {
  const rows = [];
  for (let i = 0; i < passN; i++) {
    rows.push(snap({ playType: "Pass", direction: "", formation: "SF" + (i % 7) }));
  }
  for (let i = 0; i < 7; i++) {
    rows.push(snap({ playType: "Run", direction: "L", formation: "SF" + (i % 7) }));
  }
  for (let i = 0; i < 3; i++) {
    rows.push(snap({ playType: "Run", direction: "R", formation: "SF" + ((i + 3) % 7) }));
  }
  return rows;
}
const passLeanDir = X.build(southish(12));
ok(passLeanDir.lean === "pass", "12P+10R lean is pass");
ok(passLeanDir.dir && passLeanDir.dir.k === "L", "run-dir still renders on pass lean");
ok(passLeanDir.text === "Pass 55% · Run 45% → L 70%", "South 1st/10+ line: " + passLeanDir.text);
ok(passLeanDir.foot === "22 snaps · 7 of 10 runs went left", "South footer: " + passLeanDir.foot);
const paintedSouth = X.paint(passLeanDir);
ok(paintedSouth.html.indexOf("Pass 55% · Run 45% → L 70%") >= 0, "paint() embeds South line");
ok(/rd-dc-expect-grain/.test(paintedSouth.html), "paint() uses grain class");
ok(paintedSouth.low === false, "22-snap South sit is not LOW");
const runLeanDir = X.build(southish(8));
ok(runLeanDir.text === "Run 56% → L 70% · Pass 44%", "same runs + 8 pass: " + runLeanDir.text);
const paintedRun = X.paint(runLeanDir);
ok(paintedRun.html.indexOf("Run 56% → L 70% · Pass 44%") >= 0, "paint() embeds run-lean line");

/* --- SNAP_CORPUS mapper must keep direction (v350) --- */
const cloudSrc = fs
  .readFileSync(path.join(ROOT, "OFFGRD-cloud.js"), "utf8")
  .replace(/^export const Cloud/m, "const Cloud");
const cloudBox = {
  window: { supabase: null, OFFGRD_CONFIG: {}, __OFFRD_SUPABASE__: null },
  console,
};
cloudBox.window = Object.assign(cloudBox.window, cloudBox);
vm.runInNewContext(cloudSrc + "\nthis.Cloud = Cloud;", cloudBox);
const Cloud = cloudBox.Cloud || cloudBox.window.Cloud;
ok(Cloud && typeof Cloud.scoutSnapToRow === "function", "Cloud.scoutSnapToRow loads");
const typedCol = Cloud.scoutSnapToRow({
  play_type: "Run",
  play_dir: "L",
  gap: "B",
  pass_zone: "Deep Left",
  off_strength: "Rt",
  raw: {},
});
ok(typedCol.direction === "L", "typed play_dir survives empty raw: " + typedCol.direction);
ok(typedCol.gap === "B", "typed gap survives empty raw");
ok(typedCol.passZone === "Deep Left", "typed pass_zone survives empty raw");
ok(typedCol.offStrength === "right", "typed off_strength survives empty raw");
const seasonShaped = Cloud.scoutSnapToRow({
  play_type: "Run",
  direction: "R",
  gap: "",
  passZone: "",
  offStrength: "left",
  raw: {},
});
ok(seasonShaped.direction === "R", "season-store direction key survives: " + seasonShaped.direction);
ok(seasonShaped.offStrength === "left", "season-store offStrength survives");
const corpusSouth = southish(12).map(function (r) {
  return Cloud.scoutSnapToRow({
    play_type: r.playType,
    play_dir: r.direction,
    formation: r.formation,
    down: r.down,
    distance: r.distance,
    raw: {},
  });
});
ok(
  corpusSouth.filter(function (r) {
    return r.direction === "L" || r.direction === "R";
  }).length === 10,
  "corpus South slice keeps 10 dir-tagged runs"
);
const corpusGrain = X.build(corpusSouth);
ok(
  corpusGrain.text === "Pass 55% · Run 45% → L 70%",
  "build() on corpus-mapped South: " + corpusGrain.text
);
ok(
  X.paint(corpusGrain).html.indexOf("Pass 55% · Run 45% → L 70%") >= 0,
  "painted corpus South line"
);

/* --- M is not a lean --- */
const withM = many(10, { direction: "M" }).concat(many(3, { direction: "R" }));
const noM = X.build(withM);
ok(noM.dir == null, "M does not count toward directional lean");

/* --- case-insensitive formation grouping --- */
const mixedCase = many(10, { formation: "2x1 Wing", playType: "Run", direction: "R" }).concat(
  many(10, { formation: "2X1 WING", playType: "Run", direction: "R" })
).concat(many(4, { formation: "2x1 Wing", playType: "Pass", direction: "L" }));
ok(X.formNorm("2x1 Wing") === X.formNorm("2X1 WING"), "formNorm case-insensitive");
const formHit = X.build(mixedCase);
ok(formHit.tier === "formation", "20 same form (mixed case) → formation: " + formHit.tier);
ok(/2x1 Wing: Run 83%/.test(formHit.text), "form line uses display + run%: " + formHit.text);
ok(formHit.formation && formHit.formation.n === 24, "mixed case collapsed to one form n=24");

/* --- formation below gate stays parent/dir --- */
const tinyForm = many(7, { formation: "Trips", playType: "Run", direction: "L" }).concat(
  many(7, { formation: "Empty", playType: "Pass", direction: "R" })
);
const noForm = X.build(tinyForm);
ok(noForm.tier !== "formation", "form n=7 does not take the line: " + noForm.tier);

/* --- deepest tier only (form beats dir) --- */
ok(formHit.tier === "formation" && formHit.dir, "form line still carries dir");
ok(!/^Run /.test(formHit.text), "form line is not stacked under a parent Run line");

/* --- to the wing when strength is known --- */
const wing = many(16, {
  formation: "2x1 Wing",
  playType: "Run",
  direction: "R",
  offStrength: "right",
}).concat(many(4, { formation: "2x1 Wing", playType: "Run", direction: "L", offStrength: "right" }));
const wingHit = X.build(wing);
ok(/to the wing 80%/.test(wingHit.text), "strength-relative wing: " + wingHit.text);

/* --- GAP / PASS ZONE dormant when empty --- */
ok(dirOnlyHit.lane == null && dirOnlyHit.depth == null, "no GAP/PASS ZONE → dormant");
ok(!/inside|outside|Quick|Intermediate|Deep/.test(dirOnlyHit.text), "dormant columns stay off the line");

/* --- lane renders iff GAP tagged ≥ gate --- */
const laneBook = [];
for (let i = 0; i < 20; i++) {
  laneBook.push(
    snap({
      playType: "Run",
      direction: "R",
      gap: i < 12 ? "A" : "C",
      formation: "LaneF" + (i % 7),
    })
  );
}
const laneHit = X.build(laneBook);
ok(laneHit.lane && laneHit.lane.k === "inside", "GAP A/B → inside");
ok(/inside 60%/.test(laneHit.text), "lane on the line: " + laneHit.text);
ok(/R 100%/.test(laneHit.text), "lane keeps dir: " + laneHit.text);

const noLane = X.build(many(20, { playType: "Run", direction: "R", gap: "", formation: "F" + 0 }));
ok(noLane.lane == null, "empty GAP stays dormant even on a fat run book");

/* --- pass depth from PASS ZONE --- */
const deepBook = [];
for (let i = 0; i < 18; i++) {
  deepBook.push(
    snap({
      playType: "Pass",
      direction: "",
      passZone: i < 12 ? "Deep Left" : "Short Right",
      formation: "DepthF" + (i % 7),
    })
  );
}
const depthHit = X.build(deepBook);
ok(depthHit.depth && depthHit.depth.k === "deep", "Deep Left → deep");
ok(/deep 67%/.test(depthHit.text), "depth on the line: " + depthHit.text);
ok(X.playDirOf({ playType: "Pass", passZone: "Deep Left" }) === "L", "PASS ZONE backfills pass dir");
ok(/go L/.test(depthHit.text) || /L 67%/.test(depthHit.text) || depthHit.dir, "pass-side dir from zone");

/* --- LOW between MIN_SNAPS and split min --- */
const lowBook = many(6, { playType: "Run", direction: "R", formation: "Solo" });
const lowHit = X.build(lowBook);
ok(lowHit.low === true && lowHit.tier === "parent", "n=6 → LOW + parent only");

const highBook = many(16, { playType: "Run", direction: "R", formation: "Solo" });
ok(X.build(highBook).low === false, "n=16 not LOW");

/* --- P South-shaped book: 86 D-rows, 75 PLAY DIR tagged --- */
const psouth = [];
for (let i = 0; i < 86; i++) {
  const tagged = i < 75;
  const run = i % 5 !== 0;
  psouth.push(
    snap({
      playType: run ? "Run" : "Pass",
      direction: tagged ? (i % 3 === 0 ? "L" : "R") : "",
      formation: i % 4 === 0 ? "2X1 WING" : i % 4 === 1 ? "2x1 Wing" : i % 4 === 2 ? "Trips" : "2x2",
      gap: "",
      passZone: "",
    })
  );
}
ok(psouth.length === 86, "P South-shaped n=86");
ok(psouth.filter((r) => r.direction).length === 75, "75 PLAY DIR tagged");
const ps = X.build(psouth);
ok(ps.tier === "formation" || ps.tier === "direction", "P South book renders a split: " + ps.tier);
ok(ps.dir != null, "P South PLAY DIR split clears the gate");
ok(ps.lane == null && ps.depth == null, "P South GAP/ZONE empty → dormant");
ok(X.formNorm("2X1 WING") === X.formNorm("2x1 Wing"), "P South form case fold");
console.log("PROOF P South-shaped:", ps.text, "· tier", ps.tier, "· n", ps.n);

/* --- live L/R only (no Mid) in D Caller markup --- */
const dc = fs.readFileSync(path.join(ROOT, "OFFGRD-dcaller.js"), "utf8");
ok(/\[\"L\", \"R\"\]/.test(dc) || /\["L", "R"\]/.test(dc), "live dir is L/R only");
ok(!/Mid/.test(dc), "no Mid promise on D Caller");
ok(/OFFGRD_DCALLER_EXPECT/.test(dc), "dcaller references the expect module");
ok(/expectGrain/.test(dc), "dcaller wires expectGrain");
ok(/X\.build\(/.test(dc), "dcaller calls module build()");
ok(/expectPaint/.test(dc) && /painted\.html/.test(dc), "expectHtml paints paint().html");
ok(/painted\.foot/.test(dc), "expectHtml paints grain.foot");
ok(!/grain\.tier !== ["']parent["']/.test(dc), "parent-tier grain is not hidden");
ok(/After-snap, never a gate/.test(dc), "L/R skippable copy");

const html = fs.readFileSync(path.join(ROOT, "OFFGRD.html"), "utf8");
ok(/OFFGRD-dcaller-expect\.js\?v=/.test(html), "HTML pins expect module");

const sw = fs.readFileSync(path.join(ROOT, "offgrd-sw.js"), "utf8");
ok(/OFFGRD-dcaller-expect\.js/.test(sw), "SW precaches expect module");

/* map table reuse */
ok(typeof FM.normTag === "function" && FM.normTag("2X1 WING") === "2x1 wing", "reuses formation-map normTag");

console.log("ok: dcaller expect grain (honesty + dormant lane/depth + P South-shaped)");
