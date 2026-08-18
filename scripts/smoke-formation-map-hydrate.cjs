/**
 * Smoke: v290 map-hydration regroup.
 * Group with an empty map, then hydrate — mapped resolution must appear
 * without a manual OFFGRD_OPP_SHELLS.clearCache().
 * Usage: node scripts/smoke-formation-map-hydrate.cjs
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const store = Object.create(null);
const localStorage = {
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
  setItem: function (k, v) { store[k] = String(v); },
  removeItem: function (k) { delete store[k]; },
};
const sandbox = { window: {}, globalThis: {}, console, document: undefined, localStorage: localStorage };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.window.localStorage = localStorage;

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
const dartMap = [{
  raw_tag: "DART",
  raw_tag_norm: "dart",
  off_structure: "3x1",
  off_back_count: 1,
  off_personnel: "11",
  side_scope: "both",
}];

function dartRows() {
  return [0, 1, 2].map(function (i) {
    return {
      id: "dp" + i,
      opponent: OPP,
      side: "off",
      play: "",
      formation: "DART",
      playType: "Pass",
      direction: "R",
      passZone: "curl",
      down: 1,
      distance: 10,
      hash: "L",
      fieldZone: "PLUS",
      gain: 4,
      success: 1,
    };
  });
}

function dartCard(pack) {
  const cards = (pack && pack.cards) || [];
  return cards.filter(function (c) { return c.cardStatus === "shell"; })[0] || null;
}

M.setCache(TEAM, []);
const stale = S.cardsForOpponent({ snaps: dartRows(), opponent: OPP, side: "off" });
const staleCard = dartCard(stale);
check("empty-map first group is red DART", !!(staleCard && staleCard.unresolvedFormation === true && staleCard.formation !== "Trips Right"));
check("empty-map resolveMapped misses", M.resolveMapped("DART") == null);

M.setCache(TEAM, dartMap);
const afterSet = S.cardsForOpponent({ snaps: dartRows(), opponent: OPP, side: "off" });
const afterSetCard = dartCard(afterSet);
check("setCache hydrate without manual clearCache", !!(afterSetCard && afterSetCard.unresolvedFormation === false && afterSetCard.formation === "DART"));
check("setCache hydrate is 3x1 / 11 players", !!(afterSetCard && afterSetCard.players && afterSetCard.players.length === 11));
check("setCache hydrate resolveMapped hits", !!(M.resolveMapped("DART") && M.resolveMapped("DART").off_structure === "3x1"));

M.setCache(TEAM, []);
const redAgain = dartCard(S.cardsForOpponent({ snaps: dartRows(), opponent: OPP, side: "off" }));
check("empty cache returns red", !!(redAgain && redAgain.unresolvedFormation === true));

store[M.MAP_CACHE_KEY] = JSON.stringify({ teamId: TEAM, rows: dartMap, updatedAt: Date.now() });
M.loadCache(TEAM);
const afterLoad = S.cardsForOpponent({ snaps: dartRows(), opponent: OPP, side: "off" });
const afterLoadCard = dartCard(afterLoad);
check("loadCache warm-read without manual clearCache", !!(afterLoadCard && afterLoadCard.unresolvedFormation === false && afterLoadCard.formation === "DART"));
check("loadCache hydrate is 3x1", S.resolveFormation("DART").source === "map" && S.resolveFormation("DART").unresolved === false);

if (fails) {
  console.error(fails + " failed");
  process.exit(1);
}
console.log("smoke-formation-map-hydrate: all ok");
