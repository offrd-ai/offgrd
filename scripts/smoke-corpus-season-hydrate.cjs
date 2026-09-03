/**
 * Cloud SNAP_CORPUS omits PLAY DIR; season store has it.
 * setSnapCorpus overlays direction/gap from season. Empty season is unknown.
 *   node scripts/smoke-corpus-season-hydrate.cjs
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "OFFGRD.html"), "utf8");

function ok(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
  console.log("ok:", msg);
}

const start = html.indexOf("function corpusDirOf(");
const end = html.indexOf("/* === /corpus-season-hydrate === */");
ok(start >= 0 && end > start, "HTML defines corpus-season hydrate");
ok(/SNAP_CORPUS=hydrateCorpusFromSeason\(incoming, seasonSnapsForCorpus\(\)\)/.test(html),
  "setSnapCorpus overlays season onto corpus");
ok(/function setSnapCorpus\(rows/.test(html) && /sweepLeftoverLiveLooks\(\)/.test(html),
  "setSnapCorpus still sweeps leftover live looks");

const sandbox = { console };
vm.runInNewContext(html.slice(start, end), sandbox);
const H = sandbox.hydrateCorpusFromSeason;
ok(typeof H === "function", "hydrateCorpusFromSeason extracts");

function seasonGame(rows, side) {
  return { side: side || "off", opponent: "Parkway South", rows: rows };
}

const season = [
  { id: "s1", opponent: "Parkway South", side: "off", down: 1, distance: 10, playType: "Run", formation: "Trips", gain: 4, hash: "L", direction: "L", gap: "B" },
  { opponent: "Parkway South", side: "off", down: 1, distance: 10, playType: "Pass", formation: "2x1 Wing", gain: 0, hash: "R", direction: "R" },
];
const corpus = [
  { id: "s1", opponent: "Parkway South", side: "off", down: 1, distance: 10, playType: "Run", formation: "Trips", gain: 4, hash: "L", direction: "", tag_source: "hudl", clip_hash: "x", import_batch_id: "b1" },
  { id: "cloud-2", opponent: "Parkway South", side: "off", down: 1, distance: 10, playType: "Pass", formation: "2x1 Wing", gain: 0, hash: "R", direction: "", tag_source: "hudl", import_batch_id: "b1" },
];

const byId = H(corpus, season);
ok(byId[0].direction === "L", "id match copies direction: " + byId[0].direction);
ok(byId[0].gap === "B", "id match copies gap");
ok(byId[1].direction === "R", "sit-key match copies when ids differ: " + byId[1].direction);
ok(byId[0].tag_source === "hudl" && byId[0].import_batch_id === "b1", "server schema kept");

const already = H(
  [{ id: "s1", opponent: "Parkway South", side: "off", down: 1, distance: 10, playType: "Run", formation: "Trips", gain: 4, hash: "L", direction: "R" }],
  [{ id: "s1", opponent: "Parkway South", side: "off", down: 1, distance: 10, playType: "Run", formation: "Trips", gain: 4, hash: "L", direction: "L" }]
);
ok(already[0].direction === "R", "does not overwrite a corpus direction");

const emptySeason = H(corpus, []);
ok(emptySeason[0].direction === "" && emptySeason[1].direction === "", "empty season is unknown — keep corpus");

/* Live v351 miss: corpus has side + empty hash; season has hash + empty side. */
const liveCorpus = {
  opponent: "Parkway South",
  side: "off",
  down: 1,
  distance: 10,
  playType: "Run",
  formation: "Unbal Trey",
  gain: 18,
  hash: "",
  direction: "",
  tag_source: "autoscout",
};
const liveSeason = {
  opponent: "Parkway South",
  down: 1,
  distance: 10,
  playType: "Run",
  formation: "Unbal Trey",
  gain: 18,
  hash: "R",
  direction: "L",
};
ok(
  sandbox.corpusSitKey(liveCorpus) === sandbox.corpusSitKey(liveSeason),
  "sit key ignores side/hash: " + sandbox.corpusSitKey(liveCorpus)
);
ok(
  sandbox.corpusSitKey(liveCorpus) === "parkway south|1|10|run|unbal trey|18",
  "sit key shape: " + sandbox.corpusSitKey(liveCorpus)
);
const liveHit = H([liveCorpus], [liveSeason]);
ok(liveHit[0].direction === "L", "v351 live pair hydrates: " + liveHit[0].direction);

/* South-shaped: 12 Pass + 7 RunL + 3 RunR, corpus strips direction */
function southSeason() {
  const rows = [];
  for (let i = 0; i < 12; i++) {
    rows.push({ opponent: "Parkway South", side: "off", down: 1, distance: 10, playType: "Pass", formation: "SF" + (i % 7), gain: 1, hash: "M", direction: "" });
  }
  for (let i = 0; i < 7; i++) {
    rows.push({ opponent: "Parkway South", side: "off", down: 1, distance: 10, playType: "Run", formation: "SF" + (i % 7), gain: 3, hash: "L", direction: "L" });
  }
  for (let i = 0; i < 3; i++) {
    rows.push({ opponent: "Parkway South", side: "off", down: 1, distance: 10, playType: "Run", formation: "SF" + ((i + 3) % 7), gain: 2, hash: "R", direction: "R" });
  }
  return rows;
}
const southSeasonRows = southSeason();
const southCorpus = southSeasonRows.map(function (r, i) {
  return Object.assign({}, r, {
    id: "cloud-" + i,
    direction: "",
    tag_source: "autoscout",
    clip_hash: "h" + i,
    import_batch_id: "south",
  });
});
ok(southCorpus.filter((r) => r.direction === "L" || r.direction === "R").length === 0, "corpus starts dirTagged 0");
const filled = H(southCorpus, southSeasonRows);
ok(filled.filter((r) => r.direction === "L" || r.direction === "R").length === 10, "hydrate restores 10 dir-tagged runs");
ok(filled.filter((r) => r.direction === "L").length === 7, "7 L from season");

const perspSrc = fs.readFileSync(path.join(ROOT, "OFFGRD-dcaller-perspective.js"), "utf8");
const expectSrc = fs.readFileSync(path.join(ROOT, "OFFGRD-dcaller-expect.js"), "utf8");
const box = { window: {}, globalThis: {}, console };
box.window = box;
box.globalThis = box;
vm.runInNewContext(perspSrc, box);
vm.runInNewContext(expectSrc, box);
const X = box.OFFGRD_DCALLER_EXPECT;
const grain = X.build(filled);
ok(grain.text === "Pass 55% · Run 45% → your R 70%", "hydrated corpus paints South line: " + grain.text);

console.log("ok: corpus-season-hydrate");
