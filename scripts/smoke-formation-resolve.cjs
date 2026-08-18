/**
 * Smoke: Phase C formation resolver consults the program map.
 * Resolution-time only. Group keys stay the raw tag.
 * Usage: node scripts/smoke-formation-resolve.cjs
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const sandbox = { window: {}, globalThis: {}, console, document: undefined };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
function load(file) {
  vm.runInNewContext(fs.readFileSync(path.join(root, file), "utf8"), sandbox);
}
load("OFFGRD-formations-data.js");
load("OFFGRD-formation-canon.js");
load("OFFGRD-assist-import.js");
load("OFFGRD-render.js");
load("OFFGRD-opp-shells.js");
load("OFFGRD-formation-map.js");

const S = sandbox.OFFGRD_OPP_SHELLS;
const M = sandbox.OFFGRD_FORMATION_MAP;
if (!S || !M) {
  console.error("FAIL load shells/map");
  process.exit(1);
}

let fails = 0;
function check(name, cond, detail) {
  if (cond) console.log("ok  " + name);
  else {
    fails += 1;
    console.error("FAIL " + name + (detail ? " — " + detail : ""));
  }
}

const TEAM = "team-parkway";
const OPP = "Parkway North";

function mapRow(tag, struct, extra) {
  return Object.assign(
    {
      raw_tag: tag,
      raw_tag_norm: M.normTag(tag),
      off_structure: struct,
      off_back_count: null,
      off_personnel: null,
      side_scope: "both",
    },
    extra || {}
  );
}

function offRow(partial) {
  return Object.assign(
    {
      id: partial.id || "r" + Math.random().toString(16).slice(2),
      opponent: OPP,
      side: "off",
      play: "",
      formation: "DART",
      playType: "Pass",
      direction: "R",
      gap: "",
      passZone: "curl",
      down: 1,
      distance: 10,
      hash: "L",
      fieldZone: "PLUS",
      gain: 4,
      success: 1,
    },
    partial
  );
}

const PARKWAY_MAP = [
  mapRow("DART", "3x1", { off_back_count: 1, off_personnel: "11" }),
  mapRow("Bunch Dart", "3x1", { off_back_count: 1, off_personnel: "11" }),
  mapRow("2x1 Wing", "2x1"),
];

/* --- map hit: DART → 3x1, unresolved:false, shell named DART --- */
M.setCache(TEAM, PARKWAY_MAP);
const dartRes = S.resolveFormation("DART");
check("DART map hit is 3x1", !!(dartRes.formation && dartRes.formation.id === "TRIPS_RT"), dartRes.formation && dartRes.formation.id);
check("DART unresolved:false", dartRes.unresolved === false && !dartRes.uncharted);
check("DART source is map", dartRes.source === "map" && dartRes.mapped === true);
const dartShell = S.buildShell({ formation: "DART", play: "pass", playType: "Pass", n: 3, shellKey: "sig:dart|pass" });
check("DART shell named DART", dartShell.formation === "DART", dartShell.formation);
check("DART shell badge cleared", dartShell.unresolvedFormation === false && !dartShell.unchartedFormation);
check("DART shell has 11 players", !!(dartShell.players && dartShell.players.length === 11), dartShell.players && dartShell.players.length);

const bunchRes = S.resolveFormation("Bunch Dart");
check("Bunch Dart map hit is 3x1", !!(bunchRes.formation && bunchRes.formation.id === "TRIPS_RT"));
const wingRes = S.resolveFormation("2x1 Wing");
check("2x1 Wing map hit is 2x1", !!(wingRes.formation && wingRes.formation.id === "WING_2X1"));

/* --- map consulted BEFORE builtin --- */
M.setCache(TEAM, [mapRow("2X2", "3x1")]);
const mappedBuiltin = S.resolveFormation("2X2");
check("map row for builtin token wins", mappedBuiltin.formation && mappedBuiltin.formation.id === "TRIPS_RT" && mappedBuiltin.source === "map", mappedBuiltin.formation && mappedBuiltin.formation.id + "/" + mappedBuiltin.source);
M.setCache(TEAM, []);
const builtinAfterClear = S.resolveFormation("2X2");
check("builtin 2X2 still resolves after map empty", builtinAfterClear.formation && builtinAfterClear.formation.id === "DOUBLES_2X2" && !builtinAfterClear.unresolved);

/* --- no map + no builtin → unresolved (SPREAD) --- */
M.setCache(TEAM, PARKWAY_MAP);
const spreadRes = S.resolveFormation("SPREAD");
check("SPREAD stays unresolved with map active", spreadRes.unresolved === true && !spreadRes.uncharted);
const spreadShell = S.buildShell({ play: "Dart", formation: "SPREAD", n: 10, shellKey: "sig:spread|" });
check("SPREAD shell stays red", spreadShell.unresolvedFormation === true && !spreadShell.unchartedFormation);
check("unresolved SPREAD display is raw", spreadShell.formation === "SPREAD", spreadShell.formation);
M.setCache(TEAM, [mapRow("SPREAD", "2x2")]);
const mappedSpread = S.buildShell({ play: "Dart", formation: "SPREAD", n: 10, shellKey: "sig:spread|" });
check("mapped tag display is raw", mappedSpread.formation === "SPREAD" && mappedSpread.unresolvedFormation === false, mappedSpread.formation);
check("mapped DART display is raw", dartShell.formation === "DART", dartShell.formation);
M.setCache(TEAM, PARKWAY_MAP);

const ghost = S.buildShell({ play: "Ghost", formation: "", n: 4, shellKey: "play:ghost|" });
check("(blank) stays uncharted muted", ghost.unchartedFormation === true && ghost.unresolvedFormation === false);

const suggestedOnly = S.resolveFormation("Tank 3x2");
check("suggestion is not auto-applied", suggestedOnly.unresolved === true, "source=" + suggestedOnly.source);
check("suggestStructure still 3x2 for panel only", M.suggestStructure("Tank 3x2") === "3x2");

/* --- row-level offStructure beats map fill-in --- */
M.setCache(TEAM, PARKWAY_MAP);
const rowWins = S.resolveFormation("DART", { offStructure: "2x2" });
check("row-level offStructure beats map", rowWins.formation && rowWins.formation.id === "DOUBLES_2X2" && rowWins.source === "row", rowWins.formation && rowWins.formation.id + "/" + rowWins.source);
check("row-level still resolved", rowWins.unresolved === false);
const rowShell = S.buildShell({
  formation: "DART",
  offStructure: "2x2",
  personnel: "12",
  play: "pass",
  n: 3,
  shellKey: "sig:dart|row",
});
check("row personnel beats map fill-in", rowShell.personnel === "12", rowShell.personnel);
const mapFillShell = S.buildShell({ formation: "DART", play: "pass", n: 3, shellKey: "sig:dart|fill" });
check("map personnel fills blank", mapFillShell.personnel === "11", mapFillShell.personnel);

/* --- unmap → red returns --- */
M.setCache(TEAM, PARKWAY_MAP);
check("mapped DART is clean", S.resolveFormation("DART").unresolved === false);
M.setCache(TEAM, []);
const afterUnmap = S.resolveFormation("DART");
check("unmap restores unresolved", afterUnmap.unresolved === true && afterUnmap.source === "miss");
const afterUnmapShell = S.buildShell({ formation: "DART", play: "pass", n: 3, shellKey: "sig:dart|unmap" });
check("unmap restores red badge", afterUnmapShell.unresolvedFormation === true);
M.setCache(TEAM, PARKWAY_MAP);
check("remap clears again", S.resolveFormation("DART").unresolved === false);

/* --- groups stay raw-tag identity; DART pass n=3 / run n=3 do not merge --- */
M.setCache(TEAM, PARKWAY_MAP);
const dartSnaps = []
  .concat([0, 1, 2].map(function (i) {
    return offRow({ id: "dp" + i, play: "", formation: "DART", playType: "Pass", passZone: "curl", gap: "" });
  }))
  .concat([0, 1, 2].map(function (i) {
    return offRow({ id: "dr" + i, play: "", formation: "DART", playType: "Run", gap: "B", passZone: "" });
  }));
S.clearCache();
const dartGroups = S.groupRows(dartSnaps, OPP);
check("DART pass/run stay two groups", dartGroups.groups.length === 2, "n=" + dartGroups.groups.length);
check(
  "DART groups n=3/n=3",
  dartGroups.groups.every(function (g) { return g.n === 3 && g.formation === "DART"; }),
  JSON.stringify(dartGroups.groups.map(function (g) { return g.playType + ":" + g.n + ":" + g.formation; }))
);
const dartCards = S.cardsForOpponent({ snaps: dartSnaps, opponent: OPP, side: "off" });
const dartShells = (dartCards.cards || []).filter(function (c) { return c.cardStatus === "shell"; });
check("DART shells both named DART, no red", dartShells.length === 2 && dartShells.every(function (c) {
  return c.formation === "DART" && c.unresolvedFormation === false;
}), dartShells.map(function (c) { return c.formation + "/" + c.unresolvedFormation; }).join(","));

/* --- reconcile sumN unchanged with map active (117 Parkway / 134 def) --- */
function fillOff(n, start, extra) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(offRow(Object.assign({ id: "off" + (start + i) }, extra)));
  return out;
}
const parkwayOff = []
  .concat(fillOff(3, 0, { play: "", formation: "DART", playType: "Pass", passZone: "curl", gap: "" }))
  .concat(fillOff(3, 3, { play: "", formation: "DART", playType: "Run", gap: "B", passZone: "" }))
  .concat(fillOff(10, 6, { play: "Spread look", formation: "SPREAD", playType: "Pass", passZone: "hitch" }))
  .concat(fillOff(101, 16, { play: "Inside Zone", formation: "2x2 Doubles Gun", playType: "Run", gap: "B" }));
check("parkway off corpus is 117", parkwayOff.length === 117, String(parkwayOff.length));

const parkwayDef = [];
for (let i = 0; i < 134; i++) {
  parkwayDef.push(offRow({
    id: "def" + i,
    side: "def",
    formation: "",
    play: "",
    front: i % 2 ? "4-3" : "3-4",
    coverage: i % 3 ? "Cover 3" : "Cover 1",
  }));
}

M.setCache(TEAM, []);
S.clearCache();
const recOff0 = S.reconcile(parkwayOff, OPP, "off");
const recDef0 = S.reconcile(parkwayDef, OPP, "def");
M.setCache(TEAM, PARKWAY_MAP);
S.clearCache();
const recOff1 = S.reconcile(parkwayOff, OPP, "off");
const recDef1 = S.reconcile(parkwayDef, OPP, "def");
check(
  "reconcile off sumN 117 unchanged with map",
  recOff0.ok && recOff1.ok && recOff0.sumN === 117 && recOff1.sumN === recOff0.sumN && recOff1.groupCount === recOff0.groupCount,
  JSON.stringify({ before: recOff0.sumN, after: recOff1.sumN, g0: recOff0.groupCount, g1: recOff1.groupCount })
);
check(
  "reconcile def sumN 134 unchanged with map",
  recDef0.ok && recDef1.ok && recDef0.sumN === 134 && recDef1.sumN === recDef0.sumN,
  JSON.stringify({ before: recDef0.sumN, after: recDef1.sumN })
);

const spreadCard = S.cardsForOpponent({ snaps: parkwayOff, opponent: OPP, side: "off" });
const spreadGroup = (spreadCard.cards || []).filter(function (c) { return c.formation === "SPREAD" || /spread/.test(String(c.shellKey || "")); });
check(
  "SPREAD n=10 still red in queue",
  spreadGroup.length >= 1 && spreadGroup.every(function (c) { return c.unresolvedFormation === true && c.n === 10; }),
  JSON.stringify(spreadGroup.map(function (c) { return { f: c.formation, n: c.n, unres: c.unresolvedFormation }; }))
);

/* --- side:ours never enter opponent queues with map active --- */
const oursPoison = [
  offRow({ id: "ours1", side: "ours", play: "DINO", formation: "DART" }),
  offRow({ id: "ours2", side: "ours", play: "MEMPHIS", formation: "Bunch Dart" }),
];
M.setCache(TEAM, PARKWAY_MAP);
S.clearCache();
const mixed = parkwayOff.concat(oursPoison);
check("isOffSide(ours) is false with map", S.isOffSide("ours") === false);
check(
  "filterOffRows drops ours with map active",
  S.filterOffRows(mixed, OPP).length === 117 && S.filterOffRows(mixed, OPP).every(function (r) { return r.side === "off"; }),
  "n=" + S.filterOffRows(mixed, OPP).length
);
const recMixed = S.reconcile(mixed, OPP, "off");
check("reconcile ignores ours with map active", recMixed.sumN === 117 && recMixed.verifiedOffRows === 117);

/* --- cache is program-scoped --- */
M.setCache("team-other", []);
check("switching team cache drops prior map", S.resolveFormation("DART").unresolved === true);
M.setCache(TEAM, PARKWAY_MAP);
check("reload team cache restores map", S.resolveFormation("DART").unresolved === false);

const thin = S.buildShell({ formation: "DART", play: "x", n: 2, thin: true, shellKey: "sig:dart|thin" });
check("THIN unchanged on mapped shell", thin.thin === true);

if (fails) {
  console.error(fails + " failed");
  process.exit(1);
}
console.log("smoke-formation-resolve: all ok");
